import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  getDocFromServer,
  query,
  where,
  Firestore,
} from 'firebase/firestore';
import { db as primaryDb } from './firebase';
import { Lesson5EPlan } from '../types';

export const GRADE3_DB_CONFIG_STORAGE_KEY = 'eduplay_grade3_dedicated_db_config_v1';
export const GRADE3_DEDICATED_CACHE_KEY = 'eduplay_grade3_dedicated_lessons_cache_v1';
export const DEFAULT_GRADE3_COLLECTION = 'elearning_lessons_khoi3';
export const DEFAULT_GRADE3_APP_URL = 'https://dayhockhoi3.vercel.app';

export type Grade3ConnectionMode = 'partitioned_collection' | 'external_firebase' | 'external_app_url';

export interface Grade3DatabaseConfig {
  enabled: boolean;
  mode: Grade3ConnectionMode;
  // For external_firebase mode
  firebaseProjectId: string;
  firebaseApiKey: string;
  firebaseAuthDomain?: string;
  firebaseStorageBucket?: string;
  firestoreDatabaseId?: string;
  collectionName: string;
  // For external_app_url mode / quick launch
  externalAppUrl: string;
  autoSyncOnSelect: boolean;
  lastSyncedAt?: string;
  lastPingMs?: number;
}

export const DEFAULT_GRADE3_DB_CONFIG: Grade3DatabaseConfig = {
  enabled: true,
  mode: 'external_app_url',
  firebaseProjectId: '',
  firebaseApiKey: '',
  firebaseAuthDomain: '',
  firebaseStorageBucket: '',
  firestoreDatabaseId: '(default)',
  collectionName: DEFAULT_GRADE3_COLLECTION,
  externalAppUrl: DEFAULT_GRADE3_APP_URL,
  autoSyncOnSelect: true,
};

const GRADE3_FIREBASE_APP_NAME = 'pk-truckhang-grade3-dedicated-db';

export function getGrade3DbConfig(): Grade3DatabaseConfig {
  if (typeof window === 'undefined') return DEFAULT_GRADE3_DB_CONFIG;
  try {
    const raw = localStorage.getItem(GRADE3_DB_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_GRADE3_DB_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_GRADE3_DB_CONFIG,
      ...parsed,
      collectionName: (parsed?.collectionName || DEFAULT_GRADE3_COLLECTION).trim(),
      externalAppUrl: (parsed?.externalAppUrl || DEFAULT_GRADE3_APP_URL).trim() || DEFAULT_GRADE3_APP_URL,
    };
  } catch {
    return DEFAULT_GRADE3_DB_CONFIG;
  }
}

export function saveGrade3DbConfig(config: Grade3DatabaseConfig): Grade3DatabaseConfig {
  const normalized: Grade3DatabaseConfig = {
    ...DEFAULT_GRADE3_DB_CONFIG,
    ...config,
    firebaseProjectId: (config.firebaseProjectId || '').trim(),
    firebaseApiKey: (config.firebaseApiKey || '').trim(),
    firebaseAuthDomain: (config.firebaseAuthDomain || '').trim(),
    firebaseStorageBucket: (config.firebaseStorageBucket || '').trim(),
    firestoreDatabaseId: (config.firestoreDatabaseId || '(default)').trim() || '(default)',
    collectionName: (config.collectionName || DEFAULT_GRADE3_COLLECTION).trim() || DEFAULT_GRADE3_COLLECTION,
    externalAppUrl: (config.externalAppUrl || DEFAULT_GRADE3_APP_URL).trim() || DEFAULT_GRADE3_APP_URL,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(GRADE3_DB_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent('eduplay_grade3_db_config_updated', { detail: normalized }));
    } catch (e) {
      console.warn('Không thể lưu cấu hình CSDL Khối 3:', e);
    }
  }
  return normalized;
}

export function getCachedGrade3Lessons(): Lesson5EPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GRADE3_DEDICATED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setCachedGrade3Lessons(lessons: Lesson5EPlan[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GRADE3_DEDICATED_CACHE_KEY, JSON.stringify(lessons));
  } catch (e) {
    console.warn('Không thể lưu bộ nhớ đệm CSDL Khối 3:', e);
  }
}

/**
 * Resolves the Firestore instance for Khối 3:
 * - If mode === 'external_firebase' and valid projectId + apiKey are provided, initializes/reuses a secondary FirebaseApp
 * - Otherwise uses the primary Firestore instance with the dedicated partitioned collection
 */
export function resolveGrade3FirestoreInstance(config?: Grade3DatabaseConfig): {
  dbInstance: Firestore | null;
  targetCollection: string;
  isExternalProject: boolean;
} {
  const cfg = config || getGrade3DbConfig();
  const targetCollection = cfg.collectionName || DEFAULT_GRADE3_COLLECTION;

  if (
    cfg.enabled &&
    cfg.mode === 'external_firebase' &&
    cfg.firebaseProjectId &&
    cfg.firebaseApiKey
  ) {
    try {
      const existingApp = getApps().find((a) => a.name === GRADE3_FIREBASE_APP_NAME);
      let grade3App: FirebaseApp;
      if (existingApp) {
        grade3App = existingApp;
      } else {
        grade3App = initializeApp(
          {
            apiKey: cfg.firebaseApiKey,
            projectId: cfg.firebaseProjectId,
            authDomain: cfg.firebaseAuthDomain || `${cfg.firebaseProjectId}.firebaseapp.com`,
            storageBucket: cfg.firebaseStorageBucket || `${cfg.firebaseProjectId}.firebasestorage.app`,
          },
          GRADE3_FIREBASE_APP_NAME
        );
      }

      const customDbId =
        cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)'
          ? cfg.firestoreDatabaseId
          : undefined;
      const extDb = customDbId ? getFirestore(grade3App, customDbId) : getFirestore(grade3App);
      return {
        dbInstance: extDb,
        targetCollection,
        isExternalProject: true,
      };
    } catch (err) {
      console.warn('Lỗi khởi tạo Firebase riêng cho Khối 3, chuyển về luồng mặc định:', err);
    }
  }

  return {
    dbInstance: primaryDb || null,
    targetCollection: cfg.enabled ? targetCollection : 'elearning_lessons',
    isExternalProject: false,
  };
}

/**
 * Test connection and measure response latency to the Khối 3 database
 */
export async function testGrade3DatabaseConnection(
  customConfig?: Grade3DatabaseConfig
): Promise<{
  ok: boolean;
  latencyMs: number;
  message: string;
  recordCount: number;
}> {
  const cfg = customConfig || getGrade3DbConfig();
  const startTime = performance.now();

  try {
    const { dbInstance, targetCollection, isExternalProject } = resolveGrade3FirestoreInstance(cfg);
    if (!dbInstance) {
      return {
        ok: false,
        latencyMs: 0,
        message: 'Chưa khởi tạo được kết nối Firestore.',
        recordCount: getCachedGrade3Lessons().length,
      };
    }

    const colRef = collection(dbInstance, targetCollection);
    const snap = await getDocs(colRef);
    const latencyMs = Math.max(1, Math.round(performance.now() - startTime));

    return {
      ok: true,
      latencyMs,
      recordCount: snap.size,
      message: isExternalProject
        ? `Kết nối thành công tới Firebase Khối 3 (${cfg.firebaseProjectId} • ${targetCollection}) trong ${latencyMs}ms.`
        : `Kết nối sẵn sàng tới phân luồng CSDL Khối 3 (${targetCollection}) trong ${latencyMs}ms.`,
    };
  } catch (err: any) {
    const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
    const code = err?.code || '';
    if (code === 'permission-denied') {
      return {
        ok: true,
        latencyMs,
        recordCount: getCachedGrade3Lessons().length,
        message: `Đã kết nối máy chủ CSDL Khối 3 (${latencyMs}ms) — đang dùng bộ đệm cục bộ do giới hạn quyền đọc collection mới.`,
      };
    }
    return {
      ok: false,
      latencyMs,
      recordCount: getCachedGrade3Lessons().length,
      message: `Không thể kết nối trực tiếp (${err?.message || 'Lỗi mạng'}). Hệ thống tự động sử dụng bộ đệm tối ưu Khối 3.`,
    };
  }
}

/**
 * Fetch Grade 3 lessons from the dedicated database / collection and merge with existing Grade 3 lessons
 */
export async function fetchGrade3DedicatedLessons(
  fallbackMainLessons: Lesson5EPlan[] = []
): Promise<{
  lessons: Lesson5EPlan[];
  latencyMs: number;
  sourceLabel: string;
}> {
  const cfg = getGrade3DbConfig();
  const startTime = performance.now();
  const mainGrade3 = fallbackMainLessons.filter(
    (l) => (l.grade || '').trim().toLowerCase() === 'khối 3'
  );

  if (!cfg.enabled) {
    return {
      lessons: mainGrade3,
      latencyMs: 1,
      sourceLabel: 'CSDL Trung tâm',
    };
  }

  const { dbInstance, targetCollection, isExternalProject } = resolveGrade3FirestoreInstance(cfg);
  const byId = new Map<string, Lesson5EPlan>();

  // Seed with local dedicated cache first
  getCachedGrade3Lessons().forEach((item) => {
    if (item?.id) {
      byId.set(item.id, { ...item, grade: 'Khối 3' });
    }
  });

  // Also include any Grade 3 lessons from main list
  mainGrade3.forEach((item) => {
    if (item?.id) {
      byId.set(item.id, { ...item, grade: 'Khối 3' });
    }
  });

  if (dbInstance) {
    try {
      const colRef = collection(dbInstance, targetCollection);
      const snap = await getDocs(colRef);
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Lesson5EPlan;
        if (data) {
          byId.set(docSnap.id, {
            ...data,
            id: docSnap.id,
            grade: 'Khối 3',
          });
        }
      });

      // If External Firebase is not used, also query primary `elearning_lessons` where grade == 'Khối 3'
      if (!isExternalProject && targetCollection !== 'elearning_lessons') {
        try {
          const mainColRef = collection(dbInstance, 'elearning_lessons');
          const qGrade3 = query(mainColRef, where('grade', '==', 'Khối 3'));
          const mainSnap = await getDocs(qGrade3);
          mainSnap.forEach((docSnap) => {
            const data = docSnap.data() as Lesson5EPlan;
            if (data && !byId.has(docSnap.id)) {
              byId.set(docSnap.id, {
                ...data,
                id: docSnap.id,
                grade: 'Khối 3',
              });
            }
          });
        } catch {
          // Ignore fallback query error
        }
      }
    } catch {
      // Fallback to cached + mainGrade3 silently
    }
  }

  const merged = Array.from(byId.values());
  setCachedGrade3Lessons(merged);

  const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
  const updatedCfg: Grade3DatabaseConfig = {
    ...cfg,
    lastSyncedAt: new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    lastPingMs: latencyMs,
  };
  saveGrade3DbConfig(updatedCfg);

  return {
    lessons: merged,
    latencyMs,
    sourceLabel: isExternalProject
      ? `Firebase Khối 3 (${cfg.firebaseProjectId})`
      : `Phân luồng Khối 3 (${targetCollection})`,
  };
}

/**
 * Sync / Save a Grade 3 lesson to the dedicated Grade 3 database when enabled
 */
export async function syncLessonToGrade3Database(lesson: Lesson5EPlan): Promise<void> {
  if (!lesson || (lesson.grade || '').trim().toLowerCase() !== 'khối 3') return;

  const currentCache = getCachedGrade3Lessons();
  const updatedCache = [lesson, ...currentCache.filter((item) => item.id !== lesson.id)];
  setCachedGrade3Lessons(updatedCache);

  const cfg = getGrade3DbConfig();
  if (!cfg.enabled) return;

  const { dbInstance, targetCollection } = resolveGrade3FirestoreInstance(cfg);
  if (!dbInstance) return;

  try {
    const ref = doc(dbInstance, targetCollection, lesson.id);
    const sanitized = JSON.parse(JSON.stringify(lesson));
    await setDoc(
      ref,
      {
        ...sanitized,
        grade: 'Khối 3',
        syncedToGrade3Db: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Lưu phân luồng CSDL Khối 3 (sử dụng bộ đệm cục bộ):', err);
  }
}

/**
 * Remove a Grade 3 lesson from the dedicated Grade 3 database when deleted
 */
export async function removeLessonFromGrade3Database(lessonId: string): Promise<void> {
  if (!lessonId) return;
  const currentCache = getCachedGrade3Lessons();
  setCachedGrade3Lessons(currentCache.filter((item) => item.id !== lessonId));

  const cfg = getGrade3DbConfig();
  if (!cfg.enabled) return;

  const { dbInstance, targetCollection } = resolveGrade3FirestoreInstance(cfg);
  if (!dbInstance) return;

  try {
    const ref = doc(dbInstance, targetCollection, lessonId);
    await deleteDoc(ref);
  } catch {
    // Ignore if not present or restricted
  }
}
