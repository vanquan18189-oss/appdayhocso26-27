import React from 'react';
import { RefreshCw, Sparkles, Star, Flame, CheckCircle2, Gift, Home, Clock } from 'lucide-react';
import { GameItem, UserRole } from '../../../types';
import { calculateArenaReward } from '../../../config/rewardConfig';
import { TrophyStageIllustration } from './GameIllustrations';

export interface GameResultPodiumProps {
  activeGame: GameItem;
  userRole: UserRole;
  currentUserName: string;
  score: number;
  correctCount: number;
  bestStreak: number;
  achievedRank: number | 'unranked' | null;
  isRewardAlreadyClaimed: boolean;
  debugSaveResult: {
    status: 'idle' | 'saving' | 'success' | 'error';
    path?: string;
    studentCode?: string;
    roomId?: string;
    serverData?: any;
    errorMsg?: string;
  };
  onRetryDebugSave: () => void;
  onReplay: () => void;
  onCreateNewAiDeck: () => void;
  onOpenStore: () => void;
  onBackToLobby: () => void;
}

export const GameResultPodium: React.FC<GameResultPodiumProps> = ({
  activeGame,
  userRole,
  currentUserName,
  score,
  correctCount,
  bestStreak,
  achievedRank,
  isRewardAlreadyClaimed,
  debugSaveResult,
  onRetryDebugSave,
  onReplay,
  onCreateNewAiDeck,
  onOpenStore,
  onBackToLobby,
}) => {
  const totalQ = Math.max(1, activeGame.questions?.length || 1);
  const effectiveCorrect = Math.min(totalQ, Math.max(0, correctCount));
  const accuracyPct = Math.round((effectiveCorrect / totalQ) * 100);

  // 1 to 3 stars based on accuracy / score ratio
  const totalPossible = totalQ * 100;
  const ratio = Math.max(accuracyPct / 100, totalPossible > 0 ? score / totalPossible : 0);

  let earnedStars = 1;
  let tierTitle = 'CỐ GẮNG RẤT TỐT!';
  let tierPraise = `Hoan hô ${currentUserName}! Em đã hoàn thành lượt chơi, hãy thử lại để đạt 3 sao vàng rực rỡ nhé!`;

  if (score === 0 && effectiveCorrect === 0) {
    earnedStars = 0;
    tierTitle = 'HẾT GIỜ / CHƯA GHI ĐIỂM';
    tierPraise = `Đừng nản lòng nhé ${currentUserName}! Hãy bấm "Chơi lại" để chinh phục thử thách ngay nào!`;
  } else if (ratio >= 0.8) {
    earnedStars = 3;
    tierTitle = 'XUẤT SẮC VƯỢT TRỘI! 🏆';
    tierPraise = `Tuyệt vời quá ${currentUserName}! Em đã trả lời cực kỳ thông minh và xứng đáng nhận 3 ngôi sao vàng lấp lánh!`;
  } else if (ratio >= 0.5) {
    earnedStars = 2;
    tierTitle = 'HOÀN THÀNH RẤT TỐT! 🌟';
    tierPraise = `Làm tốt lắm ${currentUserName}! Chỉ thêm một chút nữa thôi là em chạm tới 3 sao vàng rồi!`;
  }

  const reward = calculateArenaReward(achievedRank || 'unranked');

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-indigo-700 via-purple-700 to-fuchsia-600 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-300">
      <div className="fixed -top-20 -left-20 w-80 h-80 bg-yellow-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-cyan-300/20 rounded-full blur-3xl pointer-events-none" />

      <div className="bg-[#FFFDF7] rounded-[34px] p-6 sm:p-9 w-full max-w-2xl text-slate-900 shadow-2xl border-4 border-amber-200 border-b-[10px] border-b-amber-400 relative overflow-hidden text-center space-y-6 my-auto animate-game-pop">
        {/* Header Pill */}
        <div className="flex items-center justify-center">
          <span className="px-4 py-1.5 rounded-full bg-amber-100 text-amber-900 font-black text-xs uppercase tracking-wider border border-amber-300 shadow-xs">
            🏅 BẢNG VINH DANH & TỔNG KẾT
          </span>
        </div>

        {/* Trophy & 3 Stars Row */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative flex items-center justify-center">
            {earnedStars === 0 ? (
              <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-slate-300 flex items-center justify-center shadow-inner">
                <Clock className="w-12 h-12 text-slate-500" />
              </div>
            ) : (
              <TrophyStageIllustration className="w-28 h-28 sm:w-32 sm:h-32 drop-shadow-md" />
            )}
          </div>

          {/* 1 to 3 Stars Display */}
          <div className="flex items-center justify-center gap-3 pt-1" aria-label={`Đạt ${earnedStars} trên 3 sao`}>
            {[1, 2, 3].map((starIndex) => {
              const isLit = starIndex <= earnedStars;
              return (
                <div
                  key={starIndex}
                  className={`transition-transform duration-300 ${
                    starIndex === 2 ? '-translate-y-2 scale-110' : ''
                  }`}
                >
                  <Star
                    className={`w-10 h-10 sm:w-12 sm:h-12 ${
                      isLit
                        ? 'text-amber-400 fill-amber-400 drop-shadow-[0_4px_10px_rgba(245,158,11,0.5)] animate-star-twinkle'
                        : 'text-slate-200 fill-slate-200'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <h2 className="text-2xl sm:text-3xl font-black font-heading text-slate-900">
            {tierTitle}
          </h2>
          <p className="text-sm sm:text-base font-semibold text-slate-600 max-w-lg leading-relaxed">
            {tierPraise}
          </p>
        </div>

        {/* 3 Key Stats Cards: Accuracy %, Total Score, Best Combo Streak */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-emerald-50 border-2 border-emerald-200 border-b-4 border-b-emerald-400 rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-center gap-1 text-emerald-700 text-[11px] font-black uppercase">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Tỷ lệ đúng</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-heading mt-1 tabular-nums">
              {accuracyPct}%
            </div>
            <div className="text-[11px] font-bold text-emerald-600 tabular-nums">
              {effectiveCorrect} / {totalQ} câu
            </div>
          </div>

          <div className="bg-amber-50 border-2 border-amber-200 border-b-4 border-b-amber-400 rounded-2xl p-3.5 sm:p-4">
            <div className="text-amber-800 text-[11px] font-black uppercase">
              Tổng điểm
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 font-heading mt-1 tabular-nums">
              {score.toLocaleString()}
            </div>
            <div className="text-[11px] font-bold text-amber-700">
              {achievedRank === 1 ? '🥇 Hạng 1' : achievedRank === 2 ? '🥈 Hạng 2' : achievedRank === 3 ? '🥉 Hạng 3' : '🎖️ Hoàn thành'}
            </div>
          </div>

          <div className="bg-orange-50 border-2 border-orange-200 border-b-4 border-b-orange-400 rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-center gap-1 text-orange-700 text-[11px] font-black uppercase">
              <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
              <span>Combo cao nhất</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-orange-600 font-heading mt-1 tabular-nums">
              {bestStreak}x
            </div>
            <div className="text-[11px] font-bold text-orange-700">
              Chuỗi liên tiếp
            </div>
          </div>
        </div>

        {/* Coins & EXP Rewards Box */}
        <div className="bg-indigo-50/90 border-2 border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-left">
            <div className="text-xs font-black text-indigo-900 uppercase tracking-wide">
              Phần thưởng Đấu Trường
            </div>
            <div className="text-xs font-semibold text-indigo-700 mt-0.5">
              {isRewardAlreadyClaimed
                ? 'Phòng này đã nhận thưởng trước đó. Luyện thêm để nhớ bài lâu hơn!'
                : 'Đã cộng trực tiếp vào tài khoản học tập của em!'}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs border-2 tabular-nums ${
                isRewardAlreadyClaimed
                  ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                  : 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs'
              }`}
            >
              🪙 +{reward.coins} Xu
            </span>
            <span
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs border-2 tabular-nums ${
                isRewardAlreadyClaimed
                  ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                  : 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
              }`}
            >
              ⭐ +{reward.exp} EXP
            </span>
          </div>
        </div>

        {/* Debug Panel preserved when ?debug=1 */}
        {typeof window !== 'undefined' && window.location.search.includes('debug=1') && (
          <div className="p-4 bg-slate-900 text-white border border-amber-400/40 rounded-2xl text-left text-xs space-y-2 font-mono">
            <div className="flex items-center justify-between text-amber-300 font-bold border-b border-slate-700 pb-1">
              <span>[DEBUG STUDENT RESULT]</span>
              <span
                className={
                  debugSaveResult.status === 'success'
                    ? 'text-emerald-400'
                    : debugSaveResult.status === 'error'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }
              >
                {debugSaveResult.status === 'success'
                  ? 'Đã lưu kết quả (Verified)'
                  : debugSaveResult.status === 'error'
                  ? 'Lỗi lưu kết quả'
                  : 'Đang lưu...'}
              </span>
            </div>
            <div>
              <strong>Đường dẫn:</strong> {debugSaveResult.path || 'Chưa ghi'}
            </div>
            <div>
              <strong>Mã HS:</strong> {debugSaveResult.studentCode} | <strong>Room ID:</strong>{' '}
              {debugSaveResult.roomId}
            </div>
            {debugSaveResult.status === 'success' && (
              <div className="text-emerald-300">
                <strong>Đọc lại từ server:</strong> Thành công! Điểm:{' '}
                {debugSaveResult.serverData?.score}
              </div>
            )}
            {debugSaveResult.status === 'error' && (
              <div className="space-y-2">
                <div className="text-rose-300">
                  <strong>Lỗi:</strong> {debugSaveResult.errorMsg}
                </div>
                <button
                  type="button"
                  onClick={onRetryDebugSave}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Thử lại (Retry)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={onReplay}
            className="w-full sm:w-auto min-h-[50px] px-6 py-3 bg-rose-500 hover:bg-rose-400 text-white font-black text-sm rounded-2xl border-b-[5px] border-rose-800 shadow-lg hover:scale-105 active:translate-y-[2px] active:border-b-[3px] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Chơi lại</span>
          </button>

          <button
            type="button"
            onClick={onCreateNewAiDeck}
            className="w-full sm:w-auto min-h-[50px] px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-sm rounded-2xl border-b-[5px] border-indigo-900 shadow-lg hover:scale-105 active:translate-y-[2px] active:border-b-[3px] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Tạo bộ câu hỏi mới</span>
          </button>

          {userRole === 'student' && (
            <button
              type="button"
              onClick={onOpenStore}
              className="w-full sm:w-auto min-h-[50px] px-6 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm rounded-2xl border-b-[5px] border-amber-700 shadow-lg hover:scale-105 active:translate-y-[2px] active:border-b-[3px] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Gift className="w-4 h-4" />
              <span>Cửa hàng đổi quà</span>
            </button>
          )}

          <button
            type="button"
            onClick={onBackToLobby}
            className="w-full sm:w-auto min-h-[50px] px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-sm rounded-2xl border-b-4 border-slate-300 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Về sảnh chờ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
