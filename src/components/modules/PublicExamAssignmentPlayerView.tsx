import React, { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  FileCheck2,
  Globe,
  HelpCircle,
  Home,
  RotateCcw,
  Send,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import { ExamPaper, HomeworkAssignment, QuestionItem } from '../../types';
import { fetchPublicExamById } from '../../services/examStorageService';
import { fetchPublicAssignmentById } from '../../services/assignmentStorageService';
import { PublicLessonPlayerView } from './PublicLessonPlayerView';
import {
  checkQuestionCorrectLocal,
  isClassificationQuestion,
  isEssayQuestion,
  isFillBlankQuestion,
  isMatchingQuestion,
  isMultipleResponseQuestion,
  isOrderingQuestion,
  isQuestionFullyAnswered,
  isTrueFalseQuestion,
  getLatestCorrectOrder,
} from './StudentExamModule';
import { getQuestionTypeLabel } from '../../lib/constants';

interface PublicExamPlayerViewProps {
  examId: string;
  onGoHome: () => void;
}

interface PublicAssignmentPlayerViewProps {
  assignmentId: string;
  onGoHome: () => void;
}

type FetchStatus = 'loading' | 'ok' | 'not_found' | 'error';

function formatCorrectAnswerDisplay(q: QuestionItem): string {
  if (isMatchingQuestion(q)) {
    const pairs = q.matchingPairs || [];
    return pairs.map((p, idx) => `${idx + 1}. ${p.left} → ${p.right}`).join(' | ');
  }
  if (isOrderingQuestion(q)) {
    const seq = getLatestCorrectOrder(q);
    return seq.map((step, idx) => `Bước ${idx + 1}: ${step}`).join(' → ');
  }
  if (isClassificationQuestion(q)) {
    const items = q.classificationItems || [];
    return items.map((it) => `${it.name}: [${it.group}]`).join(' | ');
  }
  if (isTrueFalseQuestion(q) && Array.isArray(q.statements) && q.statements.length > 0) {
    return q.statements
      .map((st, idx) => `Ý ${idx + 1}: ${st.isCorrect ? 'Đúng' : 'Sai'}`)
      .join(' | ');
  }
  if (isMultipleResponseQuestion(q)) {
    return String(q.correctAnswer || 'Chưa cập nhật');
  }
  if (isFillBlankQuestion(q) || isEssayQuestion(q)) {
    return String(q.correctAnswer || 'Xem gợi ý giải thích bên dưới');
  }
  const rawAns = String(q.correctAnswer || '').trim();
  if (/^[A-D]$/i.test(rawAns) && Array.isArray(q.options)) {
    const idx = rawAns.toUpperCase().charCodeAt(0) - 65;
    if (q.options[idx] !== undefined) {
      const optText = String(q.options[idx]).replace(/^[A-D][\.\:\)\-]\s*/i, '');
      return `${rawAns.toUpperCase()}. ${optText}`;
    }
  }
  return rawAns || 'Chưa cập nhật';
}

function formatStudentAnswerDisplay(q: QuestionItem, ans: any): string {
  if (ans === undefined || ans === null || ans === '') return 'Chưa trả lời';

  if (isMatchingQuestion(q)) {
    if (typeof ans !== 'object') return 'Chưa trả lời';
    const pairs = q.matchingPairs || [];
    const entries = pairs
      .map((p, idx) => {
        const chosen = ans[idx] ?? ans[p.left];
        return chosen ? `${idx + 1}. ${p.left} → ${chosen}` : null;
      })
      .filter(Boolean);
    return entries.length > 0 ? entries.join(' | ') : 'Chưa trả lời';
  }

  if (isOrderingQuestion(q)) {
    if (!Array.isArray(ans) || ans.length === 0) return 'Chưa trả lời';
    return ans.map((step, idx) => `Bước ${idx + 1}: ${step}`).join(' → ');
  }

  if (isClassificationQuestion(q)) {
    if (typeof ans !== 'object') return 'Chưa trả lời';
    const items = q.classificationItems || [];
    const entries = items
      .map((it, idx) => (ans[idx] ? `${it.name}: [${ans[idx]}]` : null))
      .filter(Boolean);
    return entries.length > 0 ? entries.join(' | ') : 'Chưa trả lời';
  }

  if (isTrueFalseQuestion(q) && Array.isArray(q.statements) && q.statements.length > 0) {
    if (typeof ans !== 'object') return 'Chưa trả lời';
    const entries = q.statements
      .map((_, idx) =>
        ans[idx] === true ? `Ý ${idx + 1}: Đúng` : ans[idx] === false ? `Ý ${idx + 1}: Sai` : null
      )
      .filter(Boolean);
    return entries.length > 0 ? entries.join(' | ') : 'Chưa trả lời';
  }

  if (isMultipleResponseQuestion(q)) {
    const arr = Array.isArray(ans) ? ans : typeof ans === 'number' ? [ans] : [];
    if (arr.length === 0) return 'Chưa trả lời';
    return arr
      .slice()
      .sort((a, b) => a - b)
      .map((i) => String.fromCharCode(65 + Number(i)))
      .join(', ');
  }

  if (typeof ans === 'number' && Array.isArray(q.options)) {
    const letter = String.fromCharCode(65 + ans);
    const optText =
      q.options[ans] !== undefined
        ? String(q.options[ans]).replace(/^[A-D][\.\:\)\-]\s*/i, '')
        : '';
    return optText ? `${letter}. ${optText}` : letter;
  }

  return String(ans);
}

interface PublicQuizWorkspaceProps {
  mode: 'exam' | 'assignment';
  title: string;
  subject?: string;
  grade?: string;
  targetClass?: string;
  examType?: string;
  durationMinutes?: number;
  questions: QuestionItem[];
  onGoHome: () => void;
}

const PublicQuizWorkspace: React.FC<PublicQuizWorkspaceProps> = ({
  mode,
  title,
  subject,
  grade,
  targetClass,
  examType,
  durationMinutes,
  questions,
  onGoHome,
}) => {
  const [guestName, setGuestName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  // Initialize default ordering arrays for ordering questions
  useEffect(() => {
    const initial: Record<number, any> = {};
    questions.forEach((q, idx) => {
      if (isOrderingQuestion(q)) {
        const rawOpts =
          Array.isArray(q.options) && q.options.length > 0
            ? [...q.options]
            : getLatestCorrectOrder(q);
        initial[idx] = rawOpts;
      }
    });
    setAnswers(initial);
    setIsSubmitted(false);
    setSecondsElapsed(0);
  }, [questions]);

  // Client-side elapsed timer while taking the quiz
  useEffect(() => {
    if (isSubmitted || questions.length === 0) return;
    const timer = window.setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSubmitted, questions.length]);

  const answeredCount = useMemo(() => {
    return questions.filter((q, idx) => isQuestionFullyAnswered(q, answers[idx])).length;
  }, [questions, answers]);

  const gradingSummary = useMemo(() => {
    if (!isSubmitted) return null;
    const total = questions.length;
    let correctCount = 0;
    const perQuestionCorrect: Record<number, boolean> = {};

    questions.forEach((q, idx) => {
      const ok = checkQuestionCorrectLocal(q, answers[idx]);
      perQuestionCorrect[idx] = ok;
      if (ok) correctCount += 1;
    });

    const rawScore = total > 0 ? (correctCount / total) * 10 : 0;
    const score10 = Math.round(rawScore * 100) / 100;

    let badgeLabel = 'Hoàn thành tốt';
    let praiseMessage =
      'Chúc mừng em đã hoàn thành bài làm! Hãy xem lại giải thích chi tiết bên dưới để nắm vững kiến thức nhé.';
    if (score10 >= 9) {
      badgeLabel = 'Hoàn thành xuất sắc 🏆';
      praiseMessage =
        'Tuyệt vời! Em nắm kiến thức rất chắc chắn và trả lời chính xác hầu hết các câu hỏi.';
    } else if (score10 >= 7) {
      badgeLabel = 'Hoàn thành tốt 🌟';
      praiseMessage =
        'Em làm bài rất tốt! Hãy xem lại một vài câu chưa chính xác bên dưới để đạt điểm tối đa ở lần sau nhé.';
    } else if (score10 >= 5) {
      badgeLabel = 'Hoàn thành 👍';
      praiseMessage =
        'Em đã cố gắng hoàn thành bài làm. Hãy đọc kỹ phần giải thích đáp án từng câu và bấm Làm lại bài để rèn luyện thêm nhé.';
    } else {
      badgeLabel = 'Cần cố gắng thêm 💪';
      praiseMessage =
        'Đừng nản lòng nhé! Em hãy xem kỹ đáp án đúng cùng lời giải thích chi tiết bên dưới rồi bấm Làm lại bài để ôn tập lại.';
    }

    return {
      total,
      correctCount,
      score10,
      badgeLabel,
      praiseMessage,
      perQuestionCorrect,
    };
  }, [isSubmitted, questions, answers]);

  const handleSubmitQuiz = () => {
    setIsSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const total = questions.length;
    const correctCount = questions.filter((q, idx) =>
      checkQuestionCorrectLocal(q, answers[idx])
    ).length;
    if (total > 0 && correctCount / total >= 0.7) {
      try {
        confetti({
          particleCount: 70,
          spread: 65,
          origin: { y: 0.6 },
        });
      } catch {
        // Ignore confetti errors
      }
    }
  };

  const handleRetryQuiz = () => {
    const resetState: Record<number, any> = {};
    questions.forEach((q, idx) => {
      if (isOrderingQuestion(q)) {
        const rawOpts =
          Array.isArray(q.options) && q.options.length > 0
            ? [...q.options]
            : getLatestCorrectOrder(q);
        resetState[idx] = rawOpts;
      }
    });
    setAnswers(resetState);
    setIsSubmitted(false);
    setSecondsElapsed(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const displayStudentName = guestName.trim() || 'Học sinh tự do';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">
        {/* Thanh tiêu đề trên cùng */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <Globe className="w-3 h-3" />
                  <span>
                    {mode === 'exam' ? 'Đề kiểm tra công khai' : 'Bài tập tự luyện công khai'}
                  </span>
                </span>
                {subject && (
                  <span className="bg-indigo-50 text-indigo-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-indigo-100">
                    {subject}
                  </span>
                )}
                {grade && (
                  <span className="bg-amber-50 text-amber-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-amber-200">
                    {grade.toLowerCase().startsWith('khối') ? grade : `Khối ${grade}`}
                  </span>
                )}
                {targetClass && targetClass !== '---' && (
                  <span className="bg-sky-50 text-sky-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-sky-200">
                    {targetClass}
                  </span>
                )}
                {examType && (
                  <span className="bg-purple-50 text-purple-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-purple-200">
                    {examType}
                  </span>
                )}
                {durationMinutes ? (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    <span>{durationMinutes} phút</span>
                  </span>
                ) : null}
              </div>

              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
                {title}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>{formatTimer(secondsElapsed)}</span>
              </div>
              <button
                type="button"
                onClick={onGoHome}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer"
                title="Quay về màn hình chọn cổng"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Trang chủ</span>
              </button>
            </div>
          </div>

          {/* Thanh nhập Tên học sinh (tùy chọn) & Tiến độ làm bài */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Nhập họ tên của em (tùy chọn, không bắt buộc)..."
                className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-100">
                Đã trả lời: {answeredCount}/{questions.length} câu
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Chấm điểm trực tiếp trên trình duyệt • Không lưu kết quả lên máy chủ
              </span>
            </div>
          </div>
        </div>

        {/* PHIẾU KẾT QUẢ CHẤM ĐIỂM TỨC THÌ (CLIENT-SIDE) */}
        {isSubmitted && gradingSummary && (
          <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-500/30 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-extrabold">
                  <Award className="w-4 h-4 text-amber-300" />
                  <span>{gradingSummary.badgeLabel}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                  Phiếu Kết Quả Làm Bài — {displayStudentName}
                </h2>
                <p className="text-xs sm:text-sm text-indigo-100 leading-relaxed max-w-2xl">
                  {gradingSummary.praiseMessage}
                </p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-2xl px-5 py-4 text-center min-w-[120px]">
                  <div className="text-[11px] uppercase tracking-wider text-indigo-200 font-bold">
                    Điểm số
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-amber-300 mt-0.5">
                    {gradingSummary.score10}
                    <span className="text-base font-bold text-indigo-200">/10</span>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-2xl px-5 py-4 text-center min-w-[120px]">
                  <div className="text-[11px] uppercase tracking-wider text-indigo-200 font-bold">
                    Số câu đúng
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-emerald-300 mt-0.5">
                    {gradingSummary.correctCount}
                    <span className="text-base font-bold text-indigo-200">
                      /{gradingSummary.total}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-indigo-200 font-medium">
                Thời gian hoàn thành: <strong className="text-white">{formatTimer(secondsElapsed)}</strong> • Kết quả được chấm tự động ngay trên thiết bị của em.
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRetryQuiz}
                  className="px-5 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Làm lại bài</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DANH SÁCH CÂU HỎI */}
        {questions.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
            <HelpCircle className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              Nội dung này hiện chưa có câu hỏi nào.
            </h3>
            <p className="text-xs text-slate-500">
              Em hãy liên hệ thầy/cô giáo để kiểm tra lại nội dung câu hỏi nhé.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {questions.map((q, qIdx) => {
              const currentAns = answers[qIdx];
              const isCorrect = isSubmitted ? Boolean(gradingSummary?.perQuestionCorrect[qIdx]) : false;

              return (
                <div
                  key={q.id || qIdx}
                  className={`bg-white rounded-3xl p-5 sm:p-7 border transition-all shadow-xs space-y-4 ${
                    isSubmitted
                      ? isCorrect
                        ? 'border-emerald-300 ring-2 ring-emerald-500/10'
                        : 'border-rose-300 ring-2 ring-rose-500/10'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Header câu hỏi */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-xl bg-indigo-600 text-white text-xs font-extrabold">
                        Câu {qIdx + 1}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
                        {getQuestionTypeLabel(q.type)}
                      </span>
                    </div>

                    {isSubmitted && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
                          isCorrect
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Chính xác</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-rose-600" />
                            <span>Chưa chính xác</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Nội dung câu hỏi & Ảnh minh họa */}
                  <div className="space-y-3">
                    <div className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed whitespace-pre-line">
                      {q.content}
                    </div>
                    {q.imageUrl && (
                      <div className="pt-1">
                        <img
                          src={q.imageUrl}
                          alt={`Hình minh họa câu ${qIdx + 1}`}
                          className="max-h-72 rounded-2xl border border-slate-200 object-contain bg-slate-50 p-1"
                        />
                      </div>
                    )}
                  </div>

                  {/* Khu vực trả lời theo từng loại câu hỏi */}
                  <div className="pt-2">
                    {/* 1. Dạng Ghép nối (Matching) */}
                    {isMatchingQuestion(q) ? (
                      <div className="space-y-2.5">
                        {(q.matchingPairs || []).map((pair, pIdx) => {
                          const rightOptions = (q.matchingPairs || []).map((p) => p.right);
                          const selectedRight =
                            currentAns && typeof currentAns === 'object'
                              ? currentAns[pIdx] ?? ''
                              : '';
                          return (
                            <div
                              key={pIdx}
                              className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="text-xs sm:text-sm font-bold text-slate-800">
                                <span className="text-indigo-600 mr-1.5">{pIdx + 1}.</span>
                                {pair.left}
                              </div>
                              <select
                                disabled={isSubmitted}
                                value={selectedRight}
                                onChange={(e) => {
                                  const nextObj =
                                    currentAns && typeof currentAns === 'object'
                                      ? { ...currentAns }
                                      : {};
                                  nextObj[pIdx] = e.target.value;
                                  setAnswers((prev) => ({ ...prev, [qIdx]: nextObj }));
                                }}
                                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px]"
                              >
                                <option value="">-- Chọn vế ghép tương ứng --</option>
                                {rightOptions.map((rOpt, rIdx) => (
                                  <option key={rIdx} value={rOpt}>
                                    {rOpt}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    ) : isOrderingQuestion(q) ? (
                      /* 2. Dạng Sắp xếp thứ tự (Ordering) */
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-medium">
                          Bấm nút mũi tên Lên / Xuống để sắp xếp các bước theo đúng thứ tự:
                        </p>
                        {(Array.isArray(currentAns) ? currentAns : q.options || []).map(
                          (stepText: string, sIdx: number, arr: string[]) => (
                            <div
                              key={sIdx}
                              className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-slate-800">
                                <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-extrabold shrink-0">
                                  {sIdx + 1}
                                </span>
                                <span>{stepText}</span>
                              </div>
                              {!isSubmitted && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={sIdx === 0}
                                    onClick={() => {
                                      const copy = [...arr];
                                      const temp = copy[sIdx - 1];
                                      copy[sIdx - 1] = copy[sIdx];
                                      copy[sIdx] = temp;
                                      setAnswers((prev) => ({ ...prev, [qIdx]: copy }));
                                    }}
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                    title="Chuyển lên"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5 text-slate-700" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={sIdx === arr.length - 1}
                                    onClick={() => {
                                      const copy = [...arr];
                                      const temp = copy[sIdx + 1];
                                      copy[sIdx + 1] = copy[sIdx];
                                      copy[sIdx] = temp;
                                      setAnswers((prev) => ({ ...prev, [qIdx]: copy }));
                                    }}
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                    title="Chuyển xuống"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5 text-slate-700" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    ) : isClassificationQuestion(q) ? (
                      /* 3. Dạng Phân loại (Classification) */
                      <div className="space-y-2.5">
                        {(q.classificationItems || []).map((item, iIdx) => {
                          const groups = q.classificationGroups || [];
                          const chosenGroup =
                            currentAns && typeof currentAns === 'object'
                              ? currentAns[iIdx] ?? ''
                              : '';
                          return (
                            <div
                              key={iIdx}
                              className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <span className="text-xs sm:text-sm font-bold text-slate-800">
                                {iIdx + 1}. {item.name}
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                {groups.map((grp) => (
                                  <button
                                    key={grp}
                                    type="button"
                                    disabled={isSubmitted}
                                    onClick={() => {
                                      const nextObj =
                                        currentAns && typeof currentAns === 'object'
                                          ? { ...currentAns }
                                          : {};
                                      nextObj[iIdx] = grp;
                                      setAnswers((prev) => ({ ...prev, [qIdx]: nextObj }));
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                      chosenGroup === grp
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                    }`}
                                  >
                                    {grp}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : isTrueFalseQuestion(q) &&
                      Array.isArray(q.statements) &&
                      q.statements.length > 0 ? (
                      /* 4. Dạng Đúng / Sai nhiều mệnh đề */
                      <div className="space-y-2.5">
                        {q.statements.map((st, sIdx) => {
                          const val =
                            currentAns && typeof currentAns === 'object'
                              ? currentAns[sIdx]
                              : undefined;
                          return (
                            <div
                              key={sIdx}
                              className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="text-xs sm:text-sm font-semibold text-slate-800">
                                <span className="font-bold text-indigo-600 mr-1.5">
                                  Ý {sIdx + 1}:
                                </span>
                                {st.statement}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={isSubmitted}
                                  onClick={() => {
                                    const nextObj =
                                      currentAns && typeof currentAns === 'object'
                                        ? { ...currentAns }
                                        : {};
                                    nextObj[sIdx] = true;
                                    setAnswers((prev) => ({ ...prev, [qIdx]: nextObj }));
                                  }}
                                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                                    val === true
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                                  }`}
                                >
                                  Đúng
                                </button>
                                <button
                                  type="button"
                                  disabled={isSubmitted}
                                  onClick={() => {
                                    const nextObj =
                                      currentAns && typeof currentAns === 'object'
                                        ? { ...currentAns }
                                        : {};
                                    nextObj[sIdx] = false;
                                    setAnswers((prev) => ({ ...prev, [qIdx]: nextObj }));
                                  }}
                                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                                    val === false
                                      ? 'bg-rose-600 text-white border-rose-600'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-rose-50'
                                  }`}
                                >
                                  Sai
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : isFillBlankQuestion(q) || isEssayQuestion(q) ? (
                      /* 5. Dạng Điền khuyết / Tự luận */
                      <div>
                        <textarea
                          rows={isEssayQuestion(q) ? 3 : 2}
                          disabled={isSubmitted}
                          value={typeof currentAns === 'string' ? currentAns : ''}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [qIdx]: e.target.value }))
                          }
                          placeholder="Nhập câu trả lời của em vào đây..."
                          className="w-full p-3.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    ) : isMultipleResponseQuestion(q) ? (
                      /* 6. Dạng Chọn nhiều đáp án đúng */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(q.options || []).map((opt, oIdx) => {
                          const selectedArr: number[] = Array.isArray(currentAns)
                            ? currentAns
                            : [];
                          const isChecked = selectedArr.includes(oIdx);
                          const letter = String.fromCharCode(65 + oIdx);
                          const cleanOpt = String(opt).replace(/^[A-D][\.\:\)\-]\s*/i, '');

                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={isSubmitted}
                              onClick={() => {
                                const nextArr = isChecked
                                  ? selectedArr.filter((i) => i !== oIdx)
                                  : [...selectedArr, oIdx];
                                setAnswers((prev) => ({ ...prev, [qIdx]: nextArr }));
                              }}
                              className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                isChecked
                                  ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-2 ring-indigo-500/20'
                                  : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800'
                              }`}
                            >
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5 ${
                                  isChecked
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-300 text-slate-700'
                                }`}
                              >
                                {isChecked ? <Check className="w-3.5 h-3.5" /> : letter}
                              </span>
                              <span className="text-xs sm:text-sm font-semibold leading-snug">
                                {cleanOpt}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      /* 7. Dạng Trắc nghiệm 1 lựa chọn (A, B, C, D) hoặc Đúng/Sai đơn */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(q.options && q.options.length > 0
                          ? q.options
                          : isTrueFalseQuestion(q)
                          ? ['Đúng', 'Sai']
                          : []
                        ).map((opt, oIdx) => {
                          const isSelected = currentAns === oIdx;
                          const letter = String.fromCharCode(65 + oIdx);
                          const cleanOpt = String(opt).replace(/^[A-D][\.\:\)\-]\s*/i, '');

                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={isSubmitted}
                              onClick={() =>
                                setAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                              }
                              className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                  : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200 text-slate-800'
                              }`}
                            >
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5 ${
                                  isSelected
                                    ? 'bg-white text-indigo-700'
                                    : 'bg-white border border-slate-300 text-slate-700'
                                }`}
                              >
                                {letter}
                              </span>
                              <span className="text-xs sm:text-sm font-semibold leading-snug">
                                {cleanOpt}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Khung hiển thị Đáp án đúng & Giải thích chi tiết sau khi bấm Nộp bài */}
                  {isSubmitted && (
                    <div
                      className={`mt-4 p-4 rounded-2xl border text-xs sm:text-sm space-y-2 ${
                        isCorrect
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-amber-50/80 border-amber-200 text-slate-900'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                        <div>
                          <span className="font-bold text-slate-600">Câu trả lời của em: </span>
                          <span
                            className={`font-extrabold ${
                              isCorrect ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {formatStudentAnswerDisplay(q, currentAns)}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-600">Đáp án đúng: </span>
                          <span className="font-extrabold text-emerald-700">
                            {formatCorrectAnswerDisplay(q)}
                          </span>
                        </div>
                      </div>

                      {q.explanation && (
                        <div className="pt-2 border-t border-slate-200/80 text-slate-700 leading-relaxed">
                          <span className="font-extrabold text-indigo-700 inline-flex items-center gap-1 mr-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> Giải thích:
                          </span>
                          <span>{q.explanation}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Thanh nút hành động cuối trang: Nộp bài hoặc Làm lại bài */}
        {questions.length > 0 && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs sm:text-sm text-slate-600 font-medium">
              {!isSubmitted ? (
                <span>
                  Em đã trả lời <strong className="text-indigo-700">{answeredCount}</strong> /{' '}
                  <strong>{questions.length}</strong> câu hỏi. Bấm <strong>Nộp bài</strong> để xem điểm và lời giải chi tiết ngay!
                </span>
              ) : (
                <span>
                  Em đã hoàn thành bài làm với số điểm{' '}
                  <strong className="text-indigo-700">{gradingSummary?.score10}/10</strong> (
                  {gradingSummary?.correctCount}/{gradingSummary?.total} câu đúng).
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {!isSubmitted ? (
                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>Nộp bài & Chấm điểm ngay</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRetryQuiz}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Làm lại bài</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Giao diện mở trực tiếp Đề kiểm tra công khai (/exam/[id]) không cần đăng nhập
 */
export const PublicExamPlayerView: React.FC<PublicExamPlayerViewProps> = ({
  examId,
  onGoHome,
}) => {
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [exam, setExam] = useState<ExamPaper | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchPublicExamById(examId).then((res) => {
      if (cancelled) return;
      if (res.status === 'ok') {
        setExam(res.exam);
        setStatus('ok');
      } else if (res.status === 'not_found') {
        setStatus('not_found');
      } else {
        setErrorMsg(res.message || 'Không thể tải đề kiểm tra.');
        setStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
        <div className="max-w-5xl w-full mx-auto px-4 pt-5 flex justify-end">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-slate-900">
                Đang mở đề kiểm tra...
              </h2>
              <p className="text-xs text-slate-500">
                Vui lòng chờ trong giây lát để tải nội dung câu hỏi.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'not_found' || status === 'error' || !exam) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
        <div className="max-w-5xl w-full mx-auto px-4 pt-5 flex justify-end">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-md w-full text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                {status === 'error' ? 'Không thể tải đề kiểm tra' : 'Không tìm thấy đề kiểm tra'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {status === 'error'
                  ? errorMsg
                  : 'Liên kết đề kiểm tra không chính xác hoặc đề kiểm tra đã bị xóa khỏi hệ thống.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold shadow-md transition-all cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Quay về Trang chủ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PublicQuizWorkspace
      mode="exam"
      title={exam.title || 'Đề kiểm tra trực tuyến'}
      subject={exam.subject}
      grade={exam.grade}
      targetClass={exam.targetClass}
      examType={exam.examType || exam.testType}
      durationMinutes={exam.durationMinutes || exam.duration}
      questions={Array.isArray(exam.questions) ? exam.questions : []}
      onGoHome={onGoHome}
    />
  );
};

/**
 * Giao diện mở trực tiếp Bài tập công khai (/assignment/[id]) không cần đăng nhập
 */
export const PublicAssignmentPlayerView: React.FC<PublicAssignmentPlayerViewProps> = ({
  assignmentId,
  onGoHome,
}) => {
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [assignment, setAssignment] = useState<HomeworkAssignment | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchPublicAssignmentById(assignmentId).then((res) => {
      if (cancelled) return;
      if (res.status === 'ok') {
        setAssignment(res.assignment);
        setStatus('ok');
      } else if (res.status === 'not_found') {
        setStatus('not_found');
      } else {
        setErrorMsg(res.message || 'Không thể tải bài tập.');
        setStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
        <div className="max-w-5xl w-full mx-auto px-4 pt-5 flex justify-end">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-slate-900">
                Đang mở bài tập...
              </h2>
              <p className="text-xs text-slate-500">
                Vui lòng chờ trong giây lát để tải nội dung bài tập.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'not_found' || status === 'error' || !assignment) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
        <div className="max-w-5xl w-full mx-auto px-4 pt-5 flex justify-end">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-md w-full text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                {status === 'error' ? 'Không thể tải bài tập' : 'Không tìm thấy bài tập'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {status === 'error'
                  ? errorMsg
                  : 'Liên kết bài tập không chính xác hoặc bài tập đã bị xóa khỏi hệ thống.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold shadow-md transition-all cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Quay về Trang chủ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Nếu bài tập là dạng giao bài giảng E-learning (có lessonId và không có câu hỏi rời), mở trực tiếp trình học công khai
  const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
  if (assignment.lessonId && questions.length === 0) {
    return <PublicLessonPlayerView lessonId={assignment.lessonId} onGoHome={onGoHome} />;
  }

  return (
    <PublicQuizWorkspace
      mode="assignment"
      title={assignment.title || 'Bài tập tự luyện trực tuyến'}
      subject={assignment.subject}
      grade={assignment.grade}
      targetClass={assignment.targetClass}
      questions={questions}
      onGoHome={onGoHome}
    />
  );
};
