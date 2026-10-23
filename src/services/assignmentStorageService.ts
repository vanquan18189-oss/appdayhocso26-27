import { db, auth } from './firebase';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { trackedSetDoc, trackedDeleteDoc, trackedWriteBatch, extractFirestoreErrorDetails } from './firestoreWriteTracker';
import { HomeworkAssignment } from '../types';
import { INITIAL_ASSIGNMENTS } from './mockData';
import { removeUndefined, getCurrentTeacherProfile, resolveCurrentTeacherProfile } from './teacherStorageService';
import { waitForWriteConfirmation, updateCollectionCacheStatus } from './firestoreWriteVerificationService';
import './orderingMigrationService';

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
 * Quét và dọn dẹp các bản ghi bài tập trùng lặp trong cả LocalStorage và Firestore
 */
export async function cleanDuplicateAssignments(): Promise<void> {
  try {
    const cached = getLocalCachedAssignments();
    const cleanList = deduplicateAssignments(cached);
    if (cleanList.length !== cached.length) {
      console.log(`🧹 Đã dọn dẹp ${cached.length - cleanList.length} bài tập trùng lặp trong LocalStorage`);
      saveAssignmentsToLocalStorage(cleanList);
    }
  } catch (err) {
    console.warn('Lỗi khi chạy cleanDuplicateAssignments:', err);
  }
}

// Chạy dọn dẹp tự động khi tải
if (typeof window !== 'undefined') {
  setTimeout(() => {
    cleanDuplicateAssignments().catch(console.error);
  }, 1000);
}

/**
 * Get assignments from LocalStorage Cache
 */
export function getLocalCachedAssignments(): HomeworkAssignment[] {
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
 * Save assignments to LocalStorage Cache and dispatch real-time events
 */
export function saveAssignmentsToLocalStorage(assignments: HomeworkAssignment[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = deduplicateAssignments(assignments);
    localStorage.setItem(ASSIGNMENTS_CACHE_KEY, JSON.stringify(clean));

    // Dispatch real-time events for live component and perspective view synchronization
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
 * Save a HomeworkAssignment to Firestore
 */
export async function saveAssignmentToFirestore(assignment: HomeworkAssignment): Promise<void> {
  try {
    const targetDigit = extractGradeDigit(assignment.targetClass) || extractGradeDigit(assignment.grade) || '5';
    const normalizedGrade = `Khối ${targetDigit}`;
    assignment.grade = normalizedGrade;

    // 0. Resolve the authentic teacher profile using resolveCurrentTeacherProfile (SSOT)
    const currentEmail = (
      assignment.teacherEmail ||
      (auth && auth.currentUser ? auth.currentUser.email : null) ||
      (typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_email') : null) ||
      ''
    ).toLowerCase().trim();

    const profile = resolveCurrentTeacherProfile(currentEmail);

    // Strictly enforce teacherId: MUST be business ID (e.g. 'gv-12'), NEVER Firebase Auth UID!
    const isInvalidTeacherId =
      !assignment.teacherId ||
      assignment.teacherId === 'u-4' ||
      assignment.teacherId === 'gv-temp' ||
      assignment.teacherId.length > 10 || // Firebase Auth UIDs are 28 characters long
      (currentEmail.includes('thuthuthtk') && assignment.teacherId !== 'gv-12');

    if (isInvalidTeacherId) {
      assignment.teacherId = profile.id;
    }

    // Strictly enforce teacherName: MUST match authentic profile
    const isMismatchedName =
      !assignment.teacherName ||
      assignment.teacherName === 'Lê Minh Anh' ||
      assignment.teacherName === 'Nguyễn Thị Thủ' ||
      assignment.teacherName === 'Nguyễn Thị Thủ (ADMIN)' ||
      (currentEmail.includes('thuthuthtk') && assignment.teacherName !== 'Nguyễn Thị Thu') ||
      (!currentEmail.includes('vanquan') && assignment.teacherName.includes('Văn Quân'));

    if (isMismatchedName) {
      assignment.teacherName = profile.name;
    }

    // Ensure teacherEmail is populated
    assignment.teacherEmail = profile.email || currentEmail;

    // Ensure createdBy is business ID, NEVER Auth UID
    if (assignment.createdBy && assignment.createdBy.length > 10) {
      assignment.createdBy = profile.id;
    } else if (!assignment.createdBy) {
      assignment.createdBy = profile.id;
    }

    // 1. Always update local cache first (strict ID matching only, never overwrite different assignments)
    const current = getLocalCachedAssignments();
    const existsIdx = current.findIndex(a => a.id === assignment.id);
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
      grade: normalizedGrade,
      updatedAt: new Date().toISOString()
    });

    try {
      await trackedSetDoc(assignRef, cleanedPayload, { merge: true });
    } catch (setDocErr: any) {
      const errDetails = extractFirestoreErrorDetails(setDocErr);
      console.error(`❌ [LỖI FIRESTORE TỪ CHỐI LƯU BÀI TẬP KHỐI ${normalizedGrade}]`, {
        message: errDetails.message,
        code: errDetails.code,
        assignmentId: assignment.id,
        grade: normalizedGrade,
        targetClass: assignment.targetClass,
        payload: cleanedPayload
      });
      throw new Error(errDetails.message);
    }

    const writeResult = await waitForWriteConfirmation(assignRef, 12000, false);
    if (writeResult.success) {
      console.log(`💾 [Máy chủ xác nhận] Đã lưu bài tập "${assignment.title}" (Khối: ${normalizedGrade}, Lớp: ${assignment.targetClass}, ID: ${assignment.id}) lên Cloud Firestore!`);
    } else {
      console.warn(`⚠️ [Chưa xác nhận máy chủ Khối ${normalizedGrade}] ${writeResult.message}`);
    }
  } catch (error) {
    console.error(`❌ [Lỗi giao/lưu bài tập Khối ${assignment?.grade || '5'} lên Firestore]:`, error);
  }
}

/**
 * Fetch all assignments from Firestore
 */
export async function getAssignmentsFromFirestore(): Promise<HomeworkAssignment[]> {
  try {
    if (!db) return getLocalCachedAssignments();

    const snap = await getDocs(collection(db, 'assignments'));
    if (!snap.empty) {
      const items: HomeworkAssignment[] = [];
      snap.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as HomeworkAssignment);
      });
      saveAssignmentsToLocalStorage(items);
      return items;
    }

    // Nếu rỗng, không gieo mầm dữ liệu mẫu
    saveAssignmentsToLocalStorage([]);
    return [];
  } catch (error) {
    console.warn("Lỗi đọc danh sách bài tập từ Firestore:", error);
    return getLocalCachedAssignments();
  }
}

/**
 * Subscribe to Real-time listener for assignments collection from Firestore
 */
export function subscribeToAssignmentsFromFirestore(
  onUpdate: (assignments: HomeworkAssignment[]) => void,
  onError?: (err: any) => void
) {
  if (!db) {
    onUpdate(getLocalCachedAssignments());
    return () => {};
  }

  try {
    const colRef = collection(db, 'assignments');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        const hasPending = snapshot.metadata.hasPendingWrites;

        updateCollectionCacheStatus('assignments', isFromCache, snapshot.size, hasPending);

        if (!snapshot.empty) {
          const loaded: HomeworkAssignment[] = [];
          snapshot.forEach((docSnap) => {
            loaded.push({ id: docSnap.id, ...docSnap.data() } as HomeworkAssignment);
          });
          const cleanLoaded = deduplicateAssignments(loaded);
          cleanLoaded.sort((a, b) => (b.id > a.id ? 1 : -1));
          saveAssignmentsToLocalStorage(cleanLoaded);
          onUpdate(cleanLoaded);
        } else {
          saveAssignmentsToLocalStorage([]);
          onUpdate([]);
        }
      },
      (err) => {
        console.warn('Lỗi Firestore Live Assignments listener:', err);
        if (onError) onError(err);
        onUpdate(getLocalCachedAssignments());
      }
    );
  } catch (err) {
    console.warn('Lỗi khởi tạo subscribeToAssignmentsFromFirestore:', err);
    onUpdate(getLocalCachedAssignments());
    return () => {};
  }
}

/**
 * Delete an assignment from Firestore
 */
export async function deleteAssignmentFromFirestore(assignmentId: string): Promise<void> {
  try {
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


