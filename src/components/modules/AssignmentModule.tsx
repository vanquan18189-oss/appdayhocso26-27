import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  RefreshCw,
  ArrowLeft,
  LayoutGrid,
  Database,
  Layers,
  Settings,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { HomeworkAssignment, QuestionItem, UserRole } from '../../types';
import { getCurrentAccessContext } from '../../services/permissionService';
import { auth } from '../../services/firebase';
import {
  Grade3DatabaseConfig,
  DEFAULT_GRADE3_APP_URL,
  getGrade3DbConfig,
  getCachedGrade3Lessons,
} from '../../services/grade3LessonDbService';
import { Grade3DatabaseConfigModal } from './Grade3DatabaseConfigModal';
import { encodeUtf8Base64 } from '../portal/DigitalResourcePortal';
import { buildGrade3EmbeddedSrcDoc } from '../../utils/grade3EmbedLoader';

export interface AssignmentModuleProps {
  assignments: HomeworkAssignment[];
  questionsBank?: QuestionItem[];
  onSaveAssignment: (assignment: HomeworkAssignment) => void;
  onDeleteAssignment?: (id: string) => void;
  userRole: UserRole;
  currentUserId?: string;
  currentUserName?: string;
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
    subtitle: 'Bài tập khởi đầu',
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
    shortTag: 'Lớp 4',
    subtitle: 'Phát triển năng lực',
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

export const AssignmentModule: React.FC<AssignmentModuleProps> = ({
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

  const [grade3DbConfig, setGrade3DbConfig] = useState<Grade3DatabaseConfig>(() =>
    getGrade3DbConfig()
  );
  const [grade3LatencyMs] = useState<number>(
    () => getGrade3DbConfig().lastPingMs || 14
  );
  const [isGrade3ConfigModalOpen, setIsGrade3ConfigModalOpen] = useState(false);

  const [filterGrade, setFilterGrade] = useState('Tất cả khối');

  // Embedded Grade 3 Workspace State (loads directly inside the main content area of App Mẹ)
  const grade3IframeRef = useRef<HTMLIFrameElement | null>(null);
  const [grade3IframeKey, setGrade3IframeKey] = useState<number>(0);
  const [isGrade3IframeLoading, setIsGrade3IframeLoading] = useState<boolean>(true);
  const [grade3SrcDoc, setGrade3SrcDoc] = useState<string | null>(null);

  useEffect(() => {
    const onConfigUpdated = () => {
      setGrade3DbConfig(getGrade3DbConfig());
    };
    window.addEventListener('eduplay_grade3_db_config_updated', onConfigUpdated);
    return () => window.removeEventListener('eduplay_grade3_db_config_updated', onConfigUpdated);
  }, []);

  const grade3SsoPayload = useMemo(() => {
    const teacherEmail = activeTeacherProfile?.email || authEmail || 'thuthuthtk@gmail.com';
    const teacherName = activeTeacherProfile?.name || 'Giáo viên';
    const teacherRole = isAdmin ? 'admin' : userRole || 'teacher';
    const teacherUid = String(activeTeacherProfile?.id || teacherEmail);
    const ssoToken = encodeUtf8Base64({
      email: teacherEmail,
      name: teacherName,
      role: teacherRole,
      uid: teacherUid,
      tab: 'assignment',
      module: 'assignment',
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

  // Build dedicated Grade 3 embedded URL (https://dayhockhoi3.vercel.app) with SSO + assignment module routing
  const grade3EmbeddedUrlWithSso = useMemo(() => {
    const rawBase =
      (grade3DbConfig.externalAppUrl || DEFAULT_GRADE3_APP_URL).trim() ||
      DEFAULT_GRADE3_APP_URL;
    const baseUrl = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;

    try {
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('autologin', 'true');
      urlObj.searchParams.set('auto_login', 'true');
      urlObj.searchParams.set('tab', 'assignment');
      urlObj.searchParams.set('module', 'assignment');
      urlObj.searchParams.set('grade', 'Khối 3');
      if (grade3SsoPayload.email) {
        urlObj.searchParams.set('email', grade3SsoPayload.email);
        urlObj.searchParams.set('sso_email', grade3SsoPayload.email);
      }
      if (grade3SsoPayload.ssoToken) {
        urlObj.searchParams.set('token', grade3SsoPayload.ssoToken);
        urlObj.searchParams.set('sso_token', grade3SsoPayload.ssoToken);
      }
      if (grade3SsoPayload.name) {
        urlObj.searchParams.set('name', grade3SsoPayload.name);
        urlObj.searchParams.set('sso_name', grade3SsoPayload.name);
      }
      if (grade3SsoPayload.role) {
        urlObj.searchParams.set('role', grade3SsoPayload.role);
        urlObj.searchParams.set('sso_role', grade3SsoPayload.role);
      }
      return urlObj.toString();
    } catch {
      return baseUrl;
    }
  }, [grade3DbConfig.externalAppUrl, grade3SsoPayload]);

  const postSsoToGrade3Iframe = useCallback(() => {
    const iframeWindow = grade3IframeRef.current?.contentWindow;
    if (!iframeWindow) return;
    try {
      const payload = {
        autologin: true,
        email: grade3SsoPayload.email,
        name: grade3SsoPayload.name,
        role: grade3SsoPayload.role,
        token: grade3SsoPayload.ssoToken,
        ssoToken: grade3SsoPayload.ssoToken,
        tab: 'assignment',
        module: 'assignment',
        user: {
          email: grade3SsoPayload.email,
          name: grade3SsoPayload.name,
          displayName: grade3SsoPayload.name,
          role: grade3SsoPayload.role,
          uid: grade3SsoPayload.uid,
        },
      };
      iframeWindow.postMessage({ ...payload, type: 'PK_TRUC_KHANG_SSO_LOGIN' }, '*');
      iframeWindow.postMessage({ ...payload, type: 'SSO_AUTO_LOGIN' }, '*');
    } catch {
      // Ignore cross-origin postMessage errors if any
    }
  }, [grade3SsoPayload]);

  // Load HTML of https://dayhockhoi3.vercel.app and inject auto-routing to 'assignment' (Quản lý Bài tập)
  useEffect(() => {
    if (filterGrade !== 'Khối 3') return;
    let cancelled = false;
    setIsGrade3IframeLoading(true);

    const rawBase =
      (grade3DbConfig.externalAppUrl || DEFAULT_GRADE3_APP_URL).trim() ||
      DEFAULT_GRADE3_APP_URL;

    buildGrade3EmbeddedSrcDoc({
      baseUrl: rawBase,
      targetModuleId: 'assignment',
      teacherEmail: grade3SsoPayload.email,
      teacherName: grade3SsoPayload.name,
      teacherRole: grade3SsoPayload.role,
      ssoToken: grade3SsoPayload.ssoToken,
    }).then((docHtml) => {
      if (!cancelled) {
        setGrade3SrcDoc(docHtml);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    filterGrade,
    grade3IframeKey,
    grade3DbConfig.externalAppUrl,
    grade3SsoPayload.email,
    grade3SsoPayload.name,
    grade3SsoPayload.role,
    grade3SsoPayload.ssoToken,
  ]);

  const handleGrade3IframeLoad = useCallback(() => {
    setIsGrade3IframeLoading(false);
    postSsoToGrade3Iframe();
    // Ensure 'sidebar-item-assignment' is activated if same-origin srcDoc is used
    const activateAssignmentTabInDoc = () => {
      try {
        const doc = grade3IframeRef.current?.contentDocument;
        const btn = doc?.getElementById('sidebar-item-assignment');
        if (btn) {
          btn.click();
        }
      } catch {
        // Ignore if cross-origin fallback is active
      }
    };
    activateAssignmentTabInDoc();
    window.setTimeout(() => {
      postSsoToGrade3Iframe();
      activateAssignmentTabInDoc();
    }, 250);
    window.setTimeout(() => {
      postSsoToGrade3Iframe();
      activateAssignmentTabInDoc();
    }, 800);
  }, [postSsoToGrade3Iframe]);

  useEffect(() => {
    if (filterGrade !== 'Khối 3') return;
    const handleMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (
        data &&
        typeof data === 'object' &&
        (data.type === 'PK_TRUC_KHANG_REQUEST_SSO' || data.type === 'KHO_HOC_LIEU_READY')
      ) {
        postSsoToGrade3Iframe();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [filterGrade, postSsoToGrade3Iframe]);

  const handleSelectGradeCard = (gradeValue: string) => {
    setFilterGrade(gradeValue);
    if (gradeValue === 'Khối 3') {
      setIsGrade3IframeLoading(true);
    }
  };

  return (
    <div className="space-y-5 pb-12 w-full">
      {/* MODULE HERO HEADER */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
            <span>Quản Lý Bài Tập &amp; Phiếu Tự Luyện</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-500 font-semibold">Giao Bài &amp; Chấm Tự Động AI</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-600 font-semibold">Thông Tư 27/2020/TT-BGDĐT</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-heading">
            Hệ Thống Quản Lý Bài Tập &amp; Chấm Nhận Xét Tự Động AI
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-3xl leading-relaxed">
            Điều hướng nhanh không gian quản lý bài tập, phiếu rèn luyện và chấm bài tự động theo từng khối lớp từ Khối 1 đến Khối 5.
          </p>
        </div>
      </div>

      {/* THANH CHỌN KHỐI TRỰC QUAN TỪ KHỐI 1 ĐẾN KHỐI 5 */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                Chọn Khối Lớp Quản Lý Bài Tập (Khối 1 – Khối 5)
              </h3>
              <p className="text-[11px] text-slate-500">
                Bấm vào từng thẻ khối để điều hướng sang không gian bài tập chuyên biệt • Riêng Khối 3 nhúng trực tiếp ngay trong App
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
                    ? 'Bấm để tải và nhúng trực tiếp giao diện Quản lý Bài tập Khối 3 ngay trong khung nội dung chính'
                    : `Chọn không gian bài tập ${card.label}`
                }
              >
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
                  </div>

                  <p
                    className={`text-[11px] mt-0.5 truncate ${
                      isSelected ? 'text-white/85 font-medium' : 'text-slate-500'
                    }`}
                  >
                    {card.subtitle}
                  </p>
                </div>

                {/* Bottom Row */}
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
                  ) : (
                    <>
                      <span>Giao &amp; Chấm AI</span>
                      <span>TT27</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KHUNG NHÚNG TRỰC TIẾP GIAO DIỆN QUẢN LÝ BÀI TẬP KHỐI 3 NGAY TRONG APP MẸ */}
      {filterGrade === 'Khối 3' && (
        <div className="bg-white rounded-3xl border border-emerald-200/90 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-emerald-50/95 via-teal-50/80 to-cyan-50/85 border-b border-emerald-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-extrabold text-emerald-950 truncate">
                Đang hiển thị trực tiếp: Quản lý Bài tập Chuyên biệt Khối 3 ({grade3DbConfig.externalAppUrl || DEFAULT_GRADE3_APP_URL})
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white/95 px-2.5 py-0.5 rounded-lg border border-emerald-200 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>SSO: {grade3SsoPayload.name}</span>
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
                title="Tải lại khung giao diện Quản lý Bài tập Khối 3"
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
                onClick={() => setFilterGrade('Tất cả khối')}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Đóng khung K3</span>
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
                    Đang tải giao diện Quản lý Bài tập Khối 3 ngay trong ứng dụng...
                  </p>
                  <p className="text-xs text-slate-500">
                    Tự động đồng bộ phiên đăng nhập của {grade3SsoPayload.name}
                  </p>
                </div>
              </div>
            )}

            {grade3SrcDoc ? (
              <iframe
                ref={grade3IframeRef}
                key={`srcdoc-${grade3IframeKey}`}
                srcDoc={grade3SrcDoc}
                onLoad={handleGrade3IframeLoad}
                title="Giao diện Quản lý Bài tập Chuyên biệt Khối 3"
                className="w-full h-full border-0 bg-white"
                allow="fullscreen; clipboard-read; clipboard-write; microphone; camera; autoplay"
              />
            ) : (
              !isGrade3IframeLoading && (
                <iframe
                  ref={grade3IframeRef}
                  key={`src-${grade3IframeKey}-${grade3EmbeddedUrlWithSso}`}
                  src={grade3EmbeddedUrlWithSso}
                  onLoad={handleGrade3IframeLoad}
                  title="Giao diện Quản lý Bài tập Chuyên biệt Khối 3"
                  className="w-full h-full border-0 bg-white"
                  allow="fullscreen; clipboard-read; clipboard-write; microphone; camera; autoplay"
                />
              )
            )}
          </div>
        </div>
      )}

      {/* GRADE 3 DEDICATED DATABASE CONFIGURATION MODAL */}
      <Grade3DatabaseConfigModal
        isOpen={isGrade3ConfigModalOpen}
        onClose={() => setIsGrade3ConfigModalOpen(false)}
        grade3Lessons={getCachedGrade3Lessons()}
        onSynced={(updatedCfg) => {
          setGrade3DbConfig(updatedCfg);
        }}
      />
    </div>
  );
};
