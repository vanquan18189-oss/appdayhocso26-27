import { SUBJECTS, GRADES } from '../../lib/constants';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  BookOpen,
  Edit3,
  Printer,
  Filter,
  ChevronDown,
  Trash2,
  CheckCircle2,
  RefreshCw,
  FileText,
  Zap,
  ChevronRight,
  ChevronLeft,
  Save,
  ArrowLeft,
  Home,
  Users,
  Globe,
  Play,
  BarChart2,
  Share2,
  Bell,
  CheckCircle,
  Check,
  LayoutGrid,
  List,
  Clock,
  QrCode,
  Database,
  Search,
  Layers,
  Eye,
  Settings,
  ExternalLink,
  X,
} from 'lucide-react';
import { getSubjectColorStyles } from '../../utils/subjectColors';
import { Lesson5EPlan, UserRole } from '../../types';
import { generate5ELessonAI } from '../../services/geminiService';
import {
  getCurrentAccessContext,
  getContentPermissions,
  filterAccessibleItems,
  isContentOwner,
} from '../../services/permissionService';
import { auth } from '../../services/firebase';
import { Lesson5EModal } from './Lesson5EModal';
import { ShareContentModal } from './ShareContentModal';
import { ELearningAssignmentModal } from './ELearningAssignmentModal';
import { LessonProgressStatsModal } from './LessonProgressStatsModal';
import { ElearningExportModal } from './ElearningExportModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { StatCard } from '../common/StatCard';
import {
  Grade3DatabaseConfig,
  DEFAULT_GRADE3_APP_URL,
  getGrade3DbConfig,
  getCachedGrade3Lessons,
  fetchGrade3DedicatedLessons,
  syncLessonToGrade3Database,
  removeLessonFromGrade3Database,
} from '../../services/grade3LessonDbService';
import { Grade3DatabaseConfigModal } from './Grade3DatabaseConfigModal';
import { encodeUtf8Base64 } from '../portal/DigitalResourcePortal';

interface Lesson5EModuleProps {
  lessons: Lesson5EPlan[];
  onSaveLesson: (lesson: Lesson5EPlan) => void;
  onDeleteLesson: (id: string) => void;
  userRole: UserRole;
}

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
}

const GRADE_SELECTOR_CARDS: GradeSelectorMeta[] = [
  {
    key: 'all',
    gradeValue: 'Tất cả khối',
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
    subtitle: 'Khởi đầu khám phá',
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
    subtitle: 'Rèn kỹ năng nền tảng',
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
    shortTag: 'Mở App K3 ↗',
    subtitle: 'dayhockhoi3.vercel.app',
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
    shortTag: 'Lớp 4',
    subtitle: 'Phát triển tư duy 5E',
    activeGradient: 'from-sky-500 via-blue-600 to-indigo-600',
    activeShadow: 'shadow-lg shadow-blue-500/25 ring-2 ring-sky-400/40',
    inactiveBorder: 'border-sky-200/80 hover:border-sky-400 hover:bg-sky-50/40',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white',
  },
  {
    key: 'grade-5',
    gradeValue: 'Khối 5',
    label: 'Khối 5',
    shortTag: 'Lớp 5',
    subtitle: 'Vững vàng chuyển cấp',
    activeGradient: 'from-violet-600 via-purple-600 to-indigo-700',
    activeShadow: 'shadow-lg shadow-violet-600/25 ring-2 ring-violet-400/40',
    inactiveBorder: 'border-violet-200/80 hover:border-violet-400 hover:bg-violet-50/40',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-800',
    iconBg: 'bg-gradient-to-br from-violet-600 to-purple-600 text-white',
  },
];

export const Lesson5EModule: React.FC<Lesson5EModuleProps> = ({
  lessons,
  onSaveLesson,
  onDeleteLesson,
  userRole,
}) => {
  const authEmail =
    typeof window !== 'undefined'
      ? auth?.currentUser?.email || localStorage.getItem('eduplay_teacher_email')
      : null;
  const accessContext = useMemo(
    () => getCurrentAccessContext(userRole, authEmail),
    [userRole, authEmail]
  );
  const activeTeacherProfile = accessContext.teacherProfile;
  const isAdmin = accessContext.isAdmin;

  const isLessonOwner = useCallback(
    (lesson: Lesson5EPlan): boolean => {
      return isContentOwner(lesson, accessContext);
    },
    [accessContext]
  );

  // Dedicated Grade 3 Database Connection State
  const [grade3DbConfig, setGrade3DbConfig] = useState<Grade3DatabaseConfig>(() =>
    getGrade3DbConfig()
  );
  const [dedicatedGrade3Lessons, setDedicatedGrade3Lessons] = useState<Lesson5EPlan[]>(() =>
    getCachedGrade3Lessons()
  );
  const [isSyncingGrade3Db, setIsSyncingGrade3Db] = useState(false);
  const [grade3LatencyMs, setGrade3LatencyMs] = useState<number>(
    () => getGrade3DbConfig().lastPingMs || 14
  );
  const [grade3SourceLabel, setGrade3SourceLabel] = useState<string>(
    'Phân luồng CSDL Khối 3 (elearning_lessons_khoi3)'
  );
  const [isGrade3ConfigModalOpen, setIsGrade3ConfigModalOpen] = useState(false);

  // Merge main lessons with dedicated Grade 3 database lessons seamlessly
  const mergedAllLessons = useMemo<Lesson5EPlan[]>(() => {
    const map = new Map<string, Lesson5EPlan>();
    (lessons || []).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    if (grade3DbConfig.enabled) {
      (dedicatedGrade3Lessons || []).forEach((g3Item) => {
        if (g3Item?.id && !map.has(g3Item.id)) {
          map.set(g3Item.id, { ...g3Item, grade: 'Khối 3' });
        }
      });
    }
    return Array.from(map.values());
  }, [lessons, dedicatedGrade3Lessons, grade3DbConfig.enabled]);

  const accessibleLessons = useMemo(() => {
    return filterAccessibleItems(mergedAllLessons, 'all', accessContext);
  }, [mergedAllLessons, accessContext]);

  const [activeTab, setActiveTab] = useState<'list' | 'editor' | 'viewer'>('list');
  const [selectedLesson, setSelectedLesson] = useState<Lesson5EPlan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson5EPlan | null>(null);
  const [sharingLesson, setSharingLesson] = useState<Lesson5EPlan | null>(null);
  const [assigningLesson, setAssigningLesson] = useState<Lesson5EPlan | null>(null);
  const [statsLesson, setStatsLesson] = useState<Lesson5EPlan | null>(null);
  const [deletingLesson, setDeletingLesson] = useState<Lesson5EPlan | null>(null);
  const [exportModalState, setExportModalState] = useState<{
    isOpen: boolean;
    lessons: Lesson5EPlan[];
    titleContext?: string;
  }>({ isOpen: false, lessons: [] });
  const [assignedToast, setAssignedToast] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<{
    lessonId: string;
    type: 'status' | 'approval';
  } | null>(null);

  // Main Top Pill Tab State: 'my' | 'colleague' | 'all'
  const [mainTab, setMainTab] = useState<'my' | 'colleague' | 'all'>('all');

  // Filter States
  const [filterGrade, setFilterGrade] = useState('Tất cả khối');
  const [filterSubject, setFilterSubject] = useState('Tất cả môn');
  const [filterStatus, setFilterStatus] = useState('Tất cả trạng thái');
  const [filterSort, setFilterSort] = useState('Mới nhất (Thời gian)');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 9;

  // Sync with dedicated Grade 3 database when Khối 3 is selected or on initial mount
  const handleSyncGrade3Database = useCallback(
    async (showNotification = false) => {
      setIsSyncingGrade3Db(true);
      try {
        const res = await fetchGrade3DedicatedLessons(lessons || []);
        setDedicatedGrade3Lessons(res.lessons);
        setGrade3LatencyMs(res.latencyMs);
        setGrade3SourceLabel(res.sourceLabel);
        setGrade3DbConfig(getGrade3DbConfig());
        if (showNotification) {
          setAssignedToast(
            `Đã đồng bộ ${res.lessons.length} bài giảng từ ${res.sourceLabel} (${res.latencyMs}ms)!`
          );
          setTimeout(() => setAssignedToast(null), 3500);
        }
      } catch {
        // Fallback silently
      } finally {
        setIsSyncingGrade3Db(false);
      }
    },
    [lessons]
  );

  useEffect(() => {
    if (grade3DbConfig.enabled) {
      handleSyncGrade3Database(false);
    }
  }, [grade3DbConfig.enabled, handleSyncGrade3Database]);

  // Listen to config updates
  useEffect(() => {
    const onConfigUpdated = () => {
      setGrade3DbConfig(getGrade3DbConfig());
    };
    window.addEventListener('eduplay_grade3_db_config_updated', onConfigUpdated);
    return () => window.removeEventListener('eduplay_grade3_db_config_updated', onConfigUpdated);
  }, []);

  const totalLessons = accessibleLessons.length;

  const publishedAndApprovedCount = accessibleLessons.filter((lesson) => {
    const isPublished = (lesson as any).status !== 'draft';
    const isApproved = (lesson as any).isApproved !== false;
    return isPublished && isApproved;
  }).length;

  const publishedAndApprovedPercent =
    totalLessons > 0 ? Math.round((publishedAndApprovedCount / totalLessons) * 100) : 0;

  const totalViews = accessibleLessons.reduce((acc, lesson) => {
    return acc + ((lesson as any).viewsCount || 0);
  }, 0);

  // Permission check for content approval (Admin)
  const canReviewContent = isAdmin;

  // Handle clicking outside to close any open dropdown
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdown(null);
    };
    if (openDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [openDropdown]);

  const handleSaveLessonWithGrade3Routing = useCallback(
    (lesson: Lesson5EPlan) => {
      onSaveLesson(lesson);
      if ((lesson.grade || '').trim().toLowerCase() === 'khối 3') {
        syncLessonToGrade3Database(lesson).then(() => {
          setDedicatedGrade3Lessons(getCachedGrade3Lessons());
        });
      }
    },
    [onSaveLesson]
  );

  const handleDeleteLessonWithGrade3Routing = useCallback(
    (id: string) => {
      onDeleteLesson(id);
      removeLessonFromGrade3Database(id).then(() => {
        setDedicatedGrade3Lessons(getCachedGrade3Lessons());
      });
    },
    [onDeleteLesson]
  );

  const handleQuickChangeStatus = (
    lesson: Lesson5EPlan,
    newStatus: 'published' | 'draft',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const updated = {
      ...lesson,
      status: newStatus,
    };
    handleSaveLessonWithGrade3Routing(updated);

    try {
      const saved = localStorage.getItem('eduplay_5e_lessons');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const updatedList = parsed.map((item: any) =>
            item.id === lesson.id ? { ...item, status: newStatus } : item
          );
          localStorage.setItem('eduplay_5e_lessons', JSON.stringify(updatedList));
        }
      }
    } catch (err) {
      console.warn('Error updating local storage:', err);
    }

    setOpenDropdown(null);
  };

  const handleQuickChangeApproval = (
    lesson: Lesson5EPlan,
    newApproval: boolean,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!canReviewContent) return;
    const updated = {
      ...lesson,
      isApproved: newApproval,
    };
    handleSaveLessonWithGrade3Routing(updated);

    try {
      const saved = localStorage.getItem('eduplay_5e_lessons');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const updatedList = parsed.map((item: any) =>
            item.id === lesson.id ? { ...item, isApproved: newApproval } : item
          );
          localStorage.setItem('eduplay_5e_lessons', JSON.stringify(updatedList));
        }
      }
    } catch (err) {
      console.warn('Error updating local storage:', err);
    }

    setOpenDropdown(null);
  };

  const tabFilteredLessons = useMemo(() => {
    return filterAccessibleItems(mergedAllLessons, mainTab, accessContext);
  }, [mergedAllLessons, mainTab, accessContext]);

  // Count lessons per grade for the visual Grade Selector Cards
  const gradeCountsMap = useMemo(() => {
    const counts: Record<string, { count: number; views: number; subjectsCount: number }> = {
      'Tất cả khối': {
        count: tabFilteredLessons.length,
        views: tabFilteredLessons.reduce((s, l) => s + ((l as any).viewsCount || 0), 0),
        subjectsCount: new Set(tabFilteredLessons.map((l) => l.subject).filter(Boolean)).size,
      },
    };
    ['Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5'].forEach((g) => {
      const list = tabFilteredLessons.filter(
        (l) => (l.grade || '').trim().toLowerCase() === g.toLowerCase()
      );
      counts[g] = {
        count: list.length,
        views: list.reduce((s, l) => s + ((l as any).viewsCount || 0), 0),
        subjectsCount: new Set(list.map((l) => l.subject).filter(Boolean)).size,
      };
    });
    return counts;
  }, [tabFilteredLessons]);

  const filteredLessons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = tabFilteredLessons.filter((lesson) => {
      // Grade filter
      if (
        filterGrade !== 'Tất cả khối' &&
        filterGrade !== 'Tất cả các khối' &&
        (lesson.grade || '').trim().toLowerCase() !== filterGrade.trim().toLowerCase()
      ) {
        return false;
      }

      // Subject filter
      if (
        filterSubject !== 'Tất cả môn' &&
        filterSubject !== 'Tất cả các môn' &&
        lesson.subject !== filterSubject
      ) {
        return false;
      }

      // Status filter
      const status = (lesson as any).status || 'published';
      if (filterStatus === 'Bản nháp' && status !== 'draft') return false;
      if (filterStatus === 'Đã xuất bản' && status !== 'published') return false;

      // Search query filter
      if (q) {
        const haystack = `${lesson.title || ''} ${lesson.topic || ''} ${lesson.subject || ''} ${lesson.grade || ''} ${lesson.authorName || ''} ${(lesson as any).code || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // Sort
    return [...list].sort((a, b) => {
      if (filterSort === 'Tên A-Z') {
        return (a.title || '').localeCompare(b.title || '', 'vi');
      }
      if (filterSort === 'Lượt truy cập cao') {
        return ((b as any).viewsCount || 0) - ((a as any).viewsCount || 0);
      }
      if (filterSort === 'Cũ nhất') {
        return String(a.id || '').localeCompare(String(b.id || ''));
      }
      // Default: Mới nhất
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }, [tabFilteredLessons, filterGrade, filterSubject, filterStatus, searchQuery, filterSort]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterGrade, filterSubject, filterStatus, searchQuery, mainTab, filterSort]);

  const totalPages = Math.max(1, Math.ceil(filteredLessons.length / itemsPerPage));
  const paginatedLessons = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLessons.slice(start, start + itemsPerPage);
  }, [filteredLessons, currentPage]);

  // Form State for Editor
  const [topicInput, setTopicInput] = useState('');
  const [subjectInput, setSubjectInput] = useState('Toán Học');
  const [gradeInput, setGradeInput] = useState('Khối 3');
  const [durationInput, setDurationInput] = useState('35 phút');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const [currentPlan, setCurrentPlan] = useState<Lesson5EPlan>({
    id: `les-${Date.now()}`,
    title: 'Bài Giảng 5E Mới',
    subject: 'Toán Học',
    grade: 'Khối 3',
    duration: '35 phút',
    topic: '',
    authorName: activeTeacherProfile.name,
    createdAt: new Date().toLocaleDateString('vi-VN'),
    stepEngage: {
      title: 'Bước 1: Khởi động (Engage)',
      subtitle: 'Thu hút chú ý & kích thích tư duy',
      objectives: '',
      teacherActivities: '',
      studentActivities: '',
      materials: '',
    },
    stepExplore: {
      title: 'Bước 2: Khám phá & Hình thành kiến thức (Explore & Explain)',
      subtitle: 'Khám phá quy luật & xây dựng kiến thức',
      objectives: '',
      teacherActivities: '',
      studentActivities: '',
      materials: '',
    },
    stepElaborate: {
      title: 'Bước 3: Luyện tập (Elaborate)',
      subtitle: 'Củng cố & mở rộng kỹ năng',
      objectives: '',
      teacherActivities: '',
      studentActivities: '',
      materials: '',
    },
    stepEvaluate: {
      title: 'Bước 4: Vận dụng (Evaluate)',
      subtitle: 'Đánh giá năng lực & bài tập thực tế',
      objectives: '',
      teacherActivities: '',
      studentActivities: '',
      materials: '',
    },
  });

  const handleStartCreateNew = () => {
    setEditingLesson(null);
    setIsModalOpen(true);
  };

  // Build dedicated Grade 3 application URL (https://dayhockhoi3.vercel.app) with SSO parameters
  const grade3AppUrlWithSso = useMemo(() => {
    const rawBase = (grade3DbConfig.externalAppUrl || DEFAULT_GRADE3_APP_URL).trim() || DEFAULT_GRADE3_APP_URL;
    const baseUrl = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    const teacherEmail = activeTeacherProfile?.email || authEmail || 'thuthuthtk@gmail.com';
    const teacherName = activeTeacherProfile?.name || 'Giáo viên';
    const teacherRole = isAdmin ? 'admin' : userRole || 'teacher';
    const ssoToken = encodeUtf8Base64({
      email: teacherEmail,
      name: teacherName,
      role: teacherRole,
      uid: activeTeacherProfile?.id || teacherEmail,
      timestamp: Date.now(),
      source: 'PK_TRUC_KHANG_LMS',
    });

    try {
      const urlObj = new URL(baseUrl);
      if (ssoToken) urlObj.searchParams.set('sso_token', ssoToken);
      if (teacherEmail) urlObj.searchParams.set('sso_email', teacherEmail);
      if (teacherName) urlObj.searchParams.set('sso_name', teacherName);
      if (teacherRole) urlObj.searchParams.set('sso_role', teacherRole);
      return urlObj.toString();
    } catch {
      return baseUrl;
    }
  }, [grade3DbConfig.externalAppUrl, activeTeacherProfile, authEmail, isAdmin, userRole]);

  const navigateToGrade3DedicatedApp = useCallback(
    (e?: React.MouseEvent) => {
      setFilterGrade('Khối 3');
      if (grade3DbConfig.enabled && grade3DbConfig.autoSyncOnSelect) {
        handleSyncGrade3Database(false);
      }

      if (typeof window === 'undefined') return;

      const isInsideIframe = (() => {
        try {
          return window.self !== window.top;
        } catch {
          return true;
        }
      })();

      if (!isInsideIframe) {
        // When running directly in browser tab (e.g., vercel.app), redirect directly to https://dayhockhoi3.vercel.app
        if (e) e.preventDefault();
        window.location.href = grade3AppUrlWithSso;
      } else {
        // When inside preview iframe, native <a target="_blank"> opens https://dayhockhoi3.vercel.app in a new tab
        setAssignedToast('Đang mở ứng dụng chuyên biệt Khối 3 (dayhockhoi3.vercel.app)...');
        setTimeout(() => setAssignedToast(null), 3500);
      }
    },
    [grade3AppUrlWithSso, grade3DbConfig.enabled, grade3DbConfig.autoSyncOnSelect, handleSyncGrade3Database]
  );

  const handleSelectGradeCard = (gradeValue: string) => {
    setFilterGrade(gradeValue);
    if (gradeValue === 'Khối 3') {
      if (grade3DbConfig.enabled && grade3DbConfig.autoSyncOnSelect) {
        handleSyncGrade3Database(false);
      }
      if (typeof window !== 'undefined') {
        const isInsideIframe = (() => {
          try {
            return window.self !== window.top;
          } catch {
            return true;
          }
        })();
        if (!isInsideIframe) {
          window.location.href = grade3AppUrlWithSso;
        } else {
          const a = document.createElement('a');
          a.href = grade3AppUrlWithSso;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
    }
  };

  const handleAiSuggest5E = async () => {
    if (!topicInput.trim()) return;
    setIsAiGenerating(true);
    const aiResult = await generate5ELessonAI(topicInput, subjectInput, gradeInput);

    setCurrentPlan((prev) => ({
      ...prev,
      title: aiResult.title || `Bài Giảng 5E: ${topicInput}`,
      subject: subjectInput,
      grade: gradeInput,
      duration: durationInput,
      topic: topicInput,
      stepEngage: { ...prev.stepEngage, ...aiResult.stepEngage },
      stepExplore: { ...prev.stepExplore, ...aiResult.stepExplore },
      stepElaborate: { ...prev.stepElaborate, ...aiResult.stepElaborate },
      stepEvaluate: { ...prev.stepEvaluate, ...aiResult.stepEvaluate },
    }));

    setIsAiGenerating(false);
  };

  const handleSaveCurrentPlan = () => {
    try {
      handleSaveLessonWithGrade3Routing(currentPlan);
      setSelectedLesson(currentPlan);
      setActiveTab('viewer');
      setAssignedToast('Đã lưu thành công dữ liệu bài giảng!');
      setTimeout(() => setAssignedToast(null), 3500);
    } catch {
      setAssignedToast('Lưu thất bại, vui lòng kiểm tra lại!');
      setTimeout(() => setAssignedToast(null), 3500);
    }
  };

  const handlePrintLesson = () => {
    window.print();
  };

  const grade3LessonsList = useMemo(
    () =>
      accessibleLessons.filter(
        (l) => (l.grade || '').trim().toLowerCase() === 'khối 3'
      ),
    [accessibleLessons]
  );

  return (
    <div className="space-y-5 pb-12 w-full">
      {/* MODULE HERO HEADER & QUICK ACTIONS */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
            <span>Bài Giảng Tương Tác E-Learning</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-500 font-semibold">Chuẩn Sư Phạm Mô Hình 5E</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-600 font-semibold">GDPT 2018</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-heading">
            Hệ Thống Bài Giảng Điện Tử &amp; Học Liệu Tương Tác 5E
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-3xl leading-relaxed">
            Thiết kế và tổ chức bài giảng chuẩn 5E (Khởi động • Khám phá • Giải thích • Luyện tập mở rộng • Vận dụng đánh giá) từ Khối 1 đến Khối 5.
          </p>
        </div>

        {activeTab === 'list' && userRole !== 'student' && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setExportModalState({
                  isOpen: true,
                  lessons: filteredLessons,
                  titleContext:
                    filterGrade !== 'Tất cả khối'
                      ? `Danh mục bài giảng ${filterGrade}`
                      : mainTab === 'my'
                      ? 'Bài giảng của tôi'
                      : mainTab === 'colleague'
                      ? 'Bài giảng từ đồng nghiệp'
                      : 'Toàn bộ bài giảng',
                })
              }
              className="px-4 py-2.5 rounded-2xl text-xs font-extrabold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/90 transition-all shadow-2xs flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" />
              <span>Xuất danh mục &amp; Mã QR</span>
            </button>

            <button
              type="button"
              onClick={handleStartCreateNew}
              className="px-5 py-2.5 rounded-2xl text-xs font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm mới bài giảng 5E</span>
            </button>
          </div>
        )}
      </div>

      {/* VIEW: List of Lessons */}
      {activeTab === 'list' && (
        <>
          {/* 1. THANH CHỌN KHỐI TRỰC QUAN TỪ KHỐI 1 ĐẾN KHỐI 5 */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                    Chọn Khối Lớp Giảng Dạy (Khối 1 – Khối 5)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bấm vào từng thẻ khối để lọc nhanh bài giảng 5E • Riêng Khối 3 tích hợp sẵn luồng kết nối CSDL chuyên biệt
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
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
                const stats = gradeCountsMap[card.gradeValue] || {
                  count: 0,
                  views: 0,
                  subjectsCount: 0,
                };

                const cardClassName = `relative rounded-2xl p-3.5 transition-all duration-150 cursor-pointer select-none flex flex-col justify-between min-h-[116px] border no-underline ${
                  isSelected
                    ? `bg-gradient-to-br ${card.activeGradient} text-white border-transparent ${card.activeShadow} -translate-y-0.5`
                    : `bg-white text-slate-800 ${card.inactiveBorder}`
                }`;

                const cardInnerContent = (
                  <>
                    {/* Top Row: Icon + Badge */}
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

                    {/* Middle Row: Grade Title & Subtitle */}
                    <div className="mt-2.5">
                      <div className="flex items-baseline justify-between gap-1">
                        <span
                          className={`text-sm sm:text-base font-extrabold tracking-tight ${
                            isSelected ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {card.label}
                        </span>
                        <span
                          className={`text-xs font-black font-mono tabular-nums ${
                            isSelected ? 'text-white' : 'text-slate-700'
                          }`}
                        >
                          {stats.count} bài
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

                    {/* Bottom Row: Metrics / Dedicated App Link for Grade 3 */}
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
                            <ExternalLink className="w-3 h-3" />
                            <span>Mở App Khối 3</span>
                          </span>
                          <span className="font-mono">↗</span>
                        </>
                      ) : (
                        <>
                          <span>{stats.subjectsCount} môn học</span>
                          <span>{stats.views} lượt xem</span>
                        </>
                      )}
                    </div>
                  </>
                );

                if (card.isDedicatedGrade3) {
                  return (
                    <a
                      key={card.key}
                      href={grade3AppUrlWithSso}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => navigateToGrade3DedicatedApp(e)}
                      className={cardClassName}
                      title="Bấm để mở hoặc chuyển hướng trực tiếp sang ứng dụng riêng của Khối 3 (https://dayhockhoi3.vercel.app)"
                    >
                      {cardInnerContent}
                    </a>
                  );
                }

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
                  >
                    {cardInnerContent}
                  </div>
                );
              })}
            </div>

            {/* BANNER CHUYÊN BIỆT KHI ĐANG CHỌN THẺ "KHỐI 3" */}
            {filterGrade === 'Khối 3' && (
              <div className="mt-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-cyan-50/80 border border-emerald-200/90 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3.5 animate-in fade-in duration-150">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Database className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm font-extrabold text-emerald-950">
                        Liên kết Cơ sở dữ liệu Chuyên biệt Khối 3
                      </span>
                      <span className="text-[11px] font-bold text-emerald-700 bg-white/90 px-2.5 py-0.5 rounded-lg border border-emerald-200 font-mono tabular-nums">
                        {grade3DbConfig.enabled ? `⚡ Đang bật • ${grade3LatencyMs}ms` : 'Đang tắt'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Nguồn dữ liệu: <strong className="text-slate-800">{grade3SourceLabel}</strong>
                      {grade3DbConfig.lastSyncedAt && (
                        <span> • Đồng bộ lúc {grade3DbConfig.lastSyncedAt}</span>
                      )}
                      <span> • Giúp giảm tải bộ nhớ chính và tối ưu tốc độ vận hành cho học sinh &amp; giáo viên Khối 3.</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => handleSyncGrade3Database(true)}
                    disabled={isSyncingGrade3Db}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-emerald-600 ${
                        isSyncingGrade3Db ? 'animate-spin' : ''
                      }`}
                    />
                    <span>{isSyncingGrade3Db ? 'Đang đồng bộ...' : 'Đồng bộ CSDL Khối 3'}</span>
                  </button>

                  {grade3DbConfig.externalAppUrl && (
                    <a
                      href={
                        /^https?:\/\//i.test(grade3DbConfig.externalAppUrl)
                          ? grade3DbConfig.externalAppUrl
                          : `https://${grade3DbConfig.externalAppUrl}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở Ứng dụng Khối 3</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsGrade3ConfigModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Cấu hình kết nối</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. 3 STATS CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              variant="blue"
              title={
                filterGrade === 'Tất cả khối'
                  ? 'Tổng số bài giảng 5E'
                  : `Tổng số bài giảng (${filterGrade})`
              }
              value={`${filteredLessons.length} Bài giảng`}
              subtext={
                filterGrade === 'Khối 3'
                  ? 'Định tuyến qua CSDL chuyên biệt Khối 3'
                  : 'Bài giảng tương tác chuẩn sư phạm 5E'
              }
              icon={BookOpen}
            />
            <StatCard
              variant="green"
              title="Tỷ lệ đã xuất bản / kiểm duyệt"
              value={`${publishedAndApprovedPercent}% Đã duyệt & xuất bản`}
              subtext="Đạt chuẩn kiểm duyệt tổ chuyên môn"
              icon={CheckCircle2}
            />
            <StatCard
              variant="purple"
              title="Lượt truy cập tích luỹ"
              value={`${totalViews.toLocaleString('vi-VN')} Lượt truy cập`}
              subtext="Tổng lượt học sinh tham gia học tập"
              icon={Users}
            />
          </div>

          {/* 3. THANH CÔNG CỤ TÌM KIẾM, PHÂN LOẠI NGUỒN & BỘ LỌC */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
            {/* Top row: Resource source tabs + Search input */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Segmented Resource Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl self-start">
                <button
                  type="button"
                  onClick={() => setMainTab('all')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    mainTab === 'all'
                      ? 'bg-white text-indigo-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Toàn bộ bài giảng</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainTab('my')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    mainTab === 'my'
                      ? 'bg-white text-indigo-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Home className="w-3.5 h-3.5 text-blue-600" />
                  <span>Bài của tôi</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainTab('colleague')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    mainTab === 'colleague'
                      ? 'bg-white text-indigo-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-teal-600" />
                  <span>Bài từ đồng nghiệp</span>
                </button>
              </div>

              {/* Search box */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm tên bài giảng 5E, chủ đề, môn học, mã bài..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Xóa từ khóa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Bottom row: Dropdown filters & View Mode toggle */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* Dropdown 1: Tất cả môn */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="bg-transparent appearance-none pr-3 outline-none cursor-pointer font-bold text-slate-800"
                  >
                    <option value="Tất cả môn">Tất cả môn học</option>
                    {SUBJECTS.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>

                {/* Dropdown 2: Tất cả khối */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700">
                  <Filter className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <select
                    value={filterGrade}
                    onChange={(e) => handleSelectGradeCard(e.target.value)}
                    className="bg-transparent appearance-none pr-3 outline-none cursor-pointer font-bold text-slate-800"
                  >
                    <option value="Tất cả khối">Tất cả khối (K1 - K5)</option>
                    {GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>

                {/* Dropdown 3: Trạng thái */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-transparent appearance-none pr-3 outline-none cursor-pointer font-bold text-slate-800"
                  >
                    <option value="Tất cả trạng thái">Tất cả trạng thái</option>
                    <option value="Đã xuất bản">Đã xuất bản</option>
                    <option value="Bản nháp">Bản nháp</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>

                {/* Dropdown 4: Sắp xếp */}
                <div className="flex items-center gap-2 bg-blue-50/70 border border-blue-200 px-3.5 py-2 rounded-xl text-xs font-bold text-blue-900">
                  <select
                    value={filterSort}
                    onChange={(e) => setFilterSort(e.target.value)}
                    className="bg-transparent appearance-none pr-3 outline-none cursor-pointer font-extrabold text-blue-900"
                  >
                    <option value="Mới nhất (Thời gian)">Mới nhất (Thời gian)</option>
                    <option value="Lượt truy cập cao">Lượt truy cập cao</option>
                    <option value="Tên A-Z">Tên bài giảng A-Z</option>
                    <option value="Cũ nhất">Cũ nhất</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-blue-700 shrink-0" />
                </div>

                {(filterGrade !== 'Tất cả khối' ||
                  filterSubject !== 'Tất cả môn' ||
                  filterStatus !== 'Tất cả trạng thái' ||
                  searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterGrade('Tất cả khối');
                      setFilterSubject('Tất cả môn');
                      setFilterStatus('Tất cả trạng thái');
                      setSearchQuery('');
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Đặt lại bộ lọc
                  </button>
                )}
              </div>

              {/* View mode toggle buttons */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Hiển thị dạng lưới thẻ hiện đại"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dạng lưới</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Hiển thị dạng danh sách bảng"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Danh sách</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. DANH SÁCH THẺ BÀI GIẢNG (GRID HOẶC LIST) */}
          {filteredLessons.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center flex flex-col items-center justify-center border border-slate-200/80 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                <BookOpen className="w-7 h-7" />
              </div>
              <p className="text-base font-extrabold text-slate-800">
                Chưa có bài giảng 5E nào trong {filterGrade === 'Tất cả khối' ? 'danh mục đang lọc' : filterGrade}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
                Thầy/Cô có thể chọn khối lớp khác trên thanh chọn khối hoặc bấm thêm mới bài giảng tương tác chuẩn 5E.
              </p>
              {userRole !== 'student' && (
                <button
                  type="button"
                  onClick={handleStartCreateNew}
                  className="mt-4 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Soạn bài giảng 5E mới ngay</span>
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {paginatedLessons.map((lesson, idx) => {
                const isApproved = (lesson as any).isApproved !== false;
                const isDraft = (lesson as any).status === 'draft';
                const codeStr = (lesson as any).code || `5E-K${(lesson.grade || '3').replace(/[^0-9]/g, '') || '3'}-T${idx + 1}`;
                const viewsCount = (lesson as any).viewsCount || 0;
                const subjColor = getSubjectColorStyles(lesson.subject);
                const perms = getContentPermissions(lesson, accessContext);
                const isGrade3Lesson =
                  (lesson.grade || '').trim().toLowerCase() === 'khối 3';

                // Check 5E steps readiness
                const steps5E = [
                  {
                    code: 'E1',
                    label: 'Khởi động',
                    ready: Boolean(
                      lesson.stepEngage?.objectives ||
                        lesson.stepEngage?.studentActivities ||
                        lesson.stepEngage?.teacherActivities ||
                        (lesson as any).engageQuizQuestions?.length
                    ),
                  },
                  {
                    code: 'E2-E3',
                    label: 'Khám phá & Giải thích',
                    ready: Boolean(
                      lesson.stepExplore?.objectives ||
                        lesson.stepExplore?.studentActivities ||
                        (lesson as any).videoUrl ||
                        (lesson as any).interactiveVideo
                    ),
                  },
                  {
                    code: 'E4',
                    label: 'Luyện tập mở rộng',
                    ready: Boolean(
                      lesson.stepElaborate?.objectives ||
                        lesson.stepElaborate?.studentActivities ||
                        (lesson as any).elaborateGames?.length
                    ),
                  },
                  {
                    code: 'E5',
                    label: 'Vận dụng & Đánh giá',
                    ready: Boolean(
                      lesson.stepEvaluate?.objectives ||
                        lesson.stepEvaluate?.studentActivities ||
                        (lesson as any).assessmentQuestions?.length
                    ),
                  },
                ];

                return (
                  <div
                    key={lesson.id}
                    className={`bg-white rounded-3xl border border-slate-200/85 ${subjColor.cardBorderHover} shadow-xs hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between relative group overflow-hidden`}
                  >
                    {/* Top Subject Gradient Accent Bar */}
                    <div className={`h-2 w-full ${subjColor.topBarBg}`} />

                    <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-3.5">
                        {/* Row 1: Subject, Grade & Approval / Publication Status */}
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold uppercase tracking-wide ${subjColor.badgeClass}`}
                            >
                              {lesson.subject || subjColor.name}
                            </span>

                            <span
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border ${
                                isGrade3Lesson
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200/80'
                              }`}
                            >
                              {lesson.grade || 'Khối 3'}
                            </span>

                            {isGrade3Lesson && grade3DbConfig.enabled && (
                              <span
                                className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/80 text-[10px] font-bold inline-flex items-center gap-1"
                                title="Bài giảng được đồng bộ trên luồng CSDL chuyên biệt Khối 3"
                              >
                                <Database className="w-2.5 h-2.5" />
                                <span>CSDL K3</span>
                              </span>
                            )}
                          </div>

                          {/* Publication Status Dropdown */}
                          <div
                            className="relative inline-block"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setOpenDropdown((prev) =>
                                  prev?.lessonId === lesson.id && prev?.type === 'status'
                                    ? null
                                    : { lessonId: lesson.id, type: 'status' }
                                )
                              }
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border select-none ${
                                isDraft
                                  ? 'bg-amber-50 text-amber-800 border-amber-300/80 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-300/80 hover:bg-emerald-100'
                              }`}
                              title="Nhấp để đổi nhanh trạng thái: Đã xuất bản / Bản nháp"
                            >
                              <span>{isDraft ? 'Bản nháp' : 'Đã xuất bản'}</span>
                              <ChevronDown className="w-3 h-3 opacity-60" />
                            </button>

                            {openDropdown?.lessonId === lesson.id &&
                              openDropdown?.type === 'status' && (
                                <div
                                  className="absolute top-full right-0 mt-1.5 w-44 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="px-3 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                                    Trạng thái xuất bản
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) =>
                                      handleQuickChangeStatus(lesson, 'published', e)
                                    }
                                    className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer hover:bg-emerald-50 ${
                                      !isDraft
                                        ? 'text-emerald-700 bg-emerald-50/70 font-black'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    <span>Đã xuất bản</span>
                                    {!isDraft && (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => handleQuickChangeStatus(lesson, 'draft', e)}
                                    className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer hover:bg-amber-50 ${
                                      isDraft
                                        ? 'text-amber-700 bg-amber-50/70 font-black'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    <span>Bản nháp</span>
                                    {isDraft && <Check className="w-3.5 h-3.5 text-amber-600" />}
                                  </button>
                                </div>
                              )}
                          </div>
                        </div>

                        {/* Row 2: Lesson Title & Topic */}
                        <div className="space-y-1.5">
                          {perms.isShared && !perms.isOwner && (
                            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-purple-700">
                              <Share2 className="w-3 h-3" />
                              <span>Chia sẻ bởi {perms.ownerName}</span>
                            </div>
                          )}

                          <h3
                            onClick={() => {
                              setSelectedLesson(lesson);
                              setActiveTab('viewer');
                            }}
                            className="text-base sm:text-[17px] font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors font-heading leading-snug cursor-pointer line-clamp-2"
                          >
                            {lesson.title}
                          </h3>

                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            <span className="font-semibold text-slate-600">Chủ đề:</span>{' '}
                            {lesson.topic ||
                              lesson.title ||
                              'Bài học tương tác chuẩn mô hình 5E phát triển phẩm chất & năng lực học sinh.'}
                          </p>
                        </div>

                        {/* Row 3: Visual 5E Pedagogical Model Strip */}
                        <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-extrabold text-indigo-950 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Tiến trình Sư phạm 5E</span>
                            </span>

                            {/* Content Approval Status */}
                            <div
                              className="relative inline-block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canReviewContent ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenDropdown((prev) =>
                                      prev?.lessonId === lesson.id &&
                                      prev?.type === 'approval'
                                        ? null
                                        : { lessonId: lesson.id, type: 'approval' }
                                    )
                                  }
                                  className={`inline-flex items-center gap-1 text-[11px] font-extrabold cursor-pointer select-none ${
                                    isApproved ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                  title="Nhấp để đổi trạng thái kiểm duyệt chuyên môn"
                                >
                                  {isApproved ? (
                                    <>
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Đã duyệt nội dung</span>
                                    </>
                                  ) : (
                                    <>
                                      <Bell className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Chờ duyệt</span>
                                    </>
                                  )}
                                  <ChevronDown className="w-3 h-3 opacity-60" />
                                </button>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${
                                    isApproved ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isApproved ? (
                                    <>
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Đã duyệt nội dung</span>
                                    </>
                                  ) : (
                                    <>
                                      <Bell className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Chờ duyệt nội dung</span>
                                    </>
                                  )}
                                </span>
                              )}

                              {canReviewContent &&
                                openDropdown?.lessonId === lesson.id &&
                                openDropdown?.type === 'approval' && (
                                  <div
                                    className="absolute top-full right-0 mt-1.5 w-48 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="px-3 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                                      Kiểm duyệt chuyên môn
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleQuickChangeApproval(lesson, true, e)
                                      }
                                      className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer hover:bg-emerald-50 ${
                                        isApproved
                                          ? 'text-emerald-700 bg-emerald-50/70 font-black'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Đã duyệt nội dung</span>
                                      </div>
                                      {isApproved && (
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleQuickChangeApproval(lesson, false, e)
                                      }
                                      className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer hover:bg-amber-50 ${
                                        !isApproved
                                          ? 'text-amber-700 bg-amber-50/70 font-black'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <Bell className="w-3.5 h-3.5 text-amber-600" />
                                        <span>Chưa duyệt nội dung</span>
                                      </div>
                                      {!isApproved && (
                                        <Check className="w-3.5 h-3.5 text-amber-600" />
                                      )}
                                    </button>
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* 4 Steps Mini Progress Bar */}
                          <div className="grid grid-cols-4 gap-1.5">
                            {steps5E.map((st, sIdx) => (
                              <div
                                key={st.code}
                                title={`${st.code}: ${st.label}`}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold text-center truncate border ${
                                  st.ready
                                    ? sIdx === 0
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : sIdx === 1
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : sIdx === 2
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-white text-slate-400 border-slate-200/70'
                                }`}
                              >
                                {st.code}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Row 4: Duration, Views & Code */}
                        <div className="flex items-center justify-between text-xs text-slate-600 pt-0.5 tabular-nums">
                          <div className="flex items-center gap-3.5 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                              <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{lesson.duration || '35 phút'}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                              <Eye className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>{viewsCount.toLocaleString('vi-VN')} lượt truy cập</span>
                            </span>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-slate-400">
                            {codeStr}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Action Bar */}
                      <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Giao bài */}
                          {perms.canAssign && (
                            <button
                              type="button"
                              onClick={() => setAssigningLesson(lesson)}
                              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 text-xs font-extrabold whitespace-nowrap"
                              title="Giao bài giảng cho lớp"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Giao bài</span>
                            </button>
                          )}

                          {/* Thống kê */}
                          {perms.canView && (
                            <button
                              type="button"
                              onClick={() => setStatsLesson(lesson)}
                              className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                              title="Xem thống kê học sinh học bài"
                            >
                              <BarChart2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Tải QR / Phiếu */}
                          {userRole !== 'student' && (
                            <button
                              type="button"
                              onClick={() =>
                                setExportModalState({
                                  isOpen: true,
                                  lessons: [lesson],
                                  titleContext: `Phiếu bài giảng: ${lesson.title}`,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200/80 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-extrabold whitespace-nowrap"
                              title="Tải phiếu Word (.docx) kèm Mã QR của bài giảng này"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Mã QR</span>
                            </button>
                          )}
                        </div>

                        {/* Right: Edit, Share, Delete */}
                        <div className="flex items-center gap-1">
                          {userRole !== 'student' && (
                            <>
                              {perms.canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLesson(lesson);
                                    setIsModalOpen(true);
                                  }}
                                  className="p-2 rounded-xl bg-slate-50 hover:bg-amber-50 text-slate-500 hover:text-amber-600 transition-all cursor-pointer border border-slate-100"
                                  title="Chỉnh sửa bài giảng 5E"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              )}

                              {perms.canShare && (
                                <button
                                  type="button"
                                  onClick={() => setSharingLesson(lesson)}
                                  className="p-2 rounded-xl bg-slate-50 hover:bg-sky-50 text-slate-500 hover:text-sky-600 transition-all cursor-pointer border border-slate-100"
                                  title="Chia sẻ với đồng nghiệp"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                              )}

                              {perms.canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingLesson(lesson)}
                                  className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all cursor-pointer border border-slate-100"
                                  title="Xóa bài giảng"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* LIST VIEW (DẠNG DANH SÁCH BẢNG HIỆN ĐẠI) */
            <div className="bg-white rounded-3xl border border-slate-200/85 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-5">Bài giảng 5E &amp; Chủ đề</th>
                      <th className="py-3.5 px-4">Môn học &amp; Khối</th>
                      <th className="py-3.5 px-4">Kiểm duyệt &amp; Xuất bản</th>
                      <th className="py-3.5 px-4">Thời lượng &amp; Truy cập</th>
                      <th className="py-3.5 px-5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedLessons.map((lesson) => {
                      const isApproved = (lesson as any).isApproved !== false;
                      const isDraft = (lesson as any).status === 'draft';
                      const viewsCount = (lesson as any).viewsCount || 0;
                      const subjColor = getSubjectColorStyles(lesson.subject);
                      const perms = getContentPermissions(lesson, accessContext);
                      const isGrade3Lesson =
                        (lesson.grade || '').trim().toLowerCase() === 'khối 3';

                      return (
                        <tr
                          key={lesson.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-4 px-5 max-w-md">
                            <div
                              onClick={() => {
                                setSelectedLesson(lesson);
                                setActiveTab('viewer');
                              }}
                              className="font-extrabold text-sm text-slate-900 hover:text-blue-600 cursor-pointer leading-snug"
                            >
                              {lesson.title}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                              Chủ đề: {lesson.topic || lesson.title}
                            </div>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase ${subjColor.badgeClass}`}
                              >
                                {lesson.subject}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                {lesson.grade}
                              </span>
                              {isGrade3Lesson && grade3DbConfig.enabled && (
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                  CSDL K3
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                  isDraft
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {isDraft ? 'Bản nháp' : 'Đã xuất bản'}
                              </span>
                              <span
                                className={`text-[11px] font-bold ${
                                  isApproved ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {isApproved ? '✓ Đã duyệt' : 'Chờ duyệt'}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap tabular-nums">
                            <div className="font-bold text-slate-800">
                              {lesson.duration || '35 phút'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {viewsCount.toLocaleString('vi-VN')} lượt truy cập
                            </div>
                          </td>

                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {perms.canAssign && (
                                <button
                                  type="button"
                                  onClick={() => setAssigningLesson(lesson)}
                                  className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Giao bài
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setExportModalState({
                                    isOpen: true,
                                    lessons: [lesson],
                                    titleContext: `Phiếu bài giảng: ${lesson.title}`,
                                  })
                                }
                                className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer"
                                title="Mã QR / Phiếu Word"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                              {perms.canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLesson(lesson);
                                    setIsModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700 cursor-pointer"
                                  title="Chỉnh sửa"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {perms.canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingLesson(lesson)}
                                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 cursor-pointer"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAGINATION BAR */}
          <div className="bg-white rounded-3xl p-4 px-5 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold text-slate-600 shadow-2xs">
            <div className="tabular-nums">
              Hiển thị{' '}
              <span className="text-slate-900 font-extrabold">
                {paginatedLessons.length}
              </span>{' '}
              trên tổng số{' '}
              <span className="text-slate-900 font-extrabold">
                {filteredLessons.length}
              </span>{' '}
              bài giảng 5E
              {filterGrade !== 'Tất cả khối' && (
                <span className="text-indigo-600 ml-1">({filterGrade})</span>
              )}
            </div>
            <div className="flex items-center gap-2 tabular-nums">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl transition-all flex items-center gap-1 cursor-pointer font-bold"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Trước</span>
              </button>
              <span className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-900 font-extrabold">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl transition-all flex items-center gap-1 cursor-pointer font-bold"
              >
                <span>Sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* EDITOR: Create / Edit 5E Plan with AI Generator */}
      {activeTab === 'editor' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <button
              onClick={() => setActiveTab('list')}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Danh sách bài giảng
            </button>
            <div className="text-xs font-bold text-slate-500">
              {editingLesson ? 'Chỉnh sửa bài giảng 5E' : 'Soạn bài giảng 5E mới'}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
            {/* AI Generator Panel */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 rounded-2xl p-6 text-white space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-base font-heading">
                  <Sparkles className="w-5 h-5 text-amber-300" /> Công Cụ Gợi Ý Nội Dung AI Gemini
                </div>
                <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full text-amber-200">
                  Tự động điền 4 bước chuẩn Sư phạm
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-blue-100 mb-1">
                    Chủ Đề Tên Bài Học:
                  </label>
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="Ví dụ: Truyền thống trường em / Tính chất của nước..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-100 mb-1">Môn Học:</label>
                  <select
                    value={subjectInput}
                    onChange={(e) => setSubjectInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-white/20 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-100 mb-1">Khối Lớp:</label>
                  <select
                    value={gradeInput}
                    onChange={(e) => setGradeInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-white/20 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleAiSuggest5E}
                  disabled={isAiGenerating || !topicInput.trim()}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-indigo-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isAiGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-950" />
                      AI Đang Soạn Giáo Án 5E...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-indigo-950" /> Khởi Tạo Nội Dung Bài Giảng 5E Bằng AI
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Form Fields: General Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Bài Giảng:</label>
                <input
                  type="text"
                  value={currentPlan.title}
                  onChange={(e) => setCurrentPlan({ ...currentPlan, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Thời Lượng (Phút):
                </label>
                <input
                  type="text"
                  value={currentPlan.duration}
                  onChange={(e) => setCurrentPlan({ ...currentPlan, duration: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tác Giả / Người Soạn:
                </label>
                <input
                  type="text"
                  value={currentPlan.authorName}
                  onChange={(e) => setCurrentPlan({ ...currentPlan, authorName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>

            {/* 4 Steps Detailed Form Accordion / Grid */}
            <div className="space-y-6">
              {/* Step 1: Engage */}
              <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-900 font-heading">
                  <span className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs">
                    1
                  </span>
                  <span>BƯỚC 1: KHỞI ĐỘNG (ENGAGE)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mục tiêu khởi động:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepEngage.objectives}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEngage: { ...currentPlan.stepEngage, objectives: e.target.value },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-amber-200 focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Thiết bị &amp; Học liệu:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepEngage.materials}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEngage: { ...currentPlan.stepEngage, materials: e.target.value },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-amber-200 focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Giáo viên:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepEngage.teacherActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEngage: {
                            ...currentPlan.stepEngage,
                            teacherActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-amber-200 focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Học sinh:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepEngage.studentActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEngage: {
                            ...currentPlan.stepEngage,
                            studentActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-amber-200 focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Explore & Explain */}
              <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-blue-900 font-heading">
                  <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                    2
                  </span>
                  <span>BƯỚC 2: KHÁM PHÁ &amp; HÌNH THÀNH KIẾN THỨC (EXPLORE &amp; EXPLAIN)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mục tiêu khám phá:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepExplore.objectives}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepExplore: { ...currentPlan.stepExplore, objectives: e.target.value },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Thiết bị &amp; Phiếu học tập:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepExplore.materials}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepExplore: { ...currentPlan.stepExplore, materials: e.target.value },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Giáo viên:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepExplore.teacherActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepExplore: {
                            ...currentPlan.stepExplore,
                            teacherActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Học sinh:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepExplore.studentActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepExplore: {
                            ...currentPlan.stepExplore,
                            studentActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Elaborate */}
              <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-indigo-900 font-heading">
                  <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                    3
                  </span>
                  <span>BƯỚC 3: LUYỆN TẬP (ELABORATE)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mục tiêu luyện tập:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepElaborate.objectives}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepElaborate: {
                            ...currentPlan.stepElaborate,
                            objectives: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ngân hàng bài tập:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepElaborate.materials}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepElaborate: {
                            ...currentPlan.stepElaborate,
                            materials: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Giáo viên:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepElaborate.teacherActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepElaborate: {
                            ...currentPlan.stepElaborate,
                            teacherActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Học sinh:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepElaborate.studentActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepElaborate: {
                            ...currentPlan.stepElaborate,
                            studentActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: Evaluate */}
              <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 font-heading">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                    4
                  </span>
                  <span>BƯỚC 4: VẬN DỤNG &amp; ĐÁNH GIÁ (EVALUATE)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mục tiêu vận dụng:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepEvaluate.objectives}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEvaluate: { ...currentPlan.stepEvaluate, objectives: e.target.value },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Rubric đánh giá:
                    </label>
                    <textarea
                      rows={2}
                      value={currentPlan.stepEvaluate.materials}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEvaluate: { ...currentPlan.stepEvaluate, materials: e.target.value },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Giáo viên:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepEvaluate.teacherActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEvaluate: {
                            ...currentPlan.stepEvaluate,
                            teacherActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hoạt động của Học sinh:
                    </label>
                    <textarea
                      rows={3}
                      value={currentPlan.stepEvaluate.studentActivities}
                      onChange={(e) =>
                        setCurrentPlan({
                          ...currentPlan,
                          stepEvaluate: {
                            ...currentPlan.stepEvaluate,
                            studentActivities: e.target.value,
                          },
                        })
                      }
                      className="w-full p-2.5 text-xs rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setActiveTab('list')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={handleSaveCurrentPlan}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md shadow-blue-200 flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" /> Lưu Bài Giảng 5E
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEWER: Full Pedagogical 5E Lesson Document View */}
      {activeTab === 'viewer' &&
        selectedLesson &&
        !getContentPermissions(selectedLesson, accessContext).canView && (
          <div className="bg-white rounded-2xl p-12 border border-rose-200 shadow-sm text-center max-w-xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto font-black text-lg">
              !
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Bạn không có quyền xem nội dung này
            </h3>
            <p className="text-xs text-slate-500">
              Bài giảng này thuộc sở hữu của giáo viên khác và chưa được chia sẻ cho bạn hoặc tổ chuyên môn của bạn.
            </p>
            <button
              onClick={() => {
                setSelectedLesson(null);
                setActiveTab('list');
              }}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
            >
              Quay về danh sách
            </button>
          </div>
        )}

      {activeTab === 'viewer' &&
        selectedLesson &&
        getContentPermissions(selectedLesson, accessContext).canView && (
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-md space-y-6 max-w-4xl mx-auto print:shadow-none print:border-none print:p-0">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 print:hidden">
              <button
                onClick={() => setActiveTab('list')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Trở về danh sách bài giảng
              </button>

              <div className="flex items-center gap-2">
                {getContentPermissions(selectedLesson, accessContext).canEdit && (
                  <button
                    onClick={() => {
                      setEditingLesson(selectedLesson);
                      setIsModalOpen(true);
                    }}
                    className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Chỉnh sửa
                  </button>
                )}

                <button
                  onClick={handlePrintLesson}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" /> In / Xuất File PDF
                </button>
              </div>
            </div>

            {/* Official Document Banner */}
            <div className="text-center space-y-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                GIÁO ÁN ĐIỆN TỬ THEO MÔ HÌNH 5E SƯ PHẠM
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 font-heading">
                {selectedLesson.title}
              </h1>
              <p className="text-xs text-slate-600 font-medium">
                Môn học: <strong>{selectedLesson.subject}</strong> | Khối:{' '}
                <strong>{selectedLesson.grade}</strong> | Thời lượng:{' '}
                <strong>{selectedLesson.duration}</strong>
              </p>
              <p className="text-[11px] text-slate-400">
                Người soạn: {selectedLesson.authorName} • Ngày lập: {selectedLesson.createdAt}
              </p>
            </div>

            {/* OBJECTIVES PANEL IN VIEWER */}
            {selectedLesson.objectivesContent && (
              <div className="bg-white rounded-2xl p-5 border border-indigo-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
                  <span>🎯 Mục tiêu bài học</span>
                </div>
                <div className="space-y-2">
                  {selectedLesson.objectivesContent
                    .split('\n')
                    .filter((l) => l.trim() !== '')
                    .map((line, idx) => {
                      const trimmed = line.trim();
                      const lower = trimmed.toLowerCase();

                      let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      let iconLabel = '📖';
                      let groupName = 'Mục tiêu';

                      if (
                        lower.includes('kiến thức') ||
                        lower.includes('hiểu') ||
                        lower.includes('nắm') ||
                        lower.includes('nhận biết')
                      ) {
                        badgeBg = 'bg-blue-50 text-blue-700 border-blue-200';
                        iconLabel = '📚';
                        groupName = 'Kiến thức';
                      } else if (
                        lower.includes('kỹ năng') ||
                        lower.includes('vận dụng') ||
                        lower.includes('thực hành') ||
                        lower.includes('giải')
                      ) {
                        badgeBg = 'bg-amber-50 text-amber-700 border-amber-200';
                        iconLabel = '🛠️';
                        groupName = 'Kỹ năng';
                      } else if (
                        lower.includes('phẩm chất') ||
                        lower.includes('thái độ') ||
                        lower.includes('yêu') ||
                        lower.includes('giúp') ||
                        lower.includes('cẩn thận')
                      ) {
                        badgeBg = 'bg-purple-50 text-purple-700 border-purple-200';
                        iconLabel = '💖';
                        groupName = 'Thái độ';
                      }

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-extrabold text-xs shrink-0">
                              {idx + 1}
                            </div>
                            <div className="space-y-0.5">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${badgeBg}`}
                              >
                                {iconLabel} {groupName}
                              </span>
                              <p className="text-xs text-slate-800 font-medium leading-relaxed">
                                {trimmed}
                              </p>
                            </div>
                          </div>
                          <div className="text-emerald-600 text-xs font-bold px-2 py-1">✓</div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 4 Steps Formatted Table */}
            <div className="space-y-6 pt-4">
              {/* Step 1 */}
              <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/30">
                <div className="bg-amber-500 text-white px-4 py-2 font-bold text-xs uppercase flex items-center justify-between">
                  <span>1. KHỞI ĐỘNG (ENGAGE)</span>
                  {selectedLesson.stepEngage.materials && (
                    <span className="text-[10px] opacity-90">
                      Học liệu: {selectedLesson.stepEngage.materials}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-2 text-xs text-slate-800">
                  {selectedLesson.stepEngage.objectives &&
                    selectedLesson.stepEngage.objectives !==
                      selectedLesson.stepEngage.studentActivities && (
                      <div>
                        <strong>Mục tiêu:</strong> {selectedLesson.stepEngage.objectives}
                      </div>
                    )}
                  <div
                    className={`grid ${
                      selectedLesson.stepEngage.teacherActivities
                        ? 'grid-cols-1 sm:grid-cols-2'
                        : 'grid-cols-1'
                    } gap-4 pt-2 border-t border-amber-100`}
                  >
                    {selectedLesson.stepEngage.teacherActivities && (
                      <div>
                        <strong className="text-amber-900">Hoạt động Giáo viên:</strong>
                        <p className="mt-1 whitespace-pre-wrap">
                          {selectedLesson.stepEngage.teacherActivities}
                        </p>
                      </div>
                    )}
                    <div>
                      <strong className="text-amber-900">Nội dung hướng dẫn khởi động:</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {selectedLesson.stepEngage.studentActivities ||
                          selectedLesson.stepEngage.objectives}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="border border-blue-200 rounded-xl overflow-hidden bg-blue-50/30">
                <div className="bg-blue-600 text-white px-4 py-2 font-bold text-xs uppercase flex items-center justify-between">
                  <span>2. KHÁM PHÁ &amp; HÌNH THÀNH KIẾN THỨC (EXPLORE &amp; EXPLAIN)</span>
                  {selectedLesson.stepExplore.materials && (
                    <span className="text-[10px] opacity-90">
                      Học liệu: {selectedLesson.stepExplore.materials}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-2 text-xs text-slate-800">
                  <div>
                    <strong>Mục tiêu:</strong> {selectedLesson.stepExplore.objectives}
                  </div>
                  <div
                    className={`grid ${
                      selectedLesson.stepExplore.teacherActivities
                        ? 'grid-cols-1 sm:grid-cols-2'
                        : 'grid-cols-1'
                    } gap-4 pt-2 border-t border-blue-100`}
                  >
                    {selectedLesson.stepExplore.teacherActivities && (
                      <div>
                        <strong className="text-blue-900">Hoạt động Giáo viên:</strong>
                        <p className="mt-1 whitespace-pre-wrap">
                          {selectedLesson.stepExplore.teacherActivities}
                        </p>
                      </div>
                    )}
                    <div>
                      <strong className="text-blue-900">Hướng dẫn cho Học sinh:</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {selectedLesson.stepExplore.studentActivities}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="border border-indigo-200 rounded-xl overflow-hidden bg-indigo-50/30">
                <div className="bg-indigo-600 text-white px-4 py-2 font-bold text-xs uppercase flex items-center justify-between">
                  <span>3. LUYỆN TẬP (ELABORATE)</span>
                  <span className="text-[10px] opacity-90">
                    Học liệu: {selectedLesson.stepElaborate.materials}
                  </span>
                </div>
                <div className="p-4 space-y-2 text-xs text-slate-800">
                  <div>
                    <strong>Mục tiêu:</strong> {selectedLesson.stepElaborate.objectives}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-indigo-100">
                    <div>
                      <strong className="text-indigo-900">Hoạt động Giáo viên:</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {selectedLesson.stepElaborate.teacherActivities}
                      </p>
                    </div>
                    <div>
                      <strong className="text-indigo-900">Hoạt động Học sinh:</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {selectedLesson.stepElaborate.studentActivities}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="border border-emerald-200 rounded-xl overflow-hidden bg-emerald-50/30">
                <div className="bg-emerald-600 text-white px-4 py-2 font-bold text-xs uppercase flex items-center justify-between">
                  <span>4. VẬN DỤNG (EVALUATE)</span>
                  <span className="text-[10px] opacity-90">
                    Đánh giá: {selectedLesson.stepEvaluate.materials}
                  </span>
                </div>
                <div className="p-4 space-y-2 text-xs text-slate-800">
                  <div>
                    <strong>Mục tiêu:</strong> {selectedLesson.stepEvaluate.objectives}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-emerald-100">
                    <div>
                      <strong className="text-emerald-900">Hoạt động Giáo viên:</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {selectedLesson.stepEvaluate.teacherActivities}
                      </p>
                    </div>
                    <div>
                      <strong className="text-emerald-900">Hoạt động Học sinh:</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {selectedLesson.stepEvaluate.studentActivities}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* LESSON 5E MODAL */}
      {isModalOpen && (
        <Lesson5EModal
          key={editingLesson ? `edit-${editingLesson.id}` : 'create-new'}
          isOpen={isModalOpen}
          mode={editingLesson ? 'edit' : 'create'}
          initialData={editingLesson}
          initialLesson={editingLesson}
          onClose={() => {
            setIsModalOpen(false);
            setEditingLesson(null);
          }}
          onSave={(lesson) => {
            try {
              handleSaveLessonWithGrade3Routing(lesson);
              setIsModalOpen(false);
              setEditingLesson(null);
              setAssignedToast(
                editingLesson
                  ? 'Đã cập nhật bài giảng thành công!'
                  : 'Đã lưu bài giảng hoàn tất thành công!'
              );
              setTimeout(() => setAssignedToast(null), 3500);
            } catch {
              setAssignedToast('Lưu thất bại, vui lòng kiểm tra lại!');
              setTimeout(() => setAssignedToast(null), 3500);
            }
          }}
        />
      )}

      {/* GRADE 3 DEDICATED DATABASE CONFIGURATION MODAL */}
      <Grade3DatabaseConfigModal
        isOpen={isGrade3ConfigModalOpen}
        onClose={() => setIsGrade3ConfigModalOpen(false)}
        grade3Lessons={grade3LessonsList}
        onSynced={(updatedCfg) => {
          setGrade3DbConfig(updatedCfg);
          handleSyncGrade3Database(true);
        }}
      />

      {/* SHARE MODAL */}
      <ShareContentModal
        isOpen={!!sharingLesson}
        onClose={() => setSharingLesson(null)}
        contentType="lesson"
        content={
          sharingLesson
            ? {
                id: sharingLesson.id,
                title: sharingLesson.title,
                grade: sharingLesson.grade,
                subject: sharingLesson.subject,
                sharedWithTeachers: sharingLesson.sharedWithTeachers,
                sharedWithGroups: sharingLesson.sharedWithGroups,
                sharePermission: sharingLesson.sharePermission,
                allowDeleteByShared: sharingLesson.allowDeleteByShared,
              }
            : null
        }
        onConfirmShare={(payload) => {
          if (sharingLesson) {
            handleSaveLessonWithGrade3Routing({
              ...sharingLesson,
              sharedWithTeachers: payload.sharedWithTeachers,
              sharedWithGroups: payload.sharedWithGroups,
              sharePermission: payload.sharePermission,
              allowDeleteByShared: payload.allowDeleteByShared,
            });
          }
          setAssignedToast(
            payload.revoked
              ? `Đã thu hồi chia sẻ bài giảng "${payload.title}"!`
              : `Đã chia sẻ bài giảng "${payload.title}" thành công!`
          );
          setTimeout(() => setAssignedToast(null), 3500);
          setSharingLesson(null);
        }}
      />

      {/* MODAL GIAO BÀI E-LEARNING */}
      <ELearningAssignmentModal
        isOpen={!!assigningLesson}
        onClose={() => setAssigningLesson(null)}
        lesson={assigningLesson}
        onConfirmSuccess={(assignedData) => {
          setAssignedToast(
            `Đã giao bài học E-Learning thành công cho ${assignedData.targetClass}!`
          );
          setTimeout(() => setAssignedToast(null), 4000);
        }}
      />

      {/* MODAL THỐNG KÊ TIẾN ĐỘ HỌC TẬP */}
      <LessonProgressStatsModal
        isOpen={!!statsLesson}
        onClose={() => setStatsLesson(null)}
        lesson={statsLesson}
      />

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        isOpen={!!deletingLesson}
        onClose={() => setDeletingLesson(null)}
        onConfirm={() => {
          if (deletingLesson) {
            const perms = getContentPermissions(deletingLesson, accessContext);
            if (!perms.canDelete) {
              setAssignedToast('Bạn không có quyền xóa nội dung này!');
              setTimeout(() => setAssignedToast(null), 3500);
              setDeletingLesson(null);
              return;
            }
            handleDeleteLessonWithGrade3Routing(deletingLesson.id);
            setDeletingLesson(null);
          }
        }}
        title="Xác nhận xóa bài giảng 5E"
        itemType="bài giảng 5E"
        itemName={deletingLesson?.title}
      />

      {/* MODAL XUẤT DANH MỤC & MÃ QR */}
      <ElearningExportModal
        isOpen={exportModalState.isOpen}
        onClose={() => setExportModalState({ isOpen: false, lessons: [] })}
        lessons={exportModalState.lessons}
        titleContext={exportModalState.titleContext}
      />

      {/* TOAST SUCCESS NOTIFICATION */}
      {assignedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#00875A] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
            ✓
          </div>
          <span className="text-xs sm:text-sm font-bold">{assignedToast}</span>
        </div>
      )}
    </div>
  );
};
