import { db } from './firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { normalizeStudentCode } from './studentCode';
import { removeUndefined } from './teacherStorageService';

export interface ExamDraftRecord {
  id?: string;
  studentCode: string;
  studentId?: string;
  studentName?: string;
  studentClass?: string;
  examId: string;
  examTitle?: string;
  answers: Record<number, any>;
  bookmarked?: Record<number, boolean>;
  currentQuestionIndex?: number;
  remainingSeconds: number;
  durationMinutes?: number;
  startTime?: number;
  totalQuestions?: number;
  updatedAt?: string;
}

export const EXAM_DRAFTS_COLLECTION = 'exam_drafts';

/**
 * Tạo khóa lưu trữ nháp chuẩn hóa theo studentCode và examId
 */
export function getDraftStorageKey(rawStudentCode: string, examId: string): string {
  const code = normalizeStudentCode(rawStudentCode);
  const ex = (examId || '').trim();
  return `${code}_${ex}`;
}

/**
 * Lưu nháp bài kiểm tra lên Firestore và LocalStorage
 */
export async function saveExamDraft(
  arg1: string | ExamDraftRecord,
  arg2?: string | Partial<ExamDraftRecord>,
  arg3?: Partial<ExamDraftRecord>
): Promise<void> {
  let params: ExamDraftRecord;
  if (typeof arg1 === 'string') {
    const studentCode = arg1;
    const examId = typeof arg2 === 'string' ? arg2 : (arg3?.examId || '');
    const data = (typeof arg2 === 'object' && arg2 !== null ? arg2 : arg3) || {};
    params = {
      studentCode,
      examId,
      answers: {},
      remainingSeconds: 0,
      ...data
    };
  } else {
    params = arg1;
  }

  const normCode = normalizeStudentCode(params.studentCode);
  if (!normCode || !params.examId) return;

  const draftId = getDraftStorageKey(normCode, params.examId);
  const now = new Date().toISOString();

  const payload: ExamDraftRecord = {
    id: draftId,
    studentCode: normCode,
    studentId: params.studentId || normCode,
    studentName: params.studentName || '',
    studentClass: params.studentClass || '',
    examId: params.examId,
    examTitle: params.examTitle || '',
    answers: params.answers || {},
    bookmarked: params.bookmarked || {},
    currentQuestionIndex: params.currentQuestionIndex || 0,
    remainingSeconds: params.remainingSeconds || 0,
    durationMinutes: params.durationMinutes || 15,
    startTime: params.startTime || Date.now(),
    totalQuestions: params.totalQuestions || 0,
    updatedAt: now
  };

  // 1. Luôn lưu ngay vào LocalStorage để phản hồi tức thời
  try {
    localStorage.setItem(`eduplay_exam_draft_${draftId}`, JSON.stringify(payload));
  } catch {}

  // 2. Lưu đồng bộ lên Firestore
  if (db) {
    try {
      const draftRef = doc(db, EXAM_DRAFTS_COLLECTION, draftId);
      await setDoc(draftRef, removeUndefined(payload), { merge: true });
    } catch (err) {
      console.warn('Lỗi lưu nháp bài kiểm tra lên Firestore:', err);
    }
  }
}

/**
 * Đọc bản nháp bài kiểm tra còn hiệu lực của học sinh
 */
export async function getExamDraft(
  rawStudentCode: string,
  examId: string
): Promise<ExamDraftRecord | null> {
  const normCode = normalizeStudentCode(rawStudentCode);
  if (!normCode || !examId) return null;

  const draftId = getDraftStorageKey(normCode, examId);

  // 1. Thử đọc từ Firestore trước
  let draftData: ExamDraftRecord | null = null;
  if (db) {
    try {
      const draftRef = doc(db, EXAM_DRAFTS_COLLECTION, draftId);
      const snap = await getDoc(draftRef);
      if (snap.exists()) {
        draftData = snap.data() as ExamDraftRecord;
      }
    } catch (err) {
      console.warn('Lỗi đọc nháp bài kiểm tra từ Firestore:', err);
    }
  }

  // 2. Dự phòng từ LocalStorage nếu Firestore chưa có hoặc offline
  if (!draftData) {
    try {
      const localStr = localStorage.getItem(`eduplay_exam_draft_${draftId}`);
      if (localStr) {
        draftData = JSON.parse(localStr);
      }
    } catch {}
  }

  if (!draftData) return null;

  // 3. Kiểm tra tính hợp lệ về thời gian: nếu đã hết thời gian làm bài thì không cho làm tiếp
  if (draftData.remainingSeconds <= 0) {
    return null;
  }

  return draftData;
}

/**
 * Xóa bản nháp sau khi đã nộp bài thành công
 */
export async function deleteExamDraft(
  rawStudentCode: string,
  examId: string
): Promise<void> {
  const normCode = normalizeStudentCode(rawStudentCode);
  if (!normCode || !examId) return;

  const draftId = getDraftStorageKey(normCode, examId);

  // Xóa LocalStorage
  try {
    localStorage.removeItem(`eduplay_exam_draft_${draftId}`);
  } catch {}

  // Xóa Firestore
  if (db) {
    try {
      const draftRef = doc(db, EXAM_DRAFTS_COLLECTION, draftId);
      await deleteDoc(draftRef);
    } catch (err) {
      console.warn('Lỗi xóa nháp bài kiểm tra trên Firestore:', err);
    }
  }
}

/**
 * Tải toàn bộ bản nháp đang hoạt động của học sinh cho tất cả các đề kiểm tra
 */
export async function loadAllActiveDraftsForStudent(
  rawStudentCode: string
): Promise<Record<string, ExamDraftRecord>> {
  const normCode = normalizeStudentCode(rawStudentCode);
  if (!normCode) return {};

  const result: Record<string, ExamDraftRecord> = {};

  // 1. Quét LocalStorage trước
  try {
    const prefix = `eduplay_exam_draft_${normCode}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const item = JSON.parse(localStorage.getItem(key) || '{}');
          if (item && item.examId && item.remainingSeconds > 0) {
            result[item.examId] = item;
          }
        } catch {}
      }
    }
  } catch {}

  // 2. Quét Firestore
  if (db) {
    try {
      const draftsRef = collection(db, EXAM_DRAFTS_COLLECTION);
      const q = query(draftsRef, where('studentCode', '==', normCode));
      const snaps = await getDocs(q);
      snaps.forEach((docSnap) => {
        const item = docSnap.data() as ExamDraftRecord;
        if (item && item.examId && item.remainingSeconds > 0) {
          result[item.examId] = item;
          // Lưu vào local cache
          try {
            localStorage.setItem(`eduplay_exam_draft_${item.id || getDraftStorageKey(normCode, item.examId)}`, JSON.stringify(item));
          } catch {}
        }
      });
    } catch (err) {
      console.warn('Lỗi truy vấn danh sách nháp học sinh từ Firestore:', err);
    }
  }

  return result;
}
