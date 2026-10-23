import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Bot,
  Brain,
  Wand2,
  CheckCircle2,
  Loader2,
  BookOpen,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Question, Subject, Grade, CognitiveLevel, QuestionType } from '../types';
import { SUBJECTS, GRADES, COGNITIVE_LEVELS, QUESTION_TYPES } from '../data/mockData';

interface CreateAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGenerated: (questions: Question[]) => void;
}

import { TECHNOLOGY_GRADE3_FINAL_EXAM_BLUEPRINT } from '../config/examBlueprints';
import { useAcademicYear } from '../contexts/AcademicYearContext';

export const CreateAiModal: React.FC<CreateAiModalProps> = ({
  isOpen,
  onClose,
  onAddGenerated,
}) => {
  const [subject, setSubject] = useState<Subject>('Công nghệ');
  const [grade, setGrade] = useState<Grade>('Khối 3');
  const [topic, setTopic] = useState('An toàn khi sử dụng các thiết bị điện trong gia đình');
  const [level, setLevel] = useState<CognitiveLevel>('nhan_biet');
  const [type, setType] = useState<QuestionType>('multiple_choice');
  const [count, setCount] = useState<number>(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [isStandardStructure, setIsStandardStructure] = useState(true);
  const { selectedAcademicYear: academicYear } = useAcademicYear();

  if (!isOpen) return null;

  const handleGenerate = () => {
    setIsGenerating(true);
    setGeneratedQuestions([]);

    // Pedagogical realistic AI generation simulation
    setTimeout(() => {
      const results: Question[] = [];
      const timestamp = Date.now();

      for (let i = 0; i < count; i++) {
        const subAbbr = subject.substring(0, 3).toUpperCase();
        const codeNum = Math.floor(4000 + Math.random() * 5000);
        const code = `CH-${subAbbr}-${codeNum}-${i + 1}`;

        if (subject === 'Công nghệ') {
          if (type === 'Đúng / Sai') {
            results.push({
              id: `ai-gen-${timestamp}-${i}`,
              code,
              type: 'Đúng / Sai',
              subject,
              grade,
              level,
              content: `AI Sư Phạm: Xét tính Đúng/Sai của các quy tắc sử dụng máy sấy tóc an toàn trong phòng ngủ và nhà tắm:`,
              options: [
                { id: '1', text: 'Tuyệt đối không sử dụng máy sấy tóc khi người hoặc chân đang ướt trong phòng tắm ẩm ướt.', isCorrect: true },
                { id: '2', text: 'Cầm kéo hoặc vật nhọn chọc vào khe thông gió của máy sấy tóc khi máy đang cắm điện.', isCorrect: false },
                { id: '3', text: 'Rút phích cắm điện ngay sau khi sử dụng xong và để máy nguội trước khi cất giữ.', isCorrect: true },
                { id: '4', text: 'Vừa sấy tóc vừa đổ nước lên công tắc điều khiển nhiệt độ.', isCorrect: false },
              ],
              correctAnswer: 'Ý 1: Đúng | Ý 2: Sai | Ý 3: Đúng | Ý 4: Sai',
              explanation: 'Câu hỏi do Trợ lý AI Sư Phạm Trực Khang thiết kế theo chuẩn GDPT 2018 môn Công nghệ 3, rèn luyện kỹ năng an toàn điện cho học sinh tiểu học.',
              createdAt: new Date().toISOString().split('T')[0],
              author: 'AI Trực Khang v2.5',
            });
          } else {
            results.push({
              id: `ai-gen-${timestamp}-${i}`,
              code,
              type: 'Lựa chọn',
              subject,
              grade,
              level,
              content: `AI Sư Phạm: Hành động nào sau đây của học sinh là ĐÚNG QUY CÁCH và AN TOÀN khi phát hiện dây dẫn điện của bàn là bị hở lớp vỏ bọc bảo vệ?`,
              options: [
                { id: 'A', text: 'Không được chạm tay vào dây dẫn, báo ngay cho cha mẹ hoặc người lớn trong nhà để xử lý.', isCorrect: true },
                { id: 'B', text: 'Dùng tay không túm vào chỗ hở để kéo phích cắm ra khỏi ổ điện.', isCorrect: false },
                { id: 'C', text: 'Lấy nước dội lên dây điện để làm nguội thiết bị.', isCorrect: false },
                { id: 'D', text: 'Tiếp tục cắm điện sử dụng bình thường vì điện chưa giật.', isCorrect: false },
              ],
              correctAnswer: 'A',
              explanation: 'Quy tắc an toàn cơ bản: Tuyệt đối không chạm vào dây điện hở và phải báo người lớn ngay lập tức.',
              createdAt: new Date().toISOString().split('T')[0],
              author: 'AI Trực Khang v2.5',
            });
          }
        } else if (subject === 'Tin học') {
          results.push({
            id: `ai-gen-${timestamp}-${i}`,
            code,
            type,
            subject,
            grade,
            level,
            content: `AI Sư Phạm: Trong phần mềm gõ bàn phím mẫu chuẩn, hai phím nào trên hàng cơ sở được gắn gờ nổi (dấu gờ) để đặt ngón trỏ của hai bàn tay?`,
            options: [
              { id: 'A', text: 'Phím F (tay trái) và phím J (tay phải).', isCorrect: true },
              { id: 'B', text: 'Phím A và phím L.', isCorrect: false },
              { id: 'C', text: 'Phím G và phím H.', isCorrect: false },
              { id: 'D', text: 'Phím Space và phím Enter.', isCorrect: false },
            ],
            correctAnswer: 'A',
            explanation: 'Hai phím có gờ F và J là phím xuất phát chuẩn của ngón trỏ hai bàn tay trên hàng phím cơ sở (Tin học 3 - Bài Bàn phím máy tính).',
            createdAt: new Date().toISOString().split('T')[0],
            author: 'AI Trực Khang v2.5',
          });
        } else {
          results.push({
            id: `ai-gen-${timestamp}-${i}`,
            code,
            type,
            subject,
            grade,
            level,
            content: `AI Sư Phạm: Tìm giá trị của biểu thức phù hợp với yêu cầu bài học "${topic}" theo chuẩn kiến thức ${level}:`,
            options: [
              { id: 'A', text: 'Phương án chính xác được thẩm định sư phạm.', isCorrect: true },
              { id: 'B', text: 'Phương án nhiễu cấp độ 1.', isCorrect: false },
              { id: 'C', text: 'Phương án nhiễu cấp độ 2.', isCorrect: false },
              { id: 'D', text: 'Phương án nhiễu cấp độ 3.', isCorrect: false },
            ],
            correctAnswer: 'A',
            explanation: 'Câu hỏi được sinh tự động bởi mô hình Gemini Sư Phạm dựa trên ma trận nhận thức.',
            createdAt: new Date().toISOString().split('T')[0],
            author: 'AI Trực Khang v2.5',
          });
        }
      }

      setGeneratedQuestions(results);
      setIsGenerating(false);
    }, 1200);
  };

  const handleApply = () => {
    if (generatedQuestions.length === 0) return;
    onAddGenerated(generatedQuestions);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 z-10 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Tạo Câu Hỏi Với AI Sư Phạm</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white uppercase tracking-wider">
                  Gemini 2.5 Edu
                </span>
              </div>
              <p className="text-xs text-indigo-100/90">
                Tự động thiết kế câu hỏi bám sát ma trận 4 mức độ nhận thức GDPT 2018
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-sm">
          {/* Configuration Grid */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3.5">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-600">
              <Brain className="w-4 h-4 text-violet-600" />
              <span>Thiết lập thông số sư phạm</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Môn học</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as Subject)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Khối lớp</label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value as Grade)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mức độ nhận thức (Bloom)
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as CognitiveLevel)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-violet-500 outline-none font-medium"
                >
                  {COGNITIVE_LEVELS.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chủ đề / Tên bài học trọng tâm
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ví dụ: Sử dụng quạt điện an toàn, Bàn phím máy tính..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số lượng câu hỏi
                </label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                >
                  <option value={1}>1 câu hỏi mẫu</option>
                  <option value={2}>2 câu hỏi chuẩn</option>
                  <option value={3}>3 câu hỏi đầy đủ</option>
                </select>
              </div>
            </div>

            {/* Generate Trigger Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium text-xs shadow-md shadow-violet-600/20 flex items-center gap-2 transition-all disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>AI đang phân tích & sinh câu hỏi...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 text-amber-300" />
                    <span>Bắt đầu Sinh câu hỏi với AI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Area */}
          {generatedQuestions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Đã sinh thành công {generatedQuestions.length} câu hỏi đạt chuẩn:</span>
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sinh lại bộ khác</span>
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {generatedQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-xl border border-violet-200 bg-violet-50/20 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold bg-violet-100 text-violet-800 px-2 py-0.5 rounded text-[11px]">
                          {q.code}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {q.subject} • {q.grade}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          {q.level}
                        </span>
                      </div>
                    </div>
                    <p className="font-medium text-slate-900 text-sm">{q.content}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-2">
                      {q.options.map((opt) => (
                        <div
                          key={opt.id}
                          className={`p-1.5 rounded border text-xs flex items-center gap-1.5 ${
                            opt.isCorrect
                              ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                            {opt.id}
                          </span>
                          <span>{opt.text}</span>
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <p className="text-[11px] text-slate-500 italic bg-white/60 p-2 rounded border border-slate-100">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium text-xs transition-colors"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={generatedQuestions.length === 0}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium text-xs shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Thêm tất cả vào Ngân hàng câu hỏi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
