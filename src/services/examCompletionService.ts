import { getStudentsFromLocalStorage, getClassStudentCount, generateDefaultClassRoster } from './studentStorageService';
import { formatStandardStudentCode, normalizeStudentCode, isSameStudent, extractFullStudentCode } from './studentCode';
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
  violationCount: number;
  timeoutCount: number;
  lastRefreshedAt?: string;
  error?: string;
}

export function isSubmissionViolationLocked(sub: any): boolean {
  if (!sub) return false;
  if (sub.isViolationLocked === true || sub.isViolationLock === true) return true;
  const reason = String(sub.violationReason || '').toLowerCase();
  if (reason.includes('vi phạm') || reason.includes('rời khỏi') || reason.includes('chuyển tab') || reason.includes('rời màn hình')) return true;
  const rank = String(sub.rank || '').toLowerCase();
  if (rank.includes('vi phạm') || rank.includes('khóa do vi phạm')) return true;
  const feedback = String(sub.feedback || '').toLowerCase();
  if (feedback.includes('vi phạm quy chế') || feedback.includes('rời màn hình')) return true;
  return false;
}

export function isSubmissionTimeoutLocked(sub: any): boolean {
  if (!sub) return false;
  if (isSubmissionViolationLocked(sub)) return false;
  if (sub.isTimeoutLock === true || sub.isTimeout === true || sub.timeout === true || sub.submitReason === 'timeout') return true;
  const reason = String(sub.violationReason || '').toLowerCase();
  if (reason.includes('hết thời gian') || reason.includes('hết giờ')) return true;
  const feedback = String(sub.feedback || '').toLowerCase();
  if (feedback.includes('hết thời gian') || feedback.includes('hết giờ') || feedback.includes('tự động nộp do hết')) return true;
  const rank = String(sub.rank || '').toLowerCase();
  if (rank.includes('hết giờ') || rank.includes('he_gio')) return true;
  return false;
}

// In-memory cache for direct Firestore completion stats
const examCompletionStatsCache = new Map<string, ExamCompletionStats>();

// In-memory cache for raw Firestore submissions (Ground Truth across views)
const globalFirestoreExamSubs = new Map<string, any[]>();
const globalExamRealDocCounts = new Map<string, number>();

// Tombstone map preventing deleted/retake submissions from being resurrected by stale snapshots or caches
const retakeTombstoneMap = new Map<string, number>();

function getExamBaseKey(examId: string): string {
  return String(examId || '')
    .trim()
    .toLowerCase()
    .replace(/^ex-/, '')
    .replace(/^as-/, '')
    .replace(/-class-.*$/, '');
}

export function setRetakeTombstone(examId: string, studentCode: string, durationMs: number = 30000): void {
  const normCode = normalizeStudentCode(studentCode);
  const baseKey = getExamBaseKey(examId);
  if (!normCode || !baseKey) return;
  retakeTombstoneMap.set(`${baseKey}__${normCode}`, Date.now() + durationMs);
}

export function clearRetakeTombstone(examId: string, studentCode: string): void {
  const normCode = normalizeStudentCode(studentCode);
  const baseKey = getExamBaseKey(examId);
  if (!normCode || !baseKey) return;
  retakeTombstoneMap.delete(`${baseKey}__${normCode}`);
}

export function isStudentRetakeTombstoned(examId: string, studentOrSub: any): boolean {
  const code = typeof studentOrSub === 'string'
    ? normalizeStudentCode(studentOrSub)
    : extractFullStudentCode(studentOrSub);
  const baseKey = getExamBaseKey(examId);
  if (!code || !baseKey) return false;
  const exp = retakeTombstoneMap.get(`${baseKey}__${code}`);
  if (!exp) return false;
  if (Date.now() > exp) {
    retakeTombstoneMap.delete(`${baseKey}__${code}`);
    return false;
  }
  return true;
}

export function purgeExamCompletionCacheForStudent(
  examId: string,
  studentCode: string,
  candDocIds: string[] = []
): void {
  const normCode = normalizeStudentCode(studentCode);
  if (!normCode) return;

  setRetakeTombstone(examId, normCode, 30000);

  const allExamKeys = new Set<string>([
    String(examId || '').trim().toLowerCase(),
    ...candDocIds.map(id => String(id || '').trim().toLowerCase())
  ].filter(Boolean));

  const targetBase = getExamBaseKey(examId);

  globalFirestoreExamSubs.forEach((subs, key) => {
    if (allExamKeys.has(key) || (targetBase && getExamBaseKey(key) === targetBase)) {
      const filtered = Array.isArray(subs)
        ? subs.filter(s => !isSameStudent(normCode, s) && extractFullStudentCode(s) !== normCode)
        : [];
      globalFirestoreExamSubs.set(key, filtered);
      globalExamRealDocCounts.set(key, filtered.length);
    }
  });

  examCompletionStatsCache.forEach((_, key) => {
    if (allExamKeys.has(key) || (targetBase && getExamBaseKey(key) === targetBase)) {
      examCompletionStatsCache.delete(key);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(`eduplay_exam_completion_${key}`);
        } catch {}
      }
    }
  });
}

export function registerFirestoreExamSubs(examId: string, subs: any[], docCount?: number) {
  if (examId) {
    const key = String(examId).trim().toLowerCase();
    const filtered = Array.isArray(subs)
      ? subs.filter(s => !isStudentRetakeTombstoned(examId, s))
      : [];
    globalFirestoreExamSubs.set(key, filtered);
    if (typeof docCount === 'number') {
      globalExamRealDocCounts.set(key, filtered.length);
    } else {
      globalExamRealDocCounts.set(key, filtered.length);
    }
  }
}

export function getCachedExamCompletion(examId: string): ExamCompletionStats | undefined {
  if (!examId) return undefined;
  const key = String(examId).trim().toLowerCase();
  const memory = examCompletionStatsCache.get(key);
  if (memory) return memory;

  if (typeof window !== 'undefined') {
    try {
      const sessionRaw = sessionStorage.getItem(`eduplay_exam_completion_${key}`);
      if (sessionRaw) {
        const parsed = JSON.parse(sessionRaw);
        if (parsed && typeof parsed === 'object') {
          examCompletionStatsCache.set(key, parsed);
          return parsed;
        }
      }
    } catch {}
  }
  return undefined;
}

/**
 * Đếm trực tiếp và truy vấn submissions từ Firestore subcollection exams/{examId}/submissions
 */
export async function fetchDirectExamCompletions(exams: ExamPaper[]): Promise<Map<string, ExamCompletionStats>> {
  const resultMap = new Map<string, ExamCompletionStats>();
  if (!Array.isArray(exams) || exams.length === 0) return resultMap;

  const nowTime = new Date().toLocaleTimeString('vi-VN');
  const targetExams = exams.slice(0, 10);

  if (!db) {
    targetExams.forEach(exam => {
      if (!exam?.id) return;
      const stats = getExamCompletion(exam.id, exam.targetClass || '', exam.submissions);
      stats.lastRefreshedAt = nowTime;
      resultMap.set(exam.id, stats);
      const key = exam.id.toLowerCase();
      examCompletionStatsCache.set(key, stats);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`eduplay_exam_completion_${key}`, JSON.stringify(stats));
        } catch {}
      }
    });
    return resultMap;
  }

  const fetchPromises = targetExams.map(async (exam) => {
    if (!exam?.id) return;

    const examId = exam.id;
    const originalExamId = exam.originalExamId;
    const targetClass = exam.targetClass || '';

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
    let fetchError: string | undefined = undefined;

    for (const docId of candDocIds) {
      try {
        const subColRef = collection(db, 'exams', docId, 'submissions');
        const snap = await getDocs(subColRef);
        totalRealDocCount += snap.size;
        snap.forEach(d => {
          const data = d.data();
          const subObj = { ...data, id: d.id, docId: d.id };
          if (isStudentRetakeTombstoned(examId, subObj)) return;
          const subKey = `${d.id}__${normalizeStudentCode(data.studentCode || data.maHs || data.studentId || '')}`;
          if (!seenSubKeys.has(subKey)) {
            seenSubKeys.add(subKey);
            collectedSubs.push(subObj);
          }
        });
      } catch (err: any) {
        console.error(`Lỗi khi đọc bài nộp cho đề ${exam.title || docId} (ID: ${docId}):`, err);
        fetchError = err?.message || String(err);
      }
    }

    if (Array.isArray(exam.submissions) && exam.submissions.length > 0) {
      exam.submissions.forEach((sub: any) => {
        if (!sub || isStudentRetakeTombstoned(examId, sub)) return;
        const subKey = `${sub.id || sub.studentCode}__${normalizeStudentCode(sub.studentCode || sub.maHs || sub.studentId || '')}`;
        if (!seenSubKeys.has(subKey)) {
          seenSubKeys.add(subKey);
          collectedSubs.push(sub);
        }
      });
    }

    registerFirestoreExamSubs(examId, collectedSubs, totalRealDocCount);
    if (originalExamId && originalExamId !== examId) {
      registerFirestoreExamSubs(originalExamId, collectedSubs, totalRealDocCount);
    }

    const stats = getExamCompletion(examId, targetClass, collectedSubs, totalRealDocCount);
    stats.lastRefreshedAt = nowTime;
    if (fetchError && collectedSubs.length === 0) {
      stats.error = fetchError;
    }

    resultMap.set(examId, stats);
    const key = examId.toLowerCase();
    examCompletionStatsCache.set(key, stats);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`eduplay_exam_completion_${key}`, JSON.stringify(stats));
      } catch {}
    }
  });

  await Promise.all(fetchPromises);
  return resultMap;
}

/**
 * Hàm chung tính toán số lượng hoàn thành và thống kê bài nộp cho một đề thi và lớp học.
 * Sử dụng duy nhất hàm isSameStudent (so khớp chính xác mã đầy đủ có tiền tố lớp + kiểm tra lớp).
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
      realDocCount: 0,
      violationCount: 0,
      timeoutCount: 0
    };
  }

  const cleanClass = (targetClassName || 'Lớp 3C').replace(/^Lớp\s*/i, '').trim().toUpperCase();
  const stdClassName = targetClassName.startsWith('Lớp ') ? targetClassName : `Lớp ${cleanClass}`;
  const rawRoster = getStudentsFromLocalStorage(stdClassName) || generateDefaultClassRoster(stdClassName, 38);
  const classStudentsRoster = rawRoster.map((st, idx) => ({
    ...st,
    stt: st.stt || (idx + 1),
    code: formatStandardStudentCode(st.code) || normalizeStudentCode(st.code),
    className: st.className || stdClassName,
    name: st.name || st.fullName || `Học sinh ${idx + 1}`,
    fullName: st.fullName || st.name || `Học sinh ${idx + 1}`
  }));

  const totalStudents = Math.max(classStudentsRoster.length, getClassStudentCount(stdClassName, 38), 1);

  const allCandidates: any[] = [];
  const candidateKeys = new Set<string>();
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

  const addCandidate = (sub: any) => {
    if (!sub || isStudentRetakeTombstoned(examId, sub)) return;
    const subId = String(sub.id || sub.docId || '').trim();
    const stCode = extractFullStudentCode(sub) || normalizeStudentCode(String(sub.studentCode || sub.maHs || sub.studentId || sub.code || ''));
    const uniqueKey = subId ? `${subId}__${stCode}` : `${stCode}__${JSON.stringify(sub.answers || {})}`;
    if (!candidateKeys.has(uniqueKey)) {
      candidateKeys.add(uniqueKey);
      allCandidates.push(sub);
    }
  };

  if (Array.isArray(explicitSubmissions) && explicitSubmissions.length > 0) {
    explicitSubmissions.forEach(sub => addCandidate(sub));
  }

  if (globalFirestoreExamSubs.size > 0) {
    globalFirestoreExamSubs.forEach((subs, sExamId) => {
      if (isExamMatch(sExamId) && Array.isArray(subs)) {
        subs.forEach(item => addCandidate(item));
      }
    });
  }

  if (typeof window !== 'undefined') {
    try {
      const examSubsRaw = localStorage.getItem(`eduplay_exam_subs_${examId}`);
      if (examSubsRaw) {
        const parsed = JSON.parse(examSubsRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => addCandidate(item));
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
                addCandidate(item);
              }
            }
          });
        }
      }
    } catch {}

    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key && (key.startsWith('eduplay_student_exam_subs_') || key.startsWith('eduplay_student_exam_submissions_'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                if (item && isExamMatch(item.examId || item.id || item.exam?.id)) {
                  // Không dùng fallbackCode cắt số cuối; chỉ nhận bản ghi có mã đầy đủ hợp lệ bên trong
                  addCandidate(item);
                }
              });
            }
          }
        }
      }
    } catch {}
  }

  const validSubmissions: any[] = [];
  const unmatchedSubmissions: any[] = [];
  const matchedStudentCodes = new Set<string>();
  const violationStudentCodes = new Set<string>();
  const timeoutStudentCodes = new Set<string>();

  const usedCandidateIndices = new Set<number>();

  // So khớp học sinh trong danh sách lớp bằng hàm duy nhất isSameStudent
  classStudentsRoster.forEach(st => {
    const stdCode = normalizeStudentCode(st.code);
    if (!stdCode) return;

    const matchIdx = allCandidates.findIndex((sub, idx) => {
      if (usedCandidateIndices.has(idx) || !sub) return false;
      return isSameStudent(st, sub, cleanClass);
    });

    if (matchIdx !== -1) {
      usedCandidateIndices.add(matchIdx);
      const sub = allCandidates[matchIdx];
      matchedStudentCodes.add(stdCode);
      validSubmissions.push({
        ...sub,
        standardizedStudentCode: stdCode,
        studentName: st.fullName
      });

      if (isSubmissionViolationLocked(sub)) {
        violationStudentCodes.add(stdCode);
      } else if (isSubmissionTimeoutLocked(sub)) {
        timeoutStudentCodes.add(stdCode);
      }
    }
  });

  // Collect unmatched candidates
  allCandidates.forEach((sub, idx) => {
    if (usedCandidateIndices.has(idx) || !sub) return;
    const subStudentId = normalizeStudentCode(String(sub.studentCode || sub.maHs || sub.studentId || sub.code || sub.sddcn || ''));
    const subStudentName = String(sub.studentName || sub.name || sub.fullName || '').trim().toLowerCase();

    let reason = 'Mã học sinh không tồn tại trong danh sách lớp';
    if (!subStudentId || subStudentId === 'U-4' || subStudentId === 'HS-TEMP') {
      reason = 'Sử dụng Auth UID hoặc mã tạm thời không khớp Mã HS chuẩn';
    } else if (!subStudentId.startsWith(cleanClass)) {
      reason = `Mã HS (${subStudentId}) không thuộc lớp ${cleanClass}`;
    }
    unmatchedSubmissions.push({
      ...sub,
      unmatchedReason: reason,
      rawIdentifier: subStudentId || subStudentName || 'Không rõ'
    });
  });

  const resolvedDocCount = typeof realDocCount === 'number'
    ? realDocCount
    : (globalExamRealDocCounts.get(targetExamId) ?? allCandidates.length);

  const stats: ExamCompletionStats = {
    totalStudents,
    validCount: matchedStudentCodes.size,
    violationCount: violationStudentCodes.size,
    timeoutCount: timeoutStudentCodes.size,
    unmatchedCount: unmatchedSubmissions.length,
    totalAttempts: allCandidates.length,
    unmatchedSubmissions,
    validSubmissions,
    realDocCount: resolvedDocCount
  };

  return stats;
}
