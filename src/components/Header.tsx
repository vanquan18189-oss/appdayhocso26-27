import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Cpu,
  Wifi,
  WifiOff,
  User,
  CheckCircle2,
  X,
  RefreshCw,
  Zap,
  Sliders,
  LogOut,
  LogIn,
  Calendar,
  ChevronDown,
  AlertTriangle,
  Bell,
  CheckCheck,
  AlertCircle,
  Server
} from 'lucide-react';
import { UserRole, LatencyTestResult } from '../types';
import { APP_NAME, APP_SUBTITLE } from '../config/appConfig';
import { useAcademicYear } from '../contexts/AcademicYearContext';
import {
  DEFAULT_MODEL,
  testGeminiLatency,
  getAdminSelectedModel,
  setAdminSelectedModel,
  getActiveModelInfo,
  sanitizeErrorMessage
} from '../services/geminiService';
import { db, auth } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { trackedSetDoc } from '../services/firestoreWriteTracker';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { resolveTeacherNameByEmail, verifyTeacherAuthorization } from '../services/teacherStorageService';
import { getStudentAvatarSource } from './common/AnimalAvatars';
import { FirestoreConnectivityBanner } from './common/FirestoreConnectivityBanner';
import { FirestoreDebugOverlay } from './FirestoreDebugOverlay';
import {
  getLocalNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  syncNotificationsFromFirestore,
  AppNotification
} from '../services/notificationService';
import { formatDateTimeVN } from '../utils/dateUtils';

// ... (in Header component)

interface HeaderProps {
  currentRole?: UserRole;
  userRole?: UserRole;
  onRoleChange?: (role: UserRole) => void;
  currentUserName?: string;
  isApiKeyModalOpen?: boolean;
  setIsApiKeyModalOpen?: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  userRole,
  currentUserName,
  isApiKeyModalOpen: externalIsModalOpen,
  setIsApiKeyModalOpen: setExternalIsModalOpen,
}) => {
  const [internalIsKeyModalOpen, setInternalIsKeyModalOpen] = useState(false);
  const isKeyModalOpen = externalIsModalOpen !== undefined ? externalIsModalOpen : internalIsKeyModalOpen;
  const setIsKeyModalOpen = (open: boolean) => {
    setInternalIsKeyModalOpen(open);
    setExternalIsModalOpen?.(open);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === '1') {
      let totalSize = 0;
      const keys: { key: string; size: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const val = localStorage.getItem(key) || '';
          const size = val.length * 2; // Rough estimate in bytes
          totalSize += size;
          keys.push({ key, size });
        }
      }
      keys.sort((a, b) => b.size - a.size);
      console.log('LocalStorage Debug:', {
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        topKeys: keys.slice(0, 10)
      });
      // Add window level clear action
      (window as any).clearSafeCache = () => {
        // safeStorage.ts was deleted, function no longer available
        console.warn('clearSafeCache: safeStorage has been removed.');
      };
    }
  }, []);

  // Academic Period Context & Popover state
  const {
    selectedAcademicYear,
    setSelectedAcademicYear,
    selectedSemester,
    setSelectedSemester,
    availableYears
  } = useAcademicYear();

  const [isPeriodPopoverOpen, setIsPeriodPopoverOpen] = useState(false);
  const [tempYear, setTempYear] = useState(selectedAcademicYear);
  const [tempSemester, setTempSemester] = useState(selectedSemester);
  const [yearWarningToast, setYearWarningToast] = useState<string | null>(null);

  // Notifications Popover & State
  const [isNotifPopoverOpen, setIsNotifPopoverOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refreshNotifications = () => {
    setNotifications(getLocalNotifications());
  };

  useEffect(() => {
    refreshNotifications();
    syncNotificationsFromFirestore().then(setNotifications);

    const handleUpdate = () => refreshNotifications();
    window.addEventListener('eduplay_notifications_updated', handleUpdate);
    return () => {
      window.removeEventListener('eduplay_notifications_updated', handleUpdate);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
      refreshNotifications();
    }
    setIsNotifPopoverOpen(false);
    window.dispatchEvent(new CustomEvent('eduplay_open_assignment_tracking', {
      detail: { assignmentId: notif.assignmentId, studentCode: notif.studentCode }
    }));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead();
    refreshNotifications();
  };

  useEffect(() => {
    if (isPeriodPopoverOpen) {
      setTempYear(selectedAcademicYear);
      setTempSemester(selectedSemester);
      setYearWarningToast(null);
    }
  }, [isPeriodPopoverOpen, selectedAcademicYear, selectedSemester]);

  const handleYearSelect = (yearValue: string) => {
    if (yearValue === '2027-2028') {
      setYearWarningToast("Admin chưa kết chuyển dữ liệu lên năm học mới. Hệ thống tạm thời giữ mặc định năm học 2026-2027.");
      setTempYear('2026-2027');
    } else {
      setTempYear(yearValue);
      setYearWarningToast(null);
    }
  };

  const handleSaveAcademicPeriod = () => {
    if (tempYear === '2027-2028') {
      setYearWarningToast("Admin chưa kết chuyển dữ liệu lên năm học mới. Hệ thống tạm thời giữ mặc định năm học 2026-2027.");
      setTempYear('2026-2027');
      return;
    }
    setSelectedAcademicYear(tempYear);
    setSelectedSemester(tempSemester);
    setIsPeriodPopoverOpen(false);
    setYearWarningToast(null);
  };

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [studentSession, setStudentSession] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('eduplay_student_session');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  const activeRole: UserRole = currentRole || userRole || 'teacher';
  const effectiveStudentName = studentSession?.name || studentSession?.fullName || currentUserName || 'Học Sinh';
  const displayUserName = currentUserName || (
    activeRole === 'student'
      ? effectiveStudentName
      : resolveTeacherNameByEmail(
          currentUser?.email || (typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_email') : null),
          currentUser?.displayName || (typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_name') : null),
          undefined,
          activeRole
        )
  );

  const [adminModelInput, setAdminModelInput] = useState<string>(() => getAdminSelectedModel());
  const [latencyResult, setLatencyResult] = useState<LatencyTestResult | null>(null);
  const [isTestingLatency, setIsTestingLatency] = useState(false);
  const [isSavingFirestore, setIsSavingFirestore] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const activeModelInfo = getActiveModelInfo();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const saved = localStorage.getItem('eduplay_student_session');
        if (saved) setStudentSession(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener('eduplay_student_session_updated', handleUpdate);
    window.addEventListener('student-data-updated', handleUpdate);
    return () => {
      window.removeEventListener('eduplay_student_session_updated', handleUpdate);
      window.removeEventListener('student-data-updated', handleUpdate);
    };
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);
      const gUser = res.user;
      const email = (gUser?.email || '').trim().toLowerCase();
      if (!email) {
        await signOut(auth);
        alert('Không thể xác thực địa chỉ email từ tài khoản Google.');
        return;
      }
      const authCheck = await verifyTeacherAuthorization(email);
      if (!authCheck.authorized || !authCheck.profile) {
        await signOut(auth);
        alert('Tài khoản Google này chưa được đăng ký trong hệ thống. Vui lòng liên hệ quản trị viên.');
        return;
      }
      localStorage.setItem('eduplay_teacher_email', email);
      if (authCheck.profile.name) {
        localStorage.setItem('eduplay_teacher_name', authCheck.profile.name);
      }
      window.dispatchEvent(new CustomEvent('eduplay_teacher_session_updated'));
    } catch (e: any) {
      console.error('Login error:', e);
      if (auth && auth.currentUser) {
        try {
          await signOut(auth);
        } catch {}
      }
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
      if (
        e?.code === 'auth/unauthorized-domain' ||
        e?.message?.includes('auth/unauthorized-domain') ||
        e?.message?.includes('unauthorized-domain')
      ) {
        alert(
          `⚠️ Tên miền chưa được cấp quyền Google Sign-In (auth/unauthorized-domain)\n\n` +
          `Tên miền hiện tại: "${currentHost}"\n\n` +
          `Hướng dẫn mở quyền trên Firebase Console:\n` +
          `1. Truy cập Firebase Console -> chọn Dự án của bạn.\n` +
          `2. Vào Authentication -> tab Settings -> Authorized domains.\n` +
          `3. Bấm "Add domain" và dán tên miền: ${currentHost}\n` +
          `4. Bấm Lưu và thử lại sau ít phút.`
        );
      } else if (!e?.message?.includes('popup-closed-by-user')) {
        alert(`Đăng nhập Google thất bại: ${e.message}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
    localStorage.removeItem('eduplay_teacher_email');
    localStorage.removeItem('eduplay_teacher_name');
    localStorage.removeItem('eduplay_teacher_profile');
    localStorage.removeItem('eduplay_student_session');
    localStorage.removeItem('eduplay_current_class');
    localStorage.removeItem('eduplay_active_class');
    window.dispatchEvent(new CustomEvent('eduplay_logout'));
  };

  useEffect(() => {
    if (isKeyModalOpen) {
      setAdminModelInput(getAdminSelectedModel());
      setFirestoreStatus(null);

      const fetchServerModelConfig = async () => {
        if (!db || auth?.currentUser?.isAnonymous) return;
        try {
          const docRef = doc(db, 'settings', 'ai_config');
          const fetchPromise = getDoc(docRef);
          const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 3000));
          const docSnap = await Promise.race([fetchPromise, timeoutPromise]);

          if (docSnap && 'exists' in docSnap && docSnap.exists()) {
            const data = docSnap.data() as any;
            const fetchedModel = typeof data?.selectedModel === 'string' ? data.selectedModel.trim() : '';
            if (fetchedModel) {
              setAdminModelInput(fetchedModel);
              setAdminSelectedModel(fetchedModel);
            }
          }
        } catch (e: any) {
          console.warn('Không thể đọc cấu hình mô hình AI từ Firestore:', e?.message || e);
        }
      };
      fetchServerModelConfig();
    }
  }, [isKeyModalOpen]);

  const [testingProgress, setTestingProgress] = useState<string>('');

  const handleTestLatency = async () => {
    setIsTestingLatency(true);
    setLatencyResult(null);
    setTestingProgress('Đang kiểm tra kết nối máy chủ Gemini AI...');

    const result = await testGeminiLatency(
      undefined,
      (progressText) => setTestingProgress(progressText)
    );

    setLatencyResult(result);
    setIsTestingLatency(false);
    setTestingProgress('');
  };

  const handleSaveModelFirestore = async () => {
    setAdminSelectedModel(adminModelInput);
    setIsSavingFirestore(true);
    setFirestoreStatus(null);

    if (!db || auth?.currentUser?.isAnonymous) {
      setFirestoreStatus({
        success: true,
        message: 'Đã lưu lựa chọn mô hình AI cục bộ. Hệ thống sẵn sàng sử dụng ngay!'
      });
      setIsSavingFirestore(false);
      return;
    }

    try {
      const syncPromise = trackedSetDoc(
        doc(db, 'settings', 'ai_config'),
        {
          selectedModel: adminModelInput,
          updatedAt: new Date().toISOString(),
          updatedBy: displayUserName,
        },
        { merge: true }
      );

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 8000);
      });

      await Promise.race([syncPromise, timeoutPromise]);

      setFirestoreStatus({
        success: true,
        message: 'Đã lưu cấu hình mô hình AI mặc định lên hệ thống cho toàn trường!'
      });
    } catch (e: any) {
      console.warn('Đồng bộ cấu hình mô hình AI lên Firestore bị gián đoạn:', e?.message || e);
      setFirestoreStatus({
        success: true,
        message: 'Đã lưu cấu hình mô hình AI thành công trên thiết bị này.'
      });
    } finally {
      setIsSavingFirestore(false);
    }
  };

  const handleSaveAiConfig = () => {
    setAdminSelectedModel(adminModelInput);
    setIsKeyModalOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-xs px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 transition-all w-full">
      <div className="w-full flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#4F46E5] flex items-center justify-center text-white shadow-md shadow-indigo-100 shrink-0">
            <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 animate-pulse-subtle" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-base sm:text-xl font-bold text-[#111827] tracking-tight font-heading uppercase truncate">
                {APP_NAME}
              </h1>
              <span className="bg-[#FFFBEB] text-[#D97706] text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full border border-[#FDE68A] shrink-0">
                v2.5 AI
              </span>
            </div>
            <p className="text-xs text-gray-500 hidden sm:block truncate">
              {APP_SUBTITLE}
            </p>
          </div>
        </div>

        {/* Right Controls: Bell Notifications, Academic Period & API Key Config */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">

          {/* Intelligent AI Bell Notifications Button */}
          <div className="relative">
            <button
              onClick={() => setIsNotifPopoverOpen(!isNotifPopoverOpen)}
              className="relative p-2 rounded-lg text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 transition-all cursor-pointer shadow-xs"
              title="Thông báo AI Cần Xử Lý"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Popover Dropdown */}
            {isNotifPopoverOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsNotifPopoverOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-gray-100">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <Bell className="w-4 h-4 text-indigo-600" />
                      <span>Thông Báo AI Bài Tập</span>
                      {unreadCount > 0 && (
                        <span className="bg-rose-100 text-rose-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                          {unreadCount} mới
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Đã đọc tất cả
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400 font-medium">
                        Không có thông báo mới nào.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-3 text-xs transition-colors cursor-pointer hover:bg-slate-50 flex items-start gap-2.5 ${
                            !n.read ? 'bg-indigo-50/50 font-semibold' : 'opacity-80'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                            n.type === 'ai_failed' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${
                                n.type === 'ai_failed'
                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-rose-100 text-rose-800 border-rose-200'
                              }`}>
                                {n.type === 'ai_failed' ? 'AI Chưa Chấm' : 'Dưới 5 Điểm'}
                              </span>
                              <span className="text-[10px] text-gray-400 font-normal">
                                {formatDateTimeVN(n.createdAt, '--')}
                              </span>
                            </div>
                            <p className="text-gray-800 text-[11px] leading-snug line-clamp-2">
                              {n.message}
                            </p>
                            <p className="text-[10px] text-indigo-600 font-medium mt-1">
                              Bài: {n.assignmentTitle} {n.targetClass ? `(${n.targetClass})` : ''} ➔ Bấm để xem
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Academic Period Selector Button */}
          <div className="relative">
            <button
              onClick={() => setIsPeriodPopoverOpen(!isPeriodPopoverOpen)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] border border-indigo-200 transition-all cursor-pointer shadow-xs"
              title="Chọn Học Kỳ & Năm Học"
            >
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#4F46E5] shrink-0" />
              <span>{selectedSemester} • {selectedAcademicYear}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-indigo-500 transition-transform duration-200 ${isPeriodPopoverOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Popover Dropdown */}
            {isPeriodPopoverOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsPeriodPopoverOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 p-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 font-bold text-xs text-gray-800">
                      <Calendar className="w-4 h-4 text-[#4F46E5]" />
                      <span>Chọn Học Kỳ & Năm Học</span>
                    </div>
                    <button
                      onClick={() => setIsPeriodPopoverOpen(false)}
                      className="text-gray-400 hover:text-gray-600 p-0.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    {yearWarningToast && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-medium flex items-start gap-2 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 leading-snug">
                          {yearWarningToast}
                        </div>
                        <button
                          type="button"
                          onClick={() => setYearWarningToast(null)}
                          className="text-amber-500 hover:text-amber-800 p-0.5 rounded cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="block text-gray-600 font-semibold mb-1">
                        Năm học
                      </label>
                      <select
                        value={tempYear}
                        onChange={(e) => handleYearSelect(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 text-gray-800 font-medium cursor-pointer"
                      >
                        {availableYears.map((year) => (
                          <option key={year} value={year}>
                            Năm học {year}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-600 font-semibold mb-1">
                        Học kỳ
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['Học kỳ I', 'Học kỳ II', 'Cả năm'].map((sem) => (
                          <button
                            key={sem}
                            type="button"
                            onClick={() => setTempSemester(sem)}
                            className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                              tempSemester === sem
                                ? 'bg-[#4F46E5] text-white border-[#4F46E5] shadow-xs'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {sem}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsPeriodPopoverOpen(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAcademicPeriod}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#4F46E5] hover:bg-[#4338CA] text-white transition-all shadow-xs cursor-pointer"
                    >
                      Áp dụng
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Server AI Status & Config Modal Launcher */}
          <button
            onClick={() => setIsKeyModalOpen(true)}
            id="header-api-key-button"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-all cursor-pointer shadow-xs"
            title="Cấu hình & Kiểm tra kết nối Gemini AI"
          >
            <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
            <span className="hidden md:inline font-semibold">Cấu hình AI</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
            </span>
          </button>

        </div>
      </div>

      {/* AI Server Status & Latency Test Modal */}
      {isKeyModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#4F46E5] px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-base font-heading">
                <Sliders className="w-5 h-5 text-amber-300" /> Cấu Hình & Kiểm Tra Kết Nối AI
              </div>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Server className="w-4 h-4" />
                </div>
                <div className="text-xs text-slate-700 leading-relaxed space-y-1">
                  <p className="font-semibold text-indigo-950">
                    Xử lý Gemini AI tập trung trên máy chủ
                  </p>
                  <p className="text-slate-600">
                    Mọi yêu cầu AI (soạn giáo án 5E, tạo đề thi, chấm bài tự luận, trợ lý sư phạm, Live API và tạo trò chơi) đều được kết nối trực tiếp qua máy chủ. Giáo viên và học sinh mở ứng dụng là dùng được ngay.
                  </p>
                </div>
              </div>

              {/* Admin Model Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                    ⚙️ Mô hình AI (Quản trị viên chọn thủ công):
                  </label>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-200">
                    Hiện tại: {activeModelInfo.sourceLabel} ({activeModelInfo.modelName})
                  </span>
                </div>
                <select
                  value={adminModelInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAdminModelInput(val);
                    setAdminSelectedModel(val);
                  }}
                  disabled={activeRole !== 'admin'}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 text-gray-900 font-mono disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <option value="">Tự động ưu tiên (Mặc định: {DEFAULT_MODEL})</option>
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen (Mặc định - Nhanh, thông minh & ổn định)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Flash Lite siêu tốc & tiết kiệm)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Flash đa nhiệm ổn định)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  {activeRole === 'admin'
                    ? 'Chỉ danh sách các mô hình sinh văn bản được hỗ trợ. Lựa chọn này áp dụng cho toàn bộ tính năng AI.'
                    : 'Chỉ tài khoản Quản trị viên mới có thể thay đổi mô hình mặc định.'}
                </p>
              </div>

              {/* Latency Test Action & Firestore Model Sync */}
              <div className="bg-[#F9FAFB] rounded-xl p-3 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-500" /> Kết Nối & Đánh Giá
                  </span>
                  <div className="flex items-center gap-1.5">
                    {activeRole === 'admin' && (
                      <button
                        onClick={handleSaveModelFirestore}
                        disabled={isSavingFirestore}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                        title="Đồng bộ lựa chọn mô hình lên Firestore"
                      >
                        {isSavingFirestore ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang lưu...
                          </>
                        ) : (
                          <>
                            🌐 Lưu đồng bộ
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={handleTestLatency}
                      disabled={isTestingLatency}
                      className="px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isTestingLatency ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang đo...
                        </>
                      ) : (
                        <>
                          <Wifi className="w-3.5 h-3.5" /> Kiểm tra
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Real-time Testing Progress Indicator */}
                {isTestingLatency && (
                  <div className="p-3 rounded-lg text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center gap-2 animate-pulse font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                    <span>{testingProgress || 'Đang đo kết nối Gemini API trên máy chủ...'}</span>
                  </div>
                )}

                {/* Firestore Sync Success/Error Notification */}
                {firestoreStatus && (
                  <div
                    className={`p-3 rounded-lg text-xs border flex items-start gap-2.5 ${
                      firestoreStatus?.success
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A]'
                        : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                    }`}
                  >
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${firestoreStatus?.success ? 'text-[#16A34A]' : 'text-[#DC2626]'}`} />
                    <div className="leading-relaxed font-medium flex-1">
                      <div>{firestoreStatus?.message}</div>
                    </div>
                  </div>
                )}

                {/* Test Result Display */}
                {!isTestingLatency && latencyResult && (
                  <div
                    className={`p-3 rounded-lg text-xs border flex items-start gap-2.5 ${
                      latencyResult?.status === 'online'
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A]'
                        : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                    }`}
                  >
                    {latencyResult?.status === 'online' ? (
                      <Wifi className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-semibold flex items-center justify-between gap-2">
                        <span>{latencyResult?.message}</span>
                        {latencyResult?.status === 'online' && (
                          <span className="bg-[#DCFCE7] text-[#16A34A] px-2 py-0.5 rounded-full text-xs font-mono font-bold shrink-0">
                            ⚡ {latencyResult?.latencyMs} ms
                          </span>
                        )}
                      </div>
                      <div className="text-xs opacity-90 mt-1 text-gray-700 flex items-center justify-between gap-2">
                        <div>
                          Mô hình: <code className="font-mono font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">{latencyResult?.modelName}</code>
                        </div>
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full border border-amber-300">
                          {latencyResult?.sourceLabel ? `📌 ${latencyResult.sourceLabel}` : '⚡ mặc định'}
                        </span>
                      </div>

                      {/* Technical Error Details Collapsible Section */}
                      {latencyResult?.rawErrorDetails && (
                        <div className="mt-2 pt-2 border-t border-gray-200/80">
                          <button
                            type="button"
                            onClick={() => setShowTechDetails(!showTechDetails)}
                            className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>Chi tiết kỹ thuật (Server AI)</span>
                            <span className="text-[10px]">{showTechDetails ? '▲ Thu gọn' : '▼ Xem chi tiết'}</span>
                          </button>

                          {showTechDetails && (
                            <div className="mt-1.5 p-2.5 rounded-lg bg-gray-900 text-gray-100 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-40 border border-gray-700 shadow-inner">
                              {latencyResult.httpStatus && (
                                <div className="text-amber-400 font-bold mb-1">
                                  Mã HTTP Status: {latencyResult.httpStatus}
                                </div>
                              )}
                              <div className="whitespace-pre-wrap break-all text-gray-300">
                                {sanitizeErrorMessage(latencyResult.rawErrorDetails)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-all cursor-pointer"
              >
                Đóng
              </button>
              <button
                onClick={handleSaveAiConfig}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-[#4F46E5] hover:bg-[#4338CA] text-white transition-all shadow-xs cursor-pointer"
              >
                Lưu Cấu Hình
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <FirestoreConnectivityBanner />
      <FirestoreDebugOverlay />
    </header>
  );
};
