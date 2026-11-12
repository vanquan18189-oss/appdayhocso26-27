import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { normalizeStudentCode, formatStandardStudentCode } from './studentCode';
import { formatSubmissionDateTime } from '../utils/scoreUtils';
import { invalidateAllSubmissionsCache } from './hocBaDataService';
import { normalizeClassKey } from './studentSessionService';

/**
 * Chuẩn hóa chuỗi tiếng Việt: bỏ dấu, chuyển chữ thường, bỏ khoảng trắng thừa
 * Ví dụ: "Nguyễn Văn A" -> "nguyen van a", "HÀ PHƯƠNG VY" -> "ha phuong vy"
 */
export function normalizeVietnamese(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export interface AutoMatchCandidate {
  sub: any;
  subDocId: string;
  oldCode: string;
  studentName: string;
  score: any;
  submittedTime: string;
  rawSubmittedAt: string;
  proposedStudent: {
    id: string;
    code: string;
    name: string;
  };
  matchType: 'studentId' | 'name';
}

export interface ManualMatchCandidate {
  sub: any;
  subDocId: string;
  oldCode: string;
  studentName: string;
  score: any;
  submittedTime: string;
  rawSubmittedAt: string;
  reason: string;
  potentialStudents?: any[];
  suggestedClass?: string;
  isCrossClass?: boolean;
}

export interface DuplicateGroup {
  studentName: string;
  studentCode: string;
  score: any;
  isCleanable: boolean;
  timeDiffSeconds: number;
  primarySub: any;
  duplicateSubs: any[];
  reason: string;
}

export interface DryRunStats {
  totalUnmatched: number;
  duplicateGroupsCount: number;
  duplicateDocsCount: number;
  autoMatchCount: number;
  manualCandidatesCount: number;
  crossClassCount: number;
  autoMatches: AutoMatchCandidate[];
  manualCandidates: ManualMatchCandidate[];
  duplicateGroups: DuplicateGroup[];
}

/**
 * Sao lưu bản ghi bài nộp sang collection 'deleted_submissions_backup' trước khi xóa
 */
export async function backupSubmissionBeforeDelete(
  examId: string,
  docId: string,
  data: any,
  deleteReason: string = 'duplicate_cleanup'
): Promise<void> {
  if (!db || !examId || !docId) return;
  try {
    const backupId = `${examId}_${docId}_${Date.now()}`;
    const backupRef = doc(db, 'deleted_submissions_backup', backupId);
    await setDoc(backupRef, {
      ...data,
      _originalExamId: examId,
      _originalDocId: docId,
      _backupAt: new Date().toISOString(),
      _deletedAt: new Date().toISOString(),
      _deleteReason: deleteReason
    });
  } catch (err) {
    console.warn(`Lỗi sao lưu bài nộp trước khi xóa (${docId}):`, err);
  }
}

/**
 * Tìm kiếm học sinh trong danh sách lớp để tự động khớp với các bài nộp chưa khớp.
 * Thứ tự ưu tiên:
 * 0. Giới hạn phạm vi theo đúng lớp của đề kiểm tra (Cross-Class Guard)
 * 1. So khớp theo studentId nội bộ (id, sddcn, fallbackCode)
 * 2. So khớp theo họ tên không phân biệt hoa thường và bỏ dấu tiếng Việt
 * 3. Nếu tên khớp >= 2 học sinh trong lớp -> KHÔNG tự động khớp mà đưa vào manualCandidates
 */
export function findAutoMatches(
  unmatchedList: any[],
  classRoster: any[],
  targetClassName?: string
): {
  autoMatches: AutoMatchCandidate[];
  manualCandidates: ManualMatchCandidate[];
} {
  const autoMatches: AutoMatchCandidate[] = [];
  const manualCandidates: ManualMatchCandidate[] = [];

  if (!Array.isArray(unmatchedList) || !Array.isArray(classRoster)) {
    return { autoMatches, manualCandidates };
  }

  const cleanTargetClass = normalizeClassKey(targetClassName || '').toUpperCase(); // e.g. "5D"
  const cleanTargetDigit = cleanTargetClass.match(/^(\d+[A-Z]?)/)?.[1] || cleanTargetClass;

  // Pre-process class roster
  const normalizedRoster = classRoster.map(st => ({
    ...st,
    code: formatStandardStudentCode(st.code || st.id || '') || normalizeStudentCode(st.code || st.id || ''),
    normCode: normalizeStudentCode(st.code || st.id || ''),
    normName: normalizeVietnamese(st.name || st.fullName || ''),
    rawName: st.name || st.fullName || ''
  }));

  unmatchedList.forEach((sub, idx) => {
    if (!sub) return;

    const subDocId = String(sub.docId || sub.id || `unmatched-${idx}`);
    const oldCode = String(sub.studentCode || sub.maHs || sub.code || sub.rawIdentifier || sub.studentId || sub.docId || sub.id || '').trim();
    const studentName = String(sub.studentName || sub.name || sub.fullName || '').trim();
    const score = sub.score !== undefined ? sub.score : (sub.totalScore !== undefined ? sub.totalScore : '-');
    const rawSubmittedAt = String(sub.submittedAt || sub.submittedTime || '');
    const formattedTime = formatSubmissionDateTime(rawSubmittedAt);

    // 0. Kiểm tra tiền tố lớp học khác (Cross-Class Guard)
    const rawCodeCandidate = String(sub.studentCode || sub.rawIdentifier || sub.maHs || sub.code || sub.id || '').trim();
    const foreignMatch = rawCodeCandidate.match(/^([1-5][A-Za-z])/i);
    const codeClassPrefix = foreignMatch ? foreignMatch[1].toUpperCase() : null;

    if (cleanTargetDigit && codeClassPrefix && codeClassPrefix !== cleanTargetDigit) {
      manualCandidates.push({
        sub,
        subDocId,
        oldCode,
        studentName: studentName || 'Không rõ tên',
        score,
        submittedTime: formattedTime,
        rawSubmittedAt,
        reason: `Có thể thuộc lớp ${codeClassPrefix} / Cần chọn tay (Mã bài nộp mang tiền tố ${codeClassPrefix}, khác với lớp của đề là ${cleanTargetDigit})`,
        suggestedClass: `Lớp ${codeClassPrefix}`,
        isCrossClass: true
      });
      return;
    }

    if (sub.studentClass) {
      const subClassKey = normalizeClassKey(sub.studentClass).toUpperCase();
      if (cleanTargetDigit && subClassKey && subClassKey !== cleanTargetDigit && !subClassKey.includes(cleanTargetDigit)) {
        manualCandidates.push({
          sub,
          subDocId,
          oldCode,
          studentName: studentName || 'Không rõ tên',
          score,
          submittedTime: formattedTime,
          rawSubmittedAt,
          reason: `Có thể thuộc lớp ${sub.studentClass} / Cần chọn tay (Bài nộp ghi nhận lớp '${sub.studentClass}', khác với lớp của đề là '${targetClassName || cleanTargetDigit}')`,
          suggestedClass: sub.studentClass,
          isCrossClass: true
        });
        return;
      }
    }

    // 1. Thử khớp theo studentId nội bộ (nếu có)
    const rawStudentId = String(sub.studentId || sub.fallbackCode || sub.sddcn || '').trim();
    let idMatchedStudent: any = null;
    if (rawStudentId && rawStudentId !== 'u-4' && rawStudentId !== 'hs-temp') {
      const normRawId = normalizeStudentCode(rawStudentId);
      idMatchedStudent = normalizedRoster.find(st => 
        st.normCode === normRawId || 
        (st.id && st.id.toLowerCase() === rawStudentId.toLowerCase()) ||
        (st.sddcn && st.sddcn === rawStudentId)
      );
    }

    if (idMatchedStudent) {
      autoMatches.push({
        sub,
        subDocId,
        oldCode,
        studentName: studentName || idMatchedStudent.rawName,
        score,
        submittedTime: formattedTime,
        rawSubmittedAt,
        proposedStudent: {
          id: idMatchedStudent.id,
          code: idMatchedStudent.code,
          name: idMatchedStudent.rawName
        },
        matchType: 'studentId'
      });
      return;
    }

    // 2. Tuyệt đối KHÔNG tự động ghép theo họ tên. Đưa vào danh sách chờ giáo viên xác nhận thủ công.
    const normSubName = normalizeVietnamese(studentName);
    const nameMatches = normSubName ? normalizedRoster.filter(st => st.normName === normSubName) : [];

    manualCandidates.push({
      sub,
      subDocId,
      oldCode,
      studentName: studentName || 'Không rõ tên',
      score,
      submittedTime: formattedTime,
      rawSubmittedAt,
      reason: 'Mã học sinh trên bài nộp thiếu tiền tố lớp hoặc không khớp mã đầy đủ (Không tự động ghép theo họ tên, cần giáo viên xác nhận thủ công)',
      potentialStudents: nameMatches.length > 0
        ? nameMatches.map(m => ({ id: m.id, code: m.code, name: m.rawName }))
        : undefined
    });
  });

  return { autoMatches, manualCandidates };
}

/**
 * Thực hiện cập nhật hàng loạt các bài nộp đã được xác nhận khớp tự động
 */
export async function executeAutoMatchSubmissions(
  examId: string,
  matchesToApply: AutoMatchCandidate[],
  targetClass?: string,
  originalExamId?: string
): Promise<{ connectedCount: number; remainingCount: number }> {
  if (!db || !examId || matchesToApply.length === 0) {
    return { connectedCount: 0, remainingCount: 0 };
  }

  const cleanClass = normalizeClassKey(targetClass || '').toLowerCase();
  const examBaseId = (originalExamId || examId || '').replace(/^ex-/, '').replace(/^as-/, '').replace(/-class-.*$/, '');

  const candDocIds = Array.from(new Set([
    examId,
    `ex-${examBaseId}-class-${cleanClass}`,
    `ex-${examBaseId}-class-lp${cleanClass}`,
    originalExamId
  ].filter(Boolean) as string[]));

  let connectedCount = 0;

  for (const match of matchesToApply) {
    const { sub, subDocId, oldCode, proposedStudent } = match;
    const newCode = normalizeStudentCode(proposedStudent.code);
    const newName = proposedStudent.name;

    try {
      const fixedDocId = `${newCode}_${examId}_1`;

      // 1. Cập nhật trong subcollection 'exams/{docId}/submissions'
      for (const exDocId of candDocIds) {
        try {
          const subColRef = collection(db, 'exams', exDocId, 'submissions');
          const targetSubRef = doc(subColRef, fixedDocId);

          const updatedData = {
            ...sub,
            id: fixedDocId,
            docId: fixedDocId,
            studentCode: newCode,
            studentId: newCode,
            maHs: newCode,
            studentName: newName,
            name: newName,
            studentClass: targetClass || sub.studentClass || '',
            examId: exDocId,
            updatedAt: new Date().toISOString()
          };

          // Ghi bản ghi mới với ID chuẩn
          await setDoc(targetSubRef, updatedData, { merge: true });

          // Ghi thêm document dạng ${newCode} để tương thích ngược
          const shortSubRef = doc(subColRef, newCode);
          await setDoc(shortSubRef, updatedData, { merge: true });

          // Xóa document cũ mồ côi nếu có ID khác
          if (subDocId && subDocId !== fixedDocId && subDocId !== newCode) {
            await deleteDoc(doc(subColRef, subDocId)).catch(() => {});
          }
          if (oldCode && oldCode !== newCode) {
            await deleteDoc(doc(subColRef, oldCode)).catch(() => {});
            await deleteDoc(doc(subColRef, `${oldCode}_${exDocId}_1`)).catch(() => {});
          }
        } catch (err) {
          console.warn(`Lỗi cập nhật subcollection ${exDocId}:`, err);
        }
      }

      // 2. Cập nhật mảng submissions trong master document của đề kiểm tra
      for (const exDocId of candDocIds) {
        try {
          const masterRef = doc(db, 'exams', exDocId);
          const masterSnap = await getDoc(masterRef);
          if (masterSnap.exists()) {
            const mData = masterSnap.data();
            const existingSubs = Array.isArray(mData.submissions) ? [...mData.submissions] : [];

            // Lọc bỏ bài nộp cũ theo oldCode hoặc subDocId
            const filtered = existingSubs.filter((s: any) => {
              const sc = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
              const sId = String(s.id || '').toLowerCase();
              if (sc === normalizeStudentCode(oldCode)) return false;
              if (sId === subDocId.toLowerCase()) return false;
              if (sc === newCode) return false; // Tránh trùng lặp với bản ghi đã có
              return true;
            });

            // Thêm bản ghi mới đã chuẩn hóa
            filtered.unshift({
              ...sub,
              id: fixedDocId,
              studentCode: newCode,
              studentId: newCode,
              maHs: newCode,
              studentName: newName,
              name: newName,
              studentClass: targetClass || sub.studentClass || '',
              examId: exDocId,
              updatedAt: new Date().toISOString()
            });

            await updateDoc(masterRef, {
              submissions: filtered,
              updatedAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.warn(`Lỗi cập nhật master doc ${exDocId}:`, err);
        }
      }

      // 3. Cập nhật trong student_results/{newCode}
      try {
        const studentResultRef = doc(db, 'student_results', newCode);
        const resSubRef = doc(collection(studentResultRef, 'exams'), examId);
        await setDoc(resSubRef, {
          ...sub,
          examId,
          studentCode: newCode,
          studentName: newName,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await setDoc(studentResultRef, {
          studentCode: newCode,
          name: newName,
          exams: {
            [examId]: {
              score: sub.score !== undefined ? sub.score : sub.totalScore,
              submittedAt: sub.submittedAt || sub.submittedTime || new Date().toISOString()
            }
          },
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn(`Lỗi cập nhật student_results cho ${newCode}:`, err);
      }

      // 4. Cập nhật LocalStorage
      if (typeof window !== 'undefined') {
        try {
          const studentSubsKey = `eduplay_student_exam_subs_${newCode}`;
          const currentStudentSubsRaw = localStorage.getItem(studentSubsKey);
          let currentStudentSubs: any[] = [];
          if (currentStudentSubsRaw) {
            try {
              currentStudentSubs = JSON.parse(currentStudentSubsRaw) || [];
            } catch {}
          }
          currentStudentSubs = currentStudentSubs.filter((item: any) => {
            const eId = String(item.examId || item.exam?.id || '').toLowerCase();
            return eId !== examId.toLowerCase();
          });
          currentStudentSubs.unshift({
            ...sub,
            id: fixedDocId,
            examId,
            studentId: newCode,
            studentCode: newCode,
            studentName: newName
          });
          localStorage.setItem(studentSubsKey, JSON.stringify(currentStudentSubs));

          // Xóa key của mã cũ
          if (oldCode && oldCode !== newCode) {
            localStorage.removeItem(`eduplay_student_exam_subs_${oldCode}`);
          }

          // Cập nhật eduplay_all_exam_submissions
          const allSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
          if (allSubsRaw) {
            const allSubs = JSON.parse(allSubsRaw);
            if (Array.isArray(allSubs)) {
              const cleanedAll = allSubs.map((item: any) => {
                const sCode = normalizeStudentCode(item.studentCode || item.code || item.maHs || item.studentId || '');
                const sId = String(item.id || '').toLowerCase();
                if (sCode === normalizeStudentCode(oldCode) || sId === subDocId.toLowerCase()) {
                  return {
                    ...item,
                    studentCode: newCode,
                    studentId: newCode,
                    maHs: newCode,
                    studentName: newName,
                    name: newName
                  };
                }
                return item;
              });
              localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(cleanedAll));
            }
          }
        } catch {}
      }

      connectedCount++;
    } catch (err) {
      console.error(`Lỗi khi nối bài nộp ${oldCode} sang ${proposedStudent.code}:`, err);
    }
  }

  // 5. Làm mới Cache và Broadcast sự kiện toàn hệ thống
  try {
    invalidateAllSubmissionsCache();
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    window.dispatchEvent(new Event('storage'));
  }

  return {
    connectedCount,
    remainingCount: Math.max(0, matchesToApply.length - connectedCount)
  };
}

/**
 * Gán thủ công một bài nộp chưa khớp cho một học sinh được chọn từ dropdown
 */
export async function executeManualAssignSubmission(
  examId: string,
  sub: any,
  targetStudent: { code?: string; id?: string; name: string },
  targetClass?: string,
  originalExamId?: string
): Promise<boolean> {
  const targetCode = targetStudent.code || targetStudent.id || '';
  const matchCandidate: AutoMatchCandidate = {
    sub,
    subDocId: sub.docId || sub.id,
    oldCode: sub.studentCode || sub.maHs || sub.code || sub.rawIdentifier || sub.id || '',
    studentName: sub.studentName || sub.name || '',
    score: sub.score !== undefined ? sub.score : sub.totalScore,
    submittedTime: formatSubmissionDateTime(sub.submittedAt || sub.submittedTime),
    rawSubmittedAt: sub.submittedAt || sub.submittedTime || '',
    proposedStudent: {
      id: targetCode,
      code: targetCode,
      name: targetStudent.name
    },
    matchType: 'name'
  };

  const res = await executeAutoMatchSubmissions(examId, [matchCandidate], targetClass, originalExamId);
  return res.connectedCount > 0;
}

/**
 * Phát hiện các bài nộp trùng lặp của cùng một học sinh trong đề thi:
 * - Trùng lặp hoàn toàn (cùng điểm, thời gian nộp cách nhau <= 10 giây hoặc doc duplicate) -> Tự động giữ 1, xóa bản dư
 * - Bài nộp khác nhau (điểm khác hoặc giờ nộp cách xa > 10 giây) -> Giữ lại cả 2, gắn nhãn trực quan
 */
export function detectDuplicateSubmissions(submissions: any[]): DuplicateGroup[] {
  if (!Array.isArray(submissions) || submissions.length === 0) return [];

  const groups: DuplicateGroup[] = [];
  const signatureMap = new Map<string, any[]>();

  submissions.forEach((s) => {
    if (!s) return;
    const nameKey = normalizeVietnamese(s.studentName || s.name || s.fullName || '');
    const codeKey = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
    const key = codeKey ? `code_${codeKey}` : (nameKey ? `name_${nameKey}` : `doc_${s.id || Math.random()}`);

    const existing = signatureMap.get(key) || [];
    existing.push(s);
    signatureMap.set(key, existing);
  });

  signatureMap.forEach((subsList) => {
    if (subsList.length <= 1) return;

    // Sắp xếp theo độ hoàn chỉnh dữ liệu và thời gian nộp mới nhất
    const sorted = [...subsList].sort((a, b) => {
      const aTime = new Date(a.submittedAt || a.submittedTime || 0).getTime();
      const bTime = new Date(b.submittedAt || b.submittedTime || 0).getTime();
      const aHasAnswers = a.answers && Object.keys(a.answers).length > 0 ? 1 : 0;
      const bHasAnswers = b.answers && Object.keys(b.answers).length > 0 ? 1 : 0;
      if (aHasAnswers !== bHasAnswers) return bHasAnswers - aHasAnswers;
      return bTime - aTime;
    });

    const primary = sorted[0];
    const duplicates = sorted.slice(1);

    const primaryScore = primary.score !== undefined ? primary.score : primary.totalScore;
    const primaryTime = new Date(primary.submittedAt || primary.submittedTime || 0).getTime();

    // Kiểm tra xem tất cả các bản ghi phụ có cùng điểm và thời gian cách nhau <= 10 giây không
    let allIdentical = true;
    let maxTimeDiff = 0;

    duplicates.forEach((d) => {
      const dScore = d.score !== undefined ? d.score : d.totalScore;
      const dTime = new Date(d.submittedAt || d.submittedTime || 0).getTime();
      const timeDiff = Math.abs(primaryTime - dTime) / 1000;
      if (timeDiff > maxTimeDiff) maxTimeDiff = timeDiff;

      // Trùng nếu: cùng điểm VÀ (thời gian cách <= 10s HOẶC ID bài nộp là bản sao của nhau)
      const isDocDuplicate = Boolean(
        d.id === primary.id || 
        d.id === primary.studentCode ||
        primary.id === d.studentCode ||
        (d.id && primary.id && (d.id.includes(primary.id) || primary.id.includes(d.id)))
      );

      const isScoreEqual = String(primaryScore || '').trim() === String(dScore || '').trim();

      if (!isScoreEqual || (timeDiff > 10 && !isDocDuplicate)) {
        allIdentical = false;
      }
    });

    groups.push({
      studentName: primary.studentName || primary.name || 'Không rõ tên',
      studentCode: primary.studentCode || primary.code || primary.maHs || '---',
      score: primaryScore,
      isCleanable: allIdentical,
      timeDiffSeconds: Math.round(maxTimeDiff),
      primarySub: primary,
      duplicateSubs: duplicates,
      reason: allIdentical
        ? `Trùng điểm (${primaryScore}) và thời gian nộp cách nhau ${Math.round(maxTimeDiff)}s (hoặc bản ghi sao lưu)`
        : `Có nhiều lần nộp với điểm số hoặc thời gian khác nhau (cần giáo viên xác nhận bài tính điểm)`
    });
  });

  return groups;
}

/**
 * Thực hiện xóa các bài nộp trùng lặp đã được chọn lọc
 */
export async function executeCleanDuplicates(
  examId: string,
  duplicateGroupsToClean: DuplicateGroup[],
  originalExamId?: string
): Promise<{ deletedCount: number }> {
  if (!db || !examId || duplicateGroupsToClean.length === 0) {
    return { deletedCount: 0 };
  }

  const allExamIds = Array.from(new Set([examId, originalExamId].filter(Boolean) as string[]));
  let deletedCount = 0;

  for (const group of duplicateGroupsToClean) {
    for (const dup of group.duplicateSubs) {
      const dupDocId = dup.docId || dup.id;
      if (!dupDocId) continue;

      for (const exId of allExamIds) {
        try {
          // 1. Sao lưu an toàn sang collection 'deleted_submissions_backup' trước khi xóa
          await backupSubmissionBeforeDelete(exId, dupDocId, dup, 'duplicate_cleanup_auto');

          // 2. Xóa trong subcollection
          await deleteDoc(doc(db, 'exams', exId, 'submissions', dupDocId)).catch(() => {});

          // 3. Xóa trong master doc array
          const masterRef = doc(db, 'exams', exId);
          const masterSnap = await getDoc(masterRef);
          if (masterSnap.exists()) {
            const data = masterSnap.data();
            if (Array.isArray(data.submissions)) {
              const filtered = data.submissions.filter((s: any) => s.id !== dupDocId);
              await updateDoc(masterRef, {
                submissions: filtered,
                updatedAt: new Date().toISOString()
              });
            }
          }
          deletedCount++;
        } catch (err) {
          console.warn(`Lỗi xóa doc trùng lặp ${dupDocId}:`, err);
        }
      }
    }
  }

  // Làm mới cache & broadcast
  try {
    invalidateAllSubmissionsCache();
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    window.dispatchEvent(new Event('storage'));
  }

  return { deletedCount };
}

/**
 * Tính toán chế độ Dry Run: Phân tích trước các chỉ số thống kê mà KHÔNG ghi dữ liệu xuống Firestore
 */
export function calculateDryRunStats(
  unmatchedList: any[],
  classRoster: any[],
  targetClassName?: string,
  allCandidateSubs?: any[]
): DryRunStats {
  const matchResult = findAutoMatches(unmatchedList, classRoster, targetClassName);
  const dupPool = (allCandidateSubs && allCandidateSubs.length > 0) ? allCandidateSubs : unmatchedList;
  const duplicateGroups = detectDuplicateSubmissions(dupPool);

  const cleanableGroups = duplicateGroups.filter(g => g.isCleanable);
  const duplicateDocsCount = cleanableGroups.reduce((acc, g) => acc + g.duplicateSubs.length, 0);
  const crossClassCount = matchResult.manualCandidates.filter(m => m.isCrossClass).length;

  return {
    totalUnmatched: unmatchedList.length,
    duplicateGroupsCount: duplicateGroups.length,
    duplicateDocsCount,
    autoMatchCount: matchResult.autoMatches.length,
    manualCandidatesCount: matchResult.manualCandidates.length,
    crossClassCount,
    autoMatches: matchResult.autoMatches,
    manualCandidates: matchResult.manualCandidates,
    duplicateGroups
  };
}

/**
 * Tự động cập nhật đồng bộ mã học sinh (Future-proofing):
 * Khi giáo viên đổi mã học sinh, cập nhật mọi bài nộp (submissions), bản nháp (exam_drafts),
 * tiến độ (exam_progress) và kết quả (student_results) sang mã mới.
 */
export async function propagateStudentCodeChange(
  oldCode: string,
  newCode: string,
  className?: string
): Promise<{ updatedCount: number }> {
  const normOld = normalizeStudentCode(oldCode);
  const normNew = normalizeStudentCode(newCode);

  if (!normOld || !normNew || normOld === normNew) {
    return { updatedCount: 0 };
  }

  let updatedCount = 0;

  try {
    // 1. Quét toàn bộ đề kiểm tra trên Firestore
    if (db) {
      const examsSnap = await getDocs(collection(db, 'exams'));
      for (const examDoc of examsSnap.docs) {
        const exId = examDoc.id;
        const examData = examDoc.data();

        // A. Cập nhật trong subcollection 'exams/{exId}/submissions'
        try {
          const subColRef = collection(db, 'exams', exId, 'submissions');
          const subSnap = await getDocs(subColRef);
          for (const sDoc of subSnap.docs) {
            const sData = sDoc.data();
            const sCode = normalizeStudentCode(sData.studentCode || sData.code || sData.maHs || sData.studentId || '');
            const docIdStr = sDoc.id.toLowerCase();
            const oldLower = normOld.toLowerCase();

            if (sCode === normOld || docIdStr.includes(oldLower)) {
              const newDocId = `${normNew}_${exId}_1`;
              const updatedSubData = {
                ...sData,
                id: newDocId,
                docId: newDocId,
                studentCode: normNew,
                studentId: normNew,
                maHs: normNew,
                studentClass: className || sData.studentClass || '',
                updatedAt: new Date().toISOString()
              };

              // Tạo doc mới và xóa doc cũ
              await setDoc(doc(subColRef, newDocId), updatedSubData, { merge: true });
              if (sDoc.id !== newDocId) {
                await deleteDoc(doc(subColRef, sDoc.id)).catch(() => {});
              }
              updatedCount++;
            }
          }
        } catch {}

        // B. Cập nhật trong master doc 'submissions' array
        try {
          if (Array.isArray(examData.submissions)) {
            let hasChanged = false;
            const updatedSubs = examData.submissions.map((s: any) => {
              const sCode = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
              if (sCode === normOld) {
                hasChanged = true;
                return {
                  ...s,
                  id: `${normNew}_${exId}_1`,
                  studentCode: normNew,
                  studentId: normNew,
                  maHs: normNew,
                  studentClass: className || s.studentClass || '',
                  updatedAt: new Date().toISOString()
                };
              }
              return s;
            });

            if (hasChanged) {
              await updateDoc(doc(db, 'exams', exId), {
                submissions: updatedSubs,
                updatedAt: new Date().toISOString()
              });
            }
          }
        } catch {}
      }

      // 2. Di chuyển student_results/{oldCode} sang student_results/{newCode}
      try {
        const oldResultRef = doc(db, 'student_results', normOld);
        const oldSnap = await getDoc(oldResultRef);
        if (oldSnap.exists()) {
          const oldData = oldSnap.data();
          const newResultRef = doc(db, 'student_results', normNew);
          await setDoc(newResultRef, {
            ...oldData,
            studentCode: normNew,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          await deleteDoc(oldResultRef).catch(() => {});
        }
      } catch {}

      // 3. Di chuyển exam_drafts
      try {
        const draftsSnap = await getDocs(collection(db, 'exam_drafts'));
        for (const dDoc of draftsSnap.docs) {
          if (dDoc.id.startsWith(`${normOld}_`)) {
            const dData = dDoc.data();
            const newDraftId = dDoc.id.replace(`${normOld}_`, `${normNew}_`);
            await setDoc(doc(db, 'exam_drafts', newDraftId), {
              ...dData,
              studentCode: normNew,
              updatedAt: new Date().toISOString()
            }, { merge: true });
            await deleteDoc(doc(db, 'exam_drafts', dDoc.id)).catch(() => {});
          }
        }
      } catch {}
    }

    // 4. Di chuyển LocalStorage keys
    if (typeof window !== 'undefined') {
      try {
        const oldKey = `eduplay_student_exam_subs_${normOld}`;
        const newKey = `eduplay_student_exam_subs_${normNew}`;
        const saved = localStorage.getItem(oldKey);
        if (saved) {
          localStorage.setItem(newKey, saved);
          localStorage.removeItem(oldKey);
        }

        const allRaw = localStorage.getItem('eduplay_all_exam_submissions');
        if (allRaw) {
          const parsed = JSON.parse(allRaw);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((item: any) => {
              const code = normalizeStudentCode(item.studentCode || item.code || item.maHs || item.studentId || '');
              if (code === normOld) {
                return {
                  ...item,
                  studentCode: normNew,
                  studentId: normNew,
                  maHs: normNew
                };
              }
              return item;
            });
            localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(updated));
          }
        }
      } catch {}
    }

    // 5. Làm mới cache & broadcast
    try {
      invalidateAllSubmissionsCache();
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
      window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
      window.dispatchEvent(new Event('storage'));
    }
  } catch (err) {
    console.error(`Lỗi khi đổi mã học sinh ${oldCode} sang ${newCode}:`, err);
  }

  return { updatedCount };
}
