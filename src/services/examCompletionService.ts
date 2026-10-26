import { getStudentsFromLocalStorage, getDefault3CRoster, getDefault5BRoster, getClassStudentCount } from './studentStorageService';
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
  const rawRoster = getStudentsFromLocalStorage(stdClassName) || (cleanClass.includes('3C') ? getDefault3CRoster() : getDefault5BRoster());
  const classStudentsRoster = (rawRoster && rawRoster.length > 0 ? rawRoster : (cleanClass.includes('3C') ? getDefault3CRoster() : getDefault5BRoster())).map((st, idx) => ({
    ...st,
    stt: st.stt || (idx + 1),
    code: formatStandardStudentCode(st.code, cleanClass, st.stt || (idx + 1)),
    name: st.name || st.fullName || `Học sinh ${idx + 1}`,
    fullName: st.fullName || st.name || `Học sinh ${idx + 1}`
  }));

  const totalStudents = Math.max(classStudentsRoster.length, getClassStudentCount(stdClassName, 38), 1);

  // Gather all submissions from exam prop and localStorage caches
  const allCandidates: any[] = [...(Array.isArray(examSubmissions) ? examSubmissions : [])];

  if (typeof window !== 'undefined') {
    try {
      const allSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
      if (allSubsRaw) {
        const parsed = JSON.parse(allSubsRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            if (item) {
              const sExamId = String(item.examId || item.id || item.exam?.id || '').trim().toLowerCase();
              if (sExamId === String(examId).trim().toLowerCase()) {
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
                  if (sExamId === String(examId).trim().toLowerCase()) {
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
    const subStudentId = normalizeStudentCode(String(sub.studentId || sub.maHs || sub.studentCode || sub.code || sub.sddcn || sub.fallbackCode || '').trim());
    const subStudentName = String(sub.studentName || sub.name || sub.fullName || '').trim().toLowerCase();

    // Try matching roster student
    const matchedRoster = classStudentsRoster.find(st => {
      const rosterCode = normalizeStudentCode(st.code);
      const rosterName = st.fullName.trim().toLowerCase();
      const candCodes = [subStudentId, sub.studentCode, sub.maHs, sub.studentId, sub.sddcn].filter(Boolean).map(c => normalizeStudentCode(String(c).trim()));
      
      const isCodeMatch = candCodes.some(c => c === rosterCode || formatStandardStudentCode(c, cleanClass) === rosterCode);
      const isNameMatch = subStudentName && subStudentName.length > 2 && (subStudentName === rosterName || subStudentName.includes(rosterName) || rosterName.includes(subStudentName));
      return isCodeMatch || isNameMatch;
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
