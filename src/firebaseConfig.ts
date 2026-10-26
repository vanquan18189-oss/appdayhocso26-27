import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  getDocFromServer,
  doc,
  persistentLocalCache,
  persistentSingleTabManager,
  Firestore
} from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || (import.meta as any).env?.FIREBASE_API_KEY || "",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || (import.meta as any).env?.FIREBASE_AUTH_DOMAIN || "",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || (import.meta as any).env?.FIREBASE_PROJECT_ID || "",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || (import.meta as any).env?.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || (import.meta as any).env?.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || (import.meta as any).env?.FIREBASE_APP_ID || "",
  measurementId: (import.meta as any).env?.VITE_FIREBASE_MEASUREMENT_ID || (import.meta as any).env?.FIREBASE_MEASUREMENT_ID || ""
};

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Khởi tạo Firestore bằng getFirestore(app) với cơ chế fallback initializeFirestore
export const db: Firestore = (() => {
  try {
    return getFirestore(app);
  } catch {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({})
      }),
    });
  }
})();

export const auth: Auth = getAuth(app);

// Bộ đếm số lần xảy ra Internal Assertion trong phiên
export let sessionInternalAssertionCount = 0;

export function getSessionInternalAssertionCount(): number {
  return sessionInternalAssertionCount;
}

const QUOTA_EXCEEDED_KEY = 'eduplay_firestore_quota_v2_exceeded';
const QUOTA_TIMESTAMP_KEY = 'eduplay_firestore_quota_v2_timestamp';
const QUOTA_EXPIRATION_MS = 2 * 60 * 60 * 1000;
const LAST_PROJECT_KEY = 'eduplay_firebase_current_project';

// Tự động kiểm tra và xóa sạch bộ đếm quota khi chuyển sang project mới
if (typeof window !== 'undefined') {
  try {
    const currentProject = firebaseConfig.projectId;
    const lastProject = localStorage.getItem(LAST_PROJECT_KEY);
    if (lastProject !== currentProject) {
      localStorage.setItem(LAST_PROJECT_KEY, currentProject);
      localStorage.removeItem(QUOTA_EXCEEDED_KEY);
      localStorage.removeItem(QUOTA_TIMESTAMP_KEY);
      localStorage.removeItem('eduplay_firestore_quota_exceeded');
      localStorage.removeItem('eduplay_firestore_quota_timestamp');
      localStorage.removeItem('eduplay_firestore_write_stats');
      localStorage.removeItem('eduplay_cached_questions');
      localStorage.removeItem('eduplay_cached_exams');
      localStorage.removeItem('eduplay_cached_assignments');
      localStorage.removeItem('eduplay_5e_lessons');
      localStorage.removeItem('eduplay_cached_games');
      localStorage.removeItem('eduplay_questions_db_initialized');
      localStorage.removeItem('eduplay_elearning_assigned_lessons');
      console.log(`[FirebaseConfig] Đã kích hoạt project mới: ${currentProject}. Đã xóa sạch bộ đếm Quota & cache cũ.`);
    }
  } catch {}
}

export function isFirestoreQuotaExceeded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isExceeded = localStorage.getItem(QUOTA_EXCEEDED_KEY) === 'true';
    if (!isExceeded) return false;

    const timestampStr = localStorage.getItem(QUOTA_TIMESTAMP_KEY);
    if (timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      if (!isNaN(timestamp) && Date.now() - timestamp > QUOTA_EXPIRATION_MS) {
        localStorage.removeItem(QUOTA_EXCEEDED_KEY);
        localStorage.removeItem(QUOTA_TIMESTAMP_KEY);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function markFirestoreQuotaExceeded(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUOTA_EXCEEDED_KEY, 'true');
    localStorage.setItem(QUOTA_TIMESTAMP_KEY, Date.now().toString());
    window.dispatchEvent(new CustomEvent('eduplay_firestore_network_status_changed', {
      detail: { quotaExceeded: true, online: false }
    }));
  } catch {}
}

export async function resetFirestoreQuotaAndEnableNetwork(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(QUOTA_EXCEEDED_KEY);
      localStorage.removeItem(QUOTA_TIMESTAMP_KEY);
      localStorage.removeItem('eduplay_firestore_quota_exceeded');
      localStorage.removeItem('eduplay_firestore_quota_timestamp');
      localStorage.removeItem('eduplay_firestore_write_stats');
    } catch {}
  }
  window.dispatchEvent(new CustomEvent('eduplay_firestore_network_status_changed', {
    detail: { quotaExceeded: false, online: true }
  }));
  return true;
}

export async function testFirestoreServerConnectionOnBoot(): Promise<boolean> {
  if (!db) return false;
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PING_TIMEOUT')), 4000)
    );
    const testDocRef = doc(db, '_system_check_', 'ping');
    await Promise.race([getDocFromServer(testDocRef), timeoutPromise]);
    await resetFirestoreQuotaAndEnableNetwork();
    return true;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.code === 'functions/resource-exhausted') {
      markFirestoreQuotaExceeded();
      return false;
    }
    return true;
  }
}

function safeStringifyArg(arg: any): string {
  if (!arg) return '';
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) {
    const ctx = (arg as any).context || (arg as any).el;
    return `${arg.name} ${arg.message} ${arg.stack || ''} ${ctx ? safeStringifyArg(ctx) : ''}`;
  }
  try {
    return JSON.stringify(arg, (key, val) => {
      if (val instanceof Error) {
        return `${val.name} ${val.message} ${val.stack || ''}`;
      }
      return val;
    });
  } catch {
    return String(arg);
  }
}

function isFirestoreAssertionError(str: string): boolean {
  return (
    str.includes('INTERNAL ASSERTION FAILED') ||
    str.includes('Unexpected state') ||
    str.includes('ca9') ||
    str.includes('b815') ||
    str.includes('c050') ||
    str.includes('WatchChangeAggregator')
  );
}

function isWebSocketError(str: string): boolean {
  return (
    str.includes('WebSocket') ||
    str.includes('closed without opened') ||
    str.includes('failed to connect to websocket')
  );
}

// Bắt lỗi toàn cục CHỈ ghi log & hiển thị biểu ngữ cảnh báo rõ ràng cho người dùng, KHÔNG ẩn lỗi
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const errorString = args.map(safeStringifyArg).join(' ');

    if (isWebSocketError(errorString)) {
      return; // Suppress Vite HMR WebSocket error in iframe sandbox
    }

    originalConsoleError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const errorString = safeStringifyArg(reason);

    if (isWebSocketError(errorString)) {
      event.preventDefault();
      try { (event as any).stopImmediatePropagation?.(); } catch {}
      return;
    }

    if (isFirestoreAssertionError(errorString)) {
      sessionInternalAssertionCount++;
      console.warn('⚠️ [Firestore INTERNAL ASSERTION FAILED Log]:', reason);
      window.dispatchEvent(new CustomEvent('eduplay_firestore_assertion_error', {
        detail: {
          message: 'Kết nối dữ liệu gặp sự cố, dữ liệu có thể chưa được lưu. Bấm để tải lại trang',
          rawError: errorString
        }
      }));
    }
  });

  window.addEventListener('error', (event) => {
    const errorString = safeStringifyArg(event.error) + ' ' + safeStringifyArg(event.message);

    if (isWebSocketError(errorString)) {
      event.preventDefault();
      try { (event as any).stopImmediatePropagation?.(); } catch {}
      return;
    }

    if (isFirestoreAssertionError(errorString)) {
      sessionInternalAssertionCount++;
      console.warn('⚠️ [Firestore INTERNAL ASSERTION FAILED Window Error Log]:', event.error || event.message);
      window.dispatchEvent(new CustomEvent('eduplay_firestore_assertion_error', {
        detail: {
          message: 'Kết nối dữ liệu gặp sự cố, dữ liệu có thể chưa được lưu. Bấm để tải lại trang',
          rawError: errorString
        }
      }));
    }
  });

  setTimeout(() => {
    testFirestoreServerConnectionOnBoot().catch(() => {});
  }, 1000);
}
