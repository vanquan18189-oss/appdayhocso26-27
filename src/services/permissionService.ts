import { db, auth } from './firebase';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  setDoc
} from 'firebase/firestore';
import {
  resolveCurrentTeacherProfile,
  TeacherProfileResult
} from './teacherStorageService';
import {
  CANONICAL_TEACHER_DIRECTORY,
  normalizeDepartmentName
} from '../constants/teacherDirectory';
import { SharePermissionLevel, UserRole } from '../types';

export interface AccessContext {
  role: UserRole;
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  uid: string;
  teacherId: string;
  email: string;
  allEmails: string[];
  name: string;
  teacherName: string;
  toChuyenMon: string;
  allowedClasses: string[];
  profile: TeacherProfileResult;
  teacherProfile: TeacherProfileResult;
}

export interface ContentPermissions {
  isOwner: boolean;
  isShared: boolean;
  canView: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canShare: boolean;
  sharedByName?: string;
  ownerName?: string;
  sharedByBadge?: string;
  sharePermission?: SharePermissionLevel;
}

/**
 * Resolve current user's RBAC access context (SSOT).
 * Fixes the bug where App.tsx's default `userRole = 'admin'` overrode a logged-in regular teacher's role.
 */
export function getCurrentAccessContext(propRole?: UserRole, explicitEmail?: string | null): AccessContext {
  if (propRole === 'student') {
    const emptyProfile = resolveCurrentTeacherProfile('');
    return {
      role: 'student',
      isAdmin: false,
      isTeacher: false,
      isStudent: true,
      uid: auth?.currentUser?.uid || '',
      teacherId: '',
      email: '',
      allEmails: [],
      name: '',
      teacherName: '',
      toChuyenMon: '',
      allowedClasses: [],
      profile: emptyProfile,
      teacherProfile: emptyProfile
    };
  }

  const activeEmail = (
    explicitEmail ||
    (auth && auth.currentUser ? auth.currentUser.email : null) ||
    (typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_email') : null) ||
    ''
  ).toLowerCase().trim();

  const profile = resolveCurrentTeacherProfile(activeEmail || undefined);

  // If a real teacher email is logged in, strictly use profile.userRole instead of propRole
  const effectiveRole: UserRole = activeEmail
    ? profile.userRole
    : (propRole === 'admin' ? 'admin' : profile.userRole);

  const isAdmin = effectiveRole === 'admin';
  const isTeacher = effectiveRole === 'teacher';

  const canonical = CANONICAL_TEACHER_DIRECTORY.find(
    c => c.id === profile.id || c.emails.includes(activeEmail) || c.emails.includes((profile.email || '').toLowerCase().trim())
  );

  const allEmails = Array.from(
    new Set(
      [
        activeEmail,
        (profile.email || '').toLowerCase().trim(),
        ...(canonical?.emails || [])
      ].filter(Boolean)
    )
  );

  const uid =
    (auth?.currentUser?.email?.toLowerCase().trim() === activeEmail ? auth?.currentUser?.uid : undefined) ||
    profile.uid ||
    canonical?.uid ||
    profile.id ||
    '';

  const rawClasses = [
    ...(profile.teachingClasses || []),
    ...(profile.homeroomClasses || []),
    ...(profile.lopDay || []),
    ...(Array.isArray(profile.lopChuNhiem)
      ? profile.lopChuNhiem
      : profile.lopChuNhiem
        ? [profile.lopChuNhiem]
        : [])
  ];

  const allowedClasses = Array.from(
    new Set(
      rawClasses
        .map(c => normalizeClassIdentifier(c))
        .filter(Boolean)
    )
  );

  const resolvedName = profile.name || canonical?.name || '';

  return {
    role: effectiveRole,
    isAdmin,
    isTeacher,
    isStudent: false,
    uid,
    teacherId: profile.id || canonical?.id || '',
    email: activeEmail || (profile.email || '').toLowerCase().trim(),
    allEmails,
    name: resolvedName,
    teacherName: resolvedName,
    toChuyenMon: normalizeDepartmentName(profile.toChuyenMon || canonical?.toChuyenMon || 'Tổ 1'),
    allowedClasses,
    profile,
    teacherProfile: profile
  };
}

/**
 * Normalize class identifier for consistent comparison (e.g., "LỚP 5C", "C-5C", "5c" -> "5C")
 */
export function normalizeClassIdentifier(cls?: string | null): string {
  if (!cls) return '';
  const trimmed = String(cls).trim();
  if (!trimmed || trimmed.toLowerCase() === 'tất cả' || trimmed.toLowerCase() === 'all') return '';
  return trimmed
    .replace(/^(LỚP|Lớp|lớp|CLASS|Class|C-|c-)\s*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * Check if a teacher has access to a given class's student data (submissions, scores, report cards, etc.)
 * Rule 4: Regular teachers only view student data for classes in their lopDay / lopChuNhiem.
 * Admin can view all classes.
 */
export function canTeacherAccessClass(className?: string | null, ctx?: AccessContext): boolean {
  const access = ctx || getCurrentAccessContext();
  if (access.isAdmin) return true;
  if (access.isStudent) return true;

  const targetNorm = normalizeClassIdentifier(className);
  if (!targetNorm) return false;

  if (access.allowedClasses.length === 0) return false;
  return access.allowedClasses.includes(targetNorm);
}

/**
 * Filter a list of class names (e.g., ['Lớp 1C', 'Lớp 1D', ...]) to only those the current teacher can access.
 */
export function filterAccessibleClasses(classes: string[], ctx?: AccessContext): string[] {
  const access = ctx || getCurrentAccessContext();
  if (access.isAdmin) return classes;
  return classes.filter(cls => canTeacherAccessClass(cls, access));
}

/**
 * Check if the current user is the owner of a content item.
 * Matches by ownerId (UID or teacherId), ownerEmail, teacherEmail, or teacherId.
 * Does NOT match by ambiguous name if ownerId or email belongs to someone else.
 */
export function isContentOwner(item: any, ctx?: AccessContext): boolean {
  if (!item) return false;
  const access = ctx || getCurrentAccessContext();
  if (access.isStudent) return false;

  const itemOwnerId = String(item.ownerId || '').trim();
  const itemOwnerEmail = String(item.ownerEmail || item.teacherEmail || item.email || '').toLowerCase().trim();
  const itemTeacherId = String(item.teacherId || '').trim();

  // 1. Match by ownerId (UID or gv-XX)
  if (itemOwnerId) {
    if (access.uid && itemOwnerId === access.uid) return true;
    if (access.teacherId && itemOwnerId === access.teacherId) return true;
    if (access.allEmails.includes(itemOwnerId.toLowerCase())) return true;
  }

  // 2. Match by ownerEmail / teacherEmail
  if (itemOwnerEmail && access.allEmails.includes(itemOwnerEmail)) {
    return true;
  }

  // 3. Match by teacherId ONLY when ownerId and ownerEmail are not pointing to another teacher
  if (!itemOwnerId && !itemOwnerEmail && itemTeacherId && access.teacherId && itemTeacherId === access.teacherId) {
    return true;
  }

  // 4. Legacy fallback: if item has no ownerId and no email, check authorName/teacherName against canonical profile
  if (!itemOwnerId && !itemOwnerEmail && !itemTeacherId) {
    const rawAuthor = String(item.ownerName || item.teacherName || item.authorName || item.createdBy || '').trim().toLowerCase();
    if (rawAuthor && access.name && rawAuthor === access.name.trim().toLowerCase()) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a content item has been explicitly shared with the current teacher
 * (via sharedWithTeachers or sharedWithGroups matching teacher's toChuyenMon).
 */
export function isContentSharedWithTeacher(item: any, ctx?: AccessContext): boolean {
  if (!item) return false;
  const access = ctx || getCurrentAccessContext();
  if (access.isStudent) return false;

  // Owner is not "shared receiver"
  if (isContentOwner(item, access)) return false;

  const sharedTeachers: string[] = Array.isArray(item.sharedWithTeachers)
    ? item.sharedWithTeachers.map((s: any) => String(s || '').trim())
    : [];
  const sharedTeachersLower = sharedTeachers.map(s => s.toLowerCase());

  // Check if teacher's UID, teacherId (gv-XX), or any email is in sharedWithTeachers
  if (access.uid && sharedTeachers.includes(access.uid)) return true;
  if (access.teacherId && sharedTeachers.includes(access.teacherId)) return true;
  if (access.allEmails.some(em => sharedTeachersLower.includes(em))) return true;

  // Check if teacher's department (toChuyenMon) is in sharedWithGroups
  const sharedGroups: string[] = Array.isArray(item.sharedWithGroups)
    ? item.sharedWithGroups.map((g: any) => normalizeDepartmentName(String(g || '')))
    : [];
  if (access.toChuyenMon && sharedGroups.includes(access.toChuyenMon)) {
    return true;
  }

  return false;
}

/**
 * Compute granular RBAC permissions for a content item.
 * Rules:
 * - Admin: full permissions on all items.
 * - Owner: full permissions on own items.
 * - Shared colleague:
 *   - 'view' -> canView = true, canEdit = false, canAssign = false
 *   - 'edit' -> canView = true, canEdit = true, canAssign = false
 *   - 'assign' -> canView = true, canEdit = true, canAssign = true
 *   - canDelete = true ONLY if item.allowDeleteByShared === true
 *   - canShare = false (only owner and admin can configure/revoke sharing)
 * - Unshared other teacher's item: all false!
 */
export function getContentPermissions(item: any, ctx?: AccessContext): ContentPermissions {
  const access = ctx || getCurrentAccessContext();

  if (!item) {
    return {
      isOwner: false,
      isShared: false,
      canView: false,
      canEdit: false,
      canAssign: false,
      canDelete: false,
      canShare: false
    };
  }

  const ownerCheck = isContentOwner(item, access);
  const sharedCheck = isContentSharedWithTeacher(item, access);
  const ownerDisplayName =
    item.ownerName ||
    item.teacherName ||
    item.authorName ||
    resolveOwnerNameFromItem(item) ||
    'Đồng nghiệp';

  if (access.isAdmin) {
    return {
      isOwner: ownerCheck,
      isShared: !ownerCheck && sharedCheck,
      canView: true,
      canEdit: true,
      canAssign: true,
      canDelete: true,
      canShare: true,
      sharedByName: !ownerCheck ? ownerDisplayName : undefined,
      ownerName: ownerDisplayName,
      sharedByBadge: !ownerCheck ? `Chia sẻ bởi ${ownerDisplayName}` : undefined,
      sharePermission: item.sharePermission || 'assign'
    };
  }

  if (ownerCheck) {
    return {
      isOwner: true,
      isShared: false,
      canView: true,
      canEdit: true,
      canAssign: true,
      canDelete: true,
      canShare: true,
      ownerName: ownerDisplayName,
      sharePermission: item.sharePermission || 'view'
    };
  }

  if (sharedCheck) {
    const level: SharePermissionLevel = item.sharePermission || 'view';
    const canEdit = level === 'edit' || level === 'assign';
    const canAssign = level === 'assign';
    const canDelete = Boolean(item.allowDeleteByShared);

    return {
      isOwner: false,
      isShared: true,
      canView: true,
      canEdit,
      canAssign,
      canDelete,
      canShare: false,
      sharedByName: ownerDisplayName,
      ownerName: ownerDisplayName,
      sharedByBadge: `Chia sẻ bởi ${ownerDisplayName}`,
      sharePermission: level
    };
  }

  return {
    isOwner: false,
    isShared: false,
    canView: false,
    canEdit: false,
    canAssign: false,
    canDelete: false,
    canShare: false,
    ownerName: ownerDisplayName
  };
}

export function resolveOwnerNameFromItem(item: any): string {
  if (!item) return 'Giáo viên';
  if (item.ownerName && String(item.ownerName).trim()) return String(item.ownerName).trim();
  if (item.teacherName && String(item.teacherName).trim()) return String(item.teacherName).trim();
  if (item.authorName && String(item.authorName).trim()) return String(item.authorName).trim();

  const email = String(item.ownerEmail || item.teacherEmail || '').toLowerCase().trim();
  if (email) {
    const canonical = CANONICAL_TEACHER_DIRECTORY.find(c => c.emails.includes(email));
    if (canonical) return canonical.name;
  }

  const ownerId = String(item.ownerId || item.teacherId || '').trim();
  if (ownerId) {
    const canonical = CANONICAL_TEACHER_DIRECTORY.find(c => c.uid === ownerId || c.id === ownerId);
    if (canonical) return canonical.name;
  }

  return 'Giáo viên';
}

export type ResourceFilterTab = 'all' | 'my' | 'mine' | 'colleague' | 'colleagues';

/**
 * Filter a list of content items according to the active tab and RBAC rules.
 * Accepts either (items, tab, ctx) or (items, ctx, tab).
 */
export function filterAccessibleItems<T>(
  items: T[],
  tabOrCtx: ResourceFilterTab | AccessContext = 'all',
  ctxOrTab?: AccessContext | ResourceFilterTab
): T[] {
  if (!Array.isArray(items)) return [];

  let tab: ResourceFilterTab = 'all';
  let access: AccessContext;

  if (typeof tabOrCtx === 'string') {
    tab = tabOrCtx;
    access = (ctxOrTab && typeof ctxOrTab === 'object') ? ctxOrTab : getCurrentAccessContext();
  } else {
    access = tabOrCtx || getCurrentAccessContext();
    tab = (typeof ctxOrTab === 'string') ? ctxOrTab : 'all';
  }

  if (access.isStudent) return items;

  return items.filter(item => {
    const perms = getContentPermissions(item, access);
    if (!perms.canView) return false;

    if (tab === 'my' || tab === 'mine') {
      return perms.isOwner;
    }
    if (tab === 'colleague' || tab === 'colleagues') {
      if (access.isAdmin) {
        return !perms.isOwner;
      }
      return perms.isShared;
    }
    // tab === 'all'
    return true;
  });
}

/**
 * Attach required ownership and sharing fields when creating or saving a content item.
 * IMPORTANT (Rule 7):
 * - Automatically attaches ownerId, ownerEmail, ownerName, toChuyenMon, sharedWithTeachers, sharedWithGroups, sharePermission.
 * - If editing an existing item that already has an ownerId, NEVER overwrite the original owner's metadata!
 */
export function attachOwnershipOnCreate<T extends Record<string, any>>(
  item: T,
  existingItem?: Record<string, any> | null,
  ctx?: AccessContext
): T {
  const access = ctx || getCurrentAccessContext();

  // If editing an existing item that already belongs to someone else, preserve its ownership fields intact!
  const sourceOwner = existingItem?.ownerId ? existingItem : (item.ownerId ? item : null);
  if (sourceOwner && sourceOwner.ownerId && !isContentOwner(sourceOwner, access)) {
    return {
      ...item,
      ownerId: sourceOwner.ownerId,
      ownerEmail: sourceOwner.ownerEmail || item.ownerEmail || item.teacherEmail || '',
      ownerName: sourceOwner.ownerName || item.ownerName || item.teacherName || item.authorName || '',
      toChuyenMon: sourceOwner.toChuyenMon || item.toChuyenMon || 'Tổ 1',
      teacherId: sourceOwner.teacherId || item.teacherId,
      teacherEmail: sourceOwner.teacherEmail || sourceOwner.ownerEmail || item.teacherEmail,
      teacherName: sourceOwner.teacherName || sourceOwner.ownerName || item.teacherName,
      authorName: sourceOwner.authorName || sourceOwner.ownerName || item.authorName,
      sharedWithTeachers: Array.isArray(sourceOwner.sharedWithTeachers)
        ? sourceOwner.sharedWithTeachers
        : Array.isArray(item.sharedWithTeachers)
          ? item.sharedWithTeachers
          : [],
      sharedWithGroups: Array.isArray(sourceOwner.sharedWithGroups)
        ? sourceOwner.sharedWithGroups
        : Array.isArray(item.sharedWithGroups)
          ? item.sharedWithGroups
          : [],
      sharePermission: sourceOwner.sharePermission || item.sharePermission || 'view',
      allowDeleteByShared: Boolean(sourceOwner.allowDeleteByShared ?? item.allowDeleteByShared ?? false)
    };
  }

  const effectiveOwnerId =
    existingItem?.ownerId ||
    item.ownerId ||
    access.uid ||
    access.teacherId ||
    'gv-10';
  const effectiveOwnerEmail = (
    existingItem?.ownerEmail ||
    item.ownerEmail ||
    access.email ||
    item.teacherEmail ||
    'thuthuthtk@gmail.com'
  ).toLowerCase().trim();
  const effectiveOwnerName =
    existingItem?.ownerName ||
    item.ownerName ||
    access.name ||
    item.teacherName ||
    item.authorName ||
    'Nguyễn Thị Thu';
  const effectiveDept = normalizeDepartmentName(
    existingItem?.toChuyenMon ||
    item.toChuyenMon ||
    access.toChuyenMon ||
    'Tổ 1'
  );

  return {
    ...item,
    ownerId: effectiveOwnerId,
    ownerEmail: effectiveOwnerEmail,
    ownerName: effectiveOwnerName,
    toChuyenMon: effectiveDept,
    teacherId: item.teacherId || access.teacherId || effectiveOwnerId,
    teacherEmail: item.teacherEmail || effectiveOwnerEmail,
    teacherName: item.teacherName || effectiveOwnerName,
    authorName: item.authorName || effectiveOwnerName,
    sharedWithTeachers: Array.isArray(item.sharedWithTeachers)
      ? item.sharedWithTeachers
      : Array.isArray(existingItem?.sharedWithTeachers)
        ? existingItem.sharedWithTeachers
        : [],
    sharedWithGroups: Array.isArray(item.sharedWithGroups)
      ? item.sharedWithGroups
      : Array.isArray(existingItem?.sharedWithGroups)
        ? existingItem.sharedWithGroups
        : [],
    sharePermission: (item.sharePermission || existingItem?.sharePermission || 'view') as SharePermissionLevel,
    allowDeleteByShared: Boolean(item.allowDeleteByShared ?? existingItem?.allowDeleteByShared ?? false)
  };
}

/**
 * Update sharing metadata on an item in Firestore and return the updated fields.
 */
export async function updateContentSharingInFirestore(
  collectionName: string,
  docId: string,
  sharingUpdate: {
    sharedWithTeachers: string[];
    sharedWithGroups: string[];
    sharePermission: SharePermissionLevel;
    allowDeleteByShared: boolean;
  }
): Promise<boolean> {
  if (!db || !docId) return false;
  try {
    const docRef = doc(db, collectionName, String(docId));
    await setDoc(
      docRef,
      {
        sharedWithTeachers: sharingUpdate.sharedWithTeachers,
        sharedWithGroups: sharingUpdate.sharedWithGroups,
        sharePermission: sharingUpdate.sharePermission,
        allowDeleteByShared: sharingUpdate.allowDeleteByShared,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    invalidateQueryCache(collectionName);
    return true;
  } catch (err) {
    console.error(`Lỗi khi cập nhật chia sẻ cho ${collectionName}/${docId}:`, err);
    return false;
  }
}

// ============================================================================
// 5-MINUTE QUERY CACHE & SCOPED FIRESTORE QUERIES (Rule 8)
// Max 20 docs per query source, no onSnapshot, 5-minute TTL cache
// ============================================================================
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const queryCache = new Map<string, { timestamp: number; data: any[] }>();

export function invalidateQueryCache(collectionName?: string): void {
  if (!collectionName) {
    queryCache.clear();
    return;
  }
  for (const key of Array.from(queryCache.keys())) {
    if (key.startsWith(`${collectionName}::`)) {
      queryCache.delete(key);
    }
  }
}

/**
 * Query a Firestore content collection respecting RBAC and quota constraints:
 * - Admin: reads up to maxLimit documents (default 100 for question bank, 20 for other modules).
 * - Regular Teacher: runs separate targeted queries:
 *   1. Own content (where ownerId == uid, where ownerEmail == email, where teacherEmail == email), limit 20 each
 *   2. Shared with teacher (where sharedWithTeachers array-contains uid/email/teacherId), limit 20
 *   3. Shared with department (where sharedWithGroups array-contains toChuyenMon), limit 20
 *   Merges & deduplicates in browser, caches for 5 minutes.
 */
export async function queryAccessibleCollection<T extends { id: string | number }>(
  collectionName: string,
  options?: {
    forceRefresh?: boolean;
    maxPerSource?: number;
    adminLimit?: number;
    ctx?: AccessContext;
  }
): Promise<T[]> {
  if (!db) return [];

  const access = options?.ctx || getCurrentAccessContext();
  const maxPerSource = options?.maxPerSource || 20;
  const adminLimit = options?.adminLimit || 100;
  const cacheKey = `${collectionName}::${access.role}::${access.email || access.uid || 'anon'}`;

  if (!options?.forceRefresh) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < QUERY_CACHE_TTL_MS) {
      return cached.data as T[];
    }
  }

  const colRef = collection(db, collectionName);
  const mergedMap = new Map<string, T>();

  const addSnapDocs = (snap: any) => {
    if (!snap || snap.empty) return;
    snap.forEach((docSnap: any) => {
      const data = docSnap.data();
      const id = data?.id || docSnap.id;
      mergedMap.set(String(id), { ...data, id } as T);
    });
  };

  try {
    if (access.isAdmin || access.isStudent) {
      const snap = await getDocs(query(colRef, limit(adminLimit)));
      addSnapDocs(snap);
    } else {
      // Regular teacher: execute scoped queries in parallel, max 20 docs per source
      const queriesToRun: Promise<any>[] = [];

      if (access.uid) {
        queriesToRun.push(
          getDocs(query(colRef, where('ownerId', '==', access.uid), limit(maxPerSource))).catch(() => null)
        );
        queriesToRun.push(
          getDocs(query(colRef, where('sharedWithTeachers', 'array-contains', access.uid), limit(maxPerSource))).catch(() => null)
        );
      }

      if (access.teacherId && access.teacherId !== access.uid) {
        queriesToRun.push(
          getDocs(query(colRef, where('ownerId', '==', access.teacherId), limit(maxPerSource))).catch(() => null)
        );
        queriesToRun.push(
          getDocs(query(colRef, where('sharedWithTeachers', 'array-contains', access.teacherId), limit(maxPerSource))).catch(() => null)
        );
      }

      for (const em of access.allEmails) {
        queriesToRun.push(
          getDocs(query(colRef, where('ownerEmail', '==', em), limit(maxPerSource))).catch(() => null)
        );
        queriesToRun.push(
          getDocs(query(colRef, where('teacherEmail', '==', em), limit(maxPerSource))).catch(() => null)
        );
        queriesToRun.push(
          getDocs(query(colRef, where('sharedWithTeachers', 'array-contains', em), limit(maxPerSource))).catch(() => null)
        );
      }

      if (access.toChuyenMon) {
        queriesToRun.push(
          getDocs(query(colRef, where('sharedWithGroups', 'array-contains', access.toChuyenMon), limit(maxPerSource))).catch(() => null)
        );
      }

      const snaps = await Promise.all(queriesToRun);
      snaps.forEach(addSnapDocs);
    }
  } catch (err) {
    console.warn(`Lỗi khi truy vấn phân quyền trên collection ${collectionName}:`, err);
  }

  // Final pass: ensure every returned item passes getContentPermissions(item).canView for teachers
  const resultList = Array.from(mergedMap.values()).filter(item => {
    if (access.isAdmin || access.isStudent) return true;
    return getContentPermissions(item, access).canView;
  });

  queryCache.set(cacheKey, {
    timestamp: Date.now(),
    data: resultList
  });

  return resultList;
}
