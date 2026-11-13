import { db } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, query } from 'firebase/firestore';
import { Lesson5EPlan } from '../types';
import {
  attachOwnershipOnCreate,
  getCurrentAccessContext,
  getContentPermissions,
  queryAccessibleCollection,
  invalidateQueryCache
} from './permissionService';

export const ELEARNING_LESSONS_STORAGE_KEY = 'eduplay_5e_lessons';
export const ELEARNING_LESSONS_COLLECTION = 'elearning_lessons';

/**
 * Get cached lessons from localStorage filtered by RBAC permissions
 */
export function getLocalCachedLessons(): Lesson5EPlan[] {
  try {
    const saved = localStorage.getItem(ELEARNING_LESSONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const access = getCurrentAccessContext();
        if (access.isAdmin || access.isStudent) return parsed;
        return parsed.filter(item => getContentPermissions(item, access).canView);
      }
    }
  } catch (err) {
    console.warn('Error reading local lessons cache:', err);
  }
  return [];
}

function getRawLocalLessons(): Lesson5EPlan[] {
  try {
    const saved = localStorage.getItem(ELEARNING_LESSONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Save Lesson to Firestore & Local Storage with RBAC ownership metadata
 */
export async function saveLessonToFirestore(lessonInput: Lesson5EPlan): Promise<void> {
  const rawCurrent = getRawLocalLessons();
  const existing = rawCurrent.find(item => item.id === lessonInput.id) || null;
  const lesson = attachOwnershipOnCreate(lessonInput, existing);

  // 1. Update local cache first for rapid UI responsiveness
  try {
    const updated = [lesson, ...rawCurrent.filter(item => item.id !== lesson.id)];
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
      const sanitizedPayload = JSON.parse(JSON.stringify(lesson));
      await setDoc(ref, {
        ...sanitizedPayload,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      invalidateQueryCache(ELEARNING_LESSONS_COLLECTION);

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
    const current = getRawLocalLessons();
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
      invalidateQueryCache(ELEARNING_LESSONS_COLLECTION);
    } catch (err) {
      console.error('Failed to delete lesson from Firestore:', err);
      throw err;
    }
  }
}

/**
 * Load lessons from Firestore using RBAC scoped queries (max 20 docs per source, 5-min cache, no onSnapshot)
 */
export function subscribeToLessonsFromFirestore(
  onUpdate: (lessons: Lesson5EPlan[]) => void,
  onError?: (err: Error) => void
) {
  let isMounted = true;

  const fetchScopedLessons = async (forceRefresh = false) => {
    if (!db) {
      if (isMounted) onUpdate(getLocalCachedLessons());
      return;
    }
    try {
      const lessons = await queryAccessibleCollection<Lesson5EPlan>(ELEARNING_LESSONS_COLLECTION, {
        forceRefresh,
        maxPerSource: 20,
        adminLimit: 50
      });
      if (!isMounted) return;
      if (lessons.length > 0) {
        try {
          localStorage.setItem(ELEARNING_LESSONS_STORAGE_KEY, JSON.stringify(lessons));
        } catch {}
        onUpdate(lessons);
      } else {
        onUpdate(getLocalCachedLessons());
      }
    } catch (err: any) {
      if (onError) onError(err);
      if (isMounted) onUpdate(getLocalCachedLessons());
    }
  };

  fetchScopedLessons(false);

  const handleLocalUpdate = () => {
    if (isMounted) onUpdate(getLocalCachedLessons());
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('eduplay_lesson_updated', handleLocalUpdate);
  }

  return () => {
    isMounted = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('eduplay_lesson_updated', handleLocalUpdate);
    }
  };
}

