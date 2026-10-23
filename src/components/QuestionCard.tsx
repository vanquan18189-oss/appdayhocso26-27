import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BookOpen,
  Sparkles,
  Info,
} from 'lucide-react';
import { Question } from '../types';

interface QuestionCardProps {
  question: Question;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (question: Question) => void;
  onDuplicate: (question: Question) => void;
  onDelete: (id: string) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  isSelected,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(question.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  // Level badge styling based on 4 cognitive levels
  const getLevelBadge = (level: string) => {
    switch (level) {
      case '1. Nhận biết':
        return 'bg-sky-50 text-sky-700 border-sky-200/80';
      case '2. Thông hiểu':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
      case '3. Vận dụng':
        return 'bg-amber-50 text-amber-800 border-amber-200/80';
      case '4. Vận dụng cao':
        return 'bg-purple-50 text-purple-700 border-purple-200/80';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  // Question Type badge styling
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Đúng / Sai':
        return 'bg-amber-100/70 text-amber-900 border-amber-300';
      case 'Lựa chọn':
        return 'bg-blue-100/70 text-blue-900 border-blue-300';
      case 'Điền khuyết':
        return 'bg-teal-100/70 text-teal-900 border-teal-300';
      case 'Ghép nối':
        return 'bg-indigo-100/70 text-indigo-900 border-indigo-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div
      className={`group relative bg-white rounded-xl border transition-all duration-200 shadow-xs hover:shadow-md ${
        isSelected
          ? 'border-indigo-400 bg-indigo-50/20 ring-1 ring-indigo-400/50'
          : 'border-slate-200/90 hover:border-indigo-300'
      }`}
    >
      <div className="p-4 sm:p-5">
        {/* Top Header Row: Checkbox, Code, Badges, and Quick Actions */}
        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
          {/* Left tags */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Selection Checkbox */}
            <label className="relative flex items-center cursor-pointer p-0.5" title="Chọn câu hỏi này">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(question.id)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
            </label>

            {/* Question Code */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100/90 border border-slate-200 text-slate-800 font-mono font-bold text-xs tracking-wide">
              <span>{question.code}</span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-slate-400 hover:text-indigo-600 transition-colors"
                title="Sao chép mã câu hỏi"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Badge: Loại câu hỏi (Đúng / Sai, Lựa chọn) */}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getTypeBadge(
                question.type
              )}`}
            >
              {question.type}
            </span>

            {/* Badge: Môn học & Khối (CÔNG NGHỆ • KHỐI 3) */}
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-tight">
              <span>{question.subject}</span>
              <span className="text-slate-400">•</span>
              <span className="text-indigo-700">{question.grade}</span>
            </span>

            {/* Badge: Mức độ nhận thức (1. Nhận biết) */}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border ${getLevelBadge(
                question.level
              )}`}
            >
              {question.level}
            </span>
          </div>

          {/* Right Action buttons: Sửa, Nhân bản, Xóa */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 self-start sm:self-auto ml-auto">
            <button
              onClick={() => onEdit(question)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-colors"
              title="Chỉnh sửa câu hỏi (Edit)"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDuplicate(question)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors"
              title="Nhân bản câu hỏi (Copy)"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(question.id)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors"
              title="Xóa câu hỏi này (Delete)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Question Content */}
        <div className="mt-3.5 pl-6 sm:pl-7">
          <p className="text-sm sm:text-base font-medium text-slate-900 leading-relaxed">
            {question.content}
          </p>

          {/* Options summary / preview */}
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {question.options.map((opt) => (
              <div
                key={opt.id}
                className={`flex items-start gap-2 text-xs sm:text-sm p-2 rounded-lg border transition-colors ${
                  isPreviewOpen && opt.isCorrect
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 font-medium'
                    : 'bg-slate-50/80 border-slate-200/70 text-slate-700'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center font-bold text-xs ${
                    isPreviewOpen && opt.isCorrect
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {opt.id}
                </span>
                <span className="flex-1">{opt.text}</span>
                {isPreviewOpen && opt.isCorrect && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>

          {/* Expandable Link: "Duyệt trước câu trả lời >" */}
          <div className="mt-3">
            <button
              onClick={() => setIsPreviewOpen(!isPreviewOpen)}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors group/link"
            >
              <span>{isPreviewOpen ? 'Ẩn câu trả lời chi tiết' : 'Duyệt trước câu trả lời'}</span>
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${
                  isPreviewOpen ? 'rotate-90 text-indigo-800' : 'group-hover/link:translate-x-0.5'
                }`}
              />
            </button>

            {/* Answer Drawer / Accordion */}
            {isPreviewOpen && (
              <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-r from-emerald-50/70 via-indigo-50/40 to-slate-50 border border-emerald-200/90 text-xs sm:text-sm space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 font-semibold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Đáp án đúng & Hướng dẫn chấm:</span>
                  <span className="font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs">
                    {question.correctAnswer}
                  </span>
                </div>

                {question.explanation && (
                  <div className="flex items-start gap-2 text-slate-700 leading-relaxed bg-white/70 p-2.5 rounded-lg border border-slate-200/60">
                    <Info className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800">Giải thích sư phạm: </span>
                      <span>{question.explanation}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <span>Tác giả: {question.author || 'Nguyễn Thị Thu'}</span>
                  <span>Ngày khởi tạo: {question.createdAt}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
