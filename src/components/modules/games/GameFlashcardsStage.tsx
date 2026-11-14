import React from 'react';
import { CheckCircle2, RotateCcw, ArrowLeft, ArrowRight, Sparkles, X, Layers } from 'lucide-react';
import { GameItem } from '../../../types';

export interface GameFlashcardsStageProps {
  activeGame: GameItem;
  currentIndex: number;
  isFlipped: boolean;
  masteredIndices: number[];
  reviewIndices: number[];
  onToggleFlip: () => void;
  onMarkMastered: () => void;
  onMarkNeedsReview: () => void;
  onPrevCard: () => void;
  onJumpToNextReview: () => void;
  onFinishDeck: () => void;
  onExit: () => void;
}

export const GameFlashcardsStage: React.FC<GameFlashcardsStageProps> = ({
  activeGame,
  currentIndex,
  isFlipped,
  masteredIndices,
  reviewIndices,
  onToggleFlip,
  onMarkMastered,
  onMarkNeedsReview,
  onPrevCard,
  onJumpToNextReview,
  onFinishDeck,
  onExit,
}) => {
  const total = activeGame.questions.length || 1;
  const card = activeGame.questions[currentIndex];
  const progressPct = Math.round(((currentIndex + 1) / total) * 100);
  const isCurrentMastered = masteredIndices.includes(currentIndex);
  const isCurrentReview = reviewIndices.includes(currentIndex);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex flex-col p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-300">
      {/* Decorative soft glows */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-sky-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-fuchsia-400/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col justify-between space-y-5 relative z-10">
        {/* TOP HUD BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/15 backdrop-blur-md border border-white/25 rounded-2xl px-4 py-3 text-white shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white text-indigo-700 flex items-center justify-center shrink-0 shadow-sm border-b-4 border-indigo-200">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-wider text-sky-200">
                Thẻ Ghi Nhớ Flashcards 3D
              </div>
              <h2 className="text-sm sm:text-base font-black text-white truncate">
                {activeGame.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white font-black text-xs border-b-2 border-emerald-700 tabular-nums">
              ✅ Đã thuộc: {masteredIndices.length}
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs border-b-2 border-amber-600 tabular-nums">
              🔄 Cần ôn: {reviewIndices.length}
            </span>
            <button
              type="button"
              onClick={onExit}
              className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/25"
              title="Thoát chế độ Flashcards"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SPARKLING ENERGY PROGRESS BAR */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs sm:text-sm font-black text-white">
            <span className="tabular-nums">Thẻ {currentIndex + 1} / {total}</span>
            <span className="flex items-center gap-1 text-amber-200 tabular-nums">
              <Sparkles className="w-4 h-4 animate-star-twinkle text-amber-300" />
              {progressPct}% chặng đường
            </span>
          </div>
          <div className="h-4 w-full bg-indigo-950/50 rounded-full p-0.5 border border-white/25 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-300 to-emerald-400 transition-all duration-500 relative flex items-center justify-end pr-1"
              style={{ width: `${Math.max(8, progressPct)}%` }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
            </div>
          </div>
        </div>

        {/* 3D PERSPECTIVE FLIP CARD */}
        <div className="flex-1 flex flex-col items-center justify-center py-2">
          <div
            onClick={onToggleFlip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleFlip();
              }
            }}
            className="game-perspective w-full max-w-2xl h-[320px] sm:h-[370px] cursor-pointer select-none group"
            aria-label="Bấm để lật thẻ Flashcard"
          >
            <div
              className={`game-preserve-3d relative w-full h-full transition-transform duration-500 ease-out ${
                isFlipped ? 'game-rotate-y-180' : 'group-hover:scale-[1.015]'
              }`}
            >
              {/* FRONT FACE: KEYWORD / QUESTION */}
              <div className="game-backface-hidden absolute inset-0 bg-[#FFFDF7] rounded-[32px] p-7 sm:p-10 shadow-2xl border-4 border-sky-200 border-b-[10px] border-b-indigo-200 flex flex-col items-center justify-between text-center">
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="px-3.5 py-1 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs uppercase tracking-wider">
                    ✨ Mặt trước • Từ khóa / Câu hỏi
                  </span>
                  {isCurrentMastered && (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs">
                      ✓ Đã thuộc
                    </span>
                  )}
                  {!isCurrentMastered && isCurrentReview && (
                    <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-black text-xs">
                      🔄 Cần ôn lại
                    </span>
                  )}
                </div>

                <div className="my-auto px-2">
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-black font-heading text-slate-900 leading-snug">
                    {card?.question || card?.content || `Thẻ số ${currentIndex + 1}`}
                  </h3>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-extrabold border border-indigo-200">
                  <span>👆 Bấm vào thẻ (hoặc phím Space) để lật xem đáp án</span>
                </div>
              </div>

              {/* BACK FACE: ANSWER & EXPLANATION */}
              <div className="game-backface-hidden game-rotate-y-180 absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-sky-50 rounded-[32px] p-7 sm:p-10 shadow-2xl border-4 border-emerald-300 border-b-[10px] border-b-emerald-500 flex flex-col items-center justify-between text-center">
                <div className="w-full flex items-center justify-between">
                  <span className="px-3.5 py-1 rounded-full bg-emerald-600 text-white font-black text-xs uppercase tracking-wider shadow-xs">
                    💡 Mặt sau • Đáp án & Giải thích
                  </span>
                  <span className="text-xs font-extrabold text-slate-500">
                    Bấm lại để úp thẻ
                  </span>
                </div>

                <div className="my-auto space-y-4 px-2 max-w-xl">
                  <div className="text-2xl sm:text-3xl font-black font-heading text-emerald-800 leading-snug">
                    {card?.answer || 'Chưa có đáp án'}
                  </div>
                  {card?.explanation && (
                    <p className="text-sm sm:text-base font-semibold text-slate-700 bg-white/90 border border-emerald-200 rounded-2xl p-4 leading-relaxed shadow-2xs">
                      {card.explanation}
                    </p>
                  )}
                </div>

                <div className="text-xs font-bold text-emerald-700">
                  Chọn đánh giá bên dưới: <strong>Đã thuộc</strong> hoặc <strong>Cần ôn lại</strong> 👇
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM CONTROLS: PREVIOUS + "CẦN ÔN LẠI" / "ĐÃ THUỘC" + FINISH */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onPrevCard}
            disabled={currentIndex === 0}
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 bg-white/15 hover:bg-white/25 text-white font-extrabold text-sm rounded-2xl border border-white/30 transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Thẻ trước</span>
          </button>

          <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onMarkNeedsReview}
              className="flex-1 sm:flex-none min-h-[52px] px-6 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm sm:text-base rounded-2xl border-b-[5px] border-amber-700 shadow-lg hover:scale-105 active:translate-y-[2px] active:border-b-[3px] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Cần ôn lại</span>
            </button>

            <button
              type="button"
              onClick={onMarkMastered}
              className="flex-1 sm:flex-none min-h-[52px] px-7 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm sm:text-base rounded-2xl border-b-[5px] border-emerald-800 shadow-lg hover:scale-105 active:translate-y-[2px] active:border-b-[3px] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Đã thuộc 🎉</span>
            </button>
          </div>

          {reviewIndices.length > 0 && currentIndex === total - 1 ? (
            <button
              type="button"
              onClick={onJumpToNextReview}
              className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm rounded-2xl border-b-4 border-sky-700 shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Ôn {reviewIndices.length} thẻ chưa thuộc</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onFinishDeck}
              className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 bg-white text-indigo-700 hover:bg-indigo-50 font-black text-sm rounded-2xl border-b-4 border-indigo-200 shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Tổng kết</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
