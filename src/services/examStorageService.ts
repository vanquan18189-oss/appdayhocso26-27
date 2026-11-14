import { db, isFirestoreQuotaExceeded } from './firebase';
import { collection, doc, getDocs, getDoc, getDocFromServer } from 'firebase/firestore';
import { ensureAnonymousGuestAuth } from './lessonStorageService';
import { trackedSetDoc, trackedDeleteDoc, trackedWriteBatch, extractFirestoreErrorDetails } from './firestoreWriteTracker';
import { ExamPaper } from '../types';
import { removeUndefined } from './teacherStorageService';
import { waitForWriteConfirmation, updateCollectionCacheStatus } from './firestoreWriteVerificationService';
import { normalizeClassKey } from './studentStorageService';
import { logSystemActivity } from './activityService';
import { toISOStringUTC } from '../utils/dateUtils';
import {
  attachOwnershipOnCreate,
  getCurrentAccessContext,
  getContentPermissions,
  queryAccessibleCollection,
  invalidateQueryCache
} from './permissionService';

const EXAMS_CACHE_KEY = 'eduplay_cached_exams';

/**
 * Kiểm tra xem một đề thi có phải là đề kiểm tra chính thức hợp lệ hay không.
 * Loại bỏ hoàn toàn các bản nháp rác/tài liệu sinh tự động lỗi (không có câu hỏi, không có tiêu đề, hoặc chỉ là vỏ bọc bài nộp).
 */
export function isValidOfficialExam(exam: Partial<ExamPaper> | null | undefined): boolean {
  if (!exam || typeof exam !== 'object') return false;
  if (!exam.id || typeof exam.id !== 'string') return false;
  if ((exam as any).isDeleted) return false;

  // Tiêu đề bắt buộc phải có nội dung và không được rỗng
  const title = (exam.title || '').trim();
  if (!title) return false;

  // Bắt buộc phải có danh sách câu hỏi hợp lệ với ít nhất 1 câu hỏi
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    return false;
  }

  // Bắt buộc phải có môn học
  const subject = (exam.subject || '').trim();
  if (!subject) return false;

  return true;
}

/**
 * Deduplication helper for exam papers
 */
export function getExamDeduplicationKey(e: Partial<ExamPaper>): string {
  if (!e) return '';
  const cleanTitle = (e.title || '')
    .trim()
    .toLowerCase()
    .replace(/^đề kiểm tra:\s*/i, '')
    .replace(/\s+/g, ' ');
  const targetClass = (e.targetClass || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  const subject = (e.subject || '').trim().toLowerCase();
  const grade = (e.grade || '').trim().toLowerCase();
  const originalExamId = (e.originalExamId || '').trim();

  if (originalExamId && targetClass) {
    return `root_${originalExamId}__cls_${targetClass}`;
  }
  return `title_${cleanTitle}__cls_${targetClass}__sub_${subject}__grd_${grade}`;
}

export function deduplicateExams(exams: ExamPaper[]): ExamPaper[] {
  const seenIds = new Set<string>();
  const clean: ExamPaper[] = [];

  (exams || []).forEach(exam => {
    if (!exam || !exam.id) return;
    if (!isValidOfficialExam(exam)) return;
    if (seenIds.has(exam.id)) return;

    seenIds.add(exam.id);
    clean.push(exam);
  });

  return clean;
}

/**
 * Quét và dọn dẹp các bản ghi đề thi trùng lặp và bản nháp rác trong LocalStorage (và Firestore đối với Admin)
 */
export async function cleanDuplicateExams(): Promise<void> {
  try {
    const cached = getRawCachedExams();
    const cleanList = deduplicateExams(cached);
    if (cleanList.length !== cached.length) {
      saveExamsToLocalStorage(cleanList);
    }

    const access = getCurrentAccessContext();
    if (db && access.isAdmin) {
      try {
        const snap = await getDocs(collection(db, 'exams'));
        if (!snap.empty) {
          const ghostDocs: string[] = [];
          snap.forEach(docSnap => {
            const data = docSnap.data();
            const examObj = { id: docSnap.id, ...data } as ExamPaper;
            if (!isValidOfficialExam(examObj)) {
              ghostDocs.push(docSnap.id);
            }
          });

          if (ghostDocs.length > 0) {
            const batch = trackedWriteBatch(db, { isUserInitiated: false, actionType: 'admin_batch' });
            ghostDocs.forEach(id => {
              batch.delete(doc(db, 'exams', id));
            });
            await batch.commit();
          }
        }
      } catch (fErr) {
        console.warn('Lỗi quét dọn bản nháp rác trên Firestore:', fErr);
      }
    }
  } catch (err) {
    console.warn('Lỗi khi chạy cleanDuplicateExams:', err);
  }
}

function getRawCachedExams(): ExamPaper[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(EXAMS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return deduplicateExams(parsed);
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc cache đề thi từ LocalStorage:', e);
  }
  return [];
}

/**
 * Lấy danh sách đề thi từ LocalStorage Cache (có lọc RBAC cho giáo viên thường)
 */
export function getLocalCachedExams(): ExamPaper[] {
  const all = getRawCachedExams();
  const access = getCurrentAccessContext();
  if (access.isAdmin || access.isStudent) return all;
  return all.filter(exam => getContentPermissions(exam, access).canView);
}

/**
 * Lưu danh sách đề thi vào LocalStorage Cache
 */
export function saveExamsToLocalStorage(exams: ExamPaper[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = deduplicateExams(exams);
    localStorage.setItem(EXAMS_CACHE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent('eduplay_exams_updated', {
      detail: { exams: clean, timestamp: Date.now() }
    }));
  } catch (e) {
    console.warn('Lỗi lưu cache đề thi vào LocalStorage:', e);
  }
}

import { extractGradeDigit } from '../lib/constants';

/**
 * Lưu một Đề kiểm tra lên Firestore (kèm metadata sở hữu & chia sẻ RBAC)
 */
export async function saveExamToFirestore(examInput: ExamPaper): Promise<void> {
  try {
    const current = getRawCachedExams();
    const oldExistsIdx = current.findIndex(e => e.id === examInput.id);
    const existingExam = oldExistsIdx >= 0 ? current[oldExistsIdx] : null;

    const exam = attachOwnershipOnCreate({ ...examInput }, existingExam);

    // Chuẩn hóa ngày giờ lưu vào Firestore theo chuẩn ISO 8601 UTC duy nhất
    if (exam.startTime) {
      const isoStart = toISOStringUTC(exam.startTime);
      if (isoStart) exam.startTime = isoStart;
    }
    if (exam.endTime) {
      const isoEnd = toISOStringUTC(exam.endTime);
      if (isoEnd) exam.endTime = isoEnd;
    }

    const targetDigit = extractGradeDigit(exam.targetClass) || extractGradeDigit(exam.grade) || '5';
    const normalizedGrade = `Khối ${targetDigit}`;
    exam.grade = normalizedGrade;

    if (!exam.id.startsWith('ex-') || !exam.id.includes('-class-lp')) {
      const classKey = normalizeClassKey(exam.targetClass || exam.grade || '5A');
      exam.id = `ex-${exam.id.replace(/^ex-/, '')}-class-lp${classKey.toLowerCase()}`;
    }

    let updated: ExamPaper[];
    if (oldExistsIdx >= 0) {
      updated = current.map(e => (e.id === current[oldExistsIdx].id ? exam : e));
    } else {
      updated = [exam, ...current];
    }
    saveExamsToLocalStorage(updated);

    if (!db) {
      console.warn('Firestore chưa sẵn sàng, lưu cache cục bộ đề thi');
      return;
    }

    const examRef = doc(db, 'exams', exam.id);
    const { submissionsCount, completedCount, ...examPayloadToSave } = exam as any;
    const cleanedPayload = removeUndefined({
      ...examPayloadToSave,
      grade: normalizedGrade,
      updatedAt: new Date().toISOString()
    });

    try {
      await trackedSetDoc(examRef, cleanedPayload, { merge: true });
      invalidateQueryCache('exams');
    } catch (setDocErr: any) {
      const errDetails = extractFirestoreErrorDetails(setDocErr);
      throw new Error(errDetails.message);
    }

    await waitForWriteConfirmation(examRef, 12000, false);

    // Sau khi lưu phải đọc lại từ Firestore để xác nhận giá trị đã lưu đúng
    try {
      const verifiedSnap = await getDoc(examRef);
      if (verifiedSnap.exists()) {
        const verifiedExam = { id: verifiedSnap.id, ...verifiedSnap.data() } as ExamPaper;
        const latestCached = getRawCachedExams();
        const idx = latestCached.findIndex(e => e.id === verifiedExam.id);
        if (idx >= 0) {
          latestCached[idx] = { ...latestCached[idx], ...verifiedExam };
          saveExamsToLocalStorage(latestCached);
        } else {
          saveExamsToLocalStorage([verifiedExam, ...latestCached]);
        }
      }
    } catch (verifyErr) {
      console.warn('Không thể đọc lại đề thi sau khi lưu:', verifyErr);
    }

    const actorName = exam.ownerName || exam.teacherName || 'Giáo viên';
    await logSystemActivity({
      type: 'exam_assigned',
      actorName,
      className: exam.targetClass || exam.grade || 'Lớp học',
      targetTitle: exam.title || 'Đề kiểm tra',
      module: 'Quản Lý Đề Kiểm Tra',
      action: `${actorName} giao ${exam.title || 'Đề kiểm tra'} cho ${exam.targetClass || exam.grade || 'Lớp học'}`
    }).catch(() => {});
  } catch (error) {
    console.error(`❌ [Lỗi giao/lưu đề thi Khối ${examInput?.grade || '5'} lên Firestore]:`, error);
  }
}

/**
 * Lấy danh sách Đề kiểm tra từ Firestore theo phân quyền RBAC (cache 5 phút, tối đa 20 doc/nguồn, không dùng onSnapshot)
 */
export async function getExamsFromFirestore(forceRefresh = false): Promise<ExamPaper[]> {
  try {
    if (!db) return getLocalCachedExams();

    const fetched = await queryAccessibleCollection<ExamPaper>('exams', {
      forceRefresh,
      maxPerSource: 20,
      adminLimit: 50
    });
    const validExams = fetched.filter(isValidOfficialExam);
    const clean = deduplicateExams(validExams);
    updateCollectionCacheStatus('exams', false, clean.length, false);
    if (clean.length > 0) {
      saveExamsToLocalStorage(clean);
      return clean;
    }
    return getLocalCachedExams();
  } catch (error) {
    console.warn("Lỗi đọc danh sách đề thi từ Firestore:", error);
    return getLocalCachedExams();
  }
}

/**
 * Tải danh sách Đề kiểm tra từ Firestore theo phân quyền RBAC (không dùng onSnapshot)
 */
export function subscribeToExamsFromFirestore(
  onUpdate: (exams: ExamPaper[]) => void,
  onError?: (err: any) => void
) {
  if (!db || isFirestoreQuotaExceeded()) {
    onUpdate(getLocalCachedExams());
    return () => {};
  }

  let isMounted = true;

  getExamsFromFirestore(false)
    .then(cleanLoaded => {
      if (!isMounted) return;
      cleanLoaded.sort((a, b) => (b.id > a.id ? 1 : -1));
      onUpdate(cleanLoaded);
    })
    .catch(err => {
      if (onError) onError(err);
      if (isMounted) onUpdate(getLocalCachedExams());
    });

  return () => {
    isMounted = false;
  };
}

// import { deleteSubmissionsByExam } from './cascadeCleanupService';

/**
 * Xóa một Đề kiểm tra khỏi Firestore
 */
export async function deleteExamFromFirestore(examId: string): Promise<void> {
  try {
    // Dọn dẹp bài làm dây chuyền trước
    // await deleteSubmissionsByExam(examId).catch(err => console.error('Lỗi xóa dây chuyền bài làm:', err));

    if (db) {
      const examRef = doc(db, 'exams', examId);
      await trackedDeleteDoc(examRef);
      await waitForWriteConfirmation(examRef, 12000, true);
      console.log(`🗑️ Đã xóa đề thi ID ${examId} trên Cloud Firestore!`);
    }

    const current = getLocalCachedExams();
    const updated = current.filter(e => e?.id !== examId);
    saveExamsToLocalStorage(updated);
  } catch (error) {
    console.error("Lỗi khi xóa đề thi khỏi Firestore:", error);
    const current = getLocalCachedExams();
    const updated = current.filter(e => e?.id !== examId);
    saveExamsToLocalStorage(updated);
  }
}

/**
 * Kiểm tra một đề thi có bị đánh dấu xóa hay không
 */
export function isExamDeleted(examId?: string | null): boolean {
  if (!examId) return false;
  try {
    const cached = getLocalCachedExams();
    const found = cached.find(e => e?.id === examId);
    return Boolean(found && (found as any)?.isDeleted);
  } catch {
    return false;
  }
}

/**
 * Đánh dấu xóa một đề thi (soft delete)
 */
export function markExamDeleted(examId: string): void {
  if (!examId) return;
  try {
    const cached = getLocalCachedExams();
    const updated = cached.map(e => {
      if (e?.id === examId) {
        return { ...e, isDeleted: true, deletedAt: new Date().toISOString() };
      }
      return e;
    });
    saveExamsToLocalStorage(updated);
  } catch (err) {
    console.warn('Lỗi khi đánh dấu xóa đề thi:', err);
  }
}

/**
 * Khôi phục đề thi đã xóa
 */
export function restoreDeletedExam(examId: string): void {
  if (!examId) return;
  try {
    const cached = getLocalCachedExams();
    const updated = cached.map(e => {
      if (e?.id === examId) {
        return { ...e, isDeleted: false, deletedAt: undefined };
      }
      return e;
    });
    saveExamsToLocalStorage(updated);
  } catch (err) {
    console.warn('Lỗi khi khôi phục đề thi:', err);
  }
}

/**
 * Lấy thông tin đề thi theo ID
 */
export function getExamById(examId: string): ExamPaper | undefined {
  if (!examId) return undefined;
  const cached = getLocalCachedExams();
  return cached.find(e => e?.id === examId);
}

/**
 * Gieo mầm thủ công toàn bộ danh sách đề thi mẫu vào LocalStorage và Firestore
 */
export async function seedInitialExamsManually(): Promise<ExamPaper[]> {
  return [];
}

/**
 * Xóa sạch cache đề thi trong LocalStorage
 */
export function clearAllExamsCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(EXAMS_CACHE_KEY);
  } catch (e) {
    console.warn('Lỗi khi dọn cache đề thi:', e);
  }
}

/**
 * Xóa toàn bộ danh sách Đề kiểm tra khỏi Firestore và dọn dẹp LocalStorage cache
 */
export async function deleteAllExamsFromFirestore(): Promise<void> {
  try {
    // Dọn dẹp dây chuyền
    // await cascadeDeleteAllExams().catch(err => console.error('Lỗi dọn dẹp dây chuyền:', err));
    console.warn('cascadeDeleteAllExams: cascadeCleanupService has been removed.');

    if (db) {
      const snap = await getDocs(collection(db, 'exams'));
      if (!snap.empty) {
        const CHUNK_SIZE = 450;
        for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
          const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
          const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });
          chunk.forEach((docSnap) => {
            batch.delete(doc(db, 'exams', docSnap.id));
          });
          await batch.commit();
        }
        console.log(`🗑️ Đã xóa sạch toàn bộ ${snap.size} đề thi trên Cloud Firestore bằng writeBatch!`);
      }
    }
    saveExamsToLocalStorage([]);
  } catch (error) {
    console.error("Lỗi khi xóa toàn bộ đề thi khỏi Firestore:", error);
    saveExamsToLocalStorage([]);
  }
}

export {
  exportQuestionsToJSON,
  importQuestionsFromJSON,
  seedInitialQuestionsManually,
  restoreFullQuestionBank
} from './questionStorageService';

/**
 * Xuất khẩu danh sách Đề kiểm tra ra file JSON
 */
export function exportExamsToJSON(examsInput?: ExamPaper[]): string {
  const list = examsInput && examsInput.length > 0 ? examsInput : getLocalCachedExams();
  const jsonStr = JSON.stringify(list, null, 2);

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `danh_sach_de_thi_eduplay_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Lỗi khi tải file JSON đề thi:', e);
    }
  }

  return jsonStr;
}

/**
 * Nhập khẩu danh sách Đề kiểm tra từ JSON
 */
export async function importExamsFromJSON(
  jsonInput: string | ExamPaper[]
): Promise<{ success: boolean; count: number; totalCount: number; message: string }> {
  try {
    let parsed: any[];
    if (typeof jsonInput === 'string') {
      const cleaned = jsonInput.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } else {
      parsed = jsonInput;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return {
        success: false,
        count: 0,
        totalCount: getLocalCachedExams().length,
        message: 'Dữ liệu JSON đề thi không hợp lệ hoặc rỗng.'
      };
    }

    const current = getLocalCachedExams();
    const idMap = new Map(current.map(e => [e.id, e]));

    parsed.forEach(item => {
      if (item && item.id) {
        idMap.set(item.id, item as ExamPaper);
      }
    });

    const merged = Array.from(idMap.values());
    saveExamsToLocalStorage(merged);

    if (db) {
      const CHUNK_SIZE = 450;
      for (let i = 0; i < parsed.length; i += CHUNK_SIZE) {
        const chunk = parsed.slice(i, i + CHUNK_SIZE);
        const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });
        chunk.forEach(exam => {
          if (exam && exam.id) {
            const docRef = doc(db, 'exams', exam.id);
            batch.set(docRef, removeUndefined(exam), { merge: true });
          }
        });
        await batch.commit().catch(console.warn);
      }
    }

    return {
      success: true,
      count: parsed.length,
      totalCount: merged.length,
      message: `Đã nhập thành công ${parsed.length} đề thi vào hệ thống!`
    };
  } catch (err: any) {
    console.error('Lỗi khi nhập đề thi từ JSON:', err);
    return {
      success: false,
      count: 0,
      totalCount: getLocalCachedExams().length,
      message: `Lỗi đọc file JSON đề thi: ${err?.message || String(err)}`
    };
  }
}

export type PublicExamFetchResult =
  | { status: 'ok'; exam: ExamPaper }
  | { status: 'not_found' }
  | { status: 'error'; message?: string };

/**
 * Trích xuất ID đề kiểm tra khi URL có dạng /exam/[examId]
 */
export function extractExamIdFromPath(pathname?: string): string | null {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const match = path.match(/^\/exam\/([^/?#]+)\/?$/i);
  if (!match || !match[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return match[1].trim() || null;
  }
}

/**
 * Tải nội dung đề kiểm tra công khai theo ID (chế độ chỉ đọc, tự động signInAnonymously ngầm nếu cần).
 */
export async function fetchPublicExamById(examId: string): Promise<PublicExamFetchResult> {
  const cleanId = (examId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensureAnonymousGuestAuth();

  if (db) {
    try {
      const ref = doc(db, 'exams', cleanId);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch {
        snap = await getDoc(ref);
      }

      if (snap.exists()) {
        const exam = { id: snap.id, ...snap.data() } as ExamPaper;
        return { status: 'ok', exam };
      }

      // Thử tìm đề gốc nếu ID có hậu tố -class-...
      const baseId = cleanId.replace(/-class-[a-z0-9_-]+$/i, '');
      if (baseId && baseId !== cleanId) {
        const baseRef = doc(db, 'exams', baseId);
        let baseSnap;
        try {
          baseSnap = await getDocFromServer(baseRef);
        } catch {
          baseSnap = await getDoc(baseRef);
        }
        if (baseSnap.exists()) {
          const exam = { id: cleanId, ...baseSnap.data() } as ExamPaper;
          return { status: 'ok', exam };
        }
      }
    } catch (err: any) {
      console.warn('Lỗi tải đề kiểm tra từ Firestore, chuyển sang dự phòng cache:', err);
      const cached = getRawCachedExams().find(
        item => item.id === cleanId || item.originalExamId === cleanId
      );
      if (cached) {
        return { status: 'ok', exam: cached };
      }
      return {
        status: 'error',
        message: 'Không thể kết nối đến máy chủ đề kiểm tra. Vui lòng thử lại sau.'
      };
    }
  }

  const cached = getRawCachedExams().find(
    item => item.id === cleanId || item.originalExamId === cleanId
  );
  if (cached) {
    return { status: 'ok', exam: cached };
  }

  return { status: 'not_found' };
}




