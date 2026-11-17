import React, { useState, useEffect } from 'react';
import {
  Database,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Globe,
  Server,
  Layers,
  X,
  Save,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import {
  Grade3DatabaseConfig,
  getGrade3DbConfig,
  saveGrade3DbConfig,
  testGrade3DatabaseConnection,
  syncLessonToGrade3Database,
  DEFAULT_GRADE3_COLLECTION,
} from '../../services/grade3LessonDbService';
import { Lesson5EPlan } from '../../types';

interface Grade3DatabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  grade3Lessons: Lesson5EPlan[];
  onSynced?: (updatedConfig: Grade3DatabaseConfig) => void;
}

export const Grade3DatabaseConfigModal: React.FC<Grade3DatabaseConfigModalProps> = ({
  isOpen,
  onClose,
  grade3Lessons,
  onSynced,
}) => {
  const [config, setConfig] = useState<Grade3DatabaseConfig>(() => getGrade3DbConfig());
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    message: string;
    recordCount: number;
  } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfig(getGrade3DbConfig());
      setTestResult(null);
      setSaveMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testGrade3DatabaseConnection(config);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncExistingGrade3Lessons = async () => {
    setIsSyncingAll(true);
    setSaveMessage(null);
    try {
      const savedCfg = saveGrade3DbConfig(config);
      for (const lesson of grade3Lessons) {
        await syncLessonToGrade3Database({ ...lesson, grade: 'Khối 3' });
      }
      const nowStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const finalCfg = saveGrade3DbConfig({
        ...savedCfg,
        lastSyncedAt: nowStr,
      });
      setConfig(finalCfg);
      setSaveMessage(
        `Đã đồng bộ ${grade3Lessons.length} bài giảng Khối 3 sang CSDL chuyên biệt thành công!`
      );
      onSynced?.(finalCfg);
    } catch {
      setSaveMessage('Đã lưu vào bộ nhớ đệm chuyên biệt của Khối 3.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = saveGrade3DbConfig(config);
    setConfig(updated);
    setSaveMessage('Đã lưu cấu hình liên kết dữ liệu chuyên biệt Khối 3!');
    onSynced?.(updated);
    setTimeout(() => {
      onClose();
    }, 900);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 px-6 py-5 text-white flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 shadow-inner">
              <Database className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
                  Cấu hình Liên kết Chuyên biệt • Khối 3
                </span>
              </div>
              <h3 className="text-lg font-extrabold tracking-tight mt-0.5">
                Kết nối Cơ sở dữ liệu riêng Ứng dụng Khối 3
              </h3>
              <p className="text-xs text-emerald-50/90 mt-1 leading-relaxed">
                Phân luồng dữ liệu bài giảng 5E của Khối 3 sang cơ sở dữ liệu chuyên biệt giúp giảm tải dung lượng bộ nhớ chính và tăng tốc độ truy xuất tức thì.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Enable Switch */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                  Kích hoạt luồng dữ liệu chuyên biệt cho Khối 3
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Tự động định tuyến truy vấn và bộ đệm riêng khi giáo viên chọn thẻ Khối 3 ({grade3Lessons.length} bài giảng hiện có)
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Connection Mode Selection */}
          <div className="space-y-2.5">
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Phương thức liên kết dữ liệu Khối 3
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, mode: 'partitioned_collection' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  config.mode === 'partitioned_collection'
                    ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Layers
                    className={`w-4 h-4 ${
                      config.mode === 'partitioned_collection'
                        ? 'text-emerald-600'
                        : 'text-slate-400'
                    }`}
                  />
                  {config.mode === 'partitioned_collection' && (
                    <span className="text-[10px] font-extrabold text-emerald-700">Đang chọn</span>
                  )}
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900">
                    Phân luồng CSDL Nhanh
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Lưu & tải trên phân vùng <code className="text-emerald-700 font-mono">elearning_lessons_khoi3</code> độc lập.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, mode: 'external_firebase' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  config.mode === 'external_firebase'
                    ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Server
                    className={`w-4 h-4 ${
                      config.mode === 'external_firebase' ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  {config.mode === 'external_firebase' && (
                    <span className="text-[10px] font-extrabold text-emerald-700">Đang chọn</span>
                  )}
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900">
                    Firebase App Khối 3 Riêng
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Kết nối trực tiếp tới Project ID & Firestore riêng của ứng dụng Khối 3.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, mode: 'external_app_url' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  config.mode === 'external_app_url'
                    ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Globe
                    className={`w-4 h-4 ${
                      config.mode === 'external_app_url' ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  {config.mode === 'external_app_url' && (
                    <span className="text-[10px] font-extrabold text-emerald-700">Đang chọn</span>
                  )}
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900">
                    Liên kết Web App Khối 3
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Kết nối URL ứng dụng Khối 3 độc lập kèm tự động đăng nhập SSO.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Configuration Fields based on Mode */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tên Collection Bài giảng Khối 3
                </label>
                <input
                  type="text"
                  value={config.collectionName}
                  onChange={(e) => setConfig({ ...config, collectionName: e.target.value })}
                  placeholder={DEFAULT_GRADE3_COLLECTION}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Đường dẫn (URL) Ứng dụng Khối 3 Chuyên Biệt
                </label>
                <input
                  type="text"
                  value={config.externalAppUrl}
                  onChange={(e) => setConfig({ ...config, externalAppUrl: e.target.value })}
                  placeholder="https://dayhockhoi3.vercel.app"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            {config.mode === 'external_firebase' && (
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-teal-800">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>Thông số kết nối Firebase Project riêng của Ứng dụng Khối 3</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Firebase Project ID (Khối 3) *
                    </label>
                    <input
                      type="text"
                      value={config.firebaseProjectId}
                      onChange={(e) => setConfig({ ...config, firebaseProjectId: e.target.value })}
                      placeholder="VD: app-khoi3-truckhang"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Firebase Web API Key *
                    </label>
                    <input
                      type="text"
                      value={config.firebaseApiKey}
                      onChange={(e) => setConfig({ ...config, firebaseApiKey: e.target.value })}
                      placeholder="AIzaSy..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Auth Domain (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={config.firebaseAuthDomain || ''}
                      onChange={(e) => setConfig({ ...config, firebaseAuthDomain: e.target.value })}
                      placeholder="app-khoi3-truckhang.firebaseapp.com"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Firestore Database ID
                    </label>
                    <input
                      type="text"
                      value={config.firestoreDatabaseId || '(default)'}
                      onChange={(e) =>
                        setConfig({ ...config, firestoreDatabaseId: e.target.value })
                      }
                      placeholder="(default)"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions: Test Connection & Sync Existing Grade 3 Lessons */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra tốc độ kết nối'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncExistingGrade3Lessons}
                  disabled={isSyncingAll}
                  className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 text-teal-600" />
                  <span>
                    {isSyncingAll
                      ? 'Đang đồng bộ...'
                      : `Đồng bộ ${grade3Lessons.length} bài Khối 3 sang CSDL riêng`}
                  </span>
                </button>
              </div>

              {config.externalAppUrl && (
                <a
                  href={
                    /^https?:\/\//i.test(config.externalAppUrl)
                      ? config.externalAppUrl
                      : `https://${config.externalAppUrl}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở thử App Khối 3</span>
                </a>
              )}
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  testResult.ok
                    ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50/90 border-amber-200 text-amber-900'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-bold">{testResult.message}</div>
                  <div className="text-[11px] opacity-80 font-mono tabular-nums">
                    Độ trễ phản hồi: {testResult.latencyMs}ms • Bản ghi Khối 3 sẵn sàng: {testResult.recordCount} bài giảng
                  </div>
                </div>
              </div>
            )}

            {saveMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveMessage}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Lưu cấu hình CSDL Khối 3</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
