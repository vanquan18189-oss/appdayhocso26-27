import React from 'react';
import {
  Clock,
  Trophy,
  Flame,
  Sparkles,
  CheckCircle2,
  X,
  ArrowRight,
  Check,
  Disc,
  RotateCw,
  Star,
} from 'lucide-react';
import { GameItem } from '../../../types';

export interface GamePlayStageProps {
  activeGame: GameItem;
  currentQuestionIndex: number;
  selectedOption: string | null;
  selectedChoiceKey: string | null;
  score: number;
  comboStreak: number;
  correctCount: number;
  timerSeconds: number;
  totalTimerSeconds: number;
  currentUserName: string;
  gameAnswers: Record<number, any>;
  setGameAnswers: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  onExit: () => void;
  onSubmitAnswer: (answerValue: any, choiceKey?: string) => void;
  onNextManualQuestion: () => void;
  // Lucky wheel
  isSpinning: boolean;
  wheelWinner: string | null;
  onSpinLuckyWheel: () => void;
  // Question type detectors
  isMatchingQuestion: (q: any) => boolean;
  isTrueFalseQuestion: (q: any) => boolean;
  isMultipleResponseQuestion: (q: any) => boolean;
  isOrderingQuestion: (q: any) => boolean;
  isClassificationQuestion: (q: any) => boolean;
  isMultipleChoiceQuestion: (q: any) => boolean;
}

const OPTION_COLOR_PALETTE = [
  {
    letter: 'A',
    shape: '▲',
    idle: 'bg-[#FF5964] hover:bg-[#ff424f] text-white border-[#FF858D] border-b-[6px] border-b-[#B91C2C]',
    badge: 'bg-white/25 text-white border-white/40',
  },
  {
    letter: 'B',
    shape: '◆',
    idle: 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white border-[#60A5FA] border-b-[6px] border-b-[#1E3A8A]',
    badge: 'bg-white/25 text-white border-white/40',
  },
  {
    letter: 'C',
    shape: '●',
    idle: 'bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 border-[#FDE68A] border-b-[6px] border-b-[#92400E]',
    badge: 'bg-amber-950/15 text-slate-950 border-amber-950/20',
  },
  {
    letter: 'D',
    shape: '■',
    idle: 'bg-[#10B981] hover:bg-[#059669] text-white border-[#6EE7B7] border-b-[6px] border-b-[#065F46]',
    badge: 'bg-white/25 text-white border-white/40',
  },
];

export const GamePlayStage: React.FC<GamePlayStageProps> = ({
  activeGame,
  currentQuestionIndex,
  selectedOption,
  selectedChoiceKey,
  score,
  comboStreak,
  correctCount,
  timerSeconds,
  totalTimerSeconds,
  currentUserName,
  gameAnswers,
  setGameAnswers,
  onExit,
  onSubmitAnswer,
  onNextManualQuestion,
  isSpinning,
  wheelWinner,
  onSpinLuckyWheel,
  isMatchingQuestion,
  isTrueFalseQuestion,
  isMultipleResponseQuestion,
  isOrderingQuestion,
  isClassificationQuestion,
  isMultipleChoiceQuestion,
}) => {
  const questions = activeGame.questions || [];
  const totalQ = Math.max(1, questions.length);
  const q = questions[currentQuestionIndex] || ({} as any);
  const progressPct = Math.round(((currentQuestionIndex + (selectedOption !== null ? 1 : 0.3)) / totalQ) * 100);

  // Circular SVG timer math (green -> yellow -> red)
  const safeTotal = Math.max(1, totalTimerSeconds);
  const ratio = Math.max(0, Math.min(1, timerSeconds / safeTotal));
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ratio);

  let ringColor = '#10B981'; // green
  let timerPillClass = 'bg-emerald-500/20 border-emerald-300 text-white';
  if (ratio <= 0.25 || timerSeconds <= 4) {
    ringColor = '#FB7185'; // rose-red
    timerPillClass = 'bg-rose-600/90 border-rose-300 text-white animate-pulse';
  } else if (ratio <= 0.55) {
    ringColor = '#FACC15'; // yellow/amber
    timerPillClass = 'bg-amber-500/30 border-amber-300 text-white';
  }

  // Cheerful arena backdrop per game mode
  const arenaBackdrop =
    activeGame.type === 'speed_quiz'
      ? 'from-cyan-500 via-teal-600 to-emerald-700'
      : 'from-violet-600 via-indigo-600 to-sky-600';

  const modeBadgeLabel =
    activeGame.type === 'golden_bell'
      ? '🔔 RUNG CHUÔNG VÀNG'
      : activeGame.type === 'speed_quiz'
      ? '⛵ ĐUA THUYỀN VƯỢT SÓNG'
      : '🎡 VÒNG QUAY MAY MẮN';

  // Boat race progress calculation
  const boatProgressPct = Math.min(
    94,
    Math.max(6, Math.round(((correctCount + (selectedOption === 'CORRECT' ? 0 : 0)) / totalQ) * 86 + (currentQuestionIndex / totalQ) * 10))
  );

  const expectedMcqAnswer = String(q.answer || (q as any).correctAnswer || '').trim().toUpperCase();

  return (
    <div
      className={`fixed inset-0 z-50 bg-gradient-to-br ${arenaBackdrop} flex flex-col p-3 sm:p-5 lg:p-6 overflow-y-auto animate-in fade-in duration-300`}
    >
      {/* Playful Ambient Glows */}
      <div className="fixed -top-20 -left-20 w-80 h-80 bg-yellow-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-pink-400/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl w-full mx-auto flex flex-col flex-1 justify-between space-y-4 sm:space-y-5 relative z-10">
        {/* 1. TOP STATUS HUD */}
        <div className="bg-slate-950/35 backdrop-blur-md border-2 border-white/25 rounded-3xl px-4 py-3 sm:px-6 sm:py-3.5 shadow-xl flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Mode & Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="px-3.5 py-1.5 rounded-2xl bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wide border-b-4 border-amber-600 shrink-0 shadow-sm">
                {modeBadgeLabel}
              </span>
              <h2 className="text-sm sm:text-base font-black text-white truncate hidden md:block max-w-xs lg:max-w-md">
                {activeGame.title}
              </h2>
            </div>

            {/* Score, Combo Streak, Circular Countdown & Exit */}
            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              {/* Combo Streak 🔥 */}
              <div
                className={`px-3.5 py-1.5 rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition-all tabular-nums ${
                  comboStreak >= 2
                    ? 'bg-gradient-to-r from-orange-500 to-rose-500 border-amber-300 text-white animate-game-pop scale-105'
                    : 'bg-white/15 border-white/25 text-amber-200'
                }`}
                title="Chuỗi trả lời đúng liên tiếp"
              >
                <Flame className={`w-4 h-4 ${comboStreak >= 2 ? 'text-yellow-200 fill-yellow-200' : 'text-amber-300'}`} />
                <span>Combo Streak: {comboStreak}x</span>
              </div>

              {/* Score Badge */}
              <div className="px-3.5 py-1.5 rounded-2xl bg-amber-400 text-slate-950 border-b-4 border-amber-600 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md tabular-nums">
                <Trophy className="w-4 h-4 text-amber-800" />
                <span>{score.toLocaleString()} điểm</span>
              </div>

              {/* Circular Countdown Clock (Green -> Yellow -> Red) */}
              {activeGame.isTimeLimited !== false && activeGame.type !== 'lucky_wheel' && (
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded-2xl border-2 shadow-md transition-colors ${timerPillClass}`}
                  aria-label={`Còn ${timerSeconds} giây`}
                >
                  <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 56 56">
                      <circle
                        cx="28"
                        cy="28"
                        r={radius}
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="5"
                        fill="none"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r={radius}
                        stroke={ringColor}
                        strokeWidth="5"
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-700 ease-linear"
                      />
                    </svg>
                    <span className="absolute text-sm font-black text-white tabular-nums">
                      {timerSeconds}s
                    </span>
                  </div>
                </div>
              )}

              {/* Exit Button */}
              <button
                type="button"
                onClick={onExit}
                className="w-10 h-10 rounded-2xl bg-white/15 hover:bg-rose-500/80 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/30"
                title="Thoát trò chơi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Energy Progress Bar with Sparkling Stars */}
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-xl bg-white/20 text-white font-black text-xs shrink-0 tabular-nums">
              Câu {Math.min(currentQuestionIndex + 1, totalQ)} / {totalQ}
            </span>
            <div className="relative flex-1 h-4 bg-slate-950/45 rounded-full p-0.5 border border-white/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-300 to-emerald-400 transition-all duration-500 ease-out flex items-center justify-end pr-1"
                style={{ width: `${Math.max(8, Math.min(100, progressPct))}%` }}
              >
                <Sparkles className="w-3 h-3 text-amber-900 animate-star-twinkle" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-amber-200 text-xs font-black shrink-0 tabular-nums">
              <Star className="w-4 h-4 fill-amber-300 text-amber-300 animate-star-twinkle" />
              <span>{correctCount} đúng</span>
            </div>
          </div>

          {/* Boat / Obstacle Race Track (for speed_quiz mode) */}
          {activeGame.type === 'speed_quiz' && (
            <div className="relative bg-cyan-950/45 border border-cyan-200/30 rounded-2xl px-4 py-2.5 overflow-hidden">
              <div className="flex items-center justify-between text-[11px] font-black text-cyan-100 mb-1">
                <span>⚓ Xuất phát</span>
                <span>🌊 Vượt sóng chướng ngại vật</span>
                <span>🏁 Về đích vinh quang</span>
              </div>
              <div className="relative h-7 bg-gradient-to-r from-cyan-400/30 via-teal-400/35 to-emerald-400/40 rounded-full border border-white/20 flex items-center px-3">
                {/* Obstacle buoys */}
                <span className="absolute left-1/4 text-sm opacity-80 select-none" aria-hidden="true">🪨</span>
                <span className="absolute left-1/2 text-sm opacity-80 select-none" aria-hidden="true">🌀</span>
                <span className="absolute left-3/4 text-sm opacity-80 select-none" aria-hidden="true">🏝️</span>
                <span className="absolute right-2.5 text-base select-none" aria-hidden="true">🏆</span>
                {/* Moving Boat */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out flex items-center"
                  style={{ left: `calc(${boatProgressPct}% - 14px)` }}
                >
                  <span className="text-xl sm:text-2xl animate-boat-bob drop-shadow-md" aria-hidden="true">⛵</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. MAIN GAMEPLAY GRID: QUESTION STAGE (75%) + LIVE PODIUM SIDEBAR (25%) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start flex-1">
          <div className="lg:col-span-3 space-y-5 flex flex-col justify-center">
            {activeGame.type === 'lucky_wheel' ? (
              /* LUCKY WHEEL MODE */
              <div className="bg-[#FFFDF7] rounded-[32px] p-8 sm:p-10 text-center space-y-6 shadow-2xl border-4 border-amber-200 border-b-[10px] border-b-amber-400">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs uppercase tracking-wider">
                  <Disc className="w-4 h-4 animate-spin" />
                  <span>Vòng Quay Chọn Học Sinh May Mắn</span>
                </div>

                <div className="w-64 h-64 mx-auto rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-600 p-3 shadow-2xl flex items-center justify-center relative">
                  <div className="w-full h-full rounded-full bg-[#FFFDF7] flex flex-col items-center justify-center p-4 text-center border-4 border-amber-300 shadow-inner">
                    <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">
                      HỌC SINH ĐƯỢC CHỌN
                    </span>
                    <div className="text-2xl font-black text-slate-900 font-heading mt-2">
                      {wheelWinner || 'Bấm Quay Ngay!'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSpinLuckyWheel}
                  disabled={isSpinning}
                  className="min-h-[54px] px-8 py-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-base rounded-2xl border-b-[5px] border-orange-700 shadow-xl transition-all flex items-center gap-2 mx-auto cursor-pointer disabled:opacity-50"
                >
                  <RotateCw className={`w-5 h-5 ${isSpinning ? 'animate-spin' : ''}`} />
                  <span>{isSpinning ? 'Đang quay...' : 'QUAY NGAY BÂY GIỜ'}</span>
                </button>
              </div>
            ) : (
              <>
                {/* WARM CREAM QUESTION CARD */}
                <div className="bg-[#FFFDF7] rounded-[30px] p-6 sm:p-9 shadow-2xl border-4 border-white/80 border-b-[10px] border-b-amber-200 text-center space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <span className="px-3.5 py-1 rounded-full bg-indigo-100 text-indigo-800 font-black text-xs uppercase tracking-wider">
                      Câu hỏi {currentQuestionIndex + 1}
                    </span>
                    {activeGame.subject && (
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-extrabold text-xs">
                        {activeGame.subject}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-[28px] font-black text-slate-900 font-heading leading-snug max-w-4xl mx-auto">
                    {q.question || q.content}
                  </h3>
                </div>

                {/* FEEDBACK BANNER WHEN ANSWERED */}
                {selectedOption !== null && (
                  <div
                    className={`rounded-2xl px-5 py-3.5 font-black text-sm sm:text-base flex items-center justify-between gap-3 shadow-lg animate-game-pop border-2 ${
                      selectedOption === 'CORRECT'
                        ? 'bg-emerald-500 border-emerald-200 text-white'
                        : 'bg-rose-600 border-rose-300 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{selectedOption === 'CORRECT' ? '🎉' : '💪'}</span>
                      <span>
                        {selectedOption === 'CORRECT'
                          ? `Tuyệt vời! Chính xác rồi (+100 điểm)${comboStreak >= 2 ? ` • Combo ${comboStreak}x 🔥` : ''}`
                          : 'Chưa chính xác rồi! Xem đáp án đúng và cố lên ở câu tiếp theo nhé!'}
                      </span>
                    </div>
                    {selectedOption === 'CORRECT' && (
                      <span className="px-3 py-1 rounded-full bg-white/25 text-white text-xs font-black shrink-0">
                        ⭐ +100 PTS
                      </span>
                    )}
                  </div>
                )}

                {/* QUESTION INTERACTIVE BLOCK */}
                {(() => {
                  const isMatching = isMatchingQuestion(q);
                  const isTrueFalse = isTrueFalseQuestion(q);
                  const isMultipleResponse = isMultipleResponseQuestion(q);
                  const isOrdering = isOrderingQuestion(q);
                  const isClassification = isClassificationQuestion(q);
                  const isMultipleChoice = isMultipleChoiceQuestion(q);

                  if (isMultipleChoice) {
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {(q.options || []).slice(0, 4).map((opt: string, idx: number) => {
                          const optionLetter = String.fromCharCode(65 + idx);
                          const palette = OPTION_COLOR_PALETTE[idx % OPTION_COLOR_PALETTE.length];
                          const isAnswered = selectedOption !== null;
                          const isThisCorrect = optionLetter === expectedMcqAnswer;
                          const isThisSelected = selectedChoiceKey === optionLetter;
                          const cleanText = String(opt).replace(/^[A-D][\.\:\)]\s*/i, '');

                          let cardStyle = `${palette.idle} hover:scale-[1.03] active:translate-y-1 active:border-b-[2px]`;
                          if (isAnswered) {
                            if (isThisCorrect) {
                              cardStyle =
                                'bg-emerald-500 text-white border-emerald-200 border-b-[6px] border-b-emerald-800 ring-4 ring-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.75)] scale-[1.03]';
                            } else if (isThisSelected) {
                              cardStyle =
                                'bg-rose-600 text-white border-rose-300 border-b-[6px] border-b-rose-900 animate-game-shake';
                            } else {
                              cardStyle =
                                'bg-slate-800/45 text-white/55 border-white/10 border-b-[4px] border-b-slate-900/60 opacity-65';
                            }
                          }

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onSubmitAnswer(optionLetter, optionLetter)}
                              disabled={isAnswered}
                              className={`min-h-[82px] sm:min-h-[94px] p-4 sm:p-5 rounded-3xl border-2 text-left font-black text-base sm:text-lg transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 shadow-xl ${cardStyle}`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <span
                                  className={`w-11 h-11 rounded-2xl border-2 flex items-center justify-center font-black text-lg shrink-0 shadow-xs ${
                                    isAnswered && isThisCorrect
                                      ? 'bg-white text-emerald-700 border-emerald-100'
                                      : palette.badge
                                  }`}
                                >
                                  {optionLetter}
                                </span>
                                <span className="leading-snug break-words">{cleanText}</span>
                              </div>

                              {isAnswered && isThisCorrect && (
                                <span className="w-9 h-9 rounded-full bg-white text-emerald-600 flex items-center justify-center shrink-0 shadow-md animate-game-pop">
                                  <CheckCircle2 className="w-6 h-6" />
                                </span>
                              )}
                              {isAnswered && isThisSelected && !isThisCorrect && (
                                <span className="w-9 h-9 rounded-full bg-white text-rose-600 flex items-center justify-center shrink-0 shadow-md">
                                  <X className="w-5 h-5" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  }

                  if (isMatching) {
                    return (
                      <div className="bg-[#FFFDF7] rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-4">
                        <div className="text-indigo-800 text-sm font-black text-center">
                          🔗 Chọn đáp án ghép nối tương ứng cho mỗi mục bên trái:
                        </div>
                        <div className="space-y-3">
                          {(q.matchingPairs || []).map((pair: any, pIdx: number) => {
                            const currentAnswers = gameAnswers[currentQuestionIndex] || {};
                            const selectedRightVal = currentAnswers[pIdx] || '';
                            return (
                              <div
                                key={pIdx}
                                className="p-4 bg-indigo-50/70 border-2 border-indigo-100 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
                              >
                                <div className="flex-1 flex items-center gap-3">
                                  <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                                    {pIdx + 1}
                                  </span>
                                  <span className="text-sm sm:text-base font-bold text-slate-900">{pair.left}</span>
                                </div>
                                <span className="text-indigo-500 font-black hidden md:block">➔</span>
                                <select
                                  value={selectedRightVal}
                                  disabled={selectedOption !== null}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setGameAnswers((prev) => ({
                                      ...prev,
                                      [currentQuestionIndex]: {
                                        ...(prev[currentQuestionIndex] || {}),
                                        [pIdx]: val,
                                      },
                                    }));
                                  }}
                                  className="flex-1 px-4 py-2.5 bg-white border-2 border-indigo-200 focus:border-indigo-500 rounded-xl text-slate-900 text-sm font-bold outline-none cursor-pointer"
                                >
                                  <option value="">-- Chọn đáp án ghép nối --</option>
                                  {(q.matchingPairs || []).map((p: any, optIdx: number) => (
                                    <option key={optIdx} value={p.right}>
                                      {p.right}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                        {selectedOption === null && (
                          <div className="flex justify-center pt-1">
                            <button
                              type="button"
                              onClick={() => onSubmitAnswer(gameAnswers[currentQuestionIndex] || {})}
                              className="min-h-[48px] px-7 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-2xl border-b-4 border-amber-700 shadow-lg cursor-pointer"
                            >
                              Xác nhận ghép nối ✓
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isMultipleResponse && q.options && q.options.length > 0) {
                    return (
                      <div className="space-y-3">
                        <div className="bg-white/20 backdrop-blur-xs px-4 py-2 rounded-2xl text-white text-xs sm:text-sm font-black text-center">
                          ☑️ Chọn tất cả các đáp án đúng (có thể chọn nhiều):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {q.options.map((opt: string, optIdx: number) => {
                            const optionLetter = String.fromCharCode(65 + optIdx);
                            const currentArr: number[] = Array.isArray(gameAnswers[currentQuestionIndex])
                              ? gameAnswers[currentQuestionIndex]
                              : [];
                            const isSelected = currentArr.includes(optIdx);
                            return (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={selectedOption !== null}
                                onClick={() => {
                                  if (selectedOption !== null) return;
                                  const prevArr: number[] = Array.isArray(gameAnswers[currentQuestionIndex])
                                    ? gameAnswers[currentQuestionIndex]
                                    : [];
                                  const newArr = prevArr.includes(optIdx)
                                    ? prevArr.filter((i) => i !== optIdx)
                                    : [...prevArr, optIdx].sort((a, b) => a - b);
                                  setGameAnswers((prev) => ({ ...prev, [currentQuestionIndex]: newArr }));
                                }}
                                className={`min-h-[72px] p-4 rounded-2xl border-2 text-left font-extrabold text-sm sm:text-base transition-all flex items-center gap-3 cursor-pointer shadow-lg ${
                                  isSelected
                                    ? 'bg-amber-400 text-slate-950 border-amber-200 border-b-[5px] border-b-amber-700'
                                    : 'bg-[#FFFDF7] text-slate-900 border-slate-200 border-b-[5px] border-b-slate-300 hover:scale-[1.02]'
                                }`}
                              >
                                <span
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 ${
                                    isSelected ? 'bg-slate-950 text-amber-300' : 'bg-indigo-100 text-indigo-700'
                                  }`}
                                >
                                  {isSelected ? <Check className="w-5 h-5" /> : optionLetter}
                                </span>
                                <span className="flex-1">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedOption === null && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => onSubmitAnswer(gameAnswers[currentQuestionIndex] || [])}
                              className="min-h-[48px] px-7 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-2xl border-b-4 border-amber-700 shadow-lg cursor-pointer"
                            >
                              Nộp câu trả lời ✓
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isOrdering) {
                    const currentOrder: string[] = Array.isArray(gameAnswers[currentQuestionIndex])
                      ? gameAnswers[currentQuestionIndex]
                      : q.options || [];

                    return (
                      <div className="bg-[#FFFDF7] rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-3">
                        <div className="text-indigo-800 text-sm font-black text-center">
                          ↕️ Sắp xếp các bước theo đúng thứ tự (bấm ▲ / ▼):
                        </div>
                        <div className="space-y-2.5">
                          {currentOrder.map((item: string, oIdx: number) => (
                            <div
                              key={oIdx}
                              className="p-3.5 bg-indigo-50/70 border-2 border-indigo-100 rounded-2xl flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center text-xs font-black shrink-0">
                                  {oIdx + 1}
                                </span>
                                <span className="text-sm sm:text-base font-bold text-slate-900">{item}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={oIdx === 0 || selectedOption !== null}
                                  onClick={() => {
                                    const newOrder = [...currentOrder];
                                    [newOrder[oIdx - 1], newOrder[oIdx]] = [newOrder[oIdx], newOrder[oIdx - 1]];
                                    setGameAnswers((prev) => ({ ...prev, [currentQuestionIndex]: newOrder }));
                                  }}
                                  className="w-9 h-9 rounded-xl bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-700 disabled:opacity-30 cursor-pointer font-black text-xs"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={oIdx === currentOrder.length - 1 || selectedOption !== null}
                                  onClick={() => {
                                    const newOrder = [...currentOrder];
                                    [newOrder[oIdx], newOrder[oIdx + 1]] = [newOrder[oIdx + 1], newOrder[oIdx]];
                                    setGameAnswers((prev) => ({ ...prev, [currentQuestionIndex]: newOrder }));
                                  }}
                                  className="w-9 h-9 rounded-xl bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-700 disabled:opacity-30 cursor-pointer font-black text-xs"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {selectedOption === null && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => onSubmitAnswer(currentOrder)}
                              className="min-h-[48px] px-7 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-2xl border-b-4 border-amber-700 shadow-lg cursor-pointer"
                            >
                              Xác nhận sắp xếp ✓
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isClassification) {
                    return (
                      <div className="bg-[#FFFDF7] rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-3">
                        <div className="text-indigo-800 text-sm font-black text-center">
                          📂 Xếp các mục vào đúng nhóm thích hợp:
                        </div>
                        <div className="space-y-3">
                          {(q.classificationItems || []).map((item: any, iIdx: number) => {
                            const currentAnswers = gameAnswers[currentQuestionIndex] || {};
                            const selectedGroup = currentAnswers[iIdx] || '';
                            return (
                              <div
                                key={iIdx}
                                className="p-4 bg-indigo-50/70 border-2 border-indigo-100 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
                              >
                                <span className="text-slate-900 font-bold text-sm sm:text-base">
                                  {iIdx + 1}. {item.name}
                                </span>
                                <select
                                  value={selectedGroup}
                                  disabled={selectedOption !== null}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setGameAnswers((prev) => ({
                                      ...prev,
                                      [currentQuestionIndex]: {
                                        ...(prev[currentQuestionIndex] || {}),
                                        [iIdx]: val,
                                      },
                                    }));
                                  }}
                                  className="px-4 py-2.5 bg-white border-2 border-indigo-200 rounded-xl text-slate-900 text-sm font-bold outline-none cursor-pointer"
                                >
                                  <option value="">-- Chọn nhóm --</option>
                                  {(q.classificationGroups || ['Nhóm 1', 'Nhóm 2']).map((gName: string, gIdx: number) => (
                                    <option key={gIdx} value={gName}>
                                      {gName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                        {selectedOption === null && (
                          <div className="flex justify-center pt-1">
                            <button
                              type="button"
                              onClick={() => onSubmitAnswer(gameAnswers[currentQuestionIndex] || {})}
                              className="min-h-[48px] px-7 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-2xl border-b-4 border-amber-700 shadow-lg cursor-pointer"
                            >
                              Xác nhận phân loại ✓
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isTrueFalse) {
                    const qa = q as any;
                    const statementsToUse =
                      q.statements && q.statements.length > 0
                        ? q.statements
                        : [
                            {
                              statement: q.question || q.content || 'Đánh giá phát biểu sau:',
                              isCorrect:
                                qa.correctAnswer === 'A' ||
                                String(qa.correctAnswer || qa.answer || '').toLowerCase().includes('đúng') ||
                                qa.correctAnswer === true,
                            },
                          ];

                    return (
                      <div className="bg-[#FFFDF7] rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-3">
                        <div className="text-indigo-800 text-sm font-black text-center">
                          📋 Đánh giá các nhận định sau là Đúng hay Sai:
                        </div>
                        {statementsToUse.map((st: any, idx: number) => {
                          const currentAnswers = gameAnswers[currentQuestionIndex] || {};
                          const val = currentAnswers[idx];
                          return (
                            <div
                              key={idx}
                              className="p-4 bg-indigo-50/70 border-2 border-indigo-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                            >
                              <span className="text-slate-900 font-bold text-sm sm:text-base">
                                {statementsToUse.length > 1 ? `${idx + 1}. ` : ''}
                                {st.statement}
                              </span>
                              <div className="flex items-center gap-2.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={selectedOption !== null}
                                  onClick={() => {
                                    if (selectedOption !== null) return;
                                    setGameAnswers((prev) => ({
                                      ...prev,
                                      [currentQuestionIndex]: {
                                        ...(prev[currentQuestionIndex] || {}),
                                        [idx]: true,
                                      },
                                    }));
                                  }}
                                  className={`min-h-[44px] px-5 py-2 rounded-2xl font-black text-sm transition-all cursor-pointer border-b-4 ${
                                    val === true
                                      ? 'bg-emerald-500 text-white border-emerald-700 shadow-md scale-105'
                                      : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                                  }`}
                                >
                                  ✓ Đúng
                                </button>
                                <button
                                  type="button"
                                  disabled={selectedOption !== null}
                                  onClick={() => {
                                    if (selectedOption !== null) return;
                                    setGameAnswers((prev) => ({
                                      ...prev,
                                      [currentQuestionIndex]: {
                                        ...(prev[currentQuestionIndex] || {}),
                                        [idx]: false,
                                      },
                                    }));
                                  }}
                                  className={`min-h-[44px] px-5 py-2 rounded-2xl font-black text-sm transition-all cursor-pointer border-b-4 ${
                                    val === false
                                      ? 'bg-rose-500 text-white border-rose-700 shadow-md scale-105'
                                      : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                                  }`}
                                >
                                  ✕ Sai
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {selectedOption === null && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => onSubmitAnswer(gameAnswers[currentQuestionIndex] || {})}
                              className="min-h-[48px] px-7 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-2xl border-b-4 border-amber-700 shadow-lg cursor-pointer"
                            >
                              Nộp đáp án Đúng/Sai ✓
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Essay / Fill in the blank fallback
                  const rawAns = gameAnswers[currentQuestionIndex];
                  const essayVal =
                    typeof rawAns === 'string' || typeof rawAns === 'number' ? String(rawAns) : '';
                  return (
                    <div className="bg-[#FFFDF7] rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-4">
                      <textarea
                        placeholder="Nhập câu trả lời của em tại đây..."
                        disabled={selectedOption !== null}
                        value={essayVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGameAnswers((prev) => ({ ...prev, [currentQuestionIndex]: val }));
                        }}
                        className="w-full p-4 bg-white border-2 border-indigo-200 focus:border-indigo-500 rounded-2xl text-slate-900 placeholder-slate-400 outline-none text-base font-bold"
                        rows={3}
                      />
                      {selectedOption === null && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => onSubmitAnswer(essayVal)}
                            className="min-h-[48px] px-7 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-2xl border-b-4 border-amber-700 shadow-lg cursor-pointer"
                          >
                            Nộp bài trả lời ✓
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Explanation Callout */}
                {selectedOption !== null && q.explanation && (
                  <div className="p-4 sm:p-5 bg-[#FFFDF7] rounded-2xl text-sm sm:text-base text-slate-800 border-2 border-amber-300 shadow-lg animate-in fade-in">
                    <span className="font-black text-amber-700">💡 Giải thích:</span>{' '}
                    <span className="font-semibold">{q.explanation}</span>
                  </div>
                )}

                {/* Self-Paced Next Button */}
                {activeGame.isTimeLimited === false && selectedOption !== null && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={onNextManualQuestion}
                      className="min-h-[52px] px-8 py-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-base rounded-2xl border-b-[5px] border-orange-700 shadow-xl transition-all flex items-center gap-2.5 cursor-pointer"
                    >
                      <span>{currentQuestionIndex + 1 < totalQ ? 'Câu tiếp theo' : 'Xem tổng kết'}</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3. LIVE LEADERBOARD SIDEBAR */}
          <div className="lg:col-span-1 bg-slate-950/35 backdrop-blur-md rounded-3xl p-5 border-2 border-white/25 shadow-xl space-y-4">
            <div className="text-center pb-3 border-b border-white/15">
              <span className="text-xs font-black uppercase tracking-widest text-slate-950 bg-amber-300 px-3.5 py-1.5 rounded-full inline-block shadow-sm">
                🏆 BẢNG XẾP HẠNG TRỰC TIẾP
              </span>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {[
                { name: 'Lê Minh Anh', score: score + 200, avatar: '🦊', isMe: false },
                { name: currentUserName || 'Bạn', score: score, avatar: '🌟', isMe: true },
                { name: 'Nguyễn Văn Nam', score: Math.max(0, score - 50), avatar: '🐱', isMe: false },
                { name: 'Trần Thảo Vy', score: Math.max(0, score - 120), avatar: '🐼', isMe: false },
                { name: 'Phạm Minh Quân', score: Math.max(0, score - 200), avatar: '🐨', isMe: false },
              ]
                .sort((a, b) => b.score - a.score)
                .map((player, idx) => {
                  const actualRank = idx + 1;
                  return (
                    <div
                      key={player.name}
                      className={`p-3 rounded-2xl flex items-center justify-between border-2 transition-all ${
                        player.isMe
                          ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-lg scale-[1.02]'
                          : 'bg-white/10 border-white/15 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            actualRank === 1
                              ? 'bg-yellow-300 text-slate-950'
                              : actualRank === 2
                              ? 'bg-slate-200 text-slate-900'
                              : actualRank === 3
                              ? 'bg-orange-400 text-slate-950'
                              : 'bg-white/15 text-white'
                          }`}
                        >
                          {actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : actualRank === 3 ? '🥉' : actualRank}
                        </span>
                        <span className="text-base shrink-0">{player.avatar}</span>
                        <span className="text-xs font-black truncate">
                          {player.name} {player.isMe && '(Em)'}
                        </span>
                      </div>
                      <span className="text-xs font-black shrink-0 ml-2 tabular-nums">
                        {player.score.toLocaleString()} đ
                      </span>
                    </div>
                  );
                })}
            </div>

            <div className="text-center text-[11px] text-white/80 font-semibold pt-1">
              ✨ Trả lời đúng liên tiếp để giữ chuỗi Combo Streak nhé!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
