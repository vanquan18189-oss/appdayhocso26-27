import { Lesson5EPlan } from '../../types';
import { checkHasEngageVideo, checkHasEngageGame } from './StudentEngageView';
import { db } from '../../firebaseConfig';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { trackedSetDoc } from '../../services/firestoreWriteTracker';
import { getAuthenticStudentCode } from '../../services/studentSessionService';

export const ELEARNING_STUDENT_PROGRESS_COLLECTION = 'elearning_student_progress';

export const getCleanProgressDocId = (studentId: string, lessonId: string): string => {
  const s = String(studentId || 'unknown_student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const l = String(lessonId || 'unknown_lesson').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${s}___${l}`;
};

export type Standard5ETabKey = 
  | 'engage' 
  | 'explore' 
  | 'elaborate' 
  | 'apply' 
  | 'assessment';

export type LessonStepKey = 
  | 'engage' 
  | 'intro' 
  | 'objectives' 
  | 'explore' 
  | 'elaborate' 
  | 'apply' 
  | 'assessment' 
  | 'review';

/**
 * Standard 5E Navigation items for the top progress bar.
 * Exactly 5 tabs representing the 5E framework:
 * 1. Khởi động (Engage)
 * 2. Khám phá (Explore)
 * 3. Luyện tập (Elaborate)
 * 4. Vận dụng (Apply)
 * 5. Đánh giá (Assessment)
 */
export interface Standard5ETabItem {
  key: Standard5ETabKey;
  stepNumber: number;
  label: string;
  badge: string;
}

export const STANDARD_5E_TABS: Standard5ETabItem[] = [
  { key: 'engage', stepNumber: 1, label: 'Khởi động', badge: 'Engage' },
  { key: 'explore', stepNumber: 2, label: 'Khám phá', badge: 'Explore' },
  { key: 'elaborate', stepNumber: 3, label: 'Luyện tập', badge: 'Elaborate' },
  { key: 'apply', stepNumber: 4, label: 'Vận dụng', badge: 'Apply' },
  { key: 'assessment', stepNumber: 5, label: 'Đánh giá', badge: 'Assessment' }
];

/**
 * Maps any internal learning step (including intro, objectives, review)
 * to its parent 5E tab key for highlighting in the top standard 5E navigation bar.
 */
export const mapStepToStandard5ETab = (step: LessonStepKey): Standard5ETabKey => {
  switch (step) {
    case 'engage':
    case 'intro':
    case 'objectives':
      return 'engage';
    case 'explore':
      return 'explore';
    case 'elaborate':
      return 'elaborate';
    case 'apply':
      return 'apply';
    case 'assessment':
    case 'review':
      return 'assessment';
    default:
      return 'engage';
  }
};

/**
 * Check if Bước 1 (Mục Khởi động) is active:
 * - Must be enabled (not turned off)
 * - Must have at least Video link OR Game/Quiz link
 */
export const checkIsEngageActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isEngageEnabled ?? (lesson.stepEngage as any)?.isEnabled ?? true;
  return isEnabled;
};

/**
 * Check if Bước 2 (Mục Giới thiệu bài) is active:
 * - Must be enabled (not turned off)
 * - Must have content (video link or text)
 */
export const checkIsIntroActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isIntroEnabled ?? true;
  if (!isEnabled) return false;
  const content = (lesson as any).introContent;
  return Boolean(content && typeof content === 'string' && content.trim() !== '');
};

/**
 * Check if Bước 3 (Mục Mục tiêu) is active:
 * - Must be enabled (not turned off)
 * - Must have content
 */
export const checkIsObjectivesActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isObjectivesEnabled ?? true;
  if (!isEnabled) return false;
  const content = (lesson as any).objectivesContent || lesson.objectivesContent;
  return Boolean(content && typeof content === 'string' && content.trim() !== '');
};

/**
 * Check if Mục Khám phá (Explore) is active
 */
export const checkIsExploreActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isExploreEnabled ?? (lesson.stepExplore as any)?.isEnabled ?? true;
  return isEnabled;
};

/**
 * Check if Mục Luyện tập (Elaborate) is active
 */
export const checkIsElaborateActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isElaborateEnabled ?? (lesson.stepElaborate as any)?.isEnabled ?? true;
  return isEnabled;
};

/**
 * Check if Mục Vận dụng (Apply) is active
 */
export const checkIsApplyActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isApplyEnabled ?? (lesson as any).isEvaluateEnabled ?? (lesson.stepEvaluate as any)?.isEnabled ?? true;
  return isEnabled;
};

/**
 * Check if Mục Đánh giá (Assessment) is active
 */
export const checkIsAssessmentActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isAssessmentEnabled ?? true;
  return isEnabled;
};

/**
 * Check if Mục Nhận xét / Vinh danh (Review) is active
 */
export const checkIsReviewActive = (lesson?: Lesson5EPlan | null): boolean => {
  if (!lesson) return false;
  const isEnabled = (lesson as any).isFeedbackEnabled ?? (lesson as any).isReviewEnabled ?? true;
  return isEnabled;
};

/**
 * Returns list of all active steps with labels and metadata
 */
export interface FlowStepItem {
  key: LessonStepKey;
  label: string;
  badge: string;
  orderNumber: number;
}

export const getLessonFlowSteps = (lesson?: Lesson5EPlan | null): FlowStepItem[] => {
  const steps: FlowStepItem[] = [];
  let order = 1;

  if (checkIsEngageActive(lesson)) {
    steps.push({ key: 'engage', label: 'Khởi động', badge: 'Engage', orderNumber: order++ });
  }
  if (checkIsIntroActive(lesson)) {
    steps.push({ key: 'intro', label: 'Giới thiệu bài', badge: 'Intro', orderNumber: order++ });
  }
  if (checkIsObjectivesActive(lesson)) {
    steps.push({ key: 'objectives', label: 'Mục tiêu', badge: 'Objectives', orderNumber: order++ });
  }
  if (checkIsExploreActive(lesson)) {
    steps.push({ key: 'explore', label: 'Khám phá', badge: 'Explore', orderNumber: order++ });
  }
  if (checkIsElaborateActive(lesson)) {
    steps.push({ key: 'elaborate', label: 'Luyện tập', badge: 'Elaborate', orderNumber: order++ });
  }
  if (checkIsApplyActive(lesson)) {
    steps.push({ key: 'apply', label: 'Vận dụng', badge: 'Apply', orderNumber: order++ });
  }
  if (checkIsAssessmentActive(lesson)) {
    steps.push({ key: 'assessment', label: 'Đánh giá', badge: 'Assessment', orderNumber: order++ });
  }
  if (checkIsReviewActive(lesson)) {
    steps.push({ key: 'review', label: 'Nhận xét & Vinh danh', badge: 'Review', orderNumber: order++ });
  }

  return steps;
};

/**
 * Determine the initial step when a student starts a lesson
 */
export const getInitialLessonStep = (lesson?: Lesson5EPlan | null): LessonStepKey => {
  const steps = getLessonFlowSteps(lesson);
  return steps.length > 0 ? steps[0].key : 'explore';
};

/**
 * Determine the next enabled step in sequence
 */
export const getNextStepInLessonFlow = (
  currentStep: LessonStepKey,
  lesson?: Lesson5EPlan | null
): LessonStepKey => {
  const steps = getLessonFlowSteps(lesson);
  const currentIndex = steps.findIndex(s => s.key === currentStep);
  if (currentIndex >= 0 && currentIndex < steps.length - 1) {
    return steps[currentIndex + 1].key;
  }
  return currentStep;
};

/**
 * Determine the previous enabled step in sequence
 */
export const getPrevStepInLessonFlow = (
  currentStep: LessonStepKey,
  lesson?: Lesson5EPlan | null
): LessonStepKey => {
  const steps = getLessonFlowSteps(lesson);
  const currentIndex = steps.findIndex(s => s.key === currentStep);
  if (currentIndex > 0) {
    return steps[currentIndex - 1].key;
  }
  return currentStep;
};

/**
 * Human-friendly label for the next step button
 */
export const getNextStepLabel = (
  currentStep: LessonStepKey,
  lesson?: Lesson5EPlan | null
): string => {
  const next = getNextStepInLessonFlow(currentStep, lesson);
  switch (next) {
    case 'engage':
      return 'Khởi động (Engage)';
    case 'intro':
      return 'Giới thiệu bài';
    case 'objectives':
      return 'Mục tiêu bài học';
    case 'explore':
      return 'Khám phá (Explore)';
    case 'elaborate':
      return 'Luyện tập (Elaborate)';
    case 'apply':
      return 'Vận dụng (Apply)';
    case 'assessment':
      return 'Đánh giá (Assessment)';
    case 'review':
      return 'Nhận xét & Vinh danh (Review)';
    default:
      return 'Tiếp tục bài học';
  }
};

/**
 * Storage and Firestore persistence for Student Lesson Progress
 */
const STORAGE_PREFIX = 'viet_elearning_student_progress_';

const pendingDebounceTimers = new Map<string, any>();
const lastSyncedPayloadMap = new Map<string, string>();

// Pub-sub for in-memory instantaneous updates across components
type ProgressCallback = (data: any | null) => void;
const progressSubscribers = new Map<string, Set<ProgressCallback>>();

export const notifyProgressSubscribers = (key: string, data: any) => {
  const subs = progressSubscribers.get(key);
  if (subs) {
    subs.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.warn('Error notifying progress subscriber:', err);
      }
    });
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('student_lesson_progress_updated', {
        detail: { key, progress: data, studentId: data?.studentId, lessonId: data?.lessonId }
      }));
    } catch (_) {}
  }
};

export const saveStudentLessonProgress = (
  studentId: string,
  lessonId: string,
  progressData: any,
  studentRecord?: any
) => {
  try {
    const authenticId = getAuthenticStudentCode(studentRecord, studentId);
    const key = `${STORAGE_PREFIX}${authenticId}_${lessonId}`;
    const existing = getStudentLessonProgress(authenticId, lessonId, studentRecord) || {};
    const updated = {
      ...existing,
      ...progressData,
      studentId: authenticId,
      lessonId,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(updated));

    // Instant local notification so React state updates without waiting for network or logout!
    notifyProgressSubscribers(key, updated);

    if (!db || !authenticId || !lessonId) return;

    // Comprehensive progress signature that captures 5E activities and slide changes
    const progressSignature = JSON.stringify({
      currentSlide: updated.currentSlide ?? updated.slideIndex ?? 0,
      completed: !!updated.completed,
      score: updated.score ?? 0,
      exploreCompleted: !!updated.exploreCompleted,
      exploreAccuracy: updated.exploreAccuracy ?? null,
      elaborateCompleted: !!(updated.elaborate?.isCompleted || updated.elaborate?.score !== undefined),
      elaborateScore: updated.elaborate?.score ?? updated.elaborate?.practiceScore ?? null,
      applySubmitted: !!(updated.apply?.isCompleted || updated.apply?.isSubmitted),
      assessmentCompleted: !!(updated.assessment?.isCompleted || updated.assessment?.testScore !== undefined),
      assessmentScore: updated.assessment?.testScore ?? updated.assessment?.score ?? null,
      engageViewed: !!updated.engageViewed,
      completedSlides: updated.completedSlides || [],
      completionPercentage: updated.completionPercentage ?? 0,
      exploreCheckpointAnswersCount: Object.keys(updated.exploreCheckpointAnswers || {}).length
    });

    const lastSyncedSignature = lastSyncedPayloadMap.get(key);
    if (lastSyncedSignature === progressSignature && !updated.completed) {
      return; // Skip write if state hasn't meaningfully changed
    }

    if (pendingDebounceTimers.has(key)) {
      clearTimeout(pendingDebounceTimers.get(key));
    }

    const performFirestoreSync = () => {
      pendingDebounceTimers.delete(key);
      lastSyncedPayloadMap.set(key, progressSignature);

      const docId = getCleanProgressDocId(authenticId, lessonId);
      const docRef = doc(db, ELEARNING_STUDENT_PROGRESS_COLLECTION, docId);
      trackedSetDoc(
        docRef,
        updated,
        { merge: true },
        { isUserInitiated: false, actionType: 'background_sync' }
      ).catch((err) => {
        console.warn('Firestore saveStudentLessonProgress sync warning:', err);
      });
    };

    // Fast sync: immediate for completed milestones, or fast 400ms debounce
    const isMilestoneComplete = updated.completed || 
      updated.exploreCompleted || 
      updated.elaborate?.isCompleted || 
      updated.apply?.isSubmitted || 
      updated.apply?.isCompleted || 
      updated.assessment?.isCompleted;

    if (isMilestoneComplete) {
      performFirestoreSync();
    } else {
      const timer = setTimeout(performFirestoreSync, 400);
      pendingDebounceTimers.set(key, timer);
    }
  } catch (err) {
    console.warn('Failed to save student lesson progress to localStorage/Firestore', err);
  }
};

export const getStudentLessonProgress = (
  studentId: string,
  lessonId: string,
  studentRecord?: any
): any | null => {
  try {
    const authenticId = getAuthenticStudentCode(studentRecord, studentId);
    const key = `${STORAGE_PREFIX}${authenticId}_${lessonId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read student lesson progress from localStorage', err);
    return null;
  }
};

export const fetchStudentProgress = (
  studentId: string,
  lessonId: string,
  studentRecord?: any
): any => {
  const authenticId = getAuthenticStudentCode(studentRecord, studentId);
  const key = `${STORAGE_PREFIX}${authenticId}_${lessonId}`;
  const data = getStudentLessonProgress(authenticId, lessonId, studentRecord);
  notifyProgressSubscribers(key, data);
  return data;
};

export const fetchStudentLessonProgressAsync = async (
  studentId: string,
  lessonId: string
): Promise<any | null> => {
  try {
    if (db && studentId && lessonId) {
      const docId = getCleanProgressDocId(studentId, lessonId);
      const docRef = doc(db, ELEARNING_STUDENT_PROGRESS_COLLECTION, docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const firestoreData = snap.data();
        const key = `${STORAGE_PREFIX}${studentId}_${lessonId}`;
        const local = getStudentLessonProgress(studentId, lessonId) || {};
        const merged = { ...local, ...firestoreData };
        localStorage.setItem(key, JSON.stringify(merged));
        notifyProgressSubscribers(key, merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch student lesson progress from Firestore', err);
  }
  return fetchStudentProgress(studentId, lessonId);
};

export const subscribeStudentLessonProgress = (
  studentId: string,
  lessonId: string,
  callback: (data: any | null) => void,
  studentRecord?: any
): (() => void) => {
  const authenticId = getAuthenticStudentCode(studentRecord, studentId);
  const key = `${STORAGE_PREFIX}${authenticId}_${lessonId}`;

  // 1. Register callback in in-memory pub-sub
  if (!progressSubscribers.has(key)) {
    progressSubscribers.set(key, new Set());
  }
  progressSubscribers.get(key)!.add(callback);

  // 2. Send current local data immediately
  const local = getStudentLessonProgress(authenticId, lessonId, studentRecord);
  callback(local);

  if (!db || !authenticId || !lessonId) {
    return () => {
      const subs = progressSubscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) progressSubscribers.delete(key);
      }
    };
  }

  let unsubFirestore = () => {};
  try {
    const docId = getCleanProgressDocId(authenticId, lessonId);
    const docRef = doc(db, ELEARNING_STUDENT_PROGRESS_COLLECTION, docId);
    unsubFirestore = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const firestoreData = snap.data();
          const currentLocal = getStudentLessonProgress(authenticId, lessonId, studentRecord) || {};
          const merged = { ...currentLocal, ...firestoreData };
          try {
            localStorage.setItem(key, JSON.stringify(merged));
          } catch {}
          callback(merged);
        }
      },
      (err) => {
        console.warn('Firestore subscribeStudentLessonProgress error:', err);
      }
    );
  } catch (err) {
    console.warn('Failed to attach Firestore snapshot for student progress:', err);
  }

  return () => {
    const subs = progressSubscribers.get(key);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) progressSubscribers.delete(key);
    }
    unsubFirestore();
  };
};

export const clearStudentLessonProgress = (
  studentId: string,
  lessonId: string
) => {
  try {
    const key = `${STORAGE_PREFIX}${studentId}_${lessonId}`;
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('Failed to clear student lesson progress from localStorage', err);
  }
};

export function getUnifiedStudentLessonProgress(
  studentId: string,
  lessonId: string,
  studentRecord?: any
): { data: any | null; dataSource: 'standard' | 'legacy' | 'none' } {
  if (!lessonId) return { data: null, dataSource: 'none' };
  const authenticId = getAuthenticStudentCode(studentRecord, studentId);

  const lessonVariants = Array.from(new Set([
    lessonId,
    lessonId.toLowerCase(),
    lessonId.replace(/^les-/i, ''),
    lessonId.replace(/[^a-zA-Z0-9_-]/g, '_')
  ].filter(Boolean)));

  // 1. Try exact standard authentic ID + lesson variant
  for (const lVar of lessonVariants) {
    const prog = getStudentLessonProgress(authenticId, lVar, studentRecord);
    if (prog) {
      return { data: prog, dataSource: 'standard' };
    }
  }

  // 2. Try other candidate IDs
  const activeIds = [
    authenticId,
    studentId,
    studentRecord?.sddcn,
    studentRecord?.studentPersistentId,
    studentRecord?.id,
    studentRecord?.code,
    studentRecord?.username,
    'u-4'
  ].filter(Boolean) as string[];

  for (const id of activeIds) {
    for (const lVar of lessonVariants) {
      const prog = getStudentLessonProgress(id, lVar, studentRecord);
      if (prog) {
        return { data: prog, dataSource: id === authenticId ? 'standard' : 'legacy' };
      }
    }
  }

  // 3. Scan localStorage strictly for THIS student's matching records
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const belongsToStudent = activeIds.some(id => id && id.length >= 2 && key.includes(id));
        if (belongsToStudent) {
          for (const lVar of lessonVariants) {
            if (key.includes(lVar)) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed) {
                  return { data: parsed, dataSource: 'legacy' };
                }
              }
            }
          }
        }
      }
    }
  } catch {}

  return { data: null, dataSource: 'none' };
}

export interface MigrationPreviewItem {
  oldKey: string;
  newKey: string;
  studentId: string;
  lessonId: string;
  previewData: any;
}

export function getLegacyMigrationPreview(targetStandardStudentId: string, targetLessonId: string): MigrationPreviewItem[] {
  const previews: MigrationPreviewItem[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const standardNewKey = `${STORAGE_PREFIX}${targetStandardStudentId}_${targetLessonId}`;
        if (key !== standardNewKey) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            previews.push({
              oldKey: key,
              newKey: standardNewKey,
              studentId: targetStandardStudentId,
              lessonId: targetLessonId,
              previewData: parsed
            });
          }
        }
      }
    }
  } catch {}
  return previews;
}

