/**
 * Unified Lesson Rating & Evaluation Service for 5E E-Learning Lessons
 * Single Source of Truth for both Teacher Management and Student View.
 *
 * Tiêu chuẩn kép đánh giá:
 * 1. Điều kiện cần (Tiến độ): Học sinh bắt buộc phải hoàn thành đủ 100% toàn bộ 5 bước của mô hình 5E
 *    (Khởi động, Khám phá, Luyện tập, Vận dụng, Đánh giá) thì mới được ghi nhận hoàn thành bài học.
 * 2. Điều kiện đủ (Chất lượng): Tính điểm tổng hợp từ các nội dung có câu hỏi tương tác (Luyện tập, Đánh giá):
 *    - Mức "Tốt / Hoàn thành tốt": Hoàn thành 100% tiến độ VÀ tổng điểm câu hỏi đạt từ 8.0 đến 10 điểm (≥ 80%).
 *    - Mức "Hoàn thành": Hoàn thành 100% tiến độ VÀ điểm số từ 5.0 đến 7.9 điểm.
 *    - Mức "Cần cố gắng": Hoàn thành 100% tiến độ nhưng điểm đánh giá dưới trung bình (< 5.0 điểm, kể cả 0 điểm).
 *    - Mức "Chưa hoàn thành": Chưa học xong ít nhất 1 hoạt động (< 5 bước hoàn thành).
 */

export type LessonRatingType = 'good' | 'pass' | 'need_effort' | 'not_started' | 'incomplete';

export interface LessonRatingEvaluation {
  rating: 'good' | 'pass' | 'need_effort' | 'not_started';
  label: 'Hoàn thành tốt' | 'Tốt' | 'Hoàn thành' | 'Cần cố gắng' | 'Chưa hoàn thành' | 'Chưa vào học';
  badgeText: string;
  icon: '🎯' | '👍' | '💪' | '⏳';
  score10: number | null; // 0.0 - 10.0
  score100: number | null; // 0 - 100
  completedStepsCount: number; // 0 - 5
  progressPct: number; // 0 - 100
  is5ECompleted: boolean;
  isQualityPass: boolean;
  activeBlockIndex: number; // 0 (Tốt / Hoàn thành tốt), 1 (Hoàn thành), 2 (Cần cố gắng / Chưa hoàn thành)
  reviewTitle: string;
  praiseTitle: string;
  praiseContent: string;
  isAtRisk: boolean; // low quiz score (< 5.0) or unstarted (0%)
}

/**
 * Extracts and aggregates quiz/test scores from progress data on a scale of 0 to 10
 */
export function extractQuizScore10(prog: any): number | null {
  if (!prog) return null;

  // Direct overall score if present
  if (typeof prog.overallScore === 'number' && !isNaN(prog.overallScore)) {
    return prog.overallScore > 10
      ? Math.round((prog.overallScore / 10) * 10) / 10
      : Math.round(prog.overallScore * 10) / 10;
  }
  if (typeof prog.score === 'number' && !isNaN(prog.score)) {
    return prog.score > 10
      ? Math.round((prog.score / 10) * 10) / 10
      : Math.round(prog.score * 10) / 10;
  }

  // Assessment score (scale 0-10)
  const assess = typeof prog?.assessment?.testScore === 'number' && !isNaN(prog.assessment.testScore)
    ? prog.assessment.testScore
    : (typeof prog?.assessment?.score === 'number' && !isNaN(prog.assessment.score)
        ? (prog.assessment.score > 10 ? prog.assessment.score / 10 : prog.assessment.score)
        : null);

  // Elaborate score (scale 0-10)
  const elab = typeof prog?.elaborate?.score === 'number' && !isNaN(prog.elaborate.score)
    ? (prog.elaborate.score > 10 ? prog.elaborate.score / 10 : prog.elaborate.score)
    : (typeof prog?.elaborate?.practiceScore === 'number' && !isNaN(prog.elaborate.practiceScore)
        ? (prog.elaborate.practiceScore > 10 ? prog.elaborate.practiceScore / 10 : prog.elaborate.practiceScore)
        : null);

  // Explore accuracy (scale 0-100% -> convert to 0-10)
  const explore = typeof prog?.exploreAccuracy === 'number' && !isNaN(prog.exploreAccuracy)
    ? prog.exploreAccuracy / 10
    : null;

  if (assess !== null && elab !== null) {
    return Math.round(((assess * 0.6) + (elab * 0.4)) * 10) / 10;
  }
  if (assess !== null) {
    return Math.round(assess * 10) / 10;
  }
  if (elab !== null) {
    return Math.round(elab * 10) / 10;
  }
  if (explore !== null) {
    return Math.round(explore * 10) / 10;
  }

  return null;
}

/**
 * Single source of truth for grading/ranking a student's 5E E-Learning lesson progress.
 * Enforces dual criteria:
 * 1. Necessary condition: 100% progress (completed all 5 steps)
 * 2. Sufficient condition: Quality test/quiz score (>= 8.0 for Hoàn thành tốt, 5.0 - 7.9 for Hoàn thành, < 5.0 for Cần cố gắng)
 */
export function evaluateStudentLessonRating(prog: any): LessonRatingEvaluation {
  const isEngageDone = Boolean(prog?.engageViewed);
  const isExploreDone = Boolean(prog?.exploreCompleted || typeof prog?.exploreAccuracy === 'number');
  const isElaborateDone = Boolean(prog?.elaborate?.isCompleted || typeof prog?.elaborate?.score === 'number' || typeof prog?.elaborate?.practiceScore === 'number');
  const isApplyDone = Boolean(prog?.apply?.isCompleted || prog?.apply?.isSubmitted || prog?.apply?.submittedQuestions);
  const isAssessmentDone = Boolean(prog?.assessment?.isCompleted || prog?.assessment?.isSubmitted || typeof prog?.assessment?.testScore === 'number' || typeof prog?.assessment?.score === 'number');

  const completedStepsCount = [
    isEngageDone,
    isExploreDone,
    isElaborateDone,
    isApplyDone,
    isAssessmentDone
  ].filter(Boolean).length;

  const progressPct = Math.round((completedStepsCount / 5) * 100);
  const is5ECompleted = completedStepsCount === 5;

  const score10 = extractQuizScore10(prog);
  const score100 = score10 !== null ? Math.round(score10 * 10) : null;

  // Case 1: Chưa vào học (0% tiến độ)
  if (completedStepsCount === 0 && progressPct === 0) {
    return {
      rating: 'not_started',
      label: 'Chưa vào học',
      badgeText: 'Chưa vào học',
      icon: '⏳',
      score10: null,
      score100: null,
      completedStepsCount: 0,
      progressPct: 0,
      is5ECompleted: false,
      isQualityPass: false,
      activeBlockIndex: 2,
      reviewTitle: 'CHƯA BẮT ĐẦU BÀI HỌC 📖',
      praiseTitle: 'Bắt đầu bài giảng 5E ngay hôm nay!',
      praiseContent: 'Hãy nhấp vào các bước bài giảng để bắt đầu trải nghiệm nội dung và hoạt động tương tác.',
      isAtRisk: true
    };
  }

  // Case 2: Mức "Chưa hoàn thành" : Hs chưa học xong 1 hoạt động (1 nội dung hs chưa tham gia học)
  if (completedStepsCount < 5) {
    return {
      rating: 'need_effort',
      label: 'Chưa hoàn thành',
      badgeText: `Chưa hoàn thành (${completedStepsCount}/5)`,
      icon: '⏳',
      score10,
      score100,
      completedStepsCount,
      progressPct,
      is5ECompleted: false,
      isQualityPass: false,
      activeBlockIndex: 2,
      reviewTitle: `CHƯA HOÀN THÀNH (${completedStepsCount}/5 HOẠT ĐỘNG) ⏳`,
      praiseTitle: 'Cố gắng hoàn thành đủ 5 hoạt động nhé em!',
      praiseContent: `Em còn ${5 - completedStepsCount} hoạt động chưa tham gia học (đã xong ${completedStepsCount}/5). Em cần hoàn thành đủ 100% cả 5 hoạt động để được ghi nhận hoàn thành bài học nhé!`,
      isAtRisk: false
    };
  }

  // Case 3: Đã hoàn thành 100% tiến độ (completedStepsCount === 5)
  // RÀNG BUỘC CHẤT LƯỢNG NGHIÊM NGẶT (ĐIỀU KIỆN ĐỦ):
  // 3.1. Mức "Tốt / Hoàn thành tốt": Hoàn thành 100% tiến độ VÀ tổng điểm câu hỏi đạt từ 8.0 đến 10 điểm (≥ 80%).
  if (score10 !== null && score10 >= 8.0) {
    return {
      rating: 'good',
      label: 'Hoàn thành tốt',
      badgeText: 'Hoàn thành tốt',
      icon: '🎯',
      score10,
      score100,
      completedStepsCount: 5,
      progressPct: 100,
      is5ECompleted: true,
      isQualityPass: true,
      activeBlockIndex: 0,
      reviewTitle: `HOÀN THÀNH TỐT 🎯 (${score10}đ)`,
      praiseTitle: 'Chúc mừng em đã hoàn thành tốt bài giảng 5E!',
      praiseContent: `Em đã hoàn thành trọn vẹn 100% cả 5 hoạt động học tập với kết quả xuất sắc (${score10}/10 điểm). Thầy/Cô khen ngợi tinh thần học tập tuyệt vời của em!`,
      isAtRisk: false
    };
  }

  // 3.2. Mức "Hoàn thành": Hoàn thành tiến độ nhưng điểm số từ 5.0 đến 7.9 điểm.
  if (score10 !== null && score10 >= 5.0) {
    return {
      rating: 'pass',
      label: 'Hoàn thành',
      badgeText: 'Hoàn thành',
      icon: '👍',
      score10,
      score100,
      completedStepsCount: 5,
      progressPct: 100,
      is5ECompleted: true,
      isQualityPass: true,
      activeBlockIndex: 1,
      reviewTitle: `HOÀN THÀNH 👍 (${score10}đ)`,
      praiseTitle: 'Em đã hoàn thành bài học và đạt yêu cầu!',
      praiseContent: `Em đã hoàn thành đủ 5/5 hoạt động học tập với kết quả đạt chuẩn (${score10}/10 điểm). Em có thể bấm "Học lại" để rèn luyện thêm và nâng cao điểm số nhé!`,
      isAtRisk: false
    };
  }

  // 3.3. Mức "Cần cố gắng": Hoàn thành tiến độ nhưng điểm kiểm tra đánh giá dưới trung bình (dưới 5.0 điểm).
  // Tuyệt đối KHÔNG gán nhãn "Tốt" hoặc "Đạt" khi điểm thấp hoặc 0 điểm!
  const finalLowScore = score10 ?? 0;
  return {
    rating: 'need_effort',
    label: 'Cần cố gắng',
    badgeText: 'Cần cố gắng',
    icon: '💪',
    score10: finalLowScore,
    score100: Math.round(finalLowScore * 10),
    completedStepsCount: 5,
    progressPct: 100,
    is5ECompleted: true,
    isQualityPass: false,
    activeBlockIndex: 2,
    reviewTitle: `CẦN CỐ GẮNG ÔN TẬP 💪 (${finalLowScore}đ)`,
    praiseTitle: 'CỐ GẮNG HƠN NỮA NHÉ EM!',
    praiseContent: `Em đã hoàn thành các bước bài học nhưng điểm số bài tập (${finalLowScore}/10 điểm) còn dưới trung bình. Em hãy bấm "Học lại bài giảng" để ôn tập kỹ lý thuyết và trả lời lại các câu hỏi nhé!`,
    isAtRisk: true // Cần kèm cặp / ôn tập thêm
  };
}
