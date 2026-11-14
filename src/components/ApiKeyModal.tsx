import React, { useState } from 'react';
import {
  X,
  Cpu,
  CheckCircle2,
  Sparkles,
  Server,
} from 'lucide-react';
import { setAdminSelectedModel, getAdminSelectedModel } from '../services/geminiService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
  const [model, setModel] = useState(() => getAdminSelectedModel() || 'gemini-4-hydrogen');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSelectedModel(model);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">Cấu Hình AI Engine</h3>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Đang hoạt động
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Kết nối mô hình trí tuệ nhân tạo Gemini Sư Phạm Trực Khang
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-sm">
          {/* Status info card */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-50/80 to-violet-50/50 border border-indigo-100 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-600" /> Trạng thái máy chủ AI:
              </span>
              <span className="font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Sẵn sàng (Server-Side)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Chế độ kết nối:</span>
              <span className="font-semibold text-indigo-700">Tập trung qua Backend Proxy</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mô hình AI Sư Phạm mặc định
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Mặc định - Nhanh, thông minh & ổn định)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Flash Lite siêu tốc)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Flash đa nhiệm ổn định)</option>
            </select>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium text-xs transition-colors"
            >
              Đóng
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition-colors flex items-center gap-1.5"
            >
              {isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Đã lưu thành công!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Lưu cấu hình</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
