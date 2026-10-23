import React from 'react';
import { AlertTriangle, AlertCircle, X, RotateCcw } from 'lucide-react';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemName?: string;
  itemType?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDeleting?: boolean;
  deleteProgress?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Xác nhận xóa',
  itemName,
  itemType = 'mục này',
  description,
  confirmLabel = 'Đồng ý',
  cancelLabel = 'Hủy bỏ',
  isDeleting = false,
  deleteProgress,
  errorMessage,
  onRetry
}) => {
  if (!isOpen) return null;

  // Derive title text uppercase format if needed
  const displayTitle = title.startsWith('Xác nhận') || title.startsWith('XÁC NHẬN') 
    ? title.toUpperCase() 
    : `XÁC NHẬN XÓA ${title.toUpperCase()}`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-4 flex items-center justify-between text-white shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-300" />
            </div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
              {displayTitle}
            </h3>
          </div>
          {/* Close button (X) MUST ALWAYS BE CLICKABLE */}
          <button
            onClick={onClose}
            className="p-1.5 text-indigo-100 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer transition-colors"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {errorMessage ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-700">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                <span>Không thể hoàn tất thao tác xóa</span>
              </div>
              <p className="text-xs leading-relaxed text-rose-700">{errorMessage}</p>
            </div>
          ) : (
            <div className="text-sm text-slate-700 leading-relaxed font-medium">
              {description ? (
                <span>{description}</span>
              ) : (
                <span>
                  Thầy/Cô có chắc chắn muốn xóa {itemType}:{' '}
                  {itemName ? (
                    <strong className="text-indigo-700 font-bold">"{itemName}"</strong>
                  ) : (
                    <strong className="text-indigo-700 font-bold">mục đã chọn</strong>
                  )}{' '}
                  không? Dữ liệu điểm và bài làm liên quan sẽ không thể khôi phục.
                </span>
              )}
            </div>
          )}

          {isDeleting && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-700">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
                  Đang xử lý dữ liệu...
                </span>
                <span>{deleteProgress || 'Đang xóa...'}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 rounded-full animate-pulse w-full" />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          {/* Cancel/Close button MUST ALWAYS BE CLICKABLE */}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer active:scale-95 shadow-2xs"
          >
            {errorMessage ? 'Đóng' : cancelLabel}
          </button>

          {errorMessage ? (
            <button
              type="button"
              onClick={onRetry || onConfirm}
              className="px-6 py-2.5 rounded-xl font-extrabold text-xs text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/25 cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!isDeleting) {
                  onConfirm();
                }
              }}
              disabled={isDeleting}
              className="px-6 py-2.5 rounded-xl font-extrabold text-xs text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md shadow-rose-600/25 cursor-pointer active:scale-95 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isDeleting ? (deleteProgress ? `Đang xóa (${deleteProgress})...` : 'Đang xóa...') : confirmLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

