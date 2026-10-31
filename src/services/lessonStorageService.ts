import { db } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { Lesson5EPlan } from '../types';
import { INITIAL_LESSONS } from './mockData';

export const ELEARNING_LESSONS_STORAGE_KEY = 'eduplay_5e_lessons';
export const ELEARNING_LESSONS_COLLECTION = 'elearning_lessons';

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
