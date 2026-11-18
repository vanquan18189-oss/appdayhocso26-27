import { ActiveModule, UserRole } from '../types';
import {
  fetchCurrentTeacherProfile,
  getCurrentTeacherProfile,
  getTeachersFromLocalStorage,
  resolveTeacherNameByEmail,
} from './teacherStorageService';

export interface SsoLoginResult {
  authenticated: boolean;
  email: string;
  name: string;
  role: UserRole;
  targetModule?: ActiveModule;
  rawTab?: string;
}

const SSO_SESSION_KEY = 'eduplay_sso_session';
const SSO_AUTH_FLAG_KEY = 'eduplay_sso_authenticated';
const KHLS_USER_KEY = 'khls_current_user';
const DEFAULT_PORTAL_TEACHER_EMAIL = 'thuthuthtk@gmail.com';
const DEFAULT_PORTAL_TEACHER_NAME = 'Nguyễn Thị Thu';

let isClearingSsoSession = false;
let isStorageGuardInstalled = false;

/**
 * Kiểm tra xem ứng dụng có đang chạy bên trong khung nhúng iframe (window.self !== window.top) hay không
 */
export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    // Nếu trình duyệt chặn truy cập window.top do khác origin thì chắc chắn đang nằm trong iframe
    return true;
  }
}

/**
 * Bảo vệ phiên SSO trong localStorage khỏi bị xóa ngoài ý muốn bởi sự kiện khởi tạo Firebase Auth (onAuthStateChanged(null))
 * khi giáo viên đăng nhập qua SSO/iframe mà không dùng mật khẩu trực tiếp.
 */
function installSsoLocalStorageGuard(): void {
  if (typeof window === 'undefined' || isStorageGuardInstalled) return;
  isStorageGuardInstalled = true;

  try {
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      if (
        !isClearingSsoSession &&
        this === window.localStorage &&
        (key === 'eduplay_teacher_email' || key === 'eduplay_teacher_name')
      ) {
        const ssoActive =
          window.localStorage.getItem(SSO_AUTH_FLAG_KEY) === 'true' ||
          window.sessionStorage.getItem(SSO_AUTH_FLAG_KEY) === 'true' ||
          isEmbeddedIframe();
        if (ssoActive) {
          return;
        }
      }
      return originalRemoveItem.call(this, key);
    };
  } catch {
    // Bỏ qua nếu môi trường không cho phép ghi đè prototype
  }
}

/**
 * Giải mã chuỗi Base64 UTF-8 an toàn
 */
export function decodeUtf8Base64(encoded: string): Record<string, any> | null {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    const clean = encoded.trim().replace(/ /g, '+');
    if (typeof atob === 'undefined') return null;
    const binary = atob(clean);
    if (typeof TextDecoder !== 'undefined') {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      return JSON.parse(jsonStr);
    }
    const fallbackStr = decodeURIComponent(
      binary
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(fallbackStr);
  } catch {
    return null;
  }
}

/**
 * Ánh xạ tham số điều hướng nhanh trên URL (tab=assignment, tab=lesson_5e, tab=ppt-ai, tab=exam-ai, tab=game, tab=library)
 * sang phân hệ chức năng tương ứng
 */
export function mapSsoTabToActiveModule(tabOrModule?: string | null): ActiveModule | undefined {
  const normalized = (tabOrModule || '').trim().toLowerCase();
  if (!normalized) return undefined;

  if (
    normalized === 'lesson_5e' ||
    normalized === 'ppt-ai' ||
    normalized === 'lesson' ||
    normalized === 'elearning'
  ) {
    return 'lesson_5e';
  }
  if (
    normalized === 'exam_management' ||
    normalized === 'exam-ai' ||
    normalized === 'exam-matrix' ||
    normalized === 'exam' ||
    normalized === 'matrix'
  ) {
    return 'exam_management';
  }
  if (
    normalized === 'interactive_games' ||
    normalized === 'game' ||
    normalized === 'games' ||
    normalized === 'game-ai'
  ) {
    return 'interactive_games';
  }
  if (
    normalized === 'dashboard' ||
    normalized === 'library' ||
    normalized === 'school-library' ||
    normalized === 'kho-hoc-lieu'
  ) {
    return 'dashboard';
  }
  if (
    normalized === 'question_bank' ||
    normalized === 'question-bank' ||
    normalized === 'questions'
  ) {
    return 'question_bank';
  }
  if (
    normalized === 'assignment' ||
    normalized === 'homework' ||
    normalized === 'bai-tap' ||
    normalized === 'quan-ly-bai-tap'
  ) {
    return 'assignment';
  }
  if (normalized === 'hoc_ba_so' || normalized === 'hoc-ba-so') {
    return 'hoc_ba_so';
  }
  return undefined;
}

/**
 * Đọc thông tin phiên SSO đã lưu trong localStorage hoặc sessionStorage
 */
export function getSavedSsoSession(): Record<string, any> | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawSession =
      localStorage.getItem(SSO_SESSION_KEY) ||
      sessionStorage.getItem(SSO_SESSION_KEY) ||
      localStorage.getItem(KHLS_USER_KEY);
    if (!rawSession) return null;
    const parsed = JSON.parse(rawSession);
    if (parsed && typeof parsed === 'object' && typeof parsed.email === 'string') {
      return parsed;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
}

/**
 * Lưu phiên đăng nhập liên thông SSO vào localStorage và sessionStorage
 * để khi chuyển tab, thao tác hoặc tải lại trang bên trong phân hệ Quản lý bài tập
 * không bao giờ bị văng ngược ra màn hình đăng nhập.
 */
export function persistSsoTeacherSession(params: {
  email: string;
  name?: string | null;
  role?: string | null;
  rawTab?: string | null;
}): SsoLoginResult {
  installSsoLocalStorageGuard();

  const cleanEmail = (params.email || DEFAULT_PORTAL_TEACHER_EMAIL).trim().toLowerCase();
  const localProfile = getCurrentTeacherProfile(cleanEmail);
  const teachersList = getTeachersFromLocalStorage();

  const isAdminRole =
    String(params.role || '').toLowerCase() === 'admin' ||
    localProfile?.userRole === 'admin' ||
    cleanEmail === 'thuthuthtk@gmail.com' ||
    cleanEmail === 'vanquan18189@gmail.com' ||
    cleanEmail.includes('admin');

  const effectiveRole: UserRole = isAdminRole ? 'admin' : 'teacher';

  const effectiveName =
    localProfile?.name ||
    resolveTeacherNameByEmail(
      cleanEmail,
      params.name || (cleanEmail === DEFAULT_PORTAL_TEACHER_EMAIL ? DEFAULT_PORTAL_TEACHER_NAME : null),
      teachersList,
      effectiveRole
    );

  const savedSession = getSavedSsoSession();
  const targetModule: ActiveModule =
    mapSsoTabToActiveModule(params.rawTab) ||
    mapSsoTabToActiveModule(savedSession?.rawTab) ||
    (savedSession?.targetModule as ActiveModule | undefined) ||
    'assignment';

  const sessionPayload = {
    id: localProfile?.id || cleanEmail,
    uid: localProfile?.id || cleanEmail,
    email: cleanEmail,
    name: effectiveName,
    displayName: effectiveName,
    role: effectiveRole,
    userRole: effectiveRole,
    targetModule,
    rawTab: params.rawTab || savedSession?.rawTab || 'assignment',
    autologin: true,
    auto_login: true,
    source: 'PK_TRUC_KHANG_LMS',
    loggedInAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      // Lưu bền vững vào localStorage để chuyển tab hoặc F5 không bao giờ mất phiên
      localStorage.setItem(SSO_AUTH_FLAG_KEY, 'true');
      localStorage.setItem(SSO_SESSION_KEY, JSON.stringify(sessionPayload));
      localStorage.setItem(KHLS_USER_KEY, JSON.stringify(sessionPayload));
      localStorage.setItem('eduplay_teacher_email', cleanEmail);
      localStorage.setItem('eduplay_teacher_name', effectiveName);
      localStorage.setItem('eduplay_user_role', effectiveRole);
      localStorage.setItem('eduplay_active_role', effectiveRole);

      // Đồng bộ cả sessionStorage
      sessionStorage.setItem(SSO_AUTH_FLAG_KEY, 'true');
      sessionStorage.setItem(SSO_SESSION_KEY, JSON.stringify(sessionPayload));
      sessionStorage.setItem('eduplay_teacher_email', cleanEmail);
      sessionStorage.setItem('eduplay_teacher_name', effectiveName);
      sessionStorage.setItem('eduplay_user_role', effectiveRole);

      // Phát sự kiện để đồng bộ tên giáo viên trên Header
      window.setTimeout(() => {
        window.dispatchEvent(new Event('eduplay_teachers_updated'));
      }, 50);
    } catch (err) {
      console.warn('Không thể lưu phiên SSO vào bộ nhớ trình duyệt:', err);
    }

    // Đồng bộ ngầm hồ sơ giáo viên mới nhất từ Firestore (nếu có)
    fetchCurrentTeacherProfile(cleanEmail)
      .then((cloudProfile) => {
        if (cloudProfile && cloudProfile.name) {
          try {
            localStorage.setItem('eduplay_teacher_name', cloudProfile.name);
            sessionStorage.setItem('eduplay_teacher_name', cloudProfile.name);
            window.dispatchEvent(new Event('eduplay_teachers_updated'));
          } catch {}
        }
      })
      .catch(() => {});
  }

  return {
    authenticated: true,
    email: cleanEmail,
    name: effectiveName,
    role: effectiveRole,
    targetModule,
    rawTab: params.rawTab || sessionPayload.rawTab,
  };
}

/**
 * Xóa sạch các tham số SSO (email, token, autologin, auto_login, sso_token, sso_email, sso_name, sso_role) trên thanh địa chỉ
 */
export function cleanSsoParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const ssoKeys = [
      'sso_token',
      'token',
      'sso_email',
      'email',
      'sso_name',
      'name',
      'sso_role',
      'role',
      'sso_uid',
      'autologin',
      'auto_login',
      'tab',
      'module',
    ];
    let mutated = false;
    ssoKeys.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        mutated = true;
      }
    });

    if (mutated) {
      const nextSearch = url.searchParams.toString();
      const cleanUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch (err) {
    console.warn('Không thể làm sạch tham số SSO trên URL:', err);
  }
}

/**
 * Kiểm tra ngay khi khởi động ứng dụng (tương tự ssoAuth.ts của Kho Học Liệu Số):
 * 1. Nếu URL có chứa các tham số như ?sso_email=, ?sso_token=, ?auto_login=true (hoặc ?autologin=true, ?email=, ?token=)
 * 2. HOẶC ứng dụng đang chạy bên trong khung nhúng iframe (window.self !== window.top)
 * 3. HOẶC đã có phiên đăng nhập SSO lưu trong localStorage / sessionStorage
 * -> Lập tức bỏ qua màn hình đăng nhập và vào thẳng giao diện quản lý bài tập (hoặc phân hệ đích).
 * Nếu truy cập trực tiếp từ đường dẫn gốc ở bên ngoài (không phải iframe, không có tham số SSO, chưa có phiên SSO),
 * trả về null để hệ thống yêu cầu đăng nhập bình thường.
 */
export function checkInitialSsoAutoLogin(): SsoLoginResult | null {
  if (typeof window === 'undefined') return null;

  installSsoLocalStorageGuard();

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const rawToken = searchParams.get('sso_token') || searchParams.get('token');
    const rawEmailParam = searchParams.get('sso_email') || searchParams.get('email');
    const rawNameParam = searchParams.get('sso_name') || searchParams.get('name');
    const rawRoleParam = searchParams.get('sso_role') || searchParams.get('role');
    const rawAutoLoginParam = searchParams.get('auto_login') || searchParams.get('autologin');
    const rawTabParam = searchParams.get('tab') || searchParams.get('module');

    const hasSsoUrlTrigger =
      Boolean(rawToken) ||
      Boolean(rawEmailParam) ||
      rawAutoLoginParam === 'true' ||
      rawAutoLoginParam === '1';

    const runningInIframe = isEmbeddedIframe();
    const savedSession = getSavedSsoSession();

    let resolvedEmail = (rawEmailParam || '').trim();
    let resolvedName = (rawNameParam || '').trim();
    let resolvedRole = (rawRoleParam || '').trim();
    let resolvedTab = (rawTabParam || '').trim();

    if (rawToken) {
      const decoded = decodeUtf8Base64(rawToken);
      if (decoded && typeof decoded === 'object') {
        if (!resolvedEmail && typeof decoded.email === 'string') {
          resolvedEmail = decoded.email.trim();
        }
        if (!resolvedName && typeof decoded.name === 'string') {
          resolvedName = decoded.name.trim();
        }
        if (!resolvedRole && typeof decoded.role === 'string') {
          resolvedRole = decoded.role.trim();
        }
        if (!resolvedTab && typeof (decoded.tab || decoded.module) === 'string') {
          resolvedTab = String(decoded.tab || decoded.module).trim();
        }
      }
    }

    // Trường hợp 1: Có tham số SSO trên URL (?sso_email=, ?sso_token=, ?auto_login=true, ?autologin=true)
    // HOẶC đang chạy bên trong khung nhúng iframe (window.self !== window.top)
    if (hasSsoUrlTrigger || runningInIframe) {
      if (!resolvedEmail) {
        resolvedEmail =
          (savedSession?.email || '').trim() ||
          (localStorage.getItem('eduplay_teacher_email') || '').trim() ||
          (sessionStorage.getItem('eduplay_teacher_email') || '').trim() ||
          DEFAULT_PORTAL_TEACHER_EMAIL;
      }
      if (!resolvedName) {
        resolvedName =
          (savedSession?.name || '').trim() ||
          (localStorage.getItem('eduplay_teacher_name') || '').trim() ||
          (sessionStorage.getItem('eduplay_teacher_name') || '').trim() ||
          (resolvedEmail === DEFAULT_PORTAL_TEACHER_EMAIL ? DEFAULT_PORTAL_TEACHER_NAME : '');
      }
      if (!resolvedRole) {
        resolvedRole =
          (savedSession?.role || '').trim() ||
          (localStorage.getItem('eduplay_user_role') || '').trim() ||
          (sessionStorage.getItem('eduplay_user_role') || '').trim() ||
          'admin';
      }
      if (!resolvedTab) {
        resolvedTab = (savedSession?.rawTab || '').trim() || 'assignment';
      }

      const result = persistSsoTeacherSession({
        email: resolvedEmail,
        name: resolvedName,
        role: resolvedRole,
        rawTab: resolvedTab,
      });

      if (hasSsoUrlTrigger) {
        cleanSsoParamsFromUrl();
      }

      // Khi chạy trong iframe, chủ động gửi thông báo sẵn sàng lên cổng chính để đồng bộ thông tin tài khoản mới nhất
      if (runningInIframe && window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'PK_TRUC_KHANG_REQUEST_SSO' }, '*');
        } catch {}
      }

      return result;
    }

    // Trường hợp 2: Đã có phiên SSO lưu trong localStorage hoặc sessionStorage (khi chuyển tab hoặc F5 tải lại trang)
    const isSsoPersisted =
      localStorage.getItem(SSO_AUTH_FLAG_KEY) === 'true' ||
      sessionStorage.getItem(SSO_AUTH_FLAG_KEY) === 'true';

    if (isSsoPersisted && savedSession && typeof savedSession.email === 'string' && savedSession.email.trim()) {
      const result = persistSsoTeacherSession({
        email: savedSession.email,
        name: savedSession.name,
        role: savedSession.role,
        rawTab: resolvedTab || savedSession.rawTab || savedSession.targetModule || 'assignment',
      });
      if (resolvedTab) {
        cleanSsoParamsFromUrl();
      }
      return result;
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra SSO khi khởi động:', err);
  }

  // Trường hợp 3: Truy cập trực tiếp từ đường dẫn gốc ở bên ngoài (không phải iframe, không có tham số SSO, chưa có phiên SSO)
  // -> Yêu cầu đăng nhập bình thường
  return null;
}

/**
 * Xóa phiên SSO khi người dùng chủ động bấm Đăng xuất
 */
export function clearSsoSession(): void {
  if (typeof window === 'undefined') return;
  isClearingSsoSession = true;
  try {
    localStorage.removeItem(SSO_AUTH_FLAG_KEY);
    localStorage.removeItem(SSO_SESSION_KEY);
    localStorage.removeItem(KHLS_USER_KEY);
    localStorage.removeItem('eduplay_teacher_email');
    localStorage.removeItem('eduplay_teacher_name');
    localStorage.removeItem('eduplay_user_role');

    sessionStorage.removeItem(SSO_AUTH_FLAG_KEY);
    sessionStorage.removeItem(SSO_SESSION_KEY);
    sessionStorage.removeItem('eduplay_teacher_email');
    sessionStorage.removeItem('eduplay_teacher_name');
    sessionStorage.removeItem('eduplay_user_role');
  } catch {
    // Ignore storage removal errors
  } finally {
    isClearingSsoSession = false;
  }
}
