import { normalizeStudentCode } from './studentCode';
import { getLocalCachedExams } from './examStorageService';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface ScanStats {
  totalScanned: number;
  lostIdsFound: number;
  fixedIds: number;
  dryRun: boolean;
}

export interface DuplicateExamGroup {
  title: string;
  exams: Array<{
    id: string;
    originalExamId?: string;
    targetClass?: string;
    grade?: string;
    createdAt?: string;
    submissionsCount?: number;
  }>;
  studentSubmissions: Array<{
    examId: string;
    submittedTime?: string;
    score?: any;
    studentCode: string;
  }>;
  proposedMigration?: {
    fromExamId: string;
    toExamId: string;
    studentCode: string;
    reason: string;
  } | null;
}

export function scanAndFixSubmissions(dryRun: boolean = true): ScanStats {
  const stats: ScanStats = {
    totalScanned: 0,
    lostIdsFound: 0,
    fixedIds: 0,
    dryRun
  };

  const allSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
  if (!allSubsRaw) return stats;

  let allSubs = [];
  try {
    allSubs = JSON.parse(allSubsRaw);
  } catch { return stats; }

  const updatedSubs = allSubs.map((sub: any) => {
    stats.totalScanned++;
    const currentId = sub.studentId || sub.maHs || sub.studentCode || sub.code || '';
    const normalized = normalizeStudentCode(currentId);
    
    if (!normalized || normalized === 'U-4' || normalized === 'HS-TEMP') {
      stats.lostIdsFound++;
      if (!dryRun) {
        sub.studentId = 'LOST-ID';
        stats.fixedIds++;
      }
    }
    return sub;
  });

  if (!dryRun) {
    localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(updatedSubs));
  }

  return stats;
}

/**
 * Kiểm tra các đề trùng tiêu đề và xác định bài nộp của học sinh đang nằm ở đề nào
 */
export async function checkDuplicateExamsAndSubmissions(studentCode: string): Promise<DuplicateExamGroup[]> {
  const cleanStudentCode = normalizeStudentCode(studentCode);
  const cachedExams = getLocalCachedExams() || [];

  const groupedByTitle = new Map<string, any[]>();
  cachedExams.forEach(ex => {
    if (!ex || !ex.id) return;
    const cleanTitle = String(ex.title || '').trim().toLowerCase();
    if (!cleanTitle) return;
    const existing = groupedByTitle.get(cleanTitle) || [];
    existing.push(ex);
    groupedByTitle.set(cleanTitle, existing);
  });

  const duplicateGroups: DuplicateExamGroup[] = [];

  for (const [title, exams] of groupedByTitle.entries()) {
    if (exams.length < 2) continue; // Chỉ xử lý tiêu đề có trùng lặp (> 1 đề)

    const studentSubs: Array<{ examId: string; submittedTime?: string; score?: any; studentCode: string }> = [];

    for (const ex of exams) {
      // 1. Check embedded submissions array
      if (Array.isArray(ex.submissions)) {
        const found = ex.submissions.find((s: any) => {
          const sc = normalizeStudentCode(String(s.studentId || s.studentCode || s.maHs || s.sddcn || ''));
          return sc === cleanStudentCode;
        });
        if (found) {
          studentSubs.push({
            examId: ex.id,
            submittedTime: found.submittedAt || found.submittedTime,
            score: found.score !== undefined ? found.score : found.totalScore,
            studentCode: cleanStudentCode
          });
        }
      }

      // 2. Check Firestore subcollection
      if (db && cleanStudentCode) {
        try {
          const subRef = doc(db, 'exams', ex.id, 'submissions', cleanStudentCode);
          const snap = await getDoc(subRef);
          if (snap.exists()) {
            const data = snap.data();
            if (!studentSubs.some(s => s.examId === ex.id)) {
              studentSubs.push({
                examId: ex.id,
                submittedTime: data.submittedAt || data.submittedTime,
                score: data.score !== undefined ? data.score : data.totalScore,
                studentCode: cleanStudentCode
              });
            }
          }
        } catch {}
      }
    }

    // Determine proposed migration if submission is under misassigned exam
    let proposedMigration: DuplicateExamGroup['proposedMigration'] = null;

    if (studentSubs.length > 0 && exams.length > 1) {
      // Find the exam matching student's class (parsed from studentCode e.g. 3C from 3C26-27-14)
      const studentClassMatch = cleanStudentCode.match(/^([0-9]+[A-Z]+)/i);
      const studentCls = studentClassMatch ? studentClassMatch[1].toUpperCase() : '';

      const targetExam = exams.find(e => {
        if (!e.targetClass) return false;
        const tc = e.targetClass.toUpperCase().replace(/\s+/g, '');
        return studentCls && tc.includes(studentCls);
      }) || exams[0];

      const currentSub = studentSubs[0];
      if (currentSub && currentSub.examId !== targetExam.id) {
        proposedMigration = {
          fromExamId: currentSub.examId,
          toExamId: targetExam.id,
          studentCode: cleanStudentCode,
          reason: `Bài nộp hiện nằm ở đề ID "${currentSub.examId}" nhưng lớp của học sinh (${studentCls}) phù hợp với đề ID "${targetExam.id}".`
        };
      }
    }

    duplicateGroups.push({
      title: exams[0].title,
      exams: exams.map(e => ({
        id: e.id,
        originalExamId: e.originalExamId,
        targetClass: e.targetClass,
        grade: e.grade,
        createdAt: e.createdAt,
        submissionsCount: e.submissionsCount || (Array.isArray(e.submissions) ? e.submissions.length : 0)
      })),
      studentSubmissions: studentSubs,
      proposedMigration
    });
  }

  return duplicateGroups;
}

/**
 * Thực thi chuyển bài nộp về đúng đề thi khi Admin xác nhận (giữ nguyên dữ liệu gốc)
 */
export async function reassignSubmissionToExam(
  fromExamId: string,
  toExamId: string,
  studentCode: string
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanCode = normalizeStudentCode(studentCode);
    if (!cleanCode) return { success: false, message: 'Mã học sinh không hợp lệ.' };

    let subData: any = null;

    // 1. Read existing submission from Firestore
    if (db) {
      try {
        const sourceRef = doc(db, 'exams', fromExamId, 'submissions', cleanCode);
        const sourceSnap = await getDoc(sourceRef);
        if (sourceSnap.exists()) {
          subData = sourceSnap.data();
        }
      } catch {}
    }

    // 2. Fallback read from localStorage
    if (!subData) {
      const allSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
      if (allSubsRaw) {
        try {
          const parsed = JSON.parse(allSubsRaw);
          subData = parsed.find((s: any) => s.examId === fromExamId && normalizeStudentCode(s.studentId || s.maHs || '') === cleanCode);
        } catch {}
      }
    }

    if (!subData) {
      return { success: false, message: `Không tìm thấy bài nộp của học sinh ${cleanCode} tại đề ${fromExamId}.` };
    }

    // 3. Write copy to target exam submission subcollection (preserving original)
    if (db) {
      const targetRef = doc(db, 'exams', toExamId, 'submissions', cleanCode);
      await setDoc(targetRef, {
        ...subData,
        examId: toExamId,
        reassignedFrom: fromExamId,
        reassignedAt: new Date().toISOString()
      }, { merge: true });
    }

    // 4. Update localStorage
    const localKey = `eduplay_student_exam_subs_${cleanCode}`;
    const localRaw = localStorage.getItem(localKey);
    if (localRaw) {
      try {
        const list = JSON.parse(localRaw);
        if (Array.isArray(list)) {
          const updated = list.map((s: any) => {
            if (s.examId === fromExamId) {
              return { ...s, examId: toExamId };
            }
            return s;
          });
          localStorage.setItem(localKey, JSON.stringify(updated));
        }
      } catch {}
    }

    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));

    return {
      success: true,
      message: `Đã sao chép và gán bài nộp của ${cleanCode} sang đề ID "${toExamId}" thành công (giữ nguyên bản gốc tại đề "${fromExamId}").`
    };
  } catch (err: any) {
    return { success: false, message: `Lỗi khi chuyển bài nộp: ${err?.message || String(err)}` };
  }
}

