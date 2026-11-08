import { db } from './firebase';
import { 
  doc, 
  deleteDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  deleteField 
} from 'firebase/firestore';
import { normalizeStudentCode, normalizeStudentName } from './studentCode';
import { deleteExamDraft } from './examDraftService';
import { invalidateAllSubmissionsCache } from './hocBaDataService';
import { normalizeClassKey } from './studentSessionService';
import { backupSubmissionBeforeDelete } from './unmatchedSubmissionsService';

export interface ResetSubmissionOptions {
  studentCode: string;
  studentName?: string;
  studentId?: string;
  examId: string;
  originalExamId?: string;
  targetClass?: string;
}

/**
 * Xóa triệt để và đồng bộ toàn bộ dữ liệu bài làm của học sinh trên Firestore & LocalStorage:
 * - Subcollection `exams/{examId}/submissions` (tất cả các bản ghi khớp mã/tên)
 * - Mảng `submissions` trong master document `exams/{examId}`
 * - Các biến thể doc ID: standardDocId, legacyDocId, originalExamId
 * - Hồ sơ kết quả `student_results/{studentCode}` (xóa subcollection doc và xóa key exams.{examId})
 * - Bản nháp `exam_drafts/{studentCode}_{examId}`
 * - Tiến độ làm bài `exam_progress` (nếu có)
 * - Toàn bộ cache LocalStorage và broadcast sự kiện đồng bộ
 */
export async function resetOrDeleteStudentExamSubmission(
  options: ResetSubmissionOptions
): Promise<{ success: boolean; deletedCount: number }> {
  const { studentCode, studentName, studentId, examId, originalExamId, targetClass } = options;
  const normCode = normalizeStudentCode(studentCode || studentId || '');
  if (!normCode) {
    throw new Error('Mã học sinh không hợp lệ.');
  }
  if (!examId) {
    throw new Error('Mã đề kiểm tra không hợp lệ.');
  }

  const normName = studentName ? normalizeStudentName(studentName) : '';
  const classKey = normalizeClassKey(targetClass || '').toLowerCase();
  const examBaseId = (originalExamId || examId || '').replace(/^ex-/, '').replace(/^as-/, '').replace(/-class-.*$/, '');

  const candDocIds = Array.from(new Set([
    examId,
    `ex-${examBaseId}-class-${classKey}`,
    `ex-${examBaseId}-class-lp${classKey}`,
    originalExamId
  ].filter(Boolean) as string[]));

  let deletedCount = 0;

  // 1. Quét và xóa triệt để trên Firestore
  if (db) {
    for (const docId of candDocIds) {
      try {
        // A. Xóa trong subcollection 'exams/{docId}/submissions'
        const subColRef = collection(db, 'exams', docId, 'submissions');
        const subSnap = await getDocs(subColRef);

        const deletePromises: Promise<any>[] = [];
        subSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const docCode = normalizeStudentCode(data.studentCode || data.code || data.maHs || data.studentId || '');
          const docIdStr = docSnap.id.toLowerCase();
          const targetLower = normCode.toLowerCase();

          const isIdMatch = docIdStr === targetLower ||
                            docIdStr.startsWith(`${targetLower}_`) ||
                            docIdStr.startsWith(`sub-${docId.toLowerCase()}-${targetLower}`) ||
                            docIdStr.includes(targetLower);

          const isCodeMatch = Boolean(docCode && docCode === normCode);

          const isNameMatch = Boolean(
            normName && 
            normalizeStudentName(data.studentName || data.name || '') === normName
          );

          if (isIdMatch || isCodeMatch || isNameMatch) {
            deletePromises.push(
              deleteDoc(doc(db, 'exams', docId, 'submissions', docSnap.id))
                .then(() => { deletedCount++; })
                .catch((err) => {
                  console.warn(`Lỗi xóa doc ${docSnap.id} trong exams/${docId}/submissions:`, err);
                })
            );
          }
        });

        // Đảm bảo xóa cả các ID mẫu cố định nếu chưa quét trúng
        deletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', normCode)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `${normCode}_${docId}_1`)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `sub-${docId}-${normCode}`)).catch(() => {}));

        await Promise.all(deletePromises);

        // B. Cập nhật mảng submissions trên master document exams/{docId}
        const masterRef = doc(db, 'exams', docId);
        const masterSnap = await getDoc(masterRef);
        if (masterSnap.exists()) {
          const masterData = masterSnap.data();
          if (Array.isArray(masterData.submissions)) {
            const filteredSubs = masterData.submissions.filter((s: any) => {
              if (!s) return false;
              const sCode = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
              const sId = String(s.id || '').toLowerCase();
              const sName = normalizeStudentName(s.studentName || s.name || '');

              if (sCode === normCode) return false;
              if (sId.includes(normCode.toLowerCase())) return false;
              if (normName && sName === normName) return false;
              return true;
            });

            await updateDoc(masterRef, {
              submissions: filteredSubs,
              updatedAt: new Date().toISOString()
            });
          }
        }

        // C. Kiểm tra cả collection assignments nếu có
        try {
          const asColRef = collection(db, 'assignments', docId, 'submissions');
          const asSnap = await getDocs(asColRef);
          const asDeletePromises: Promise<any>[] = [];
          asSnap.forEach((docSnap) => {
            const data = docSnap.data();
            const docCode = normalizeStudentCode(data.studentCode || data.code || data.maHs || data.studentId || '');
            if (docCode === normCode || docSnap.id.includes(normCode.toLowerCase())) {
              asDeletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', docSnap.id)).catch(() => {}));
            }
          });
          await Promise.all(asDeletePromises);

          const asMasterRef = doc(db, 'assignments', docId);
          const asMasterSnap = await getDoc(asMasterRef);
          if (asMasterSnap.exists()) {
            const asData = asMasterSnap.data();
            if (Array.isArray(asData.submissions)) {
              const filteredAsSubs = asData.submissions.filter((s: any) => {
                const sCode = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
                return sCode !== normCode && !String(s.id || '').includes(normCode.toLowerCase());
              });
              await updateDoc(asMasterRef, {
                submissions: filteredAsSubs,
                updatedAt: new Date().toISOString()
              });
            }
          }
        } catch {}
      } catch (err: any) {
        console.error(`Lỗi khi dọn dẹp Firestore cho exam ${docId}:`, err);
        throw new Error(`Lỗi cơ sở dữ liệu: ${err?.message || 'Không thể xóa bài làm'}`);
      }
    }

    // D. Xóa trong hồ sơ kết quả học tập cá nhân `student_results/{normCode}`
    try {
      const srDocRef = doc(db, 'student_results', normCode);
      const srSnap = await getDoc(srDocRef);
      if (srSnap.exists()) {
        const updateFields: Record<string, any> = {
          updatedAt: new Date().toISOString()
        };
        for (const docId of candDocIds) {
          updateFields[`exams.${docId}`] = deleteField();
          updateFields[`assignments.${docId}`] = deleteField();
        }
        await updateDoc(srDocRef, updateFields);
      }

      for (const docId of candDocIds) {
        await deleteDoc(doc(db, 'student_results', normCode, 'exams', docId)).catch(() => {});
        await deleteDoc(doc(db, 'student_results', normCode, 'assignments', docId)).catch(() => {});
      }
    } catch (srErr) {
      console.warn('Lỗi cập nhật student_results khi xóa bài:', srErr);
    }

    // E. Xóa bản nháp `exam_drafts`
    for (const docId of candDocIds) {
      await deleteExamDraft(normCode, docId).catch(() => {});
      try {
        await deleteDoc(doc(db, 'exam_drafts', `${normCode}_${docId}`));
      } catch {}
    }

    // F. Xóa tiến độ `exam_progress` (nếu có)
    for (const docId of candDocIds) {
      try {
        await deleteDoc(doc(db, 'exam_progress', `${normCode}_${docId}`));
      } catch {}
    }
  }

  // 2. Dọn dẹp triệt để trong LocalStorage
  if (typeof window !== 'undefined') {
    try {
      // Xóa các key bài làm riêng biệt của học sinh
      const studentKeys = [normCode, studentId, studentCode].filter(Boolean) as string[];
      studentKeys.forEach(k => {
        localStorage.removeItem(`eduplay_student_exam_subs_${k}`);
        localStorage.removeItem(`eduplay_student_exam_submissions_${k}`);
        localStorage.removeItem(`eduplay_student_submissions_${k}`);
      });

      candDocIds.forEach(docId => {
        localStorage.removeItem(`eduplay_exam_subs_${docId}`);
        studentKeys.forEach(k => {
          localStorage.removeItem(`eduplay_exam_draft_${k}_${docId}`);
        });
      });

      // Lọc bỏ khỏi eduplay_all_exam_submissions
      const allSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
      if (allSubsRaw) {
        const allSubs = JSON.parse(allSubsRaw);
        if (Array.isArray(allSubs)) {
          const filtered = allSubs.filter((s: any) => {
            const sCode = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
            const sExamId = String(s.examId || s.id || s.exam?.id || '').trim();
            const isMatchExam = candDocIds.some(cid => sExamId.includes(cid));
            if (sCode === normCode && isMatchExam) return false;
            return true;
          });
          localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(filtered));
        }
      }

      // Quét toàn bộ key tiền tố eduplay_student_exam_subs_
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('eduplay_student_exam_subs_') || k.startsWith('eduplay_student_exam_submissions_'))) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const cleaned = parsed.filter((item: any) => {
                  const itemExamId = String(item.examId || item.id || item.exam?.id || '');
                  const itemCode = normalizeStudentCode(item.studentCode || item.code || item.maHs || item.studentId || '');
                  const isMatchExam = candDocIds.some(cid => itemExamId.includes(cid));
                  if (itemCode === normCode && isMatchExam) return false;
                  return true;
                });
                localStorage.setItem(k, JSON.stringify(cleaned));
              }
            } catch {}
          }
        }
      }
    } catch (lsErr) {
      console.warn('Lỗi dọn LocalStorage khi xóa bài:', lsErr);
    }
  }

  // 3. Làm mới Cache và Broadcast sự kiện toàn hệ thống
  try {
    invalidateAllSubmissionsCache();
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('eduplay_submission_reset', {
      detail: {
        studentCode: normCode,
        examId,
        candDocIds
      }
    }));
  }

  return { success: true, deletedCount };
}

/**
 * Xóa một bài nộp chưa khớp (orphaned/unmatched submission) cụ thể trên Firestore
 */
export async function deleteSingleUnmatchedSubmission(
  examId: string,
  submissionDocId: string,
  rawStudentCode?: string
): Promise<boolean> {
  if (!db || !examId || !submissionDocId) return false;

  try {
    // 0. Sao lưu tài liệu sang 'deleted_submissions_backup' trước khi xóa
    try {
      const snap = await getDoc(doc(db, 'exams', examId, 'submissions', submissionDocId));
      if (snap.exists()) {
        await backupSubmissionBeforeDelete(examId, submissionDocId, snap.data(), 'single_unmatched_delete');
      }
    } catch (bErr) {
      console.warn('Lỗi sao lưu trước khi xóa đơn:', bErr);
    }

    // 1. Xóa trong subcollection exams/{examId}/submissions/{submissionDocId}
    await deleteDoc(doc(db, 'exams', examId, 'submissions', submissionDocId));

    // 2. Xóa trong master document exams/{examId}
    const masterRef = doc(db, 'exams', examId);
    const snap = await getDoc(masterRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.submissions)) {
        const filtered = data.submissions.filter((s: any) => {
          if (s.id === submissionDocId) return false;
          if (rawStudentCode && normalizeStudentCode(s.studentCode || s.studentId || '') === normalizeStudentCode(rawStudentCode)) return false;
          return true;
        });
        await updateDoc(masterRef, {
          submissions: filtered,
          updatedAt: new Date().toISOString()
        });
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
      window.dispatchEvent(new Event('storage'));
    }

    return true;
  } catch (err) {
    console.error('Lỗi khi xóa bài nộp chưa khớp:', err);
    throw err;
  }
}

/**
 * Dọn dẹp hàng loạt toàn bộ bài nộp chưa khớp (không thuộc danh sách lớp)
 */
export async function cleanAllUnmatchedExamSubmissions(
  examId: string,
  validRosterCodes: string[],
  additionalExamIds?: string[]
): Promise<{ deletedCount: number }> {
  if (!db || !examId) return { deletedCount: 0 };

  const validSet = new Set(validRosterCodes.map(c => normalizeStudentCode(c)));
  const allExamIds = Array.from(new Set([examId, ...(additionalExamIds || [])].filter(Boolean) as string[]));
  let totalDeleted = 0;

  for (const exId of allExamIds) {
    try {
      const subColRef = collection(db, 'exams', exId, 'submissions');
      const subSnap = await getDocs(subColRef);

      const deletePromises: Promise<any>[] = [];
      subSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const code = normalizeStudentCode(data.studentCode || data.code || data.maHs || data.studentId || docSnap.id || '');
        if (!validSet.has(code)) {
          deletePromises.push(
            (async () => {
              // Sao lưu an toàn sang 'deleted_submissions_backup' trước khi xóa
              await backupSubmissionBeforeDelete(exId, docSnap.id, data, 'clean_all_unmatched');
              await deleteDoc(doc(db, 'exams', exId, 'submissions', docSnap.id));
              totalDeleted++;
            })().catch(() => {})
          );
        }
      });

      await Promise.all(deletePromises);

      // Cập nhật master document
      const masterRef = doc(db, 'exams', exId);
      const masterSnap = await getDoc(masterRef);
      if (masterSnap.exists()) {
        const data = masterSnap.data();
        if (Array.isArray(data.submissions)) {
          const filtered = data.submissions.filter((s: any) => {
            const code = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || s.id || '');
            return validSet.has(code);
          });
          await updateDoc(masterRef, {
            submissions: filtered,
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`Lỗi khi dọn dẹp submissions cho ${exId}:`, err);
    }
  }

  // Also clean LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const allRaw = localStorage.getItem('eduplay_all_exam_submissions');
      if (allRaw) {
        const parsed = JSON.parse(allRaw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((item: any) => {
            const code = normalizeStudentCode(item.studentCode || item.code || item.maHs || item.studentId || '');
            const isMatchExam = allExamIds.some(id => String(item.examId || '').includes(id));
            if (isMatchExam && !validSet.has(code)) return false;
            return true;
          });
          localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(cleaned));
        }
      }
      for (const exId of allExamIds) {
        localStorage.removeItem(`eduplay_exam_subs_${exId}`);
      }
    } catch {}
    try {
      invalidateAllSubmissionsCache();
    } catch {}
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('storage'));
  }

  return { deletedCount: totalDeleted };
}

export interface ResetAssignmentSubmissionOptions {
  studentCode: string;
  studentName?: string;
  studentId?: string;
  assignmentId: string;
  originalAssignmentId?: string;
  targetClass?: string;
}

/**
 * Xóa triệt để và đồng bộ toàn bộ dữ liệu bài làm của học sinh cho bài tập rèn luyện trên Firestore & LocalStorage
 */
export async function resetOrDeleteStudentAssignmentSubmission(
  options: ResetAssignmentSubmissionOptions
): Promise<{ success: boolean; deletedCount: number }> {
  const { studentCode, studentName, studentId, assignmentId, originalAssignmentId, targetClass } = options;
  const normCode = normalizeStudentCode(studentCode || studentId || '');
  if (!normCode) {
    throw new Error('Mã học sinh không hợp lệ.');
  }
  if (!assignmentId) {
    throw new Error('Mã bài tập không hợp lệ.');
  }

  const normName = studentName ? normalizeStudentName(studentName) : '';
  const classKey = normalizeClassKey(targetClass || '').toLowerCase();
  const assignBaseId = (originalAssignmentId || assignmentId || '').replace(/^as-/, '').replace(/^ex-/, '').replace(/-class-.*$/, '');

  const candDocIds = Array.from(new Set([
    assignmentId,
    `as-${assignBaseId}-class-${classKey}`,
    `as-${assignBaseId}-class-lp${classKey}`,
    originalAssignmentId
  ].filter(Boolean) as string[]));

  let deletedCount = 0;

  if (db) {
    for (const docId of candDocIds) {
      try {
        const subColRef = collection(db, 'assignments', docId, 'submissions');
        const subSnap = await getDocs(subColRef);

        const deletePromises: Promise<any>[] = [];
        subSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const docCode = normalizeStudentCode(data.studentCode || data.code || data.maHs || data.studentId || '');
          const docIdStr = docSnap.id.toLowerCase();
          const targetLower = normCode.toLowerCase();

          const isIdMatch = docIdStr === targetLower ||
                            docIdStr.startsWith(`${targetLower}_`) ||
                            docIdStr.startsWith(`sub-${docId.toLowerCase()}-${targetLower}`) ||
                            docIdStr.includes(targetLower);

          const isCodeMatch = Boolean(docCode && docCode === normCode);
          const isNameMatch = Boolean(
            normName && 
            normalizeStudentName(data.studentName || data.name || '') === normName
          );

          if (isIdMatch || isCodeMatch || isNameMatch) {
            deletePromises.push(
              deleteDoc(doc(db, 'assignments', docId, 'submissions', docSnap.id))
                .then(() => { deletedCount++; })
                .catch(() => {})
            );
          }
        });

        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', normCode)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', `${normCode}_${docId}_1`)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', `sub-${docId}-${normCode}`)).catch(() => {}));

        await Promise.all(deletePromises);

        const masterRef = doc(db, 'assignments', docId);
        const masterSnap = await getDoc(masterRef);
        if (masterSnap.exists()) {
          const masterData = masterSnap.data();
          if (Array.isArray(masterData.submissions)) {
            const filteredSubs = masterData.submissions.filter((s: any) => {
              if (!s) return false;
              const sCode = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
              const sId = String(s.id || '').toLowerCase();
              const sName = normalizeStudentName(s.studentName || s.name || '');

              if (sCode === normCode) return false;
              if (sId.includes(normCode.toLowerCase())) return false;
              if (normName && sName === normName) return false;
              return true;
            });

            const uniqueStudentKeys = new Set(
              filteredSubs.map((s: any) => (s.studentId || s.studentCode || s.maHs || s.studentName || '').trim().toLowerCase()).filter(Boolean)
            );
            const count = uniqueStudentKeys.size;

            await updateDoc(masterRef, {
              submissions: filteredSubs,
              submittedIds: Array.from(uniqueStudentKeys),
              completedCount: count,
              submittedCount: count,
              updatedAt: new Date().toISOString()
            });
          }
        }
      } catch (err: any) {
        console.error(`Lỗi khi dọn dẹp Firestore cho assignment ${docId}:`, err);
        throw new Error(`Lỗi cơ sở dữ liệu: ${err?.message || 'Không thể xóa bài làm'}`);
      }
    }

    try {
      const srDocRef = doc(db, 'student_results', normCode);
      const srSnap = await getDoc(srDocRef);
      if (srSnap.exists()) {
        const data = srSnap.data();
        const assignmentsMap = data.assignments || {};
        let modified = false;
        for (const docId of candDocIds) {
          if (assignmentsMap[docId]) {
            delete assignmentsMap[docId];
            modified = true;
          }
        }
        if (modified) {
          await updateDoc(srDocRef, {
            assignments: assignmentsMap,
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (srErr) {
      console.warn('Lỗi cập nhật student_results khi xóa bài tập:', srErr);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const studentKeys = [normCode, studentId, studentCode].filter(Boolean) as string[];
      studentKeys.forEach(k => {
        localStorage.removeItem(`eduplay_student_submissions_${k}`);
      });

      const allSubsRaw = localStorage.getItem('eduplay_all_assignment_submissions');
      if (allSubsRaw) {
        const allSubs = JSON.parse(allSubsRaw);
        if (Array.isArray(allSubs)) {
          const filtered = allSubs.filter((s: any) => {
            const sCode = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
            const sAssignmentId = String(s.assignmentId || s.id || '').trim();
            const isMatch = candDocIds.some(cid => sAssignmentId.includes(cid));
            if (sCode === normCode && isMatch) return false;
            return true;
          });
          localStorage.setItem('eduplay_all_assignment_submissions', JSON.stringify(filtered));
        }
      }

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('eduplay_student_submissions_')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const cleaned = parsed.filter((item: any) => {
                  const itemAssignId = String(item.assignmentId || item.id || '');
                  const itemCode = normalizeStudentCode(item.studentCode || item.code || item.maHs || item.studentId || '');
                  const isMatch = candDocIds.some(cid => itemAssignId.includes(cid));
                  if (itemCode === normCode && isMatch) return false;
                  return true;
                });
                localStorage.setItem(k, JSON.stringify(cleaned));
              }
            } catch {}
          }
        }
      }
    } catch (lsErr) {
      console.warn('Lỗi dọn LocalStorage khi xóa bài tập:', lsErr);
    }
  }

  try {
    invalidateAllSubmissionsCache();
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_assignments_updated'));
    window.dispatchEvent(new Event('storage'));
  }

  return { success: true, deletedCount };
}
