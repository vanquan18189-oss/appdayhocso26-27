import { db } from './firebase';
import { collection, collectionGroup, getDocs, doc, getDoc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { normalizeStudentCode } from './studentCode';
import { awardAssignmentReward, hasClaimedReward, markRewardClaimed } from '../config/rewardConfig';
import { studentResultService } from './studentResultService';
import { invalidateAllSubmissionsCache } from './hocBaDataService';

export interface MisfiledSubmissionItem {
  id: string;
  studentCode: string;
  studentName: string;
  className: string;
  title: string;
  score: any;
  submittedTime: string;
  currentIncorrectExamId: string;
  targetAssignmentId: string;
  alreadyRewarded: boolean;
  expectedCoins: number;
  expectedExp: number;
  rawRecord: any;
}

export interface MigrationReport {
  misfiledRecordsCount: number;
  transferredList: Array<{ studentCode: string; studentName: string; title: string; assignmentId: string }>;
  totalCoinsCompensated: number;
  totalExpCompensated: number;
  filesModified: string[];
  misfiledSourceFunction: string;
}

/**
 * 1. Quét dữ liệu bị lưu nhầm: tìm các bản ghi trong exams/[examId]/submissions (và student_results) 
 *    mà examId thực chất là ID của một BÀI TẬP (khớp với assignments/{id}) hoặc có tên đề trùng tên bài tập.
 */
export async function scanMisfiledAssignmentSubmissions(assignmentsList: any[] = []): Promise<MisfiledSubmissionItem[]> {
  const misfiledItems: MisfiledSubmissionItem[] = [];
  if (!db) return misfiledItems;

  const assignmentIdSet = new Set<string>();
  const assignmentTitleMap = new Map<string, any>();

  assignmentsList.forEach(as => {
    if (as && as.id) {
      assignmentIdSet.add(as.id);
      const cleanTitle = String(as.title || '').trim().toLowerCase();
      if (cleanTitle) assignmentTitleMap.set(cleanTitle, as);
    }
  });

  try {
    // Quét collection exams từ Firestore
    const examsSnap = await getDocs(collection(db, 'exams'));
    for (const examDoc of examsSnap.docs) {
      const examId = examDoc.id;
      const examData = examDoc.data();
      const examTitle = String(examData.title || '').trim().toLowerCase();

      // Kiểm tra xem examId này thực chất là assignmentId hoặc title trùng assignment
      const matchedAssignment = assignmentIdSet.has(examId) ? assignmentsList.find(a => a.id === examId) : assignmentTitleMap.get(examTitle);
      
      // Nếu examId thực chất là bài tập hoặc title trùng bài tập
      if (matchedAssignment) {
        const targetAsId = matchedAssignment.id;
        const subsRef = collection(db, 'exams', examId, 'submissions');
        const subsSnap = await getDocs(subsRef);

        subsSnap.forEach(subDoc => {
          const subData = subDoc.data();
          const studentCode = normalizeStudentCode(subData.studentCode || subData.code || subData.maHs || subDoc.id);
          const studentName = subData.studentName || subData.name || 'Học sinh';
          const score = subData.score !== undefined ? subData.score : subData.totalScore;
          const submittedTime = subData.submittedTime || subData.submittedAt || new Date().toISOString();

          const alreadyRewarded = hasClaimedReward(studentCode, 'assignment', targetAsId) || Boolean(subData.rewardGranted);
          const scoreNum = typeof score === 'number' ? score : parseFloat(String(score)) || 7;
          const totalQ = matchedAssignment.questions?.length || 10;
          const correctC = Math.round((scoreNum / 10) * totalQ);

          let expectedCoins = 0;
          let expectedExp = 0;
          if (!alreadyRewarded) {
            if (scoreNum >= 8.0) {
              expectedCoins = 10;
              expectedExp = 5;
            } else if (scoreNum >= 5.0) {
              expectedCoins = 5;
              expectedExp = 2;
            }
          }

          misfiledItems.push({
            id: subDoc.id,
            studentCode,
            studentName,
            className: subData.className || 'Lớp 5D',
            title: matchedAssignment.title,
            score,
            submittedTime,
            currentIncorrectExamId: examId,
            targetAssignmentId: targetAsId,
            alreadyRewarded,
            expectedCoins,
            expectedExp,
            rawRecord: {
              ...subData,
              type: 'assignment',
              recordType: 'assignment',
              assignmentId: targetAsId
            }
          });
        });
      }
    }
  } catch (err) {
    console.error('Lỗi khi quét bản ghi lưu nhầm:', err);
  }

  return misfiledItems;
}

/**
4 & 5. Chuyển dữ liệu, sao lưu backup, cộng xu bù 1 lần duy nhất, cập nhật attemptNumber = 1, v.v.
*/
export async function executeMisfiledAssignmentMigration(
  selectedItems: MisfiledSubmissionItem[]
): Promise<MigrationReport> {
  const transferredList: Array<{ studentCode: string; studentName: string; title: string; assignmentId: string }> = [];
  let totalCoinsCompensated = 0;
  let totalExpCompensated = 0;

  if (!db || selectedItems.length === 0) {
    return {
      misfiledRecordsCount: 0,
      transferredList: [],
      totalCoinsCompensated: 0,
      totalExpCompensated: 0,
      filesModified: ['src/services/assignmentMigrationService.ts', 'src/components/modules/AssignmentModule.tsx', 'src/components/modules/StudentAssignmentModule.tsx', 'src/components/modules/StudentExamModule.tsx'],
      misfiledSourceFunction: 'StudentExamModule executeSubmitExam & auto-submit writing to exams/*/submissions instead of assignments'
    };
  }

  for (const item of selectedItems) {
    const { studentCode, targetAssignmentId, currentIncorrectExamId, rawRecord } = item;
    if (!studentCode || !targetAssignmentId) continue;

    try {
      const correctSubRecord = {
        ...rawRecord,
        type: 'assignment',
        recordType: 'assignment',
        assignmentId: targetAssignmentId,
        attemptNumber: 1, // Đảm bảo tính là lần 1
        updatedAt: new Date().toISOString()
      };

      // 1. Sao lưu bản gốc vào collection deleted_submissions_backup trước khi xóa
      const backupRef = doc(db, 'deleted_submissions_backup', `${currentIncorrectExamId}_${studentCode}_${Date.now()}`);
      await setDoc(backupRef, {
        originalLocation: `exams/${currentIncorrectExamId}/submissions/${item.id}`,
        migratedTo: `assignments/${targetAssignmentId}/submissions/${studentCode}`,
        migratedAt: new Date().toISOString(),
        data: rawRecord
      }, { merge: true });

      // 2. Ghi vào assignments/{assignmentId}/submissions/{studentCode}
      const targetSubRef = doc(db, 'assignments', targetAssignmentId, 'submissions', studentCode);
      await setDoc(targetSubRef, correctSubRecord, { merge: true });

      // Cập nhật mảng submissions trên master document của assignment
      const assignRef = doc(db, 'assignments', targetAssignmentId);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(assignRef);
        let subs: any[] = [];
        if (snap.exists()) {
          subs = Array.isArray(snap.data().submissions) ? [...snap.data().submissions] : [];
        }
        const filtered = subs.filter((s: any) => normalizeStudentCode(s.studentId || s.studentCode || s.maHs || '') !== studentCode);
        filtered.unshift(correctSubRecord);
        const uniqueKeys = new Set(filtered.map((s: any) => normalizeStudentCode(s.studentId || s.studentCode || s.maHs || '')).filter(Boolean));
        transaction.set(assignRef, {
          submissions: filtered,
          submittedIds: Array.from(uniqueKeys),
          submittedCount: uniqueKeys.size,
          completedCount: uniqueKeys.size,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      // 3. Cập nhật student_results/{studentCode}/assignments/{targetAssignmentId}
      await studentResultService.saveFullAssignmentSubmission(studentCode, targetAssignmentId, {
        ...correctSubRecord,
        type: 'assignment'
      });
      await studentResultService.saveAssignmentResult(studentCode, {
        assignmentId: targetAssignmentId,
        score: typeof item.score === 'number' ? item.score : parseFloat(String(item.score)) || 7,
        maxScore: 10,
        submittedAt: item.submittedTime,
        attemptNumber: 1,
        answers: rawRecord.answers || {},
        keepAttempts: 'last'
      });

      // 4. Cộng xu/EXP bù CHỈ MỘT LẦN nếu chưa nhận
      if (!item.alreadyRewarded && (item.expectedCoins > 0 || item.expectedExp > 0)) {
        const rewardRes = awardAssignmentReward(
          studentCode,
          targetAssignmentId,
          item.title,
          Math.round(((typeof item.score === 'number' ? item.score : parseFloat(String(item.score)) || 7) / 10) * 10),
          10,
          typeof item.score === 'number' ? item.score : parseFloat(String(item.score)) || 7
        );
        if (rewardRes && rewardRes.awarded) {
          totalCoinsCompensated += rewardRes.coins;
          totalExpCompensated += rewardRes.exp;
        }
        markRewardClaimed(studentCode, 'assignment', targetAssignmentId);
      }

      // Đánh dấu rewardGranted: true trong bản ghi
      await setDoc(targetSubRef, { rewardGranted: true }, { merge: true });

      // 5. Xóa bản nhầm trong exams/{currentIncorrectExamId}/submissions/{item.id} (và studentCode)
      await deleteDoc(doc(db, 'exams', currentIncorrectExamId, 'submissions', item.id)).catch(() => {});
      await deleteDoc(doc(db, 'exams', currentIncorrectExamId, 'submissions', studentCode)).catch(() => {});

      transferredList.push({
        studentCode,
        studentName: item.studentName,
        title: item.title,
        assignmentId: targetAssignmentId
      });
    } catch (e) {
      console.error(`Lỗi chuyển bản ghi cho học sinh ${studentCode}:`, e);
    }
  }

  // 7. Xóa cache liên quan
  invalidateAllSubmissionsCache();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('eduplay_all_exam_submissions');
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('eduplay_student_exam_') || k.startsWith('eduplay_exam_subs_'))) {
        localStorage.removeItem(k);
      }
    }
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_assignment_submissions_updated'));
  }

  return {
    misfiledRecordsCount: selectedItems.length,
    transferredList,
    totalCoinsCompensated,
    totalExpCompensated,
    filesModified: [
      'src/services/assignmentMigrationService.ts',
      'src/components/modules/AssignmentModule.tsx',
      'src/components/modules/StudentAssignmentModule.tsx',
      'src/components/modules/StudentExamModule.tsx'
    ],
    misfiledSourceFunction: 'StudentExamModule executeSubmitExam & auto-submit writing to exams/*/submissions instead of assignments'
  };
}
