import { db, auth } from './firebase';
import { collection, doc, setDoc, getDoc, getDocFromServer, getDocs, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { Lesson5EPlan } from '../types';

export const ELEARNING_LESSONS_STORAGE_KEY = 'eduplay_5e_lessons';
export const ELEARNING_LESSONS_COLLECTION = 'elearning_lessons';

export type PublicLessonFetchResult =
  | { status: 'ok'; lesson: Lesson5EPlan }
  | { status: 'unpublished' }
  | { status: 'not_found' }
  | { status: 'error'; message?: string };

/**
 * Extract lesson ID when URL matches /lesson/[lessonId]
 */
export function extractLessonIdFromPath(pathname?: string): string | null {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const match = path.match(/^\/lesson\/([^/?#]+)\/?$/i);
  if (!match || !match[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return match[1].trim() || null;
  }
}

/**
 * Check whether a lesson is both published and approved for public guest access
 */
export function isLessonPubliclyAccessible(lesson: Partial<Lesson5EPlan> | any): boolean {
  if (!lesson) return false;
  const isPublished = lesson.status !== 'draft';
  const isApproved = lesson.isApproved !== false;
  return isPublished && isApproved;
}

/**
 * Sign in anonymously when opening a public /lesson/... link if no user is currently signed in.
 * Gracefully degrades if Anonymous Auth provider is not yet enabled in Firebase Console.
 */
export async function ensureAnonymousGuestAuth(): Promise<void> {
  if (!auth) return;
  if (auth.currentUser) return;
  try {
    await signInAnonymously(auth);
  } catch (err: any) {
    const code = err?.code || '';
    if (code !== 'auth/operation-not-allowed' && code !== 'auth/admin-restricted-operation') {
      console.warn('Anonymous sign-in warning:', err?.message || err);
    }
  }
}

/**
 * Fetch a single lesson for public guest viewing (/lesson/[id]).
 * Enforces that only published & approved lessons can be opened.
 */
export async function fetchPublicLessonById(lessonId: string): Promise<PublicLessonFetchResult> {
  const cleanId = (lessonId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensureAnonymousGuestAuth();

  if (db) {
    try {
      const ref = doc(db, ELEARNING_LESSONS_COLLECTION, cleanId);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch (serverErr: any) {
        const serverCode = serverErr?.code || '';
        const serverMsg = String(serverErr?.message || '');
        if (serverCode === 'permission-denied' || serverMsg.includes('Missing or insufficient permissions')) {
          return { status: 'unpublished' };
        }
        snap = await getDoc(ref);
      }

      if (!snap.exists()) {
        return { status: 'not_found' };
      }

      const lesson = { id: snap.id, ...snap.data() } as Lesson5EPlan;
      if (!isLessonPubliclyAccessible(lesson)) {
        return { status: 'unpublished' };
      }

      return { status: 'ok', lesson };
    } catch (err: any) {
      const code = err?.code || '';
      const message = String(err?.message || '');
      if (code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
        return { status: 'unpublished' };
      }
      // Offline / network fallback to local cache if available
      const cached = getLocalCachedLessons().find(item => item.id === cleanId);
      if (cached) {
        return isLessonPubliclyAccessible(cached)
          ? { status: 'ok', lesson: cached }
          : { status: 'unpublished' };
      }
      return { status: 'error', message: 'Không thể kết nối đến máy chủ bài giảng. Vui lòng thử lại sau.' };
    }
  }

  const cached = getLocalCachedLessons().find(item => item.id === cleanId);
  if (!cached) return { status: 'not_found' };
  return isLessonPubliclyAccessible(cached)
    ? { status: 'ok', lesson: cached }
    : { status: 'unpublished' };
}

/**
 * Get cached lessons from localStorage as fallback
 */
export function getLocalCachedLessons(): Lesson5EPlan[] {
  try {
    const saved = localStorage.getItem(ELEARNING_LESSONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Error reading local lessons cache:', err);
  }
  return [];
}

/**
 * Save Lesson to Firestore & Local Storage with cross-tab and assigned lesson synchronization
 */
export async function saveLessonToFirestore(lesson: Lesson5EPlan): Promise<void> {
  // 1. Update local cache first for rapid UI responsiveness
  try {
    const current = getLocalCachedLessons();
    const updated = [lesson, ...current.filter(item => item.id !== lesson.id)];
    localStorage.setItem(ELEARNING_LESSONS_STORAGE_KEY, JSON.stringify(updated));

    // Also synchronize assigned lessons in local storage if any exist
    const ASSIGNED_KEY = 'eduplay_assigned_elearning_lessons';
    const savedAssigned = localStorage.getItem(ASSIGNED_KEY);
    if (savedAssigned) {
      const parsedAssigned = JSON.parse(savedAssigned);
      if (Array.isArray(parsedAssigned)) {
        let hasChanges = false;
        const updatedAssigned = parsedAssigned.map((item: any) => {
          if (item && (item.lessonId === lesson.id || item.id === lesson.id || item.originalLessonAssignmentId === lesson.id)) {
            hasChanges = true;
            return {
              ...item,
              lessonTitle: lesson.title,
              subject: lesson.subject || item.subject,
              grade: lesson.grade || item.grade,
              lessonData: lesson
            };
          }
          return item;
        });
        if (hasChanges) {
          localStorage.setItem(ASSIGNED_KEY, JSON.stringify(updatedAssigned));
          window.dispatchEvent(new CustomEvent('eduplay_elearning_assigned_updated', { detail: updatedAssigned }));
        }
      }
    }
  } catch (e) {
    console.warn('Failed to cache lesson locally:', e);
  }

  // 2. Dispatch real-time local event & cross-tab BroadcastChannel
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eduplay_lesson_updated', { detail: lesson }));
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('eduplay_lessons_sync');
        bc.postMessage({ type: 'LESSON_UPDATED', lesson });
        bc.close();
      }
    }
  } catch {}

  // 3. Persist to Firestore if connection exists
  if (db) {
    try {
      const ref = doc(db, ELEARNING_LESSONS_COLLECTION, lesson.id);
      // Ensure we convert any undefined values to null or omit them to prevent Firestore write crashes
      const sanitizedPayload = JSON.parse(JSON.stringify(lesson));
      await setDoc(ref, {
        ...sanitizedPayload,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Also sync assigned_elearning collection in Firestore for any matching assignments
      try {
        const assignedRef = collection(db, 'assigned_elearning');
        const qAssigned = query(assignedRef);
        const snap = await getDocs(qAssigned);
        if (!snap.empty) {
          const updatePromises: Promise<any>[] = [];
          snap.forEach(docSnap => {
            const data = docSnap.data();
            if (data && (data.lessonId === lesson.id || docSnap.id === lesson.id || data.originalLessonAssignmentId === lesson.id)) {
              updatePromises.push(
                setDoc(docSnap.ref, {
                  lessonTitle: lesson.title,
                  lessonData: sanitizedPayload,
                  updatedAt: new Date().toISOString()
                }, { merge: true })
              );
            }
          });
          if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
          }
        }
      } catch (errSync) {
        console.warn('Non-fatal: Failed to sync assigned_elearning in Firestore:', errSync);
      }
    } catch (err) {
      console.error('Failed to save lesson to Firestore:', err);
      throw err;
    }
  }
}

/**
 * Delete Lesson from Firestore & Local Storage
 */
export async function deleteLessonFromFirestore(id: string): Promise<void> {
  // 1. Update local cache
  try {
    const current = getLocalCachedLessons();
    const updated = current.filter(item => item.id !== id);
    localStorage.setItem(ELEARNING_LESSONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to delete lesson from cache:', e);
  }

  // 2. Delete from Firestore
  if (db) {
    try {
      const ref = doc(db, ELEARNING_LESSONS_COLLECTION, id);
      await deleteDoc(ref);
    } catch (err) {
      console.error('Failed to delete lesson from Firestore:', err);
      throw err;
    }
  }
}

/**
 * Subscribe to lessons from Firestore (Real-time sync)
 */
export function subscribeToLessonsFromFirestore(
  onUpdate: (lessons: Lesson5EPlan[]) => void,
  onError?: (err: Error) => void
) {
  if (!db) {
    // If no db, trigger update with cached data immediately
    onUpdate(getLocalCachedLessons());
    return () => {};
  }

  const q = query(collection(db, ELEARNING_LESSONS_COLLECTION));
  
  return onSnapshot(
    q,
    (snapshot) => {
      const lessons: Lesson5EPlan[] = [];
      snapshot.forEach((docSnap) => {
        lessons.push({
          id: docSnap.id,
          ...docSnap.data()
        } as Lesson5EPlan);
      });

      if (lessons.length > 0) {
        // Cache to local storage
        try {
          localStorage.setItem(ELEARNING_LESSONS_STORAGE_KEY, JSON.stringify(lessons));
        } catch (e) {
          console.warn('Error updating lessons cache during subscription:', e);
        }
        onUpdate(lessons);
      } else {
        onUpdate([]);
      }
    },
    (err) => {
      console.warn('Firestore subscription failed for lessons:', err);
      if (onError) onError(err);
      // Fallback
      onUpdate(getLocalCachedLessons());
    }
  );
}
