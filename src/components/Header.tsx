import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Key,
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
  AlertTriangle
} from 'lucide-react';
import { UserRole, LatencyTestResult } from '../types';
import { APP_NAME, APP_SUBTITLE } from '../config/appConfig';
import { useAcademicYear } from '../contexts/AcademicYearContext';
import {
  getStoredApiKey,
  setStoredApiKey,
  getStoredGlobalApiKey,
  setStoredGlobalApiKey,
  testGeminiLatency,
  getAdminSelectedModel,
  setAdminSelectedModel,
  getActiveModelInfo,
  sanitizeErrorMessage
} from '../services/geminiService';
import { db, auth } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { trackedSetDoc } from '../services/firestoreWriteTracker';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { resolveTeacherNameByEmail, verifyTeacherAuthorization } from '../services/teacherStorageService';
import { getStudentAvatarSource } from './common/AnimalAvatars';
import { FirestoreConnectivityBanner } from './common/FirestoreConnectivityBanner';
import { FirestoreDebugOverlay } from './FirestoreDebugOverlay';

interface HeaderProps {
  currentRole?: UserRole;
  userRole?: UserRole;
  onRoleChange?: (role: UserRole) => void;
  currentUserName?: string;
  apiKey?: string;
  onSaveApiKey?: (key: string) => void;
  isApiKeyModalOpen?: boolean;
  setIsApiKeyModalOpen?: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  userRole,
  currentUserName,
  apiKey,
  onSaveApiKey,
  isApiKeyModalOpen: externalIsModalOpen,
  setIsApiKeyModalOpen: setExternalIsModalOpen,
}) => {
  const [internalIsKeyModalOpen, setInternalIsKeyModalOpen] = useState(false);
  const isKeyModalOpen = externalIsModalOpen !== undefined ? externalIsModalOpen : internalIsKeyModalOpen;
  const setIsKeyModalOpen = (open: boolean) => {
    setInternalIsKeyModalOpen(open);
    setExternalIsModalOpen?.(open);
  };

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

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [globalApiKeyInput, setGlobalApiKeyInput] = useState('');
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
      setApiKeyInput(apiKey !== undefined ? apiKey : getStoredApiKey());
      setAdminModelInput(getAdminSelectedModel());

      const cachedGlobal = getStoredGlobalApiKey();
      if (cachedGlobal) {
        setGlobalApiKeyInput(cachedGlobal);
      }

      const fetchGlobalKey = async () => {
        if (!db) return;
        try {
          const docRef = doc(db, 'settings', 'ai_config');
          const fetchPromise = getDoc(docRef);
          const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 3000));
          const docSnap = await Promise.race([fetchPromise, timeoutPromise]);

          if (docSnap && 'exists' in docSnap && docSnap.exists()) {
            const data = docSnap.data() as any;
            const fetchedKey = (data?.globalApiKey || data?.apiKey || '')?.trim();
            if (fetchedKey) {
              setGlobalApiKeyInput(fetchedKey);
              setStoredGlobalApiKey(fetchedKey);
            }
          }
        } catch (e: any) {
          console.warn('Không thể đọc Global API Key từ Firestore (chế độ ngoại tuyến / offline):', e?.message || e);
        }
      };
      fetchGlobalKey();
    }
  }, [isKeyModalOpen, apiKey]);

  const [testingProgress, setTestingProgress] = useState<string>('');

  const handleTestLatency = async () => {
    setIsTestingLatency(true);
    setLatencyResult(null);
    setTestingProgress('Đang chuẩn bị kiểm tra...');

    const result = await testGeminiLatency(
      apiKeyInput || globalApiKeyInput,
      (progressText) => setTestingProgress(progressText)
    );

    setLatencyResult(result);
    setIsTestingLatency(false);
    setTestingProgress('');
  };

  const handleSaveGlobalFirestore = async () => {
    const keyToSave = globalApiKeyInput.trim();

    // Store in LocalStorage fallback immediately so it takes effect instantly!
    setStoredGlobalApiKey(keyToSave);

    setIsSavingFirestore(true);
    setFirestoreStatus(null);

    if (!db) {
      setFirestoreStatus({
        success: true,
        message: 'Đã lưu Global API Key vào bộ nhớ đệm cục bộ! Hệ thống sẵn sàng áp dụng ngay cho tất cả các tính năng AI.'
      });
      setIsSavingFirestore(false);
      return;
    }

    try {
      const syncPromise = trackedSetDoc(
        doc(db, 'settings', 'ai_config'),
        {
          globalApiKey: keyToSave,
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
        message: 'Lưu Global API Key thành công lên Firestore & bộ nhớ đệm! Toàn bộ máy trạm, giáo viên và học sinh sẽ tự động sử dụng khóa chung này.'
      });
    } catch (e: any) {
      console.warn('Đồng bộ Firestore bị gián đoạn hoặc quá thời gian chờ, đã lưu bộ nhớ đệm cục bộ:', e?.message || e);
      setFirestoreStatus({
        success: true,
        message: 'Lưu Global API Key thành công vào bộ nhớ đệm dự phòng (Fallback)! Đã sẵn sàng sử dụng ngay cho mọi tính năng AI. (Kèm cơ chế tự động đồng bộ Firestore ở nền)'
      });
    } finally {
      setIsSavingFirestore(false);
    }
  };

  const handleSaveApiKey = () => {
    setStoredApiKey(apiKeyInput);
    if (globalApiKeyInput) {
      setStoredGlobalApiKey(globalApiKeyInput);
    }
    setAdminSelectedModel(adminModelInput);
    onSaveApiKey?.(apiKeyInput);
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

        {/* Right Controls: Academic Period & API Key Config */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          
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

          {/* API Key Modal Launcher */}
          <button
            onClick={() => setIsKeyModalOpen(true)}
            id="header-api-key-button"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-all cursor-pointer shadow-xs"
            title="Cấu hình Google Gemini API Key"
          >
            <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
            <span className="hidden md:inline font-semibold">Cấu hình API Key</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
            </span>
          </button>

        </div>
      </div>

      {/* API Key Modal & Latency Test */}
      {isKeyModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#4F46E5] px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-base font-heading">
                <Sliders className="w-5 h-5 text-amber-300" /> Cấu Hình Google Gemini API Key
              </div>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed font-normal">
                Hệ thống tự động sử dụng <strong>Environment Gemini Key</strong> của máy chủ AI Studio. Bạn có thể nhập <strong>Personal API Key</strong> của riêng mình dưới đây để ưu tiên xử lý cá nhân.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Personal Gemini API Key:
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 font-mono text-gray-900"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Khóa cá nhân được lưu bảo mật trong <code>localStorage</code> của trình duyệt (ưu tiên số 1).
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                    🌐 Global API Key (Khóa dùng chung toàn trường):
                  </label>
                  <span className="text-xs bg-[#EEF2FF] text-[#4F46E5] px-2 py-0.5 rounded-full font-medium border border-[#C7D2FE]">
                    {activeRole === 'admin' ? 'Quyền Admin (Chỉnh sửa)' : 'Chế độ xem chung'}
                  </span>
                </div>
                <input
                  type="password"
                  value={globalApiKeyInput}
                  onChange={(e) => setGlobalApiKeyInput(e.target.value)}
                  placeholder="AIzaSy... (Lưu trên Firestore cho toàn hệ thống)"
                  disabled={activeRole !== 'admin'}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 font-mono disabled:opacity-75 disabled:cursor-not-allowed text-gray-900"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  {activeRole === 'admin'
                    ? 'Quản trị viên có quyền cập nhật khóa chung phục vụ thi cử và trình diễn cho toàn trường.'
                    : 'Áp dụng tự động cho mọi máy trạm/tài khoản khi chưa cấu hình Key cá nhân.'}
                </p>
              </div>

              {/* Admin Model Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                    ⚙️ Mô hình AI (Quản trị viên chọn thủ công):
                  </label>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-200">
                    Hiện tại: {activeModelInfo.sourceLabel}
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
                  <option value="">Tự động ưu tiên (Mặc định: gemini-2.0-flash / Đã nhớ)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash (Mô hình chuẩn - Ổn định & Nhanh)</option>
                  <option value="gemini-1.5-flash-latest">gemini-1.5-flash-latest (Mô hình dự phòng)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Flash thế hệ mới)</option>
                  <option value="gemini-flash-latest">gemini-flash-latest (Alias tự động)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Chỉ danh sách các mô hình sinh văn bản mới nhất. Lựa chọn này áp dụng cho toàn bộ tính năng AI.
                </p>
              </div>

              {/* Latency Test Action & Firestore Sync */}
              <div className="bg-[#F9FAFB] rounded-xl p-3 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-500" /> Kết Nối & Đánh Giá
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSaveGlobalFirestore}
                      disabled={isSavingFirestore}
                      className="px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                      title="Lưu cấu hình và đồng bộ vĩnh viễn với Firebase Firestore"
                    >
                      {isSavingFirestore ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang đồng bộ...
                        </>
                      ) : (
                        <>
                          🌐 Lưu Global Firestore
                        </>
                      )}
                    </button>
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
                    <span>{testingProgress || 'Đang đo kết nối Gemini API...'}</span>
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
                      {!firestoreStatus?.success && (
                        <button
                          onClick={handleSaveGlobalFirestore}
                          disabled={isSavingFirestore}
                          className="mt-2 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" /> Thử lại đồng bộ Firestore
                        </button>
                      )}
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
                          {latencyResult?.sourceLabel ? `📌 ${latencyResult.sourceLabel}` : (latencyResult?.isCachedModel ? '📌 đã nhớ' : '⚡ mặc định')}
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
                            <span>Chi tiết kỹ thuật (Google API)</span>
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
                Hủy
              </button>
              <button
                onClick={handleSaveApiKey}
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
