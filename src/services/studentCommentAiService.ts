import { callGeminiApi } from './geminiService';
import { ExamPaper, HomeworkAssignment } from '../types';
import { getStudentExamSubmissions, isExamTypeMatch } from './hocBaDataService';
import { isSubjectMatch } from './studentSessionService';
import { normalizeStudentCode } from './studentCode';

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

/**
 * Danh sách từ khen cấm kỵ áp dụng cho học sinh mức Chưa hoàn thành (C / CHT)
 * Theo quy tắc kiểm soát từ vựng nghiêm ngặt (Anti-False Praise Rule)
 */
export const FORBIDDEN_C_WORDS = [
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
 * Kiểm tra chéo nhận xét AI với mức đánh giá (Self-Correction & Validation)
 */
export function validateCommentForLevel(
  commentText: string,
  level: 'T' | 'H' | 'C' | 'HT' | 'CHT'
): { valid: boolean; reason?: string } {
  const normLevel = level === 'CHT' || level === 'C' ? 'C' : level === 'HT' || level === 'H' ? 'H' : 'T';
  const textLower = (commentText || '').toLowerCase().trim();

  if (!textLower || textLower.length < 15) {
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
 * Mẫu nhận xét dự phòng (Fallback Templates) chuẩn Thông tư 27
 * Sử dụng khi AI không khả dụng hoặc sinh lỗi quá 2 lần
 */
export function getFallbackComment(
  params: StudentDataForCommentAI
): GeneratedCommentResult {
  const normLevel = params.evalLevel === 'CHT' || params.evalLevel === 'C' ? 'C' : params.evalLevel === 'HT' || params.evalLevel === 'H' ? 'H' : 'T';
  const scoreNum = typeof params.examScore === 'number' ? params.examScore : (parseFloat(String(params.examScore || '')) || 0);

  let fullComment = '';
  let strengths = '';
  let reminders = '';

  if (normLevel === 'T') {
    strengths = `Khen ngợi em ${params.studentName} đã hoàn thành xuất sắc các nội dung học tập và bài kiểm tra môn ${params.subject}. Em nắm chắc kiến thức bài học và làm bài rất cẩn thận.`;
    reminders = `Cần tiếp tục giữ vững phong độ học tập và tích cực phát huy trong các giờ học tiếp theo.`;
    fullComment = `${strengths} ${reminders}`;
  } else if (normLevel === 'H') {
    strengths = `Em ${params.studentName} đã hoàn thành các nội dung bài học và bài kiểm tra môn ${params.subject}.`;
    reminders = `Cần đọc kỹ đề bài và rèn luyện thêm kỹ năng tính toán, vận dụng để đạt kết quả cao hơn.`;
    fullComment = `${strengths} ${reminders}`;
  } else {
    // Level C / CHT
    const unsubText = params.unsubmittedCount && params.unsubmittedCount > 0 ? ` và hoàn thành ${params.unsubmittedCount} bài tập còn thiếu` : ' và làm lại các bài tập chưa đạt';
    const weakText = params.weakTopics ? ` ở nội dung ${params.weakTopics}` : '';
    strengths = `Em ${params.studentName} chưa nắm vững một số kiến thức cơ bản môn ${params.subject}${weakText}.`;
    reminders = `Cần tăng cường ôn tập lại bài học${unsubText}. Cô tin em sẽ tiến bộ hơn nếu kiên trì cố gắng.`;
    fullComment = `${strengths} ${reminders}`;
  }

  return {
    fullComment,
    strengths,
    reminders,
    correctCount: normLevel === 'T' ? 9 : normLevel === 'H' ? 7 : 4,
    totalQuestions: 10,
    overallDat: params.evalLevel,
    score: scoreNum || (normLevel === 'T' ? 9.0 : normLevel === 'H' ? 7.0 : 4.0),
    hasCommented: true,
    isManuallyEdited: false,
    isValidated: true,
    usedFallback: true
  };
}

/**
 * Xây dựng Prompt AI chi tiết chứa đầy đủ dữ liệu thực tế của học sinh
 */
export function buildStudentCommentPrompt(
  params: StudentDataForCommentAI,
  isRetry: boolean = false
): { prompt: string; systemInstruction: string } {
  const normLevel = params.evalLevel === 'CHT' || params.evalLevel === 'C' ? 'C' : params.evalLevel === 'HT' || params.evalLevel === 'H' ? 'H' : 'T';

  const systemInstruction = `Bạn là một giáo viên tiểu học Việt Nam tận tụy, ân cần. Hãy viết lời nhận xét sư phạm cá nhân hóa cho học sinh theo đúng tinh thần Thông tư 27/2020/TT-BGDĐT.
Yêu cầu nghiêm ngặt:
- Văn phong chuẩn mực sư phạm tiểu học, xưng "em", độ dài ngắn gọn 2-3 câu (khoảng 40-70 từ).
- Tuyệt đối căn cứ vào dữ liệu thực tế được cung cấp, không tự bịa thông tin.
- QUY TẮC GIỌNG VĂN THEO MỨC ĐÁNH GIÁ:
  + Mức Hoàn thành tốt (T): Khen ngợi cụ thể thành tích, ghi nhận điểm mạnh nổi bật, khuyến khích phát huy.
  + Mức Hoàn thành (H): Ghi nhận mặt đạt được, nêu nhẹ nhàng 1 điểm cần chú ý cẩn thận hoặc cố gắng hơn.
  + Mức Chưa hoàn thành (C): TUYỆT ĐỐI KHÔNG DÙNG TỪ KHEN CHUNG CHUNG ("xuất sắc", "tuyệt vời", "rất tốt", "nắm vững kiến thức", "tích cực", "chăm chỉ"). Nêu thẳng thắn nhưng nhẹ nhàng hạn chế (chưa nắm vững nội dung gì, nợ bao nhiêu bài), kèm hướng cải thiện cụ thể và lời động viên tiến bộ (ví dụ: "Em cần ôn lại... và hoàn thành các bài tập còn thiếu. Cô tin em sẽ tiến bộ nếu cố gắng hơn.").
  + Nếu chưa có dữ liệu bài làm: Viết "Chưa có đủ dữ liệu để nhận xét", không tự bịa.`;

  let retryWarning = '';
  if (isRetry && normLevel === 'C') {
    retryWarning = `\nCẢNH BÁO ĐẶC BIỆT: Lần tạo trước đã bị hệ thống từ chối do vi phạm Quy tắc chống khen sai (Anti-False Praise Rule). Bắt buộc KHÔNG ĐƯỢC dùng các từ khen: "xuất sắc", "tuyệt vời", "rất tốt", "nắm vững kiến thức", "tích cực", "chăm chỉ". Hãy tập trung chỉ ra thẳng thắn nhưng nhẹ nhàng hạn chế và hướng cải thiện!`;
  }

  const prompt = `DỮ LIỆU THỰC TẾ HỌC SINH:
- Họ và tên học sinh: ${params.studentName}
- Lớp: ${params.className}
- Môn học: ${params.subject}
- Đợt đánh giá: ${params.examType}
- Mức đánh giá môn: ${normLevel === 'T' ? 'Hoàn thành tốt (T)' : normLevel === 'H' ? 'Hoàn thành (H)' : 'Chưa hoàn thành (C)'}
- Điểm kiểm tra định kỳ: ${params.examScore !== undefined && params.examScore !== '' ? params.examScore : 'Chưa có'}
- Điểm trung bình bài tập rèn luyện: ${params.homeworkAvg !== undefined ? params.homeworkAvg : 'Chưa có'}
- Số bài tập đã nộp: ${params.completedCount !== undefined ? `${params.completedCount}/${params.assignedCount || 0} bài` : 'Chưa có dữ liệu'}
- Số bài tập chưa nộp (nợ bài): ${params.unsubmittedCount !== undefined ? `${params.unsubmittedCount} bài` : '0 bài'}
- Nội dung/câu hay sai: ${params.weakTopics || 'Không có ghi nhận lỗi sai đặc biệt'}
${retryWarning}

Hãy trả về phản hồi định dạng JSON hợp lệ chứa 3 trường:
{
  "strengths": "Nội dung ghi nhận mặt đạt được hoặc điểm mạnh...",
  "reminders": "Nội dung cần cố gắng, hướng cải thiện hoặc lời động viên...",
  "fullComment": "Lời nhận xét hoàn chỉnh 2-3 câu gộp cả mặt đạt được và lời nhắc cải thiện..."
}`;

  return { prompt, systemInstruction };
}

/**
 * Trích xuất dữ liệu thực tế từ hệ thống để truyền vào AI Prompt
 */
export function extractStudentMetricsForAI(
  st: any,
  subject: string,
  examType: string,
  exams: ExamPaper[],
  assignments: HomeworkAssignment[]
): StudentDataForCommentAI {
  const studentName = `${st.lastName || ''} ${st.firstName || ''}`.trim() || st.fullName || st.name || 'Học sinh';
  const className = st.className || 'Lớp 3A';

  // 1. Get Exam Submission
  const studentExamSubs = getStudentExamSubmissions({
    studentId: st.id,
    studentName,
    studentCode: st.code,
    exams
  });
  const matchedExam = studentExamSubs.find(ex =>
    isExamTypeMatch(ex.examType, ex.title, examType) && isSubjectMatch(ex.subject, subject)
  );

  const examScore = matchedExam ? (matchedExam.score !== undefined ? matchedExam.score : 8.0) : (st.commentDetail?.score !== undefined ? st.commentDetail.score : 'Chưa làm');

  // 2. Get Homework Assignments matching class & subject
  const classAssignments = (assignments || []).filter(as => {
    const matchesClass = !as.targetClass || as.targetClass.includes(className) || as.targetClass === 'Tất cả các lớp';
    const matchesSubj = isSubjectMatch(as.subject, subject);
    return matchesClass && matchesSubj;
  });

  const assignedCount = classAssignments.length;
  let completedCount = 0;
  let totalScoreSum = 0;
  const weakTopicsList: string[] = [];

  classAssignments.forEach(as => {
    const subs = Array.isArray(as.submissions) ? as.submissions : [];
    const userSub = subs.find((sub: any) => {
      const code = normalizeStudentCode(sub.studentCode || sub.code || sub.maHs || sub.studentId || '');
      return code === st.code || sub.studentName === studentName;
    });

    if (userSub) {
      completedCount++;
      const s = typeof userSub.score === 'number' ? userSub.score : (parseFloat(String(userSub.score || '')) || 0);
      totalScoreSum += s;

      if (userSub.answers && Array.isArray(userSub.answers) && as.questions) {
        userSub.answers.forEach((ans: any, qIdx: number) => {
          if (ans === 'fail' || ans === false || ans === 0) {
            const qContent = as.questions[qIdx]?.content;
            if (qContent && !weakTopicsList.includes(qContent)) {
              weakTopicsList.push(qContent.length > 30 ? qContent.substring(0, 30) + '...' : qContent);
            }
          }
        });
      }
    }
  });

  const unsubmittedCount = Math.max(0, assignedCount - completedCount);
  const homeworkAvg = completedCount > 0 ? Number((totalScoreSum / completedCount).toFixed(1)) : undefined;

  // 3. Determine Eval Level (T / H / C)
  let evalLevel: 'T' | 'H' | 'C' = 'H';
  const commentDat = st.commentDetail?.overallDat;
  const evalDat = st.evaluations ? st.evaluations[subject]?.dat : undefined;

  if (commentDat === 'T' || commentDat === 'HT' || evalDat === 'T') {
    evalLevel = 'T';
  } else if (commentDat === 'C' || commentDat === 'CHT' || evalDat === 'C' || evalDat === 'CHT') {
    evalLevel = 'C';
  } else if (typeof examScore === 'number') {
    evalLevel = examScore >= 8.5 ? 'T' : examScore >= 5.0 ? 'H' : 'C';
  }

  const weakTopics = weakTopicsList.length > 0 ? weakTopicsList.slice(0, 2).join(', ') : undefined;

  return {
    studentId: st.id,
    studentCode: st.code,
    studentName,
    className,
    subject,
    examType,
    evalLevel,
    examScore,
    homeworkAvg,
    completedCount,
    assignedCount,
    unsubmittedCount,
    weakTopics,
    testTitle: matchedExam?.title,
    isManuallyEdited: st.commentDetail?.isManuallyEdited || false
  };
}

/**
 * Hàm sinh nhận xét AI tự động cho 1 học sinh với cơ chế Self-Correction & Fallback
 */
export async function generateStudentCommentAI(
  params: StudentDataForCommentAI
): Promise<GeneratedCommentResult> {
  const normLevel = params.evalLevel === 'CHT' || params.evalLevel === 'C' ? 'C' : params.evalLevel === 'HT' || params.evalLevel === 'H' ? 'H' : 'T';

  // 1. Kiểm tra nếu học sinh chưa làm bài nào và không có điểm kiểm tra
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

  // 2. Thử gọi AI Lần 1
  try {
    const { prompt, systemInstruction } = buildStudentCommentPrompt(params, false);
    const aiResponseText = await callGeminiApi(prompt, systemInstruction, true);

    let parsed: any = null;
    try {
      const cleanJson = aiResponseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleanJson);
    } catch {}

    let fullComment = parsed?.fullComment || `${parsed?.strengths || ''} ${parsed?.reminders || ''}`.trim();
    let strengths = parsed?.strengths || '';
    let reminders = parsed?.reminders || '';

    if (!fullComment && aiResponseText) {
      fullComment = aiResponseText.trim();
      strengths = fullComment;
      reminders = '';
    }

    // 3. Kiểm tra chéo quy tắc chống khen sai (Anti-False Praise Rule)
    let validation = validateCommentForLevel(fullComment, params.evalLevel);

    // 4. Nếu vi phạm với mức C -> Thử gọi AI Lần 2 với yêu cầu nghiêm khắc hơn
    if (!validation.valid && normLevel === 'C') {
      console.warn(`[AI Comment Retry] ${params.studentName} vi phạm: ${validation.reason}. Gọi AI sinh lại...`);
      const retryPrompt = buildStudentCommentPrompt(params, true);
      const retryResponseText = await callGeminiApi(retryPrompt.prompt, retryPrompt.systemInstruction, true);

      try {
        const cleanRetryJson = retryResponseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const retryParsed = JSON.parse(cleanRetryJson);
        fullComment = retryParsed?.fullComment || `${retryParsed?.strengths || ''} ${retryParsed?.reminders || ''}`.trim();
        strengths = retryParsed?.strengths || strengths;
        reminders = retryParsed?.reminders || reminders;
      } catch {
        if (retryResponseText) {
          fullComment = retryResponseText.trim();
          strengths = fullComment;
        }
      }

      validation = validateCommentForLevel(fullComment, params.evalLevel);
    }

    // Nếu hợp lệ -> Trả về kết quả AI thành công
    if (validation.valid && fullComment) {
      const scoreNum = typeof params.examScore === 'number' ? params.examScore : (parseFloat(String(params.examScore || '')) || (normLevel === 'T' ? 9.0 : normLevel === 'H' ? 7.0 : 4.0));
      return {
        fullComment,
        strengths: strengths || fullComment,
        reminders: reminders || '',
        correctCount: normLevel === 'T' ? 9 : normLevel === 'H' ? 7 : 4,
        totalQuestions: 10,
        overallDat: params.evalLevel,
        score: scoreNum,
        hasCommented: true,
        isManuallyEdited: false,
        isValidated: true,
        usedFallback: false
      };
    }
  } catch (err) {
    console.warn(`[AI Comment Call Failed] Lỗi khi tạo nhận xét cho ${params.studentName}:`, err);
  }

  // 5. Nếu AI lỗi hoặc vẫn vi phạm sau 2 lần -> Áp dụng Mẫu nhận xét dự phòng (Fallback Template)
  return getFallbackComment(params);
}
