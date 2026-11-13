import { db } from './firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc
} from 'firebase/firestore';
import {
  CANONICAL_TEACHER_DIRECTORY,
  getCanonicalTeacherDirectory,
  normalizeDepartmentName
} from '../constants/teacherDirectory';
import { invalidateQueryCache } from './permissionService';
import { SharePermissionLevel } from '../types';

export type MigratableCollection =
  | 'elearning_lessons'
  | 'questions'
  | 'exams'
  | 'assignments'
  | 'games'
  | 'quizzi_games';

export interface MigrationPreviewItem {
  key: string; // `${collectionName}::${docId}`
  collectionName: MigratableCollection;
  collectionLabel: string;
  docId: string;
  title: string;
  subject: string;
  grade: string;
  existingOwnerId?: string;
  existingEmail?: string;
  existingAuthorName?: string;
  proposedTeacherId: string;
  proposedOwnerId: string;
  proposedOwnerEmail: string;
  proposedOwnerName: string;
  proposedToChuyenMon: string;
  reason: string;
  isAutoResolved: boolean;
  needsMigration: boolean;
  rawData: Record<string, any>;
}

export interface MigrationExecutionResult {
  success: boolean;
  migratedCount: number;
  backupBatchId: string;
  errors: string[];
}

export const COLLECTION_LABELS: Record<MigratableCollection, string> = {
  elearning_lessons: 'Bài giảng E-Learning',
  questions: 'Ngân hàng câu hỏi',
  exams: 'Đề kiểm tra',
  assignments: 'Bài tập & Giao bài',
  games: 'Trò chơi tương tác',
  quizzi_games: 'Trò chơi Quizzi'
};

function getDefaultAdminOwner() {
  const dir = getCanonicalTeacherDirectory();
  return (
    dir.find(t => t.id === 'gv-10') || {
      id: 'gv-10',
      uid: 'gv-10',
      name: 'Nguyễn Thị Thu',
      emails: ['thuthuthtk@gmail.com'],
      toChuyenMon: 'Tổ Ban Giám Hiệu'
    }
  );
}

/**
 * Infer owner from existing document fields (teacherEmail, email, teacherId, teacherName, authorName, createdBy).
 * Unidentified items default to Admin (Nguyễn Thị Thu - thuthuthtk@gmail.com) and are flagged `isAutoResolved = false`.
 */
export function inferOwnerFromDoc(data: Record<string, any>): {
  teacherId: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  toChuyenMon: string;
  reason: string;
  isAutoResolved: boolean;
} {
  // 1. Check existing ownerId + ownerEmail
  const existingOwnerId = String(data.ownerId || '').trim();
  const rawEmail = String(
    data.ownerEmail || data.teacherEmail || data.email || data.authorEmail || ''
  ).toLowerCase().trim();

  if (rawEmail) {
    const byEmail = CANONICAL_TEACHER_DIRECTORY.find(t => t.emails.includes(rawEmail));
    if (byEmail) {
      return {
        teacherId: byEmail.id,
        ownerId: existingOwnerId || byEmail.uid || byEmail.id,
        ownerEmail: byEmail.emails[0],
        ownerName: byEmail.name,
        toChuyenMon: normalizeDepartmentName(byEmail.toChuyenMon),
        reason: `Suy ra từ email người tạo (${rawEmail})`,
        isAutoResolved: true
      };
    }
  }

  // 2. Check teacherId
  const rawTeacherId = String(data.teacherId || '').trim();
  if (rawTeacherId) {
    const byId = CANONICAL_TEACHER_DIRECTORY.find(
      t => t.id.toLowerCase() === rawTeacherId.toLowerCase() || (t.uid && t.uid === rawTeacherId)
    );
    if (byId) {
      return {
        teacherId: byId.id,
        ownerId: existingOwnerId || byId.uid || byId.id,
        ownerEmail: byId.emails[0],
        ownerName: byId.name,
        toChuyenMon: normalizeDepartmentName(byId.toChuyenMon),
        reason: `Suy ra từ mã giáo viên (${rawTeacherId})`,
        isAutoResolved: true
      };
    }
  }

  // 3. Check teacherName / authorName / createdBy
  const rawName = String(
    data.ownerName || data.teacherName || data.authorName || data.author || data.createdBy || ''
  ).trim();

  if (rawName) {
    const cleanLower = rawName.toLowerCase();
    const byName = CANONICAL_TEACHER_DIRECTORY.find(t => {
      const tLower = t.name.toLowerCase();
      return (
        cleanLower === tLower ||
        cleanLower.includes(tLower) ||
        tLower.includes(cleanLower) ||
        (cleanLower.includes('nguyễn thị thu') && t.id === 'gv-10') ||
        (cleanLower.includes('nguyễn thị thủ') && t.id === 'gv-10') ||
        (cleanLower.includes('văn quân') && t.id === 'gv-11')
      );
    });

    if (byName) {
      return {
        teacherId: byName.id,
        ownerId: existingOwnerId || byName.uid || byName.id,
        ownerEmail: byName.emails[0],
        ownerName: byName.name,
        toChuyenMon: normalizeDepartmentName(byName.toChuyenMon),
        reason: `Suy ra từ tên tác giả ("${rawName}")`,
        isAutoResolved: true
      };
    }
  }

  // 4. Unidentified -> Default to Admin (gv-10 Nguyễn Thị Thu)
  const defaultAdmin = getDefaultAdminOwner();
  return {
    teacherId: defaultAdmin.id,
    ownerId: defaultAdmin.uid || defaultAdmin.id,
    ownerEmail: defaultAdmin.emails[0],
    ownerName: defaultAdmin.name,
    toChuyenMon: defaultAdmin.toChuyenMon,
    reason: 'Chưa có trường người tạo (teacherEmail/authorName trống) → Mặc định gán cho Admin',
    isAutoResolved: false
  };
}

/**
 * Scan all 6 content collections in Firestore to build the preview table for Legacy Data Ownership Migration.
 */
export async function scanLegacyContentForOwnership(): Promise<MigrationPreviewItem[]> {
  if (!db) return [];

  const collectionsToScan: MigratableCollection[] = [
    'elearning_lessons',
    'exams',
    'assignments',
    'games',
    'quizzi_games',
    'questions'
  ];

  const items: MigrationPreviewItem[] = [];

  for (const colName of collectionsToScan) {
    try {
      const snap = await getDocs(collection(db, colName));
      snap.forEach(docSnap => {
        const data = docSnap.data() || {};
        const docId = docSnap.id;
        const inferred = inferOwnerFromDoc(data);

        const title = String(
          data.title ||
          data.lessonName ||
          (data.content ? `${String(data.content).slice(0, 75)}${String(data.content).length > 75 ? '...' : ''}` : '') ||
          docId
        ).trim();

        const hasCompleteOwnership = Boolean(
          data.ownerId &&
          data.ownerEmail &&
          data.toChuyenMon &&
          Array.isArray(data.sharedWithTeachers) &&
          Array.isArray(data.sharedWithGroups) &&
          data.sharePermission
        );

        items.push({
          key: `${colName}::${docId}`,
          collectionName: colName,
          collectionLabel: COLLECTION_LABELS[colName],
          docId,
          title,
          subject: String(data.subject || data.subjectLabel || 'Chung'),
          grade: String(data.grade || data.targetClass || data.classInfo || ''),
          existingOwnerId: data.ownerId ? String(data.ownerId) : undefined,
          existingEmail: data.ownerEmail || data.teacherEmail || undefined,
          existingAuthorName: data.ownerName || data.teacherName || data.authorName || undefined,
          proposedTeacherId: inferred.teacherId,
          proposedOwnerId: inferred.ownerId,
          proposedOwnerEmail: inferred.ownerEmail,
          proposedOwnerName: inferred.ownerName,
          proposedToChuyenMon: inferred.toChuyenMon,
          reason: inferred.reason,
          isAutoResolved: inferred.isAutoResolved,
          needsMigration: !hasCompleteOwnership,
          rawData: data
        });
      });
    } catch (err) {
      console.warn(`Lỗi khi quét collection ${colName}:`, err);
    }
  }

  return items;
}

/**
 * Backup original documents to `ownership_migration_backups` and write ownership metadata (`ownerId`, `ownerEmail`, `ownerName`, `toChuyenMon`, `sharedWithTeachers`, `sharedWithGroups`, `sharePermission`).
 * Never deletes any document.
 */
export async function executeOwnershipMigration(
  itemsToMigrate: MigrationPreviewItem[]
): Promise<MigrationExecutionResult> {
  if (!db) {
    return {
      success: false,
      migratedCount: 0,
      backupBatchId: '',
      errors: ['Firestore chưa sẵn sàng.']
    };
  }

  const backupBatchId = `backup_${Date.now()}`;
  const nowIso = new Date().toISOString();
  const errors: string[] = [];
  let migratedCount = 0;

  // 1. Save backup summary into localStorage as extra safety
  if (typeof window !== 'undefined') {
    try {
      const localBackupPayload = itemsToMigrate.map(item => ({
        collectionName: item.collectionName,
        docId: item.docId,
        previousOwnerId: item.rawData.ownerId || null,
        previousOwnerEmail: item.rawData.ownerEmail || item.rawData.teacherEmail || null,
        previousAuthorName: item.rawData.ownerName || item.rawData.teacherName || item.rawData.authorName || null
      }));
      localStorage.setItem(`eduplay_ownership_backup_${backupBatchId}`, JSON.stringify(localBackupPayload));
    } catch {}
  }

  // 2. Process each item: write backup doc first, then merge ownership fields
  for (const item of itemsToMigrate) {
    try {
      const backupDocId = `${backupBatchId}_${item.collectionName}_${item.docId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const backupRef = doc(db, 'ownership_migration_backups', backupDocId);

      await setDoc(backupRef, {
        batchId: backupBatchId,
        backedUpAt: nowIso,
        collectionName: item.collectionName,
        docId: item.docId,
        originalData: item.rawData
      });

      const targetRef = doc(db, item.collectionName, item.docId);
      const existingSharedTeachers = Array.isArray(item.rawData.sharedWithTeachers)
        ? item.rawData.sharedWithTeachers
        : [];
      const existingSharedGroups = Array.isArray(item.rawData.sharedWithGroups)
        ? item.rawData.sharedWithGroups
        : [];
      const existingSharePermission: SharePermissionLevel =
        item.rawData.sharePermission || 'view';

      await setDoc(
        targetRef,
        {
          ownerId: item.proposedOwnerId,
          ownerEmail: item.proposedOwnerEmail,
          ownerName: item.proposedOwnerName,
          toChuyenMon: normalizeDepartmentName(item.proposedToChuyenMon),
          teacherId: item.proposedTeacherId,
          teacherEmail: item.proposedOwnerEmail,
          teacherName: item.proposedOwnerName,
          authorName: item.rawData.authorName || item.proposedOwnerName,
          sharedWithTeachers: existingSharedTeachers,
          sharedWithGroups: existingSharedGroups,
          sharePermission: existingSharePermission,
          allowDeleteByShared: Boolean(item.rawData.allowDeleteByShared ?? false),
          ownershipMigratedAt: nowIso
        },
        { merge: true }
      );

      migratedCount++;
    } catch (err: any) {
      errors.push(`${item.collectionName}/${item.docId}: ${err?.message || String(err)}`);
    }
  }

  invalidateQueryCache();

  return {
    success: errors.length === 0,
    migratedCount,
    backupBatchId,
    errors
  };
}

/**
 * Complete, production-ready Firestore Rules for pasting into Firebase Console -> Firestore Database -> Rules.
 */
export const FULL_FIRESTORE_RULES_TEXT = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // =========================================================================
    // 1. CÁC HÀM Bổ TRỢ XÁC THỰC & PHÂN QUYỀN (RBAC HELPERS)
    // =========================================================================
    function isSignedIn() {
      return request.auth != null;
    }

    function authEmail() {
      return isSignedIn() && request.auth.token.email != null
        ? request.auth.token.email.lower()
        : '';
    }

    // Kiểm tra tài khoản Admin (Ban Giám Hiệu & Quản trị viên hệ thống)
    function isAdmin() {
      return isSignedIn() && (
        authEmail() in [
          'thuthuthtk@gmail.com',
          'vanquan18189@gmail.com',
          'dangtanhung@gmail.com',
          'dongtam79tk@gmail.com'
        ] ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      );
    }

    // Kiểm tra người dùng hiện tại có phải là CHỦ SỞ HỮU của nội dung (docData) không
    function isDocOwner(docData) {
      return isSignedIn() && (
        ('ownerId' in docData && docData.ownerId == request.auth.uid) ||
        ('ownerEmail' in docData && docData.ownerEmail is string && docData.ownerEmail.lower() == authEmail()) ||
        ('teacherEmail' in docData && docData.teacherEmail is string && docData.teacherEmail.lower() == authEmail())
      );
    }

    // Kiểm tra nội dung có được CHIA SẺ cho giáo viên hiện tại không
    function isSharedWithCurrentTeacher(docData) {
      return isSignedIn() && (
        ('sharedWithTeachers' in docData && docData.sharedWithTeachers is list && (
          request.auth.uid in docData.sharedWithTeachers ||
          authEmail() in docData.sharedWithTeachers
        )) ||
        ('sharedWithGroups' in docData && docData.sharedWithGroups is list && docData.sharedWithGroups.size() > 0)
      );
    }

    // Kiểm tra người được chia sẻ có quyền SỬA ('edit' hoặc 'assign') không
    function canSharedTeacherEdit(docData) {
      return isSharedWithCurrentTeacher(docData) &&
        ('sharePermission' in docData && docData.sharePermission in ['edit', 'assign']);
    }

    // Kiểm tra người được chia sẻ có quyền XÓA (khi chủ bật allowDeleteByShared) không
    function canSharedTeacherDelete(docData) {
      return isSharedWithCurrentTeacher(docData) &&
        ('allowDeleteByShared' in docData && docData.allowDeleteByShared == true);
    }

    // Chặn người không phải chủ sở hữu tự ý đổi ownerId, ownerEmail hoặc cấu hình chia sẻ
    function preservesOwnershipAndSharingOnSharedEdit() {
      return request.resource.data.ownerId == resource.data.ownerId &&
        request.resource.data.ownerEmail == resource.data.ownerEmail &&
        request.resource.data.sharedWithTeachers == resource.data.sharedWithTeachers &&
        request.resource.data.sharedWithGroups == resource.data.sharedWithGroups &&
        request.resource.data.sharePermission == resource.data.sharePermission;
    }

    // =========================================================================
    // 2. HỒ SƠ NGƯỜI DÙNG & GIÁO VIÊN (users, teachers, to_chuyen_mon, departments)
    // - Học sinh KHÔNG được đọc collection users và teachers (chứa SĐT, CCCD, ngày sinh)
    // - Giáo viên thường chỉ đọc được hồ sơ của chính mình, và không được tự đổi role
    // =========================================================================
    match /users/{userId} {
      allow read: if isAdmin() || (
        isSignedIn() && (
          userId == request.auth.uid ||
          resource.data.uid == request.auth.uid ||
          (resource.data.email is string && resource.data.email.lower() == authEmail())
        )
      );
      allow create: if isAdmin();
      allow update: if isAdmin() || (
        isSignedIn() &&
        (userId == request.auth.uid || resource.data.uid == request.auth.uid || (resource.data.email is string && resource.data.email.lower() == authEmail())) &&
        request.resource.data.role == resource.data.role &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['uid', 'avatar', 'updatedAt'])
      );
      allow delete: if isAdmin();
    }

    match /teachers/{teacherId} {
      allow read: if isAdmin() || (
        isSignedIn() && (
          teacherId == request.auth.uid ||
          resource.data.uid == request.auth.uid ||
          (resource.data.email is string && resource.data.email.lower() == authEmail())
        )
      );
      allow create: if isAdmin();
      allow update: if isAdmin() || (
        isSignedIn() &&
        (teacherId == request.auth.uid || resource.data.uid == request.auth.uid || (resource.data.email is string && resource.data.email.lower() == authEmail())) &&
        request.resource.data.role == resource.data.role &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['uid', 'avatar', 'updatedAt'])
      );
      allow delete: if isAdmin();
    }

    match /to_chuyen_mon/{deptId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /departments/{deptId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /teacher_groups/{groupId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    // =========================================================================
    // 3. NỘI DUNG DẠY HỌC 5 PHÂN HỆ (Bài giảng, Câu hỏi, Đề thi, Bài tập, Trò chơi)
    // - Admin: toàn quyền đọc/ghi/xóa
    // - Giáo viên: chỉ đọc/ghi tài liệu do mình tạo (isDocOwner) hoặc được chia sẻ
    // - Học sinh: được đọc bài giảng, đề thi, bài tập, trò chơi giao cho lớp mình
    // =========================================================================

    // 3.1. Bài giảng E-Learning (elearning_lessons)
    match /elearning_lessons/{lessonId} {
      allow read: if isAdmin() || isDocOwner(resource.data) || isSharedWithCurrentTeacher(resource.data) || true;
      allow create: if isAdmin() || isDocOwner(request.resource.data);
      allow update: if isAdmin() || isDocOwner(resource.data) || (canSharedTeacherEdit(resource.data) && preservesOwnershipAndSharingOnSharedEdit());
      allow delete: if isAdmin() || isDocOwner(resource.data) || canSharedTeacherDelete(resource.data);
    }

    // 3.2. Ngân hàng câu hỏi (questions)
    match /questions/{questionId} {
      allow read: if isAdmin() || isDocOwner(resource.data) || isSharedWithCurrentTeacher(resource.data);
      allow create: if isAdmin() || isDocOwner(request.resource.data);
      allow update: if isAdmin() || isDocOwner(resource.data) || (canSharedTeacherEdit(resource.data) && preservesOwnershipAndSharingOnSharedEdit());
      allow delete: if isAdmin() || isDocOwner(resource.data) || canSharedTeacherDelete(resource.data);
    }

    // 3.3. Quản lý đề kiểm tra (exams) và bài nộp con (exams/{examId}/submissions/{subId})
    match /exams/{examId} {
      // Cho phép giáo viên chủ đề, người được chia sẻ, Admin và học sinh làm đề đọc đề kiểm tra
      allow read: if isAdmin() || isDocOwner(resource.data) || isSharedWithCurrentTeacher(resource.data) ||
        ('targetClass' in resource.data && resource.data.targetClass is string);
      allow create: if isAdmin() || isDocOwner(request.resource.data);
      allow update: if isAdmin() || isDocOwner(resource.data) ||
        (canSharedTeacherEdit(resource.data) && preservesOwnershipAndSharingOnSharedEdit()) ||
        // Cho phép cập nhật số lượt nộp bài khi học sinh nộp bài
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['submissions', 'submissionsCount', 'updatedAt']);
      allow delete: if isAdmin() || isDocOwner(resource.data) || canSharedTeacherDelete(resource.data);

      match /submissions/{subId} {
        allow read: if true;
        allow create, update: if true;
        allow delete: if isAdmin() || isSignedIn();
      }
    }

    // 3.4. Quản lý bài tập (assignments)
    match /assignments/{assignmentId} {
      allow read: if isAdmin() || isDocOwner(resource.data) || isSharedWithCurrentTeacher(resource.data) ||
        ('targetClass' in resource.data && resource.data.targetClass is string);
      allow create: if isAdmin() || isDocOwner(request.resource.data);
      allow update: if isAdmin() || isDocOwner(resource.data) ||
        (canSharedTeacherEdit(resource.data) && preservesOwnershipAndSharingOnSharedEdit()) ||
        // Cho phép học sinh nộp bài cập nhật mảng submissions / completedCount
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['submissions', 'submittedCount', 'submittedIds', 'completedCount', 'updatedAt']);
      allow delete: if isAdmin() || isDocOwner(resource.data) || canSharedTeacherDelete(resource.data);
    }

    // 3.5. Trò chơi học tập (games & quizzi_games)
    match /games/{gameId} {
      allow read: if isAdmin() || isDocOwner(resource.data) || isSharedWithCurrentTeacher(resource.data) ||
        ('classInfo' in resource.data && resource.data.classInfo is string);
      allow create: if isAdmin() || isDocOwner(request.resource.data);
      allow update: if isAdmin() || isDocOwner(resource.data) ||
        (canSharedTeacherEdit(resource.data) && preservesOwnershipAndSharingOnSharedEdit()) ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['playersCount', 'status', 'updatedAt']);
      allow delete: if isAdmin() || isDocOwner(resource.data) || canSharedTeacherDelete(resource.data);
    }

    match /quizzi_games/{quizziId} {
      allow read: if isAdmin() || isDocOwner(resource.data) || isSharedWithCurrentTeacher(resource.data) ||
        ('classInfo' in resource.data && resource.data.classInfo is string);
      allow create: if isAdmin() || isDocOwner(request.resource.data);
      allow update: if isAdmin() || isDocOwner(resource.data) || (canSharedTeacherEdit(resource.data) && preservesOwnershipAndSharingOnSharedEdit());
      allow delete: if isAdmin() || isDocOwner(resource.data) || canSharedTeacherDelete(resource.data);
    }

    // =========================================================================
    // 4. DỮ LIỆU HỌC SINH, LỚP HỌC, BÀI NỘP & NHẬT KÝ HOẠT ĐỘNG
    // =========================================================================
    match /students/{studentId} {
      allow read: if true;
      allow create, delete: if isAdmin() || isSignedIn();
      allow update: if true;
    }

    match /classes/{classId} {
      allow read: if true;
      allow write: if isAdmin() || isSignedIn();
    }

    match /student_enrollments/{enrollmentId} {
      allow read: if true;
      allow write: if isAdmin() || isSignedIn();
    }

    match /student_results/{resultId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || isSignedIn();
    }

    match /exam_progress/{progressId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || isSignedIn();
    }

    match /activityLogs/{logId} {
      allow read: if true;
      allow create, update: if true;
      allow delete: if isAdmin();
    }

    match /system_settings/{settingId} {
      allow read: if settingId != 'teachers_registry' || isAdmin();
      allow write: if isAdmin() || isSignedIn();
    }

    // Bản sao lưu dữ liệu trước khi gán ownerId hàng loạt (Chỉ Admin)
    match /ownership_migration_backups/{backupId} {
      allow read, write: if isAdmin();
    }

    // Mặc định từ chối tất cả các đường dẫn lạ chưa khai báo
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;
