import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckCircle2, HelpCircle } from 'lucide-react';
import { Question, Subject, Grade, CognitiveLevel, QuestionType, QuestionOption } from '../types';
import { SUBJECTS, GRADES, COGNITIVE_LEVELS, QUESTION_TYPES } from '../data/mockData';

interface CreateManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: Partial<Question>) => void;
  editingQuestion?: Question | null;
}

export const CreateManualModal: React.FC<CreateManualModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingQuestion,
}) => {
  const [code, setCode] = useState('CH-CÔN-4450-9');
  const [subject, setSubject] = useState<Subject>('Công nghệ');
  const [grade, setGrade] = useState<Grade>('Khối 3');
  const [level, setLevel] = useState<CognitiveLevel>('1. Nhận biết');
  const [type, setType] = useState<QuestionType>('Lựa chọn');
  const [content, setContent] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>([
    { id: 'A', text: '', isCorrect: true },
    { id: 'B', text: '', isCorrect: false },
    { id: 'C', text: '', isCorrect: false },
    { id: 'D', text: '', isCorrect: false },
  ]);

  useEffect(() => {
    if (editingQuestion) {
      setCode(editingQuestion.code);
      setSubject(editingQuestion.subject);
      setGrade(editingQuestion.grade);
      setLevel(editingQuestion.level);
      setType(editingQuestion.type);
      setContent(editingQuestion.content);
      setCorrectAnswer(editingQuestion.correctAnswer);
      setExplanation(editingQuestion.explanation || '');
      setOptions(
        editingQuestion.options && editingQuestion.options.length > 0
          ? editingQuestion.options
          : [
              { id: 'A', text: '', isCorrect: true },
              { id: 'B', text: '', isCorrect: false },
              { id: 'C', text: '', isCorrect: false },
              { id: 'D', text: '', isCorrect: false },
            ]
      );
    } else {
      // Auto-generate realistic code
      const subCode = subject.substring(0, 3).toUpperCase();
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      setCode(`CH-${subCode}-${randomNum}`);
      setContent('');
      setExplanation('');
      setCorrectAnswer(type === 'Đúng / Sai' ? 'Ý 1: Đúng | Ý 2: Sai' : 'A');
      if (type === 'Đúng / Sai') {
        setOptions([
          { id: '1', text: '', isCorrect: true },
          { id: '2', text: '', isCorrect: false },
          { id: '3', text: '', isCorrect: true },
          { id: '4', text: '', isCorrect: false },
        ]);
      } else {
        setOptions([
          { id: 'A', text: '', isCorrect: true },
          { id: 'B', text: '', isCorrect: false },
          { id: 'C', text: '', isCorrect: false },
          { id: 'D', text: '', isCorrect: false },
        ]);
      }
    }
  }, [editingQuestion, isOpen]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: QuestionType) => {
    setType(newType);
    if (newType === 'Đúng / Sai') {
      setOptions([
        { id: '1', text: 'Nhận định 1', isCorrect: true },
        { id: '2', text: 'Nhận định 2', isCorrect: false },
        { id: '3', text: 'Nhận định 3', isCorrect: true },
        { id: '4', text: 'Nhận định 4', isCorrect: false },
      ]);
      setCorrectAnswer('Ý 1: Đúng | Ý 2: Sai | Ý 3: Đúng | Ý 4: Sai');
    } else {
      setOptions([
        { id: 'A', text: '', isCorrect: true },
        { id: 'B', text: '', isCorrect: false },
        { id: 'C', text: '', isCorrect: false },
        { id: 'D', text: '', isCorrect: false },
      ]);
      setCorrectAnswer('A');
    }
  };

  const handleOptionChange = (idx: number, text: string) => {
    const updated = [...options];
    updated[idx].text = text;
    setOptions(updated);
  };

  const handleCorrectSelect = (idx: number) => {
    const updated = options.map((opt, i) => ({
      ...opt,
      isCorrect: type === 'Đúng / Sai' ? (i === idx ? !opt.isCorrect : opt.isCorrect) : i === idx,
    }));
    setOptions(updated);

    if (type === 'Lựa chọn') {
      setCorrectAnswer(options[idx].id);
    } else if (type === 'Đúng / Sai') {
      const summary = updated
        .map((opt) => `Ý ${opt.id}: ${opt.isCorrect ? 'Đúng' : 'Sai'}`)
        .join(' | ');
      setCorrectAnswer(summary);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('Vui lòng nhập nội dung câu hỏi');
      return;
    }

    onSave({
      id: editingQuestion ? editingQuestion.id : `q-${Date.now()}`,
      code,
      subject,
      grade,
      level,
      type,
      content,
      options,
      correctAnswer,
      explanation,
      createdAt: editingQuestion ? editingQuestion.createdAt : new Date().toISOString().split('T')[0],
      author: 'Nguyễn Thị Thu',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 z-10 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-emerald-50/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {editingQuestion ? 'Chỉnh Sửa Câu Hỏi Sư Phạm' : 'Tạo Câu Hỏi Thủ Công'}
              </h3>
              <p className="text-xs text-slate-500">
                Nhập câu hỏi theo chuẩn 4 mức độ nhận thức của Bộ Giáo dục & Đào tạo
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

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          {/* Row 1: Code & Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã câu hỏi (CH code)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mức độ nhận thức (4 mức)
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CognitiveLevel)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                {COGNITIVE_LEVELS.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Subject, Grade & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Môn học</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as Subject)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                {SUBJECTS.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Khối lớp</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as Grade)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                {GRADES.map((grd) => (
                  <option key={grd} value={grd}>
                    {grd}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Loại câu hỏi</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Question Content */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nội dung câu hỏi / Câu lệnh sư phạm <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập nội dung câu hỏi rõ ràng, chính xác theo chương trình GDPT..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              required
            />
          </div>

          {/* Options / Statements */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                {type === 'Đúng / Sai' ? 'Các nhận định / ý đúng sai' : 'Các phương án trả lời'}
              </label>
              <span className="text-[11px] text-slate-500">
                (Tích chọn đáp án đúng)
              </span>
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCorrectSelect(idx)}
                    className={`w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center transition-colors ${
                      opt.isCorrect
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                    title="Đánh dấu đáp án đúng"
                  >
                    {opt.isCorrect ? '✓' : opt.id}
                  </button>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Nội dung phương án ${opt.id}...`}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  {type === 'Đúng / Sai' && (
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded cursor-pointer ${
                        opt.isCorrect
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                      onClick={() => handleCorrectSelect(idx)}
                    >
                      {opt.isCorrect ? 'ĐÚNG' : 'SAI'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Explanation */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Giải thích sư phạm & Hướng dẫn chấm
            </label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Ghi chú kiến thức trọng tâm, căn cứ pháp lý hoặc hướng dẫn giải chi tiết..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium text-xs transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{editingQuestion ? 'Lưu thay đổi' : 'Thêm vào ngân hàng'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
