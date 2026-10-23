import React, { useState } from 'react';
import {
  FileCheck2,
  Download,
  Shuffle,
  FileText,
  FileSpreadsheet,
  Plus,
  Sparkles,
  Calendar,
  Clock,
  Printer,
  Eye,
  CheckCircle2,
} from 'lucide-react';

export const ExamManagerView: React.FC = () => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const mockExams = [
    {
      id: 'EX-TK-01',
      title: 'Đề Kiểm Tra Cuối Học Kỳ 1 - Môn Công Nghệ Lớp 3',
      grade: 'Khối 3',
      subject: 'Công nghệ',
      duration: '40 phút',
      questionsCount: 20,
      matrix: 'Nhận biết 40% • Thông hiểu 30% • Vận dụng 20% • Vận dụng cao 10%',
      variants: ['Đề 101', 'Đề 102', 'Đề 103', 'Đề 104'],
      date: '2026-10-15',
      status: 'Đã thẩm định ma trận',
    },
    {
      id: 'EX-TK-02',
      title: 'Đề Khảo Sát Giữa Kỳ - Môn Tin Học Lớp 3',
      grade: 'Khối 3',
      subject: 'Tin học',
      duration: '35 phút',
      questionsCount: 15,
      matrix: 'Nhận biết 50% • Thông hiểu 30% • Vận dụng 20%',
      variants: ['Mã đề 201', 'Mã đề 202'],
      date: '2026-10-18',
      status: 'Sẵn sàng in ấn',
    },
  ];

  const handleExport = (examTitle: string, format: 'PDF' | 'Word') => {
    setDownloadingId(examTitle + format);
    setTimeout(() => {
      setDownloadingId(null);
      alert(`Đã xuất file ${format} thành công cho "${examTitle}" kèm ma trận và đáp án chi tiết!`);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Ma Trận & Khảo Thí Sư Phạm Chuẩn Bộ GD&ĐT</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Phân Hệ Quản Lý Đề Kiểm Tra
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Thiết kế ma trận đề, tự động trộn đề thi hoán vị câu hỏi, xuất file Word/PDF kèm đáp án
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => alert('Đang mở trình khởi tạo Ma trận đề kiểm tra 4 mức độ...')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Đề Thi Mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Exam List */}
      <div className="grid grid-cols-1 gap-4">
        {mockExams.map((exam) => (
          <div
            key={exam.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-indigo-300 transition-all space-y-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {exam.id}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {exam.subject} • {exam.grade}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    {exam.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{exam.title}</h3>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Thời gian: {exam.duration}
                  </span>
                  <span>•</span>
                  <span>Số lượng: {exam.questionsCount} câu hỏi</span>
                  <span>•</span>
                  <span>Khởi tạo: {exam.date}</span>
                </p>
              </div>

              {/* Action Export Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleExport(exam.title, 'Word')}
                  disabled={downloadingId === exam.title + 'Word'}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100/70 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Xuất Word (.docx)</span>
                </button>
                <button
                  onClick={() => handleExport(exam.title, 'PDF')}
                  disabled={downloadingId === exam.title + 'PDF'}
                  className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-100/70 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất PDF</span>
                </button>
              </div>
            </div>

            {/* Matrix & Variants */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Tỷ lệ ma trận nhận thức:</span>
                <span className="text-indigo-700 font-medium">{exam.matrix}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Shuffle className="w-3.5 h-3.5 text-slate-500" /> Các mã đề hoán vị:
                </span>
                {exam.variants.map((v) => (
                  <span
                    key={v}
                    className="font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
