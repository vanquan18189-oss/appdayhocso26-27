import {
  SsoLoginResult,
  checkInitialSsoAutoLogin,
  cleanSsoParamsFromUrl,
  clearSsoSession,
  decodeUtf8Base64,
  getSavedSsoSession,
  isEmbeddedIframe,
  mapSsoTabToActiveModule,
  persistSsoTeacherSession,
} from '../services/ssoAutoLoginService';

export type { SsoLoginResult };

export {
  checkInitialSsoAutoLogin,
  cleanSsoParamsFromUrl,
  clearSsoSession,
  decodeUtf8Base64,
  getSavedSsoSession,
  isEmbeddedIframe,
  mapSsoTabToActiveModule,
  persistSsoTeacherSession,
};

/**
 * Đăng ký lắng nghe sự kiện postMessage ('PK_TRUC_KHANG_SSO_LOGIN' hoặc 'SSO_AUTO_LOGIN')
 * từ cổng chính "Dạy và Học Số PK Trực Khang" để tự động thiết lập phiên đăng nhập (currentUser)
 * và lưu vào localStorage.
 */
export function subscribeToSsoMessages(
  onAuthenticated: (result: SsoLoginResult) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleMessage = (event: MessageEvent) => {
    const data = event?.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'PK_TRUC_KHANG_SSO_LOGIN' || data.type === 'SSO_AUTO_LOGIN') {
      const payload = data.payload || data.user || data;
      const rawEmail = String(payload.email || data.email || '').trim();
      const rawName = String(payload.name || payload.displayName || data.name || '').trim();
      const rawRole = String(payload.role || data.role || '').trim();
      const rawTab = String(payload.tab || payload.module || data.tab || data.module || 'assignment').trim();

      if (rawEmail || isEmbeddedIframe()) {
        const result = persistSsoTeacherSession({
          email: rawEmail,
          name: rawName,
          role: rawRole,
          rawTab,
        });
        onAuthenticated(result);
      }
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}
