import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Gamepad2,
  LayoutGrid,
  Monitor,
  Presentation,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../../services/firebase';
import {
  fetchCurrentTeacherProfile,
  getCurrentTeacherProfile,
  getTeachersFromLocalStorage,
  resolveTeacherNameByEmail,
} from '../../services/teacherStorageService';

const PORTAL_URL_STORAGE_KEY = 'eduplay_digital_resource_portal_url';
const DEFAULT_PORTAL_URL = 'https://khohoclieuso-thquanghung.vercel.app';

type ShortcutKey = 'ppt_ai' | 'exam_matrix_ai' | 'game_ai' | 'school_library';

export interface SsoUserInfo {
  email: string;
  name: string;
  displayName?: string;
  role: string;
  uid: string;
}

export interface DigitalResourcePortalProps {
  currentUser?: Partial<SsoUserInfo> | null;
}

interface ShortcutItem {
  key: ShortcutKey;
  toolbarLabel: string;
  cardTitle: string;
  cardBadge: string;
  cardDesc: string;
  tabParam: string;
  queryParam: string;
  gradient: string;
  borderAccent: string;
  iconBg: string;
  Icon: React.FC<{ className?: string }>;
}

const SHORTCUT_ITEMS: ShortcutItem[] = [
  {
    key: 'ppt_ai',
    toolbarLabel: '📊 Tạo bài giảng PPT AI',
    cardTitle: 'Tạo bài giảng PPT AI sinh ảnh 16:9',
    cardBadge: 'Slide & Hình ảnh 16:9',
    cardDesc:
      'Tự động thiết kế giáo án trình chiếu PowerPoint chuẩn sư phạm Tiểu học, tích hợp AI sinh hình minh họa 16:9 sắc nét cho từng slide bài học.',
    tabParam: 'ppt-ai',
    queryParam: 'module=ppt-ai',
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
    borderAccent: 'border-amber-200 hover:border-amber-400',
    iconBg: 'bg-amber-100 text-amber-700',
    Icon: Presentation,
  },
  {
    key: 'exam_matrix_ai',
    toolbarLabel: '📝 Tạo đề kiểm tra & Ma trận AI',
    cardTitle: 'Tạo đề kiểm tra & Ma trận AI chuẩn Thông tư 27',
    cardBadge: 'Chuẩn Thông tư 27',
    cardDesc:
      'Xây dựng bảng đặc tả, ma trận đề kiểm tra 3–4 mức độ nhận thức và sinh đề tự động kèm đáp án, hướng dẫn chấm xuất ra file Word (.docx).',
    tabParam: 'exam-ai',
    queryParam: 'module=exam-matrix',
    gradient: 'from-blue-600 via-indigo-600 to-violet-600',
    borderAccent: 'border-indigo-200 hover:border-indigo-400',
    iconBg: 'bg-indigo-100 text-indigo-700',
    Icon: FileSpreadsheet,
  },
  {
    key: 'game_ai',
    toolbarLabel: '🎮 Tạo trò chơi',
    cardTitle: 'Tạo trò chơi học tập tương tác',
    cardBadge: 'Khởi động & Củng cố',
    cardDesc:
      'Kho trò chơi tương tác khởi động tiết học, đố vui củng cố kiến thức sinh động trên màn hình tivi tương tác tại lớp học.',
    tabParam: 'game',
    queryParam: 'module=games',
    gradient: 'from-fuchsia-600 via-purple-600 to-pink-600',
    borderAccent: 'border-fuchsia-200 hover:border-fuchsia-400',
    iconBg: 'bg-fuchsia-100 text-fuchsia-700',
    Icon: Gamepad2,
  },
  {
    key: 'school_library',
    toolbarLabel: '📚 Kho học liệu trường',
    cardTitle: 'Kho học liệu chung toàn trường',
    cardBadge: 'Học liệu số GDPT 2018',
    cardDesc:
      'Lưu trữ, chia sẻ và kế thừa bài giảng điện tử, phiếu bài tập, đề kiểm tra và tài liệu chuyên môn của tổ khối TH Quang Hưng - PK Trực Khang.',
    tabParam: 'library',
    queryParam: 'module=library',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
    borderAccent: 'border-emerald-200 hover:border-emerald-400',
    iconBg: 'bg-emerald-100 text-emerald-700',
    Icon: BookOpen,
  },
];

function normalizePortalUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return DEFAULT_PORTAL_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Mã hóa chuỗi JSON sang Base64 UTF-8 an toàn (hỗ trợ đầy đủ tiếng Việt có dấu)
 */
export function encodeUtf8Base64(data: Record<string, unknown>): string {
  const jsonStr = JSON.stringify(data);
  try {
    if (typeof TextEncoder !== 'undefined' && typeof btoa !== 'undefined') {
      const bytes = new TextEncoder().encode(jsonStr);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
    return btoa(
      encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  } catch {
    return '';
  }
}

/**
 * Tạo đường dẫn đích kèm tham số lối tắt (tab & module) và bộ tham số SSO tự động đăng nhập
 */
function buildTargetUrlWithSso(
  baseUrl: string,
  ssoUser: SsoUserInfo,
  ssoToken: string,
  shortcut?: ShortcutItem | null
): string {
  const cleanBase = normalizePortalUrl(baseUrl);
  try {
    const urlObj = new URL(cleanBase);
    if (shortcut?.tabParam) {
      urlObj.searchParams.set('tab', shortcut.tabParam);
    }
    if (shortcut?.queryParam) {
      const [k, v] = shortcut.queryParam.split('=');
      if (k && v) {
        urlObj.searchParams.set(k, v);
      }
    }
    if (ssoToken) {
      urlObj.searchParams.set('sso_token', ssoToken);
    }
    if (ssoUser.email) {
      urlObj.searchParams.set('sso_email', ssoUser.email);
    }
    if (ssoUser.name) {
      urlObj.searchParams.set('sso_name', ssoUser.name);
    }
    if (ssoUser.role) {
      urlObj.searchParams.set('sso_role', ssoUser.role);
    }
    return urlObj.toString();
  } catch {
    const params = new URLSearchParams();
    if (shortcut?.tabParam) {
      params.set('tab', shortcut.tabParam);
    }
    if (shortcut?.queryParam) {
      const [k, v] = shortcut.queryParam.split('=');
      if (k && v) params.set(k, v);
    }
    if (ssoToken) params.set('sso_token', ssoToken);
    if (ssoUser.email) params.set('sso_email', ssoUser.email);
    if (ssoUser.name) params.set('sso_name', ssoUser.name);
    if (ssoUser.role) params.set('sso_role', ssoUser.role);
    const sep = cleanBase.includes('?') ? '&' : '?';
    return `${cleanBase}${sep}${params.toString()}`;
  }
}

export const DigitalResourcePortal: React.FC<DigitalResourcePortalProps> = ({
  currentUser,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [baseUrl, setBaseUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_PORTAL_URL;
    try {
      const saved = localStorage.getItem(PORTAL_URL_STORAGE_KEY);
      return saved && saved.trim() ? normalizePortalUrl(saved) : DEFAULT_PORTAL_URL;
    } catch {
      return DEFAULT_PORTAL_URL;
    }
  });

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(() => auth?.currentUser || null);
  const [asyncTeacherProfile, setAsyncTeacherProfile] = useState<any>(null);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
    });
    return () => unsubscribe();
  }, []);

  // 1. Lấy thông tin tài khoản giáo viên đang đăng nhập từ prop, Firebase Auth và localStorage/teacherStorageService
  const rawEmail = useMemo(() => {
    const storedEmail =
      typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_email') : null;
    return (
      currentUser?.email ||
      firebaseUser?.email ||
      storedEmail ||
      'thuthuthtk@gmail.com'
    ).trim();
  }, [currentUser?.email, firebaseUser?.email]);

  useEffect(() => {
    let isMounted = true;
    if (rawEmail) {
      fetchCurrentTeacherProfile(rawEmail)
        .then((profile) => {
          if (isMounted && profile) {
            setAsyncTeacherProfile(profile);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [rawEmail]);

  const resolvedSsoUser = useMemo<SsoUserInfo>(() => {
    const storedName =
      typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_name') : null;
    const storedRole =
      typeof window !== 'undefined' ? localStorage.getItem('eduplay_user_role') : null;

    const teacherProfile = asyncTeacherProfile || getCurrentTeacherProfile(rawEmail);
    const effectiveRole =
      currentUser?.role ||
      teacherProfile?.userRole ||
      storedRole ||
      'teacher';

    const effectiveName =
      currentUser?.name ||
      currentUser?.displayName ||
      teacherProfile?.name ||
      storedName ||
      resolveTeacherNameByEmail(
        rawEmail,
        firebaseUser?.displayName || null,
        getTeachersFromLocalStorage(),
        effectiveRole === 'admin' ? 'admin' : 'teacher'
      );

    const effectiveUid =
      currentUser?.uid ||
      firebaseUser?.uid ||
      teacherProfile?.id ||
      rawEmail;

    return {
      email: rawEmail,
      name: effectiveName,
      displayName: effectiveName,
      role: effectiveRole,
      uid: String(effectiveUid),
    };
  }, [
    asyncTeacherProfile,
    currentUser?.displayName,
    currentUser?.name,
    currentUser?.role,
    currentUser?.uid,
    firebaseUser?.displayName,
    firebaseUser?.uid,
    rawEmail,
  ]);

  // 2. Tạo chuỗi mã hóa ssoToken (Base64 UTF-8 an toàn)
  const ssoToken = useMemo(() => {
    return encodeUtf8Base64({
      email: resolvedSsoUser.email,
      name: resolvedSsoUser.name,
      role: resolvedSsoUser.role,
      uid: resolvedSsoUser.uid,
      timestamp: Date.now(),
      source: 'PK_TRUC_KHANG_LMS',
    });
  }, [resolvedSsoUser]);

  const [activeShortcut, setActiveShortcut] = useState<ShortcutKey | null>(null);
  const [viewMode, setViewMode] = useState<'embed' | 'launchpad'>('embed');
  const [iframeKey, setIframeKey] = useState<number>(0);

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [draftUrl, setDraftUrl] = useState<string>(baseUrl);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraftUrl(baseUrl);
  }, [baseUrl]);

  const activeShortcutMeta = SHORTCUT_ITEMS.find((item) => item.key === activeShortcut) || null;

  // 3. Gắn tự động tham số ?sso_token=...&sso_email=...&sso_name=...&sso_role=... vào URL
  const computedIframeUrl = useMemo(
    () =>
      buildTargetUrlWithSso(
        baseUrl,
        resolvedSsoUser,
        ssoToken,
        activeShortcutMeta
      ),
    [baseUrl, resolvedSsoUser, ssoToken, activeShortcutMeta]
  );

  // 4. Gửi postMessage SSO sang cửa sổ iframe khi tải xong
  const postSsoMessageToIframe = useCallback(() => {
    const iframeWindow = iframeRef.current?.contentWindow;
    if (!iframeWindow) return;
    const messagePayload = {
      type: 'PK_TRUC_KHANG_SSO_LOGIN',
      ssoToken,
      user: {
        email: resolvedSsoUser.email,
        name: resolvedSsoUser.name,
        displayName: resolvedSsoUser.name,
        role: resolvedSsoUser.role,
        uid: resolvedSsoUser.uid,
      },
    };
    try {
      iframeWindow.postMessage(messagePayload, '*');
    } catch {
      // Ignore cross-origin postMessage errors if any
    }
  }, [resolvedSsoUser, ssoToken]);

  const handleIframeLoad = () => {
    postSsoMessageToIframe();
    // Gửi lặp nhẹ sau khi React bên trong iframe khởi tạo xong listener
    window.setTimeout(postSsoMessageToIframe, 350);
    window.setTimeout(postSsoMessageToIframe, 1000);
  };

  // Lắng nghe nếu ứng dụng Kho Học Liệu Số chủ động hỏi thông tin SSO qua postMessage
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (
        data &&
        typeof data === 'object' &&
        (data.type === 'PK_TRUC_KHANG_REQUEST_SSO' || data.type === 'KHO_HOC_LIEU_READY')
      ) {
        postSsoMessageToIframe();
      }
    };
    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [postSsoMessageToIframe]);

  const handleSelectShortcut = (key: ShortcutKey) => {
    setActiveShortcut(key);
    setViewMode('embed');
    setIframeKey((prev) => prev + 1);
  };

  const handleSavePortalUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePortalUrl(draftUrl);
    setBaseUrl(normalized);
    setDraftUrl(normalized);
    try {
      localStorage.setItem(PORTAL_URL_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage errors
    }
    setIframeKey((prev) => prev + 1);
    setSaveFeedback('Đã lưu địa chỉ Kho Học Liệu Số thành công!');
    window.setTimeout(() => {
      setSaveFeedback(null);
      setIsSettingsOpen(false);
    }, 900);
  };

  const handleResetDefaultUrl = () => {
    setDraftUrl(DEFAULT_PORTAL_URL);
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Title & Subtitle */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white flex items-center justify-center shrink-0 shadow-md border-b-4 border-indigo-900">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
                  Cổng Kết Nối Liên Thông AI
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    SSO: {resolvedSsoUser.name} ({resolvedSsoUser.email})
                  </span>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 mt-0.5 leading-snug">
                Kho Học Liệu Số &amp; Công Cụ AI (TH Quang Hưng - PK Trực Khang)
              </h2>
            </div>
          </div>

          {/* Right Action Buttons: Settings & Open Fullscreen in New Tab */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setDraftUrl(baseUrl);
                setSaveFeedback(null);
                setIsSettingsOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-600" />
              <span>⚙️ Cài đặt Link Kho Học Liệu</span>
            </button>

            <a
              href={computedIframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>↗️ Mở toàn màn hình (Tab mới)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* 4 Quick Shortcut Buttons + View Mode Switcher Row */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* 4 Quick Shortcuts */}
          <div className="flex flex-wrap items-center gap-2">
            {SHORTCUT_ITEMS.map((item) => {
              const isSelected = activeShortcut === item.key && viewMode === 'embed';
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelectShortcut(item.key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                      : 'bg-slate-50 hover:bg-indigo-50/70 text-slate-700 hover:text-indigo-700 border-slate-200/90 hover:border-indigo-200'
                  }`}
                >
                  <span>{item.toolbarLabel}</span>
                </button>
              );
            })}
          </div>

          {/* 2-Mode Switcher + Reload */}
          <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setViewMode('embed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'embed'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Nhúng trực tiếp ngay trong App</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('launchpad')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'launchpad'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Bảng điều khiển Lối tắt (Launchpad)</span>
              </button>
            </div>

            {viewMode === 'embed' && (
              <button
                type="button"
                onClick={() => setIframeKey((prev) => prev + 1)}
                title="Tải lại khung Kho Học Liệu Số"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/80 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: Mode 1 (Embedded Iframe) vs Mode 2 (Launchpad Cards) */}
      {viewMode === 'embed' ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-bold text-slate-700 truncate">
                {activeShortcutMeta
                  ? `Đang mở: ${activeShortcutMeta.cardTitle}`
                  : 'Đang chạy trực tiếp: Kho Học Liệu Số - Tiểu học Quang Hưng (Phân hiệu Trực Khang)'}
              </span>
            </div>
            {activeShortcut && (
              <button
                type="button"
                onClick={() => {
                  setActiveShortcut(null);
                  setIframeKey((prev) => prev + 1);
                }}
                className="text-indigo-600 hover:text-indigo-800 font-bold shrink-0 cursor-pointer"
              >
                Về trang chính Kho Học Liệu
              </button>
            )}
          </div>

          <iframe
            ref={iframeRef}
            key={`${iframeKey}-${computedIframeUrl}`}
            src={computedIframeUrl}
            onLoad={handleIframeLoad}
            title="Kho Học Liệu Số & Công Cụ AI (TH Quang Hưng - PK Trực Khang)"
            className="w-full border-0 bg-white"
            style={{ height: 'calc(100vh - 130px)' }}
            allow="fullscreen; clipboard-read; clipboard-write; microphone; camera; autoplay"
          />
        </div>
      ) : (
        /* Mode 2: Launchpad 4 Feature Cards */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {SHORTCUT_ITEMS.map((item) => {
              const Icon = item.Icon;
              const itemTargetUrl = buildTargetUrlWithSso(
                baseUrl,
                resolvedSsoUser,
                ssoToken,
                item
              );
              return (
                <div
                  key={item.key}
                  onClick={() => handleSelectShortcut(item.key)}
                  className={`group bg-white rounded-3xl border-2 ${item.borderAccent} p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between relative overflow-hidden`}
                >
                  <div
                    className={`absolute top-0 right-0 w-36 h-36 bg-gradient-to-br ${item.gradient} opacity-10 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform`}
                  />

                  <div className="space-y-4 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-14 h-14 rounded-2xl ${item.iconBg} flex items-center justify-center shadow-2xs`}>
                        <Icon className="w-7 h-7" />
                      </div>
                      <span className="px-3 py-1 rounded-full text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                        {item.cardBadge}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {item.cardTitle}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1.5 leading-relaxed">
                        {item.cardDesc}
                      </p>
                    </div>
                  </div>

                  <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between gap-3 relative z-10">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 group-hover:translate-x-1 transition-transform">
                      <span>Mở ngay trong ứng dụng (Tự động SSO)</span>
                      <span>→</span>
                    </span>

                    <a
                      href={itemTargetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-colors inline-flex items-center gap-1"
                    >
                      <span>Mở tab mới</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings Modal for configuring Kho Học Liệu Số URL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">
                    Cài đặt Link Kho Học Liệu Số
                  </h3>
                  <p className="text-xs text-slate-500">
                    Lưu địa chỉ ứng dụng Kho Học Liệu Số vào trình duyệt (localStorage)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePortalUrl} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                  Đường dẫn (URL) ứng dụng Kho Học Liệu Số
                </label>
                <input
                  type="text"
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder="https://khohoclieuso-thquanghung.vercel.app"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 text-sm font-bold text-slate-900 outline-none transition-colors"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  💡 Hệ thống sẽ tự động gắn mã đăng nhập một lần (`sso_token`, `sso_email`, `sso_name`, `sso_role`) của tài khoản{' '}
                  <strong>{resolvedSsoUser.name}</strong> vào địa chỉ này.
                </p>
              </div>

              {saveFeedback && (
                <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveFeedback}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleResetDefaultUrl}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Mặc định</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu cấu hình</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
