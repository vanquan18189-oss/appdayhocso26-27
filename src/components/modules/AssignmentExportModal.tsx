import React, { useEffect, useState } from 'react';
import { X, FileText, QrCode, Loader2, ExternalLink } from 'lucide-react';
import { HomeworkAssignment } from '../../types';
import {
  ASSIGNMENT_HEADER_LINE_1,
  ASSIGNMENT_HEADER_LINE_2,
  ASSIGNMENT_HEADER_LINE_3,
  buildAssignmentPublicUrl,
  formatAssignmentSubjectGradeClass,
  getAssignmentTypeLabel,
  generateQrMapForAssignments,
  exportAssignmentCatalogToDocx,
  downloadAssignmentQrImages,
} from '../../utils/assignmentExportUtils';

interface AssignmentExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignments: HomeworkAssignment[];
  titleContext?: string;
}

export const AssignmentExportModal: React.FC<AssignmentExportModalProps> = ({
  isOpen,
  onClose,
  assignments,
  titleContext,
}) => {
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [exportingType, setExportingType] = useState<'docx' | 'qr' | null>(null);

  useEffect(() => {
    if (!isOpen || assignments.length === 0) {
      setQrMap({});
      return;
    }

    let cancelled = false;
    setIsGeneratingQr(true);
    generateQrMapForAssignments(assignments, 200)
      .then((map) => {
        if (!cancelled) {
          setQrMap(map);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGeneratingQr(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, assignments]);

  if (!isOpen) return null;

  const handleExportDocx = async () => {
    if (assignments.length === 0 || exportingType) return;
    setExportingType('docx');
    try {
      await exportAssignmentCatalogToDocx(assignments, qrMap);
    } catch (error) {
      console.error('Lỗi khi xuất file Word bài tập:', error);
    } finally {
      setExportingType(null);
    }
  };

  const handleDownloadQr = async () => {
    if (assignments.length === 0 || exportingType) return;
    setExportingType('qr');
    try {
      await downloadAssignmentQrImages(assignments);
    } catch (error) {
      console.error('Lỗi khi tải ảnh Mã QR bài tập:', error);
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Thanh công cụ phía trên Modal: hiển thị gọn gàng trên 1 hàng ngang với 2 nút hành động + nút đóng (X) */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Xem trước Phiếu danh mục Bài tập & Mã QR ({assignments.length} bài tập)
              </h3>
              {titleContext && (
                <p className="text-xs text-slate-500 truncate">{titleContext}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportDocx}
              disabled={assignments.length === 0 || exportingType !== null}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              {exportingType === 'docx' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>Xuất Word (.docx)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadQr}
              disabled={assignments.length === 0 || exportingType !== null}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              {exportingType === 'qr' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4" />
              )}
              <span>Tải ảnh Mã QR</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Vùng xem trước trang giấy khổ A4 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="bg-white mx-auto max-w-[210mm] min-h-[260mm] shadow-md border border-slate-300 rounded-sm p-6 sm:p-10 text-slate-900">
            {/* Phần tiêu đề phiếu in chuẩn hành chính nhà trường */}
            <div className="text-center mb-6 space-y-1.5">
              <h1 className="text-base sm:text-xl font-extrabold uppercase tracking-tight text-slate-900">
                {ASSIGNMENT_HEADER_LINE_1}
              </h1>
              <p className="text-sm sm:text-base font-bold text-slate-800">
                {ASSIGNMENT_HEADER_LINE_2}
              </p>
              <p className="text-xs sm:text-sm italic text-slate-600">
                {ASSIGNMENT_HEADER_LINE_3}
              </p>
            </div>

            {assignments.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm border border-dashed border-slate-300 rounded-xl">
                Không có bài tập nào trong danh sách để xuất phiếu.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-500 text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900">
                      <th className="border border-slate-500 px-2.5 py-2.5 text-center font-bold w-12">
                        STT
                      </th>
                      <th className="border border-slate-500 px-3 py-2.5 text-left font-bold">
                        Tiêu đề bài tập
                      </th>
                      <th className="border border-slate-500 px-3 py-2.5 text-center font-bold w-40">
                        Loại bài tập
                      </th>
                      <th className="border border-slate-500 px-3 py-2.5 text-left font-bold">
                        Đường dẫn làm bài
                      </th>
                      <th className="border border-slate-500 px-2.5 py-2.5 text-center font-bold w-32">
                        Mã QR của bài tập
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((item, idx) => {
                      const url = buildAssignmentPublicUrl(item.id);
                      const qrSrc = qrMap[item.id];
                      const metaSubline = formatAssignmentSubjectGradeClass(item);
                      const typeLabel = getAssignmentTypeLabel(item);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="border border-slate-500 px-2.5 py-3 text-center font-bold text-slate-800 align-middle">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-500 px-3 py-3 align-middle">
                            <div className="font-bold text-slate-900 leading-snug">
                              {item.title}
                            </div>
                            <div className="text-xs font-semibold text-sky-700 mt-1">
                              {metaSubline}
                            </div>
                          </td>
                          <td className="border border-slate-500 px-3 py-3 text-center text-slate-800 font-medium align-middle">
                            {typeLabel}
                          </td>
                          <td className="border border-slate-500 px-3 py-3 align-middle break-all">
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1 font-medium text-xs leading-relaxed"
                            >
                              <span>{url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </td>
                          <td className="border border-slate-500 px-2.5 py-2.5 text-center align-middle">
                            <div className="flex items-center justify-center">
                              {qrSrc ? (
                                <img
                                  src={qrSrc}
                                  alt={`QR ${item.title}`}
                                  width={100}
                                  height={100}
                                  className="w-[100px] h-[100px] object-contain border border-slate-200 rounded-xs bg-white p-0.5"
                                />
                              ) : (
                                <div className="w-[100px] h-[100px] flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 text-[11px]">
                                  {isGeneratingQr ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                  ) : (
                                    'Đang tạo QR'
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
