import React, { useState } from 'react';
import { 
  CheckSquare, 
  Star, 
  Award, 
  CheckCircle2, 
  ChevronRight, 
  Check, 
  X, 
  RotateCcw,
  ClipboardList,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { Lesson5EPlan, QuestionItem } from '../../types';
import { getQuestionTypeLabel } from '../../lib/constants';
import { checkQuestionCorrectLocal } from './StudentExamModule';
import { stableShuffle } from '../../utils/arrayUtils';

interface StudentAssessmentViewProps {
  lesson: Lesson5EPlan;
  onNavigateToNext: () => void;
  nextStepLabel?: string;
  onSaveProgress?: (assessmentData: any) => void;
  savedData?: any;
}

interface EvaluationCriterion {
  id: string;
  name: string;
  description: string;
}

export const StudentAssessmentView: React.FC<StudentAssessmentViewProps> = ({
  lesson,
  onNavigateToNext,
  nextStepLabel = 'Nhận xét & Vinh danh (Review)',
  onSaveProgress,
  savedData
}) => {
  // 2 sub-tabs: 'test' (Đánh giá bài học) & 'self-eval' (Tự đánh giá)
  const [activeSubTab, setActiveSubTab] = useState<'test' | 'self-eval'>(savedData?.activeSubTab || 'test');

  // TAB 1: ASSESSMENT TEST - Read directly from lesson properties without hardcoded fallbacks
  const rawQuestions = 
    (lesson as any)?.assessmentQuestions ||
    (lesson as any)?.assessmentConfig?.questions ||
    (lesson as any)?.assessment?.questions ||
    (lesson as any)?.stepEvaluate?.questions ||
    [];

  const questions: QuestionItem[] = Array.isArray(rawQuestions) ? rawQuestions : [];

  const [testAnswers, setTestAnswers] = useState<Record<string, any>>(savedData?.testAnswers || {});
  const [isTestSubmitted, setIsTestSubmitted] = useState<boolean>(Boolean(savedData?.isTestSubmitted));
  const [testScore, setTestScore] = useState<number>(savedData?.testScore ?? 0);
  const [correctTestCount, setCorrectTestCount] = useState<number>(savedData?.correctTestCount ?? 0);

  // TAB 2: SELF EVALUATION RUBRICS - Read directly from lesson criteria without hardcoded fallbacks
  const rawCriteria = 
    (lesson as any)?.assessmentCriteria ||
    (lesson as any)?.assessmentConfig?.criteria ||
    [];

  const criteria: EvaluationCriterion[] = Array.isArray(rawCriteria)
    ? rawCriteria.map((c: any, idx: number) => {
        if (typeof c === 'string') {
          return {
            id: `crit-${idx + 1}`,
            name: c,
            description: ''
          };
        }
        return {
          id: c.id || `crit-${idx + 1}`,
          name: c.name || c.title || `Tiêu chí ${idx + 1}`,
          description: c.description || ''
        };
      })
    : [];

  const [selfRatings, setSelfRatings] = useState<Record<string, 'tot' | 'dat' | 'co_gang'>>(
    savedData?.selfRatings || {}
  );

  const [selfReflectionNote, setSelfReflectionNote] = useState<string>(
    savedData?.selfReflectionNote || ''
  );
  const [isSelfEvalSubmitted, setIsSelfEvalSubmitted] = useState<boolean>(Boolean(savedData?.isSelfEvalSubmitted));

  // Handler functions for different question types
  const handleOptionSelect = (qId: string, val: string) => {
    if (isTestSubmitted) return;
    setTestAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleMultiSelect = (qId: string, optIdx: number) => {
    if (isTestSubmitted) return;
    const currentArr: number[] = testAnswers[qId] || [];
    if (currentArr.includes(optIdx)) {
      setTestAnswers(prev => ({ ...prev, [qId]: currentArr.filter(i => i !== optIdx) }));
    } else {
      setTestAnswers(prev => ({ ...prev, [qId]: [...currentArr, optIdx].sort() }));
    }
  };

  const handleTFSelect = (qId: string, sIdx: number, val: boolean) => {
    if (isTestSubmitted) return;
    const current = testAnswers[qId] || {};
    setTestAnswers(prev => ({ ...prev, [qId]: { ...current, [sIdx]: val } }));
  };

  const handleSingleTFSelect = (qId: string, val: boolean) => {
    if (isTestSubmitted) return;
    setTestAnswers(prev => ({ ...prev, [qId]: val ? 'Đúng' : 'Sai' }));
  };

  const handleFillBlankChange = (qId: string, val: string) => {
    if (isTestSubmitted) return;
    setTestAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleOrderingMove = (qId: string, currentItems: string[], fromIdx: number, toIdx: number) => {
    if (isTestSubmitted) return;
    const items = [...currentItems];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    setTestAnswers(prev => ({ ...prev, [qId]: items }));
  };

  // Submit test
  const handleGradeTest = () => {
    let correct = 0;
    questions.forEach(q => {
      if (checkQuestionCorrectLocal(q, testAnswers[q.id])) {
        correct++;
      }
    });
    const finalScore = questions.length > 0 ? Math.round((correct / questions.length) * 10) : 10;
    setCorrectTestCount(correct);
    setTestScore(finalScore);
    setIsTestSubmitted(true);

    if (onSaveProgress) {
      onSaveProgress({
        activeSubTab: 'self-eval',
        testAnswers,
        isTestSubmitted: true,
        testScore: finalScore,
        correctTestCount: correct,
        selfRatings,
        selfReflectionNote,
        isSelfEvalSubmitted
      });
    }
  };

  // Submit self-evaluation
  const handleSubmitSelfEval = () => {
    setIsSelfEvalSubmitted(true);
    if (onSaveProgress) {
      onSaveProgress({
        activeSubTab: 'self-eval',
        testAnswers,
        isTestSubmitted: true,
        testScore,
        correctTestCount,
        selfRatings,
        selfReflectionNote,
        isSelfEvalSubmitted: true,
        isCompleted: true
      });
    }
    onNavigateToNext();
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            5
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              Đánh Giá Năng Lực Học Sinh (Assessment)
            </h3>
            <p className="text-xs text-slate-500">
              Gồm 2 phần: Bài kiểm tra năng lực & Tự đánh giá mức độ đạt được
            </p>
          </div>
        </div>

        {/* 2 SUB TABS */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-full sm:w-auto justify-center">
          <button
            onClick={() => setActiveSubTab('test')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'test'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>1. Đánh giá bài học ({questions.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('self-eval')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'self-eval'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Star className="w-4 h-4" />
            <span>2. Tự đánh giá ({criteria.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: BÀI KIỂM TRA ĐÁNH GIÁ NĂNG LỰC */}
      {activeSubTab === 'test' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-slate-50 p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                Phần 1: Bộ câu hỏi kiểm tra năng lực cuối bài ({questions.length} câu)
              </span>
              {isTestSubmitted && questions.length > 0 && (
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                  Điểm: {testScore}/10 ({correctTestCount}/{questions.length} câu đúng)
                </span>
              )}
            </div>

            {/* EMPTY STATE */}
            {questions.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Chưa có câu hỏi đánh giá</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Giáo viên chưa thiết lập câu hỏi đánh giá cho bài này. Em có thể tiếp tục sang phần Tự đánh giá.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {questions.map((q, qIdx) => {
                  const selectedAns = testAnswers[q.id];
                  const isCorrect = isTestSubmitted ? checkQuestionCorrectLocal(q, selectedAns) : false;
                  const qType = q.type || 'multiple_choice';

                  return (
                    <div key={q.id || qIdx} className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow-xs">
                      {/* Question Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-indigo-800 bg-indigo-100 px-3 py-1 rounded-lg">
                          Câu {qIdx + 1} ({getQuestionTypeLabel(qType)})
                        </span>
                        {isTestSubmitted && (
                          <span className={`text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1 ${
                            isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isCorrect ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            <span>{isCorrect ? 'Đúng' : 'Chưa đúng'}</span>
                          </span>
                        )}
                      </div>

                      {/* Question Content */}
                      <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-relaxed">{q.content}</p>

                      {/* Image Prompt / Context Description */}
                      {q.imagePrompt && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-medium italic">
                          📌 {q.imagePrompt}
                        </div>
                      )}

                      {/* Image Attachment */}
                      {q.imageUrl && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 max-w-lg bg-slate-100">
                          <img 
                            src={q.imageUrl} 
                            alt={`Hình ảnh minh họa câu ${qIdx + 1}`}
                            className="w-full h-auto max-h-72 object-contain"
                            loading="lazy"
                          />
                        </div>
                      )}

                      {/* 1. Multiple Choice */}
                      {qType === 'multiple_choice' && q.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {q.options.map((opt, optIdx) => {
                            const optLetter = String.fromCharCode(65 + optIdx);
                            const isSelected = selectedAns === optLetter;
                            let btnStyle = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-indigo-50/40';

                            if (isTestSubmitted) {
                              const normCorrect = String(q.correctAnswer || 'A').trim().toUpperCase();
                              if (optLetter === normCorrect) {
                                btnStyle = 'bg-emerald-600 border-emerald-600 text-white font-bold';
                              } else if (isSelected && !isCorrect) {
                                btnStyle = 'bg-rose-600 border-rose-600 text-white font-bold';
                              }
                            } else if (isSelected) {
                              btnStyle = 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20';
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={isTestSubmitted}
                                onClick={() => handleOptionSelect(q.id, optLetter)}
                                className={`p-3.5 rounded-2xl text-left border text-xs font-semibold transition-all flex items-center gap-3 cursor-pointer ${btnStyle}`}
                              >
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs shrink-0 ${
                                  isSelected || (isTestSubmitted && optLetter === String(q.correctAnswer || 'A').trim().toUpperCase())
                                    ? 'bg-white/20 text-white'
                                    : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {optLetter}
                                </span>
                                <span className="flex-1">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* 2. Multiple Response */}
                      {qType === 'multiple_response' && q.options && (
                        <div className="space-y-3 pt-1">
                          <div className="text-xs text-indigo-800 font-bold">Chọn tất cả các đáp án đúng:</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {q.options.map((opt, optIdx) => {
                              const currentArr: number[] = testAnswers[q.id] || [];
                              const isSelected = currentArr.includes(optIdx);

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={isTestSubmitted}
                                  onClick={() => handleMultiSelect(q.id, optIdx)}
                                  className={`p-3.5 rounded-2xl text-left border transition-all flex items-center gap-3 cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-50 border-indigo-600 text-indigo-950 font-bold shadow-xs'
                                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                                    isSelected 
                                      ? 'border-indigo-600 bg-indigo-600 text-white' 
                                      : 'border-slate-300 bg-white'
                                  }`}>
                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                  </span>
                                  <span className="text-xs leading-relaxed flex-1">{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 3. True / False */}
                      {qType === 'true_false' && (
                        <div className="space-y-2.5 pt-1">
                          {q.statements && q.statements.length > 0 ? (
                            <div className="space-y-2">
                              {q.statements.map((stmt, sIdx) => {
                                const currentVal = testAnswers[q.id]?.[sIdx];
                                return (
                                  <div key={sIdx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <span className="text-xs text-slate-800 font-bold">{sIdx + 1}. {stmt.statement}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        disabled={isTestSubmitted}
                                        onClick={() => handleTFSelect(q.id, sIdx, true)}
                                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                          currentVal === true ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                                        }`}
                                      >
                                        Đúng
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isTestSubmitted}
                                        onClick={() => handleTFSelect(q.id, sIdx, false)}
                                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                          currentVal === false ? 'bg-rose-600 text-white shadow-xs' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                                        }`}
                                      >
                                        Sai
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                disabled={isTestSubmitted}
                                onClick={() => handleSingleTFSelect(q.id, true)}
                                className={`flex-1 py-3 px-4 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                                  selectedAns === 'Đúng' ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50'
                                }`}
                              >
                                Đúng
                              </button>
                              <button
                                type="button"
                                disabled={isTestSubmitted}
                                onClick={() => handleSingleTFSelect(q.id, false)}
                                className={`flex-1 py-3 px-4 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                                  selectedAns === 'Sai' ? 'bg-rose-600 border-rose-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-rose-50'
                                }`}
                              >
                                Sai
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 4. Fill Blank */}
                      {qType === 'fill_blank' && (
                        <div className="space-y-2 pt-1">
                          <label className="block text-xs font-bold text-slate-700">Nhập đáp án của em:</label>
                          <input
                            type="text"
                            disabled={isTestSubmitted}
                            value={selectedAns || ''}
                            onChange={(e) => handleFillBlankChange(q.id, e.target.value)}
                            placeholder="Nhập câu trả lời vào đây..."
                            className="w-full p-4 bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      )}

                      {/* 5. Ordering */}
                      {qType === 'ordering' && (
                        <div className="space-y-2.5 pt-1">
                          <div className="text-xs text-indigo-800 font-bold">Sắp xếp các bước theo thứ tự đúng:</div>
                          {(() => {
                            const currentItems: string[] = testAnswers[q.id] || stableShuffle(q.options || [], q.id);
                            return (
                              <div className="space-y-2">
                                {currentItems.map((item, idx) => (
                                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                      <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                        {idx + 1}
                                      </span>
                                      <span className="text-xs text-slate-800 font-medium">{item}</span>
                                    </div>
                                    {!isTestSubmitted && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={idx === 0}
                                          onClick={() => handleOrderingMove(q.id, currentItems, idx, idx - 1)}
                                          className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-30 cursor-pointer"
                                        >
                                          <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={idx === currentItems.length - 1}
                                          onClick={() => handleOrderingMove(q.id, currentItems, idx, idx + 1)}
                                          className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-30 cursor-pointer"
                                        >
                                          <ArrowDown className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Teacher's Explanation */}
                      {isTestSubmitted && q.explanation && (
                        <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-xs text-indigo-950">
                          <strong className="font-extrabold text-indigo-800 block mb-1">💡 Lời giải chi tiết / Giải thích đáp án:</strong>
                          <p className="leading-relaxed">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {questions.length > 0 && (
                !isTestSubmitted ? (
                  <button
                    onClick={handleGradeTest}
                    className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl transition-all shadow-md shadow-indigo-600/30 flex items-center gap-2 cursor-pointer active:scale-98"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Nộp bài & Chấm điểm</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsTestSubmitted(false);
                      setTestAnswers({});
                    }}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Làm lại bài kiểm tra</span>
                  </button>
                )
              )}

              <button
                onClick={() => setActiveSubTab('self-eval')}
                className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl transition-all shadow-md shadow-indigo-600/30 flex items-center gap-2 cursor-pointer active:scale-98 ml-auto"
              >
                <span>Tiếp tục sang Phần 2: Tự đánh giá</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TỰ ĐÁNH GIÁ (SELF-ASSESSMENT RUBRICS) */}
      {activeSubTab === 'self-eval' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-slate-50 p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                Phần 2: Tự đánh giá mức độ đạt được theo các tiêu chí ({criteria.length} tiêu chí)
              </span>
              <button
                onClick={() => setActiveSubTab('test')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-bold underline cursor-pointer"
              >
                ← Xem lại bài kiểm tra
              </button>
            </div>

            {/* EMPTY STATE */}
            {criteria.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <Star className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Chưa có tiêu chí tự đánh giá</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Giáo viên chưa thiết lập tiêu chí tự đánh giá cho bài học này. Em có thể nhập cảm nghĩ và tiếp tục.
                </p>
              </div>
            ) : (
              /* CRITERIA LIST */
              <div className="space-y-4">
                {criteria.map((crit, cIdx) => {
                  const currentVal = selfRatings?.[crit.id];

                  return (
                    <div key={crit.id || cIdx} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">{crit.name}</h4>
                          {crit.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{crit.description}</p>
                          )}
                        </div>

                        {/* 3 LEVEL BUTTONS */}
                        <div className="flex items-center gap-2 pt-2 sm:pt-0">
                          <button
                            type="button"
                            onClick={() => setSelfRatings(prev => ({ ...prev, [crit.id]: 'tot' }))}
                            className={`px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              currentVal === 'tot'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black border border-amber-600 shadow-md shadow-amber-500/25'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-bold shadow-2xs'
                            }`}
                          >
                            <span>🌟 Tốt</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelfRatings(prev => ({ ...prev, [crit.id]: 'dat' }))}
                            className={`px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              currentVal === 'dat'
                                ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-black border border-teal-700 shadow-md shadow-teal-600/25'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-bold shadow-2xs'
                            }`}
                          >
                            <span>👍 Đạt</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelfRatings(prev => ({ ...prev, [crit.id]: 'co_gang' }))}
                            className={`px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              currentVal === 'co_gang'
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black border border-indigo-700 shadow-md shadow-indigo-600/25'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-bold shadow-2xs'
                            }`}
                          >
                            <span>💪 Cố gắng</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* REFLECTION TEXT */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-800">
                Ghi chú tự nhận xét / Cảm nghĩ sau bài học:
              </label>
              <textarea
                rows={3}
                value={selfReflectionNote}
                onChange={(e) => setSelfReflectionNote(e.target.value)}
                placeholder="Nêu cảm nghĩ, điều em thích nhất hoặc điều em muốn tìm hiểu thêm..."
                className="w-full p-4 bg-white border border-slate-300 rounded-2xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* SUBMIT */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSubmitSelfEval}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-black text-xs sm:text-sm rounded-2xl transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer active:scale-98"
              >
                <Award className="w-4 h-4" />
                <span>Hoàn tất Đánh giá & Xem {nextStepLabel}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
