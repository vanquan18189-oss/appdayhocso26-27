import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeStudentCode } from './studentCode';

export type QuizSessionType = 'game' | 'assignment' | 'exam';

export type ParticipantLiveStatus = 'joined' | 'playing' | 'completed';

export interface LiveQuizParticipant {
  id: string;
  targetId: string;
  targetTitle?: string;
  subject?: string;
  grade?: string;
  sessionType: QuizSessionType;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentClass: string;
  studentAvatar?: string;
  status: ParticipantLiveStatus;
  score: number;
  scoreStr?: string;
  maxScore: number;
  percentage?: number;
  correctCount: number;
  answeredCount?: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  timeSpentSeconds?: number;
  joinedAt: string;
  updatedAt: string;
  completedAt?: string;
}

const COLLECTION_NAME = 'quiz_live_sessions';
const LOCAL_STORAGE_KEY = 'eduplay_quiz_live_sessions_v1';

// BroadcastChannel để đồng bộ siêu tốc tức thì giữa các tab trên cùng thiết bị/trình duyệt
const broadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('eduplay_live_quiz_channel')
    : null;

function sanitizePayload<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => (value === undefined ? null : value))
  );
}

function getLocalSessions(): Record<string, LiveQuizParticipant> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLocalSession(participant: LiveQuizParticipant): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalSessions();
    current[participant.id] = participant;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(
      new CustomEvent('eduplay_live_quiz_updated', {
        detail: { targetId: participant.targetId }
      })
    );
    broadcastChannel?.postMessage({
      type: 'SESSION_UPDATED',
      targetId: participant.targetId,
      participant
    });
  } catch (e) {
    console.warn('Error saving local live quiz session:', e);
  }
}

/**
 * Chuẩn hóa khóa định danh học sinh duy nhất theo studentCode (tuyệt đối không dùng tên học sinh làm khóa chính)
 */
function resolveCanonicalStudentCode(rawStudentCodeOrId: string): string {
  const normalized = normalizeStudentCode(rawStudentCodeOrId || '');
  if (normalized) return normalized;
  return String(rawStudentCodeOrId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function getDocId(targetId: string, rawStudentCode: string): string {
  const cleanTarget = String(targetId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanStudentCode = resolveCanonicalStudentCode(rawStudentCode);
  return `${cleanTarget}__${cleanStudentCode}`;
}

/**
 * Ghi nhận học sinh bắt đầu tham gia (Join) vào Trò chơi / Bài tập / Bài kiểm tra.
 * Định danh duy nhất theo studentCode chuẩn hóa.
 */
export async function joinQuizLiveSession(params: {
  targetId: string;
  targetTitle?: string;
  subject?: string;
  grade?: string;
  sessionType?: QuizSessionType;
  studentId: string;
  studentName: string;
  studentClass: string;
  studentAvatar?: string;
  totalQuestions: number;
  maxScore?: number;
}): Promise<LiveQuizParticipant> {
  const canonicalStudentCode = resolveCanonicalStudentCode(params.studentId);
  const now = new Date().toISOString();
  const docId = getDocId(params.targetId, canonicalStudentCode);

  const existingLocal = getLocalSessions()[docId];

  const participant: LiveQuizParticipant = {
    id: docId,
    targetId: params.targetId,
    targetTitle: params.targetTitle || existingLocal?.targetTitle,
    subject: params.subject || existingLocal?.subject,
    grade: params.grade || existingLocal?.grade,
    sessionType: params.sessionType || existingLocal?.sessionType || 'game',
    studentId: canonicalStudentCode,
    studentCode: canonicalStudentCode,
    studentName: params.studentName,
    studentClass: params.studentClass,
    studentAvatar: params.studentAvatar || existingLocal?.studentAvatar,
    status: 'playing',
    score: existingLocal?.status === 'completed' ? existingLocal.score : 0,
    maxScore: params.maxScore || params.totalQuestions * 100 || 10,
    correctCount: existingLocal?.status === 'completed' ? existingLocal.correctCount : 0,
    answeredCount: existingLocal?.status === 'completed' ? existingLocal.answeredCount : 0,
    totalQuestions: params.totalQuestions || 1,
    currentQuestionIndex: 0,
    joinedAt: existingLocal?.joinedAt || now,
    updatedAt: now
  };

  saveLocalSession(participant);

  if (db) {
    try {
      await setDoc(
        doc(db, COLLECTION_NAME, docId),
        sanitizePayload({
          ...participant,
          studentCode: canonicalStudentCode,
          studentId: canonicalStudentCode
        }),
        { merge: true }
      );
    } catch (error) {
      console.warn('Error syncing live join to Firestore:', error);
    }
  }

  return participant;
}

/**
 * Cập nhật tiến độ và điểm số tức thời sau mỗi câu trả lời của học sinh (định danh bằng studentCode)
 */
export async function updateQuizLiveProgress(params: {
  targetId: string;
  sessionType?: QuizSessionType;
  studentId: string;
  studentName?: string;
  studentClass?: string;
  studentAvatar?: string;
  score?: number;
  maxScore?: number;
  correctCount?: number;
  answeredCount?: number;
  totalQuestions: number;
  currentQuestionIndex?: number;
}): Promise<void> {
  const canonicalStudentCode = resolveCanonicalStudentCode(params.studentId);
  if (!canonicalStudentCode) return;

  const now = new Date().toISOString();
  const docId = getDocId(params.targetId, canonicalStudentCode);
  const existingLocal = getLocalSessions()[docId];
  const answered =
    params.answeredCount !== undefined
      ? params.answeredCount
      : params.currentQuestionIndex !== undefined
      ? params.currentQuestionIndex + 1
      : existingLocal?.answeredCount || 0;

  const participant: LiveQuizParticipant = {
    id: docId,
    targetId: params.targetId,
    targetTitle: existingLocal?.targetTitle,
    subject: existingLocal?.subject,
    grade: existingLocal?.grade,
    sessionType: params.sessionType || existingLocal?.sessionType || 'game',
    studentId: canonicalStudentCode,
    studentCode: canonicalStudentCode,
    studentName: params.studentName || existingLocal?.studentName || canonicalStudentCode,
    studentClass: params.studentClass || existingLocal?.studentClass || '',
    studentAvatar: params.studentAvatar || existingLocal?.studentAvatar,
    status: 'playing',
    score: params.score !== undefined ? params.score : existingLocal?.score || 0,
    maxScore:
      params.maxScore !== undefined
        ? params.maxScore
        : existingLocal?.maxScore || params.totalQuestions * 100,
    correctCount:
      params.correctCount !== undefined
        ? params.correctCount
        : existingLocal?.correctCount || 0,
    answeredCount: answered,
    totalQuestions: params.totalQuestions,
    currentQuestionIndex:
      params.currentQuestionIndex !== undefined
        ? params.currentQuestionIndex
        : answered,
    joinedAt: existingLocal?.joinedAt || now,
    updatedAt: now
  };

  saveLocalSession(participant);

  if (db) {
    try {
      await setDoc(
        doc(db, COLLECTION_NAME, docId),
        sanitizePayload({
          ...participant,
          studentCode: canonicalStudentCode,
          studentId: canonicalStudentCode
        }),
        { merge: true }
      );
    } catch (error) {
      console.warn('Error updating live progress to Firestore:', error);
    }
  }
}

/**
 * Đánh dấu học sinh hoàn thành lượt chơi / nộp bài và chốt điểm cuối cùng trên Bảng xếp hạng trực tiếp
 */
export async function completeQuizLiveSession(params: {
  targetId: string;
  sessionType?: QuizSessionType;
  studentId: string;
  studentName: string;
  studentClass: string;
  studentAvatar?: string;
  score: number;
  scoreStr?: string;
  maxScore?: number;
  percentage?: number;
  correctCount?: number;
  answeredCount?: number;
  totalQuestions: number;
  timeSpentSeconds?: number;
}): Promise<void> {
  const canonicalStudentCode = resolveCanonicalStudentCode(params.studentId);
  if (!canonicalStudentCode) return;

  const now = new Date().toISOString();
  const docId = getDocId(params.targetId, canonicalStudentCode);
  const existingLocal = getLocalSessions()[docId];
  const resolvedMaxScore = params.maxScore || params.totalQuestions * 100 || 10;
  const resolvedCorrectCount =
    params.correctCount !== undefined
      ? params.correctCount
      : Math.round(params.score / 100);

  const participant: LiveQuizParticipant = {
    id: docId,
    targetId: params.targetId,
    targetTitle: existingLocal?.targetTitle,
    subject: existingLocal?.subject,
    grade: existingLocal?.grade,
    sessionType: params.sessionType || existingLocal?.sessionType || 'game',
    studentId: canonicalStudentCode,
    studentCode: canonicalStudentCode,
    studentName: params.studentName,
    studentClass: params.studentClass,
    studentAvatar: params.studentAvatar || existingLocal?.studentAvatar,
    status: 'completed',
    score: params.score,
    scoreStr: params.scoreStr,
    maxScore: resolvedMaxScore,
    percentage: params.percentage,
    correctCount: resolvedCorrectCount,
    answeredCount: params.answeredCount ?? params.totalQuestions,
    totalQuestions: params.totalQuestions,
    currentQuestionIndex: params.totalQuestions,
    timeSpentSeconds: params.timeSpentSeconds,
    joinedAt: existingLocal?.joinedAt || now,
    updatedAt: now,
    completedAt: now
  };

  saveLocalSession(participant);

  if (db) {
    try {
      await setDoc(
        doc(db, COLLECTION_NAME, docId),
        sanitizePayload({
          ...participant,
          studentCode: canonicalStudentCode,
          studentId: canonicalStudentCode
        }),
        { merge: true }
      );
    } catch (error) {
      console.warn('Error completing live session on Firestore:', error);
    }
  }
}

/**
 * Sắp xếp bảng xếp hạng:
 * 1. Điểm số cao nhất lên đầu
 * 2. Số câu đúng nhiều hơn
 * 3. Hoàn thành sớm hơn / cập nhật sớm hơn
 */
export function sortLeaderboardParticipants(
  list: LiveQuizParticipant[]
): LiveQuizParticipant[] {
  return [...list].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    const timeA = new Date(a.completedAt || a.updatedAt).getTime();
    const timeB = new Date(b.completedAt || b.updatedAt).getTime();
    return timeA - timeB;
  });
}

/**
 * Truy vấn danh sách người chơi theo danh sách targetIds bằng điều kiện where('targetId', 'in', ...)
 * Tuyệt đối không tải toàn bộ collection quiz_live_sessions về client để lọc.
 */
export async function queryQuizLiveSessionsByTargetIds(
  targetIds: string[]
): Promise<LiveQuizParticipant[]> {
  const uniqueIds = Array.from(
    new Set((targetIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  ).slice(0, 10);

  if (uniqueIds.length === 0) return [];

  const mergedByStudentCode = new Map<string, LiveQuizParticipant>();

  // 1. Lấy dữ liệu cache cục bộ khớp targetIds
  try {
    const allLocal = Object.values(getLocalSessions()).filter((item) =>
      uniqueIds.includes(String(item.targetId || '').trim())
    );
    allLocal.forEach((item) => {
      const code = resolveCanonicalStudentCode(item.studentCode || item.studentId);
      if (!code) return;
      mergedByStudentCode.set(code, {
        ...item,
        studentCode: code,
        studentId: code
      });
    });
  } catch (err) {
    console.warn('Error reading local live quiz sessions:', err);
  }

  // 2. Truy vấn Firestore tối ưu với where('targetId', 'in', uniqueIds) bọc trong try/catch
  if (db) {
    try {
      const q =
        uniqueIds.length === 1
          ? query(collection(db, COLLECTION_NAME), where('targetId', '==', uniqueIds[0]))
          : query(collection(db, COLLECTION_NAME), where('targetId', 'in', uniqueIds));
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        const data = docSnap.data() as LiveQuizParticipant;
        const code = resolveCanonicalStudentCode(
          (data as any)?.studentCode || data?.studentId || docSnap.id.split('__')[1] || ''
        );
        if (!code) return;
        const normalizedItem: LiveQuizParticipant = {
          ...data,
          id: docSnap.id,
          studentCode: code,
          studentId: code
        };
        const existing = mergedByStudentCode.get(code);
        if (
          !existing ||
          Number(normalizedItem.score || 0) >= Number(existing.score || 0)
        ) {
          mergedByStudentCode.set(code, normalizedItem);
        }
      });
    } catch (error) {
      console.warn('Error querying quiz_live_sessions with where():', error);
    }
  }

  return sortLeaderboardParticipants(Array.from(mergedByStudentCode.values()));
}

/**
 * Lắng nghe (Real-time Subscription) danh sách học sinh đang tham gia & bảng xếp hạng của một targetId
 */
export function subscribeToQuizLiveSession(
  targetId: string,
  onUpdate: (participants: LiveQuizParticipant[]) => void
): Unsubscribe {
  let firestoreList: LiveQuizParticipant[] = [];

  const emitMerged = () => {
    const allLocal = Object.values(getLocalSessions()).filter(
      (item) => item.targetId === targetId
    );
    const mapByStudentCode = new Map<string, LiveQuizParticipant>();

    allLocal.forEach((item) => {
      const code = resolveCanonicalStudentCode(item.studentCode || item.studentId);
      if (!code) return;
      mapByStudentCode.set(code, {
        ...item,
        studentCode: code,
        studentId: code
      });
    });

    firestoreList.forEach((item) => {
      const code = resolveCanonicalStudentCode(item.studentCode || item.studentId);
      if (!code) return;
      const existing = mapByStudentCode.get(code);
      if (!existing) {
        mapByStudentCode.set(code, {
          ...item,
          studentCode: code,
          studentId: code
        });
      } else {
        const existingTime = new Date(existing.updatedAt).getTime();
        const remoteTime = new Date(item.updatedAt).getTime();
        if (remoteTime >= existingTime || item.score >= existing.score) {
          mapByStudentCode.set(code, {
            ...item,
            studentCode: code,
            studentId: code
          });
        }
      }
    });

    onUpdate(sortLeaderboardParticipants(Array.from(mapByStudentCode.values())));
  };

  emitMerged();

  const handleLocalEvent = (e: Event) => {
    const customEvent = e as CustomEvent;
    if (!customEvent.detail || customEvent.detail.targetId === targetId) {
      emitMerged();
    }
  };

  const handleBroadcast = (event: MessageEvent) => {
    if (event.data?.targetId === targetId) {
      emitMerged();
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_STORAGE_KEY) {
      emitMerged();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('eduplay_live_quiz_updated', handleLocalEvent);
    window.addEventListener('storage', handleStorage);
    broadcastChannel?.addEventListener('message', handleBroadcast);
  }

  let unsubFirestore: Unsubscribe | null = null;
  if (db && targetId) {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('targetId', '==', targetId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          const items: LiveQuizParticipant[] = [];
          snapshot.forEach((docSnap) => {
            const raw = docSnap.data() as LiveQuizParticipant;
            const code = resolveCanonicalStudentCode(
              (raw as any)?.studentCode || raw?.studentId || docSnap.id.split('__')[1] || ''
            );
            items.push({
              ...raw,
              id: docSnap.id,
              studentCode: code || raw.studentId,
              studentId: code || raw.studentId
            });
          });
          firestoreList = items;
          emitMerged();
        },
        (error) => {
          console.warn('Error subscribing to live quiz session:', error);
        }
      );
    } catch (error) {
      console.warn('Failed to init live quiz Firestore listener:', error);
    }
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('eduplay_live_quiz_updated', handleLocalEvent);
      window.removeEventListener('storage', handleStorage);
      broadcastChannel?.removeEventListener('message', handleBroadcast);
    }
    if (unsubFirestore) {
      unsubFirestore();
    }
  };
}

/**
 * Lắng nghe danh sách học sinh hoàn thành và đang làm bài trực tiếp
 */
export function subscribeQuizLiveParticipants(
  targetId: string,
  _targetTitleOrCallback?:
    | string
    | ((data: {
        completedList: LiveQuizParticipant[];
        inProgressList: LiveQuizParticipant[];
        totalCompleted: number;
        totalInProgress: number;
      }) => void),
  _totalQuestions?: number,
  onCallback?: (data: {
    completedList: LiveQuizParticipant[];
    inProgressList: LiveQuizParticipant[];
    totalCompleted: number;
    totalInProgress: number;
  }) => void
): Unsubscribe {
  const callback =
    typeof _targetTitleOrCallback === 'function' ? _targetTitleOrCallback : onCallback;

  return subscribeToQuizLiveSession(targetId, (participants) => {
    if (!callback) return;
    const completedList = participants.filter((p) => p.status === 'completed');
    const inProgressList = participants.filter((p) => p.status !== 'completed');
    callback({
      completedList,
      inProgressList,
      totalCompleted: completedList.length,
      totalInProgress: inProgressList.length
    });
  });
}

/**
 * Xử lý khi học sinh thoát khỏi phiên làm bài trực tiếp
 */
export async function leaveQuizLiveSession(
  paramsOrTargetId: { targetId: string; studentId: string } | string,
  maybeStudentId?: string
): Promise<void> {
  const targetId =
    typeof paramsOrTargetId === 'string'
      ? paramsOrTargetId
      : paramsOrTargetId?.targetId;
  const rawStudentId =
    typeof paramsOrTargetId === 'string'
      ? maybeStudentId || ''
      : paramsOrTargetId?.studentId;

  const canonicalStudentCode = resolveCanonicalStudentCode(rawStudentId);
  if (!targetId || !canonicalStudentCode) return;
  const docId = getDocId(targetId, canonicalStudentCode);
  const existing = getLocalSessions()[docId];
  if (existing && existing.status !== 'completed') {
    saveLocalSession({
      ...existing,
      updatedAt: new Date().toISOString()
    });
  }
}

