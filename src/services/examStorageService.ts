import { db, isFirestoreQuotaExceeded, markFirestoreQuotaExceeded } from './firebase';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { trackedSetDoc, trackedDeleteDoc, trackedWriteBatch, extractFirestoreErrorDetails } from './firestoreWriteTracker';
import { ExamPaper } from '../types';
import { INITIAL_EXAMS } from './mockData';
import { removeUndefined } from './teacherStorageService';
import { waitForWriteConfirmation, updateCollectionCacheStatus } from './firestoreWriteVerificationService';

const EXAMS_CACHE_KEY = 'eduplay_cached_exams';

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
    if (seenIds.has(exam.id)) return;

    seenIds.add(exam.id);
    clean.push(exam);
  });

  return clean;
}

/**
 * Quét và dọn dẹp các bản ghi đề thi trùng lặp trong cả LocalStorage và Firestore
 */
export async function cleanDuplicateExams(): Promise<void> {
  try {
    const cached = getLocalCachedExams();
    const cleanList = deduplicateExams(cached);
    if (cleanList.length !== cached.length) {
      console.log(`🧹 Đã dọn dẹp ${cached.length - cleanList.length} đề thi trùng lặp trong LocalStorage`);
      saveExamsToLocalStorage(cleanList);
    }
  } catch (err) {
    console.warn('Lỗi khi chạy cleanDuplicateExams:', err);
  }
}

// Chạy dọn dẹp tự động khi tải
if (typeof window !== 'undefined') {
  setTimeout(() => {
    cleanDuplicateExams().catch(console.error);
  }, 1000);
}

/**
 * Lấy danh sách đề thi từ LocalStorage Cache
 */
export function getLocalCachedExams(): ExamPaper[] {
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
 * Lưu một Đề kiểm tra lên Firestore
 */
export async function saveExamToFirestore(exam: ExamPaper): Promise<void> {
  try {
    const targetDigit = extractGradeDigit(exam.targetClass) || extractGradeDigit(exam.grade) || '5';
    const normalizedGrade = `Khối ${targetDigit}`;
    exam.grade = normalizedGrade;

    // Check if an existing record matches by ID only
    const current = getLocalCachedExams();
    const existsIdx = current.findIndex(e => e.id === exam.id);
    let updated: ExamPaper[];
    if (existsIdx >= 0) {
      updated = [...current];
      updated[existsIdx] = { ...current[existsIdx], ...exam };
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
    } catch (setDocErr: any) {
      const errDetails = extractFirestoreErrorDetails(setDocErr);
      console.error(`❌ [LỖI FIRESTORE TỪ CHỐI LƯU ĐỀ THI KHỐI ${normalizedGrade}]`, {
        message: errDetails.message,
        code: errDetails.code,
        examId: exam.id,
        grade: normalizedGrade,
        targetClass: exam.targetClass,
        payload: cleanedPayload
      });
      throw new Error(errDetails.message);
    }

    // Chờ xác nhận ghi từ máy chủ qua waitForPendingWrites & getDocFromServer
    const writeResult = await waitForWriteConfirmation(examRef, 12000, false);
    if (writeResult.success) {
      console.log(`💾 [Máy chủ xác nhận] Đã lưu đề thi "${exam.title}" (Khối: ${normalizedGrade}, Lớp: ${exam.targetClass}, ID: ${exam.id}) lên Cloud Firestore!`);
    } else {
      console.warn(`⚠️ [Chưa xác nhận máy chủ Khối ${normalizedGrade}] ${writeResult.message}`);
    }
  } catch (error) {
    console.error(`❌ [Lỗi giao/lưu đề thi Khối ${exam?.grade || '5'} lên Firestore]:`, error);
  }
}

/**
 * Lấy toàn bộ danh sách Đề kiểm tra từ Firestore
 */
export async function getExamsFromFirestore(): Promise<ExamPaper[]> {
  try {
    if (!db) return getLocalCachedExams();

    const examsSnap = await getDocs(collection(db, 'exams'));
    if (!examsSnap.empty) {
      const exams: ExamPaper[] = [];
      examsSnap.forEach(docSnap => {
        exams.push({ id: docSnap.id, ...docSnap.data() } as ExamPaper);
      });
      saveExamsToLocalStorage(exams);
      return exams;
    }

    // Nếu rỗng, không gieo mầm dữ liệu mẫu
    saveExamsToLocalStorage([]);
    return [];
  } catch (error) {
    console.warn("Lỗi đọc danh sách đề thi từ Firestore:", error);
    return getLocalCachedExams();
  }
}

/**
 * Đăng ký lắng nghe thời gian thực (Real-time listener) danh sách Đề kiểm tra từ Firestore
 */
export function subscribeToExamsFromFirestore(
  onUpdate: (exams: ExamPaper[]) => void,
  onError?: (err: any) => void
) {
  if (!db || isFirestoreQuotaExceeded()) {
    onUpdate(getLocalCachedExams());
    return () => {};
  }

  try {
    const examsColRef = collection(db, 'exams');
    return onSnapshot(
      examsColRef,
      (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        const hasPending = snapshot.metadata.hasPendingWrites;

        updateCollectionCacheStatus('exams', isFromCache, snapshot.size, hasPending);

        if (!snapshot.empty) {
          const loadedExams: ExamPaper[] = [];
          snapshot.forEach((docSnap) => {
            loadedExams.push({ id: docSnap.id, ...docSnap.data() } as ExamPaper);
          });
          const cleanLoaded = deduplicateExams(loadedExams);
          cleanLoaded.sort((a, b) => (b.id > a.id ? 1 : -1));
          saveExamsToLocalStorage(cleanLoaded);
          onUpdate(cleanLoaded);
        } else {
          saveExamsToLocalStorage([]);
          onUpdate([]);
        }
      },
      (err) => {
        const msg = err?.message || String(err);
        if (msg.includes('resource-exhausted') || msg.includes('quota') || err?.code === 'resource-exhausted') {
          markFirestoreQuotaExceeded();
        }
        console.warn('Lỗi Firestore Live Exam listener:', err);
        if (onError) onError(err);
        onUpdate(getLocalCachedExams());
      }
    );
  } catch (err) {
    console.warn('Lỗi khởi tạo subscribeToExamsFromFirestore:', err);
    onUpdate(getLocalCachedExams());
    return () => {};
  }
}

/**
 * Xóa một Đề kiểm tra khỏi Firestore
 */
export async function deleteExamFromFirestore(examId: string): Promise<void> {
  try {
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



