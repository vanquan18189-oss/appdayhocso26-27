import React, { useState, useEffect } from 'react';
import { X, Calendar, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  DateAnomalyItem,
  scanDateAnomaliesInFirestore,
  applyDateMigrationItems
} from '../../services/dateMigrationService';

interface DateMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export const DateMigrationModal: React.FC<DateMigrationModalProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [items, setItems] = useState<DateAnomalyItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAnomalies = async () => {
    setLoading(true);
    setErrorMsg(null);
    setResultMsg(null);
    try {
      const list = await scanDateAnomaliesInFirestore();
      setItems(list);
      setSelectedIds(new Set(list.map((i) => i.id)));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể quét dữ liệu ngày giờ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAnomalies();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleConfirmMigrate = async () => {
    const selected = items.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return;

    setApplying(true);
    setErrorMsg(null);
    try {
      const res = await applyDateMigrationItems(selected);
      setResultMsg(
        `Đã sao lưu (mã: ${res.backupId}) và chuẩn hóa thành công ${res.updatedDocsCount} tài liệu sang chuẩn ISO 8601 UTC (hiển thị DD/MM/YYYY HH:mm 24 giờ)!`
      );
      await loadAnomalies();
      onComplete?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi cập nhật chuẩn hóa ngày giờ.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold">
                Bảng Xem Trước & Chuẩn Hóa Ngày Giờ Dữ Liệu Cũ
              </h3>
              <p className="text-xs text-indigo-100">
                Chuyển đổi chuỗi ngày giờ cũ sang chuẩn lưu trữ ISO 8601 UTC & hiển thị DD/MM/YYYY HH:mm (24 giờ) — Tự động sao lưu trước khi sửa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {resultMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{resultMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                An toàn tuyệt đối: Chỉ chuẩn hóa trường ngày giờ của đề/bài tập, <b>không chạm vào bài nộp hay trạng thái làm bài của học sinh</b>.
              </span>
            </div>
            <button
              type="button"
              onClick={loadAnomalies}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Quét lại</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-semibold">
              Đang quét các đề kiểm tra và bài tập trên Firestore...
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-extrabold text-slate-800">
                Tất cả đề kiểm tra và bài tập đều đã ở định dạng chuẩn ISO 8601 UTC!
              </p>
              <p className="text-xs text-slate-500">
                Mọi giao diện hiện hiển thị đồng nhất theo chuẩn DD/MM/YYYY HH:mm (24 giờ).
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === items.length && items.length > 0}
                        onChange={toggleAll}
                        className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Tên đề / Bài tập</th>
                    <th className="p-3">Lớp</th>
                    <th className="p-3">Trường</th>
                    <th className="p-3">Giá trị đang lưu</th>
                    <th className="p-3">Giá trị đề xuất (Hiển thị 24h & ISO)</th>
                    <th className="p-3">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-bold text-slate-800 max-w-[230px]">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold mr-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {item.collectionName === 'exams' ? 'Đề thi' : 'Bài tập'}
                        </span>
                        {item.title}
                      </td>
                      <td className="p-3 font-bold text-emerald-700 whitespace-nowrap">
                        {item.className}
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {item.fieldLabel}
                      </td>
                      <td className="p-3 font-mono text-rose-600 font-semibold whitespace-nowrap bg-rose-50/40">
                        {item.currentRawValue}
                      </td>
                      <td className="p-3 whitespace-nowrap bg-emerald-50/40">
                        <div className="font-mono font-extrabold text-emerald-700">
                          {item.proposedDisplayVN}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {item.proposedISOValue}
                        </div>
                      </td>
                      <td className="p-3 text-slate-500 max-w-[210px]">
                        {item.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-500">
            Đã chọn <b>{selectedIds.size}</b> / {items.length} mục cần chuẩn hóa
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold cursor-pointer"
            >
              Đóng
            </button>
            {items.length > 0 && (
              <button
                type="button"
                disabled={applying || selectedIds.size === 0}
                onClick={handleConfirmMigrate}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-sm cursor-pointer"
              >
                {applying
                  ? 'Đang sao lưu & cập nhật...'
                  : `Xác nhận chuẩn hóa (${selectedIds.size} mục)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
