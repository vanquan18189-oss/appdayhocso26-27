import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertOctagon,
  RefreshCw,
  X,
  Minimize2,
  Maximize2,
  ShieldAlert,
  Database,
  Layers
} from 'lucide-react';
import {
  getFirestoreWriteStats,
  resetFirestoreWriteStats,
  FirestoreWriteStatsSummary,
  BlockedMetricItem
} from '../services/firestoreWriteTracker';
import { firebaseConfig, resetFirestoreQuotaAndEnableNetwork } from '../firebaseConfig';

export const FirestoreDebugOverlay: React.FC = () => {
  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [stats, setStats] = useState<FirestoreWriteStatsSummary>(getFirestoreWriteStats());
  const [rateLimitWarning, setRateLimitWarning] = useState<BlockedMetricItem | null>(null);

  useEffect(() => {
    // Check if ?debug=1 or debug=true in location search/hash
    const checkDebugFlag = () => {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      if (search.includes('debug=1') || search.includes('debug=true') || hash.includes('debug=1')) {
        setIsDebugMode(true);
      }
    };

    checkDebugFlag();

    const handleUpdate = () => {
      setStats(getFirestoreWriteStats());
    };

    const handleRateLimitTriggered = (e: any) => {
      if (e?.detail) {
        setRateLimitWarning(e.detail);
      }
    };

    window.addEventListener('eduplay_firestore_writes_updated', handleUpdate);
    window.addEventListener('eduplay_firestore_rate_limit_triggered', handleRateLimitTriggered);

    return () => {
      window.removeEventListener('eduplay_firestore_writes_updated', handleUpdate);
      window.removeEventListener('eduplay_firestore_rate_limit_triggered', handleRateLimitTriggered);
    };
  }, []);

  if (!isDebugMode && !rateLimitWarning) {
    return null;
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[999999] max-w-2xl w-full text-slate-800 font-sans pointer-events-auto">
      {/* 🚨 RATE LIMIT WARNING BANNER */}
      {rateLimitWarning && (
        <div className={`mb-3 p-4 text-white rounded-xl shadow-2xl border-2 flex items-start justify-between gap-3 animate-bounce ${
          rateLimitWarning.blocked ? 'bg-rose-600 border-rose-300' : 'bg-amber-500 border-amber-300'
        }`}>
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-yellow-200 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                {rateLimitWarning.blocked
                  ? '🛑 [GHI NỀN BỊ CHẶN] Cảnh Báo Tần Suất Cao!'
                  : '⚠️ [CẢNH BÁO THAO TÁC ADMIN] Tần Suất Ghi Lớn'}
              </h4>
              <p className="text-xs text-white/95 mt-1 leading-relaxed">
                Nơi gọi <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold text-yellow-200">{rateLimitWarning.caller}</code> ({
                  rateLimitWarning.isUserInitiated ? 'Thao tác Admin/User' : 'Tiến trình nền/Tự động'
                }) đã đạt <span className="font-bold text-yellow-200">{rateLimitWarning.rate} lượt ghi/phút</span> vào collection <span className="underline font-semibold">{rateLimitWarning.collection}</span>.
              </p>
              <p className="text-[11px] text-yellow-100 mt-1">
                {rateLimitWarning.blocked
                  ? '🛡️ Tự động ngắt lệnh ghi nền để bảo vệ Quota Firestore.'
                  : 'ℹ️ Hệ thống cho phép thực thi tiếp do là thao tác chủ động của Admin.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setRateLimitWarning(null)}
            className="p-1 hover:bg-black/20 rounded-lg text-white/80 hover:text-white cursor-pointer shrink-0 transition-colors"
            title="Đóng cảnh báo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 📊 DEBUG METRICS TABLE (When ?debug=1) */}
      {isDebugMode && (
        <div className="bg-slate-900/95 backdrop-blur-md text-slate-100 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden text-xs">
          {/* Header */}
          <div className="bg-slate-800/90 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-sm text-white">Firestore Write Tracker (?debug=1)</span>
              <span className="bg-indigo-500/20 text-indigo-300 font-mono text-[11px] px-2 py-0.5 rounded-full border border-indigo-500/30 font-semibold" title="Active Firebase Project">
                {firebaseConfig.projectId}
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 font-mono text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/30 font-semibold">
                Tổng: {stats.totalWrites} lượt ghi
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  resetFirestoreWriteStats();
                  await resetFirestoreQuotaAndEnableNetwork();
                  setStats(getFirestoreWriteStats());
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-lg transition-colors cursor-pointer text-[11px] font-medium"
                title="Đặt lại bộ đếm Quota & Thống kê về 0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Đặt lại bộ đếm</span>
              </button>

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer transition-colors"
                title={isMinimized ? 'Mở rộng' : 'Thu gọn'}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsDebugMode(false)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer transition-colors"
                title="Đóng bảng đo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body content */}
          {!isMinimized && (
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Database className="w-3 h-3 text-blue-400" />
                    <span>Tổng số lệnh ghi</span>
                  </div>
                  <div className="text-lg font-bold text-blue-300 font-mono mt-0.5">
                    {stats.totalWrites}
                  </div>
                </div>

                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Layers className="w-3 h-3 text-purple-400" />
                    <span>Collections</span>
                  </div>
                  <div className="text-lg font-bold text-purple-300 font-mono mt-0.5">
                    {Object.keys(stats.byCollection).length}
                  </div>
                </div>

                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold flex items-center gap-1">
                    <AlertOctagon className="w-3 h-3 text-amber-400" />
                    <span>Lần bị ngắt (&gt;200/phút)</span>
                  </div>
                  <div className="text-lg font-bold text-amber-300 font-mono mt-0.5">
                    {stats.blockedWritesCount}
                  </div>
                </div>
              </div>

              {/* By Collection Table */}
              <div>
                <h5 className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span>1. Thống kê số lượt ghi theo Collection</span>
                </h5>
                {Object.keys(stats.byCollection).length === 0 ? (
                  <div className="text-slate-500 italic text-[11px] py-2 bg-slate-800/30 rounded-lg text-center">
                    Chưa ghi nhận lệnh ghi nào trong phiên làm việc này.
                  </div>
                ) : (
                  <div className="bg-slate-800/40 rounded-xl overflow-hidden border border-slate-700/50">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800/80 text-slate-400 text-[10px] uppercase border-b border-slate-700/60">
                          <th className="py-2 px-3 font-semibold">Collection Name</th>
                          <th className="py-2 px-3 font-semibold text-right">Số lượt ghi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/40 font-mono text-[11px]">
                        {Object.entries(stats.byCollection)
                          .sort((a, b) => b[1] - a[1])
                          .map(([coll, count]) => (
                            <tr key={coll} className="hover:bg-slate-700/30 transition-colors">
                              <td className="py-1.5 px-3 text-indigo-300 font-medium">{coll}</td>
                              <td className="py-1.5 px-3 text-right font-bold text-emerald-400">{count}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* By Caller Location (Stack Trace) Table */}
              <div>
                <h5 className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. Thống kê theo Nơi gọi (File & Dòng code)</span>
                </h5>
                {Object.keys(stats.byCaller).length === 0 ? (
                  <div className="text-slate-500 italic text-[11px] py-2 bg-slate-800/30 rounded-lg text-center">
                    Chưa có ghi nhận vị trí gọi.
                  </div>
                ) : (
                  <div className="bg-slate-800/40 rounded-xl overflow-hidden border border-slate-700/50">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800/80 text-slate-400 text-[10px] uppercase border-b border-slate-700/60">
                          <th className="py-2 px-3 font-semibold">Caller Location (Nơi gọi)</th>
                          <th className="py-2 px-3 font-semibold text-right">Số lượt ghi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/40 font-mono text-[11px]">
                        {Object.entries(stats.byCaller)
                          .sort((a, b) => b[1] - a[1])
                          .map(([caller, count]) => (
                            <tr key={caller} className="hover:bg-slate-700/30 transition-colors">
                              <td className="py-1.5 px-3 text-amber-300 font-semibold">{caller}</td>
                              <td className="py-1.5 px-3 text-right font-bold text-emerald-400">{count}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Blocked Calls Details if any */}
              {stats.blockedDetails.length > 0 && (
                <div>
                  <h5 className="font-semibold text-amber-400 mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>3. Nhật ký lệnh ghi bị ngắt do vượt ngưỡng (&gt;200/phút)</span>
                  </h5>
                  <div className="bg-amber-950/30 rounded-xl border border-amber-500/30 p-2.5 space-y-1.5 max-h-36 overflow-y-auto">
                    {stats.blockedDetails.map((b) => (
                      <div key={b.id} className="text-[11px] font-mono text-amber-200 flex justify-between border-b border-amber-900/40 pb-1">
                        <span>{b.caller} ({b.collection})</span>
                        <span className="font-bold text-amber-400">{b.rate} lượt/phút</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};
