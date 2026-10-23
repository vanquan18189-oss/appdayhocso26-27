import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw, Wifi, WifiOff, X, Database, RotateCw, ShieldAlert } from 'lucide-react';
import {
  resetFirestoreQuotaAndEnableNetwork,
  getSessionInternalAssertionCount
} from '../../firebaseConfig';
import {
  getFirestoreDebugStatus,
  subscribeFirestoreDebugStatus,
  FirestoreDebugStatus
} from '../../services/firestoreWriteVerificationService';

function calculateLocalStorageBytes(): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key) || '';
        total += (key.length + val.length) * 2; // UTF-16 bytes approx
      }
    }
  } catch {}
  return total;
}

export const FirestoreConnectivityBanner: React.FC = () => {
  const [showWarningBanner, setShowWarningBanner] = useState(false);
  const [warningMessage, setWarningMessage] = useState('Dữ liệu chưa được lưu lên máy chủ, vui lòng kiểm tra kết nối');
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Assertion error banner
  const [showAssertionBanner, setShowAssertionBanner] = useState(false);
  const [assertionMessage, setAssertionMessage] = useState('Kết nối dữ liệu gặp sự cố, dữ liệu có thể chưa được lưu. Bấm để tải lại trang');

  // Debug Panel state (?debug=1)
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [debugStatus, setDebugStatus] = useState<FirestoreDebugStatus>(getFirestoreDebugStatus());
  const [localStorageSizeKB, setLocalStorageSizeKB] = useState('0 KB');

  useEffect(() => {
    // Check if ?debug=1 in query string or URL hash
    const checkDebug = () => {
      if (typeof window !== 'undefined') {
        const hasDebug = window.location.search.includes('debug=1') || window.location.hash.includes('debug=1');
        setIsDebugMode(hasDebug);
        if (hasDebug) {
          const bytes = calculateLocalStorageBytes();
          setLocalStorageSizeKB(`${(bytes / 1024).toFixed(1)} KB (${(bytes / (1024 * 1024)).toFixed(2)} MB)`);
        }
      }
    };
    checkDebug();
    window.addEventListener('popstate', checkDebug);

    // Subscribe to Firestore debug status updates
    const unsubscribeDebug = subscribeFirestoreDebugStatus((status) => {
      setDebugStatus(status);
    });

    // Listen to pending write timeout event (> 10s)
    const handleTimeout = (e: any) => {
      const msg = e.detail?.message || 'Dữ liệu chưa được lưu lên máy chủ, vui lòng kiểm tra kết nối';
      setWarningMessage(msg);
      setShowWarningBanner(true);
    };

    const handleResolved = () => {
      setShowWarningBanner(false);
    };

    // Listen to INTERNAL ASSERTION FAILED error event
    const handleAssertionError = (e: any) => {
      const msg = e.detail?.message || 'Kết nối dữ liệu gặp sự cố, dữ liệu có thể chưa được lưu. Bấm để tải lại trang';
      setAssertionMessage(msg);
      setShowAssertionBanner(true);
    };

    window.addEventListener('eduplay_pending_write_timeout', handleTimeout);
    window.addEventListener('eduplay_pending_write_resolved', handleResolved);
    window.addEventListener('eduplay_firestore_assertion_error', handleAssertionError);

    return () => {
      window.removeEventListener('popstate', checkDebug);
      window.removeEventListener('eduplay_pending_write_timeout', handleTimeout);
      window.removeEventListener('eduplay_pending_write_resolved', handleResolved);
      window.removeEventListener('eduplay_firestore_assertion_error', handleAssertionError);
      unsubscribeDebug();
    };
  }, []);

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setShowWarningBanner(true);
    const count = debugStatus.pendingWritesCount || 1;
    setWarningMessage(`Đang kết nối lại và chờ đồng bộ...`);

    try {
      const success = await resetFirestoreQuotaAndEnableNetwork();
      if (success) {
        setWarningMessage(`Đang gửi ${count} thay đổi lên máy chủ...`);
        try {
          const { waitForPendingWrites } = await import('firebase/firestore');
          const { db } = await import('../../firebaseConfig');
          if (db) {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Hết thời gian chờ gửi dữ liệu lên máy chủ')), 10000)
            );
            await Promise.race([waitForPendingWrites(db), timeoutPromise]);
          }
          setWarningMessage('Đã gửi xong!');
          setTimeout(() => {
            setShowWarningBanner(false);
          }, 2500);
        } catch (syncErr: any) {
          const msg = syncErr?.message || String(syncErr || '');
          setWarningMessage(`⚠ Lỗi khi gửi dữ liệu lên máy chủ: ${msg}`);
        }
      } else {
        setWarningMessage('⚠ Không thể khôi phục kết nối Firestore. Vui lòng kiểm tra lại mạng.');
      }
    } catch (err: any) {
      setWarningMessage(`⚠ Lỗi khôi phục kết nối: ${err?.message || err}`);
    } finally {
      setIsReconnecting(false);
    }
  };

  const portalContainer = typeof document !== 'undefined' ? document.body : null;
  if (!portalContainer) return null;

  return createPortal(
    <>
      {/* INTERNAL ASSERTION FAILED ERROR BANNER WITH RELOAD BUTTON */}
      {showAssertionBanner && (
        <div className="fixed top-0 left-0 right-0 z-[10000] bg-gradient-to-r from-red-700 via-rose-700 to-amber-700 text-white shadow-2xl px-4 py-3 animate-slide-down flex items-center justify-between gap-4 border-b-2 border-amber-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6 text-amber-200 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-wide text-amber-100">
                ⚠️ {assertionMessage}
              </p>
              <p className="text-[11px] text-amber-200 font-medium">
                Cảnh báo kết nối luồng Firestore: Phiên đồng bộ gặp xung đột, vui lòng bấm nút bên cạnh để tải lại trang.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-amber-400 text-slate-900 font-extrabold text-xs hover:bg-amber-300 shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <RotateCw className="w-4 h-4 text-slate-900" />
              <span>Tải lại trang</span>
            </button>
            <button
              onClick={() => setShowAssertionBanner(false)}
              className="p-2 rounded-xl hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* GLOBAL WARNING BANNER FOR WRITES PENDING > 10s */}
      {showWarningBanner && !showAssertionBanner && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-amber-600 via-rose-600 to-amber-700 text-white shadow-2xl px-4 py-3 animate-slide-down flex items-center justify-between gap-4 border-b border-rose-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-200 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-wide">
                ⚠️ {warningMessage}
              </p>
              <p className="text-[11px] text-amber-100 font-medium">
                Các thao tác ghi (giao đề, giao bài, xóa) đang được chờ đồng bộ lên Cloud Firestore.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="px-4 py-2 rounded-xl bg-white text-rose-700 font-extrabold text-xs hover:bg-amber-50 shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
              <span>{isReconnecting ? 'Đang khôi phục...' : 'Khôi phục kết nối'}</span>
            </button>
            <button
              onClick={() => setShowWarningBanner(false)}
              className="p-2 rounded-xl hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* FRAME ?debug=1 DEBUG MONITOR */}
      {isDebugMode && (
        <div className="fixed bottom-4 right-4 z-[99999] bg-slate-900/95 text-slate-100 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/80 p-4 max-w-md w-full text-xs space-y-2.5 font-mono">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <Database className="w-4 h-4 text-amber-400" />
              <span>Firestore Debug Monitor (?debug=1)</span>
            </div>
            <button
              onClick={() => setIsDebugMode(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 1. Phiên bản SDK */}
          <div className="flex items-center justify-between bg-slate-800/80 p-2 rounded-xl border border-slate-700">
            <span className="font-semibold text-slate-300">1. Phiên bản SDK:</span>
            <span className="font-bold text-emerald-400">Firebase v12.18.0</span>
          </div>

          {/* 2. Cấu hình Cache và Long Polling */}
          <div className="flex flex-col bg-slate-800/80 p-2 rounded-xl border border-slate-700 space-y-1">
            <span className="font-semibold text-slate-300">2. Cấu hình Cache & Stream:</span>
            <span className="text-[11px] text-indigo-300">Cache: <code className="text-amber-300">persistentSingleTabManager</code></span>
            <span className="text-[11px] text-indigo-300">Long Polling: <code className="text-amber-300">experimentalAutoDetectLongPolling: true</code></span>
          </div>

          {/* 3. Số lần xảy ra Internal Assertion trong phiên */}
          <div className="flex items-center justify-between bg-slate-800/80 p-2 rounded-xl border border-slate-700">
            <span className="font-semibold text-slate-300">3. Internal Assertions (Phiên):</span>
            <span className={`font-bold ${getSessionInternalAssertionCount() > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-300'}`}>
              {getSessionInternalAssertionCount()} lần
            </span>
          </div>

          {/* 4. Tổng dung lượng localStorage */}
          <div className="flex items-center justify-between bg-slate-800/80 p-2 rounded-xl border border-slate-700">
            <span className="font-semibold text-slate-300">4. Dung lượng localStorage:</span>
            <span className="font-bold text-amber-300">{localStorageSizeKB}</span>
          </div>

          {/* Network Status */}
          <div className="flex items-center justify-between bg-slate-800/80 p-2 rounded-xl border border-slate-700">
            <span className="font-semibold text-slate-300">Tình trạng mạng:</span>
            {debugStatus.online ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Wifi className="w-3.5 h-3.5" /> Bật (Connected)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                <WifiOff className="w-3.5 h-3.5" /> Tắt (Offline/Exceeded)
              </span>
            )}
          </div>

          {/* Pending Writes Count */}
          <div className="flex items-center justify-between bg-slate-800/80 p-2 rounded-xl border border-slate-700">
            <span className="font-semibold text-slate-300">Số thao tác ghi đang chờ:</span>
            <span className={`font-bold text-sm ${debugStatus.pendingWritesCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
              {debugStatus.pendingWritesCount} pending
            </span>
          </div>

          {/* Main Collections fromCache state */}
          <div className="space-y-1 pt-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase">Trạng thái cache từng danh sách:</div>

            <div className="flex items-center justify-between bg-slate-800/50 px-2.5 py-1 rounded-lg border border-slate-700/50">
              <span>📄 Exams (`exams`):</span>
              <span className={debugStatus.collections.exams.fromCache ? 'text-amber-300 font-semibold' : 'text-emerald-400 font-bold'}>
                {debugStatus.collections.exams.fromCache ? 'cache' : 'server'} ({debugStatus.collections.exams.size})
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 px-2.5 py-1 rounded-lg border border-slate-700/50">
              <span>📝 Assignments (`assignments`):</span>
              <span className={debugStatus.collections.assignments.fromCache ? 'text-amber-300 font-semibold' : 'text-emerald-400 font-bold'}>
                {debugStatus.collections.assignments.fromCache ? 'cache' : 'server'} ({debugStatus.collections.assignments.size})
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 px-2.5 py-1 rounded-lg border border-slate-700/50">
              <span>❓ Questions (`questions`):</span>
              <span className={debugStatus.collections.questions.fromCache ? 'text-amber-300 font-semibold' : 'text-emerald-400 font-bold'}>
                {debugStatus.collections.questions.fromCache ? 'cache' : 'server'} ({debugStatus.collections.questions.size})
              </span>
            </div>
          </div>

          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>Khôi phục kết nối Firestore</span>
          </button>
        </div>
      )}
    </>,
    portalContainer
  );
};

