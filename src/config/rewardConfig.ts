import { addGameReward } from '../services/studentGameStoreService';

/**
 * CẤU HÌNH HỆ THỐNG PHẦN THƯỞNG XU & EXP TẬP TRUNG CHO TOÀN BỘ ỨNG DỤNG
 * Dễ dàng điều chỉnh cân bằng game tại một nơi duy nhất.
 */
export const REWARD_CONFIG = {
  // 1. Bài Tập Tự Luyện (Homework Assignment)
  ASSIGNMENT: {
    TIERS: [
      { minScore: 0, maxScore: 5.0, coins: 0, exp: 0, label: 'Dưới trung bình (< 5.0đ)' },
      { minScore: 5.0, maxScore: 8.0, coins: 5, exp: 2, label: 'Đạt yêu cầu (5.0 - 7.9đ)' },
      { minScore: 8.0, maxScore: 10.0, coins: 10, exp: 5, label: 'Giỏi / Xuất sắc (8.0 - 10.0đ)' }
    ]
  },

  // 2. Đề Kiểm Tra Đánh Giá (Exam Papers)
  EXAM: {
    TIERS: [
      { minScore: 0, maxScore: 5.0, coins: 0, exp: 0, label: 'Dưới trung bình (< 5.0đ)' },
      { minScore: 5.0, maxScore: 8.0, coins: 5, exp: 5, label: 'Đạt yêu cầu (5.0 - 7.9đ)' },
      { minScore: 8.0, maxScore: 10.0, coins: 10, exp: 10, label: 'Giỏi / Xuất sắc (8.0 - 10.0đ)' }
    ]
  },

  // 3. Đấu Trường Tri Thức (Interactive Game Arena)
  ARENA: {
    RANK_1: { coins: 100, exp: 20, label: 'Hạng 1' },
    RANK_2: { coins: 70, exp: 20, label: 'Hạng 2' },
    RANK_3: { coins: 50, exp: 20, label: 'Hạng 3' },
    PARTICIPATION: { coins: 20, exp: 10, label: 'Tham gia thi đấu' }
  },

  // 4. Bài Giảng E-Learning Chuẩn 5E
  ELEARNING_5E: {
    FIRST_COMPLETE_COINS: 30,
    FIRST_COMPLETE_EXP: 15,
    BONUS_EVALUATE_COINS: 10, // Thưởng thêm nếu bước Đánh giá (Evaluate) >= 8/10
    BONUS_EVALUATE_THRESHOLD: 8.0 // 8/10 điểm
  }
} as const;

// -------------------------------------------------------------
// HELPER METHODS: LƯU TRỮ VÀ KIỂM TRA TRẠNG THÁI "CHỈ THƯỞNG LẦN ĐẦU"
// -------------------------------------------------------------

export const getClaimedRewardsMap = (studentId: string = 'default'): Record<string, boolean> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`eduplay_claimed_rewards_${studentId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const hasClaimedReward = (
  studentId: string = 'default',
  category: 'assignment' | 'exam' | 'arena' | 'lesson',
  itemId: string
): boolean => {
  if (!itemId) return false;
  const map = getClaimedRewardsMap(studentId);
  return Boolean(map[`${category}:${itemId}`]);
};

export const markRewardClaimed = (
  studentId: string = 'default',
  category: 'assignment' | 'exam' | 'arena' | 'lesson',
  itemId: string
): void => {
  if (typeof window === 'undefined' || !itemId) return;
  try {
    const map = getClaimedRewardsMap(studentId);
    map[`${category}:${itemId}`] = true;
    localStorage.setItem(`eduplay_claimed_rewards_${studentId}`, JSON.stringify(map));
  } catch {}
};

// -------------------------------------------------------------
// CALCULATION & AWARDING ENGINES
// -------------------------------------------------------------

/**
 * 1. BÀI TẬP
 * - Điểm dưới trung bình (< 5.0đ): Không thưởng xu (0 Xu / 0 EXP), gửi lời khích lệ ôn tập thêm.
 * - Điểm đạt yêu cầu (5.0 - 7.9đ): Thưởng cơ bản (+5 Xu / +2 EXP).
 * - Điểm giỏi/xuất sắc (8.0 - 10.0đ): Thưởng cao (+10 Xu + 5 EXP thưởng nóng).
 */
export const calculateAssignmentReward = (
  correctCount: number, 
  totalQuestions: number, 
  customScoreOutOf10?: number
) => {
  const scoreOutOf10 = customScoreOutOf10 !== undefined
    ? Number(customScoreOutOf10)
    : (totalQuestions > 0 ? Number(((correctCount / totalQuestions) * 10).toFixed(1)) : 0);

  if (scoreOutOf10 < 5.0) {
    return {
      coins: 0,
      exp: 0,
      isBonus: false,
      score: scoreOutOf10,
      tier: 'below_average' as const,
      message: '💪 Cố gắng hoàn thành tốt hơn ở lần làm sau để nhận thưởng Xu nhé!'
    };
  }

  if (scoreOutOf10 < 8.0) {
    return {
      coins: 5,
      exp: 2,
      isBonus: false,
      score: scoreOutOf10,
      tier: 'pass' as const,
      message: '🎉 Bạn vừa nhận +5 Xu! Hãy tiếp tục rèn luyện để đạt điểm cao hơn nhé!'
    };
  }

  return {
    coins: 10,
    exp: 5,
    isBonus: true,
    score: scoreOutOf10,
    tier: 'excellent' as const,
    message: '🌟 Xuất sắc! Bạn vừa nhận +10 Xu và +5 EXP thưởng nóng!'
  };
};

export const awardAssignmentReward = (
  studentId: string,
  assignmentId: string,
  assignmentTitle: string,
  correctCount: number,
  totalQuestions: number,
  customScoreOutOf10?: number
): { awarded: boolean; coins: number; exp: number; isBonus: boolean; message: string; tier: string } | null => {
  if (hasClaimedReward(studentId, 'assignment', assignmentId)) {
    return null;
  }

  const { coins, exp, isBonus, tier, message } = calculateAssignmentReward(correctCount, totalQuestions, customScoreOutOf10);

  if (coins > 0 || exp > 0) {
    addGameReward(exp, coins, `Bài tập: ${assignmentTitle}`, message);
    markRewardClaimed(studentId, 'assignment', assignmentId);
  } else {
    // Khi dưới trung bình (< 5.0đ), hiển thị thông báo khích lệ nhẹ nhàng thay vì popup thưởng nóng
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('eduplay_reward_toast', {
          detail: {
            coinsEarned: 0,
            expEarned: 0,
            reason: `Bài tập: ${assignmentTitle}`,
            message: message || '💪 Cố gắng hoàn thành tốt hơn ở lần làm sau để nhận thưởng Xu nhé!',
            isEncouragement: true
          }
        })
      );
    }
  }

  return { awarded: coins > 0 || exp > 0, coins, exp, isBonus, message, tier };
};

/**
 * 2. ĐỀ KIỂM TRA
 * - Điểm dưới trung bình (< 5.0đ): Không thưởng xu (0 Xu / 0 EXP), gửi lời khích lệ ôn tập thêm.
 * - Điểm đạt yêu cầu (5.0 - 7.9đ): Thưởng cơ bản (+5 Xu / +5 EXP).
 * - Điểm giỏi/xuất sắc (8.0 - 10.0đ): Thưởng cao (+10 Xu + 10 EXP thưởng nóng).
 */
export const calculateExamReward = (scoreOutOf10: number) => {
  const numericScore = Number(scoreOutOf10) || 0;

  if (numericScore < 5.0) {
    return {
      coins: 0,
      exp: 0,
      tier: 'below_average' as const,
      message: '💪 Cố gắng hoàn thành tốt hơn ở lần làm sau để nhận thưởng Xu nhé!'
    };
  }

  if (numericScore < 8.0) {
    return {
      coins: 5,
      exp: 5,
      tier: 'pass' as const,
      message: '🎉 Bạn vừa nhận +5 Xu! Cố gắng phát huy ở các bài kiểm tra tiếp theo!'
    };
  }

  return {
    coins: 10,
    exp: 10,
    tier: 'excellent' as const,
    message: '🌟 Xuất sắc! Bạn vừa nhận +10 Xu và +10 EXP thưởng nóng!'
  };
};

export const awardExamReward = (
  studentId: string,
  examId: string,
  examTitle: string,
  scoreOutOf10: number
): { awarded: boolean; coins: number; exp: number; message: string; tier: string } | null => {
  if (hasClaimedReward(studentId, 'exam', examId)) {
    return null;
  }

  const { coins, exp, tier, message } = calculateExamReward(scoreOutOf10);

  if (coins > 0 || exp > 0) {
    addGameReward(exp, coins, `Đề kiểm tra: ${examTitle}`, message);
    markRewardClaimed(studentId, 'exam', examId);
  } else {
    // Khi dưới trung bình (< 5.0đ), hiển thị thông báo khích lệ nhẹ nhàng thay vì popup thưởng nóng
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('eduplay_reward_toast', {
          detail: {
            coinsEarned: 0,
            expEarned: 0,
            reason: `Đề kiểm tra: ${examTitle}`,
            message: message || '💪 Cố gắng hoàn thành tốt hơn ở lần làm sau để nhận thưởng Xu nhé!',
            isEncouragement: true
          }
        })
      );
    }
  }

  return { awarded: coins > 0 || exp > 0, coins, exp, message, tier };
};

/**
 * 3. ĐẤU TRƯỜNG TRI THỨC
 * Hạng 1: +100 Xu / +20 EXP
 * Hạng 2: +70 Xu / +20 EXP
 * Hạng 3: +50 Xu / +20 EXP
 * Tham gia không đạt hạng: +20 Xu / +10 EXP
 * Mỗi phòng thi đấu chỉ tính thưởng 1 lần cho mỗi học sinh.
 */
export const calculateArenaReward = (rank: number | 'unranked' | string) => {
  if (rank === 1 || rank === '1') {
    return { coins: REWARD_CONFIG.ARENA.RANK_1.coins, exp: REWARD_CONFIG.ARENA.RANK_1.exp };
  } else if (rank === 2 || rank === '2') {
    return { coins: REWARD_CONFIG.ARENA.RANK_2.coins, exp: REWARD_CONFIG.ARENA.RANK_2.exp };
  } else if (rank === 3 || rank === '3') {
    return { coins: REWARD_CONFIG.ARENA.RANK_3.coins, exp: REWARD_CONFIG.ARENA.RANK_3.exp };
  }
  return { coins: REWARD_CONFIG.ARENA.PARTICIPATION.coins, exp: REWARD_CONFIG.ARENA.PARTICIPATION.exp };
};

export const awardArenaReward = (
  studentId: string,
  gameId: string,
  gameTitle: string,
  rank: number | 'unranked' | string
): { awarded: boolean; coins: number; exp: number } | null => {
  if (hasClaimedReward(studentId, 'arena', gameId)) {
    return null;
  }

  const { coins, exp } = calculateArenaReward(rank);
  addGameReward(exp, coins, `Đấu trường: ${gameTitle}`);
  markRewardClaimed(studentId, 'arena', gameId);

  return { awarded: true, coins, exp };
};

/**
 * 4. BÀI GIẢNG E-LEARNING (CHUẨN 5E)
 * +30 Xu / +15 EXP khi hoàn thành đủ 5 bước lần đầu tiên.
 * Bonus +10 Xu nếu điểm bước Evaluate >= 8/10.
 * Học lại không nhận thêm thưởng.
 */
export const calculateELearningReward = (evaluateScoreOutOf10?: number) => {
  const isBonus = evaluateScoreOutOf10 !== undefined && evaluateScoreOutOf10 >= REWARD_CONFIG.ELEARNING_5E.BONUS_EVALUATE_THRESHOLD;
  const coins = isBonus 
    ? REWARD_CONFIG.ELEARNING_5E.FIRST_COMPLETE_COINS + REWARD_CONFIG.ELEARNING_5E.BONUS_EVALUATE_COINS 
    : REWARD_CONFIG.ELEARNING_5E.FIRST_COMPLETE_COINS;
  const exp = REWARD_CONFIG.ELEARNING_5E.FIRST_COMPLETE_EXP;

  return { coins, exp, isBonus };
};

export const awardELearningReward = (
  studentId: string,
  lessonId: string,
  lessonTitle: string,
  evaluateScoreOutOf10?: number
): { awarded: boolean; coins: number; exp: number; isBonus: boolean } | null => {
  if (hasClaimedReward(studentId, 'lesson', lessonId)) {
    return null;
  }

  const { coins, exp, isBonus } = calculateELearningReward(evaluateScoreOutOf10);
  addGameReward(exp, coins, `Bài giảng E-Learning: ${lessonTitle}`);
  markRewardClaimed(studentId, 'lesson', lessonId);

  return { awarded: true, coins, exp, isBonus };
};
