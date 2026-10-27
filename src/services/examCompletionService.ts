import { getStudentsFromLocalStorage, getClassStudentCount, generateDefaultClassRoster } from './studentStorageService';
import { formatStandardStudentCode, normalizeStudentCode } from './studentCode';

export interface ExamCompletionStats {
  totalStudents: number;
  validCount: number;
  unmatchedCount: number;
  totalAttempts: number;
  unmatchedSubmissions: any[];
  validSubmissions: any[];
}

// In-memory cache to avoid redundant reads and zero Firestore writes on mount/filter/F5
const examCompletionCache = new Map<string, ExamCompletionStats>();

/**
 * Hàm chung tính toán số lượng hoàn thành và thống kê bài nộp cho một đề thi và lớp học.
 * Định nghĩa chuẩn: "Đã làm" = số học sinh trong danh sách lớp được giao (theo Mã HS dạng [CLASS]26-27-N) 
 * có ít nhất một bài nộp hoàn thành cho đề đó. Không đếm lượt làm, không đếm bài nộp ngoài danh sách.
 */
export function getExamCompletion(examId: string, targetClassName: string, examSubmissions: any[] = []): ExamCompletionStats {
  if (!examId) {
    return { totalStudents: 38, validCount: 0, unmatchedCount: 0, totalAttempts: 0, unmatchedSubmissions: [], validSubmissions: [] };
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

  // Gather all submissions from exam prop and localStorage caches
  const allCandidates: any[] = [...(Array.isArray(examSubmissions) ? examSubmissions : [])];

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

  if (typeof window !== 'undefined') {
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
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('eduplay_student_exam_subs_') || key.startsWith('eduplay_student_exam_submissions_'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                if (item) {
                  const sExamId = String(item.examId || item.id || item.exam?.id || '').trim().toLowerCase();
                  if (isExamMatch(sExamId)) {
                    const fallbackCode = key.replace('eduplay_student_exam_subs_', '').replace('eduplay_student_exam_submissions_', '');
                    allCandidates.push({ ...item, fallbackCode });
                  }
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

  allCandidates.forEach((sub) => {
    if (!sub) return;
    const subStudentId = normalizeStudentCode(String(sub.studentId || sub.maHs || sub.studentCode || sub.code || sub.sddcn || sub.fallbackCode || ''));
    const subStudentName = String(sub.studentName || sub.name || sub.fullName || '').trim().toLowerCase();

    // QUY TẮC KHỚP BẮT BUỘC (MỤC 3):
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

  const stats: ExamCompletionStats = {
    totalStudents,
    validCount: matchedStudentCodes.size,
    unmatchedCount: unmatchedSubmissions.length,
    totalAttempts: allCandidates.length,
    unmatchedSubmissions,
    validSubmissions
  };

  return stats;
}
