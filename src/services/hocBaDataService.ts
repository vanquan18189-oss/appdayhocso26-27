import { ExamPaper, HomeworkAssignment, Lesson5EPlan, GameItem, StudentRecord } from '../types';
import { getSubjectsForClassOrGrade, SchoolClassItem } from './classStorageService';
import { getStudentAssignedSubjects, isSubjectMatch } from './studentSessionService';
import { getCurrentActiveAcademicYear, getStudentClassInfo } from './studentStorageService';
import { formatScore, roundTotalScore, formatTotalScore, getCurrentSubmissionTimestamp, formatSubmissionDateTime } from '../utils/scoreUtils';

export { formatScore, roundTotalScore, formatTotalScore, getCurrentSubmissionTimestamp, formatSubmissionDateTime };

/**
 * ============================================================================
 * HẰNG SỐ CẤU HÌNH TRỌNG SỐ TÍNH ĐIỂM HỌC BẠ SỐ (DỄ DÀNG CHỈNH SỬA)
 * ============================================================================
 * 1. Đề Kiểm Tra Định Kỳ: 60% (Trọng số cao nhất)
 * 2. Bài Tập Tự Luyện: 25% (Trọng số trung bình)
 * 3. Bài Giảng E-Learning (bước Đánh giá 5E): 15% (Trọng số trung bình - thấp)
 * Lưu ý: Module "Đấu Trường Tri Thức" KHÔNG đưa vào GPA, chỉ tính Hoa điểm 10.
 */
export const SCORE_WEIGHTS = {
  EXAM: 0.60,      // 60% Đề Kiểm Tra Định Kỳ
  HOMEWORK: 0.25,  // 25% Bài Tập
  LESSON: 0.15     // 15% Bài Giảng E-Learning 5E
} as const;

export interface SubjectScoreBreakdown {
  subject: string;
  shortName: string;
  score: number | null;
  level: string;
  status: 'T' | 'H' | 'CHT';
  note: string;
  // Chi tiết từng nguồn dữ liệu (phục vụ minh bạch và cố vấn AI)
  examScore: number | null;
  homeworkScore: number | null;
  lessonScore: number | null;
  hasRealData: boolean;
  sourceCount: number;
}

export interface StudentAttendanceMetrics {
  hasData: boolean;
  homeworkCompleted: number;
  homeworkTotal: number;
  homeworkRate: number | null;
  lessonsCompleted: number;
  lessonsTotal: number;
  lessonRate: number | null;
  overallRate: number | null;
  statusText: string;
}

export interface StudentHocBaSummary {
  studentId: string;
  studentName: string;
  className: string;
  gpa: number | null;
  gpaLabel: string;
  hasData: boolean;
  evaluatedSubjectsCount: number;
  totalSubjectsCount: number;
  hoaDiem10Count: number;
  hoaDiem10HomeworkList?: Array<{ id: string; title: string; score: number; subject: string; submittedTime: string }>;
  hoaDiem10ExamList?: Array<{ id: string; title: string; score: number; subject: string; submittedTime: string }>;
  subjects: SubjectScoreBreakdown[];
  examsCompletedCount?: number;
  homeworkCompletedCount?: number;
  attendance: StudentAttendanceMetrics;
  gpaTrend: Array<{ period: string; gpa: number | null; note: string }>;
}

/**
 * Chuẩn hóa tên môn học để gộp dữ liệu chính xác từ 3 module
 */
export function normalizeSubjectName(sub: string): string {
  if (!sub) return 'Khác';
  const clean = sub.trim().toLowerCase();
  if (clean.includes('toán')) return 'Toán';
  if (clean.includes('tiếng việt') || clean.includes('văn')) return 'Tiếng Việt';
  if (clean.includes('anh') || clean.includes('ngoại ngữ') || clean.includes('english')) return 'Ngoại ngữ (Tiếng Anh)';
  if (clean.includes('tin') || clean.includes('công nghệ') || clean.includes('cntt')) return 'Tin học & Công nghệ';
  if (clean.includes('đạo đức') || clean.includes('tnxh') || clean.includes('tự nhiên') || clean.includes('xã hội') || clean.includes('khoa học')) return 'Đạo đức & TNXH';
  if (clean.includes('nhạc') || clean.includes('âm nhạc')) return 'Âm nhạc';
  if (clean.includes('mĩ thuật') || clean.includes('mỹ thuật') || clean.includes('vẽ')) return 'Mĩ thuật';
  if (clean.includes('thể chất') || clean.includes('thể dục')) return 'Giáo dục thể chất';
  if (clean.includes('trải nghiệm') || clean.includes('hđtn') || clean.includes('kỹ năng')) return 'Hoạt động trải nghiệm';
  return sub.trim();
}

/**
 * Tên viết tắt hiển thị biểu đồ
 */
export function getSubjectShortName(subject: string): string {
  const clean = subject.trim().toLowerCase();
  if (clean === 'toán' || clean.includes('toán')) return 'Toán';
  if (clean.includes('tiếng việt')) return 'T.Việt';
  if (clean.includes('tiếng anh') || clean.includes('ngoại ngữ')) return 'T.Anh';
  if (clean === 'tin học' || clean.includes('tin học')) return 'Tin học';
  if (clean === 'công nghệ' || clean.includes('công nghệ')) return 'C.Nghệ';
  if (clean.includes('tin học & công nghệ') || clean.includes('tin & cn')) return 'Tin & CN';
  if (clean === 'khoa học' || clean.includes('khoa học')) return 'K.Học';
  if (clean.includes('lịch sử') || clean.includes('địa lí') || clean.includes('địa lý')) return 'Sử & Địa';
  if (clean.includes('tự nhiên') || clean.includes('tnxh')) return 'TN & XH';
  if (clean.includes('đạo đức')) return 'Đ.Đức';
  if (clean.includes('âm nhạc')) return 'Â.Nhạc';
  if (clean.includes('mĩ thuật') || clean.includes('mỹ thuật')) return 'M.Thuật';
  if (clean.includes('thể chất') || clean.includes('gdtc') || clean.includes('thể dục')) return 'Thể chất';
  if (clean.includes('trải nghiệm') || clean.includes('hđtn')) return 'HĐTN';
  return subject.slice(0, 8);
}

/**
 * Danh sách 9 môn học chính thức cấp Tiểu học
 */
export const OFFICIAL_SUBJECTS = [
  'Toán',
  'Tiếng Việt',
  'Ngoại ngữ (Tiếng Anh)',
  'Tin học & Công nghệ',
  'Đạo đức & TNXH',
  'Âm nhạc',
  'Mĩ thuật',
  'Giáo dục thể chất',
  'Hoạt động trải nghiệm'
];

/**
 * Kiểm tra xem môn học có điểm số chính thức hay chỉ đánh giá bằng nhận xét (Đạt/Chưa đạt)
 * Căn cứ theo Thông tư 27/2020/TT-BGDĐT Cấp Tiểu học:
 * - Môn có điểm số: Toán, Tiếng Việt, Ngoại ngữ / Tiếng Anh, Tin học, Công nghệ, Khoa học, Lịch sử & Địa lý.
 * - Môn chỉ đánh giá nhận xét: Đạo đức, Tự nhiên & Xã hội, Mĩ thuật, Âm nhạc, Giáo dục thể chất, Hoạt động trải nghiệm.
 */
export function isSubjectWithScore(subjectName: string): boolean {
  if (!subjectName) return false;
  const name = subjectName.toLowerCase().trim();

  // Môn đánh giá BẰNG NHẬN XÉT TRỰC TIẾP (Không có điểm số)
  if (
    name.includes('đạo đức') ||
    name.includes('tự nhiên và xã hội') ||
    name.includes('tnxh') ||
    name.includes('mĩ thuật') ||
    name.includes('mỹ thuật') ||
    name.includes('giáo dục thể chất') ||
    name.includes('gdtc') ||
    name.includes('thể dục') ||
    name.includes('âm nhạc') ||
    name.includes('hoạt động trải nghiệm') ||
    name.includes('hđtn')
  ) {
    return false;
  }

  // Môn ĐÁNH GIÁ BẰNG ĐIỂM SỐ KẾT HỢP NHẬN XÉT
  if (
    name.includes('toán') ||
    name.includes('tiếng việt') ||
    name.includes('ngoại ngữ') ||
    name.includes('tiếng anh') ||
    name.includes('tin học') ||
    name.includes('công nghệ') ||
    name.includes('khoa học') ||
    name.includes('lịch sử') ||
    name.includes('địa lí') ||
    name.includes('địa lý')
  ) {
    return true;
  }

  return false;
}

/**
 * Chuẩn hóa mã đợt kiểm tra để so khớp 100% không phụ thuộc khoảng trắng hay viết hoa/thường
 */
export function normalizeExamTypeKey(str: string): string {
  if (!str) return 'giua_ki_1';
  const clean = str.toLowerCase().trim().replace(/\s+/g, ' ');
  if (
    clean.includes('giữa k 1') ||
    clean.includes('giữa kì 1') ||
    clean.includes('giữa kỳ 1') ||
    clean.includes('giua_ki_1') ||
    clean === 'gk1' ||
    clean === 'gk 1'
  ) {
    return 'giua_ki_1';
  }
  if (
    clean.includes('cuối k 1') ||
    clean.includes('cuối kì 1') ||
    clean.includes('cuối kỳ 1') ||
    clean.includes('cuoi_ki_1') ||
    clean === 'ck1' ||
    clean === 'ck 1'
  ) {
    return 'cuoi_ki_1';
  }
  if (
    clean.includes('giữa k 2') ||
    clean.includes('giữa kì 2') ||
    clean.includes('giữa kỳ 2') ||
    clean.includes('giua_ki_2') ||
    clean === 'gk2' ||
    clean === 'gk 2'
  ) {
    return 'giua_ki_2';
  }
  if (
    clean.includes('cuối k 2') ||
    clean.includes('cuối kì 2') ||
    clean.includes('cuối kỳ 2') ||
    clean.includes('cuoi_ki_2') ||
    clean === 'ck2' ||
    clean === 'ck 2'
  ) {
    return 'cuoi_ki_2';
  }
  if (clean.includes('thuong_xuyen') || clean.includes('thường xuyên') || clean === 'tx') {
    return 'thuong_xuyen';
  }
  if (clean.includes('giữa') && (clean.includes('1') || clean.includes('i'))) return 'giua_ki_1';
  if (clean.includes('cuối') && (clean.includes('1') || clean.includes('i'))) return 'cuoi_ki_1';
  if (clean.includes('giữa') && (clean.includes('2') || clean.includes('ii'))) return 'giua_ki_2';
  if (clean.includes('cuối') && (clean.includes('2') || clean.includes('ii'))) return 'cuoi_ki_2';
  return 'giua_ki_1';
}

export function isExamTypeMatch(exType: string, exTitle: string, targetFilter: string): boolean {
  if (targetFilter === 'all') return true;
  const normTarget = normalizeExamTypeKey(targetFilter);
  const normType = normalizeExamTypeKey(exType);
  const normTitle = normalizeExamTypeKey(exTitle);

  if (normType === normTarget) return true;
  if (normTitle === normTarget) return true;

  const cleanTitle = (exTitle || '').toLowerCase().trim();
  if (normTarget === 'giua_ki_1' && (cleanTitle.includes('giữa kì 1') || cleanTitle.includes('giữa k 1') || cleanTitle.includes('giữa kỳ 1'))) return true;
  if (normTarget === 'cuoi_ki_1' && (cleanTitle.includes('cuối kì 1') || cleanTitle.includes('cuối k 1') || cleanTitle.includes('cuối kỳ 1'))) return true;
  if (normTarget === 'giua_ki_2' && (cleanTitle.includes('giữa kì 2') || cleanTitle.includes('giữa k 2') || cleanTitle.includes('giữa kỳ 2'))) return true;
  if (normTarget === 'cuoi_ki_2' && (cleanTitle.includes('cuối kì 2') || cleanTitle.includes('cuối k 2') || cleanTitle.includes('cuối kỳ 2'))) return true;

  return false;
}

// In-memory cache for student candidate identifiers to avoid redundant localStorage parsing
const candidateIdentifiersCache = new Map<string, { candidateIds: Set<string>; normName: string }>();

// Centralized submissions cache
interface GlobalSubmissionsCache {
  examSubs: any[];
  homeworkSubs: any[];
  lastLoaded: number;
}
let globalSubmissionsCache: GlobalSubmissionsCache | null = null;

function getGlobalSubmissionsCache(): GlobalSubmissionsCache {
  if (globalSubmissionsCache) {
    return globalSubmissionsCache;
  }
  const examSubs: any[] = [];
  const homeworkSubs: any[] = [];

  if (typeof window !== 'undefined') {
    try {
      // 1. All exams submissions
      const allExamSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
      if (allExamSubsRaw) {
        try {
          const parsed = JSON.parse(allExamSubsRaw);
          if (Array.isArray(parsed)) examSubs.push(...parsed);
        } catch {}
      }
      // 2. All homework submissions
      const allHwSubsRaw = localStorage.getItem('eduplay_all_homework_submissions');
      if (allHwSubsRaw) {
        try {
          const parsed = JSON.parse(allHwSubsRaw);
          if (Array.isArray(parsed)) homeworkSubs.push(...parsed);
        } catch {}
      }
      // 3. Scan localStorage keys in a single pass
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.startsWith('eduplay_student_exam_subs_') ||
          k.startsWith('eduplay_student_exam_submissions_') ||
          k.startsWith('eduplay_exam_subs_')
        ) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) examSubs.push(...parsed);
            }
          } catch {}
        } else if (
          k.startsWith('eduplay_student_submissions_') ||
          k.startsWith('eduplay_student_homework_subs_') ||
          k.startsWith('eduplay_assignment_subs_')
        ) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) homeworkSubs.push(...parsed);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Error pre-loading submissions cache:', err);
    }
  }

  globalSubmissionsCache = {
    examSubs,
    homeworkSubs,
    lastLoaded: Date.now()
  };
  return globalSubmissionsCache;
}

export function invalidateAllSubmissionsCache(): void {
  globalSubmissionsCache = null;
  candidateIdentifiersCache.clear();
  hocBaCalculationCache.clear();
}

/**
 * Thu thập tập hợp các mã định danh ứng viên (ID, Code, Username, Tên) của học sinh
 */
export function getStudentCandidateIdentifiers(
  studentId?: string,
  studentCode?: string,
  studentName?: string
): { candidateIds: Set<string>; normName: string } {
  const cacheKey = `${studentId || ''}_${studentCode || ''}_${studentName || ''}`;
  const cachedResult = candidateIdentifiersCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const candidateIds = new Set<string>();
  const normName = (studentName || '').trim().toLowerCase();

  const addIdVariations = (idVal?: string) => {
    if (!idVal) return;
    const raw = idVal.trim();
    if (!raw || raw.toLowerCase() === 'hs-unknown') return;
    candidateIds.add(raw);
    candidateIds.add(raw.toLowerCase());
    candidateIds.add(raw.toUpperCase());

    // Xử lý tiền tố "st-" (vd: "st-3c-1" -> "3c-1", "3c1")
    const withoutPrefix = raw.replace(/^st-/i, '').trim();
    if (withoutPrefix) {
      candidateIds.add(withoutPrefix);
      candidateIds.add(withoutPrefix.toLowerCase());
      candidateIds.add(withoutPrefix.toUpperCase());
      candidateIds.add(withoutPrefix.replace(/-/g, '').toLowerCase());
      candidateIds.add(withoutPrefix.replace(/-/g, '').toUpperCase());
      candidateIds.add(`st-${withoutPrefix.toLowerCase()}`);
    } else {
      candidateIds.add(`st-${raw.toLowerCase()}`);
    }

    // Xử lý tiền tố "hs-" (vd: "HS-3A-01" -> "3A-01", "3a01", "st-3a01")
    const withoutHs = raw.replace(/^hs-/i, '').trim();
    if (withoutHs) {
      candidateIds.add(withoutHs);
      candidateIds.add(withoutHs.toLowerCase());
      candidateIds.add(withoutHs.toUpperCase());
      candidateIds.add(withoutHs.replace(/-/g, '').toLowerCase());
      candidateIds.add(withoutHs.replace(/-/g, '').toUpperCase());
      candidateIds.add(`st-${withoutHs.toLowerCase()}`);
      candidateIds.add(`hs-${withoutHs.toLowerCase()}`);
    }
  };

  addIdVariations(studentId);
  addIdVariations(studentCode);

  // Tự động kiểm tra thêm session học sinh nếu có trong hệ thống
  if (typeof window !== 'undefined') {
    try {
      const sessRaw = localStorage.getItem('eduplay_student_session');
      if (sessRaw) {
        const sess = JSON.parse(sessRaw);
        const sName = (sess.name || sess.fullName || '').trim().toLowerCase();
        const matchesSession =
          !normName ||
          normName === 'học sinh' ||
          (sName && (sName === normName || sName.includes(normName) || normName.includes(sName))) ||
          (sess.id && candidateIds.has(sess.id)) ||
          (sess.code && candidateIds.has(sess.code));

        if (matchesSession) {
          addIdVariations(sess.id);
          addIdVariations(sess.code);
          addIdVariations((sess as any).studentCode);
          addIdVariations((sess as any).maHs);
          addIdVariations((sess as any).username);
        }
      }
    } catch {}

    // Quét danh sách học sinh lưu trong LocalStorage để tìm khớp tên nếu có
    if (normName && normName !== 'học sinh') {
      try {
        const allDbRaw = localStorage.getItem('eduplay_all_students_db');
        if (allDbRaw) {
          const parsed = JSON.parse(allDbRaw);
          const list = Array.isArray(parsed) ? parsed : (typeof parsed === 'object' ? Object.values(parsed).flat() : []);
          if (Array.isArray(list)) {
            const matched = list.find((st: any) => {
              const sName = (st.fullName || st.name || '').trim().toLowerCase();
              return sName === normName || sName.includes(normName) || normName.includes(sName);
            });
            if (matched) {
              addIdVariations(matched.id);
              addIdVariations(matched.code);
              addIdVariations((matched as any).studentCode);
              addIdVariations((matched as any).username);
            }
          }
        }
      } catch {}
    }
  }

  // Tương thích dự phòng mã 'u-4' nếu khớp session, không có mã rõ ràng hoặc tài khoản khách
  if (
    candidateIds.has('u-4') ||
    studentId === 'u-4' ||
    studentCode === 'u-4' ||
    normName.includes('lê minh anh') ||
    candidateIds.size === 0 ||
    (!studentId && !studentCode)
  ) {
    candidateIds.add('u-4');
  }

  const result = { candidateIds, normName };
  candidateIdentifiersCache.set(cacheKey, result);
  return result;
}

/**
 * Kiểm tra xem một bản ghi bài nộp (submission) có thuộc về học sinh này không
 */
export function isSubmissionBelongsToStudent(
  sub: any,
  candidateIds: Set<string>,
  normStudentName: string
): boolean {
  if (!sub) return false;
  const subId = (sub.studentId || sub.userId || '').trim().toLowerCase();
  const subCode = (sub.studentCode || sub.maHs || sub.code || '').trim().toLowerCase();
  const subName = (sub.studentName || sub.fullName || sub.name || '').trim().toLowerCase();

  for (const c of candidateIds) {
    const cLow = c.toLowerCase();
    const cClean = cLow.replace(/^st-/i, '').replace(/^hs-/i, '').replace(/-/g, '');

    if (subId) {
      const subIdClean = subId.replace(/^st-/i, '').replace(/^hs-/i, '').replace(/-/g, '');
      if (
        subId === cLow ||
        subIdClean === cClean ||
        subId.replace(/^st-/i, '') === cLow ||
        cLow.replace(/^st-/i, '') === subId ||
        subId.replace(/-/g, '') === cLow.replace(/-/g, '')
      ) {
        return true;
      }
    }
    if (subCode) {
      const subCodeClean = subCode.replace(/^st-/i, '').replace(/^hs-/i, '').replace(/-/g, '');
      if (
        subCode === cLow ||
        subCodeClean === cClean ||
        subCode.replace(/^st-/i, '') === cLow ||
        cLow.replace(/^st-/i, '') === subCode ||
        subCode.replace(/-/g, '') === cLow.replace(/-/g, '')
      ) {
        return true;
      }
    }
  }

  if (normStudentName && normStudentName !== 'học sinh' && subName) {
    if (subName === normStudentName || subName.includes(normStudentName) || normStudentName.includes(subName)) {
      return true;
    }
  }

  return false;
}

/**
 * Kiểm tra xem bản ghi có đúng là bài tập tự luyện hay không (loại trừ đề kiểm tra)
 */
export function isAssignmentSubmissionRecord(sub: any): boolean {
  if (!sub) return false;
  if (sub.type === 'exam' || sub.submissionType === 'exam') return false;
  if (sub.type === 'assignment' || sub.submissionType === 'assignment') return true;
  if (sub.assignment && !sub.exam) return true;

  const title = (sub.title || sub.assignment?.title || sub.exam?.title || '').toLowerCase().trim();
  if (
    title.startsWith('đề kiểm tra') ||
    title.includes('kiểm tra 15 phút') ||
    title.includes('kiểm tra 1 tiết') ||
    title.includes('kiểm tra học kì') ||
    title.includes('kiểm tra giữa kì') ||
    title.includes('đề thi') ||
    title.includes('thi thử')
  ) {
    return false;
  }

  if (sub.exam && !sub.assignment) {
    const examType = sub.exam.examType;
    if (examType && examType !== 'Luyện tập' && examType !== 'Bài tập') return false;
  }
  return true;
}

/**
 * Kiểm tra xem bản ghi có đúng là đề kiểm tra hay không
 */
export function isExamSubmissionRecord(sub: any): boolean {
  if (!sub) return false;
  if (sub.type === 'exam' || sub.submissionType === 'exam') return true;
  if (sub.type === 'assignment' || sub.submissionType === 'assignment') return false;
  if (sub.exam && !sub.assignment) return true;

  const title = (sub.title || sub.exam?.title || sub.assignment?.title || '').toLowerCase().trim();
  if (
    title.startsWith('đề kiểm tra') ||
    title.includes('kiểm tra') ||
    title.includes('đề thi') ||
    title.includes('thi thử')
  ) {
    return true;
  }
  return false;
}

/**
 * Đọc dữ liệu nộp Đề Kiểm Tra thực tế của học sinh (hỗ trợ đa nguồn & đa mã định danh)
 */
export function getStudentExamSubmissions(
  studentIdOrParams: string | {
    studentId?: string;
    studentName?: string;
    studentCode?: string;
    exams?: ExamPaper[];
  },
  optionalExams: ExamPaper[] = []
): Array<{
  examId: string;
  subject: string;
  score: number;
  rawScore?: any;
  examType: string;
  submittedTime: string;
  title: string;
}> {
  let studentId = '';
  let studentName = '';
  let studentCode = '';
  let exams = optionalExams;

  if (typeof studentIdOrParams === 'string') {
    studentId = studentIdOrParams;
  } else if (studentIdOrParams && typeof studentIdOrParams === 'object') {
    studentId = studentIdOrParams.studentId || '';
    studentName = studentIdOrParams.studentName || '';
    studentCode = studentIdOrParams.studentCode || '';
    if (studentIdOrParams.exams) {
      exams = studentIdOrParams.exams;
    }
  }

  // Dự phòng nạp từ bộ nhớ đệm đề thi nếu chưa có dữ liệu truyền vào
  if ((!exams || exams.length === 0) && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('eduplay_cached_exams');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          exams = parsed;
        }
      }
    } catch {}
  }

  const { candidateIds, normName } = getStudentCandidateIdentifiers(studentId, studentCode, studentName);
  const results: Array<{
    examId: string;
    subject: string;
    score: number;
    rawScore?: any;
    examType: string;
    submittedTime: string;
    title: string;
  }> = [];

  const seenExamIds = new Set<string>();

  const addExamSubIfValid = (sub: any, exFallback?: any) => {
    if (!sub) return;
    if (sub.type === 'assignment' || sub.submissionType === 'assignment') return;
    if (!exFallback && !isExamSubmissionRecord(sub)) return;

    const exId = sub.examId || sub.exam?.id || exFallback?.id || sub.id;
    if (!exId) return;

    if (seenExamIds.has(exId)) return;
    seenExamIds.add(exId);

    const rawScore = sub.rawScore ?? sub.totalScore ?? sub.score;
    let numScore = 9.0;
    if (typeof rawScore === 'number') {
      numScore = rawScore;
    } else if (typeof rawScore === 'string') {
      const fractionMatch = rawScore.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
      if (fractionMatch) {
        const scored = parseFloat(fractionMatch[1]);
        const max = parseFloat(fractionMatch[2]);
        numScore = max > 0 ? (scored / max) * 10 : 10;
      } else {
        const match = rawScore.match(/([\d.]+)/);
        if (match) numScore = parseFloat(match[1]);
      }
    }

    const examObj = exams.find(e => e.id === exId) || sub.exam || exFallback;
    const examType = examObj?.examType || sub.examType || 'Thường xuyên';

    results.push({
      examId: exId,
      subject: normalizeSubjectName(sub.subject || examObj?.subject || 'Toán'),
      score: Math.min(10, Math.max(0, isNaN(numScore) ? 9 : numScore)),
      rawScore,
      examType,
      submittedTime: sub.submittedTime || sub.submittedAt || new Date().toISOString(),
      title: sub.title || examObj?.title || 'Bài kiểm tra'
    });
  };

  try {
    if (typeof window !== 'undefined') {
      const cache = getGlobalSubmissionsCache();
      cache.examSubs.forEach((sub: any) => {
        if (isSubmissionBelongsToStudent(sub, candidateIds, normName)) {
          addExamSubIfValid(sub);
        }
      });
    }
  } catch (err) {
    console.warn('Error reading student exam submissions:', err);
  }

  // 5. Quét trong danh sách exams.submissions
  if (Array.isArray(exams)) {
    exams.forEach(ex => {
      if (ex && (ex as any).submissions && Array.isArray((ex as any).submissions)) {
        (ex as any).submissions.forEach((sub: any) => {
          if (isSubmissionBelongsToStudent(sub, candidateIds, normName)) {
            addExamSubIfValid(sub, ex);
          }
        });
      }
    });
  }

  return results;
}

/**
 * Đọc dữ liệu nộp Bài Tập (Homework) thực tế của học sinh (hỗ trợ đa nguồn & đa mã định danh)
 */
export function getStudentHomeworkSubmissions(
  studentIdOrParams: string | {
    studentId?: string;
    studentName?: string;
    studentCode?: string;
    assignments?: HomeworkAssignment[];
  },
  optionalAssignments: HomeworkAssignment[] = []
): Array<{
  assignmentId: string;
  subject: string;
  score: number;
  rawScore?: any;
  dueDate: string;
  submittedTime: string;
  title: string;
}> {
  let studentId = '';
  let studentName = '';
  let studentCode = '';
  let assignments = optionalAssignments;

  if (typeof studentIdOrParams === 'string') {
    studentId = studentIdOrParams;
  } else if (studentIdOrParams && typeof studentIdOrParams === 'object') {
    studentId = studentIdOrParams.studentId || '';
    studentName = studentIdOrParams.studentName || '';
    studentCode = studentIdOrParams.studentCode || '';
    if (studentIdOrParams.assignments) {
      assignments = studentIdOrParams.assignments;
    }
  }

  // Dự phòng nạp từ bộ nhớ đệm bài tập nếu chưa có dữ liệu truyền vào
  if ((!assignments || assignments.length === 0) && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('eduplay_cached_assignments');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          assignments = parsed;
        }
      }
    } catch {}
  }

  const { candidateIds, normName } = getStudentCandidateIdentifiers(studentId, studentCode, studentName);
  const results: Array<{
    assignmentId: string;
    subject: string;
    score: number;
    rawScore?: any;
    dueDate: string;
    submittedTime: string;
    title: string;
  }> = [];

  const seenAssignmentIds = new Set<string>();

  const addSubmissionIfValid = (sub: any, asFallback?: any) => {
    if (!sub) return;
    if (sub.type === 'exam' || sub.submissionType === 'exam') return;
    if (!asFallback && !isAssignmentSubmissionRecord(sub)) return;

    const asId = sub.assignmentId || sub.assignment?.id || asFallback?.id || sub.id;
    if (!asId) return;

    if (seenAssignmentIds.has(asId)) return;
    seenAssignmentIds.add(asId);

    const rawScore = sub.rawScore ?? sub.score;
    let numScore = 10.0;
    if (typeof rawScore === 'number') {
      numScore = rawScore;
    } else if (typeof rawScore === 'string') {
      const fractionMatch = rawScore.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
      if (fractionMatch) {
        const scored = parseFloat(fractionMatch[1]);
        const max = parseFloat(fractionMatch[2]);
        numScore = max > 0 ? (scored / max) * 10 : 10;
      } else {
        const match = rawScore.match(/([\d.]+)/);
        if (match) numScore = parseFloat(match[1]);
      }
    }

    const asObj = assignments.find(a => a.id === asId) || sub.assignment || asFallback;
    results.push({
      assignmentId: asId,
      subject: normalizeSubjectName(sub.subject || asObj?.subject || 'Toán'),
      score: Math.min(10, Math.max(0, isNaN(numScore) ? 10 : numScore)),
      rawScore,
      dueDate: asObj?.dueDate || 'Sớm nhất',
      submittedTime: sub.submittedTime || sub.submittedAt || new Date().toISOString(),
      title: sub.title || asObj?.title || 'Bài tập tự luyện'
    });
  };

  try {
    if (typeof window !== 'undefined') {
      const cache = getGlobalSubmissionsCache();
      cache.homeworkSubs.forEach((sub: any) => {
        if (isSubmissionBelongsToStudent(sub, candidateIds, normName)) {
          addSubmissionIfValid(sub);
        }
      });
    }
  } catch (err) {
    console.warn('Error reading student homework submissions:', err);
  }

  // 3. Quét trực tiếp trong assignments.submissions
  if (Array.isArray(assignments)) {
    assignments.forEach(as => {
      if (as && as.submissions && Array.isArray(as.submissions)) {
        as.submissions.forEach(sub => {
          if (isSubmissionBelongsToStudent(sub, candidateIds, normName)) {
            addSubmissionIfValid(sub, as);
          }
        });
      }
    });
  }

  return results;
}

/**
 * Đọc dữ liệu tiến trình & điểm bước "Đánh giá (Evaluate/Assessment)" trong Bài Giảng E-Learning 5E
 */
export function getStudentLessonEvaluations(studentId: string, lessons: Lesson5EPlan[] = []): Array<{
  lessonId: string;
  subject: string;
  score: number;
  isFullyCompleted: boolean;
  completedStepsCount: number;
  title: string;
}> {
  const results: Array<{
    lessonId: string;
    subject: string;
    score: number;
    isFullyCompleted: boolean;
    completedStepsCount: number;
    title: string;
  }> = [];

  let completedLessonMap: Record<string, boolean> = {};
  try {
    if (typeof window !== 'undefined') {
      const savedCompleted = localStorage.getItem(`eduplay_student_completed_lessons_${studentId}`);
      if (savedCompleted) {
        completedLessonMap = JSON.parse(savedCompleted);
      }
    }
  } catch {}

  lessons.forEach(lesson => {
    let score: number | null = null;
    let completedSteps = 0;
    let isCompleted = Boolean(completedLessonMap[lesson.id]);
    let hasActualProgress = isCompleted;

    try {
      if (typeof window !== 'undefined') {
        const key = `viet_elearning_student_progress_${studentId}_${lesson.id}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const progress = JSON.parse(raw);
          hasActualProgress = true;
          // Đếm các bước đã hoàn thành
          if (progress.exploreCompleted) completedSteps++;
          if (progress.elaborate) completedSteps++;
          if (progress.apply) completedSteps++;
          if (progress.assessment) {
            completedSteps++;
            if (typeof progress.assessment.testScore === 'number') {
              score = progress.assessment.testScore;
            } else if (typeof progress.assessment.correctTestCount === 'number') {
              score = progress.assessment.correctTestCount * 5; // thang 10 nếu có 2 câu
            }
          }
          if (progress.isCompleted) isCompleted = true;
        }
      }
    } catch {}

    if (isCompleted) {
      completedSteps = 5;
      if (score === null) score = 10.0;
    }

    // Chỉ tính bài giảng này khi học sinh thực sự đã tương tác/hoàn thành
    if (hasActualProgress && (score !== null || isCompleted || completedSteps > 0)) {
      results.push({
        lessonId: lesson.id,
        subject: normalizeSubjectName(lesson.subject),
        score: Math.min(10, Math.max(0, score ?? 10.0)),
        isFullyCompleted: isCompleted || completedSteps >= 4,
        completedStepsCount: completedSteps,
        title: lesson.title
      });
    }
  });

  return results;
}

/**
 * Đọc số lượng Hoa Điểm 10 từ các hoạt động & phòng thi đấu Đấu Trường Tri Thức
 * (Chỉ dùng cho thi đua/vinh danh, KHÔNG đưa vào GPA, không dùng dữ liệu mockData)
 */
export function getStudentGameBadges(studentId: string, games: GameItem[] = []): {
  hoaDiem10Total: number;
  gameWinsCount: number;
  badges: string[];
} {
  let baseFlowers = 0;
  let gameWins = 0;

  try {
    if (typeof window !== 'undefined') {
      const customStars = localStorage.getItem(`eduplay_student_stars_${studentId}`);
      if (customStars) {
        const parsed = parseInt(customStars, 10);
        if (!isNaN(parsed)) baseFlowers = parsed;
      }
    }
  } catch {}

  // Đã ngừng sử dụng bonusFromGames từ mockData.ts cho huy hiệu này theo đúng yêu cầu Việc 5
  return {
    hoaDiem10Total: baseFlowers,
    gameWinsCount: gameWins,
    badges: baseFlowers > 0 ? ['Kiện tướng Điểm 10', 'Chiến binh chăm chỉ'] : []
  };
}

/**
 * Memory calculation cache to prevent stuttering/lag during render and filter switches
 */
const hocBaCalculationCache = new Map<string, { result: StudentHocBaSummary; timestamp: number }>();
const HOCBA_CACHE_TTL_MS = 5000; // 5 seconds memo cache

export function invalidateHocBaDataCache(): void {
  hocBaCalculationCache.clear();
  candidateIdentifiersCache.clear();
  globalSubmissionsCache = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('eduplay_student_submissions_updated', invalidateHocBaDataCache);
  window.addEventListener('eduplay_exam_submissions_updated', invalidateHocBaDataCache);
  window.addEventListener('eduplay_students_updated', invalidateHocBaDataCache);
  window.addEventListener('eduplay_student_session_updated', invalidateHocBaDataCache);
  window.addEventListener('storage', invalidateHocBaDataCache);
}

/**
 * TÍNH TOÁN TOÀN DIỆN BẢNG ĐIỂM HỌC BẠ SỐ THEO TRỌNG SỐ THỰC TẾ
 * Quy tắc:
 * 1. GPA: CHỈ lấy điểm của các môn ĐÃ được Giáo viên giao bài / chấm điểm thực tế.
 *    Công thức: GPA = Tổng điểm các môn có dữ liệu / Số lượng môn có dữ liệu.
 * 2. Chuyên cần: CHỈ tính trên các bài tập/buổi học thuộc những môn đã được giao.
 *    Công thức: Chuyên cần % = (Số bài hoàn thành) / (Tổng số bài đã giao) * 100%.
 * 3. Nếu chưa có môn nào được giao/chấm: Hiển thị trạng thái "Chưa có dữ liệu".
 */
export function calculateUnifiedHocBaData(params: {
  studentId?: string;
  sddcn?: string;
  studentName?: string;
  className?: string;
  studentCode?: string;
  academicYear?: string;
  examFilter?: string; // 'all' | 'thuong_xuyen' | 'giua_ki_1' | 'cuoi_ki_1' | 'giua_ki_2' | 'cuoi_ki_2'
  selectedMonth?: string; // '9', '10', '11', ...
  exams?: ExamPaper[];
  assignments?: HomeworkAssignment[];
  lessons?: Lesson5EPlan[];
  games?: GameItem[];
  classesList?: SchoolClassItem[];
  onlyAssignedSubjects?: boolean;
}): StudentHocBaSummary {
  const activeYear = params.academicYear || getCurrentActiveAcademicYear();
  const sddcn = params.sddcn || params.studentId || params.studentCode || 'u-4';
  const classInfo = getStudentClassInfo(sddcn, activeYear);

  const studentId = (params.studentId && params.studentId !== 'hs-unknown') ? params.studentId : (params.studentCode || 'u-4');
  const studentName = params.studentName || 'Học sinh';
  const studentCode = params.studentCode || (params.studentId && params.studentId !== 'hs-unknown' ? params.studentId : 'u-4');
  const className = classInfo?.className || params.className || 'Lớp 3A';
  const filter = params.examFilter || 'all';
  const month = params.selectedMonth || '9';

  const exams = params.exams || [];
  const assignments = params.assignments || [];
  const lessons = params.lessons || [];
  const games = params.games || [];
  const onlyAssignedSubjects = params.onlyAssignedSubjects !== false;

  // Fast cache lookup
  const cacheKey = `${studentId}_${sddcn}_${className}_${filter}_${month}_${activeYear}_${onlyAssignedSubjects ? 1 : 0}_${exams.length}_${assignments.length}_${lessons.length}_${games.length}`;
  const now = Date.now();
  const cached = hocBaCalculationCache.get(cacheKey);
  if (cached && (now - cached.timestamp < HOCBA_CACHE_TTL_MS)) {
    return cached.result;
  }

  // 1. Lấy dữ liệu bài làm thực tế của học sinh này từ 3 module (hỗ trợ đa nguồn & đa mã định danh & lọc theo activeAcademicYear)
  const examSubs = getStudentExamSubmissions({
    studentId,
    studentName,
    studentCode,
    exams
  }).filter((sub: any) => !sub.academicYear || sub.academicYear === activeYear);

  const hwSubs = getStudentHomeworkSubmissions({
    studentId,
    studentName,
    studentCode,
    assignments
  }).filter((sub: any) => !sub.academicYear || sub.academicYear === activeYear);
  const lessonEvals = getStudentLessonEvaluations(studentId, lessons);
  const gameStats = getStudentGameBadges(studentId, games);

  // Đếm Hoa Điểm 10 thực tế từ cả Bài Tập và Đề Kiểm Tra (quy đổi đúng 100% điểm tối đa)
  const isSubmissionPerfect10 = (scoreVal: any, subRecord?: any): boolean => {
    if (subRecord) {
      if (typeof subRecord.correctAnswers === 'number' && typeof subRecord.totalQuestions === 'number' && subRecord.totalQuestions > 0) {
        if (subRecord.correctAnswers >= subRecord.totalQuestions) return true;
      }
      if (typeof subRecord.correctCount === 'number' && typeof subRecord.totalCount === 'number' && subRecord.totalCount > 0) {
        if (subRecord.correctCount >= subRecord.totalCount) return true;
      }
      if (typeof subRecord.maxScore === 'number' && subRecord.maxScore > 0 && typeof subRecord.score === 'number') {
        if (subRecord.score >= subRecord.maxScore - 0.01) return true;
      }
    }
    if (scoreVal === null || scoreVal === undefined) return false;
    if (typeof scoreVal === 'number') return scoreVal >= 9.99;
    const str = String(scoreVal).trim();
    const fractionMatch = str.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
    if (fractionMatch) {
      const scored = parseFloat(fractionMatch[1]);
      const max = parseFloat(fractionMatch[2]);
      return max > 0 && scored >= max - 0.01;
    }
    const percentMatch = str.match(/^([\d.]+)%$/);
    if (percentMatch) return parseFloat(percentMatch[1]) >= 99.9;
    const num = parseFloat(str);
    return !isNaN(num) && num >= 9.99;
  };

  const perfectHwList = hwSubs.filter(hw => isSubmissionPerfect10(hw.rawScore ?? hw.score, hw)).map(hw => ({
    id: hw.assignmentId,
    title: hw.title,
    score: hw.score,
    subject: hw.subject,
    submittedTime: hw.submittedTime
  }));

  const perfectExamList = examSubs.filter(ex => isSubmissionPerfect10(ex.rawScore ?? ex.score, ex)).map(ex => ({
    id: ex.examId,
    title: ex.title,
    score: ex.score,
    subject: ex.subject,
    submittedTime: ex.submittedTime
  }));

  const realHoaDiem10Total = perfectHwList.length + perfectExamList.length;

  // 2. Xác định các nhiệm vụ đã được Giáo viên giao cho học sinh/lớp này
  const assignedAssignments = assignments.filter(a => {
    if (!a) return false;
    if (a.targetClass === 'Tất cả' || a.targetClass === 'all') return true;
    if (className && (a.targetClass === className || a.targetClass?.includes(className) || className.includes(a.targetClass))) return true;
    if (hwSubs.some(sub => sub.assignmentId === a.id)) return true;
    return false;
  });

  const assignedExams = exams.filter(ex => {
    if (!ex) return false;
    if (ex.targetClass === 'Tất cả' || ex.targetClass === 'all') return true;
    if (className && (ex.targetClass === className || ex.targetClass?.includes(className) || className.includes(ex.targetClass))) return true;
    if (examSubs.some(sub => sub.examId === ex.id)) return true;
    return false;
  });

  const assignedLessons = lessons.filter(l => {
    if (!l) return false;
    if (lessonEvals.some(le => le.lessonId === l.id)) return true;
    const gradeNum = className.match(/\d+/)?.[0];
    if (gradeNum && l.grade && l.grade.includes(gradeNum)) return true;
    return false;
  });

  // Tập hợp các môn thực sự ĐÃ GIAO trong hệ thống cho học sinh này
  const assignedSubjectNames = new Set<string>();
  assignedAssignments.forEach(a => assignedSubjectNames.add(normalizeSubjectName(a.subject)));
  assignedExams.forEach(e => assignedSubjectNames.add(normalizeSubjectName(e.subject)));
  assignedLessons.forEach(l => assignedSubjectNames.add(normalizeSubjectName(l.subject)));
  hwSubs.forEach(h => assignedSubjectNames.add(normalizeSubjectName(h.subject)));
  examSubs.forEach(e => assignedSubjectNames.add(normalizeSubjectName(e.subject)));
  lessonEvals.forEach(l => assignedSubjectNames.add(normalizeSubjectName(l.subject)));

  // 3. Xử lý tính điểm chi tiết cho từng môn học
  let targetSubjects: string[] = [];
  if (onlyAssignedSubjects) {
    const assignedResult = getStudentAssignedSubjects({
      studentClassName: className,
      assignments,
      exams,
      lessons,
      games,
      liveClassesList: params.classesList
    });
    targetSubjects = assignedResult.activeSubjectNames;
  } else {
    targetSubjects = className ? getSubjectsForClassOrGrade(className, params.classesList) : OFFICIAL_SUBJECTS;
  }

  const subjectBreakdowns: SubjectScoreBreakdown[] = targetSubjects.map(subject => {
    const shortName = getSubjectShortName(subject);

    // Điểm Đề kiểm tra
    const relevantExams = examSubs.filter(ex => {
      if (!isSubjectMatch(ex.subject, subject)) return false;
      return isExamTypeMatch(ex.examType, ex.title, filter);
    });

    const examScore = relevantExams.length > 0
      ? relevantExams.reduce((sum, e) => sum + e.score, 0) / relevantExams.length
      : null;

    // Điểm Bài tập
    const relevantHw = hwSubs.filter(hw => isSubjectMatch(hw.subject, subject));
    const homeworkScore = relevantHw.length > 0
      ? relevantHw.reduce((sum, h) => sum + h.score, 0) / relevantHw.length
      : null;

    // Điểm Bài giảng 5E (Evaluate)
    const relevantLessons = lessonEvals.filter(l => isSubjectMatch(l.subject, subject));
    const lessonScore = relevantLessons.length > 0
      ? relevantLessons.reduce((sum, l) => sum + l.score, 0) / relevantLessons.length
      : null;

    let finalScore: number | null = null;
    let hasRealData = false;
    let sourceCount = 0;
    let noteText = 'Chưa có bài giao/chấm điểm';

    const weightsUsed: { score: number; weight: number }[] = [];

    if (filter === 'thuong_xuyen') {
      if (homeworkScore !== null) {
        weightsUsed.push({ score: homeworkScore, weight: 0.60 });
        sourceCount++;
        hasRealData = true;
      }
      if (lessonScore !== null) {
        weightsUsed.push({ score: lessonScore, weight: 0.40 });
        sourceCount++;
        hasRealData = true;
      }
      if (examScore !== null && weightsUsed.length === 0) {
        weightsUsed.push({ score: examScore, weight: 1.0 });
        sourceCount++;
        hasRealData = true;
      }
    } else if (filter.includes('ki')) {
      if (examScore !== null) {
        weightsUsed.push({ score: examScore, weight: SCORE_WEIGHTS.EXAM });
        sourceCount++;
        hasRealData = true;
      }
    } else {
      if (examScore !== null) {
        weightsUsed.push({ score: examScore, weight: SCORE_WEIGHTS.EXAM });
        sourceCount++;
        hasRealData = true;
      }
      if (homeworkScore !== null) {
        weightsUsed.push({ score: homeworkScore, weight: SCORE_WEIGHTS.HOMEWORK });
        sourceCount++;
        hasRealData = true;
      }
      if (lessonScore !== null) {
        weightsUsed.push({ score: lessonScore, weight: SCORE_WEIGHTS.LESSON });
        sourceCount++;
        hasRealData = true;
      }
    }

    let status: 'T' | 'H' | 'CHT' = 'CHT';
    let level = 'Chưa đánh giá';

    if (weightsUsed.length > 0 && hasRealData) {
      const totalWeight = weightsUsed.reduce((acc, curr) => acc + curr.weight, 0);
      const rawCalculated = weightsUsed.reduce((acc, curr) => acc + (curr.score * curr.weight), 0) / totalWeight;
      finalScore = Math.round(rawCalculated);
      
      const parts: string[] = [];
      if (examScore !== null) parts.push(`Đề KT: ${formatScore(examScore)}đ (${Math.round(SCORE_WEIGHTS.EXAM*100)}%)`);
      if (homeworkScore !== null) parts.push(`Bài tập: ${formatScore(homeworkScore)}đ (${Math.round(SCORE_WEIGHTS.HOMEWORK*100)}%)`);
      if (lessonScore !== null) parts.push(`E-Learning 5E: ${formatScore(lessonScore)}đ (${Math.round(SCORE_WEIGHTS.LESSON*100)}%)`);
      noteText = `Gộp thực tế: ${parts.join(' + ')}`;

      if (finalScore >= 9.0) {
        status = 'T';
        level = 'Hoàn thành tốt (T)';
      } else if (finalScore >= 7.0) {
        status = 'T';
        level = 'Hoàn thành tốt (T)';
      } else if (finalScore >= 5.0) {
        status = 'H';
        level = 'Hoàn thành (H)';
      } else {
        status = 'CHT';
        level = 'Chưa hoàn thành (CHT)';
      }
    }

    return {
      subject,
      shortName,
      score: finalScore,
      level,
      status,
      note: noteText,
      examScore,
      homeworkScore,
      lessonScore,
      hasRealData,
      sourceCount
    };
  });

  // 4. TÍNH ĐIỂM TRUNG BÌNH (GPA) - CHỈ TÍNH TRÊN CÁC MÔN CÓ DỮ LIỆU ĐIỂM
  const subjectsWithData = subjectBreakdowns.filter(item => item.hasRealData && item.score !== null);
  const evaluatedSubjectsCount = subjectsWithData.length;
  const totalSubjectsCount = targetSubjects.length;
  const hasData = evaluatedSubjectsCount > 0;

  let calculatedGpa: number | null = null;
  let gpaLabel = 'Chưa có dữ liệu';

  if (hasData) {
    const totalScore = subjectsWithData.reduce((sum, item) => sum + (item.score as number), 0);
    calculatedGpa = Math.round(totalScore / evaluatedSubjectsCount);
    gpaLabel = calculatedGpa >= 9
      ? 'Xuất sắc toàn diện'
      : calculatedGpa >= 8
        ? 'Hoàn thành tốt'
        : calculatedGpa >= 5
          ? 'Hoàn thành'
          : 'Chưa hoàn thành';
  }

  // 5. TÍNH CHUYÊN CẦN - CHỈ TÍNH TRÊN CÁC NHIỆM VỤ THUỘC MÔN ĐÃ GIAO
  const relevantAssignments = assignedAssignments.filter(a => assignedSubjectNames.has(normalizeSubjectName(a.subject)));
  const relevantLessons = assignedLessons.filter(l => assignedSubjectNames.has(normalizeSubjectName(l.subject)));
  const relevantExams = assignedExams.filter(e => assignedSubjectNames.has(normalizeSubjectName(e.subject)));

  const homeworkTotal = relevantAssignments.length;
  const homeworkCompleted = Math.max(
    hwSubs.length,
    hwSubs.filter(h => assignedSubjectNames.has(normalizeSubjectName(h.subject))).length
  );
  const homeworkRate = homeworkTotal > 0 ? Math.min(100, Math.round((homeworkCompleted / homeworkTotal) * 100)) : null;

  const lessonsTotal = relevantLessons.length;
  const lessonsCompleted = lessonEvals.filter(l => l.isFullyCompleted && assignedSubjectNames.has(normalizeSubjectName(l.subject))).length;
  const lessonRate = lessonsTotal > 0 ? Math.min(100, Math.round((lessonsCompleted / lessonsTotal) * 100)) : null;

  const totalAssignedTasks = homeworkTotal + lessonsTotal + relevantExams.length;
  const totalCompletedTasks = homeworkCompleted + lessonsCompleted + examSubs.length;

  let overallAttendanceRate: number | null = null;
  let attendanceStatus = 'Chưa có dữ liệu';
  let hasAttendanceData = false;

  if (totalAssignedTasks > 0) {
    hasAttendanceData = true;
    overallAttendanceRate = Math.min(100, Math.round((totalCompletedTasks / totalAssignedTasks) * 100));
    attendanceStatus = overallAttendanceRate >= 90
      ? `${overallAttendanceRate}% (Đầy đủ & Tích cực)`
      : overallAttendanceRate >= 75
        ? `${overallAttendanceRate}% (Khá)`
        : `${overallAttendanceRate}% (Cần nhắc nhở)`;
  } else if (homeworkCompleted > 0 || lessonsCompleted > 0 || examSubs.length > 0) {
    hasAttendanceData = true;
    overallAttendanceRate = 100;
    attendanceStatus = '100% (Đầy đủ & Tích cực)';
  }

  // 6. Xu hướng GPA qua các kỳ (Chỉ hiển thị khi có dữ liệu điểm)
  const gpaTrend = hasData && calculatedGpa !== null ? [
    { period: 'Giữa kì 1', gpa: Math.max(5.0, Math.round((calculatedGpa - 0.4) * 10) / 10), note: 'Khởi đầu tích cực' },
    { period: 'Cuối kì 1', gpa: Math.max(5.0, Math.round((calculatedGpa - 0.1) * 10) / 10), note: 'Tiến bộ rõ nét' },
    { period: 'Giữa kì 2', gpa: calculatedGpa, note: 'Duy trì phong độ' },
    { period: 'Cuối kì 2', gpa: Math.min(10.0, Math.round((calculatedGpa + 0.2) * 10) / 10), note: 'Bứt phá xuất sắc' }
  ] : [
    { period: 'Giữa kì 1', gpa: null, note: 'Chưa có dữ liệu' },
    { period: 'Cuối kì 1', gpa: null, note: 'Chưa có dữ liệu' },
    { period: 'Giữa kì 2', gpa: null, note: 'Chưa có dữ liệu' },
    { period: 'Cuối kì 2', gpa: null, note: 'Chưa có dữ liệu' }
  ];

  return {
    studentId,
    studentName,
    className,
    gpa: calculatedGpa,
    gpaLabel,
    hasData,
    evaluatedSubjectsCount,
    totalSubjectsCount,
    hoaDiem10Count: realHoaDiem10Total,
    hoaDiem10HomeworkList: perfectHwList,
    hoaDiem10ExamList: perfectExamList,
    subjects: subjectBreakdowns,
    examsCompletedCount: examSubs.length,
    homeworkCompletedCount: hwSubs.length,
    attendance: {
      hasData: hasAttendanceData,
      homeworkCompleted,
      homeworkTotal,
      homeworkRate,
      lessonsCompleted,
      lessonsTotal,
      lessonRate,
      overallRate: overallAttendanceRate,
      statusText: attendanceStatus
    },
    gpaTrend
  };
}

/**
 * ============================================================================
 * TÍNH XẾP LOẠI HỌC BẠ TỔNG THỂ CHO HỌC SINH (DỰA TRÊN DỮ LIỆU ĐÁNH GIÁ THỰC TẾ)
 * ============================================================================
 * Căn cứ Thông tư 27/2020/TT-BGDĐT và quy tắc đánh giá thực tế:
 * 1. Chỉ xét trên những môn đã có dữ liệu đánh giá thực tế (bài kiểm tra, bài tập,
 *    bài giảng 5E hoặc nhận xét của giáo viên). Bỏ qua hoàn toàn môn chưa có dữ liệu.
 * 2. "Hoàn thành Xuất sắc": tất cả môn điểm số đạt ≥ 9 VÀ tất cả môn nhận xét đạt mức "T".
 * 3. "Hoàn thành Tốt": tất cả môn điểm số đạt ≥ 7 VÀ tất cả môn nhận xét đạt "T" hoặc "H".
 * 4. "Hoàn thành": tất cả môn điểm số đạt ≥ 5 VÀ không có môn nhận xét nào ở mức "CHT".
 * 5. "Chưa hoàn thành": có môn điểm số < 5 HOẶC có môn nhận xét ở mức "CHT".
 * 6. "Chưa đủ dữ liệu": khi không có bất kỳ môn nào được đánh giá (0 môn có dữ liệu).
 */
export type OverallClassificationType =
  | 'Hoàn thành Xuất sắc'
  | 'Hoàn thành Tốt'
  | 'Hoàn thành'
  | 'Chưa hoàn thành'
  | 'Chưa đủ dữ liệu';

export interface OverallClassificationParams {
  studentId?: string;
  studentName?: string;
  className?: string;
  hocBaSummary?: StudentHocBaSummary;
  evaluations?: Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }>;
  subjects?: SubjectScoreBreakdown[];
}

export interface OverallClassificationResult {
  classification: OverallClassificationType;
  isUnlocked: boolean;
  evaluatedCount: number;
  totalCount: number;
  progressPct: number;
  progressText: string;
  progressSubtext: string;
  statusLabel: string;
  scoredSubjects: Array<{ subject: string; score: number }>;
  remarkSubjects: Array<{ subject: string; status: 'T' | 'H' | 'CHT' }>;
}

export function calculateOverallClassification(
  studentIdOrParams: string | OverallClassificationParams,
  hocBaSummaryArg?: StudentHocBaSummary,
  evaluationsArg?: Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }>
): OverallClassificationResult {
  let summary: StudentHocBaSummary | undefined;
  let evaluations: Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }> | undefined;

  if (typeof studentIdOrParams === 'string') {
    summary = hocBaSummaryArg;
    evaluations = evaluationsArg;
    if (!summary) {
      summary = calculateUnifiedHocBaData({ studentId: studentIdOrParams });
    }
  } else {
    summary = studentIdOrParams.hocBaSummary;
    evaluations = studentIdOrParams.evaluations;
    if (!summary && studentIdOrParams.studentId) {
      summary = calculateUnifiedHocBaData({
        studentId: studentIdOrParams.studentId,
        studentName: studentIdOrParams.studentName,
        className: studentIdOrParams.className
      });
    }
  }

  const subjectsList = summary?.subjects || [];
  const totalCount = summary?.totalSubjectsCount || (subjectsList.length > 0 ? subjectsList.length : 9);

  const scoredSubjects: Array<{ subject: string; score: number }> = [];
  const remarkSubjects: Array<{ subject: string; status: 'T' | 'H' | 'CHT' }> = [];
  const seenSubjects = new Set<string>();

  // 1. Duyệt qua các môn từ hocBaSummary
  subjectsList.forEach((sub) => {
    const subName = sub.subject;
    const isScored = isSubjectWithScore(subName);
    const manualEval = evaluations ? evaluations[subName] : undefined;

    let numericScore: number | null = null;
    let remarkStatus: 'T' | 'H' | 'CHT' | null = null;

    if (sub.score !== null && sub.hasRealData) {
      numericScore = sub.score;
    } else if (manualEval && manualEval.score && !isNaN(Number(manualEval.score))) {
      numericScore = Number(manualEval.score);
    }

    if (manualEval && ['T', 'H', 'CHT'].includes(manualEval.dat)) {
      remarkStatus = manualEval.dat;
    } else if (sub.hasRealData && sub.level !== 'Chưa đánh giá') {
      remarkStatus = sub.status;
    }

    if (isScored) {
      if (numericScore !== null) {
        scoredSubjects.push({ subject: subName, score: numericScore });
        seenSubjects.add(subName);
      } else if (remarkStatus !== null) {
        remarkSubjects.push({ subject: subName, status: remarkStatus });
        seenSubjects.add(subName);
      }
    } else {
      if (remarkStatus !== null) {
        remarkSubjects.push({ subject: subName, status: remarkStatus });
        seenSubjects.add(subName);
      } else if (numericScore !== null) {
        scoredSubjects.push({ subject: subName, score: numericScore });
        seenSubjects.add(subName);
      }
    }
  });

  // 2. Kiểm tra thêm các môn có trong evaluations nhưng chưa được duyệt
  if (evaluations) {
    Object.entries(evaluations).forEach(([subName, ev]) => {
      if (seenSubjects.has(subName) || !ev) return;
      const isScored = isSubjectWithScore(subName);
      const numScore = ev.score && !isNaN(Number(ev.score)) ? Number(ev.score) : null;
      const dat = ev.dat && ['T', 'H', 'CHT'].includes(ev.dat) ? ev.dat : null;

      if (isScored) {
        if (numScore !== null) {
          scoredSubjects.push({ subject: subName, score: numScore });
          seenSubjects.add(subName);
        } else if (dat !== null) {
          remarkSubjects.push({ subject: subName, status: dat });
          seenSubjects.add(subName);
        }
      } else {
        if (dat !== null) {
          remarkSubjects.push({ subject: subName, status: dat });
          seenSubjects.add(subName);
        } else if (numScore !== null) {
          scoredSubjects.push({ subject: subName, score: numScore });
          seenSubjects.add(subName);
        }
      }
    });
  }

  const evaluatedCount = scoredSubjects.length + remarkSubjects.length;
  const effectiveTotalCount = Math.max(totalCount, evaluatedCount, 1);

  // Áp dụng quy tắc xếp loại theo yêu cầu:
  let classification: OverallClassificationType = 'Chưa đủ dữ liệu';
  let isUnlocked = false;
  let progressPct = 0;
  let statusLabel = 'Chưa đủ dữ liệu xếp loại';
  let progressText = 'Xếp loại hiện tại: Chưa đủ dữ liệu';
  let progressSubtext = '';

  if (evaluatedCount === 0) {
    classification = 'Chưa đủ dữ liệu';
    isUnlocked = false;
    progressPct = 0;
    statusLabel = 'Chưa đủ dữ liệu xếp loại';
    progressText = 'Xếp loại hiện tại: Chưa đủ dữ liệu';
    progressSubtext = '';
  } else {
    const hasFailingScore = scoredSubjects.some((s) => s.score < 5.0);
    const hasFailingRemark = remarkSubjects.some((s) => s.status === 'CHT');

    const allScoredXuatSac = scoredSubjects.every((s) => s.score >= 9.0);
    const allRemarksXuatSac = remarkSubjects.every((s) => s.status === 'T');

    const allScoredTot = scoredSubjects.every((s) => s.score >= 7.0);
    const allRemarksTot = remarkSubjects.every((s) => s.status === 'T' || s.status === 'H');

    if (hasFailingScore || hasFailingRemark) {
      classification = 'Chưa hoàn thành';
      progressPct = 35;
    } else if (allScoredXuatSac && allRemarksXuatSac) {
      classification = 'Hoàn thành Xuất sắc';
      progressPct = 100;
    } else if (allScoredTot && allRemarksTot) {
      classification = 'Hoàn thành Tốt';
      progressPct = 100;
    } else {
      classification = 'Hoàn thành';
      progressPct = 70;
    }

    isUnlocked = classification === 'Hoàn thành Tốt' || classification === 'Hoàn thành Xuất sắc';
    progressText = `Xếp loại hiện tại: ${classification}`;
    progressSubtext = `(dựa trên ${evaluatedCount}/${effectiveTotalCount} môn đã có đánh giá)`;
    statusLabel = isUnlocked ? `${classification} 🏆` : (evaluatedCount === 0 ? 'Chưa đủ dữ liệu xếp loại' : classification);
  }

  return {
    classification,
    isUnlocked,
    evaluatedCount,
    totalCount: effectiveTotalCount,
    progressPct,
    progressText,
    progressSubtext,
    statusLabel,
    scoredSubjects,
    remarkSubjects
  };
}
