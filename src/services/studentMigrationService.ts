import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  runTransaction 
} from 'firebase/firestore';
import { StudentRecord } from '../types';
import { normalizeStudentCode, normalizeStudentName } from './studentCode';
import { removeUndefined } from './teacherStorageService';
import { invalidateAllSubmissionsCache } from './hocBaDataService';
import { EXAM_DRAFTS_COLLECTION, getDraftStorageKey } from './examDraftService';
// import { safeStorage } from '../utils/safeStorage';

export interface MismatchRecord {
  id: string;
  sourceType: 'exam' | 'assignment' | 'student_result' | 'draft';
  containerId: string; // examId or assignmentId
  containerTitle: string;
  currentCode: string;
  currentName: string;
  targetStudentCode: string;
  targetStudentName: string;
  targetClass: string;
  targetStudentId: string;
  score?: string | number;
  submittedAt?: string;
  rawRecord: any;
}

/**
 * Đổi mã học sinh tự động và đồng bộ tất cả bài nộp, bản nháp, kết quả học tập
 * từ mã cũ sang mã mới trên Firestore và LocalStorage
 */
export async function renameStudentCodeAcrossSystem(
  oldCodeRaw: string,
  newCodeRaw: string,
  studentId?: string,
  studentName?: string
): Promise<{ updatedCount: number; details: string[] }> {
  const oldCode = normalizeStudentCode(oldCodeRaw);
  const newCode = normalizeStudentCode(newCodeRaw);

  if (!oldCode || !newCode || oldCode === newCode) {
    return { updatedCount: 0, details: [] };
  }

  let updatedCount = 0;
  const details: string[] = [];

  // 1. Cập nhật LocalStorage
  try {
    // 1.1 Đổi kho bài nộp kiểm tra
    const oldExamSubsKey = `eduplay_student_exam_subs_${oldCode}`;
    const newExamSubsKey = `eduplay_student_exam_subs_${newCode}`;
    const oldExamSubs = localStorage.getItem(oldExamSubsKey);
    if (oldExamSubs) {
      try {
        const parsed = JSON.parse(oldExamSubs);
        if (Array.isArray(parsed)) {
          const updated = parsed.map((s: any) => ({
            ...s,
            studentCode: newCode,
            studentId: studentId || newCode,
            maHs: newCode,
            code: newCode
          }));
          localStorage.setItem(newExamSubsKey, JSON.stringify(updated));
          localStorage.removeItem(oldExamSubsKey);
          updatedCount += updated.length;
          details.push(`LocalStorage: Đổi kho đề kiểm tra (${updated.length} bài)`);
        }
      } catch {}
    }

    // 1.2 Đổi kho bài nộp bài tập
    const oldHwSubsKey = `eduplay_student_submissions_${oldCode}`;
    const newHwSubsKey = `eduplay_student_submissions_${newCode}`;
    const oldHwSubs = localStorage.getItem(oldHwSubsKey);
    if (oldHwSubs) {
      try {
        const parsed = JSON.parse(oldHwSubs);
        if (Array.isArray(parsed)) {
          const updated = parsed.map((s: any) => ({
            ...s,
            studentCode: newCode,
            studentId: studentId || newCode,
            maHs: newCode,
            code: newCode
          }));
          localStorage.setItem(newHwSubsKey, JSON.stringify(updated));
          localStorage.removeItem(oldHwSubsKey);
          updatedCount += updated.length;
          details.push(`LocalStorage: Đổi kho bài tập (${updated.length} bài)`);
        }
      } catch {}
    }

    // 1.3 Đổi hồ sơ game / xu thưởng
    const oldProfileKey = `eduplay_student_game_profile_${oldCode}`;
    const newProfileKey = `eduplay_student_game_profile_${newCode}`;
    const oldProfile = localStorage.getItem(oldProfileKey);
    if (oldProfile) {
      try {
        const parsed = JSON.parse(oldProfile);
        parsed.studentId = newCode;
        localStorage.setItem(newProfileKey, JSON.stringify(parsed));
        localStorage.removeItem(oldProfileKey);
        updatedCount++;
        details.push(`LocalStorage: Đổi hồ sơ xu thưởng Game`);
      } catch {}
    }

    // 1.4 Đổi kho bài nộp tổng hợp `eduplay_all_exam_submissions`
    const allExamSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
    if (allExamSubsRaw) {
      try {
        const parsedAll = JSON.parse(allExamSubsRaw);
        if (Array.isArray(parsedAll)) {
          let modified = false;
          const updatedAll = parsedAll.map((s: any) => {
            const sCode = normalizeStudentCode(s.studentCode || s.studentId || s.code || s.maHs || '');
            if (sCode === oldCode) {
              modified = true;
              updatedCount++;
              return {
                ...s,
                studentCode: newCode,
                studentId: studentId || newCode,
                maHs: newCode,
                code: newCode
              };
            }
            return s;
          });
          if (modified) {
            localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(updatedAll));
            details.push(`LocalStorage: Cập nhật kho all_exam_submissions`);
          }
        }
      } catch {}
    }

    // 1.5 Cập nhật phiên đăng nhập hiện tại nếu trùng khớp
    const sessionStr = localStorage.getItem('eduplay_student_session');
    if (sessionStr) {
      try {
        const parsedSess = JSON.parse(sessionStr);
        const sCode = normalizeStudentCode(parsedSess.code || parsedSess.studentCode || parsedSess.maHs || parsedSess.id || '');
        if (sCode === oldCode) {
          parsedSess.code = newCode;
          parsedSess.studentCode = newCode;
          parsedSess.maHs = newCode;
          if (studentName) {
            parsedSess.name = studentName;
            parsedSess.fullName = studentName;
          }
          localStorage.setItem('eduplay_student_session', JSON.stringify(parsedSess));
          window.dispatchEvent(new CustomEvent('eduplay_student_session_updated', { detail: parsedSess }));
        }
      } catch {}
    }
  } catch (err) {
    console.warn('Lỗi khi cập nhật LocalStorage cho mã học sinh mới:', err);
  }

  // 2. Cập nhật Firestore
  if (db) {
    try {
      // 2.1 Cập nhật toàn bộ collection `exams`
      const examsSnap = await getDocs(collection(db, 'exams'));
      for (const examDoc of examsSnap.docs) {
        const examData = examDoc.data();
        const examId = examDoc.id;
        let examModified = false;

        // Cập nhật mảng submissions nhúng (chỉ khớp theo mã cũ, tuyệt đối không khớp theo họ tên)
        if (Array.isArray(examData.submissions) && examData.submissions.length > 0) {
          const updatedSubs = examData.submissions.map((s: any) => {
            const sCode = normalizeStudentCode(s.studentCode || s.studentId || s.code || s.maHs || '');

            const isMatch = sCode === oldCode;
            if (isMatch) {
              examModified = true;
              updatedCount++;
              return {
                ...s,
                studentCode: newCode,
                studentId: studentId || newCode,
                maHs: newCode,
                code: newCode,
                studentName: studentName || s.studentName || s.name || ''
              };
            }
            return s;
          });

          if (examModified) {
            try {
              const masterRef = doc(db, 'exams', examId);
              await runTransaction(db, async (tx) => {
                tx.update(masterRef, { submissions: updatedSubs, updatedAt: new Date().toISOString() });
              });
              details.push(`Firestore: Cập nhật đề thi ${examData.title || examId}`);
            } catch (txErr) {
              console.warn(`Lỗi transaction đề thi ${examId}:`, txErr);
            }
          }
        }

        // Cập nhật subcollection `exams/{examId}/submissions/` (chỉ khớp theo mã cũ, không khớp theo tên)
        try {
          const subColSnap = await getDocs(collection(db, 'exams', examId, 'submissions'));
          for (const subDoc of subColSnap.docs) {
            const subData = subDoc.data();
            const sCode = normalizeStudentCode(subData.studentCode || subData.studentId || subData.code || subData.maHs || subDoc.id);

            if (sCode === oldCode) {
              const updatedSubPayload = {
                ...subData,
                studentCode: newCode,
                studentId: studentId || newCode,
                maHs: newCode,
                code: newCode,
                studentName: studentName || subData.studentName || subData.name || '',
                updatedAt: new Date().toISOString()
              };

              // Tạo document mới dưới newCode
              const newSubRef = doc(db, 'exams', examId, 'submissions', newCode);
              await setDoc(newSubRef, removeUndefined(updatedSubPayload), { merge: true });

              // Xóa document cũ nếu ID là oldCode
              if (subDoc.id === oldCode) {
                try {
                  await deleteDoc(doc(db, 'exams', examId, 'submissions', oldCode));
                } catch {}
              }
              updatedCount++;
            }
          }
        } catch {}
      }

      // 2.2 Cập nhật bản nháp `exam_drafts`
      try {
        const draftsSnap = await getDocs(collection(db, EXAM_DRAFTS_COLLECTION));
        for (const draftDoc of draftsSnap.docs) {
          const draftData = draftDoc.data();
          const dCode = normalizeStudentCode(draftData.studentCode || draftDoc.id.split('_')[0] || '');
          if (dCode === oldCode) {
            const exId = draftData.examId || draftDoc.id.split('_')[1];
            const newDraftId = getDraftStorageKey(newCode, exId);
            const newDraftData = {
              ...draftData,
              id: newDraftId,
              studentCode: newCode,
              studentId: studentId || newCode,
              updatedAt: new Date().toISOString()
            };
            await setDoc(doc(db, EXAM_DRAFTS_COLLECTION, newDraftId), removeUndefined(newDraftData), { merge: true });
            try {
              await deleteDoc(doc(db, EXAM_DRAFTS_COLLECTION, draftDoc.id));
            } catch {}
            updatedCount++;
            details.push(`Firestore: Chuyển bản nháp đề thi ${exId}`);
          }
        }
      } catch {}

      // 2.3 Cập nhật `student_results`
      try {
        const oldResultRef = doc(db, 'student_results', oldCode);
        const newResultRef = doc(db, 'student_results', newCode);
        const oldResultSnap = await getDocs(collection(db, 'student_results'));
        for (const rDoc of oldResultSnap.docs) {
          if (normalizeStudentCode(rDoc.id) === oldCode) {
            const rData = rDoc.data();
            await setDoc(newResultRef, removeUndefined({
              ...rData,
              studentCode: newCode,
              updatedAt: new Date().toISOString()
            }), { merge: true });
            try {
              await deleteDoc(rDoc.ref);
            } catch {}
            updatedCount++;
            details.push(`Firestore: Di chuyển bảng điểm student_results`);
          }
        }
      } catch {}
    } catch (fsErr) {
      console.error('Lỗi khi cập nhật Firestore cho mã học sinh mới:', fsErr);
    }
  }

  // 3. Xóa cache và phát sự kiện đồng bộ
  try {
    invalidateAllSubmissionsCache();
  } catch {}
  window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
  window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
  window.dispatchEvent(new Event('eduplay_students_updated'));
  window.dispatchEvent(new Event('storage'));

  return { updatedCount, details };
}

/**
 * Quét toàn bộ hệ thống để tìm kiếm các bài nộp hoặc bản nháp mang mã cũ chưa khớp
 * với mã học sinh hiện tại (Đối chiếu theo studentId nội bộ hoặc Họ tên)
 */
export async function scanForMismatchedSubmissions(
  allStudentsList: StudentRecord[]
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];
  if (!Array.isArray(allStudentsList) || allStudentsList.length === 0) {
    return mismatches;
  }

  // Bản đồ tìm kiếm học sinh chính thức
  const studentByNormalizedCode = new Map<string, StudentRecord>();
  const studentByInternalId = new Map<string, StudentRecord>();
  const studentByNameList: Array<{ normName: string; student: StudentRecord }> = [];

  allStudentsList.forEach((st) => {
    if (!st) return;
    const normCode = normalizeStudentCode(st.code);
    if (normCode) {
      studentByNormalizedCode.set(normCode, st);
    }
    if (st.id) {
      studentByInternalId.set(st.id, st);
      studentByInternalId.set(st.id.toLowerCase(), st);
    }
    if (st.sddcn) {
      studentByInternalId.set(st.sddcn, st);
    }
    const nameStr = st.fullName || st.name || '';
    if (nameStr) {
      studentByNameList.push({
        normName: normalizeStudentName(nameStr),
        student: st
      });
    }
  });

  const checkAndAddMismatch = (
    sub: any,
    containerId: string,
    containerTitle: string,
    sourceType: 'exam' | 'assignment' | 'student_result' | 'draft'
  ) => {
    if (!sub) return;
    const currentCode = normalizeStudentCode(sub.studentCode || sub.code || sub.maHs || sub.studentId || '');
    const currentName = sub.studentName || sub.name || sub.fullName || '';
    const normCurrentName = normalizeStudentName(currentName);
    const subInternalId = sub.studentId || sub.id || '';

    // 1. Kiểm tra xem mã hiện tại đã thuộc về học sinh chính thức nào chưa
    const existingStudentWithCode = currentCode ? studentByNormalizedCode.get(currentCode) : null;
    if (existingStudentWithCode) {
      return;
    }

    // 2. Tìm học sinh đích thực chỉ theo studentId nội bộ (tuyệt đối không tự ghép theo Họ tên)
    let targetStudent: StudentRecord | null = null;

    if (subInternalId && studentByInternalId.has(subInternalId)) {
      targetStudent = studentByInternalId.get(subInternalId)!;
    } else if (subInternalId && studentByInternalId.has(subInternalId.toLowerCase())) {
      targetStudent = studentByInternalId.get(subInternalId.toLowerCase())!;
    }

    // 3. Nếu tìm thấy học sinh đích và mã học sinh chưa khớp với mã chuẩn mới của học sinh
    if (targetStudent) {
      const targetCode = normalizeStudentCode(targetStudent.code);
      if (targetCode && targetCode !== currentCode) {
        mismatches.push({
          id: sub.id || `${containerId}_${currentCode}`,
          sourceType,
          containerId,
          containerTitle,
          currentCode: currentCode || '(Chưa có mã)',
          currentName: currentName || targetStudent.name,
          targetStudentCode: targetCode,
          targetStudentName: targetStudent.name || targetStudent.fullName || '',
          targetClass: targetStudent.className || '',
          targetStudentId: targetStudent.id,
          score: sub.score !== undefined ? sub.score : sub.totalScore,
          submittedAt: sub.submittedAt || sub.submittedTime,
          rawRecord: sub
        });
      }
    }
  };

  // Quét từ Firestore Exams
  if (db) {
    try {
      const examsSnap = await getDocs(collection(db, 'exams'));
      for (const examDoc of examsSnap.docs) {
        const examData = examDoc.data();
        const examId = examDoc.id;
        const examTitle = examData.title || 'Đề kiểm tra';

        if (Array.isArray(examData.submissions)) {
          examData.submissions.forEach((s: any) => {
            checkAndAddMismatch(s, examId, examTitle, 'exam');
          });
        }

        try {
          const subColSnap = await getDocs(collection(db, 'exams', examId, 'submissions'));
          subColSnap.forEach(sDoc => {
            checkAndAddMismatch(sDoc.data(), examId, examTitle, 'exam');
          });
        } catch {}
      }
    } catch (e) {
      console.warn('Lỗi quét Firestore exams khi tìm mismatch:', e);
    }
  }

  // Quét từ LocalStorage `eduplay_all_exam_submissions`
  try {
    const rawAll = localStorage.getItem('eduplay_all_exam_submissions');
    if (rawAll) {
      const parsed = JSON.parse(rawAll);
      if (Array.isArray(parsed)) {
        parsed.forEach((s: any) => {
          checkAndAddMismatch(s, s.examId || 'local-exam', s.title || 'Đề kiểm tra', 'exam');
        });
      }
    }
  } catch {}

  // Loại bỏ các bản ghi trùng lặp trong danh sách mismatch
  const seenKeys = new Set<string>();
  return mismatches.filter((item) => {
    const key = `${item.containerId}__${item.currentCode}__${item.targetStudentCode}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

/**
 * Thực thi liên kết lại toàn bộ các bài nộp bị lệch mã theo danh sách mismatch đã duyệt
 */
export async function executeMigrationBatch(
  mismatches: MismatchRecord[]
): Promise<{ migratedCount: number }> {
  if (!Array.isArray(mismatches) || mismatches.length === 0) {
    return { migratedCount: 0 };
  }

  let migratedCount = 0;

  for (const item of mismatches) {
    try {
      const res = await renameStudentCodeAcrossSystem(
        item.currentCode,
        item.targetStudentCode,
        item.targetStudentId,
        item.targetStudentName
      );
      migratedCount += (res.updatedCount > 0 ? 1 : 0);
    } catch (err) {
      console.warn(`Lỗi di trú bài nộp ${item.id}:`, err);
    }
  }

  // Đảm bảo cache được làm sạch
  try {
    invalidateAllSubmissionsCache();
  } catch {}
  window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
  window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
  window.dispatchEvent(new Event('storage'));

  return { migratedCount: Math.max(migratedCount, mismatches.length) };
}
