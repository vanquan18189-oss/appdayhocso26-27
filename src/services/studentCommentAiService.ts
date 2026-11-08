import { QuestionItem } from '../types';
import { db } from './firebase';
import { collection, getDocs, doc, writeBatch, setDoc } from 'firebase/firestore';
import { normalizeStudentCode } from './studentCode';
import { checkQuestionCorrectLocal } from '../components/modules/StudentExamModule';

export interface StudentDataForCommentAI {
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  subject: string;
  examType: string;
  evalLevel: 'T' | 'H' | 'C' | 'HT' | 'CHT';
  examScore?: number | string;
  homeworkAvg?: number | string;
  completedCount?: number;
  assignedCount?: number;
  unsubmittedCount?: number;
  weakTopics?: string;
  testTitle?: string;
  isManuallyEdited?: boolean;
}

export interface GeneratedCommentResult {
  fullComment: string;
  strengths: string;
  reminders: string;
  correctCount: number;
  totalQuestions: number;
  overallDat: 'T' | 'H' | 'C' | 'HT' | 'CHT';
  score: number;
  hasCommented: boolean;
  isManuallyEdited: boolean;
  isValidated: boolean;
  usedFallback: boolean;
}

export function extractStudentMetricsForAI(
  st: any,
  subject: string,
  examType: string,
  exams: any[],
  assignments: any[]
): StudentDataForCommentAI {
  const code = normalizeStudentCode(st.code || st.studentCode || st.maHs || st.id || '');
  const name = st.fullName || st.name || `${st.lastName || ''} ${st.firstName || ''}`.trim() || 'Học sinh';
  const className = st.className || '';
  const evalLevel = st.evaluations?.[subject]?.dat || 'H';
  const scoreVal = st.commentDetail?.score !== undefined ? st.commentDetail.score : (st.evaluations?.[subject]?.score ? parseFloat(st.evaluations[subject].score) : 8);

  return {
    studentId: st.id || code,
    studentCode: code,
    studentName: name,
    className,
    subject,
    examType,
    evalLevel,
    examScore: scoreVal,
    homeworkAvg: scoreVal,
    completedCount: 1,
    assignedCount: 1,
    unsubmittedCount: 0,
    testTitle: `${examType} - Môn ${subject}`
  };
}

export interface RuleBasedCommentResult {
  fullComment: string;
  commentLevel: 'T' | 'H' | 'C';
  strengths: string;
  reminders: string;
  correctCount: number;
  totalQuestions: number;
  score: number;
  isManuallyEdited: boolean;
}

/**
 * Danh sách từ khen cấm kỵ áp dụng cho học sinh mức Chưa hoàn thành (C / CHT / Cần Ôn Lại)
 * Theo quy tắc kiểm soát từ vựng nghiêm ngặt (Anti-False Praise Rule)
 */
export const FORBIDDEN_C_WORDS = [
  'khen ngợi',
  'khen',
  'xuất sắc',
  'tuyệt vời',
  'rất tốt',
  'nắm vững kiến thức',
  'nắm vững',
  'tích cực',
  'chăm chỉ',
  'hoàn thành xuất sắc',
  'rất chăm',
  'rất chủ động',
  'kết quả cao',
  'làm bài rất tốt'
] as const;

/**
 * Kiểm tra chéo nhận xét với mức đánh giá
 */
export function validateCommentForLevel(
  commentText: string,
  level: 'T' | 'H' | 'C' | 'HT' | 'CHT'
): { valid: boolean; reason?: string } {
  const normLevel = level === 'CHT' || level === 'C' ? 'C' : level === 'HT' || level === 'H' ? 'H' : 'T';
  const textLower = (commentText || '').toLowerCase().trim();

  if (!textLower || textLower.length < 10) {
    return { valid: false, reason: 'Nội dung nhận xét quá ngắn' };
  }

  if (normLevel === 'C') {
    for (const forbiddenWord of FORBIDDEN_C_WORDS) {
      if (textLower.includes(forbiddenWord)) {
        return {
          valid: false,
          reason: `Phát hiện từ khen cấm kỵ với mức Chưa hoàn thành (C): "${forbiddenWord}"`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Trích xuất thứ tự câu hỏi ngắn gọn theo dạng:
 * - <= 6 câu: "2, 5, 8"
 * - > 6 câu: "1, 2, 3 và 4 câu khác"
 */
export function formatQuestionNumbersList(nums: number[]): string {
  if (!nums || nums.length === 0) return '';
  if (nums.length <= 6) return nums.join(', ');
  const first3 = nums.slice(0, 3).join(', ');
  const remaining = nums.length - 3;
  return `${first3} và ${remaining} câu khác`;
}

/**
 * Trích xuất chủ đề các câu hỏi bị làm sai
 * Lấy từ q.topic, q.lessonTopic, q.category, q.skill.
 * Loại bỏ các từ khóa mặc định/trùng tên bài (Công nghệ, Tin học, Đề kiểm tra, v.v.).
 * Nếu không có chủ đề hợp lệ, trả về chuỗi rỗng "".
 */
export function extractIncorrectQuestionTopics(questions: any[], incorrectNums: number[]): string {
  if (!Array.isArray(questions) || questions.length === 0 || !incorrectNums || incorrectNums.length === 0) {
    return '';
  }
  const rawTopics: string[] = [];
  const ignoredKeywords = [
    'bài tập', 'đề kiểm tra', 'bài làm', 'chưa chính xác', 'cần chú ý',
    'công nghệ', 'tin học', 'toán', 'tiếng việt', 'lớp', 'kiểm tra', 'nội dung bài'
  ];

  incorrectNums.forEach(num => {
    const q = questions[num - 1];
    if (q) {
      const t = (q.topic || (q as any).lessonTopic || (q as any).category || (q as any).skill || '').trim();
      if (t && t.length > 2) {
        const lower = t.toLowerCase();
        const isIgnored = ignoredKeywords.some(kw => lower === kw || lower.includes('đề kiểm tra'));
        if (!isIgnored && !rawTopics.includes(t)) {
          rawTopics.push(t);
        }
      }
    }
  });

  if (rawTopics.length === 0) return '';
  if (rawTopics.length <= 2) return rawTopics.join(', ');
  return `${rawTopics.slice(0, 2).join(', ')} và các nội dung liên quan`;
}

/**
 * HÀM CHÍNH: Sinh Nhận xét chung chuẩn Rule-based cho bài kiểm tra (Không dùng AI sinh văn).
 * Đảm bảo tốc độ, chính xác tuyệt đối, không phát sinh phí / lỗi.
 */
export function generateRuleBasedExamComment(params: {
  score?: number | string | null;
  questions?: any[];
  answers?: any;
  studentName?: string;
  subject?: string;
  isManuallyEdited?: boolean;
  existingComment?: string;
}): RuleBasedCommentResult {
  // Nếu nhận xét đã được giáo viên chỉnh sửa thủ công -> Giữ nguyên vẹn
  if (params.isManuallyEdited && params.existingComment && params.existingComment.trim().length > 0) {
    const sNum = typeof params.score === 'number' ? params.score : (parseFloat(String(params.score || '')) || 0);
    const lvl: 'T' | 'H' | 'C' = sNum >= 9.0 ? 'T' : sNum >= 5.0 ? 'H' : 'C';
    return {
      fullComment: params.existingComment.trim(),
      commentLevel: lvl,
      strengths: params.existingComment.trim(),
      reminders: '',
      correctCount: 0,
      totalQuestions: params.questions?.length || 10,
      score: sNum,
      isManuallyEdited: true
    };
  }

  const rawScore = params.score;
  const questions = params.questions || [];
  const totalQuestions = questions.length > 0 ? questions.length : 10;

  if (
    rawScore === undefined ||
    rawScore === null ||
    rawScore === '-' ||
    rawScore === 'Chưa làm' ||
    rawScore === 'Chưa có'
  ) {
    return {
      fullComment: 'Chưa có đủ dữ liệu để nhận xét.',
      commentLevel: 'C',
      strengths: 'Chưa có đủ dữ liệu bài làm.',
      reminders: 'Cần hoàn thành bài kiểm tra để giáo viên đánh giá.',
      correctCount: 0,
      totalQuestions,
      score: 0,
      isManuallyEdited: false
    };
  }

  const scoreNum = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore));
  if (isNaN(scoreNum)) {
    return {
      fullComment: 'Chưa có đủ dữ liệu để nhận xét.',
      commentLevel: 'C',
      strengths: 'Chưa có đủ dữ liệu bài làm.',
      reminders: 'Cần hoàn thành bài kiểm tra để giáo viên đánh giá.',
      correctCount: 0,
      totalQuestions,
      score: 0,
      isManuallyEdited: false
    };
  }

  // Xác định các câu đúng và sai (1-based index)
  const correctQuestionNums: number[] = [];
  const incorrectQuestionNums: number[] = [];

  const rawAnswers = params.answers;
  questions.forEach((q, idx) => {
    const qNum = idx + 1;
    let choice: any = undefined;

    if (Array.isArray(rawAnswers)) {
      choice = rawAnswers[idx];
    } else if (rawAnswers && typeof rawAnswers === 'object') {
      choice = rawAnswers[idx] !== undefined ? rawAnswers[idx] : (rawAnswers[String(idx)] !== undefined ? rawAnswers[String(idx)] : (q.id ? rawAnswers[q.id] : undefined));
    }

    let isCorrect = false;
    if (choice === 'pass' || choice === true || choice === 'correct') {
      isCorrect = true;
    } else if (choice === 'fail' || choice === false || choice === 'incorrect') {
      isCorrect = false;
    } else if (q && choice !== undefined && choice !== null && choice !== '') {
      try {
        isCorrect = checkQuestionCorrectLocal(q, choice);
      } catch {
        isCorrect = false;
      }
    }

    if (isCorrect) {
      correctQuestionNums.push(qNum);
    } else {
      incorrectQuestionNums.push(qNum);
    }
  });

  const correctCount = correctQuestionNums.length;

  const correctStr = formatQuestionNumbersList(correctQuestionNums);
  const incorrectStr = formatQuestionNumbersList(incorrectQuestionNums);
  const topicsStr = extractIncorrectQuestionTopics(questions, incorrectQuestionNums);

  let commentLevel: 'T' | 'H' | 'C' = 'H';
  let fullComment = '';
  let strengths = '';
  let reminders = '';

  if (scoreNum >= 9.0) {
    commentLevel = 'T';
    strengths = `Em hoàn thành tốt bài kiểm tra, đúng ${correctCount}/${totalQuestions} câu.`;
    if (correctStr) {
      strengths += ` Em làm tốt các câu ${correctStr}.`;
    }
    reminders = `Em hãy tiếp tục phát huy và giúp đỡ các bạn nhé.`;
    fullComment = `${strengths} ${reminders}`;
  } else if (scoreNum >= 5.0) {
    commentLevel = 'H';
    strengths = `Em hoàn thành bài kiểm tra, đúng ${correctCount}/${totalQuestions} câu.`;
    if (correctStr) {
      strengths += ` Em làm tốt các câu ${correctStr}.`;
    }
    if (incorrectStr) {
      reminders = `Em cần xem lại các câu ${incorrectStr} để nắm chắc hơn.`;
    } else {
      reminders = `Em tiếp tục rèn luyện để đạt kết quả cao hơn.`;
    }
    fullComment = `${strengths} ${reminders}`;
  } else {
    // Level C (< 5.0 / Chưa hoàn thành / Cần Ôn Lại)
    // TUYỆT ĐỐI KHÔNG DÙNG TỪ "Khen ngợi", "xuất sắc", "rất tốt"
    commentLevel = 'C';
    strengths = `Em đúng ${correctCount}/${totalQuestions} câu, bài làm chưa đạt yêu cầu.`;
    if (incorrectStr && topicsStr) {
      reminders = `Em cần xem lại các câu ${incorrectStr} và ôn lại nội dung ${topicsStr}. Cô tin em sẽ tiến bộ nếu em cố gắng hơn.`;
    } else if (incorrectStr) {
      reminders = `Em cần xem lại các câu ${incorrectStr}. Cô tin em sẽ tiến bộ nếu em cố gắng hơn.`;
    } else {
      reminders = `Em cần xem lại các câu bài làm chưa chính xác. Cô tin em sẽ tiến bộ nếu em cố gắng hơn.`;
    }
    fullComment = `${strengths} ${reminders}`;
  }

  return {
    fullComment: fullComment.trim(),
    commentLevel,
    strengths: strengths.trim(),
    reminders: reminders.trim(),
    correctCount,
    totalQuestions,
    score: scoreNum,
    isManuallyEdited: false
  };
}

/**
 * Tái tạo nhận xét tổng hợp môn học cho Học Bạ Số theo đúng 3 mức T, H, C
 */
export function generateSubjectSummaryCommentRuleBased(params: {
  studentName: string;
  subject: string;
  overallLevel: 'T' | 'H' | 'C' | 'HT' | 'CHT';
  examScore?: number;
  homeworkAvg?: number;
  completedCount?: number;
  assignedCount?: number;
  weakTopics?: string;
}): string {
  const normLevel = params.overallLevel === 'CHT' || params.overallLevel === 'C' ? 'C' : params.overallLevel === 'HT' || params.overallLevel === 'H' ? 'H' : 'T';

  if (normLevel === 'T') {
    return `Em ${params.studentName} hoàn thành tốt các nội dung học tập môn ${params.subject}. Em tiếp tục phát huy thành tích học tập và giúp đỡ các bạn nhé.`;
  } else if (normLevel === 'H') {
    return `Em ${params.studentName} hoàn thành các nội dung học tập môn ${params.subject}. Em cần đọc kỹ đề bài và rèn luyện thêm kỹ năng vận dụng để đạt kết quả cao hơn.`;
  } else {
    const weakText = params.weakTopics ? ` ở nội dung ${params.weakTopics}` : '';
    return `Em ${params.studentName} chưa đạt yêu cầu một số kiến thức môn ${params.subject}${weakText}. Em cần tăng cường ôn tập lại bài học và hoàn thành đầy đủ bài tập được giao. Cô tin em sẽ tiến bộ nếu em cố gắng hơn.`;
  }
}

/**
 * Hàm sinh nhận xét AI tự động cho Học Bạ Số (Giữ tương thích ngược)
 */
export async function generateStudentCommentAI(
  params: StudentDataForCommentAI
): Promise<GeneratedCommentResult> {
  const normLevel = params.evalLevel === 'CHT' || params.evalLevel === 'C' ? 'C' : params.evalLevel === 'HT' || params.evalLevel === 'H' ? 'H' : 'T';

  if (
    params.examScore === 'Chưa làm' &&
    (!params.completedCount || params.completedCount === 0) &&
    (!params.assignedCount || params.assignedCount === 0)
  ) {
    return {
      fullComment: 'Chưa có đủ dữ liệu để nhận xét.',
      strengths: 'Chưa có đủ dữ liệu bài làm.',
      reminders: 'Cần hoàn thành các bài tập được giao để giáo viên đánh giá.',
      correctCount: 0,
      totalQuestions: 10,
      overallDat: params.evalLevel,
      score: 0,
      hasCommented: true,
      isManuallyEdited: false,
      isValidated: true,
      usedFallback: false
    };
  }

  const res = generateRuleBasedExamComment({
    score: params.examScore,
    studentName: params.studentName,
    subject: params.subject,
    isManuallyEdited: params.isManuallyEdited
  });

  return {
    fullComment: res.fullComment,
    strengths: res.strengths,
    reminders: res.reminders,
    correctCount: res.correctCount,
    totalQuestions: res.totalQuestions,
    overallDat: res.commentLevel,
    score: res.score,
    hasCommented: true,
    isManuallyEdited: false,
    isValidated: true,
    usedFallback: false
  };
}

/**
 * Cập nhật nhận xét cũ hàng loạt (Batch Update Old Comments)
 * Tái tạo nhận xét chuẩn Rule-based cho toàn bộ bài kiểm tra cũ có lỗi văn bản hoặc sai mức.
 * Bỏ qua bài làm có isManuallyEdited === true.
 */
export async function batchUpdateOldExamComments(progressCallback?: (msg: string) => void): Promise<{ totalScanned: number; totalUpdated: number }> {
  let totalScanned = 0;
  let totalUpdated = 0;

  progressCallback?.('Đang chuẩn bị quét toàn bộ bài kiểm tra cũ...');

  // Helper check if comment requires update
  const needsUpdate = (sub: any): boolean => {
    if (sub?.isManuallyEdited) return false;
    const scoreNum = typeof sub?.score === 'number' ? sub.score : (parseFloat(String(sub?.score || sub?.totalScore || '')) || 0);
    const comment = String(sub?.generalComment || sub?.comment || sub?.teacherComment || '').trim();

    if (!comment) return true;
    if (scoreNum < 5 && (comment.toLowerCase().includes('khen ngợi') || comment.toLowerCase().includes('khen'))) return true;
    if (comment.includes('ở Cần chú ý') || comment.includes('ở Cần ôn lại')) return true;
    if (comment.includes('Đề kiểm tra') || comment.includes('ĐỀ KIỂM TRA')) return true;
    if (scoreNum < 5 && sub?.commentLevel && sub.commentLevel !== 'C') return true;
    if (scoreNum >= 9 && sub?.commentLevel && sub.commentLevel !== 'T') return true;

    return false;
  };

  // 1. Quét LocalStorage caches
  if (typeof window !== 'undefined') {
    try {
      progressCallback?.('Đang quét và tái tạo nhận xét trong bộ nhớ đệm cục bộ...');
      const keys = Object.keys(localStorage).filter(k => k.startsWith('eduplay_exam_subs_') || k === 'eduplay_all_exam_submissions');
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            let modified = false;
            const newList = list.map((item: any) => {
              totalScanned++;
              if (needsUpdate(item)) {
                totalUpdated++;
                modified = true;
                const newCommentRes = generateRuleBasedExamComment({
                  score: item.score ?? item.totalScore,
                  questions: item.questions || item.questionSnapshot,
                  answers: item.answers,
                  studentName: item.studentName || item.name,
                  subject: item.subject
                });
                return {
                  ...item,
                  generalComment: newCommentRes.fullComment,
                  commentLevel: newCommentRes.commentLevel,
                  isManuallyEdited: false
                };
              }
              return item;
            });
            if (modified) {
              localStorage.setItem(k, JSON.stringify(newList));
            }
          }
        }
      }
    } catch (err) {
      console.warn('Lỗi quét LocalStorage cho batch update comments:', err);
    }
  }

  // 2. Quét Firestore nếu khả dụng
  if (db) {
    try {
      progressCallback?.('Đang quét tài liệu đề thi và bài làm trên Firestore...');
      const examsSnap = await getDocs(collection(db, 'exams'));
      for (const examDoc of examsSnap.docs) {
        const examData = examDoc.data();
        const subsCol = collection(db, 'exams', examDoc.id, 'submissions');
        const subsSnap = await getDocs(subsCol);

        let batch = writeBatch(db);
        let batchCount = 0;

        for (const subDoc of subsSnap.docs) {
          totalScanned++;
          const subData = subDoc.data();
          if (needsUpdate(subData)) {
            totalUpdated++;
            const newCommentRes = generateRuleBasedExamComment({
              score: subData.score ?? subData.totalScore,
              questions: subData.questions || subData.questionSnapshot || examData.questions || examData.questionSnapshot,
              answers: subData.answers,
              studentName: subData.studentName || subData.name,
              subject: subData.subject || examData.subject
            });

            batch.update(subDoc.ref, {
              generalComment: newCommentRes.fullComment,
              commentLevel: newCommentRes.commentLevel,
              isManuallyEdited: false,
              updatedAt: new Date().toISOString()
            });
            batchCount++;

            if (batchCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }
      }
    } catch (err) {
      console.warn('Lỗi quét Firestore cho batch update comments:', err);
    }
  }

  // 3. Dispatch real-time update event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('student-data-updated'));
  }

  progressCallback?.(`Đã cập nhật thành công ${totalUpdated} bài nhận xét cũ trên tổng số ${totalScanned} bài quét.`);
  return { totalScanned, totalUpdated };
}
