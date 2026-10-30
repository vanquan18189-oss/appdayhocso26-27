import { getStudentsFromLocalStorage, getClassStudentCount, generateDefaultClassRoster } from './studentStorageService';
import { formatStandardStudentCode, normalizeStudentCode } from './studentCode';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import { ExamPaper } from '../types';

export interface ExamCompletionStats {
  totalStudents: number;
  validCount: number;
  unmatchedCount: number;
  totalAttempts: number;
  unmatchedSubmissions: any[];
  validSubmissions: any[];
  realDocCount: number;
  lastRefreshedAt?: string;
}

// In-memory cache for direct Firestore completion stats
const examCompletionStatsCache = new Map<string, ExamCompletionStats>();

// In-memory cache for raw Firestore submissions (Ground Truth across views)
const globalFirestoreExamSubs = new Map<string, any[]>();
const globalExamRealDocCounts = new Map<string, number>();

export function registerFirestoreExamSubs(examId: string, subs: any[], docCount?: number) {
  if (examId) {
    const key = String(examId).trim().toLowerCase();
    globalFirestoreExamSubs.set(key, subs);
    if (typeof docCount === 'number') {
      globalExamRealDocCounts.set(key, docCount);
    } else {
      globalExamRealDocCounts.set(key, subs.length);
    }
  }
}

export function getCachedExamCompletion(examId: string): ExamCompletionStats | undefined {
  if (!examId) return undefined;
  return examCompletionStatsCache.get(String(examId).trim().toLowerCase());
}

/**
 * Đếm trực tiếp và truy vấn submissions từ Firestore subcollection exams/{examId}/submissions
 * Thực hiện mỗi khi vào trang, đổi bộ lọc, chuyển trang, đóng bảng chi tiết hoặc bấm "Làm mới".
 * Chỉ đọc tối đa số đề trong trang hiện tại (tối đa 10 đề) để kiểm soát hạn mức quota.
 * Hoàn toàn READ-ONLY, không ghi Firestore.
 */
export async function fetchDirectExamCompletions(exams: ExamPaper[]): Promise<Map<string, ExamCompletionStats>> {
  const resultMap = new Map<string, ExamCompletionStats>();
  if (!Array.isArray(exams) || exams.length === 0) return resultMap;

  const nowTime = new Date().toLocaleTimeString('vi-VN');

  // Limit to at most 10 exams per page for quota safety
  const targetExams = exams.slice(0, 10);

  if (!db) {
    // If no db, calculate from local/memory
    targetExams.forEach(exam => {
      if (!exam?.id) return;
      const stats = getExamCompletion(exam.id, exam.targetClass || 'Lớp 3C', exam.submissions);
      stats.lastRefreshedAt = nowTime;
      resultMap.set(exam.id, stats);
      examCompletionStatsCache.set(exam.id.toLowerCase(), stats);
    });
    return resultMap;
  }

  const fetchPromises = targetExams.map(async (exam) => {
    if (!exam?.id) return;

    const examId = exam.id;
    const originalExamId = exam.originalExamId;
    const targetClass = exam.targetClass || '';

    // Determine candidate Firestore doc IDs for this exam
    const cleanExamId = String(examId).trim();
    const cleanOriginalId = originalExamId ? String(originalExamId).trim() : '';
    const examBaseId = (cleanOriginalId || cleanExamId).replace(/^ex-/, '').replace(/^as-/, '').replace(/-class-.*$/, '');

    const classKey = targetClass.replace(/^Lớp\s*/i, '').trim().toLowerCase();
    const standardDocId = `ex-${examBaseId}-class-${classKey}`;
    const legacyDocId = `ex-${examBaseId}-class-lp${classKey}`;

    const candDocIds = Array.from(new Set([
      cleanExamId,
      standardDocId,
      legacyDocId,
      cleanOriginalId
    ].filter(Boolean) as string[]));

    const collectedSubs: any[] = [];
    const seenSubKeys = new Set<string>();
    let totalRealDocCount = 0;

    for (const docId of candDocIds) {
      try {
        const subColRef = collection(db, 'exams', docId, 'submissions');
        const snap = await getDocs(subColRef);
        totalRealDocCount += snap.size;
        snap.forEach(d => {
          const data = d.data();
          const subObj = { ...data, id: d.id, docId: d.id };
          const subKey = `${d.id}__${normalizeStudentCode(data.studentCode || data.maHs || data.studentId || '')}`;
          if (!seenSubKeys.has(subKey)) {
            seenSubKeys.add(subKey);
            collectedSubs.push(subObj);
          }
        });
      } catch (err) {
        console.warn(`Lỗi đọc trực tiếp subcollection exams/${docId}/submissions:`, err);
      }
    }

    // Register into memory store
    registerFirestoreExamSubs(examId, collectedSubs, totalRealDocCount);
    if (originalExamId && originalExamId !== examId) {
      registerFirestoreExamSubs(originalExamId, collectedSubs, totalRealDocCount);
    }

    // Compute unified completion stats
    const stats = getExamCompletion(examId, targetClass, collectedSubs, totalRealDocCount);
    stats.lastRefreshedAt = nowTime;

    resultMap.set(examId, stats);
    examCompletionStatsCache.set(examId.toLowerCase(), stats);
  });

  await Promise.all(fetchPromises);
  return resultMap;
}

/**
 * Hàm chung tính toán số lượng hoàn thành và thống kê bài nộp cho một đề thi và lớp học.
 * Dùng thống nhất cho:
 * 1. Danh sách đề thi (ExamManagementModule)
 * 2. Bảng chi tiết nộp bài (StudentSubmissionDetailModal / Tracking modal)
 * 3. Thống kê & phổ điểm (statsExam)
 * 4. Xuất file Excel (.xlsx)
 *
 * Quy tắc:
 * - "Đã làm" = số học sinh trong danh sách lớp được giao có ít nhất 1 bài nộp hợp lệ.
 * - Một học sinh một lần: nhiều lần nộp của cùng Mã HS chuẩn chỉ tính 1.
 * - Bài nộp không khớp học sinh nào trong danh sách lớp không cộng vào "Đã làm", gom vào "Bài nộp chưa khớp".
 * - Mẫu số lấy theo sĩ số học sinh hiện tại của lớp.
 */
export function getExamCompletion(
  examId: string,
  targetClassName: string,
  explicitSubmissions?: any[],
  realDocCount?: number
): ExamCompletionStats {
  if (!examId) {
    return {
      totalStudents: 38,
      validCount: 0,
      unmatchedCount: 0,
      totalAttempts: 0,
      unmatchedSubmissions: [],
      validSubmissions: [],
      realDocCount: 0
    };
  }

  const cleanClass = (targetClassName || 'Lớp 3C').replace(/^Lớp\s*/i, '').trim().toUpperCase();
  const stdClassName = targetClassName.startsWith('Lớp ') ? targetClassName : `Lớp ${cleanClass}`;
  const rawRoster = getStudentsFromLocalStorage(stdClassName) || generateDefaultClassRoster(stdClassName, 38);
  const classStudentsRoster = rawRoster.map((st, idx) => ({
    ...st,
    stt: st.stt || (idx + 1),
    code: formatStandardStudentCode(st.code, cleanClass, st.stt || (idx + 1)),
    name: st.name || st.fullName || `Học sinh ${idx + 1}`,
    fullName: st.fullName || st.name || `Học sinh ${idx + 1}`
  }));

  const totalStudents = Math.max(classStudentsRoster.length, getClassStudentCount(stdClassName, 38), 1);

  // Gather candidate submissions
  const allCandidates: any[] = [];
  const targetExamId = String(examId || '').trim().toLowerCase();
  const targetBaseId = targetExamId.replace(/-class-.*$/, '').replace(/^ex-/, '');

  const isExamMatch = (subExamId: string) => {
    const cleanSub = String(subExamId || '').trim().toLowerCase();
    if (!cleanSub || !targetExamId) return false;
    if (cleanSub === targetExamId) return true;
    const subBaseId = cleanSub.replace(/-class-.*$/, '').replace(/^ex-/, '');
    if (targetBaseId && subBaseId && targetBaseId === subBaseId) return true;
    return false;
  };

  // 1. Explicit submissions passed directly (e.g. from fetchDirectExamCompletions)
  if (Array.isArray(explicitSubmissions) && explicitSubmissions.length > 0) {
    explicitSubmissions.forEach(sub => {
      if (sub) allCandidates.push(sub);
    });
  }

  // 2. Global Firestore submissions in memory
  if (globalFirestoreExamSubs.size > 0) {
    globalFirestoreExamSubs.forEach((subs, sExamId) => {
      if (isExamMatch(sExamId) && Array.isArray(subs)) {
        subs.forEach(item => {
          if (item) allCandidates.push(item);
        });
      }
    });
  }

  // 3. Fallback to localStorage caches only if no candidates found yet
  if (allCandidates.length === 0 && typeof window !== 'undefined') {
    try {
      const examSubsRaw = localStorage.getItem(`eduplay_exam_subs_${examId}`);
      if (examSubsRaw) {
        const parsed = JSON.parse(examSubsRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            if (item) allCandidates.push(item);
          });
        }
      }
    } catch {}

    try {
      const allSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
      if (allSubsRaw) {
        const parsed = JSON.parse(allSubsRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            if (item) {
              const sExamId = String(item.examId || item.id || item.exam?.id || '').trim().toLowerCase();
              if (isExamMatch(sExamId)) {
                allCandidates.push(item);
              }
            }
          });
        }
      }
    } catch {}
  }

  const validSubmissions: any[] = [];
  const unmatchedSubmissions: any[] = [];
  const matchedStudentCodes = new Set<string>();

  allCandidates.forEach((sub) => {
    if (!sub) return;
    const subStudentId = normalizeStudentCode(String(sub.studentCode || sub.maHs || sub.studentId || sub.code || sub.sddcn || sub.fallbackCode || ''));
    const subStudentName = String(sub.studentName || sub.name || sub.fullName || '').trim().toLowerCase();

    // QUY TẮC KHỚP BẮT BUỘC:
    // Một bài nộp chỉ thuộc về một học sinh khi và chỉ khi studentCode (đã chuẩn hóa) bằng đúng Mã HS của học sinh đó.
    // CẤM khớp lỏng theo tên hay dự phòng.
    const matchedRoster = classStudentsRoster.find(st => {
      const rosterCode = st.code.toUpperCase();
      const candCodes = [sub.studentCode, sub.maHs, sub.studentId, sub.code, sub.docId, sub.id]
        .filter(Boolean)
        .map(c => normalizeStudentCode(String(c)));
      return candCodes.some(c => c === rosterCode);
    });

    if (matchedRoster) {
      const standardizedCode = matchedRoster.code.toUpperCase();
      if (!matchedStudentCodes.has(standardizedCode)) {
        matchedStudentCodes.add(standardizedCode);
        validSubmissions.push({
          ...sub,
          standardizedStudentCode: standardizedCode,
          studentName: matchedRoster.fullName
        });
      }
    } else {
      // Unmatched submission
      let reason = 'Mã học sinh không tồn tại trong danh sách lớp';
      if (!subStudentId || subStudentId === 'u-4' || subStudentId === 'hs-temp') {
        reason = 'Sử dụng Auth UID hoặc mã tạm thời không khớp Mã HS chuẩn';
      } else if (!subStudentId.includes(cleanClass)) {
        reason = `Mã HS (${subStudentId}) không thuộc lớp ${cleanClass}`;
      }
      unmatchedSubmissions.push({
        ...sub,
        unmatchedReason: reason,
        rawIdentifier: subStudentId || subStudentName || 'Không rõ'
      });
    }
  });

  const resolvedDocCount = typeof realDocCount === 'number'
    ? realDocCount
    : (globalExamRealDocCounts.get(targetExamId) ?? allCandidates.length);

  const stats: ExamCompletionStats = {
    totalStudents,
    validCount: matchedStudentCodes.size,
    unmatchedCount: unmatchedSubmissions.length,
    totalAttempts: allCandidates.length,
    unmatchedSubmissions,
    validSubmissions,
    realDocCount: resolvedDocCount
  };

  return stats;
}
