import React from 'react';
import {
  BookOpenCheck,
  Sparkles,
  CheckCircle2,
  Users,
  Clock,
  Plus,
  Brain,
  FileCheck,
} from 'lucide-react';

export const HomeworkManagerView: React.FC = () => {
  const mockAssignments = [
    {
      id: 'BT-TK-301',
      title: 'Bài tập tuần 8: An toàn khi dùng quạt điện & đèn học',
      class: 'Lớp 3A1',
      subject: 'Công nghệ 3',
      deadline: '2026-10-25 21:00',
      submitted: '32/34 học sinh',
      aiGrading: 'Đã chấm tự động 100% bằng AI',
      avgScore: '8.8 / 10',
    },
    {
      id: 'BT-TK-302',
      title: 'Luyện tập gõ 10 ngón & Nhận diện hàng phím cơ sở',
      class: 'Lớp 3A2',
      subject: 'Tin học 3',
      deadline: '2026-10-26 18:00',
      submitted: '30/33 học sinh',
      aiGrading: 'Đang chấm tự động (92%)',
      avgScore: '9.1 / 10',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200/80 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span>Chấm Tự Động & Nhận Xét Sư Phạm Bằng AI</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Phân Hệ Quản Lý Bài Tập
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Giao bài tập trực tuyến theo lớp, chấm trắc nghiệm & tự luận tự động với nhận xét chi tiết từng em
            </p>
          </div>

          <button
            onClick={() => alert('Đang mở form giao bài tập mới cho học sinh...')}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Giao Bài Mới</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {mockAssignments.map((bt) => (
          <div
            key={bt.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-violet-300 transition-all space-y-3"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {bt.id}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
                    {bt.class} • {bt.subject}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{bt.title}</h3>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Hạn nộp: {bt.deadline}
                  </span>
                  <span>•</span>
                  <span>Tiến độ nộp: <b>{bt.submitted}</b></span>
                </p>
              </div>

              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <Brain className="w-3.5 h-3.5 text-emerald-600" />
                  {bt.aiGrading}
                </span>
                <p className="text-xs text-slate-600 mt-1">
                  Điểm trung bình: <b className="text-indigo-600 text-sm">{bt.avgScore}</b>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
