import {
  waitForPendingWrites,
  getDocFromServer,
  DocumentReference,
  doc
} from 'firebase/firestore';
import { db, resetFirestoreQuotaAndEnableNetwork, isFirestoreQuotaExceeded } from '../firebaseConfig';

export interface WriteVerificationResult {
  success: boolean;
  serverVerified: boolean;
  message: string;
  error?: string;
}

export interface FirestoreDebugStatus {
  online: boolean;
  quotaExceeded: boolean;
  pendingWritesCount: number;
  collections: {
    exams: { fromCache: boolean; size: number; hasPendingWrites?: boolean };
    assignments: { fromCache: boolean; size: number; hasPendingWrites?: boolean };
    questions: { fromCache: boolean; size: number; hasPendingWrites?: boolean };
  };
}

let activePendingWritesCount = 0;

const debugStatusState: FirestoreDebugStatus = {
  online: true,
  quotaExceeded: false,
  pendingWritesCount: 0,
  collections: {
    exams: { fromCache: true, size: 0, hasPendingWrites: false },
    assignments: { fromCache: true, size: 0, hasPendingWrites: false },
    questions: { fromCache: true, size: 0, hasPendingWrites: false },
  }
};

const statusListeners = new Set<(status: FirestoreDebugStatus) => void>();

export function getFirestoreDebugStatus(): FirestoreDebugStatus {
  return {
    ...debugStatusState,
    quotaExceeded: isFirestoreQuotaExceeded(),
    online: !isFirestoreQuotaExceeded()
  };
}

export function subscribeFirestoreDebugStatus(listener: (status: FirestoreDebugStatus) => void): () => void {
  statusListeners.add(listener);
  listener(getFirestoreDebugStatus());
  return () => {
    statusListeners.delete(listener);
  };
}

function notifyDebugStatusChange() {
  const current = getFirestoreDebugStatus();
  statusListeners.forEach(listener => {
    try {
      listener(current);
    } catch {}
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('eduplay_firestore_debug_updated', { detail: current }));
  }
}

export function updateCollectionCacheStatus(
  collectionName: 'exams' | 'assignments' | 'questions',
  fromCache: boolean,
  size: number,
  hasPendingWrites: boolean = false
) {
  debugStatusState.collections[collectionName] = {
    fromCache,
    size,
    hasPendingWrites
  };
  notifyDebugStatusChange();
}

/**
 * Mọi thao tác ghi quan trọng (giao đề, giao bài, xóa, lưu cấu hình)
 * phải đợi waitForPendingWrites() có timeout, rồi đọc lại bằng getDocFromServer.
 */
export async function waitForWriteConfirmation(
  docRef?: DocumentReference | null,
  timeoutMs: number = 12000,
  isDeleteAction: boolean = false
): Promise<WriteVerificationResult> {
  if (!db) {
    return {
      success: false,
      serverVerified: false,
      message: '⚠ Chưa gửi được lên máy chủ (Chưa kết nối database)',
      error: 'NO_DB'
    };
  }

  activePendingWritesCount++;
  debugStatusState.pendingWritesCount = activePendingWritesCount;
  notifyDebugStatusChange();

  let warningTimer: any = null;

  try {
    // 1. Cảnh báo toàn cục nếu chờ quá 10 giây
    warningTimer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('eduplay_pending_write_timeout', {
          detail: {
            message: 'Dữ liệu chưa được lưu lên máy chủ, vui lòng kiểm tra kết nối',
            pendingCount: activePendingWritesCount
          }
        }));
      }
    }, 10000);

    // 2. Chờ thao tác ghi hoàn tất bằng waitForPendingWrites kèm Timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT_PENDING_WRITES')), timeoutMs)
    );

    await Promise.race([waitForPendingWrites(db), timeoutPromise]);

    if (warningTimer) clearTimeout(warningTimer);

    // Xóa cờ cảnh báo toàn cục khi ghi thành công
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eduplay_pending_write_resolved'));
    }

    // 3. Đọc lại từ máy chủ bằng getDocFromServer để xác nhận dữ liệu thực sự trên Cloud
    if (docRef) {
      try {
        const serverSnap = await getDocFromServer(docRef);
        if (isDeleteAction) {
          if (!serverSnap.exists()) {
            return {
              success: true,
              serverVerified: true,
              message: 'Đã xóa thành công khỏi máy chủ!'
            };
          } else {
            return {
              success: false,
              serverVerified: false,
              message: '⚠ Chưa xóa được trên máy chủ',
              error: 'DOCUMENT_STILL_EXISTS_ON_SERVER'
            };
          }
        } else {
          if (serverSnap.exists()) {
            return {
              success: true,
              serverVerified: true,
              message: 'Đã lưu thành công lên máy chủ!'
            };
          } else {
            return {
              success: false,
              serverVerified: false,
              message: '⚠ Chưa gửi được lên máy chủ (Không tìm thấy bản ghi trên máy chủ)',
              error: 'DOCUMENT_NOT_FOUND_ON_SERVER'
            };
          }
        }
      } catch (readErr: any) {
        console.warn('Lỗi đọc lại từ máy chủ qua getDocFromServer:', readErr);
        // Trường hợp không đọc lại được nhưng waitForPendingWrites thành công
        return {
          success: true,
          serverVerified: false,
          message: 'Đã gửi ghi tới máy chủ (đang chờ đồng bộ)'
        };
      }
    }

    return {
      success: true,
      serverVerified: true,
      message: 'Đã lưu thành công lên máy chủ!'
    };
  } catch (err: any) {
    if (warningTimer) clearTimeout(warningTimer);

    const isTimeout = err?.message === 'TIMEOUT_PENDING_WRITES';
    const errorMsg = isTimeout
      ? '⚠ Chưa gửi được lên máy chủ (Quá thời gian chờ 12s)'
      : (err?.message || '⚠ Chưa gửi được lên máy chủ');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eduplay_pending_write_timeout', {
        detail: {
          message: 'Dữ liệu chưa được lưu lên máy chủ, vui lòng kiểm tra kết nối',
          pendingCount: activePendingWritesCount
        }
      }));
    }

    return {
      success: false,
      serverVerified: false,
      message: errorMsg,
      error: isTimeout ? 'TIMEOUT_PENDING_WRITES' : (err?.code || String(err))
    };
  } finally {
    activePendingWritesCount = Math.max(0, activePendingWritesCount - 1);
    debugStatusState.pendingWritesCount = activePendingWritesCount;
    notifyDebugStatusChange();
  }
}
