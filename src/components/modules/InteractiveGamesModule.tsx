import { SUBJECTS, GRADES, CLASSES_BY_GRADE, ALL_CLASSES, getCorrectOrderingSequence } from '../../lib/constants';
import { useClassesList, extractGradeDigit } from '../../services/classStorageService';
import { getStudentAvatarSource, DEFAULT_ANIMAL_AVATAR } from '../common/AnimalAvatars';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { GameLobbyShowcase } from './games/GameLobbyShowcase';
import { GamePlayStage } from './games/GamePlayStage';
import { GameFlashcardsStage } from './games/GameFlashcardsStage';
import { GameResultPodium } from './games/GameResultPodium';
import {
  Gamepad2,
  Bell,
  Zap,
  Disc,
  Layers,
  Play,
  RotateCw,
  Trophy,
  CheckCircle2,
  X,
  CheckCircle,
  Plus,
  ArrowLeft,
  Sparkles,
  Award,
  RefreshCw,
  Clock,
  UserCheck,
  HelpCircle,
  Filter,
  Users,
  BookOpen,
  Search,
  Activity,
  Pencil,
  Trash2,
  Laptop,
  Link2,
  ChevronDown,
  Check,
  ArrowRight,
  Share2,
  AlertCircle,
  ExternalLink,
  QrCode,
  LayoutGrid,
  Database,
  Settings,
  Monitor,
  ShieldCheck
} from 'lucide-react';
import { GameItem, GameType, UserRole, QuizziGameItem } from '../../types';
import { getStudentGameProfile, resolveAuthenticStudentId } from '../../services/studentGameStoreService';
import { studentResultService } from '../../services/studentResultService';
import { normalizeStudentCode } from '../../services/studentCode';
import { db, auth } from '../../services/firebase';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { getStudentsFromLocalStorage, generateDefaultClassRoster } from '../../services/studentStorageService';
import { ShareContentModal } from './ShareContentModal';
import { StudentGameStoreTab } from './StudentGameStoreTab';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { StatsSummaryRow } from '../common/StatsSummaryRow';
import { awardArenaReward, hasClaimedReward } from '../../config/rewardConfig';
import { QuizziGameModal } from './QuizziGameModal';
import { GameExportModal } from './GameExportModal';
import { ExportableGame } from '../../utils/gameExportUtils';
import { PaginationControl } from '../common/PaginationControl';
import {
  getLocalCachedQuizziGames,
  saveMultipleQuizziGamesToFirestore,
  deleteQuizziGameFromFirestore,
  subscribeToQuizziGamesFromFirestore
} from '../../services/gameStorageService';
import {
  joinQuizLiveSession,
  completeQuizLiveSession,
  updateQuizLiveProgress,
  queryQuizLiveSessionsByTargetIds
} from '../../services/liveQuizSessionService';
import {
  getEffectiveStudentClassAndGrade,
  isTargetingStudent
} from '../../services/studentSessionService';
import { resolveCurrentTeacherProfile } from '../../services/teacherStorageService';
import {
  getCurrentAccessContext,
  getContentPermissions,
  filterAccessibleItems,
  canTeacherAccessClass
} from '../../utils/permissions';
import {
  Grade3DatabaseConfig,
  DEFAULT_GRADE3_APP_URL,
  DEFAULT_GRADE4_APP_URL,
  getGrade3DbConfig,
  getCachedGrade3Lessons
} from '../../services/grade3LessonDbService';
import { Grade3DatabaseConfigModal } from './Grade3DatabaseConfigModal';
import { encodeUtf8Base64 } from '../portal/DigitalResourcePortal';
import {
  checkInitialSsoAutoLogin,
  persistSsoTeacherSession,
  decodeUtf8Base64
} from '../../services/ssoAutoLoginService';

interface GradeSelectorMeta {
  key: string;
  gradeValue: string;
  label: string;
  shortTag: string;
  subtitle: string;
  activeGradient: string;
  activeShadow: string;
  inactiveBorder: string;
  badgeBg: string;
  badgeText: string;
  iconBg: string;
  isDedicatedGrade3?: boolean;
  isDedicatedGrade4?: boolean;
}

const GRADE_SELECTOR_CARDS: GradeSelectorMeta[] = [
  {
    key: 'all',
    gradeValue: 'Tất cả các khối',
    label: 'Tất cả khối',
    shortTag: 'K1 → K5',
    subtitle: 'Tổng hợp toàn trường',
    activeGradient: 'from-slate-900 via-indigo-950 to-blue-950',
    activeShadow: 'shadow-lg shadow-indigo-950/20 ring-2 ring-indigo-600/30',
    inactiveBorder: 'border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/30',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    iconBg: 'bg-indigo-600 text-white',
  },
  {
    key: 'grade-1',
    gradeValue: 'Khối 1',
    label: 'Khối 1',
    shortTag: 'Lớp 1',
    subtitle: 'Trò chơi khởi đầu',
    activeGradient: 'from-rose-500 via-pink-600 to-fuchsia-600',
    activeShadow: 'shadow-lg shadow-rose-500/25 ring-2 ring-rose-400/40',
    inactiveBorder: 'border-rose-200/80 hover:border-rose-400 hover:bg-rose-50/40',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    iconBg: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white',
  },
  {
    key: 'grade-2',
    gradeValue: 'Khối 2',
    label: 'Khối 2',
    shortTag: 'Lớp 2',
    subtitle: 'Đấu trí nền tảng',
    activeGradient: 'from-amber-500 via-orange-500 to-red-500',
    activeShadow: 'shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/40',
    inactiveBorder: 'border-amber-200/80 hover:border-amber-400 hover:bg-amber-50/40',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
  },
  {
    key: 'grade-3',
    gradeValue: 'Khối 3',
    label: 'Khối 3',
    shortTag: 'Nhúng App K3',
    subtitle: 'Hiển thị ngay trong App',
    activeGradient: 'from-emerald-600 via-teal-600 to-cyan-600',
    activeShadow: 'shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-400/50',
    inactiveBorder: 'border-emerald-300/90 hover:border-emerald-500 bg-emerald-50/25 hover:bg-emerald-50/60',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
    isDedicatedGrade3: true,
  },
  {
    key: 'grade-4',
    gradeValue: 'Khối 4',
    label: 'Khối 4',
    shortTag: 'Nhúng App K4',
    subtitle: 'Hiển thị ngay trong App',
    activeGradient: 'from-sky-500 via-blue-600 to-indigo-600',
    activeShadow: 'shadow-lg shadow-blue-500/25 ring-2 ring-sky-400/40',
    inactiveBorder: 'border-sky-300/90 hover:border-sky-500 bg-sky-50/25 hover:bg-sky-50/60',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white',
    isDedicatedGrade4: true,
  },
  {
    key: 'grade-5',
    gradeValue: 'Khối 5',
    label: 'Khối 5',
    shortTag: 'Lớp 5',
    subtitle: 'Đấu trường chuyển cấp',
    activeGradient: 'from-violet-600 via-purple-600 to-indigo-700',
    activeShadow: 'shadow-lg shadow-violet-600/25 ring-2 ring-violet-400/40',
    inactiveBorder: 'border-violet-200/80 hover:border-violet-400 hover:bg-violet-50/40',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-800',
    iconBg: 'bg-gradient-to-br from-violet-600 to-purple-600 text-white',
  },
];

interface InteractiveGamesModuleProps {
  games: GameItem[];
  userRole: UserRole;
  currentUserId?: string;
  currentUserName?: string;
  initialTab?: 'games' | 'store';
  initialActiveGame?: GameItem | null;
  onOpenUseQuestionBankModal?: () => void;
  onOpenEditGameRoom?: (game: GameItem) => void;
  onDeleteGame?: (id: string) => void;
  onUpdateGame?: (game: GameItem) => void;
  soundEnabled?: boolean;
}

export const InteractiveGamesModule: React.FC<InteractiveGamesModuleProps> = ({
  games,
  userRole,
  currentUserId = 'u-4',
  currentUserName = 'Lê Minh Anh',
  initialTab = 'games',
  initialActiveGame = null,
  onOpenUseQuestionBankModal,
  onOpenEditGameRoom,
  onDeleteGame,
  onUpdateGame,
  soundEnabled = true
}) => {
  const { getClassesForGrade } = useClassesList();
  const [ssoEmailOverride, setSsoEmailOverride] = useState<string | null>(() => {
    const initialSso = checkInitialSsoAutoLogin();
    return initialSso?.authenticated && initialSso.email ? initialSso.email : null;
  });
  const authEmail =
    typeof window !== 'undefined'
      ? ssoEmailOverride || auth?.currentUser?.email || localStorage.getItem('eduplay_teacher_email')
      : null;
  const activeTeacherProfile = useMemo(() => resolveCurrentTeacherProfile(authEmail), [authEmail]);
  const accessContext = useMemo(() => getCurrentAccessContext(userRole, authEmail), [userRole, authEmail]);
  const isAdmin = accessContext.isAdmin;
  const [resourceTab, setResourceTab] = useState<'all' | 'mine' | 'colleagues'>('all');

  // Lắng nghe thông tin đăng nhập SSO từ URL hoặc postMessage (PK_TRUC_KHANG_SSO_LOGIN / SSO_AUTO_LOGIN)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSsoMessage = (event: MessageEvent) => {
      try {
        const data = event?.data;
        if (!data || typeof data !== 'object') return;
        if (data.type !== 'PK_TRUC_KHANG_SSO_LOGIN' && data.type !== 'SSO_AUTO_LOGIN') return;

        let tokenObj: Record<string, any> | null = null;
        const rawToken = data.sso_token || data.ssoToken || data.token;
        if (typeof rawToken === 'string' && rawToken.trim()) {
          tokenObj = decodeUtf8Base64(rawToken.trim());
        }

        const email = String(
          data.sso_email || data.email || data.user?.email || tokenObj?.email || ''
        )
          .trim()
          .toLowerCase();
        if (!email) return;

        const name = String(
          data.sso_name || data.name || data.user?.name || tokenObj?.name || ''
        ).trim();
        const role = String(
          data.sso_role || data.role || data.user?.role || tokenObj?.role || ''
        ).trim();

        const sessionUser = persistSsoTeacherSession({
          email,
          name,
          role,
          rawTab: 'interactive_games',
        });
        setSsoEmailOverride(sessionUser.email);
      } catch {
        // Ignore invalid cross-origin postMessage payloads
      }
    };

    window.addEventListener('message', handleSsoMessage);
    return () => window.removeEventListener('message', handleSsoMessage);
  }, []);

  const [grade3DbConfig, setGrade3DbConfig] = useState<Grade3DatabaseConfig>(() =>
    getGrade3DbConfig()
  );
  const [grade3LatencyMs] = useState<number>(
    () => getGrade3DbConfig().lastPingMs || 14
  );
  const [isGrade3ConfigModalOpen, setIsGrade3ConfigModalOpen] = useState(false);
  const [showDedicatedGradeIframe, setShowDedicatedGradeIframe] = useState<boolean>(true);

  const grade3IframeRef = useRef<HTMLIFrameElement | null>(null);
  const [grade3IframeKey, setGrade3IframeKey] = useState<number>(0);
  const [isGrade3IframeLoading, setIsGrade3IframeLoading] = useState<boolean>(true);

  const grade4IframeRef = useRef<HTMLIFrameElement | null>(null);
  const [grade4IframeKey, setGrade4IframeKey] = useState<number>(0);
  const [isGrade4IframeLoading, setIsGrade4IframeLoading] = useState<boolean>(true);

  useEffect(() => {
    const onConfigUpdated = () => {
      setGrade3DbConfig(getGrade3DbConfig());
    };
    window.addEventListener('eduplay_grade3_db_config_updated', onConfigUpdated);
    return () => window.removeEventListener('eduplay_grade3_db_config_updated', onConfigUpdated);
  }, []);

  const gradeSsoPayload = useMemo(() => {
    const teacherEmail = activeTeacherProfile?.email || authEmail || 'thuthuthtk@gmail.com';
    const teacherName = activeTeacherProfile?.name || 'Giáo viên';
    const teacherRole = isAdmin ? 'admin' : userRole || 'teacher';
    const teacherUid = String(activeTeacherProfile?.id || teacherEmail);
    const ssoToken = encodeUtf8Base64({
      email: teacherEmail,
      name: teacherName,
      role: teacherRole,
      uid: teacherUid,
      tab: 'interactive_games',
      module: 'interactive_games',
      timestamp: Date.now(),
      source: 'PK_TRUC_KHANG_LMS',
    });

    return {
      email: teacherEmail,
      name: teacherName,
      role: teacherRole,
      uid: teacherUid,
      ssoToken,
    };
  }, [activeTeacherProfile, authEmail, isAdmin, userRole]);

  const grade3EmbeddedUrlWithSso = useMemo(() => {
    const rawBase =
      (grade3DbConfig.externalAppUrl || DEFAULT_GRADE3_APP_URL).trim() ||
      DEFAULT_GRADE3_APP_URL;
    const baseUrl = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;

    try {
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('autologin', 'true');
      urlObj.searchParams.set('auto_login', 'true');
      urlObj.searchParams.set('tab', 'interactive_games');
      urlObj.searchParams.set('module', 'interactive_games');
      urlObj.searchParams.set('grade', 'Khối 3');
      if (gradeSsoPayload.email) {
        urlObj.searchParams.set('email', gradeSsoPayload.email);
        urlObj.searchParams.set('sso_email', gradeSsoPayload.email);
      }
      if (gradeSsoPayload.ssoToken) {
        urlObj.searchParams.set('token', gradeSsoPayload.ssoToken);
        urlObj.searchParams.set('sso_token', gradeSsoPayload.ssoToken);
      }
      if (gradeSsoPayload.name) {
        urlObj.searchParams.set('name', gradeSsoPayload.name);
        urlObj.searchParams.set('sso_name', gradeSsoPayload.name);
      }
      if (gradeSsoPayload.role) {
        urlObj.searchParams.set('role', gradeSsoPayload.role);
        urlObj.searchParams.set('sso_role', gradeSsoPayload.role);
      }
      return urlObj.toString();
    } catch {
      return baseUrl;
    }
  }, [grade3DbConfig.externalAppUrl, gradeSsoPayload]);

  const grade4EmbeddedUrlWithSso = useMemo(() => {
    const rawBase = DEFAULT_GRADE4_APP_URL.trim();
    const baseUrl = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;

    try {
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('autologin', 'true');
      urlObj.searchParams.set('auto_login', 'true');
      urlObj.searchParams.set('tab', 'interactive_games');
      urlObj.searchParams.set('module', 'interactive_games');
      urlObj.searchParams.set('grade', 'Khối 4');
      if (gradeSsoPayload.email) {
        urlObj.searchParams.set('email', gradeSsoPayload.email);
        urlObj.searchParams.set('sso_email', gradeSsoPayload.email);
      }
      if (gradeSsoPayload.ssoToken) {
        urlObj.searchParams.set('token', gradeSsoPayload.ssoToken);
        urlObj.searchParams.set('sso_token', gradeSsoPayload.ssoToken);
      }
      if (gradeSsoPayload.name) {
        urlObj.searchParams.set('name', gradeSsoPayload.name);
        urlObj.searchParams.set('sso_name', gradeSsoPayload.name);
      }
      if (gradeSsoPayload.role) {
        urlObj.searchParams.set('role', gradeSsoPayload.role);
        urlObj.searchParams.set('sso_role', gradeSsoPayload.role);
      }
      return urlObj.toString();
    } catch {
      return baseUrl;
    }
  }, [gradeSsoPayload]);

  const postSsoToGrade3Iframe = useCallback(() => {
    const iframeWindow = grade3IframeRef.current?.contentWindow;
    if (!iframeWindow) return;
    try {
      const payload = {
        autologin: true,
        auto_login: true,
        email: gradeSsoPayload.email,
        sso_email: gradeSsoPayload.email,
        name: gradeSsoPayload.name,
        sso_name: gradeSsoPayload.name,
        role: gradeSsoPayload.role,
        sso_role: gradeSsoPayload.role,
        token: gradeSsoPayload.ssoToken,
        ssoToken: gradeSsoPayload.ssoToken,
        sso_token: gradeSsoPayload.ssoToken,
        tab: 'interactive_games',
        module: 'interactive_games',
        grade: 'Khối 3',
        user: {
          email: gradeSsoPayload.email,
          name: gradeSsoPayload.name,
          displayName: gradeSsoPayload.name,
          role: gradeSsoPayload.role,
          uid: gradeSsoPayload.uid,
        },
      };
      iframeWindow.postMessage({ ...payload, type: 'PK_TRUC_KHANG_SSO_LOGIN' }, '*');
      iframeWindow.postMessage({ ...payload, type: 'SSO_AUTO_LOGIN' }, '*');
    } catch {
      // Ignore cross-origin postMessage errors
    }
  }, [gradeSsoPayload]);

  const postSsoToGrade4Iframe = useCallback(() => {
    const iframeWindow = grade4IframeRef.current?.contentWindow;
    if (!iframeWindow) return;
    try {
      const payload = {
        autologin: true,
        auto_login: true,
        email: gradeSsoPayload.email,
        sso_email: gradeSsoPayload.email,
        name: gradeSsoPayload.name,
        sso_name: gradeSsoPayload.name,
        role: gradeSsoPayload.role,
        sso_role: gradeSsoPayload.role,
        token: gradeSsoPayload.ssoToken,
        ssoToken: gradeSsoPayload.ssoToken,
        sso_token: gradeSsoPayload.ssoToken,
        tab: 'interactive_games',
        module: 'interactive_games',
        grade: 'Khối 4',
        user: {
          email: gradeSsoPayload.email,
          name: gradeSsoPayload.name,
          displayName: gradeSsoPayload.name,
          role: gradeSsoPayload.role,
          uid: gradeSsoPayload.uid,
        },
      };
      iframeWindow.postMessage({ ...payload, type: 'PK_TRUC_KHANG_SSO_LOGIN' }, '*');
      iframeWindow.postMessage({ ...payload, type: 'SSO_AUTO_LOGIN' }, '*');
    } catch {
      // Ignore cross-origin postMessage errors
    }
  }, [gradeSsoPayload]);

  const handleGrade3IframeLoad = useCallback(() => {
    setIsGrade3IframeLoading(false);
    postSsoToGrade3Iframe();
    window.setTimeout(postSsoToGrade3Iframe, 250);
    window.setTimeout(postSsoToGrade3Iframe, 800);
  }, [postSsoToGrade3Iframe]);

  const handleGrade4IframeLoad = useCallback(() => {
    setIsGrade4IframeLoading(false);
    postSsoToGrade4Iframe();
    window.setTimeout(postSsoToGrade4Iframe, 250);
    window.setTimeout(postSsoToGrade4Iframe, 800);
  }, [postSsoToGrade4Iframe]);

  const [activeGame, setActiveGame] = useState<GameItem | null>(null);
  const [selectedLobbyMode, setSelectedLobbyMode] = useState<GameType>('golden_bell');
  const [activeTab, setActiveTab] = useState<'games' | 'store'>(initialTab);
  const [gameMode, setGameMode] = useState<'lobby' | 'countdown' | 'playing' | 'result'>('lobby');
  const [countdownStep, setCountdownStep] = useState<number | null>(null);
  const [motivationalQuote, setMotivationalQuote] = useState('');
  const [achievedRank, setAchievedRank] = useState<number | 'unranked' | null>(null);
  const [isRewardAlreadyClaimed, setIsRewardAlreadyClaimed] = useState<boolean>(false);
  const aiGeneratorSectionRef = useRef<HTMLDivElement | null>(null);
  const aiTopicInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [embeddedGameUrl, setEmbeddedGameUrl] = useState<string | null>(null);
  const [embeddedGameTitle, setEmbeddedGameTitle] = useState<string>('');
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Sync initialTab when prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Tự động chuẩn hóa dữ liệu cũ (backward compatibility):
  // Nếu có phòng trò chơi mang danh sách nhiều lớp (vd: "Lớp 3A, Lớp 3B"), tự động tách thành các phòng riêng biệt
  useEffect(() => {
    if (!onUpdateGame) return;
    const legacyGames = (games || []).filter(g => g.classInfo && g.classInfo.includes(','));
    if (legacyGames.length > 0) {
      legacyGames.forEach(game => {
        const classes = game.classInfo!.split(',').map(c => c.trim()).filter(Boolean);
        if (classes.length > 0) {
          const rootId = game.originalGameId || game.id.replace(/-class-.*$/, '');
          onUpdateGame({
            ...game,
            classInfo: classes[0],
            originalGameId: rootId,
          });
          classes.slice(1).forEach((cls, idx) => {
            onUpdateGame({
              ...game,
              id: `${rootId}-class-${cls.toLowerCase().replace(/[^a-z0-9]/g, '')}-${idx}`,
              classInfo: cls,
              originalGameId: rootId,
              playersCount: 0,
            });
          });
        }
      });
    }
  }, [games, onUpdateGame]);

  // Chuẩn hóa danh sách game: Mỗi dòng đại diện cho 1 phòng độc lập của 1 lớp duy nhất (Mô hình 1 đề - N lần giao)
  const normalizedGames = useMemo(() => {
    const list: GameItem[] = [];
    (games || []).forEach(game => {
      if (game.classInfo && game.classInfo.includes(',')) {
        const classes = game.classInfo.split(',').map(c => c.trim()).filter(Boolean);
        if (classes.length > 0) {
          classes.forEach((cls, idx) => {
            const rootId = game.originalGameId || game.id.replace(/-class-.*$/, '');
            list.push({
              ...game,
              id: idx === 0 ? game.id : `${rootId}-class-${cls.toLowerCase().replace(/[^a-z0-9]/g, '')}-${idx}`,
              classInfo: cls,
              originalGameId: rootId,
            });
          });
        } else {
          list.push(game);
        }
      } else {
        list.push(game);
      }
    });
    return list;
  }, [games]);

  // Listen for external open game store triggers
  useEffect(() => {
    const handleOpenStore = () => {
      setActiveTab('store');
      setGameMode('lobby');
      setActiveGame(null);
    };

    window.addEventListener('eduplay_open_game_store', handleOpenStore);
    return () => {
      window.removeEventListener('eduplay_open_game_store', handleOpenStore);
    };
  }, []);

  const MOTIVATIONAL_QUOTES = [
    "Sẵn sàng chưa nào! 🚀",
    "Tập trung nhé, cố lên! 💪",
    "Đọc kỹ câu hỏi trước khi chọn nhé! 📖",
    "Chúc em thi đấu tốt! ⭐"
  ];

  useEffect(() => {
    if (gameMode !== 'countdown') return;

    if (countdownStep !== null && countdownStep > 0) {
      if (soundEnabled) {
        try {
          const windowAudio = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (windowAudio) {
            const ctx = new windowAudio();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
          }
        } catch (e) {}
      }

      const timer = setTimeout(() => {
        setCountdownStep(countdownStep - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdownStep === 0) {
      if (soundEnabled) {
        try {
          const windowAudio = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (windowAudio) {
            const ctx = new windowAudio();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
          }
        } catch (e) {}
      }

      const timer = setTimeout(() => {
        setGameMode('playing');
        setCountdownStep(null);
        if (activeGame && activeGame.isTimeLimited !== false) {
          setTimerSeconds(activeGame.type === 'speed_quiz' ? 10 : 15);
          setIsTimerRunning(true);
        } else {
          setIsTimerRunning(false);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gameMode, countdownStep, activeGame, soundEnabled]);
  const [showCreateQuizziModal, setShowCreateQuizziModal] = useState(false);
  const [editingQuizziGame, setEditingQuizziGame] = useState<QuizziGameItem | null>(null);
  const [deletedCards, setDeletedCards] = useState<(number | string)[]>([]);
  const [gameToDelete, setGameToDelete] = useState<{ id: number | string; title: string } | null>(null);
  const [sharingGame, setSharingGame] = useState<(any & { _shareCollection?: 'games' | 'quizzi_games' }) | null>(null);
  const [gameExportModalState, setGameExportModalState] = useState<{
    isOpen: boolean;
    games: ExportableGame[];
    titleContext?: string;
  }>({
    isOpen: false,
    games: [],
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Filter States
  const [filterGrade, setFilterGrade] = useState('Tất cả các khối');
  const [filterClass, setFilterClass] = useState('Tất cả các lớp');
  const [filterSubject, setFilterSubject] = useState('Tất cả các môn');
  const [filterType, setFilterType] = useState('Tất cả Loại');

  useEffect(() => {
    if (filterGrade !== 'Khối 3' && filterGrade !== 'Khối 4') return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = event?.data;
        if (
          data &&
          typeof data === 'object' &&
          (data.type === 'PK_TRUC_KHANG_REQUEST_SSO' || data.type === 'KHO_HOC_LIEU_READY')
        ) {
          if (filterGrade === 'Khối 3') {
            postSsoToGrade3Iframe();
          } else if (filterGrade === 'Khối 4') {
            postSsoToGrade4Iframe();
          }
        }
      } catch {
        // Ignore postMessage listener errors
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [filterGrade, postSsoToGrade3Iframe, postSsoToGrade4Iframe]);

  const handleSelectGradeCard = (gradeValue: string) => {
    setFilterGrade(gradeValue);
    setFilterClass('Tất cả các lớp');
    if (gradeValue === 'Khối 3') {
      setShowDedicatedGradeIframe(true);
      setIsGrade3IframeLoading(true);
    } else if (gradeValue === 'Khối 4') {
      setShowDedicatedGradeIframe(true);
      setIsGrade4IframeLoading(true);
    }
  };

  // Student Filter States
  const [studentRoomSubjectFilter, setStudentRoomSubjectFilter] = useState('Tất cả các môn');
  const [studentQuizSubjectFilter, setStudentQuizSubjectFilter] = useState('Tất cả các môn');
  const [studentQuizSearchQuery, setStudentQuizSearchQuery] = useState('');

  // Pagination States
  const [gamesCurrentPage, setGamesCurrentPage] = useState<number>(1);
  const [gamesPageSize, setGamesPageSize] = useState<number>(10);

  const [roomsCurrentPage, setRoomsCurrentPage] = useState<number>(1);
  const [roomsPageSize, setRoomsPageSize] = useState<number>(10);

  const [studentQuizCurrentPage, setStudentQuizCurrentPage] = useState<number>(1);
  const [studentQuizPageSize, setStudentQuizPageSize] = useState<number>(10);

  const [studentRoomsCurrentPage, setStudentRoomsCurrentPage] = useState<number>(1);
  const [studentRoomsPageSize, setStudentRoomsPageSize] = useState<number>(10);

  // Reset pagination on filter changes
  useEffect(() => {
    setGamesCurrentPage(1);
    setRoomsCurrentPage(1);
  }, [filterGrade, filterClass, filterSubject, filterType]);

  useEffect(() => {
    setStudentQuizCurrentPage(1);
  }, [studentQuizSubjectFilter, studentQuizSearchQuery]);

  useEffect(() => {
    setStudentRoomsCurrentPage(1);
  }, [studentRoomSubjectFilter]);

  const [quizziGames, setQuizziGames] = useState<QuizziGameItem[]>(() => getLocalCachedQuizziGames());

  // Lắng nghe dữ liệu Quizzi thời gian thực từ Cloud Firestore
  useEffect(() => {
    const unsubscribe = subscribeToQuizziGamesFromFirestore((updatedGames) => {
      setQuizziGames(updatedGames || []);
    });
    return () => unsubscribe();
  }, []);

  const normalizedQuizziGames = useMemo(() => {
    const seenIds = new Set<string>();
    const list: QuizziGameItem[] = [];

    quizziGames.forEach(game => {
      const gId = String(game.id);
      if (!seenIds.has(gId)) {
        seenIds.add(gId);
        list.push(game);
      }
    });
    return list;
  }, [quizziGames]);

  // Thống kê 4 ô cho Đấu trường tri thức / Trò chơi học tập
  const studentGameStats = useMemo(() => {
    const { studentClass, studentGrade, studentName } = getEffectiveStudentClassAndGrade();
    const customRooms = normalizedGames.filter(g => g.id !== 'game-1' && g.id !== 'game-2' && g.id !== 'game-3' && g.id !== 'game-4');
    const studentRooms = customRooms.filter(room => {
      return isTargetingStudent(room.classInfo, room.grade, studentClass, studentGrade);
    });

    const filteredQuizzi = normalizedQuizziGames.filter(q => {
      if (deletedCards.includes(q.id)) return false;
      return isTargetingStudent(q.classInfo, q.grade, studentClass, studentGrade);
    });

    const profile = getStudentGameProfile(resolveAuthenticStudentId(currentUserId), currentUserName || studentName);
    const userExp = profile.currentExp || 0;
    const level = profile.level || (Math.floor(userExp / 100) + 1);

    return {
      totalRooms: studentRooms.length,
      totalQuizzi: filteredQuizzi.length,
      coins: profile.coins || 0,
      levelStr: `Cấp ${level} (${userExp} EXP)`,
    };
  }, [normalizedGames, normalizedQuizziGames, deletedCards, currentUserId, currentUserName]);

  const accessibleCustomRooms = useMemo(() => {
    const rawRooms = normalizedGames.filter(g => g.id !== 'game-1' && g.id !== 'game-2' && g.id !== 'game-3' && g.id !== 'game-4');
    if ((userRole as string) === 'student') return rawRooms;
    return filterAccessibleItems(rawRooms, accessContext, resourceTab);
  }, [normalizedGames, userRole, accessContext, resourceTab]);

  const accessibleQuizziGames = useMemo(() => {
    const rawQuizzi = normalizedQuizziGames.filter(g => !deletedCards.includes(g.id));
    if ((userRole as string) === 'student') return rawQuizzi;
    return filterAccessibleItems(rawQuizzi, accessContext, resourceTab);
  }, [normalizedQuizziGames, deletedCards, userRole, accessContext, resourceTab]);

  const filteredTeacherRooms = useMemo(() => {
    return accessibleCustomRooms.filter(room => {
      const roomGrade = room.khoi || room.grade;
      const roomClass = room.lop || room.classInfo;
      if (filterGrade !== 'Tất cả các khối' && filterGrade !== 'Tất cả khối' && filterGrade !== 'Tất cả' && roomGrade && roomGrade !== filterGrade) return false;
      if (filterClass !== 'Tất cả các lớp' && filterClass !== 'Tất cả' && roomClass) {
        const isAllGradeClasses = roomClass.toLowerCase().includes('tất cả') && (!roomGrade || roomGrade === filterGrade || extractGradeDigit(roomGrade) === extractGradeDigit(filterClass));
        if (!isAllGradeClasses && roomClass !== filterClass) return false;
      }
      if (filterSubject !== 'Tất cả các môn' && filterSubject !== 'Tất cả' && room.subject && room.subject.toLowerCase() !== filterSubject.toLowerCase()) return false;
      return true;
    });
  }, [accessibleCustomRooms, filterGrade, filterClass, filterSubject]);

  const filteredGames = accessibleQuizziGames.filter(g => {
    if (filterGrade !== 'Tất cả các khối' && filterGrade !== 'Tất cả khối' && g.grade !== filterGrade) return false;
    if (filterClass !== 'Tất cả các lớp' && g.classInfo !== 'Tất cả các lớp' && g.classInfo !== filterClass) return false;
    if (filterSubject !== 'Tất cả các môn' && g.subjectLabel !== filterSubject && g.subject !== filterSubject) return false;
    if (filterType !== 'Tất cả Loại' && g.type !== filterType) return false;
    return true;
  });

  const handleDeleteCard = async (id: number | string) => {
    try {
      await deleteQuizziGameFromFirestore(String(id));
      setQuizziGames(prev => prev.filter(g => String(g.id) !== String(id)));
      setDeletedCards(prev => [...prev, id]);
      setToastMessage("🗑️ Đã xóa trò chơi thành công");
    } catch (e) {
      console.error("Lỗi xóa card:", e);
      setToastMessage("❌ Lỗi khi xóa trò chơi");
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveQuizziGames = async (newGames: QuizziGameItem[]) => {
    try {
      if (editingQuizziGame) {
        const rootId = editingQuizziGame.originalGameId || String(editingQuizziGame.id).replace(/-class-.*$/, '');
        const oldMatches = quizziGames.filter(g => {
          const gRoot = g.originalGameId || String(g.id).replace(/-class-.*$/, '');
          return gRoot === rootId || g.id === editingQuizziGame.id;
        });
        for (const old of oldMatches) {
          if (!newGames.some(ng => String(ng.id) === String(old.id))) {
            await deleteQuizziGameFromFirestore(String(old.id));
          }
        }
        await saveMultipleQuizziGamesToFirestore(newGames);
        setQuizziGames(prev => {
          const withoutOld = prev.filter(g => {
            const gRoot = g.originalGameId || String(g.id).replace(/-class-.*$/, '');
            return gRoot !== rootId && g.id !== editingQuizziGame.id;
          });
          const newIds = new Set(newGames.map(g => String(g.id)));
          const cleanPrev = withoutOld.filter(g => !newIds.has(String(g.id)));
          return [...newGames, ...cleanPrev];
        });
        showToast(`Đã cập nhật và lưu ${newGames.length} trò chơi Quizzi lên Cloud Firestore!`, "success");
      } else {
        await saveMultipleQuizziGamesToFirestore(newGames);
        setQuizziGames(prev => {
          const newIds = new Set(newGames.map(g => String(g.id)));
          const cleanPrev = prev.filter(g => !newIds.has(String(g.id)));
          return [...newGames, ...cleanPrev];
        });
        showToast(`Đã tạo thành công và lưu ${newGames.length} trò chơi Quizzi lên Cloud Firestore!`, "success");
      }
    } catch (error) {
      console.error("❌ Lỗi khi ghi nhận Quizzi lên Firestore:", error);
      showToast("Có lỗi khi lưu lên Cloud Firestore!", "error");
      throw error;
    } finally {
      setEditingQuizziGame(null);
      setShowCreateQuizziModal(false);
    }
  };


  // Leaderboard modal state, class filter & real student results
  const [selectedLeaderboardGame, setSelectedLeaderboardGame] = useState<GameItem | null>(null);
  const [leaderboardResults, setLeaderboardResults] = useState<any[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState<boolean>(false);
  const [leaderboardSearch, setLeaderboardSearch] = useState<string>('');
  const [leaderboardClassFilter, setLeaderboardClassFilter] = useState<string>('Lớp 3D');
  const [debugTeacherInfo, setDebugTeacherInfo] = useState<{
    roomId: string;
    readCount: number;
    docsFound: number;
    rosterSize: number;
    studentDetails: Array<{ code: string; name: string; status: string; reason: string }>;
    misplacedGames: Array<{ studentCode: string; gameKey: string; roomTitle?: string }>;
  }>({ roomId: '', readCount: 0, docsFound: 0, rosterSize: 0, studentDetails: [], misplacedGames: [] });

  // Update class filter when selected game changes
  useEffect(() => {
    if (selectedLeaderboardGame) {
      const defaultCls = selectedLeaderboardGame.classInfo?.split(',')[0]?.trim() || 'Lớp 3D';
      setLeaderboardClassFilter(defaultCls);
    }
  }, [selectedLeaderboardGame]);

  const fetchLeaderboardData = useCallback(async () => {
    if (!selectedLeaderboardGame) {
      setLeaderboardResults([]);
      setLeaderboardSearch('');
      setDebugTeacherInfo({ roomId: '', readCount: 0, docsFound: 0, rosterSize: 0, studentDetails: [], misplacedGames: [] });
      return;
    }
    setIsLeaderboardLoading(true);
    try {
      if (!db) {
        setIsLeaderboardLoading(false);
        return;
      }

      const currentRoomId = String(selectedLeaderboardGame.id);
      const currentOriginalId = String(selectedLeaderboardGame.originalGameId || currentRoomId.replace(/-class-.*$/, ''));
      const rootId = currentRoomId.replace(/-class-.*$/, '');
      const currentTitle = (selectedLeaderboardGame.title || '').trim().toLowerCase();

      const targetClass = leaderboardClassFilter || selectedLeaderboardGame.classInfo || 'Lớp 3D';
      const cleanTargetClass = targetClass.replace(/^Lớp\s*/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      // Prepare student roster for studentCode lookup (studentCode is the ONLY primary identifier key)
      const roster = getStudentsFromLocalStorage(targetClass) || generateDefaultClassRoster(targetClass, 38);
      const rosterMap = new Map<string, string>();
      const rosterCodes: string[] = [];
      roster.forEach((st: any) => {
        const code = normalizeStudentCode(st.code || st.studentCode || st.maHs || st.id);
        const name = st.fullName || st.name || '';
        if (code) {
          rosterCodes.push(code);
          if (name) rosterMap.set(code.toUpperCase(), name);
        }
      });

      const studentMap = new Map<string, any>();
      let readCount = 0;
      let docsFound = 0;
      const studentDetails: any[] = [];
      const misplacedGames: any[] = [];

      // 1. Truy vấn quiz_live_sessions tối ưu bằng điều kiện where('targetId', 'in', ...)
      const targetIds = Array.from(new Set([currentRoomId, currentOriginalId, rootId].filter(Boolean)));
      const liveParticipants = await queryQuizLiveSessionsByTargetIds(targetIds);

      // 2. Truy vấn student_results tối ưu bằng where('className', 'in', ...) và where('studentCode', 'in', ...)
      try {
        const fetchedStudentDocs = new Map<string, any>();

        if (targetClass && targetClass !== 'Tất cả các lớp' && cleanTargetClass) {
          const classVariants = Array.from(
            new Set([targetClass, `Lớp ${cleanTargetClass}`, cleanTargetClass])
          ).slice(0, 10);
          const classQuery = query(
            collection(db, 'student_results'),
            where('className', 'in', classVariants)
          );
          const classSnap = await getDocs(classQuery);
          readCount += classSnap.size;
          classSnap.forEach((d) => fetchedStudentDocs.set(d.id, d.data()));
        }

        // Bổ sung các mã studentCode từ danh sách lớp và từ phiên live (chia batch tối đa 10 mã cho toán tử 'in')
        const candidateCodes = Array.from(
          new Set([
            ...rosterCodes,
            ...liveParticipants.map((p) => normalizeStudentCode(p.studentCode || p.studentId)).filter(Boolean),
          ])
        ).filter((code) => !fetchedStudentDocs.has(code));

        for (let i = 0; i < candidateCodes.length; i += 10) {
          const batchCodes = candidateCodes.slice(i, i + 10);
          if (batchCodes.length === 0) continue;
          const codeQuery = query(
            collection(db, 'student_results'),
            where('studentCode', 'in', batchCodes)
          );
          const codeSnap = await getDocs(codeQuery);
          readCount += codeSnap.size;
          codeSnap.forEach((d) => fetchedStudentDocs.set(d.id, d.data()));
        }

        docsFound = fetchedStudentDocs.size;

        fetchedStudentDocs.forEach((data, docId) => {
          if (!data) return;
          const sCode = normalizeStudentCode(data.studentCode || docId);
          if (!sCode) return;
          const sCodeUpper = sCode.toUpperCase();
          const gamesObj = data.games || {};

          let sClass = data.className || data.studentClass || data.class || '';
          if (!sClass) {
            const codeMatch = sCodeUpper.match(/([1-5][A-Z])/);
            if (codeMatch) sClass = `Lớp ${codeMatch[1]}`;
          }

          for (const [gKey, gVal] of Object.entries(gamesObj)) {
            const res = gVal as any;
            if (!res) continue;

            const resRoomId = String(res.roomId || '');
            const resTitle = String(res.roomTitle || '').trim().toLowerCase();
            const resClass = res.className || res.studentClass || sClass;

            const isIdMatch = (
              gKey === currentRoomId ||
              gKey === currentOriginalId ||
              gKey === rootId ||
              resRoomId === currentRoomId ||
              resRoomId === currentOriginalId ||
              resRoomId === rootId ||
              (resRoomId && currentRoomId && (resRoomId.includes(currentRoomId) || currentRoomId.includes(resRoomId))) ||
              (resRoomId && rootId && (resRoomId.includes(rootId) || rootId.includes(resRoomId)))
            );

            const isTitleMatch = Boolean(resTitle && currentTitle && (
              resTitle === currentTitle ||
              resTitle.includes(currentTitle) ||
              currentTitle.includes(resTitle)
            ));

            if (isIdMatch || isTitleMatch) {
              const effectiveClass = resClass || sClass || targetClass;
              const cleanStudentClass = effectiveClass.replace(/^Lớp\s*/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

              const isClassAllowed = (
                targetClass === 'Tất cả các lớp' ||
                cleanTargetClass === '' ||
                cleanStudentClass === cleanTargetClass ||
                sCodeUpper.includes(cleanTargetClass)
              );

              if (!isClassAllowed) {
                misplacedGames.push({ studentCode: sCode, gameKey: gKey, roomTitle: res.roomTitle });
                continue;
              }

              const sName = res.studentName || data.studentName || rosterMap.get(sCodeUpper) || sCode;
              const isCompleted = res.completed !== false && res.status !== 'in_progress';
              const totalQ = res.totalQuestions || selectedLeaderboardGame.questions?.length || 1;
              const ansQ = res.questionsAnswered !== undefined ? res.questionsAnswered : (isCompleted ? totalQ : 0);
              const scoreVal = typeof res.score === 'number' ? res.score : 0;

              const candidate = {
                studentCode: sCode,
                studentName: sName,
                className: effectiveClass,
                score: scoreVal,
                maxScore: res.maxScore || (totalQ * 100),
                completed: isCompleted,
                questionsAnswered: ansQ,
                totalQuestions: totalQ,
                submittedAt: res.submittedAt || res.updatedAt || new Date().toISOString(),
                rank: res.rank || 'unranked',
                source: 'student_results'
              };

              const existing = studentMap.get(sCodeUpper);
              if (!existing) {
                studentMap.set(sCodeUpper, candidate);
              } else {
                if (candidate.completed && !existing.completed) {
                  studentMap.set(sCodeUpper, candidate);
                } else if (candidate.completed === existing.completed && candidate.score > existing.score) {
                  studentMap.set(sCodeUpper, candidate);
                }
              }

              studentDetails.push({
                code: sCode,
                name: sName,
                status: isCompleted ? 'Đã tham gia' : 'Đang làm dở',
                reason: isIdMatch ? 'Khớp roomId' : 'Khớp tiêu đề phòng'
              });
            }
          }
        });
      } catch (err) {
        console.warn('Lỗi truy vấn student_results theo where() cho leaderboard:', err);
      }

      // 3. Hợp nhất dữ liệu từ quiz_live_sessions (đã truy vấn theo where('targetId', 'in', targetIds))
      try {
        liveParticipants.forEach((p) => {
          if (!p || p.studentId?.startsWith('seed_st_')) return;

          const pStudentCode = normalizeStudentCode(p.studentCode || p.studentId);
          if (!pStudentCode) return;
          const pStudentIdUpper = pStudentCode.toUpperCase();
          const pClass = p.studentClass || '';
          const cleanPClass = pClass.replace(/^Lớp\s*/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

          const isClassAllowed = (
            targetClass === 'Tất cả các lớp' ||
            cleanTargetClass === '' ||
            cleanPClass === cleanTargetClass ||
            pStudentIdUpper.includes(cleanTargetClass)
          );

          if (!isClassAllowed) return;

          const isCompleted = p.status === 'completed';
          const totalQ = p.totalQuestions || selectedLeaderboardGame.questions?.length || 1;
          const ansQ = p.answeredCount !== undefined ? p.answeredCount : (isCompleted ? totalQ : 0);

          let scoreVal = typeof p.score === 'number' ? p.score : 0;
          if (scoreVal <= 10 && totalQ > 0) {
            scoreVal = scoreVal * 10;
          }

          const candidate = {
            studentCode: pStudentCode,
            studentName: p.studentName || rosterMap.get(pStudentIdUpper) || pStudentCode,
            className: pClass || targetClass,
            score: scoreVal,
            maxScore: totalQ * 100,
            completed: isCompleted,
            questionsAnswered: ansQ,
            totalQuestions: totalQ,
            submittedAt: p.completedAt ? new Date(p.completedAt).toISOString() : (p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString()),
            rank: 'unranked',
            source: 'quiz_live_sessions'
          };

          const existing = studentMap.get(pStudentIdUpper);
          if (!existing) {
            studentMap.set(pStudentIdUpper, candidate);
          } else {
            if (candidate.completed && !existing.completed) {
              studentMap.set(pStudentIdUpper, candidate);
            }
          }
        });
      } catch (err) {
        console.warn('Lỗi hợp nhất quiz_live_sessions cho leaderboard:', err);
      }

      const results = Array.from(studentMap.values());
      setLeaderboardResults(results);
      setDebugTeacherInfo({
        roomId: currentRoomId,
        readCount,
        docsFound,
        rosterSize: roster.length,
        studentDetails,
        misplacedGames
      });
    } catch (err) {
      console.warn('Lỗi tải bảng xếp hạng game:', err);
    } finally {
      setIsLeaderboardLoading(false);
    }
  }, [selectedLeaderboardGame, leaderboardClassFilter]);

  useEffect(() => {
    fetchLeaderboardData();
  }, [fetchLeaderboardData]);

  // Available classes for dropdown filter in leaderboard modal
  const availableLeaderboardClasses = useMemo(() => {
    const set = new Set<string>();
    if (selectedLeaderboardGame?.classInfo) {
      selectedLeaderboardGame.classInfo.split(',').forEach(c => {
        const trimmed = c.trim();
        if (trimmed) set.add(trimmed);
      });
    }
    if (selectedLeaderboardGame?.grade) {
      const gradeClasses = CLASSES_BY_GRADE[selectedLeaderboardGame.grade] || [];
      gradeClasses.forEach(c => set.add(c));
    } else {
      ['Lớp 3A', 'Lớp 3B', 'Lớp 3C', 'Lớp 3D', 'Lớp 3E'].forEach(c => set.add(c));
    }
    leaderboardResults.forEach(r => {
      if (r.className) set.add(r.className);
    });
    const rawList = Array.from(set);
    if (!accessContext.isAdmin && (userRole as string) !== 'student') {
      const filtered = rawList.filter(c => canTeacherAccessClass(c, accessContext));
      return filtered.length > 0 ? filtered : rawList;
    }
    return rawList;
  }, [selectedLeaderboardGame, leaderboardResults, accessContext, userRole]);

  const sortedLeaderboard = useMemo(() => {
    return [...leaderboardResults].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      if (b.questionsAnswered !== a.questionsAnswered) {
        return b.questionsAnswered - a.questionsAnswered;
      }
      return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    });
  }, [leaderboardResults]);

  const filteredLeaderboard = useMemo(() => {
    if (!leaderboardSearch.trim()) return sortedLeaderboard;
    const q = leaderboardSearch.trim().toLowerCase();
    return sortedLeaderboard.filter((item, idx) => {
      const sttStr = String(idx + 1);
      const codeStr = (item.studentCode || '').toLowerCase();
      const nameStr = (item.studentName || '').toLowerCase();
      return codeStr.includes(q) || nameStr.includes(q) || sttStr === q;
    });
  }, [sortedLeaderboard, leaderboardSearch]);

  const participatedCount = leaderboardResults.length;
  const completedCount = leaderboardResults.filter(r => r.completed).length;

  const handleScanMisplacedGameResults = async () => {
    if (!selectedLeaderboardGame || !db) return;
    try {
      const targetClass = leaderboardClassFilter || selectedLeaderboardGame.classInfo || 'Lớp 3D';
      const cleanTargetClass = targetClass.replace(/^Lớp\s*/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const classVariants = Array.from(
        new Set([targetClass, `Lớp ${cleanTargetClass}`, cleanTargetClass].filter(Boolean))
      ).slice(0, 10);

      const q = query(
        collection(db, 'student_results'),
        where('className', 'in', classVariants.length > 0 ? classVariants : ['Lớp 3A'])
      );
      const snap = await getDocs(q);
      const exactMatch: any[] = [];
      const normalizedMatch: any[] = [];
      const unmatched: any[] = [];

      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (!data || !data.games) return;
        const studentCode = normalizeStudentCode(data.studentCode || docSnap.id) || docSnap.id;
        for (const [gKey, gVal] of Object.entries(data.games)) {
          const res = gVal as any;
          if (!res) continue;
          if (gKey === selectedLeaderboardGame.id || res.roomId === selectedLeaderboardGame.id) {
            exactMatch.push({ studentCode, ...res });
          } else if (res.roomTitle && selectedLeaderboardGame.title && res.roomTitle.trim().toLowerCase() === selectedLeaderboardGame.title.trim().toLowerCase()) {
            normalizedMatch.push({ studentCode, ...res });
          } else {
            unmatched.push({ studentCode, gameKey: gKey, ...res });
          }
        }
      });

      showToast(
        `Đã đối soát kết quả theo Mã HS: Khớp roomId (${exactMatch.length}) • Khớp tiêu đề (${normalizedMatch.length}) • Khác (${unmatched.length})`,
        'success'
      );
    } catch (err) {
      console.error('Lỗi quét kết quả game:', err);
      showToast('Không thể quét kết quả trò chơi lúc này.', 'error');
    }
  };

  // Delete confirmation modal state
  const [roomToDelete, setRoomToDelete] = useState<GameItem | null>(null);

  // Golden Bell & Speed Quiz State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedChoiceKey, setSelectedChoiceKey] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [comboStreak, setComboStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [totalTimerSeconds, setTotalTimerSeconds] = useState(15);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [matchingAnswers, setMatchingAnswers] = useState<Record<number, string>>({});
  const [gameAnswers, setGameAnswers] = useState<Record<number, any>>({});

  useEffect(() => {
    setMatchingAnswers({});
    setGameAnswers(prev => ({ ...prev, [currentQuestionIndex]: prev[currentQuestionIndex] || {} }));
  }, [currentQuestionIndex]);

  // Flashcard State
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [masteredCardIndices, setMasteredCardIndices] = useState<number[]>([]);
  const [reviewCardIndices, setReviewCardIndices] = useState<number[]>([]);

  // Lucky Wheel State
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelWinner, setWheelWinner] = useState<string | null>(null);
  const luckyStudentList = [
    'Lê Minh Anh',
    'Phạm Đức Bảo',
    'Nguyễn Thảo Nhi',
    'Hoàng Quốc Việt',
    'Đặng Hoàng Yến',
    'Bùi Tiến Dũng',
    'Vũ Thị Hoa'
  ];

  // Timer Effect for Golden Bell & Speed Quiz
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      handleTimeUp();
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  const handleStartGame = (game: GameItem) => {
    const perQSeconds = game.type === 'speed_quiz' ? 10 : 15;
    setActiveGame(game);
    setCurrentQuestionIndex(0);
    setScore(0);
    setComboStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    setSelectedOption(null);
    setSelectedChoiceKey(null);
    setFlashcardFlipped(false);
    setMasteredCardIndices([]);
    setReviewCardIndices([]);
    setGameAnswers({});
    setTotalTimerSeconds(perQSeconds);
    setTimerSeconds(perQSeconds);

    if (game.type === 'flashcards') {
      setIsTimerRunning(false);
      setCountdownStep(null);
      setGameMode('playing');
    } else {
      const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
      setMotivationalQuote(randomQuote);
      setCountdownStep(3);
      setGameMode('countdown');
    }

    // Register student session in-progress for accurate real-time tracking
    const effectiveStudentCode = resolveAuthenticStudentId(currentUserId);
    const studentCls = getEffectiveStudentClassAndGrade().studentClass || game.classInfo || 'Lớp 3D';
    try {
      joinQuizLiveSession({
        targetId: game.id,
        targetTitle: game.title,
        subject: game.subject,
        grade: game.grade,
        studentId: effectiveStudentCode,
        studentName: currentUserName || 'Học sinh',
        studentClass: studentCls,
        totalQuestions: game.questions?.length || 1
      });
      if (game.originalGameId && game.originalGameId !== game.id) {
        joinQuizLiveSession({
          targetId: game.originalGameId,
          targetTitle: game.title,
          subject: game.subject,
          grade: game.grade,
          studentId: effectiveStudentCode,
          studentName: currentUserName || 'Học sinh',
          studentClass: studentCls,
          totalQuestions: game.questions?.length || 1
        });
      }
      studentResultService.saveGameResult(effectiveStudentCode, game.id, {
        score: 0,
        maxScore: (game.questions?.length || 1) * 100,
        rank: 'unranked',
        submittedAt: new Date().toISOString(),
        completed: false,
        questionsAnswered: 0,
        totalQuestions: game.questions?.length || 1,
        studentName: currentUserName || 'Học sinh',
        className: studentCls,
        roomId: game.id,
        roomTitle: game.title
      });
      if (game.originalGameId && game.originalGameId !== game.id) {
        studentResultService.saveGameResult(effectiveStudentCode, game.originalGameId, {
          score: 0,
          maxScore: (game.questions?.length || 1) * 100,
          rank: 'unranked',
          submittedAt: new Date().toISOString(),
          completed: false,
          questionsAnswered: 0,
          totalQuestions: game.questions?.length || 1,
          studentName: currentUserName || 'Học sinh',
          className: studentCls,
          roomId: game.originalGameId,
          roomTitle: game.title
        });
      }
    } catch (e) {
      console.warn('Lỗi ghi nhận tham gia đấu trường:', e);
    }
  };

  const hasAutoStartedGameIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialActiveGame && initialActiveGame.id) {
      if (hasAutoStartedGameIdRef.current !== initialActiveGame.id) {
        hasAutoStartedGameIdRef.current = initialActiveGame.id;
        handleStartGame(initialActiveGame);
      }
    }
  }, [initialActiveGame?.id]);

  const [debugSaveResult, setDebugSaveResult] = useState<{
    status: 'idle' | 'saving' | 'success' | 'error';
    path?: string;
    studentCode?: string;
    roomId?: string;
    serverData?: any;
    errorMsg?: string;
  }>({ status: 'idle' });

  const finishGameAndAward = async (finalScore: number) => {
    if (!activeGame) return;
    setGameMode('result');
    if (finalScore > 0) {
      triggerConfetti();
    }

    const totalPossible = (activeGame.questions.length || 1) * 100;
    const ratio = totalPossible > 0 ? finalScore / totalPossible : 0;
    let rank: number | 'unranked' = 'unranked';
    if (ratio >= 0.85) rank = 1;
    else if (ratio >= 0.65) rank = 2;
    else if (ratio >= 0.45) rank = 3;
    else rank = 'unranked';

    setAchievedRank(rank);

    const effectiveStudentCode = resolveAuthenticStudentId(currentUserId);
    const isClaimedAlready = hasClaimedReward(effectiveStudentCode, 'arena', activeGame.id);
    setIsRewardAlreadyClaimed(isClaimedAlready);

    if (!isClaimedAlready) {
      awardArenaReward(effectiveStudentCode, activeGame.id, activeGame.title || 'Đấu Trường', rank);
    }

    const pathStr = `student_results/${effectiveStudentCode} → games.${activeGame.id}`;
    if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
      setDebugSaveResult({ status: 'saving', path: pathStr, studentCode: effectiveStudentCode, roomId: activeGame.id });
    }

    const studentCls = getEffectiveStudentClassAndGrade().studentClass || activeGame.classInfo || 'Lớp 3D';

    try {
      await studentResultService.saveGameResult(effectiveStudentCode, activeGame.id, {
        score: finalScore,
        maxScore: totalPossible,
        rank,
        submittedAt: new Date().toISOString(),
        completed: true,
        questionsAnswered: activeGame.questions.length,
        totalQuestions: activeGame.questions.length,
        studentName: currentUserName || 'Học sinh',
        className: studentCls,
        roomId: activeGame.id,
        roomTitle: activeGame.title
      });

      if (activeGame.originalGameId && activeGame.originalGameId !== activeGame.id) {
        await studentResultService.saveGameResult(effectiveStudentCode, activeGame.originalGameId, {
          score: finalScore,
          maxScore: totalPossible,
          rank,
          submittedAt: new Date().toISOString(),
          completed: true,
          questionsAnswered: activeGame.questions.length,
          totalQuestions: activeGame.questions.length,
          studentName: currentUserName || 'Học sinh',
          className: studentCls,
          roomId: activeGame.originalGameId,
          roomTitle: activeGame.title
        });
      }

      await completeQuizLiveSession({
        targetId: activeGame.id,
        studentId: effectiveStudentCode,
        studentName: currentUserName || 'Học sinh',
        studentClass: studentCls,
        score: finalScore,
        percentage: Math.round(ratio * 100),
        totalQuestions: activeGame.questions.length,
        answeredCount: activeGame.questions.length
      });

      if (activeGame.originalGameId && activeGame.originalGameId !== activeGame.id) {
        await completeQuizLiveSession({
          targetId: activeGame.originalGameId,
          studentId: effectiveStudentCode,
          studentName: currentUserName || 'Học sinh',
          studentClass: studentCls,
          score: finalScore,
          percentage: Math.round(ratio * 100),
          totalQuestions: activeGame.questions.length,
          answeredCount: activeGame.questions.length
        });
      }

      if (db) {
        const verifyDocRef = doc(db, 'student_results', effectiveStudentCode);
        const snap = await getDoc(verifyDocRef);
        if (snap.exists()) {
          const dat = snap.data();
          if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
            setDebugSaveResult({
              status: 'success',
              path: pathStr,
              studentCode: effectiveStudentCode,
              roomId: activeGame.id,
              serverData: dat.games?.[activeGame.id] || dat
            });
          }
        } else {
          throw new Error('Tài liệu không tồn tại trên máy chủ sau khi ghi');
        }
      }
    } catch (err: any) {
      console.warn('Lỗi lưu kết quả game vào student_results:', err);
      if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
        setDebugSaveResult({
          status: 'error',
          path: pathStr,
          studentCode: effectiveStudentCode,
          roomId: activeGame.id,
          errorMsg: err.message || String(err)
        });
      }
    }
  };

  const handleLaunchAiGame = (newGame: GameItem, saveAsRoom?: boolean) => {
    if (saveAsRoom && onUpdateGame) {
      onUpdateGame(newGame);
      const classLabel = newGame.lop || newGame.classInfo || newGame.khoi || newGame.grade || '';
      showToast(
        `Đã lưu phòng thi đấu "${newGame.title}"${classLabel ? ` (${classLabel})` : ''} vào danh sách!`,
        'success'
      );
    }
    handleStartGame(newGame);
  };

  const handleTimeUp = () => {
    // Automatically move to next question or end
    if (!activeGame) return;
    const perQSeconds = activeGame.type === 'speed_quiz' ? 10 : 15;
    setComboStreak(0);
    setSelectedChoiceKey(null);
    if (currentQuestionIndex + 1 < activeGame.questions.length) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption(null);
      setTotalTimerSeconds(perQSeconds);
      setTimerSeconds(perQSeconds);
      setIsTimerRunning(true);
    } else {
      finishGameAndAward(score);
    }
  };

  const isMatchingQuestion = (q: any): boolean => {
    if (!q) return false;
    if (q.statements && Array.isArray(q.statements) && q.statements.length > 0) {
      return false;
    }
    const typeStr = (q.type || '').trim().toLowerCase();
    const contentStr = (q.content || q.question || '').trim().toLowerCase();
    if (typeStr === 'matching' || typeStr === 'noi_cap' || typeStr === 'ghep_noi' || typeStr === 'ghép nối' || typeStr === 'nối cặp' || typeStr === 'nối cặp / kéo thả' || typeStr === 'kéo thả' || typeStr.includes('ghép') || typeStr.includes('nối')) {
      return true;
    }
    if (q.matchingPairs && Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0) {
      return true;
    }
    if (contentStr.includes('ghép nối') || contentStr.includes('nối cặp') || (contentStr.includes('cột a') && contentStr.includes('cột b'))) {
      return true;
    }
    return false;
  };

  const isEssayQuestion = (q: any): boolean => {
    if (!q) return false;
    const typeStr = (q.type || '').trim().toLowerCase();
    return typeStr.includes('essay') || typeStr.includes('tu_luan') || typeStr.includes('tự luận');
  };

  const isTrueFalseQuestion = (q: any): boolean => {
    if (!q) return false;
    const typeStr = (q.type || '').trim().toLowerCase();
    const contentStr = (q.content || q.question || '').trim().toLowerCase();
    return typeStr.includes('true_false') || typeStr.includes('dung_sai') || typeStr.includes('đúng/sai') || typeStr.includes('đúng sai') || contentStr.includes('đúng hoặc sai') || (q.statements && Array.isArray(q.statements) && q.statements.length > 0);
  };

  const isMultipleResponseQuestion = (q: any): boolean => {
    if (!q) return false;
    const typeStr = (q.type || '').trim().toLowerCase();
    const contentStr = (q.content || q.question || '').trim().toLowerCase();
    return typeStr.includes('multiple_response') || typeStr.includes('multi_choice') || typeStr.includes('nhiều đáp án') || contentStr.includes('nhiều đáp án');
  };

  const isFillBlankQuestion = (q: any): boolean => {
    if (!q) return false;
    const typeStr = (q.type || '').trim().toLowerCase();
    return typeStr.includes('fill_blank') || typeStr.includes('dien_khuyet') || typeStr.includes('điền khuyết');
  };

  const isOrderingQuestion = (q: any): boolean => {
    if (!q) return false;
    const typeStr = (q.type || '').trim().toLowerCase();
    const contentStr = (q.content || q.question || '').trim().toLowerCase();
    return typeStr.includes('ordering') || typeStr.includes('sap_xep') || typeStr.includes('sắp xếp') || contentStr.includes('sắp xếp');
  };

  const isClassificationQuestion = (q: any): boolean => {
    if (!q) return false;
    const typeStr = (q.type || '').trim().toLowerCase();
    const contentStr = (q.content || q.question || '').trim().toLowerCase();
    return typeStr.includes('classification') || typeStr.includes('phan_loai') || typeStr.includes('phân loại') || contentStr.includes('phân loại') || (q.classificationItems && q.classificationItems.length > 0);
  };

  const isMultipleChoiceQuestion = (q: any): boolean => {
    if (!q) return false;
    if (isMatchingQuestion(q) || isClassificationQuestion(q) || isOrderingQuestion(q) || isTrueFalseQuestion(q) || isMultipleResponseQuestion(q) || isEssayQuestion(q) || isFillBlankQuestion(q)) {
      return false;
    }
    const typeStr = (q.type || '').trim().toLowerCase();
    if (typeStr === 'multiple_choice' || typeStr === 'single_choice' || typeStr === 'trắc nghiệm đơn' || typeStr === 'trắc nghiệm' || typeStr.includes('trắc nghiệm')) {
      return true;
    }
    if (q.options && q.options.length > 0) {
      return true;
    }
    return false;
  };

  const checkQuestionCorrectLocal = (qi: any, choice: any) => {
    if (!qi) return false;
    if (isMatchingQuestion(qi)) {
      const studentPairs = (typeof choice === 'object' && choice !== null) ? choice : {};
      const pairs = qi.matchingPairs || [];
      if (pairs.length === 0) return false;
      return pairs.every((pair: any, pIdx: number) => {
        const studentSelected = studentPairs[pIdx] !== undefined ? studentPairs[pIdx] : studentPairs[pair.left];
        if (studentSelected === undefined || studentSelected === null || studentSelected === '') return false;
        const correctRightStr = String(pair.right || '').trim().toLowerCase();
        if (String(studentSelected).trim().toLowerCase() === correctRightStr) return true;
        if (typeof studentSelected === 'number') {
          if (studentSelected === pIdx) return true;
          if (pairs[studentSelected] && String(pairs[studentSelected].right || '').trim().toLowerCase() === correctRightStr) return true;
        }
        const rightPrefixMatch = correctRightStr.match(/^([a-z0-9])[\.\:\)\-]/i);
        if (rightPrefixMatch && String(studentSelected).trim().toLowerCase() === rightPrefixMatch[1].toLowerCase()) return true;
        return false;
      });
    }
    if (isOrderingQuestion(qi)) {
      const studentOrder = choice || [];
      const correctOrder = getCorrectOrderingSequence(qi);
      const isMatch = Array.isArray(studentOrder) && studentOrder.length === correctOrder.length && studentOrder.every((item: any, i: number) => String(item).trim() === String(correctOrder[i]).trim());

      console.log('[InteractiveGames - Chấm bài Sắp xếp thứ tự]', {
        questionId: qi.id || qi.code,
        correctOrder,
        studentOrder,
        isMatch
      });

      if (correctOrder.length === 0) return true;
      if (!Array.isArray(studentOrder) || studentOrder.length !== correctOrder.length) return false;
      return isMatch;
    }
    if (isClassificationQuestion(qi)) {
      const studentAnswers = choice || {};
      const items = qi.classificationItems || [];
      if (items.length === 0) return false;
      return items.every((item: any, iIdx: number) => {
        const studentSelectedGroup = studentAnswers[iIdx];
        return studentSelectedGroup === item.group;
      });
    }
    if (isTrueFalseQuestion(qi)) {
      if (qi.statements && qi.statements.length > 0) {
        const studentStmts = choice || {};
        return qi.statements.every((st: any, sIdx: number) => studentStmts[sIdx] === st.isCorrect);
      }
      const sChoice = choice as number;
      const sLetter = sChoice !== undefined && typeof sChoice === 'number' ? String.fromCharCode(65 + sChoice) : '';
      const isCorrectAnswerTrue = qi.correctAnswer === 'A' || qi.correctAnswer?.toLowerCase().includes('đúng') || qi.correctAnswer === 'true' || (qi.correctAnswer as any) === true;
      const studentSelectedTrue = sLetter === 'A' || sChoice === 0 || String(choice).toLowerCase().includes('đúng') || (choice as any) === true;
      return isCorrectAnswerTrue === studentSelectedTrue;
    }
    if (isMultipleResponseQuestion(qi)) {
      const studentArr = Array.isArray(choice) ? choice.sort((a: number, b: number) => a - b) : [];
      const correctArr = qi.options ? qi.options.map((opt: string, idx: number) => (opt.startsWith('✓') || opt.includes('(Đúng)') || (qi.correctAnswer && qi.correctAnswer.includes(String.fromCharCode(65 + idx)))) ? idx : -1).filter((idx: number) => idx !== -1) : [];
      if (correctArr.length === 0) {
        return true;
      }
      if (studentArr.length !== correctArr.length) return false;
      return studentArr.every((val: number, idx: number) => val === correctArr[idx]);
    }
    if (isEssayQuestion(qi) || isFillBlankQuestion(qi)) {
      if (!choice) return false;
      if (qi.correctAnswer && String(choice).trim().toLowerCase() === String(qi.correctAnswer).trim().toLowerCase()) {
        return true;
      }
      return String(choice).trim().length > 0;
    }
    const expectedAnswer = String(qi.correctAnswer ?? qi.answer ?? '').trim();
    const sChoice = choice as number;
    const sLetter = sChoice !== undefined && typeof sChoice === 'number' ? String.fromCharCode(65 + sChoice) : '';
    return (
      sLetter === expectedAnswer ||
      String(choice).trim().toUpperCase() === expectedAnswer.toUpperCase() ||
      (qi.options && qi.options[sChoice] === expectedAnswer)
    );
  };

  const handleGameAnswerSubmit = (answerValue: any, choiceKey?: string) => {
    if (!activeGame || selectedOption !== null) return;
    const q = activeGame.questions[currentQuestionIndex];
    const isCorrect = checkQuestionCorrectLocal(q, answerValue);

    setSelectedChoiceKey(choiceKey ?? (typeof answerValue === 'string' ? answerValue : null));
    setSelectedOption(isCorrect ? 'CORRECT' : 'INCORRECT');
    setIsTimerRunning(false);

    let currentScore = score;
    if (isCorrect) {
      currentScore += 100;
      setScore((prev) => prev + 100);
      setCorrectCount((prev) => prev + 1);
      setComboStreak((prev) => {
        const nextStreak = prev + 1;
        setBestStreak((b) => Math.max(b, nextStreak));
        return nextStreak;
      });
      confetti({
        particleCount: 45,
        spread: 65,
        origin: { y: 0.7 }
      });
    } else {
      setComboStreak(0);
    }

    const effectiveStudentCode = resolveAuthenticStudentId(currentUserId);
    try {
      updateQuizLiveProgress({
        targetId: activeGame.id,
        studentId: effectiveStudentCode,
        answeredCount: currentQuestionIndex + 1,
        totalQuestions: activeGame.questions.length
      });
      if (activeGame.originalGameId && activeGame.originalGameId !== activeGame.id) {
        updateQuizLiveProgress({
          targetId: activeGame.originalGameId,
          studentId: effectiveStudentCode,
          answeredCount: currentQuestionIndex + 1,
          totalQuestions: activeGame.questions.length
        });
      }
    } catch {}

    if (activeGame.isTimeLimited !== false) {
      const perQSeconds = activeGame.type === 'speed_quiz' ? 10 : 15;
      setTimeout(() => {
        if (currentQuestionIndex + 1 < activeGame.questions.length) {
          setCurrentQuestionIndex((prev) => prev + 1);
          setSelectedOption(null);
          setSelectedChoiceKey(null);
          setGameAnswers(prev => ({ ...prev, [currentQuestionIndex + 1]: undefined }));
          setTotalTimerSeconds(perQSeconds);
          setTimerSeconds(perQSeconds);
          setIsTimerRunning(true);
        } else {
          finishGameAndAward(currentScore);
        }
      }, 1500);
    }
  };

  const handleAnswerSubmit = (optionKey: string) => {
    if (!activeGame || selectedOption !== null) return;
    setSelectedOption(optionKey);
    setIsTimerRunning(false);

    let currentScore = score;
    const q = activeGame.questions[currentQuestionIndex];
    if (optionKey === q.answer || optionKey.startsWith(q.answer)) {
      currentScore += 100;
      setScore((prev) => prev + 100);
    }

    const effectiveStudentCode = resolveAuthenticStudentId(currentUserId);
    try {
      updateQuizLiveProgress({
        targetId: activeGame.id,
        studentId: effectiveStudentCode,
        answeredCount: currentQuestionIndex + 1,
        totalQuestions: activeGame.questions.length
      });
      if (activeGame.originalGameId && activeGame.originalGameId !== activeGame.id) {
        updateQuizLiveProgress({
          targetId: activeGame.originalGameId,
          studentId: effectiveStudentCode,
          answeredCount: currentQuestionIndex + 1,
          totalQuestions: activeGame.questions.length
        });
      }
    } catch {}

    if (activeGame.isTimeLimited !== false) {
      setTimeout(() => {
        if (currentQuestionIndex + 1 < activeGame.questions.length) {
          setCurrentQuestionIndex((prev) => prev + 1);
          setSelectedOption(null);
          setTimerSeconds(activeGame.type === 'speed_quiz' ? 10 : 15);
          setIsTimerRunning(true);
        } else {
          finishGameAndAward(currentScore);
        }
      }, 1200);
    }
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleSpinLuckyWheel = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setWheelWinner(null);

    let count = 0;
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * luckyStudentList.length);
      setWheelWinner(luckyStudentList[randomIndex]);
      count++;
      if (count > 25) {
        clearInterval(interval);
        setIsSpinning(false);
        triggerConfetti();
      }
    }, 100);
  };

  const getGameIcon = (type: GameType) => {
    switch (type) {
      case 'golden_bell':
        return <Bell className="w-6 h-6 text-amber-500" />;
      case 'speed_quiz':
        return <Zap className="w-6 h-6 text-rose-500" />;
      case 'lucky_wheel':
        return <Disc className="w-6 h-6 text-indigo-500 animate-spin-slow" />;
      case 'flashcards':
        return <Layers className="w-6 h-6 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      {userRole === 'student' ? (
        <div className="bg-gradient-to-r from-fuchsia-700 via-purple-700 to-pink-600 rounded-[28px] p-7 sm:p-9 text-white shadow-2xl relative overflow-hidden border border-fuchsia-300/40 min-h-[170px] flex items-center">
          {/* Background Ambient Glows & Sparkles Decor */}
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-200 via-pink-400 to-transparent pointer-events-none" />
          <div className="absolute -right-8 -top-8 w-64 h-64 bg-pink-400/25 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 -bottom-10 w-56 h-56 bg-purple-400/20 rounded-full blur-2xl pointer-events-none" />
          
          {/* Subtle background star sparkles */}
          <div className="absolute top-4 right-1/4 text-amber-200/30 text-lg pointer-events-none select-none">✦</div>
          <div className="absolute bottom-4 left-1/4 text-pink-200/30 text-base pointer-events-none select-none">✧</div>
          <div className="absolute top-1/2 right-1/3 text-amber-300/20 text-sm pointer-events-none select-none">★</div>

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 w-full">
            {/* Left Content Area */}
            <div className="space-y-3 max-w-2xl">
              {/* Top Badges Row: Distinct separated tags */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/35 text-white text-[11px] font-black uppercase tracking-wider shadow-xs">
                  <span className="text-amber-300">⚔️</span> ĐẤU TRÍ TRỰC TUYẾN
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-950/30 backdrop-blur-md border border-pink-300/30 text-pink-100 text-xs font-bold shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Học sinh: <strong className="text-white font-extrabold">{currentUserName}</strong></span>
                </span>
              </div>

              {/* Title & Subtitle with high contrast hierarchy */}
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black font-heading tracking-tight text-white drop-shadow-sm flex items-center gap-3">
                  <span>Đấu Trường Tri Thức</span>
                  <span className="text-xl sm:text-2xl animate-bounce">🏆</span>
                </h1>
                <p className="text-pink-100 text-xs sm:text-sm mt-1.5 leading-relaxed font-medium">
                  Thi đấu tốc độ, leo bảng vinh danh và nhận vô số phần thưởng Xu & EXP giá trị!
                </p>
              </div>
            </div>

            {/* Right Mascot / Trophy 3D Stage (Takes ~1/4 width) */}
            <div className="hidden sm:flex items-center justify-center relative shrink-0">
              {/* Outer Glowing Stage Circle */}
              <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-3xl bg-gradient-to-tr from-white/10 via-white/25 to-pink-300/30 backdrop-blur-md border border-white/40 shadow-2xl flex items-center justify-center relative transform hover:scale-105 transition-transform duration-300 group">
                
                {/* 3D Trophy / Mascot Centerpiece */}
                <div className="relative flex flex-col items-center justify-center">
                  <Trophy className="w-12 h-12 lg:w-14 lg:h-14 text-amber-300 drop-shadow-[0_6px_16px_rgba(245,158,11,0.6)] animate-pulse" />
                  
                  {/* Floating Micro Badges */}
                  <span className="absolute -top-3.5 -right-3.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 font-black text-[9px] shadow-md border border-amber-100 tracking-wider">
                    TOP 1 👑
                  </span>
                  
                  <span className="absolute -bottom-3 px-2 py-0.5 rounded-full bg-purple-900/90 text-amber-300 font-black text-[9px] shadow-md border border-purple-400/50 backdrop-blur-xs whitespace-nowrap">
                    +50 EXP ⚡
                  </span>
                </div>
              </div>
            </div>

            {activeGame && gameMode !== 'lobby' && (
              <button
                onClick={() => {
                  setGameMode('lobby');
                  setActiveGame(null);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-purple-900 hover:bg-pink-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <ArrowLeft className="w-4 h-4" /> Quay lại danh sách phòng
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                🎮 Tương Tác Trực Tiếp
              </span>
              <span className="text-xs text-slate-400">• Đấu trí & Thưởng điểm</span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mt-1 font-heading">
              Trò Chơi Học Tập AI & Đấu Trường Tri Thức
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rung Chuông Vàng, Thẻ Ghi Nhớ Flashcards 3D & Đua Thuyền Vượt Chướng Ngại Vật
            </p>
          </div>

          {activeGame && gameMode !== 'lobby' && (
            <button
              onClick={() => {
                setGameMode('lobby');
                setActiveGame(null);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Quay lại danh sách game
            </button>
          )}
        </div>
      )}

      {/* 4 STAT CARDS (Student Only) */}
      {gameMode === 'lobby' && userRole === 'student' && (
        <StatsSummaryRow
          items={[
            {
              id: 'arena-rooms',
              label: 'Phòng thi đấu',
              value: studentGameStats.totalRooms,
              icon: Trophy,
              colorScheme: 'purple',
            },
            {
              id: 'quizzi-games',
              label: 'Trò chơi Quizzi',
              value: studentGameStats.totalQuizzi,
              icon: Gamepad2,
              colorScheme: 'fuchsia',
            },
            {
              id: 'student-coins',
              label: 'Xu thưởng tích lũy',
              value: `${studentGameStats.coins} Xu`,
              icon: Sparkles,
              colorScheme: 'amber',
            },
            {
              id: 'student-level',
              label: 'Cấp độ học sinh',
              value: studentGameStats.levelStr,
              icon: Award,
              colorScheme: 'indigo',
            },
          ]}
        />
      )}

      {/* 2 Tabs Switcher (Student Only) */}
      {gameMode === 'lobby' && userRole === 'student' && (
        <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white px-6 pt-3 rounded-2xl shadow-xs">
          <button
            onClick={() => setActiveTab('games')}
            className={`pb-3.5 px-4 text-xs sm:text-sm font-black transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'games'
                ? 'border-fuchsia-600 text-fuchsia-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>⚔️</span>
            <span>Đấu Trường Trực Tuyến</span>
          </button>
          <button
            onClick={() => setActiveTab('store')}
            className={`pb-3.5 px-4 text-xs sm:text-sm font-black transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'store'
                ? 'border-fuchsia-600 text-fuchsia-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🎁</span>
            <span>Cửa Hàng & Vinh Danh</span>
          </button>
        </div>
      )}

      {/* TAB 2: STORE & HONORS */}
      {gameMode === 'lobby' && activeTab === 'store' && userRole === 'student' && (() => {
        const { studentClass, studentName } = getEffectiveStudentClassAndGrade();
        return (
          <StudentGameStoreTab currentUserName={currentUserName || studentName} studentClassName={studentClass} />
        );
      })()}

      {/* LOBBY: Game Cards (Tab 1) */}
      {gameMode === 'lobby' && activeTab === 'games' && userRole === 'student' && (() => {
        const { studentClass, studentGrade, studentName } = getEffectiveStudentClassAndGrade();
        const customRooms = normalizedGames.filter(g => g.id !== 'game-1' && g.id !== 'game-2' && g.id !== 'game-3' && g.id !== 'game-4');
        const studentRooms = customRooms.filter(room => {
          if (!isTargetingStudent(room.classInfo, room.grade, studentClass, studentGrade)) return false;
          if (studentRoomSubjectFilter !== 'Tất cả các môn' && room.subject && room.subject.toLowerCase() !== studentRoomSubjectFilter.toLowerCase()) return false;
          return true;
        });

        const filteredQuizzi = normalizedQuizziGames.filter(q => {
          if (deletedCards.includes(q.id)) return false;
          if (!isTargetingStudent(q.classInfo, q.grade, studentClass, studentGrade)) return false;
          if (studentQuizSubjectFilter !== 'Tất cả các môn' && q.subjectLabel !== studentQuizSubjectFilter && q.subject !== studentQuizSubjectFilter) return false;
          if (studentQuizSearchQuery && !q.title.toLowerCase().includes(studentQuizSearchQuery.toLowerCase())) return false;
          return true;
        });

        const profile = getStudentGameProfile(resolveAuthenticStudentId(currentUserId), currentUserName || studentName);
        const leaderboardStudents = [
          { rank: 1, name: currentUserName || studentName || 'Học sinh', score: profile.coins > 0 ? profile.coins : 0, avatar: profile.avatar || '🌟', isMe: true }
        ];

        return (
          <div className="space-y-6">
            {/* 3D Game Mode Selector & AI Quick-Play Generator */}
            <GameLobbyShowcase
              userRole={userRole}
              defaultGrade={studentGrade}
              defaultClassInfo={studentClass}
              selectedMode={selectedLobbyMode}
              onSelectMode={setSelectedLobbyMode}
              onLaunchAiGame={handleLaunchAiGame}
              topicInputRef={aiTopicInputRef}
              sectionRef={aiGeneratorSectionRef}
            />

            {/* Main Grid: Rooms List (Left 2 cols) & Leaderboard Sidebar (Right 1 col) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: DANH SÁCH PHÒNG THI ĐẤU */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-amber-200">
                        🏆
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">DANH SÁCH PHÒNG THI ĐẤU</h3>
                        <p className="text-xs text-slate-500 font-bold mt-0.5">
                          Hiển thị {studentRooms.length} phòng cho lớp {studentClass}
                        </p>
                      </div>
                    </div>

                    {/* Simplified Filter: Only Subject Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Môn:</span>
                      <select
                        value={studentRoomSubjectFilter}
                        onChange={(e) => setStudentRoomSubjectFilter(e.target.value)}
                        className="bg-transparent appearance-none pr-4 outline-none cursor-pointer font-bold text-indigo-700"
                      >
                        <option value="Tất cả các môn">Tất cả các môn</option>
                        {SUBJECTS.map((sub) => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Rooms List */}
                <div className="divide-y divide-slate-100 flex-1 overflow-auto max-h-[450px]">
                  {studentRooms.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center">
                      <Gamepad2 className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-sm font-bold text-slate-500">Chưa có phòng thi đấu trực tuyến nào cho lớp {studentClass}</p>
                      <p className="text-xs text-slate-400 mt-1">Hãy quay lại khi Thầy/Cô mở phòng thi đấu mới nhé!</p>
                    </div>
                  ) : (
                    studentRooms.slice((studentRoomsCurrentPage - 1) * studentRoomsPageSize, (studentRoomsCurrentPage - 1) * studentRoomsPageSize + studentRoomsPageSize).map((room) => {
                      const isOpen = room.status !== 'closed';
                      return (
                        <div key={room.id} className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0 mt-0.5">
                              🎮
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-slate-900 leading-snug">{room.title}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">{room.description || `${room.questions?.length || 0} câu hỏi trắc nghiệm`}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-black">
                                  {room.subject || 'Môn học'}
                                </span>
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                                  Lớp: {room.classInfo || studentClass}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end">
                            {isOpen ? (
                              <button
                                onClick={() => handleStartGame(room)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer"
                              >
                                <span>Vào phòng</span> <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="px-3 py-2 bg-slate-100 text-slate-400 font-bold text-xs rounded-xl border border-slate-200">
                                🔒 Chưa đến giờ chơi trực tiếp
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {studentRooms.length > 0 && (
                  <div className="p-4 bg-white border-t border-slate-100">
                    <PaginationControl
                      currentPage={studentRoomsCurrentPage}
                      pageSize={studentRoomsPageSize}
                      totalItems={studentRooms.length}
                      onPageChange={setStudentRoomsCurrentPage}
                      onPageSizeChange={setStudentRoomsPageSize}
                      pageSizeOptions={[10, 20, 50]}
                      itemLabel="phòng"
                      className="border-t-0 pt-0"
                    />
                  </div>
                )}
              </div>

              {/* Right Column: BẢNG XẾP HẠNG (Fixed / Sidebar) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-fit">
                <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-4 text-white flex items-center gap-3">
                  <Trophy className="w-5 h-5 fill-white shrink-0" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider">BẢNG XẾP HẠNG</h3>
                    <p className="text-[10px] text-amber-100 font-medium">Xếp hạng thời gian thực - {studentClass}</p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {leaderboardStudents.map((st) => (
                    <div
                      key={st.rank}
                      className={`p-3.5 flex items-center justify-between transition-colors ${
                        st.isMe ? 'bg-indigo-50/80 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                            st.rank === 1
                              ? 'bg-amber-400 text-amber-950 shadow-sm'
                              : st.rank === 2
                              ? 'bg-slate-200 text-slate-800'
                              : st.rank === 3
                              ? 'bg-amber-700/20 text-amber-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {st.rank}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 shadow-2xs">
                            <img
                              src={getStudentAvatarSource(st.avatar, st.name)}
                              alt={st.name}
                              className="w-full h-full object-cover rounded-full"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = DEFAULT_ANIMAL_AVATAR;
                              }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${st.isMe ? 'text-indigo-900 font-black' : 'text-slate-800'}`}>
                            {st.name} {st.isMe && '(Bạn)'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black font-mono text-amber-600">{st.score}</span>
                        <span className="text-[10px] text-slate-400 font-bold">điểm</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Khối "TRÒ CHƠI QUIZZI / KHO TRÒ CHƠI" */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">TRÒ CHƠI QUIZZI / KHO TRÒ CHƠI</h3>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Kho trò chơi học tập tương tác do Thầy/Cô thiết kế</p>
                </div>

                {/* Filters & Search for Quizzi */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Môn:</span>
                    <select
                      value={studentQuizSubjectFilter}
                      onChange={(e) => setStudentQuizSubjectFilter(e.target.value)}
                      className="bg-transparent appearance-none pr-4 outline-none cursor-pointer font-bold text-indigo-700"
                    >
                      <option value="Tất cả các môn">Tất cả các môn</option>
                      {SUBJECTS.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Tìm tên trò chơi..."
                      value={studentQuizSearchQuery}
                      onChange={(e) => setStudentQuizSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 w-48 sm:w-60"
                    />
                  </div>
                </div>
              </div>

              {/* Grid of Quizzi Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {filteredQuizzi.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-slate-400 text-xs font-bold">
                    Không tìm thấy trò chơi nào phù hợp.
                  </div>
                ) : (
                  filteredQuizzi.slice((studentQuizCurrentPage - 1) * studentQuizPageSize, (studentQuizCurrentPage - 1) * studentQuizPageSize + studentQuizPageSize).map((game) => (
                    <div key={game.id} className="bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-[10px] font-black uppercase">
                            {game.subjectLabel || game.subject}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                            Phù hợp {studentClass}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 leading-snug">{game.title}</h4>
                        <p className="text-xs text-slate-600 leading-relaxed">{game.desc}</p>
                      </div>

                      <button
                        onClick={() => {
                          const url = game.embedUrl || (game as any).gameUrl || (game as any).externalLink || (game as any).url;
                          console.log("Quizzi game URL clicked:", game.title, url, game);
                          if (url && typeof url === 'string' && url.trim().length > 0) {
                            let finalUrl = url.trim();
                            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                              finalUrl = 'https://' + finalUrl;
                            }
                            setEmbeddedGameUrl(finalUrl);
                            setEmbeddedGameTitle(game.title);
                          } else {
                            setToastMessage("⚠️ Trò chơi này chưa có đường dẫn trực tuyến hợp lệ");
                            setTimeout(() => setToastMessage(null), 3000);
                          }
                        }}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> Chơi luyện tập ngay
                      </button>
                    </div>
                  ))
                )}
              </div>

              {filteredQuizzi.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <PaginationControl
                    currentPage={studentQuizCurrentPage}
                    pageSize={studentQuizPageSize}
                    totalItems={filteredQuizzi.length}
                    onPageChange={setStudentQuizCurrentPage}
                    onPageSizeChange={setStudentQuizPageSize}
                    pageSizeOptions={[10, 20, 50]}
                    itemLabel="trò chơi"
                    className="border-t-0 pt-0"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* LOBBY: Teacher View (Tab 1) */}
      {gameMode === 'lobby' && activeTab === 'games' && userRole !== 'student' && (
        <div className="space-y-5">
          {/* THANH CHỌN KHỐI TRỰC QUAN TỪ KHỐI 1 ĐẾN KHỐI 5 */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                    Chọn Khối Lớp Trò Chơi Học Tập (Khối 1 – Khối 5)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bấm vào từng thẻ khối để lọc hoặc điều hướng sang không gian trò chơi chuyên biệt • Khối 3 &amp; Khối 4 tích hợp SSO trực tiếp
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {(filterGrade === 'Khối 3' || filterGrade === 'Khối 4') && (
                  <button
                    type="button"
                    onClick={() => setShowDedicatedGradeIframe((prev) => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Monitor className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      {showDedicatedGradeIframe
                        ? `Xem kho trò chơi ${filterGrade} tại App Mẹ`
                        : `Mở khung nhúng App ${filterGrade}`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsGrade3ConfigModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/90 text-[11px] font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  title="Cấu hình liên kết cơ sở dữ liệu riêng của ứng dụng Khối 3"
                >
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cấu hình CSDL Khối 3</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {GRADE_SELECTOR_CARDS.map((card) => {
                const isSelected =
                  filterGrade.trim().toLowerCase() === card.gradeValue.trim().toLowerCase() ||
                  (card.key === 'all' &&
                    (filterGrade === 'Tất cả khối' || filterGrade === 'Tất cả các khối'));

                const cardClassName = `relative rounded-2xl p-3.5 transition-all duration-150 cursor-pointer select-none flex flex-col justify-between min-h-[112px] border no-underline ${
                  isSelected
                    ? `bg-gradient-to-br ${card.activeGradient} text-white border-transparent ${card.activeShadow} -translate-y-0.5`
                    : `bg-white text-slate-800 ${card.inactiveBorder}`
                }`;

                return (
                  <div
                    key={card.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectGradeCard(card.gradeValue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectGradeCard(card.gradeValue);
                      }
                    }}
                    className={cardClassName}
                    title={
                      card.isDedicatedGrade3
                        ? 'Bấm để kết nối SSO và nhúng trực tiếp Trò chơi Học tập Khối 3 (https://dayhockhoi3.vercel.app)'
                        : card.isDedicatedGrade4
                        ? 'Bấm để kết nối SSO và nhúng trực tiếp Trò chơi Học tập Khối 4 (https://dayhockhoi4-eight.vercel.app/)'
                        : `Chọn không gian trò chơi ${card.label}`
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 shadow-2xs ${
                          isSelected ? 'bg-white/20 text-white' : card.iconBg
                        }`}
                      >
                        {card.key === 'all' ? (
                          <LayoutGrid className="w-4 h-4" />
                        ) : (
                          <span>K{card.gradeValue.replace(/[^0-9]/g, '')}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {card.isDedicatedGrade3 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsGrade3ConfigModalOpen(true);
                            }}
                            className={`p-1 rounded-lg transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-white/20 hover:bg-white/30 text-white'
                                : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                            }`}
                            title="Mở cấu hình liên kết dữ liệu chuyên biệt Khối 3"
                          >
                            <Database className="w-3 h-3" />
                          </button>
                        )}
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg whitespace-nowrap ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : `${card.badgeBg} ${card.badgeText}`
                          }`}
                        >
                          {card.shortTag}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <div className="flex items-baseline justify-between gap-1">
                        <span
                          className={`text-sm sm:text-base font-extrabold tracking-tight ${
                            isSelected ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {card.label}
                        </span>
                      </div>

                      <p
                        className={`text-[11px] mt-0.5 truncate ${
                          isSelected ? 'text-white/85 font-medium' : 'text-slate-500'
                        }`}
                      >
                        {card.subtitle}
                      </p>
                    </div>

                    <div
                      className={`mt-2 pt-1.5 border-t flex items-center justify-between text-[10px] font-semibold tabular-nums ${
                        isSelected
                          ? 'border-white/15 text-white/90'
                          : 'border-slate-100 text-slate-400'
                      }`}
                    >
                      {card.isDedicatedGrade3 ? (
                        <>
                          <span
                            className={`flex items-center gap-1 font-bold ${
                              isSelected ? 'text-emerald-100' : 'text-emerald-700'
                            }`}
                          >
                            <Monitor className="w-3 h-3" />
                            <span>Nhúng trực tiếp K3</span>
                          </span>
                          <span className="font-mono">{grade3LatencyMs}ms</span>
                        </>
                      ) : card.isDedicatedGrade4 ? (
                        <>
                          <span
                            className={`flex items-center gap-1 font-bold ${
                              isSelected ? 'text-sky-100' : 'text-sky-700'
                            }`}
                          >
                            <Monitor className="w-3 h-3" />
                            <span>Nhúng trực tiếp K4</span>
                          </span>
                          <span className="font-mono">{grade3LatencyMs}ms</span>
                        </>
                      ) : (
                        <>
                          <span>Đấu trường AI</span>
                          <span>GDPT 2018</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KHUNG NHÚNG TRỰC TIẾP GIAO DIỆN TRÒ CHƠI HỌC TẬP KHỐI 3 NGAY TRONG APP MẸ */}
          {filterGrade === 'Khối 3' && showDedicatedGradeIframe && (
            <div className="bg-white rounded-3xl border border-emerald-200/90 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-200">
              <div className="bg-gradient-to-r from-emerald-50/95 via-teal-50/80 to-cyan-50/85 border-b border-emerald-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-extrabold text-emerald-950 truncate">
                    Đang hiển thị trực tiếp: Trò Chơi Học Tập Chuyên biệt Khối 3 ({grade3DbConfig.externalAppUrl || DEFAULT_GRADE3_APP_URL})
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white/95 px-2.5 py-0.5 rounded-lg border border-emerald-200 shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>SSO: {gradeSsoPayload.name}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsGrade3IframeLoading(true);
                      setGrade3IframeKey((prev) => prev + 1);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-emerald-600 ${
                        isGrade3IframeLoading ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Tải lại khung K3</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsGrade3ConfigModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Cấu hình</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDedicatedGradeIframe(false)}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Xem kho trò chơi tại App Mẹ</span>
                  </button>
                </div>
              </div>

              <div
                className="relative w-full bg-slate-50"
                style={{ height: 'calc(100vh - 200px)', minHeight: '760px' }}
              >
                {isGrade3IframeLoading && (
                  <div className="absolute inset-0 z-10 bg-white/85 backdrop-blur-xs flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-xs">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-extrabold text-slate-800">
                        Đang tải giao diện Trò Chơi Học Tập Khối 3 ngay trong ứng dụng...
                      </p>
                      <p className="text-xs text-slate-500">
                        Tự động đồng bộ phiên đăng nhập SSO của {gradeSsoPayload.name}
                      </p>
                    </div>
                  </div>
                )}

                <iframe
                  ref={grade3IframeRef}
                  key={`src-games-k3-${grade3IframeKey}-${grade3EmbeddedUrlWithSso}`}
                  src={grade3EmbeddedUrlWithSso}
                  onLoad={handleGrade3IframeLoad}
                  title="Giao diện Trò Chơi Học Tập Chuyên biệt Khối 3"
                  className="w-full h-full border-0 bg-white"
                  allow="fullscreen; clipboard-read; clipboard-write; microphone; camera; autoplay"
                />
              </div>
            </div>
          )}

          {/* KHUNG NHÚNG TRỰC TIẾP GIAO DIỆN TRÒ CHƠI HỌC TẬP KHỐI 4 NGAY TRONG APP MẸ */}
          {filterGrade === 'Khối 4' && showDedicatedGradeIframe && (
            <div className="bg-white rounded-3xl border border-sky-200/90 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-200">
              <div className="bg-gradient-to-r from-sky-50/95 via-blue-50/80 to-indigo-50/85 border-b border-sky-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse shrink-0" />
                  <span className="font-extrabold text-sky-950 truncate">
                    Đang hiển thị trực tiếp: Trò Chơi Học Tập Chuyên biệt Khối 4 ({DEFAULT_GRADE4_APP_URL})
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-white/95 px-2.5 py-0.5 rounded-lg border border-sky-200 shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                    <span>SSO: {gradeSsoPayload.name}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsGrade4IframeLoading(true);
                      setGrade4IframeKey((prev) => prev + 1);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-sky-50 text-sky-800 border border-sky-300 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-sky-600 ${
                        isGrade4IframeLoading ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Tải lại khung K4</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDedicatedGradeIframe(false)}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Xem kho trò chơi tại App Mẹ</span>
                  </button>
                </div>
              </div>

              <div
                className="relative w-full bg-slate-50"
                style={{ height: 'calc(100vh - 200px)', minHeight: '760px' }}
              >
                {isGrade4IframeLoading && (
                  <div className="absolute inset-0 z-10 bg-white/85 backdrop-blur-xs flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shadow-xs">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-extrabold text-slate-800">
                        Đang tải giao diện Trò Chơi Học Tập Khối 4 ngay trong ứng dụng...
                      </p>
                      <p className="text-xs text-slate-500">
                        Tự động đồng bộ phiên đăng nhập SSO của {gradeSsoPayload.name}
                      </p>
                    </div>
                  </div>
                )}

                <iframe
                  ref={grade4IframeRef}
                  key={`src-games-k4-${grade4IframeKey}-${grade4EmbeddedUrlWithSso}`}
                  src={grade4EmbeddedUrlWithSso}
                  onLoad={handleGrade4IframeLoad}
                  title="Giao diện Trò Chơi Học Tập Chuyên biệt Khối 4"
                  className="w-full h-full border-0 bg-white"
                  allow="fullscreen; clipboard-read; clipboard-write; microphone; camera; autoplay"
                />
              </div>
            </div>
          )}

          {/* Resource Ownership Tabs for Teachers */}
          {(userRole as string) !== 'student' && (
            <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
              <button
                onClick={() => setResourceTab('all')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  resourceTab === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                📚 Tất cả trò chơi
              </button>
              <button
                onClick={() => setResourceTab('mine')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  resourceTab === 'mine'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                👤 Trò chơi của tôi
              </button>
              <button
                onClick={() => setResourceTab('colleagues')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  resourceTab === 'colleagues'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                🤝 Trò chơi của đồng nghiệp (Được chia sẻ)
              </button>
            </div>
          )}

          {/* 3D Mode Selector & AI Quick-Play Generator for Teachers */}
          <GameLobbyShowcase
            userRole={userRole}
            defaultGrade={
              filterGrade !== 'Tất cả các khối' && filterGrade !== 'Tất cả khối'
                ? filterGrade
                : 'Khối 3'
            }
            defaultClassInfo={filterClass !== 'Tất cả các lớp' ? filterClass : 'Lớp 3A'}
            selectedMode={selectedLobbyMode}
            onSelectMode={setSelectedLobbyMode}
            onLaunchAiGame={handleLaunchAiGame}
            topicInputRef={aiTopicInputRef}
            sectionRef={aiGeneratorSectionRef}
          />

          {/* Main Content Area */}
          <div className="flex flex-col gap-6">
            {/* Left Column: DANH SÁCH PHÒNG THI ĐẤU */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-[350px]">
              <div className="p-5 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Trophy className="w-6 h-6 text-amber-500 mt-1 shrink-0" />
                    <div>
                      <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">DANH SÁCH PHÒNG THI ĐẤU</h3>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Quản lý các phòng đấu trường trực tuyến của học sinh</p>
                    </div>
                  </div>
                  {(userRole as string) !== 'student' && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setGameExportModalState({
                            isOpen: true,
                            games: filteredTeacherRooms,
                            titleContext: 'Danh sách Phòng thi đấu đang lọc',
                          })
                        }
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors shrink-0 cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Xuất danh mục &amp; Mã QR
                      </button>

                      <button 
                        onClick={onOpenUseQuestionBankModal}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> + Tạo trò chơi từ ngân hàng câu hỏi
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Filters (Đồng bộ Khối từ thanh chọn khối phía trên, chỉ giữ lọc Lớp & Môn học gọn gàng) */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full text-xs font-extrabold text-indigo-700">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{filterGrade}</span>
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-600">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="bg-transparent appearance-none pr-4 outline-none cursor-pointer">
                        <option value="Tất cả các lớp">Tất cả các lớp</option>
                        {getClassesForGrade(filterGrade).map((cls) => (
                          <option key={cls.id || cls.name} value={cls.name}>{cls.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 absolute right-3 pointer-events-none" />
                    </div>
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-600">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="bg-transparent appearance-none pr-4 outline-none cursor-pointer">
                        <option value="Tất cả các môn">Tất cả các môn</option>
                        {SUBJECTS.map((subject) => (
                          <option key={subject} value={subject}>{subject}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 absolute right-3 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                {(() => {
                  const filteredRooms = filteredTeacherRooms;

                  if (filteredRooms.length === 0) {
                    return (
                      <div className="p-12 flex flex-col items-center justify-center text-center">
                        <Gamepad2 className="w-12 h-12 text-slate-200 mb-3" />
                        <p className="text-sm font-bold text-slate-400 mb-2">Chưa có phòng thi đấu nào khớp bộ lọc</p>
                        <button 
                          onClick={onOpenUseQuestionBankModal}
                          className="text-sm font-bold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
                        >
                          Tạo phòng mới ngay
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-slate-100">
                      {filteredRooms.slice((roomsCurrentPage - 1) * roomsPageSize, (roomsCurrentPage - 1) * roomsPageSize + roomsPageSize).map(room => {
                        const roomPerms = getContentPermissions(room, accessContext);
                        return (
                        <div key={room.id} className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-start sm:items-center gap-3.5">
                            <button className="text-amber-400 hover:text-amber-500 transition-colors mt-0.5 sm:mt-0 shrink-0">
                              <Trophy className="w-5 h-5 fill-amber-400" />
                            </button>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-black text-slate-900 leading-snug">{room.title}</h4>
                                {roomPerms.isShared && roomPerms.sharedByBadge && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    🤝 {roomPerms.sharedByBadge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{room.description || `${room.questions.length} câu hỏi`}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-black uppercase tracking-wider">
                              {room.lop || room.classInfo || room.khoi || room.grade || 'Lớp 3A'}
                            </span>

                            <span className="text-xs font-bold text-slate-600 max-w-[200px] truncate hidden md:inline">
                              {room.subject}
                            </span>

                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${room.status === 'closed' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {room.status === 'closed' ? '🔴 ĐÓNG' : '🟢 MỞ'}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {(userRole as string) === 'student' ? (
                                <>
                                  <button
                                    onClick={() => setSelectedLeaderboardGame(room)}
                                    title="Xem bảng xếp hạng"
                                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                                  >
                                    <Trophy className="w-3.5 h-3.5 fill-amber-500" /> BXH
                                  </button>
                                  {room.status === 'closed' ? (
                                    <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs">
                                      🔒 Đã đóng
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleStartGame(room)}
                                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-200 transition-all cursor-pointer"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-current" /> Vào đấu trường
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  {/* 1. Nút khóa/mở - Chủ sở hữu, admin hoặc người có quyền giao/sửa */}
                                  {roomPerms.canAssign || roomPerms.canEdit ? (
                                    <button
                                      onClick={() => {
                                        const newStatus = room.status === 'closed' ? 'open' : 'closed';
                                        if (onUpdateGame) onUpdateGame({ ...room, status: newStatus });
                                      }}
                                      title={room.status === 'closed' ? 'Đang ĐÓNG - Bấm để MỞ' : 'Đang MỞ - Bấm để ĐÓNG'}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-colors cursor-pointer ${
                                        room.status === 'closed'
                                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      }`}
                                    >
                                      {room.status === 'closed' ? '🔒 ĐÓNG' : '🔓 MỞ'}
                                    </button>
                                  ) : (
                                    <span
                                      title={room.status === 'closed' ? 'Phòng đang đóng' : 'Phòng đang mở'}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-default select-none ${
                                        room.status === 'closed'
                                          ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                          : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                      }`}
                                    >
                                      {room.status === 'closed' ? '🔒 ĐÓNG' : '🔓 MỞ'}
                                    </span>
                                  )}

                                  {/* 2. Nút bút sửa (✏️) - theo quyền canEdit */}
                                  {roomPerms.canEdit && (
                                    <button
                                      onClick={() => {
                                        if (onOpenEditGameRoom) onOpenEditGameRoom(room);
                                      }}
                                      title="Chỉnh sửa cấu hình phòng"
                                      className="w-8 h-8 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Nút chia sẻ phòng thi đấu - CHỈ chủ sở hữu/admin */}
                                  {roomPerms.canShare && (
                                    <button
                                      onClick={() => {
                                        setSharingGame({
                                          ...room,
                                          _shareCollection: 'games'
                                        });
                                      }}
                                      title="Chia sẻ phòng thi đấu"
                                      className="w-8 h-8 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-600 flex items-center justify-center transition-colors cursor-pointer"
                                    >
                                      <Share2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Nút biểu tượng Mã QR / Tải phiếu của riêng phòng thi đấu */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setGameExportModalState({
                                        isOpen: true,
                                        games: [room],
                                        titleContext: `Phiếu phòng thi đấu: ${room.title}`,
                                      });
                                    }}
                                    title="Mã QR / Tải phiếu"
                                    className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <QrCode className="w-3.5 h-3.5" />
                                  </button>

                                  {/* 3. Nút chiếc cúp (🏆) - xem bảng xếp hạng vinh danh / theo dõi */}
                                  <button
                                    onClick={() => {
                                      setSelectedLeaderboardGame(room);
                                    }}
                                    title="Xem bảng xếp hạng vinh danh"
                                    className="w-8 h-8 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <Trophy className="w-3.5 h-3.5 fill-amber-500" />
                                  </button>

                                  {/* 4. Nút xóa (🗑️) - CHỈ chủ sở hữu/admin hoặc được phép xóa */}
                                  {roomPerms.canDelete && (
                                    <button
                                      onClick={() => {
                                        setRoomToDelete(room);
                                      }}
                                      title="Xóa phòng thi đấu"
                                      className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const filteredRooms = filteredTeacherRooms;
                if (filteredRooms.length === 0) return null;
                return (
                  <div className="p-4 bg-white border-t border-slate-100">
                    <PaginationControl
                      currentPage={roomsCurrentPage}
                      pageSize={roomsPageSize}
                      totalItems={filteredRooms.length}
                      onPageChange={setRoomsCurrentPage}
                      onPageSizeChange={setRoomsPageSize}
                      pageSizeOptions={[10, 20, 50]}
                      itemLabel="phòng"
                      className="border-t-0 pt-0"
                    />
                  </div>
                );
              })()}
            </div>

            {/* Right Column: DANH SÁCH TRÒ CHƠI QUIZZI */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-[350px]">
              <div className="p-5 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Zap className="w-6 h-6 text-amber-500 mt-1 shrink-0 fill-amber-500" />
                    <div>
                      <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">DANH SÁCH TRÒ CHƠI QUIZZI</h3>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Thư viện các trò chơi tương tác cá nhân của giáo viên</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(userRole as string) !== 'student' && (
                      <button
                        type="button"
                        onClick={() => {
                          const visibleQuizziGames = filteredGames.filter(game => !deletedCards.includes(game.id));
                          setGameExportModalState({
                            isOpen: true,
                            games: visibleQuizziGames,
                            titleContext: 'Danh sách Trò chơi Quizzi đang lọc',
                          });
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors shrink-0 cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Xuất danh mục &amp; Mã QR
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setEditingQuizziGame(null);
                        setShowCreateQuizziModal(true);
                      }} 
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors shrink-0 cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Tạo trò chơi Quizzi
                    </button>
                  </div>
                </div>

                {/* Filters container */}
                <div className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-4 bg-white">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-500">Đang lọc:</span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold">
                      {filterGrade}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-500">Lớp:</span>
                    <div className="relative">
                      <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="bg-transparent appearance-none pr-4 outline-none cursor-pointer">
                        <option value="Tất cả các lớp">Tất cả các lớp</option>
                        {getClassesForGrade(filterGrade).map((cls) => (
                          <option key={cls.id || cls.name} value={cls.name}>{cls.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-500">Môn học:</span>
                    <div className="relative flex-1 sm:flex-none">
                      <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="bg-transparent appearance-none pr-4 outline-none cursor-pointer">
<option value="Tất cả các môn">Tất cả các môn</option>
{SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>{subject}</option>
          ))}
</select>
                      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-500">Loại:</span>
                    <div className="relative flex-1 sm:flex-none">
                      <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 appearance-none pr-6 outline-none cursor-pointer">
                        <option value="Tất cả Loại">Tất cả Loại</option>
                        <option value="Trắc nghiệm">Trắc nghiệm</option>
                        <option value="Tương tác">Tương tác</option>
                        <option value="Nhẩm toán">Nhẩm toán</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 flex-1 overflow-auto bg-slate-50/50 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 content-start">

                {(() => {
                  const visibleGames = filteredGames.filter(game => !deletedCards.includes(game.id));
                  if (visibleGames.length === 0) {
                    return (
                      <div className="col-span-full flex flex-col items-center justify-center py-12 text-center text-slate-500">
                        <Search className="w-12 h-12 text-slate-300 mb-3" />
                        <p className="text-sm font-bold">Không tìm thấy trò chơi nào khớp bộ lọc</p>
                      </div>
                    );
                  }
                  const paginatedGames = visibleGames.slice((gamesCurrentPage - 1) * gamesPageSize, (gamesCurrentPage - 1) * gamesPageSize + gamesPageSize);
                  return paginatedGames.map(game => {
                    const IconComponent = game.icon === 'Laptop' ? Laptop : game.icon === 'BookOpen' ? BookOpen : Layers;
                    const qPerms = getContentPermissions(game, accessContext);
                    return (
                      <div key={game.id} className={`bg-white border border-${game.color}-100 rounded-xl p-4 shadow-sm hover:shadow transition-shadow relative flex flex-col h-full`}>
                        <div className="absolute top-3.5 right-3.5 flex items-center gap-1">
                          {(userRole as string) !== 'student' && (
                            <button
                              type="button"
                              onClick={() => {
                                setGameExportModalState({
                                  isOpen: true,
                                  games: [game],
                                  titleContext: `Phiếu trò chơi Quizzi: ${game.title}`,
                                });
                              }}
                              title="Mã QR / Tải phiếu"
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                          )}
                          {qPerms.canShare && (
                            <button
                              onClick={() => {
                                setSharingGame({
                                  ...game,
                                  id: String(game.id),
                                  _shareCollection: 'quizzi_games'
                                });
                              }}
                              title="Chia sẻ trò chơi"
                              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          )}
                          {qPerms.canEdit && (
                            <button 
                              onClick={() => {
                                setEditingQuizziGame(game);
                                setShowCreateQuizziModal(true);
                              }} 
                              title="Chỉnh sửa trò chơi"
                              className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {qPerms.canDelete && (
                            <button 
                              onClick={() => setGameToDelete({ id: game.id, title: game.title })} 
                              title="Xóa trò chơi"
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-1.5 mb-3 pr-28">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-${game.color}-100 text-${game.color}-700 rounded-full text-[10px] font-black uppercase w-fit`}>
                            <IconComponent className="w-3 h-3" /> {game.subject}
                          </div>
                          {qPerms.isShared && qPerms.sharedByBadge && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              🤝 {qPerms.sharedByBadge}
                            </span>
                          )}
                        </div>
                        
                        <h4 className="text-sm font-bold text-slate-800 mb-2 pr-4 leading-tight">{game.title}</h4>
                        
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed pr-2 flex-1">
                          {game.desc}
                        </p>
                        
                        <div className="flex items-center gap-2 mb-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded text-[10px] font-bold">
                            <span className="text-base leading-none -mt-0.5">🏫</span> {game.grade}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[10px] font-bold">
                            <span className="text-base leading-none -mt-0.5">📕</span> Lớp: {game.classInfo === 'Tất cả các lớp' ? 'Tất cả' : game.classInfo.replace('Lớp ', '')}
                          </span>
                        </div>

                        <div className="space-y-2 mt-auto">
                          <button
                            onClick={() => {
                              const url = game.embedUrl || (game as any).gameUrl || (game as any).externalLink || (game as any).url;
                              console.log("Quizzi teacher preview URL clicked:", game.title, url, game);
                              if (url && typeof url === 'string' && url.trim().length > 0) {
                                let finalUrl = url.trim();
                                if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                                  finalUrl = 'https://' + finalUrl;
                                }
                                setEmbeddedGameUrl(finalUrl);
                                setEmbeddedGameTitle(game.title);
                              } else {
                                setToastMessage("⚠️ Trò chơi này chưa có đường dẫn trực tuyến hợp lệ");
                                setTimeout(() => setToastMessage(null), 3000);
                              }
                            }}
                            className={`w-full flex items-center justify-center gap-2 py-2 bg-${game.color}-600 hover:bg-${game.color}-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" /> Trải nghiệm <Gamepad2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}

              </div>

              {(() => {
                const visibleGames = filteredGames.filter(game => !deletedCards.includes(game.id));
                if (visibleGames.length === 0) return null;
                return (
                  <div className="p-4 bg-white border-t border-slate-100">
                    <PaginationControl
                      currentPage={gamesCurrentPage}
                      pageSize={gamesPageSize}
                      totalItems={visibleGames.length}
                      onPageChange={setGamesCurrentPage}
                      onPageSizeChange={setGamesPageSize}
                      pageSizeOptions={[10, 20, 50]}
                      itemLabel="trò chơi"
                      className="border-t-0 pt-0"
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* COUNTDOWN START SCREEN */}
      {gameMode === 'countdown' && activeGame && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 rounded-3xl p-8 sm:p-12 w-full max-w-lg text-center shadow-2xl border-2 border-amber-400/50 shadow-[0_0_50px_rgba(245,158,11,0.3)] text-white flex flex-col items-center justify-center space-y-6 relative overflow-hidden">
            <div className="absolute -top-16 -left-16 w-56 h-56 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-2 relative z-10">
              <span className="text-xs font-black uppercase tracking-widest text-amber-300 bg-amber-400/20 px-3 py-1 rounded-full border border-amber-300/30">
                🚀 ĐẤU TRƯỜNG TRỰC TUYẾN
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold font-heading text-white mt-2">
                {activeGame.title}
              </h2>
            </div>

            {/* Central Glowing Circular Badge */}
            <div className="py-6 relative z-10">
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-amber-400/20 border-4 border-amber-400/60 shadow-[0_0_30px_rgba(245,158,11,0.5)] flex items-center justify-center mx-auto animate-pulse">
                <span className="text-5xl sm:text-6xl font-black font-heading text-amber-300 drop-shadow-lg">
                  {countdownStep === 0 ? 'BẮT ĐẦU!' : countdownStep}
                </span>
              </div>
            </div>

            {/* Motivational Quote & Status */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 w-full max-w-sm space-y-1.5 relative z-10">
              <div className="text-xs sm:text-sm font-extrabold text-amber-300 flex items-center justify-center gap-1.5">
                <span>🎯</span>
                <span>{countdownStep === 0 ? 'BẮT ĐẦU THI ĐẤU!' : countdownStep === 1 ? 'Đấu trường chuẩn bị mở!' : countdownStep === 2 ? 'Chuẩn bị trả lời nhanh!' : 'Tập trung cao độ!'}</span>
              </div>
              <p className="text-xs text-amber-200/80 font-medium">
                {motivationalQuote}
              </p>
            </div>

            {/* Indicator Dots at the bottom */}
            <div className="flex items-center justify-center gap-2 pt-2 relative z-10">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            </div>
          </div>
        </div>
      )}

      {/* PLAYING MODE: FLASHCARDS */}
      {gameMode === 'playing' && activeGame && activeGame.type === 'flashcards' && (
        <GameFlashcardsStage
          activeGame={activeGame}
          currentIndex={currentQuestionIndex}
          isFlipped={flashcardFlipped}
          masteredIndices={masteredCardIndices}
          reviewIndices={reviewCardIndices}
          onToggleFlip={() => setFlashcardFlipped((prev) => !prev)}
          onMarkMastered={() => {
            const nextMastered = masteredCardIndices.includes(currentQuestionIndex)
              ? masteredCardIndices
              : [...masteredCardIndices, currentQuestionIndex];
            const nextReview = reviewCardIndices.filter((i) => i !== currentQuestionIndex);
            setMasteredCardIndices(nextMastered);
            setReviewCardIndices(nextReview);
            const nextCorrectCount = nextMastered.length;
            const nextScore = nextCorrectCount * 100;
            setCorrectCount(nextCorrectCount);
            setScore(nextScore);
            setBestStreak((b) => Math.max(b, nextCorrectCount));
            confetti({ particleCount: 35, spread: 55, origin: { y: 0.7 } });
            setFlashcardFlipped(false);
            if (currentQuestionIndex + 1 < activeGame.questions.length) {
              setCurrentQuestionIndex((prev) => prev + 1);
            } else {
              finishGameAndAward(nextScore);
            }
          }}
          onMarkNeedsReview={() => {
            const nextReview = reviewCardIndices.includes(currentQuestionIndex)
              ? reviewCardIndices
              : [...reviewCardIndices, currentQuestionIndex];
            const nextMastered = masteredCardIndices.filter((i) => i !== currentQuestionIndex);
            setReviewCardIndices(nextReview);
            setMasteredCardIndices(nextMastered);
            const nextCorrectCount = nextMastered.length;
            setCorrectCount(nextCorrectCount);
            setScore(nextCorrectCount * 100);
            setFlashcardFlipped(false);
            if (currentQuestionIndex + 1 < activeGame.questions.length) {
              setCurrentQuestionIndex((prev) => prev + 1);
            } else {
              finishGameAndAward(nextCorrectCount * 100);
            }
          }}
          onPrevCard={() => {
            setFlashcardFlipped(false);
            setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
          }}
          onJumpToNextReview={() => {
            if (reviewCardIndices.length > 0) {
              setFlashcardFlipped(false);
              setCurrentQuestionIndex(reviewCardIndices[0]);
            }
          }}
          onFinishDeck={() => {
            const finalCorrect = masteredCardIndices.length;
            setCorrectCount(finalCorrect);
            finishGameAndAward(finalCorrect * 100);
          }}
          onExit={() => {
            setGameMode('lobby');
            setActiveGame(null);
          }}
        />
      )}

      {/* PLAYING MODE: GOLDEN BELL / BOAT RACE / LUCKY WHEEL */}
      {gameMode === 'playing' && activeGame && activeGame.type !== 'flashcards' && (
        <GamePlayStage
          activeGame={activeGame}
          currentQuestionIndex={currentQuestionIndex}
          selectedOption={selectedOption}
          selectedChoiceKey={selectedChoiceKey}
          score={score}
          comboStreak={comboStreak}
          correctCount={correctCount}
          timerSeconds={timerSeconds}
          totalTimerSeconds={totalTimerSeconds}
          currentUserName={currentUserName}
          gameAnswers={gameAnswers}
          setGameAnswers={setGameAnswers}
          onExit={() => {
            setIsTimerRunning(false);
            setGameMode('lobby');
            setActiveGame(null);
          }}
          onSubmitAnswer={handleGameAnswerSubmit}
          onNextManualQuestion={() => {
            const perQSeconds = activeGame.type === 'speed_quiz' ? 10 : 15;
            if (currentQuestionIndex + 1 < activeGame.questions.length) {
              setCurrentQuestionIndex((prev) => prev + 1);
              setSelectedOption(null);
              setSelectedChoiceKey(null);
              setTotalTimerSeconds(perQSeconds);
              setTimerSeconds(perQSeconds);
            } else {
              finishGameAndAward(score);
            }
          }}
          isSpinning={isSpinning}
          wheelWinner={wheelWinner}
          onSpinLuckyWheel={handleSpinLuckyWheel}
          isMatchingQuestion={isMatchingQuestion}
          isTrueFalseQuestion={isTrueFalseQuestion}
          isMultipleResponseQuestion={isMultipleResponseQuestion}
          isOrderingQuestion={isOrderingQuestion}
          isClassificationQuestion={isClassificationQuestion}
          isMultipleChoiceQuestion={isMultipleChoiceQuestion}
        />
      )}

      {/* RESULT MODE */}
      {gameMode === 'result' && activeGame && (
        <GameResultPodium
          activeGame={activeGame}
          userRole={userRole}
          currentUserName={currentUserName}
          score={score}
          correctCount={correctCount}
          bestStreak={bestStreak}
          achievedRank={achievedRank}
          isRewardAlreadyClaimed={isRewardAlreadyClaimed}
          debugSaveResult={debugSaveResult}
          onRetryDebugSave={() => finishGameAndAward(score)}
          onReplay={() => handleStartGame(activeGame)}
          onCreateNewAiDeck={() => {
            setGameMode('lobby');
            setActiveTab('games');
            setActiveGame(null);
            setTimeout(() => {
              aiGeneratorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              aiTopicInputRef.current?.focus();
            }, 120);
          }}
          onOpenStore={() => {
            setGameMode('lobby');
            setActiveTab('store');
            setActiveGame(null);
          }}
          onBackToLobby={() => {
            setGameMode('lobby');
            setActiveTab('games');
            setActiveGame(null);
          }}
        />
      )}


      {/* Quizzi Game Modal (Hỗ trợ Multi-select chọn nhiều lớp, Tách N bản ghi độc lập) */}
      <QuizziGameModal
        isOpen={showCreateQuizziModal}
        onClose={() => {
          setShowCreateQuizziModal(false);
          setEditingQuizziGame(null);
        }}
        onSave={handleSaveQuizziGames}
        initialData={editingQuizziGame}
        defaultGrade={filterGrade !== 'Tất cả các khối' && filterGrade !== 'Tất cả khối' ? filterGrade : 'Khối 3'}
      />

      <Grade3DatabaseConfigModal
        isOpen={isGrade3ConfigModalOpen}
        onClose={() => setIsGrade3ConfigModalOpen(false)}
        grade3Lessons={[]}
        onSynced={(updatedConfig) => setGrade3DbConfig(updatedConfig)}
      />

      {/* Game Catalog & QR Export Modal (Word .docx & QR Images) */}
      <GameExportModal
        isOpen={gameExportModalState.isOpen}
        onClose={() => setGameExportModalState({ isOpen: false, games: [] })}
        games={gameExportModalState.games}
        titleContext={gameExportModalState.titleContext}
      />




      {/* 3. LEADERBOARD MODAL (Bảng Xếp Hạng Vinh Danh ⭐) */}
      {selectedLeaderboardGame && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] border-2 border-amber-400/50 shadow-[0_0_50px_rgba(245,158,11,0.3)] text-white relative">
            <div className="absolute -top-16 -left-16 w-56 h-56 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 text-white flex items-center justify-between relative z-10 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-amber-200 border border-white/30 text-2xl font-black">
                  🏆
                </div>
                <div>
                  <h3 className="text-lg font-extrabold font-heading">Bảng Xếp Hạng Vinh Danh ⭐</h3>
                  <p className="text-amber-100 text-xs mt-0.5">
                    Phòng: <span className="font-bold underline">{selectedLeaderboardGame.title}</span> • Lớp: <span className="font-bold">{selectedLeaderboardGame.classInfo || 'Lớp 3A'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLeaderboardGame(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Room Info Summary Bar */}
            <div className="bg-white/10 backdrop-blur-md border-b border-white/15 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center relative z-10">
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/15">
                <span className="text-[10px] font-bold text-amber-300 block uppercase">Đã tham gia</span>
                <span className="text-xs font-black text-white">{participatedCount} học sinh</span>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/15">
                <span className="text-[10px] font-bold text-amber-300 block uppercase">Đã hoàn thành</span>
                <span className="text-xs font-black text-emerald-300">{completedCount} học sinh</span>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/15">
                <span className="text-[10px] font-bold text-amber-300 block uppercase">Số câu hỏi</span>
                <span className="text-xs font-black text-amber-200">{selectedLeaderboardGame.questions.length} câu</span>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/15">
                <span className="text-[10px] font-bold text-amber-300 block uppercase">Môn học</span>
                <span className="text-xs font-black text-white">{selectedLeaderboardGame.subject}</span>
              </div>
            </div>

            {/* Search bar, Class filter & refresh */}
            <div className="px-6 pt-4 flex flex-wrap items-center justify-between gap-3 relative z-10">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo Mã HS, Tên học sinh hoặc Số thứ tự..."
                  value={leaderboardSearch}
                  onChange={(e) => setLeaderboardSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white/10 border border-white/20 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Bộ lọc theo Lớp */}
              <div className="flex items-center gap-2 shrink-0">
                <Filter className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold text-amber-200">Lớp:</span>
                <select
                  value={leaderboardClassFilter}
                  onChange={(e) => setLeaderboardClassFilter(e.target.value)}
                  className="bg-indigo-950 border border-white/20 text-xs text-amber-200 font-extrabold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                >
                  <option value="Tất cả các lớp">Tất cả các lớp</option>
                  {availableLeaderboardClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>

              {/* Nút làm mới */}
              <button
                onClick={fetchLeaderboardData}
                disabled={isLeaderboardLoading}
                title="Làm mới bảng xếp hạng"
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-amber-300 rounded-xl border border-white/20 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0 disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLeaderboardLoading ? 'animate-spin' : ''}`} />
                <span>Làm mới</span>
              </button>

              {typeof window !== 'undefined' && window.location.search.includes('debug=1') && (
                <button
                  onClick={handleScanMisplacedGameResults}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-indigo-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer shrink-0"
                >
                  Quét kết quả trò chơi lạc mã
                </button>
              )}
            </div>

            {/* Teacher Debug Panel if ?debug=1 */}
            {typeof window !== 'undefined' && window.location.search.includes('debug=1') && (
              <div className="mx-6 mt-3 p-4 bg-slate-900/90 border border-amber-400/40 rounded-2xl text-xs space-y-2 relative z-10 font-mono">
                <div className="text-amber-300 font-bold border-b border-slate-700 pb-1 flex items-center justify-between">
                  <span>[DEBUG TEACHER LEADERBOARD SCAN]</span>
                  <span>Tổng số lượt đọc: {debugTeacherInfo.readCount}</span>
                </div>
                <div><strong>Room ID hiện tại:</strong> {debugTeacherInfo.roomId}</div>
                <div><strong>Sĩ số lớp (Roster):</strong> {debugTeacherInfo.rosterSize} học sinh | <strong>Tài liệu đọc được:</strong> {debugTeacherInfo.docsFound}</div>
                <div className="max-h-32 overflow-y-auto space-y-1 pt-1 border-t border-slate-800 text-[11px]">
                  <strong>Chi tiết khớp theo Mã HS:</strong>
                  {debugTeacherInfo.studentDetails.map((st, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-slate-300">
                      <span>• {st.code} ({st.name})</span>
                      <span className={st.status === 'Đã tham gia' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>{st.status}: {st.reason}</span>
                    </div>
                  ))}
                </div>
                {debugTeacherInfo.misplacedGames.length > 0 && (
                  <div className="pt-1 border-t border-slate-800 text-rose-300 text-[11px]">
                    <strong>Khóa games lạc mã (cùng tiêu đề khác roomId):</strong>
                    {debugTeacherInfo.misplacedGames.map((mg, i) => (
                      <div key={i}>• {mg.studentCode}: {mg.roomTitle} (Key: {mg.gameKey})</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard Table / Empty State */}
            <div className="p-6 overflow-y-auto flex-1 relative z-10">
              {isLeaderboardLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
                  <p className="text-xs text-amber-200">Đang tải dữ liệu bảng xếp hạng...</p>
                </div>
              ) : filteredLeaderboard.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center text-2xl font-bold border-2 border-amber-400/40 animate-pulse">
                    ⏳
                  </div>
                  <h4 className="text-base font-extrabold text-white">Chưa có học sinh tham gia</h4>
                  <p className="text-xs text-amber-200/80 max-w-sm leading-relaxed">
                    Học sinh chưa hoàn thành lượt chơi thực tế của phòng thi đấu này. Khi học sinh hoàn thành hoặc đang làm bài, kết quả sẽ cập nhật real-time tại đây.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-white/20 rounded-2xl bg-white/5 backdrop-blur-md">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/10 text-amber-200 text-[11px] font-black uppercase tracking-wider">
                        <th className="p-3.5 text-center w-16">Hạng</th>
                        <th className="p-3.5">Mã HS</th>
                        <th className="p-3.5">Học Sinh</th>
                        <th className="p-3.5 text-center">Lớp</th>
                        <th className="p-3.5 text-center">Tiến Trình (Đúng/Sai)</th>
                        <th className="p-3.5 text-center">Thời Gian</th>
                        <th className="p-3.5 text-right">Điểm Số</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 text-xs font-medium text-white">
                      {filteredLeaderboard.map((item, idx) => {
                        const medal = item.completed 
                          ? (idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `${idx + 1}`)
                          : '⏳';
                        const timeStr = item.submittedAt 
                          ? new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : '-';

                        return (
                          <tr key={item.studentCode} className="hover:bg-white/10 transition-colors">
                            <td className="p-3.5 text-center font-black text-amber-300">{medal}</td>
                            <td className="p-3.5 font-bold text-amber-200">{item.studentCode}</td>
                            <td className="p-3.5 font-extrabold text-white">{item.studentName}</td>
                            <td className="p-3.5 text-center">
                              <span className="px-2.5 py-1 rounded-lg bg-indigo-900/60 border border-indigo-400/30 text-amber-200 font-bold text-[11px]">
                                {item.className || 'Lớp 3D'}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              {item.completed ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Hoàn thành ({item.questionsAnswered}/{item.totalQuestions})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/30 animate-pulse">
                                  <Clock className="w-3.5 h-3.5" />
                                  Đang làm dở ({item.questionsAnswered}/{item.totalQuestions} câu)
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-center text-amber-200">{timeStr}</td>
                            <td className="p-3.5 text-right font-black text-amber-300">
                              {item.completed ? `${item.score.toLocaleString()} đ` : `${item.score || 0} đ`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/15 bg-slate-900/80 flex items-center justify-between rounded-b-3xl relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              </div>
              <button
                onClick={() => setSelectedLeaderboardGame(null)}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-white/20"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ROOM DELETE CONFIRMATION POPUP */}
      <ConfirmDeleteModal
        isOpen={!!roomToDelete}
        onClose={() => setRoomToDelete(null)}
        onConfirm={() => {
          if (roomToDelete) {
            if (onDeleteGame) onDeleteGame(roomToDelete.id);
            setToastMessage(`🗑️ Đã xóa phòng thi đấu "${roomToDelete.title}"`);
            setTimeout(() => setToastMessage(null), 3000);
            setRoomToDelete(null);
          }
        }}
        title="Xác nhận xóa phòng thi đấu"
        itemType="phòng thi đấu"
        itemName={roomToDelete?.title}
        description={`Bạn có chắc chắn muốn xóa phòng "${roomToDelete?.title}" không? Toàn bộ dữ liệu bảng xếp hạng và lượt chơi của học sinh trong phòng này sẽ bị xóa vĩnh viễn và không thể khôi phục.`}
      />

      {/* QUIZZI GAME CARD DELETE CONFIRMATION POPUP */}
      <ConfirmDeleteModal
        isOpen={!!gameToDelete}
        onClose={() => setGameToDelete(null)}
        onConfirm={async () => {
          if (gameToDelete) {
            try {
              await deleteQuizziGameFromFirestore(String(gameToDelete.id));
              setQuizziGames(prev => prev.filter(g => String(g.id) !== String(gameToDelete.id)));
              setDeletedCards(prev => [...prev, gameToDelete.id]);
              setToastMessage(`🗑️ Đã xóa vĩnh viễn trò chơi Quizzi "${gameToDelete.title}" trên Cloud Firestore`);
            } catch (err) {
              console.error("Lỗi xóa Quizzi trên Firestore:", err);
              setToastMessage(`❌ Lỗi khi xóa trên Firestore`);
            } finally {
              setTimeout(() => setToastMessage(null), 3000);
              setGameToDelete(null);
            }
          }
        }}
        title="Xác nhận xóa trò chơi Quizzi"
        itemType="trò chơi"
        itemName={gameToDelete?.title}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-100" />
            {toastMessage}
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] text-white px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 animate-slide-up backdrop-blur-md ${toast.type === 'error' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-emerald-600 border-emerald-400 text-white'}`}>
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-white shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          )}
          <span className="text-xs font-extrabold tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Share Content Modal */}
      <ShareContentModal
        isOpen={!!sharingGame}
        onClose={() => setSharingGame(null)}
        contentType="game"
        collectionNameOverride={sharingGame?._shareCollection || 'games'}
        content={sharingGame}
        onConfirmShare={(payload) => {
          if (sharingGame) {
            if (sharingGame._shareCollection === 'quizzi_games') {
              setQuizziGames(prev => prev.map(q => String(q.id) === String(sharingGame.id) ? {
                ...q,
                sharedWithTeachers: payload.sharedWithTeachers,
                sharedWithGroups: payload.sharedWithGroups,
                sharePermission: payload.sharePermission,
                allowDeleteByShared: payload.allowDeleteByShared,
              } : q));
            } else if (onUpdateGame) {
              onUpdateGame({
                ...sharingGame,
                sharedWithTeachers: payload.sharedWithTeachers,
                sharedWithGroups: payload.sharedWithGroups,
                sharePermission: payload.sharePermission,
                allowDeleteByShared: payload.allowDeleteByShared,
              });
            }
          }
          showToast(payload.revoked
            ? "Đã thu hồi chia sẻ trò chơi: " + payload.title
            : "Đã cập nhật chia sẻ trò chơi: " + payload.title, "success");
          setSharingGame(null);
        }}
      />

      {/* Embedded Fullscreen Game Overlay Modal */}
      {embeddedGameUrl && (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-lg shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold">
                🎮
              </div>
              <div>
                <h3 className="text-white font-extrabold text-base">{embeddedGameTitle}</h3>
                <p className="text-xs text-indigo-300/80">Trò chơi học tập tương tác trực tuyến</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={embeddedGameUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl border border-indigo-400/40 transition-all flex items-center gap-2 shadow-md cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Mở tab mới (nếu bị chặn nhúng)
              </a>
              <button
                onClick={() => setEmbeddedGameUrl(null)}
                className="p-2.5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-400/40 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                title="Đóng trò chơi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 relative w-full h-full bg-slate-950 overflow-hidden flex flex-col">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-amber-500/95 text-slate-950 px-4 py-2 rounded-xl text-xs font-extrabold shadow-xl flex items-center gap-2 pointer-events-auto border border-amber-300">
              <span>💡 Lưu ý: Một số nền tảng (như Wayground/Quizizz) có thể hạn chế nhúng khung hình (iframe). Nếu màn hình hiển thị trắng hoặc từ chối kết nối, vui lòng bấm nút <strong className="underline">"Mở tab mới"</strong> màu xanh ở góc trên bên phải.</span>
            </div>
            <iframe
              src={embeddedGameUrl}
              title={embeddedGameTitle}
              className="w-full flex-1 border-0 bg-white"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          </div>
        </div>
      )}

    </div>
  );
};
