import React from 'react';
import {
  Coins,
  Sparkles,
  Trophy,
  Star,
  Award,
  Flame,
  Gift,
  Gem,
  CheckCircle2,
  TrendingUp
} from 'lucide-react';

export interface StudentRewardBadgeCardProps {
  /** Score value (e.g. 67 or 10) */
  score: number;
  /** Maximum score possible (default 100 or 10) */
  maxScore?: number;
  /** Optional custom text display for score (e.g. "10 / 10" or "67 / 100 điểm") */
  scoreDisplay?: string;
  /** Custom label for score metric */
  scoreLabel?: string;
  /** Total student coins */
  coins: number;
  /** Bonus coins earned in this activity/lesson */
  bonusCoins?: number;
  /** Custom label for coins metric */
  coinsLabel?: string;
  /** Student EXP points */
  exp?: number;
  /** Student level */
  level?: number;
  /** Completed steps (e.g. 2 for 2/5 steps in 5E) */
  completedSteps?: number;
  /** Total steps (e.g. 5) */
  totalSteps?: number;
  /** Compact mode for embedding inside stat cards grid */
  compact?: boolean;
  /** Additional custom class */
  className?: string;
}

export const StudentRewardBadgeCard: React.FC<StudentRewardBadgeCardProps> = ({
  score,
  maxScore = 100,
  scoreDisplay,
  scoreLabel = 'Bông Hoa Điểm 10 & EXP',
  coins = 1000,
  bonusCoins,
  coinsLabel = 'Xu Thưởng & Kim Cương',
  exp,
  level = 1,
  completedSteps,
  totalSteps = 5,
  compact = false,
  className = '',
}) => {
  // Normalize score percentage
  const safeMax = maxScore > 0 ? maxScore : 100;
  const pct = Math.min(100, Math.max(0, Math.round((score / safeMax) * 100)));

  // Format coins with commas if large
  const formattedCoins = new Intl.NumberFormat('vi-VN').format(coins);
  const formattedBonus = bonusCoins !== undefined ? `+${bonusCoins}` : null;
  const effectiveExp = exp !== undefined ? exp : score;

  // Milestone message based on percentage
  const getMilestoneMessage = (percentage: number) => {
    if (percentage >= 100) {
      return {
        text: '🎉 Xuất sắc! Em đã đạt trọn vẹn Bông Hoa Điểm 10 Rực Rỡ!',
        badge: 'Đạt Mốc Tối Đa 🏆',
        color: 'text-amber-700 bg-amber-100 border-amber-300'
      };
    }
    if (percentage >= 80) {
      return {
        text: `🌸 Tuyệt vời! Em đạt ${percentage}% • Còn một chút nữa là đạt mốc 100 điểm!`,
        badge: 'Hoa Điểm Giỏi 🌟',
        color: 'text-emerald-700 bg-emerald-100 border-emerald-300'
      };
    }
    if (percentage >= 50) {
      return {
        text: `⚡ Đang tiến bộ! Em đạt ${percentage}% • Tiếp tục phát huy để nhận thêm Xu thưởng!`,
        badge: 'Hoa Chăm Ngoan 🌿',
        color: 'text-blue-700 bg-blue-100 border-blue-300'
      };
    }
    return {
      text: `🌱 Nỗ lực học tập! Tích lũy thêm để mở khóa Bông Hoa Điểm 10 nhé!`,
      badge: 'Khởi Động Tích Lũy 🚀',
      color: 'text-slate-700 bg-slate-100 border-slate-300'
    };
  };

  const milestone = getMilestoneMessage(pct);

  // ---------------------------------------------------------------------------
  // COMPACT MODE: Designed to fit into Stat Cards Grid (e.g. StudentExamModule)
  // ---------------------------------------------------------------------------
  if (compact) {
    return (
      <div
        className={`h-full bg-gradient-to-br from-amber-50/95 via-rose-50/70 to-indigo-50/80 p-4 rounded-2xl border border-amber-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 group ${className}`}
      >
        {/* Top Header Row with Icon and Title */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-950 flex items-center justify-center font-black shadow-xs shrink-0 group-hover:rotate-6 transition-transform">
              <Trophy className="w-4 h-4 text-amber-900" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-900/80 block truncate">
                Điểm & Xu Thưởng
              </span>
              <span className="text-[10px] text-slate-500 font-semibold block truncate">
                Tài nguyên học tập
              </span>
            </div>
          </div>

          <span className="px-2 py-0.5 rounded-full bg-amber-400/30 text-amber-900 text-[10px] font-extrabold border border-amber-300/80 shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-600 animate-pulse" />
            <span>Lv.{level}</span>
          </span>
        </div>

        {/* 2 Main Metric Chips (Coins & Score/EXP) */}
        <div className="grid grid-cols-2 gap-2">
          {/* Chip 1: Xu Thưởng / Kim Cương */}
          <div className="bg-white/90 backdrop-blur-xs p-2 rounded-xl border border-amber-200/80 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-bold text-amber-700">
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-500" />
                <span>Xu Thưởng</span>
              </span>
              <Gem className="w-2.5 h-2.5 text-cyan-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-base font-black text-amber-950 font-heading">
                {formattedCoins}
              </span>
              <span className="text-[10px] font-bold text-amber-600">xu</span>
            </div>
          </div>

          {/* Chip 2: Bông Hoa Điểm 10 / EXP */}
          <div className="bg-white/90 backdrop-blur-xs p-2 rounded-xl border border-rose-200/80 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-bold text-rose-700">
              <span className="flex items-center gap-1">
                <span className="text-[11px]">🌸</span>
                <span>Hoa Điểm 10</span>
              </span>
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-base font-black text-rose-950 font-heading">
                {scoreDisplay || `${score}/${maxScore}`}
              </span>
              <span className="text-[9px] font-extrabold px-1 py-0.2 rounded bg-rose-100 text-rose-700">
                +{effectiveExp} EXP
              </span>
            </div>
          </div>
        </div>

        {/* Vivid Mini Progress Bar */}
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
            <span className="flex items-center gap-1 text-slate-700 font-extrabold">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              <span>Tiến độ mốc</span>
            </span>
            <span className="text-emerald-700 font-black">{pct}%</span>
          </div>

          <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden p-0.5 border border-amber-200 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-amber-400 via-rose-400 to-emerald-500 rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${Math.max(pct > 0 ? 8 : 0, pct)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // FULL EXPANDED MODE: For StudentReviewView (E-Learning 5E Summary & Progress)
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`rounded-3xl p-5 sm:p-7 bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-yellow-50/80 border-2 border-amber-200/90 shadow-sm relative overflow-hidden space-y-5 ${className}`}
    >
      {/* Decorative background glows */}
      <div className="absolute -top-12 -right-12 w-44 h-44 bg-amber-400/15 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-44 h-44 bg-rose-400/15 rounded-full blur-2xl pointer-events-none" />

      {/* Header Banner: Title & Level Badge */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 via-amber-300 to-yellow-200 text-amber-950 flex items-center justify-center font-black shadow-md shadow-amber-400/20 shrink-0 transform hover:scale-105 transition-transform">
            <Trophy className="w-6 h-6 text-amber-900 drop-shadow-xs" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base sm:text-lg font-black text-slate-900 font-heading tracking-tight">
                Huy Hiệu Tài Nguyên & Điểm Thưởng
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 text-[10px] font-black uppercase tracking-wider shadow-2xs border border-amber-200">
                Cấp {level} 🌟
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Hệ thống tích lũy Xu thưởng đổi quà và Bông hoa điểm 10 ghi nhận tiến độ học tập
            </p>
          </div>
        </div>

        {/* Milestone Badge Pill */}
        <div className="self-start sm:self-auto shrink-0">
          <span className={`px-3 py-1.5 rounded-full text-xs font-black border shadow-2xs inline-flex items-center gap-1.5 ${milestone.color}`}>
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
            <span>{milestone.badge}</span>
          </span>
        </div>
      </div>

      {/* Main 2 Highlight Resource Cards (Túi Xu & Hoa Điểm 10) */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* CARD 1: XU THƯỞNG / KIM CƯƠNG */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-4 sm:p-5 border border-amber-200 shadow-xs hover:shadow-md transition-all flex items-center justify-between gap-3 relative overflow-hidden group">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1.5 text-amber-800 font-extrabold text-xs">
              <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-black text-xs">
                🪙
              </span>
              <span>{coinsLabel}</span>
            </div>
            
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-amber-950 font-heading">
                {formattedCoins}
              </span>
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                Xu trong túi
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-medium pt-0.5">
              <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                <Gift className="w-3 h-3 text-amber-600" />
                <span>Đổi avatar & quà tại lớp</span>
              </span>
              {formattedBonus && (
                <span className="inline-flex items-center gap-0.5 text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>{formattedBonus} xu bài này!</span>
                </span>
              )}
            </div>
          </div>

          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500 text-white flex items-center justify-center text-3xl shadow-md shadow-amber-400/30 shrink-0 transform group-hover:scale-105 group-hover:rotate-3 transition-transform">
            🎁
          </div>
        </div>

        {/* CARD 2: BÔNG HOA ĐIỂM 10 & EXP */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-4 sm:p-5 border border-rose-200 shadow-xs hover:shadow-md transition-all flex items-center justify-between gap-3 relative overflow-hidden group">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1.5 text-rose-800 font-extrabold text-xs">
              <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xs">
                🌸
              </span>
              <span>{scoreLabel}</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-rose-950 font-heading">
                {scoreDisplay || `${score} / ${safeMax}`}
              </span>
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">
                điểm học tập
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-medium pt-0.5">
              <span className="inline-flex items-center gap-1 text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                <Flame className="w-3 h-3 text-purple-600" />
                <span>+{effectiveExp} EXP tăng cấp</span>
              </span>
              <span className="inline-flex items-center gap-0.5 text-rose-700 font-extrabold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                <Star className="w-3 h-3 text-rose-500 fill-rose-500" />
                <span>{pct >= 90 ? 'Hoa Điểm 10 Đỏ Thắm' : 'Hoa Học Tập'}</span>
              </span>
            </div>
          </div>

          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-br from-rose-400 via-pink-400 to-rose-500 text-white flex items-center justify-center text-3xl shadow-md shadow-rose-400/30 shrink-0 transform group-hover:scale-105 group-hover:-rotate-3 transition-transform">
            🌸
          </div>
        </div>

      </div>

      {/* PROGRESS BAR SECTION */}
      <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-2xl p-4 sm:p-5 border border-amber-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Tiến trình tích lũy:</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-300/80">
              {pct}% Mốc Thành Tích
            </span>
            {completedSteps !== undefined && totalSteps !== undefined && (
              <span className="text-slate-500 font-bold text-xs">
                ({completedSteps}/{totalSteps} bước 5E)
              </span>
            )}
          </div>

          <div className="text-[11px] sm:text-xs font-bold text-slate-600 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="italic">{milestone.text}</span>
          </div>
        </div>

        {/* Outer glowing progress track */}
        <div className="w-full h-4 sm:h-4.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-amber-200/90 shadow-inner relative">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-rose-400 to-emerald-500 rounded-full transition-all duration-700 ease-out shadow-xs relative flex items-center justify-end pr-1"
            style={{ width: `${Math.max(pct > 0 ? 5 : 0, pct)}%` }}
          >
            {/* Shimmer light bar */}
            <div className="absolute inset-0 bg-white/25 rounded-full animate-pulse" />
            {pct >= 15 && (
              <span className="relative z-10 text-[9px] font-black text-white drop-shadow-xs pr-1">
                ⭐
              </span>
            )}
          </div>
        </div>

        {/* Bottom Milestone Tiers Indicators */}
        <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-slate-500 text-center pt-0.5">
          <div className="flex flex-col items-center">
            <span className={`w-2 h-2 rounded-full mb-0.5 ${pct >= 25 ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <span>25% Khởi động</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`w-2 h-2 rounded-full mb-0.5 ${pct >= 50 ? 'bg-amber-500' : 'bg-slate-300'}`} />
            <span>50% Tiến bộ</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`w-2 h-2 rounded-full mb-0.5 ${pct >= 75 ? 'bg-rose-400' : 'bg-slate-300'}`} />
            <span>75% Về đích</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`w-2 h-2 rounded-full mb-0.5 ${pct >= 100 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-emerald-700 font-extrabold">100% Hoa Điểm 10 🌸</span>
          </div>
        </div>
      </div>
    </div>
  );
};
