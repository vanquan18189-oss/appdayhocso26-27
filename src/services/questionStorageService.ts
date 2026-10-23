import { QuestionItem } from '../types';
import { extractTrueOrderingFromQuestion } from '../lib/constants';
import { extractGradeDigit } from './classStorageService';

export const extractCanonicalOrdering = extractTrueOrderingFromQuestion;
export { extractTrueOrderingFromQuestion, extractGradeDigit };

/**
 * Chuẩn hóa hàm lọc Khối: Khối 4 nhận diện toàn bộ câu hỏi có trường grade là "Khối 4" hoặc "4"
 */
export function isQuestionMatchingGrade(questionGrade?: string, filterGrade?: string): boolean {
  if (!filterGrade || filterGrade === 'Tất cả các khối' || filterGrade === 'all') return true;
  if (!questionGrade) return false;
  if (questionGrade.trim().toLowerCase() === filterGrade.trim().toLowerCase()) return true;

  const fDigit = extractGradeDigit(filterGrade);
  const qDigit = extractGradeDigit(questionGrade);
  if (fDigit && qDigit) {
    return fDigit === qDigit;
  }
  return questionGrade.toLowerCase().includes(filterGrade.toLowerCase()) || filterGrade.toLowerCase().includes(questionGrade.toLowerCase());
}

import { db, auth, isFirestoreQuotaExceeded, markFirestoreQuotaExceeded } from './firebase';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  getDocFromServer
} from 'firebase/firestore';
import { trackedSetDoc, trackedDeleteDoc, trackedWriteBatch } from './firestoreWriteTracker';
import { INITIAL_QUESTIONS } from './mockData';
import { waitForWriteConfirmation, updateCollectionCacheStatus } from './firestoreWriteVerificationService';

export const QUESTIONS_CACHE_KEY = 'eduplay_questions_database_cache';
export const QUESTIONS_COLLECTION = 'questions';

export enum FirestoreOpType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: FirestoreOpType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: FirestoreOpType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function fixMisTypedTrueFalseQuestions(questions: QuestionItem[]): { fixedQuestions: QuestionItem[]; fixedCount: number; fixedIds: string[] } {
  let fixedCount = 0;
  const fixedIds: string[] = [];
  const fixedQuestions = (questions || []).map(q => {
    if (!q) return q;
    const hasStatements = Array.isArray(q.statements) && q.statements.length > 0;
    const typeStr = (q.type || '').trim().toLowerCase();
    const isWrongType = typeStr === 'matching' || typeStr === 'nối cặp' || typeStr === 'noi_cap' || typeStr === 'ghep_noi' || typeStr === 'ghép nối' || typeStr === 'classification' || typeStr === 'phan_loai';
    
    if (hasStatements && (typeStr !== 'true_false' || isWrongType)) {
      fixedCount++;
      fixedIds.push(q.id);
      return {
        ...q,
        type: 'true_false'
      };
    }
    return q;
  });
  if (fixedCount > 0) {
    console.log(`🔧 Đã tự động sửa ${fixedCount} câu hỏi Đúng/Sai nhiều mệnh đề bị gán nhầm type (IDs: ${fixedIds.join(', ')})`);
  }
  return { fixedQuestions, fixedCount, fixedIds };
}

/**
 * Clean & sanitize question data before saving to Firestore to prevent undefined or missing fields
 */
export function sanitizeQuestionForFirestore(q: QuestionItem): QuestionItem {
  const safeId = q.id || `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  let qType = q.type || 'multiple_choice';
  const hasMatchingPairs = Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0;
  const contentLower = (q.content || '').toLowerCase();
  const hasMatchingKeywords = contentLower.includes('cột a') && contentLower.includes('cột b') || contentLower.includes('nối') || contentLower.includes('ghép cặp');
  const isMatchingType = qType === 'matching' || qType === 'nối cặp' || qType === 'kéo thả' || hasMatchingPairs || hasMatchingKeywords;
  const hasStatements = Array.isArray(q.statements) && q.statements.length > 0;

  if (isMatchingType) {
    qType = 'matching';
  } else if (hasStatements) {
    qType = 'true_false';
  }

  const isOrdering = qType === 'ordering' || qType === 'sắp xếp' || qType === 'sắp xếp thứ tự' || qType === 'sap_xep';
  let defaultCorrectAnswer = 'A';
  if (q.type === 'essay') {
    defaultCorrectAnswer = 'Gợi ý chấm tự luận';
  } else if (isOrdering && Array.isArray(q.options) && q.options.length > 0) {
    defaultCorrectAnswer = q.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  }

  const cleanQ: QuestionItem = {
    id: String(safeId),
    code: q.code || `CH-${(q.subject || 'TOAN').toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}`,
    subject: q.subject || 'Toán',
    grade: q.grade || 'Khối 3',
    level: q.level || 'nhan_biet',
    type: qType,
    content: q.content || 'Nội dung câu hỏi',
    lessonName: q.lessonName || 'Bài học',
    correctAnswer: q.correctAnswer || defaultCorrectAnswer,
    explanation: q.explanation || 'Hướng dẫn sư phạm cho câu hỏi.',
  };

  if (Array.isArray(q.options) && q.options.length > 0) {
    cleanQ.options = q.options.filter(Boolean);
  }

  if (isOrdering) {
    const trueSequence = extractTrueOrderingFromQuestion(q);
    cleanQ.correctOrder = trueSequence.length > 0 ? trueSequence : (cleanQ.options || []);
    cleanQ.order = (cleanQ.options || []).map((_, i) => i);
    cleanQ.indices = (cleanQ.options || []).map((_, i) => i);
    cleanQ.correctAnswer = cleanQ.correctOrder.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  }

  if (Array.isArray(q.statements) && q.statements.length > 0) {
    cleanQ.statements = q.statements.map(st => ({
      statement: st.statement || '',
      isCorrect: Boolean(st.isCorrect),
      explanation: st.explanation || ''
    }));
  }

  if (Array.isArray(q.classificationGroups) && q.classificationGroups.length > 0) {
    cleanQ.classificationGroups = q.classificationGroups.filter(Boolean);
  }

  if (Array.isArray(q.classificationItems) && q.classificationItems.length > 0) {
    cleanQ.classificationItems = q.classificationItems.map(item => ({
      name: item.name || '',
      group: item.group || ''
    }));
  }

  if (Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0) {
    cleanQ.matchingPairs = q.matchingPairs.map(p => ({
      left: p.left || '',
      right: p.right || '',
      match: p.match || ''
    }));
  }

  if (q.authorName) cleanQ.authorName = q.authorName;
  if (q.authorType) cleanQ.authorType = q.authorType;

  return cleanQ;
}

/**
 * Retrieve cached questions from localStorage
 */
export function getLocalCachedQuestions(): QuestionItem[] {
  let questions: QuestionItem[] = [];
  try {
    const raw = localStorage.getItem(QUESTIONS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        questions = parsed;
      }
    }
  } catch (e) {
    console.warn('Could not read cached questions from localStorage', e);
  }
  const { fixedQuestions, fixedCount } = fixMisTypedTrueFalseQuestions(questions);
  let finalQuestions = fixedQuestions;

  let orderingFixedCount = 0;
  finalQuestions = finalQuestions.map(q => {
    if (!q) return q;
    const isOrdering = q.type === 'ordering' || q.type === 'sắp xếp' || q.type === 'sắp xếp thứ tự' || q.type === 'sap_xep';
    if (isOrdering) {
      const trueSeq = extractTrueOrderingFromQuestion(q);
      if (trueSeq.length > 0) {
        const correctAnsStr = trueSeq.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
        if (JSON.stringify(q.correctOrder) !== JSON.stringify(trueSeq) || q.correctAnswer !== correctAnsStr) {
          orderingFixedCount++;
          return {
            ...q,
            correctOrder: trueSeq,
            order: (q.options || []).map((_, i) => i),
            indices: (q.options || []).map((_, i) => i),
            correctAnswer: correctAnsStr
          };
        }
      }
    }
    return q;
  });

  if (fixedCount > 0 || orderingFixedCount > 0) {
    saveLocalCachedQuestions(finalQuestions);
  }
  return finalQuestions;
}

/**
 * Save questions to local cache
 */
export function saveLocalCachedQuestions(questions: QuestionItem[]): void {
  try {
    localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(questions));
  } catch (e) {
    console.warn('Could not write questions to localStorage', e);
  }
}

/**
 * Dispatch notification toast - Xóa bỏ hoàn toàn khối thông báo debug trên giao diện
 */
export function notifyQuestionSaved(_count: number = 1, _title?: string) {
  // Không phát sự kiện thông báo debug ra giao diện
}

/**
 * Save a single question to Firestore & cache
 */
export async function saveQuestionToFirestore(question: QuestionItem): Promise<void> {
  const sanitized = sanitizeQuestionForFirestore(question);
  const path = `${QUESTIONS_COLLECTION}/${sanitized.id}`;

  try {
    if (!db) {
      const current = getLocalCachedQuestions();
      const updated = current.some(q => q.id === sanitized.id)
        ? current.map(q => (q.id === sanitized.id ? sanitized : q))
        : [sanitized, ...current];
      saveLocalCachedQuestions(updated);
      return;
    }

    const docRef = doc(db, QUESTIONS_COLLECTION, sanitized.id);
    await trackedSetDoc(docRef, sanitized);

    // Update local cache
    const current = getLocalCachedQuestions();
    const updated = current.some(q => q.id === sanitized.id)
      ? current.map(q => (q.id === sanitized.id ? sanitized : q))
      : [sanitized, ...current];
    saveLocalCachedQuestions(updated);
  } catch (error) {
    console.error('Error saving single question to Firestore:', error);
    // Even if firestore errors, update cache
    const current = getLocalCachedQuestions();
    const updated = current.some(q => q.id === sanitized.id)
      ? current.map(q => (q.id === sanitized.id ? sanitized : q))
      : [sanitized, ...current];
    saveLocalCachedQuestions(updated);

    handleFirestoreError(error, FirestoreOpType.WRITE, path);
  }
}

/**
 * Save a batch of questions to Firestore (e.g. from AI Generation)
 */
export async function saveQuestionsBatchToFirestore(
  questions: QuestionItem[]
): Promise<{ success: boolean; count: number }> {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { success: true, count: 0 };
  }

  const sanitizedList = questions.map(q => sanitizeQuestionForFirestore(q));

  if (!db || isFirestoreQuotaExceeded()) {
    const current = getLocalCachedQuestions();
    const idMap = new Map(sanitizedList.map(q => [q.id, q]));
    const updatedExisting = current.map(q => (idMap.has(q.id) ? idMap.get(q.id)! : q));
    const newItems = sanitizedList.filter(q => !current.some(c => c.id === q.id));
    const finalCache = [...newItems, ...updatedExisting];
    saveLocalCachedQuestions(finalCache);
    notifyQuestionSaved(sanitizedList.length);
    return { success: true, count: sanitizedList.length };
  }

  const TIMEOUT_MS = 15000;
  let timeoutId: any = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Hết thời gian chờ phản hồi từ CSDL Firestore (15 giây). Vui lòng kiểm tra lại kết nối mạng hoặc quyền truy cập."));
    }, TIMEOUT_MS);
  });

  const batchWriteOperation = async (): Promise<{ success: boolean; count: number }> => {
    // 1. Chunk writeBatch into maximum 500 operations per batch
    const CHUNK_SIZE = 500;
    for (let i = 0; i < sanitizedList.length; i += CHUNK_SIZE) {
      const chunk = sanitizedList.slice(i, i + CHUNK_SIZE);
      const batch = trackedWriteBatch(db);
      chunk.forEach(q => {
        const docRef = doc(db, QUESTIONS_COLLECTION, q.id);
        batch.set(docRef, q);
      });
      await batch.commit();
    }

    // 2. Verification read from server using getDocFromServer to confirm persistence
    if (sanitizedList.length > 0) {
      const firstId = sanitizedList[0].id;
      const verifyDocRef = doc(db, QUESTIONS_COLLECTION, firstId);
      try {
        const snap = await getDocFromServer(verifyDocRef);
        if (!snap.exists()) {
          throw new Error("Không thể xác nhận dữ liệu đã được lưu thành công trên máy chủ Firestore.");
        }
      } catch (verifyErr: any) {
        console.warn('Xác thực ghi dữ liệu lên máy chủ gặp cảnh báo:', verifyErr);
        if (verifyErr?.code === 'permission-denied' || verifyErr?.message?.includes('permission')) {
          throw verifyErr;
        }
      }
    }

    // 3. Update local cache after server verification
    const current = getLocalCachedQuestions();
    const idMap = new Map(sanitizedList.map(q => [q.id, q]));
    const updatedExisting = current.map(q => (idMap.has(q.id) ? idMap.get(q.id)! : q));
    const newItems = sanitizedList.filter(q => !current.some(c => c.id === q.id));
    const finalCache = [...newItems, ...updatedExisting];
    saveLocalCachedQuestions(finalCache);

    notifyQuestionSaved(sanitizedList.length);
    return { success: true, count: sanitizedList.length };
  };

  try {
    const result = await Promise.race([batchWriteOperation(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error('Lỗi khi lưu danh sách câu hỏi vào Firestore:', error);

    const errMsg = error?.message || String(error || '');
    if (
      errMsg.includes('resource-exhausted') ||
      errMsg.includes('Quota exceeded') ||
      errMsg.includes('unavailable')
    ) {
      try {
        localStorage.setItem('eduplay_firestore_quota_exceeded', 'true');
      } catch {}
    }

    throw error;
  }
}

/**
 * Tải danh sách câu hỏi dạng bản sao file JSON
 */
export function downloadQuestionsAsJSON(questions: QuestionItem[], filename = 'danh_sach_cau_hoi_ai.json'): void {
  try {
    const jsonStr = JSON.stringify(questions, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Lỗi khi tải file JSON câu hỏi:', e);
  }
}

/**
 * Tải danh sách câu hỏi dạng bản sao file Excel/CSV
 */
export function downloadQuestionsAsCSV(questions: QuestionItem[], filename = 'danh_sach_cau_hoi_ai.csv'): void {
  try {
    const headers = ['STT', 'Mã CH', 'Nội dung', 'Loại câu', 'Mức độ', 'Chủ đề/Bài học', 'Khối', 'Môn', 'Phương án/Mệnh đề', 'Đáp án đúng', 'Giải thích'];
    const rows = (questions || []).map((q, idx) => {
      let optionsText = '';
      if (Array.isArray(q.options)) {
        optionsText = q.options.join(' | ');
      } else if (Array.isArray(q.statements)) {
        optionsText = q.statements.map((s) => `${s.statement}: ${s.isCorrect ? 'Đúng' : 'Sai'}`).join(' | ');
      }
      return [
        idx + 1,
        q.code || '',
        `"${(q.content || '').replace(/"/g, '""')}"`,
        q.type || '',
        q.level || '',
        `"${(q.lessonName || '').replace(/"/g, '""')}"`,
        q.grade || '',
        q.subject || '',
        `"${optionsText.replace(/"/g, '""')}"`,
        `"${(q.correctAnswer || '').replace(/"/g, '""')}"`,
        `"${(q.explanation || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Lỗi khi tải file CSV câu hỏi:', e);
  }
}


/**
 * Delete a question from Firestore & cache
 */
export async function deleteQuestionFromFirestore(id: string): Promise<void> {
  const path = `${QUESTIONS_COLLECTION}/${id}`;

  if (!db || isFirestoreQuotaExceeded()) {
    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => q.id !== id));
    return;
  }

  const TIMEOUT_MS = 15000;
  let timeoutId: any = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Hết thời gian kết nối đến Firestore (15 giây). Đã hủy thao tác xóa."));
    }, TIMEOUT_MS);
  });

  const deleteOp = async () => {
    const docRef = doc(db, QUESTIONS_COLLECTION, id);
    await trackedDeleteDoc(docRef);
    await waitForWriteConfirmation(docRef, 12000, true);
    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => q.id !== id));
  };

  try {
    await Promise.race([deleteOp(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error('Error deleting question from Firestore:', error);
    const errMsg = error?.message || String(error || '');
    if (
      errMsg.includes('resource-exhausted') ||
      errMsg.includes('Quota exceeded') ||
      errMsg.includes('unavailable')
    ) {
      try {
        localStorage.setItem('eduplay_firestore_quota_exceeded', 'true');
      } catch {}
      const current = getLocalCachedQuestions();
      saveLocalCachedQuestions(current.filter(q => q.id !== id));
      return;
    }
    handleFirestoreError(error, FirestoreOpType.DELETE, path);
    throw error;
  }
}

/**
 * Delete multiple questions from Firestore & cache
 */
export async function deleteQuestionsBatchFromFirestore(
  ids: string[],
  onProgress?: (deletedSoFar: number, total: number) => void
): Promise<{ success: boolean; count: number }> {
  if (!ids || ids.length === 0) return { success: true, count: 0 };

  localStorage.setItem('eduplay_questions_db_initialized', 'true');
  const idSet = new Set(ids);

  if (!db || isFirestoreQuotaExceeded()) {
    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => !idSet.has(q.id)));
    if (onProgress) onProgress(ids.length, ids.length);
    return { success: true, count: ids.length };
  }

  const TIMEOUT_MS = 15000;
  let timeoutId: any = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Hết thời gian kết nối đến Firestore (15 giây). Đã hủy thao tác xóa."));
    }, TIMEOUT_MS);
  });

  const deleteOperation = async (): Promise<{ success: boolean; count: number }> => {
    const chunkSize = 100;
    let deletedCount = 0;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const batch = trackedWriteBatch(db);
      chunk.forEach(id => {
        const docRef = doc(db, QUESTIONS_COLLECTION, id);
        batch.delete(docRef);
      });
      await batch.commit();
      await waitForWriteConfirmation(null, 12000, true);
      deletedCount += chunk.length;
      if (onProgress) {
        onProgress(deletedCount, ids.length);
      }
    }

    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => !idSet.has(q.id)));

    return { success: true, count: ids.length };
  };

  try {
    const result = await Promise.race([deleteOperation(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error('Lỗi khi thực hiện writeBatch trên Firestore:', error);
    const errMsg = error?.message || String(error || '');

    if (
      errMsg.includes('resource-exhausted') ||
      errMsg.includes('Quota exceeded') ||
      errMsg.includes('unavailable')
    ) {
      try {
        localStorage.setItem('eduplay_firestore_quota_exceeded', 'true');
      } catch {}
      const current = getLocalCachedQuestions();
      saveLocalCachedQuestions(current.filter(q => !idSet.has(q.id)));
      if (onProgress) onProgress(ids.length, ids.length);
      return { success: true, count: ids.length };
    }

    const path = `${QUESTIONS_COLLECTION}/[batch_${ids.length}]`;
    handleFirestoreError(error, FirestoreOpType.DELETE, path);
    throw error;
  }
}

/**
 * Fetch all questions from Firestore directly (one-time fetch)
 */
export async function fetchQuestionsFromFirestore(): Promise<QuestionItem[]> {
  try {
    if (!db) return getLocalCachedQuestions();

    const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
    if (!snap.empty) {
      localStorage.setItem('eduplay_questions_db_initialized', 'true');
      const items: QuestionItem[] = snap.docs.map(docSnap => ({
        ...(docSnap.data() as QuestionItem),
        id: docSnap.id
      }));
      saveLocalCachedQuestions(items);
      return items;
    } else {
      saveLocalCachedQuestions([]);
      return [];
    }
  } catch (error) {
    console.warn('Error fetching questions from Firestore, returning local cache:', error);
    return getLocalCachedQuestions();
  }
}

/**
 * Live subscription to questions in Firestore
 */
export function subscribeToQuestionsFromFirestore(
  onData: (questions: QuestionItem[]) => void,
  onError?: (error: any) => void
): () => void {
  if (!db) {
    onData(getLocalCachedQuestions());
    return () => {};
  }

  try {
    const qRef = collection(db, QUESTIONS_COLLECTION);
    return onSnapshot(
      qRef,
      snapshot => {
        const isFromCache = snapshot.metadata.fromCache;
        const hasPending = snapshot.metadata.hasPendingWrites;

        updateCollectionCacheStatus('questions', isFromCache, snapshot.size, hasPending);

        if (!snapshot.empty) {
          localStorage.setItem('eduplay_questions_db_initialized', 'true');
          const loaded: QuestionItem[] = snapshot.docs.map(d => ({
            ...(d.data() as QuestionItem),
            id: d.id
          }));
          saveLocalCachedQuestions(loaded);
          onData(loaded);
        } else {
          saveLocalCachedQuestions([]);
          onData([]);
        }
      },
      err => {
        console.warn('Error in subscribeToQuestionsFromFirestore snapshot:', err);
        if (onError) onError(err);
        onData(getLocalCachedQuestions());
      }
    );
  } catch (err) {
    console.warn('Error setting up subscribeToQuestionsFromFirestore:', err);
    onData(getLocalCachedQuestions());
    return () => {};
  }
}

/**
 * Migration trực tiếp trên Firestore cho toàn bộ câu hỏi Sắp Xếp Thứ Tự (Ordering)
 */
export async function migrateFirestoreOrderingData(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    console.log('🔄 [MIGRATION START] Đang quét và nâng cấp dữ liệu câu hỏi Sắp xếp thứ tự...');
    
    // 1. Quét dữ liệu từ LocalStorage Cache trước
    const cachedQuestions = getLocalCachedQuestions();
    const migratedQuestions: QuestionItem[] = [];

    cachedQuestions.forEach(q => {
      const isOrdering = q.type === 'ordering' || q.type === 'sắp xếp' || q.type === 'sắp xếp thứ tự' || q.type === 'sap_xep';
      if (isOrdering) {
        const trueOrder = extractTrueOrderingFromQuestion(q);
        if (trueOrder.length > 0) {
          const newAnswerStr = trueOrder.map((s, i) => `${i + 1}. ${s}`).join('\n');
          console.log(`📌 [MIGRATION ĐỌC DỮ LIỆU CŨ] ID: ${q.id} | Nội dung: ${q.content?.slice(0, 50)}...`);
          console.log('   🔴 correctOrder TRƯỚC khi Migrate:', q.correctOrder);
          console.log('   🔴 correctAnswer TRƯỚC khi Migrate:', q.correctAnswer);
          console.log('   ✅ correctOrder SAU khi Migrate (CHUẨN SƯ PHẠM):', trueOrder);

          const updatedQ: QuestionItem = {
            ...q,
            correctOrder: trueOrder,
            order: (q.options || []).map((_, i) => i),
            indices: (q.options || []).map((_, i) => i),
            correctAnswer: newAnswerStr
          };
          migratedQuestions.push(updatedQ);
        }
      }
    });

    // 2. Đọc trực tiếp từ Firestore để ghi đè
    const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
    if (!snap.empty) {
      const batch = trackedWriteBatch(db);
      let batchCount = 0;

      snap.docs.forEach(docSnap => {
        const q = { ...(docSnap.data() as QuestionItem), id: docSnap.id };
        const isOrdering = q.type === 'ordering' || q.type === 'sắp xếp' || q.type === 'sắp xếp thứ tự' || q.type === 'sap_xep';
        if (isOrdering) {
          const trueOrder = extractTrueOrderingFromQuestion(q);
          if (trueOrder.length > 0) {
            const newAnswerStr = trueOrder.map((s, i) => `${i + 1}. ${s}`).join('\n');
            const sanitized = sanitizeQuestionForFirestore({
              ...q,
              correctOrder: trueOrder,
              order: (q.options || []).map((_, i) => i),
              indices: (q.options || []).map((_, i) => i),
              correctAnswer: newAnswerStr
            });
            batch.set(doc(db, QUESTIONS_COLLECTION, q.id), sanitized);
            batchCount++;
          }
        }
      });

      if (batchCount > 0) {
        await batch.commit();
        console.log(`🚀 [MIGRATION FIRESTORE] Đã ghi đè trực tiếp thành công ${batchCount} câu hỏi Sắp xếp thứ tự vào Firestore!`);
      }
    }

    if (migratedQuestions.length > 0) {
      saveLocalCachedQuestions(cachedQuestions.map(q => {
        const found = migratedQuestions.find(m => m.id === q.id);
        return found ? found : q;
      }));
    }
  } catch (err) {
    console.warn('Lỗi trong quá trình chạy Migration Firestore:', err);
  }
}

// Chạy Migration tự động khi ứng dụng khởi chạy
if (typeof window !== 'undefined') {
  setTimeout(() => {
    migrateFirestoreOrderingData().catch(console.warn);
  }, 500);
}


/**
 * Export question bank to JSON string
 */
export function exportQuestionsToJSON(questionsInput?: QuestionItem[]): string {
  const list = questionsInput && questionsInput.length > 0 ? questionsInput : getLocalCachedQuestions();
  return JSON.stringify(list, null, 2);
}

/**
 * Import question bank from JSON string
 */
export function importQuestionsFromJSON(jsonString: string): QuestionItem[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed)) {
      saveLocalCachedQuestions(parsed);
      saveQuestionsBatchToFirestore(parsed).catch(console.warn);
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Lỗi khi đọc file JSON câu hỏi:', err);
    return [];
  }
}

/**
 * Seed initial questions manually (Vô hiệu hóa để giữ database sạch)
 */
export async function seedInitialQuestionsManually(): Promise<void> {
  return;
}

/**
 * Restore full question bank (Vô hiệu hóa để giữ database sạch)
 */
export async function restoreFullQuestionBank(): Promise<void> {
  return;
}
