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
 * Lưu phiên đăng nhập liên thông SSO vào localStorage và sessionStorage
 */
export function persistSsoTeacherSession(params: {
  email: string;
  name?: string | null;
  role?: string | null;
  rawTab?: string | null;
}): SsoLoginResult {
  const cleanEmail = (params.email || '').trim().toLowerCase();
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
      params.name || null,
      teachersList,
      effectiveRole
    );

  const targetModule = mapSsoTabToActiveModule(params.rawTab);

  const sessionPayload = {
    id: localProfile?.id || cleanEmail,
    uid: localProfile?.id || cleanEmail,
    email: cleanEmail,
    name: effectiveName,
    displayName: effectiveName,
    role: effectiveRole,
    userRole: effectiveRole,
    targetModule,
    rawTab: params.rawTab || undefined,
    autologin: true,
    source: 'PK_TRUC_KHANG_LMS',
    loggedInAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('eduplay_teacher_email', cleanEmail);
      localStorage.setItem('eduplay_teacher_name', effectiveName);
      localStorage.setItem('eduplay_user_role', effectiveRole);
      localStorage.setItem('eduplay_active_role', effectiveRole);
      localStorage.setItem(SSO_SESSION_KEY, JSON.stringify(sessionPayload));
      localStorage.setItem('khls_current_user', JSON.stringify(sessionPayload));

      sessionStorage.setItem(SSO_AUTH_FLAG_KEY, 'true');
      sessionStorage.setItem(SSO_SESSION_KEY, JSON.stringify(sessionPayload));
      sessionStorage.setItem('eduplay_teacher_email', cleanEmail);
      sessionStorage.setItem('eduplay_teacher_name', effectiveName);
      sessionStorage.setItem('eduplay_user_role', effectiveRole);
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
    rawTab: params.rawTab || undefined,
  };
}

/**
 * Xóa sạch các tham số SSO (email, token, autologin, sso_token, sso_email, sso_name, sso_role) trên thanh địa chỉ
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
 * Kiểm tra ngay khi khởi động ứng dụng xem trên URL (window.location.search) có:
 * - ?email=...&token=...&autologin=true hoặc ?sso_token=...&sso_email=...
 * - Hoặc trong sessionStorage đã có phiên SSO đang hoạt động hay chưa.
 */
export function checkInitialSsoAutoLogin(): SsoLoginResult | null {
  if (typeof window === 'undefined') return null;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const rawToken = searchParams.get('sso_token') || searchParams.get('token');
    const rawEmailParam = searchParams.get('sso_email') || searchParams.get('email');
    const rawNameParam = searchParams.get('sso_name') || searchParams.get('name');
    const rawRoleParam = searchParams.get('sso_role') || searchParams.get('role');
    const rawAutoLoginParam = searchParams.get('autologin') || searchParams.get('auto_login');
    const rawTabParam = searchParams.get('tab') || searchParams.get('module');

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

    // Nếu truyền ?autologin=true nhưng chưa kèm email trực tiếp trên URL thì lấy email giáo viên đã lưu
    if (
      !resolvedEmail &&
      (rawAutoLoginParam === 'true' || rawAutoLoginParam === '1')
    ) {
      resolvedEmail =
        (localStorage.getItem('eduplay_teacher_email') || '').trim() ||
        (sessionStorage.getItem('eduplay_teacher_email') || '').trim();
    }

    if (resolvedEmail) {
      const result = persistSsoTeacherSession({
        email: resolvedEmail,
        name: resolvedName,
        role: resolvedRole,
        rawTab: resolvedTab,
      });
      cleanSsoParamsFromUrl();
      return result;
    }

    // Nếu trong cùng phiên làm việc (sessionStorage) đã đăng nhập SSO trước đó (ví dụ F5 trang con)
    const isSsoActive = sessionStorage.getItem(SSO_AUTH_FLAG_KEY) === 'true';
    const rawSavedSession = sessionStorage.getItem(SSO_SESSION_KEY);
    if (isSsoActive && rawSavedSession) {
      const parsed = JSON.parse(rawSavedSession);
      if (parsed && typeof parsed.email === 'string' && parsed.email.trim()) {
        const nextModule = mapSsoTabToActiveModule(resolvedTab) || parsed.targetModule;
        if (resolvedTab) {
          cleanSsoParamsFromUrl();
        }
        return {
          authenticated: true,
          email: parsed.email,
          name: parsed.name || resolveTeacherNameByEmail(parsed.email),
          role: parsed.role === 'admin' ? 'admin' : 'teacher',
          targetModule: nextModule,
          rawTab: resolvedTab || parsed.rawTab,
        };
      }
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra SSO khi khởi động:', err);
  }

  return null;
}

/**
 * Xóa phiên SSO khi người dùng chủ động bấm Đăng xuất
 */
export function clearSsoSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SSO_AUTH_FLAG_KEY);
    sessionStorage.removeItem(SSO_SESSION_KEY);
    sessionStorage.removeItem('eduplay_teacher_email');
    sessionStorage.removeItem('eduplay_teacher_name');
    sessionStorage.removeItem('eduplay_user_role');
    localStorage.removeItem(SSO_SESSION_KEY);
    localStorage.removeItem('khls_current_user');
  } catch {}
}
