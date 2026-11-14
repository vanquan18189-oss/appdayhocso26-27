import React, { useEffect, useState } from 'react';
import {
  Download,
  FileText,
  QrCode,
  X
} from 'lucide-react';
import { Lesson5EPlan } from '../../types';
import {
  SCHOOL_HEADER_LINE_1,
  SCHOOL_HEADER_LINE_2,
  SCHOOL_HEADER_LINE_3,
  buildLessonPublicUrl,
  downloadLessonQrImages,
  exportElearningCatalogToDocx,
  formatLessonSubjectGrade,
  generateQrMapForLessons,
  getLessonFormatOrTopic
} from '../../utils/elearningExportUtils';

export interface ElearningExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessons: Lesson5EPlan[];
  titleContext?: string;
}

export const ElearningExportModal: React.FC<ElearningExportModalProps> = ({
  isOpen,
  onClose,
  lessons,
  titleContext
}) => {
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);
  const [exportingType, setExportingType] = useState<'docx' | 'qr' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || lessons.length === 0) {
      setQrMap({});
      return;
    }

    let cancelled = false;
    setIsGeneratingQr(true);
    setFeedbackMsg(null);

    generateQrMapForLessons(lessons, 200)
      .then((map) => {
        if (!cancelled) {
          setQrMap(map);
        }
      })
      .catch((err) => {
        console.warn('Error generating QR previews:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsGeneratingQr(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, lessons]);

  if (!isOpen) return null;

  const handleExportWord = async () => {
    if (lessons.length === 0) return;
    setExportingType('docx');
    setFeedbackMsg(null);
    try {
      await exportElearningCatalogToDocx(lessons, qrMap);
      setFeedbackMsg('Đã xuất file Word (.docx) kèm mã QR thành công.');
    } catch (err) {
      console.error('Export Word error:', err);
      setFeedbackMsg('Không thể xuất file Word. Vui lòng thử lại.');
    } finally {
      setExportingType(null);
    }
  };

  const handleDownloadQrImages = async () => {
    if (lessons.length === 0) return;
    setExportingType('qr');
    setFeedbackMsg(null);
    try {
      await downloadLessonQrImages(lessons);
      setFeedbackMsg(
        lessons.length === 1
          ? 'Đã tải ảnh Mã QR (.png) thành công.'
          : 'Đã tải gói ảnh Mã QR (.zip) thành công.'
      );
    } catch (err) {
      console.error('Download QR error:', err);
      setFeedbackMsg('Không thể tải ảnh Mã QR. Vui lòng thử lại.');
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-100 rounded-3xl w-full max-w-5xl max-h-[92vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Toolbar with 2 Action Buttons + Close */}
        <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <QrCode className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  Xem trước Phiếu Danh mục Bài giảng E-learning &amp; Mã QR
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {titleContext
                    ? `${titleContext} (${lessons.length} bài giảng)`
                    : `Đang chọn ${lessons.length} bài giảng • Khổ giấy A4`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-nowrap">
            <button
              type="button"
              disabled={lessons.length === 0 || exportingType !== null}
              onClick={handleExportWord}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>{exportingType === 'docx' ? 'Đang xuất Word...' : 'Xuất Word (.docx)'}</span>
            </button>

            <button
              type="button"
              disabled={lessons.length === 0 || exportingType !== null}
              onClick={handleDownloadQrImages}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>{exportingType === 'qr' ? 'Đang tải QR...' : 'Tải ảnh Mã QR'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer shrink-0"
              title="Đóng cửa sổ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {feedbackMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 text-xs font-bold text-emerald-800 shrink-0">
            {feedbackMsg}
          </div>
        )}

        {/* Scrollable A4 Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          {lessons.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto space-y-2">
              <QrCode className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">Chưa có bài giảng nào trong danh sách lọc</p>
              <p className="text-xs text-slate-500">
                Vui lòng chọn tab hoặc bộ lọc có bài giảng để xem trước và xuất phiếu Mã QR.
              </p>
            </div>
          ) : (
            <div
              className="bg-white mx-auto shadow-lg border border-slate-300 px-6 py-8 sm:px-10 sm:py-10 text-slate-900"
              style={{ maxWidth: '794px', minHeight: '640px' }}
            >
              {/* Administrative Print Header */}
              <div className="text-center space-y-1.5 mb-6">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 uppercase">
                  {SCHOOL_HEADER_LINE_1}
                </h1>
                <p className="text-sm font-bold text-slate-800">
                  {SCHOOL_HEADER_LINE_2}
                </p>
                <p className="text-xs sm:text-sm italic text-slate-600">
                  {SCHOOL_HEADER_LINE_3}
                </p>
              </div>

              {/* 5-Column Bordered Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-500 text-xs">
                  <thead>
                    <tr className="bg-slate-200/80 text-slate-900">
                      <th className="border border-slate-500 px-2.5 py-2.5 text-center font-extrabold w-12">
                        STT
                      </th>
                      <th className="border border-slate-500 px-3 py-2.5 text-center font-extrabold w-[26%]">
                        Tiêu đề bài giảng
                      </th>
                      <th className="border border-slate-500 px-3 py-2.5 text-center font-extrabold w-[20%]">
                        Hình thức / Chủ đề
                      </th>
                      <th className="border border-slate-500 px-3 py-2.5 text-center font-extrabold w-[28%]">
                        Đường dẫn bài giảng
                      </th>
                      <th className="border border-slate-500 px-2.5 py-2.5 text-center font-extrabold w-[124px]">
                        Mã QR của bài giảng
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessons.map((lesson, idx) => {
                      const publicUrl = buildLessonPublicUrl(lesson.id);
                      const qrSrc = qrMap[lesson.id];

                      return (
                        <tr key={lesson.id} className="align-middle">
                          <td className="border border-slate-500 px-2.5 py-3 text-center font-bold text-slate-900">
                            {idx + 1}
                          </td>

                          <td className="border border-slate-500 px-3 py-3">
                            <div className="font-bold text-slate-900 leading-snug">
                              {lesson.title}
                            </div>
                            <div className="text-[11px] font-semibold text-sky-700 mt-1">
                              {formatLessonSubjectGrade(lesson)}
                            </div>
                          </td>

                          <td className="border border-slate-500 px-3 py-3 text-slate-800 leading-snug">
                            {getLessonFormatOrTopic(lesson)}
                          </td>

                          <td className="border border-slate-500 px-3 py-3 break-all">
                            <a
                              href={publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 underline hover:text-blue-900 font-medium"
                            >
                              {publicUrl}
                            </a>
                          </td>

                          <td className="border border-slate-500 p-2 text-center">
                            {qrSrc ? (
                              <img
                                src={qrSrc}
                                alt={`Mã QR ${lesson.title}`}
                                className="w-[100px] h-[100px] mx-auto block"
                              />
                            ) : (
                              <div className="w-[100px] h-[100px] mx-auto flex items-center justify-center bg-slate-50 border border-slate-200 text-[10px] text-slate-400">
                                {isGeneratingQr ? 'Đang tạo QR...' : 'QR'}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
