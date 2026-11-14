import { db, auth } from './firebase';
import { collection, doc, getDocs, getDoc, getDocFromServer } from 'firebase/firestore';
import { ensureAnonymousGuestAuth } from './lessonStorageService';
import { trackedSetDoc, trackedDeleteDoc, trackedWriteBatch, extractFirestoreErrorDetails } from './firestoreWriteTracker';
import { HomeworkAssignment } from '../types';
import { removeUndefined, resolveCurrentTeacherProfile } from './teacherStorageService';
import { waitForWriteConfirmation, updateCollectionCacheStatus } from './firestoreWriteVerificationService';
import { normalizeClassKey } from './studentStorageService';
import { normalizeStudentCode } from './studentCode';
import { logSystemActivity } from './activityService';
import { toISOStringUTC } from '../utils/dateUtils';
import {
  attachOwnershipOnCreate,
  getCurrentAccessContext,
  getContentPermissions,
  queryAccessibleCollection,
  invalidateQueryCache
} from './permissionService';

const ASSIGNMENTS_CACHE_KEY = 'eduplay_cached_assignments';

/**
 * Deduplication helper for homework assignments
 */
export function getAssignmentDeduplicationKey(a: Partial<HomeworkAssignment>): string {
  if (!a) return '';
  const cleanTitle = (a.title || '')
    .trim()
    .toLowerCase()
    .replace(/^bài tập tự luyện:\s*/i, '')
    .replace(/^bài tập:\s*/i, '')
    .replace(/\s+/g, ' ');
  const targetClass = (a.targetClass || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  const subject = (a.subject || '').trim().toLowerCase();
  const grade = (a.grade || '').trim().toLowerCase();
  const dueDate = (a.dueDate || '').trim().toLowerCase();
  const originalAssignmentId = (a.originalAssignmentId || '').trim();

  if (originalAssignmentId && targetClass) {
    return `root_${originalAssignmentId}__cls_${targetClass}`;
  }
  return `title_${cleanTitle}__cls_${targetClass}__sub_${subject}__grd_${grade}__due_${dueDate}`;
}

export function deduplicateAssignments(assignments: HomeworkAssignment[]): HomeworkAssignment[] {
  const seenIds = new Set<string>();
  const clean: HomeworkAssignment[] = [];

  (assignments || []).forEach(as => {
    if (!as || !as.id) return;
    if (seenIds.has(as.id)) return;

    seenIds.add(as.id);
    clean.push(as);
  });

  return clean;
}

/**
 * Quét và dọn dẹp các bản ghi bài tập trùng lặp trong LocalStorage
 */
export async function cleanDuplicateAssignments(): Promise<void> {
  try {
    const cached = getRawCachedAssignments();
    const cleanList = deduplicateAssignments(cached);
    if (cleanList.length !== cached.length) {
      saveAssignmentsToLocalStorage(cleanList);
    }
  } catch (err) {
    console.warn('Lỗi khi chạy cleanDuplicateAssignments:', err);
  }
}

function getRawCachedAssignments(): HomeworkAssignment[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(ASSIGNMENTS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return deduplicateAssignments(parsed);
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc cache bài tập từ LocalStorage:', e);
  }
  return [];
}

/**
 * Get assignments from LocalStorage Cache (RBAC-filtered for regular teachers)
 */
export function getLocalCachedAssignments(): HomeworkAssignment[] {
  const all = getRawCachedAssignments();
  const access = getCurrentAccessContext();
  if (access.isAdmin || access.isStudent) return all;
  return all.filter(item => getContentPermissions(item, access).canView);
}

/**
 * Save assignments to LocalStorage Cache and dispatch real-time events
 */
export function saveAssignmentsToLocalStorage(assignments: HomeworkAssignment[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = deduplicateAssignments(assignments);
    localStorage.setItem(ASSIGNMENTS_CACHE_KEY, JSON.stringify(clean));

    window.dispatchEvent(new CustomEvent('eduplay_assignments_updated', {
      detail: { assignments: clean, timestamp: Date.now() }
    }));
    window.dispatchEvent(new CustomEvent('assignment-data-updated', {
      detail: { assignments: clean, timestamp: Date.now() }
    }));
  } catch (e) {
    console.warn('Lỗi lưu cache bài tập vào LocalStorage:', e);
  }
}

import { extractGradeDigit } from '../lib/constants';

/**
 * Save a HomeworkAssignment to Firestore (with RBAC ownership & sharing metadata)
 */
export async function saveAssignmentToFirestore(assignmentInput: HomeworkAssignment): Promise<void> {
  try {
    const current = getRawCachedAssignments();
    const existsIdx = current.findIndex(a => a.id === assignmentInput.id);
    const existingAssignment = existsIdx >= 0 ? current[existsIdx] : null;

    const currentEmail = (
      assignmentInput.ownerEmail ||
      assignmentInput.teacherEmail ||
      (auth && auth.currentUser ? auth.currentUser.email : null) ||
      (typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_email') : null) ||
      ''
    ).toLowerCase().trim();

    const profile = resolveCurrentTeacherProfile(currentEmail);
    const assignment = attachOwnershipOnCreate({ ...assignmentInput }, existingAssignment);

    const targetDigit = extractGradeDigit(assignment.targetClass) || extractGradeDigit(assignment.grade) || '5';
    const normalizedGrade = `Khối ${targetDigit}`;
    assignment.grade = normalizedGrade;

    if (!assignment.teacherId || assignment.teacherId === 'u-4' || assignment.teacherId === 'gv-temp') {
      assignment.teacherId = profile.id;
    }
    if (!assignment.teacherName) {
      assignment.teacherName = assignment.ownerName || profile.name;
    }
    if (!assignment.teacherEmail) {
      assignment.teacherEmail = assignment.ownerEmail || profile.email || currentEmail;
    }
    if (!assignment.createdBy) {
      assignment.createdBy = profile.id;
    }

    // Chuẩn hóa ngày giờ lưu vào Firestore theo chuẩn ISO 8601 UTC duy nhất
    if ((assignment as any).startDate) {
      const isoStart = toISOStringUTC((assignment as any).startDate);
      if (isoStart) (assignment as any).startDate = isoStart;
    }
    if ((assignment as any).assignedDate) {
      const isoAssigned = toISOStringUTC((assignment as any).assignedDate);
      if (isoAssigned) (assignment as any).assignedDate = isoAssigned;
    }
    if (assignment.dueDate && assignment.dueDate.trim().toLowerCase() !== 'vô thời hạn') {
      const isoDue = toISOStringUTC(assignment.dueDate);
      if (isoDue) assignment.dueDate = isoDue;
    }

    // Enforce ID structure: as-[ID]-class-lp[classKey] (unless elearn-)
    if (!assignment.id.startsWith('elearn-') && (!assignment.id.startsWith('as-') || !assignment.id.includes('-class-lp'))) {
      const classKey = normalizeClassKey(assignment.targetClass || assignment.grade || '5A');
      const baseId = assignment.id.replace(/^as-/, '').replace(/-class-.*$/, '');
      assignment.id = `as-${baseId}-class-lp${classKey.toLowerCase()}`;
    }

    let updated: HomeworkAssignment[];
    if (existsIdx >= 0) {
      updated = [...current];
      updated[existsIdx] = { ...current[existsIdx], ...assignment };
    } else {
      updated = [assignment, ...current];
    }
    saveAssignmentsToLocalStorage(updated);

    if (!db) {
      console.warn('Firestore chưa sẵn sàng, lưu cache cục bộ bài tập');
      return;
    }

    const assignRef = doc(db, 'assignments', assignment.id);
    const cleanedPayload = removeUndefined({
      ...assignment,
      id: assignment.id,
      grade: normalizedGrade,
      updatedAt: new Date().toISOString()
    });

    try {
      await trackedSetDoc(assignRef, cleanedPayload, { merge: true });
      invalidateQueryCache('assignments');
    } catch (setDocErr: any) {
      const errDetails = extractFirestoreErrorDetails(setDocErr);
      throw new Error(errDetails.message);
    }

    await waitForWriteConfirmation(assignRef, 12000, false);

    // Đọc lại từ Firestore sau khi lưu để xác nhận giá trị đã lưu đúng
    try {
      const verifiedSnap = await getDoc(assignRef);
      if (verifiedSnap.exists()) {
        const verifiedDoc = { id: verifiedSnap.id, ...verifiedSnap.data() } as HomeworkAssignment;
        const latestCached = getRawCachedAssignments();
        const idx = latestCached.findIndex(a => a.id === verifiedDoc.id);
        if (idx >= 0) {
          latestCached[idx] = { ...latestCached[idx], ...verifiedDoc };
          saveAssignmentsToLocalStorage(latestCached);
        } else {
          saveAssignmentsToLocalStorage([verifiedDoc, ...latestCached]);
        }
      }
    } catch (verifyErr) {
      console.warn('Không thể đọc lại bài tập sau khi lưu:', verifyErr);
    }

    const actorName = assignment.ownerName || assignment.teacherName || 'Giáo viên';
    await logSystemActivity({
      type: 'assignment_assigned',
      actorName,
      className: assignment.targetClass || assignment.grade || 'Lớp học',
      targetTitle: assignment.title || 'Bài tập',
      module: 'Quản Lý Bài Tập',
      action: `${actorName} giao bài tập ${assignment.title || 'Bài tập'} cho ${assignment.targetClass || assignment.grade || 'Lớp học'}`
    }).catch(() => {});
  } catch (error) {
    console.error(`❌ [Lỗi giao/lưu bài tập Khối ${assignmentInput?.grade || '5'} lên Firestore]:`, error);
  }
}

/**
 * Fetch accessible assignments from Firestore using RBAC scoped queries (5-minute cache, max 20 docs/source, no onSnapshot)
 */
export async function getAssignmentsFromFirestore(forceRefresh = false): Promise<HomeworkAssignment[]> {
  try {
    if (!db) return getLocalCachedAssignments();

    const items = await queryAccessibleCollection<HomeworkAssignment>('assignments', {
      forceRefresh,
      maxPerSource: 20,
      adminLimit: 60
    });
    const clean = deduplicateAssignments(items);
    updateCollectionCacheStatus('assignments', false, clean.length, false);
    if (clean.length > 0) {
      saveAssignmentsToLocalStorage(clean);
      return clean;
    }
    return getLocalCachedAssignments();
  } catch (error) {
    console.warn("Lỗi đọc danh sách bài tập từ Firestore:", error);
    return getLocalCachedAssignments();
  }
}

/**
 * Load assignments from Firestore using RBAC scoped queries (no onSnapshot)
 */
export function subscribeToAssignmentsFromFirestore(
  onUpdate: (assignments: HomeworkAssignment[]) => void,
  onError?: (err: any) => void
) {
  if (!db) {
    onUpdate(getLocalCachedAssignments());
    return () => {};
  }

  let isMounted = true;

  getAssignmentsFromFirestore(false)
    .then(cleanLoaded => {
      if (!isMounted) return;
      cleanLoaded.sort((a, b) => (b.id > a.id ? 1 : -1));
      onUpdate(cleanLoaded);
    })
    .catch(err => {
      if (onError) onError(err);
      if (isMounted) onUpdate(getLocalCachedAssignments());
    });

  return () => {
    isMounted = false;
  };
}

// import { deleteSubmissionsByAssignment } from './cascadeCleanupService';

/**
 * Delete an assignment from Firestore
 */
export async function deleteAssignmentFromFirestore(assignmentId: string): Promise<void> {
  try {
    // Dọn dẹp dây chuyền bài tập
    // await deleteSubmissionsByAssignment(assignmentId).catch(err => console.error('Lỗi dọn dẹp dây chuyền bài tập:', err));
    console.warn('deleteSubmissionsByAssignment: cascadeCleanupService has been removed.');

    const current = getLocalCachedAssignments();
    const updated = current.filter(a => a?.id !== assignmentId);
    saveAssignmentsToLocalStorage(updated);

    if (db) {
      const ref = doc(db, 'assignments', assignmentId);
      await trackedDeleteDoc(ref);
      await waitForWriteConfirmation(ref, 12000, true);
      console.log(`🗑️ Đã xóa bài tập ID ${assignmentId} trên Cloud Firestore!`);
    }
  } catch (error) {
    console.error("Lỗi khi xóa bài tập khỏi Firestore:", error);
  }
}

/**
 * Kiểm tra một bài tập có bị đánh dấu xóa hay không
 */
export function isAssignmentDeleted(assignmentId?: string | null): boolean {
  if (!assignmentId) return false;
  try {
    const cached = getLocalCachedAssignments();
    const found = cached.find(a => a?.id === assignmentId);
    return Boolean(found && (found as any)?.isDeleted);
  } catch {
    return false;
  }
}

/**
 * Đánh dấu xóa một bài tập (soft delete)
 */
export function markAssignmentDeleted(assignmentId: string): void {
  if (!assignmentId) return;
  try {
    const cached = getLocalCachedAssignments();
    const updated = cached.map(a => {
      if (a?.id === assignmentId) {
        return { ...a, isDeleted: true, deletedAt: new Date().toISOString() };
      }
      return a;
    });
    saveAssignmentsToLocalStorage(updated);
  } catch (err) {
    console.warn('Lỗi khi đánh dấu xóa bài tập:', err);
  }
}

/**
 * Khôi phục bài tập đã xóa
 */
export function restoreDeletedAssignment(assignmentId: string): void {
  if (!assignmentId) return;
  try {
    const cached = getLocalCachedAssignments();
    const updated = cached.map(a => {
      if (a?.id === assignmentId) {
        return { ...a, isDeleted: false, deletedAt: undefined };
      }
      return a;
    });
    saveAssignmentsToLocalStorage(updated);
  } catch (err) {
    console.warn('Lỗi khi khôi phục bài tập:', err);
  }
}

/**
 * Lấy bài tập theo ID
 */
export function getAssignmentById(assignmentId: string): HomeworkAssignment | undefined {
  if (!assignmentId) return undefined;
  const cached = getLocalCachedAssignments();
  return cached.find(a => a?.id === assignmentId);
}

/**
 * Gieo mầm thủ công toàn bộ danh sách bài tập mẫu vào LocalStorage và Firestore
 */
export async function seedInitialAssignmentsManually(): Promise<HomeworkAssignment[]> {
  return [];
}

/**
 * Xóa sạch cache bài tập trong LocalStorage
 */
export function clearAllAssignmentsCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ASSIGNMENTS_CACHE_KEY);
  } catch (e) {
    console.warn('Lỗi khi dọn cache bài tập:', e);
  }
}

/**
 * Xóa toàn bộ danh sách Bài tập khỏi Firestore và dọn dẹp LocalStorage cache
 */
export async function deleteAllAssignmentsFromFirestore(): Promise<void> {
  try {
    if (db) {
      const snap = await getDocs(collection(db, 'assignments'));
      if (!snap.empty) {
        const CHUNK_SIZE = 450;
        for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
          const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
          const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });
          chunk.forEach((docSnap) => {
            batch.delete(doc(db, 'assignments', docSnap.id));
          });
          await batch.commit();
        }
        console.log(`🗑️ Đã xóa sạch toàn bộ ${snap.size} bài tập trên Cloud Firestore bằng writeBatch!`);
      }
    }
    saveAssignmentsToLocalStorage([]);
  } catch (error) {
    console.error("Lỗi khi xóa toàn bộ bài tập khỏi Firestore:", error);
    saveAssignmentsToLocalStorage([]);
  }
}

/**
 * Quét các bản ghi trong collection `submissions` (và local cache) của một bài tập,
 * tìm các bài nộp cùng `studentId` và `examId` có thời gian nộp cách nhau dưới 60 giây,
 * giữ lại bản ghi sớm nhất và xóa các bản trùng lặp còn lại.
 */
export async function deduplicateSubmissions(examId?: string): Promise<{ cleanedCount: number; removedIds: string[] }> {
  const removedIds: string[] = [];
  try {
    let allSubs: any[] = [];
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'submissions'));
        snap.forEach(docSnap => {
          allSubs.push({ id: docSnap.id, ...docSnap.data() });
        });
      } catch (err) {
        console.warn('Lỗi đọc submissions từ Firestore trong deduplicateSubmissions:', err);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const localAll = localStorage.getItem('eduplay_all_exam_submissions');
        if (localAll) {
          const parsed = JSON.parse(localAll);
          if (Array.isArray(parsed)) {
            parsed.forEach(item => {
              if (item && !allSubs.some(s => s.id === item.id)) {
                allSubs.push(item);
              }
            });
          }
        }
      } catch {}
    }

    if (examId) {
      const cleanTargetExam = String(examId).trim().toLowerCase();
      const baseTarget = cleanTargetExam.replace(/-class-.*$/, '').replace(/^ex-/, '');
      allSubs = allSubs.filter(sub => {
        const sExam = String(sub.examId || sub.exam?.id || sub.id || '').trim().toLowerCase();
        if (!sExam) return false;
        if (sExam === cleanTargetExam) return true;
        const baseSub = sExam.replace(/-class-.*$/, '').replace(/^ex-/, '');
        return baseTarget && baseSub && baseTarget === baseSub;
      });
    }

    const groups = new Map<string, any[]>();
    allSubs.forEach(sub => {
      const sId = normalizeStudentCode(String(sub.studentId || sub.maHs || sub.studentCode || sub.code || ''));
      const eId = String(sub.examId || sub.exam?.id || 'general').trim().toLowerCase();
      if (!sId) return;
      const key = `${eId}__${sId}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(sub);
    });

    const duplicatesToRemove: string[] = [];

    groups.forEach((subs) => {
      if (subs.length <= 1) return;
      subs.sort((a, b) => {
        const tA = new Date(a.submittedAt || a.timestamp || a.createdAt || 0).getTime();
        const tB = new Date(b.submittedAt || b.timestamp || b.createdAt || 0).getTime();
        return tA - tB;
      });

      const kept: any[] = [];
      subs.forEach(sub => {
        const tSub = new Date(sub.submittedAt || sub.timestamp || sub.createdAt || 0).getTime();
        const duplicateMatch = kept.find(k => {
          const tK = new Date(k.submittedAt || k.timestamp || k.createdAt || 0).getTime();
          return Math.abs(tSub - tK) < 60000;
        });

        if (duplicateMatch) {
          if (sub.id) {
            duplicatesToRemove.push(sub.id);
          }
        } else {
          kept.push(sub);
        }
      });
    });

    if (duplicatesToRemove.length > 0) {
      if (db) {
        const CHUNK_SIZE = 450;
        for (let i = 0; i < duplicatesToRemove.length; i += CHUNK_SIZE) {
          const chunk = duplicatesToRemove.slice(i, i + CHUNK_SIZE);
          const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });
          chunk.forEach(id => {
            batch.delete(doc(db, 'submissions', id));
          });
          await batch.commit();
        }
      }

      if (typeof window !== 'undefined') {
        try {
          const localAll = localStorage.getItem('eduplay_all_exam_submissions');
          if (localAll) {
            const parsed = JSON.parse(localAll);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter(item => !item || !duplicatesToRemove.includes(item.id));
              localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(filtered));
            }
          }
        } catch {}
      }
      removedIds.push(...duplicatesToRemove);
      console.log(`🧹 Đã dọn dẹp ${duplicatesToRemove.length} bài nộp trùng lặp trong vòng 60 giây!`);
    }

    return { cleanedCount: removedIds.length, removedIds };
  } catch (err) {
    console.error('Lỗi trong deduplicateSubmissions:', err);
    return { cleanedCount: 0, removedIds: [] };
  }
}

export type PublicAssignmentFetchResult =
  | { status: 'ok'; assignment: HomeworkAssignment }
  | { status: 'not_found' }
  | { status: 'error'; message?: string };

/**
 * Trích xuất ID bài tập khi URL có dạng /assignment/[assignmentId]
 */
export function extractAssignmentIdFromPath(pathname?: string): string | null {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const match = path.match(/^\/assignment\/([^/?#]+)\/?$/i);
  if (!match || !match[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return match[1].trim() || null;
  }
}

/**
 * Tải nội dung bài tập công khai theo ID (chế độ chỉ đọc, tự động signInAnonymously ngầm nếu cần).
 */
export async function fetchPublicAssignmentById(
  assignmentId: string
): Promise<PublicAssignmentFetchResult> {
  const cleanId = (assignmentId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensureAnonymousGuestAuth();

  if (db) {
    try {
      const ref = doc(db, 'assignments', cleanId);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch {
        snap = await getDoc(ref);
      }

      if (snap.exists()) {
        const assignment = { id: snap.id, ...snap.data() } as HomeworkAssignment;
        return { status: 'ok', assignment };
      }

      // Thử tìm bài tập gốc nếu ID có hậu tố -class-...
      const baseId = cleanId.replace(/-class-[a-z0-9_-]+$/i, '');
      if (baseId && baseId !== cleanId) {
        const baseRef = doc(db, 'assignments', baseId);
        let baseSnap;
        try {
          baseSnap = await getDocFromServer(baseRef);
        } catch {
          baseSnap = await getDoc(baseRef);
        }
        if (baseSnap.exists()) {
          const assignment = { id: cleanId, ...baseSnap.data() } as HomeworkAssignment;
          return { status: 'ok', assignment };
        }
      }
    } catch (err: any) {
      console.warn('Lỗi tải bài tập từ Firestore, chuyển sang dự phòng cache:', err);
      const cached = getRawCachedAssignments().find(
        item => item.id === cleanId || item.originalAssignmentId === cleanId
      );
      if (cached) {
        return { status: 'ok', assignment: cached };
      }
      return {
        status: 'error',
        message: 'Không thể kết nối đến máy chủ bài tập. Vui lòng thử lại sau.'
      };
    }
  }

  const cached = getRawCachedAssignments().find(
    item => item.id === cleanId || item.originalAssignmentId === cleanId
  );
  if (cached) {
    return { status: 'ok', assignment: cached };
  }

  return { status: 'not_found' };
}



