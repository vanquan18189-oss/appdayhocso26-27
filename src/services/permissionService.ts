import { collection, getDocs, limit, query } from 'firebase/firestore';
import { auth, db } from './firebase';
import { SharePermissionLevel, UserRole } from '../types';
import { resolveCurrentTeacherProfile, TeacherProfileResult } from './teacherStorageService';

export interface AccessContext {
  userRole: UserRole;
  isAdmin: boolean;
  isStudent: boolean;
  email: string;
  teacherId: string;
  teacherName: string;
  toChuyenMon: string;
  allowedClasses: string[];
  teacherProfile: TeacherProfileResult;
}

export interface ContentPermissions {
  isOwner: boolean;
  isShared: boolean;
  ownerName: string;
  sharedByBadge?: string;
  sharePermission: SharePermissionLevel;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  canAssign: boolean;
}

function normalizeClassToken(cls?: string | null): string {
  return (cls || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^(lớp|lop|class|c-)\s*/i, '')
    .trim();
}

export function getCurrentAccessContext(
  userRoleInput?: UserRole,
  emailInput?: string | null
): AccessContext {
  const storedRole =
    typeof window !== 'undefined'
      ? (localStorage.getItem('eduplay_user_role') as UserRole | null)
      : null;

  const userRole: UserRole = userRoleInput || storedRole || 'teacher';
  const isStudent = userRole === 'student';

  const effectiveEmail = (
    emailInput ||
    auth?.currentUser?.email ||
    (typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_email') : null) ||
    ''
  )
    .toLowerCase()
    .trim();

  const teacherProfile = resolveCurrentTeacherProfile(effectiveEmail);
  const isAdmin =
    userRole === 'admin' ||
    (!isStudent && teacherProfile.userRole === 'admin');

  const rawClasses = [
    ...(teacherProfile.homeroomClasses || []),
    ...(teacherProfile.teachingClasses || []),
    ...(teacherProfile.lopDay || []),
    ...(teacherProfile.lopChuNhiem
      ? Array.isArray(teacherProfile.lopChuNhiem)
        ? teacherProfile.lopChuNhiem
        : [teacherProfile.lopChuNhiem]
      : [])
  ];

  const allowedClasses = Array.from(
    new Set(rawClasses.map((c) => String(c || '').trim()).filter(Boolean))
  );

  return {
    userRole,
    isAdmin,
    isStudent,
    email: effectiveEmail || teacherProfile.email || '',
    teacherId: teacherProfile.id || '',
    teacherName: teacherProfile.name || 'Giáo viên',
    toChuyenMon: teacherProfile.toChuyenMon || 'Tổ 1',
    allowedClasses,
    teacherProfile
  };
}

export function isContentOwner(item: any, ctx: AccessContext): boolean {
  if (!item || !ctx) return false;
  if (ctx.isAdmin) return true;

  const myEmail = (ctx.email || '').toLowerCase().trim();
  const myId = (ctx.teacherId || '').toLowerCase().trim();
  const myName = (ctx.teacherName || '').toLowerCase().trim();

  const itemOwnerId = (item.ownerId || item.teacherId || '').toLowerCase().trim();
  const itemEmail = (item.ownerEmail || item.teacherEmail || item.createdBy || '').toLowerCase().trim();
  const itemName = (item.ownerName || item.authorName || item.teacherName || '').toLowerCase().trim();

  if (myEmail && itemEmail && itemEmail === myEmail) return true;
  if (myId && itemOwnerId && itemOwnerId === myId) return true;
  if (myName && itemName && itemName === myName) return true;

  // Legacy items without explicit owner metadata default to accessible/editable by owner check fallback
  if (!itemOwnerId && !itemEmail && !itemName) return true;

  return false;
}

export function isContentSharedWithTeacher(item: any, ctx: AccessContext): boolean {
  if (!item || !ctx) return false;

  if (item.authorType === 'colleague' || item.isSharedPublicly) return true;

  const sharedTeachers: string[] = Array.isArray(item.sharedWithTeachers)
    ? item.sharedWithTeachers.map((s: any) => String(s || '').toLowerCase().trim())
    : [];
  const sharedGroups: string[] = Array.isArray(item.sharedWithGroups)
    ? item.sharedWithGroups.map((s: any) => String(s || '').toLowerCase().trim())
    : [];

  const myEmail = (ctx.email || '').toLowerCase().trim();
  const myId = (ctx.teacherId || '').toLowerCase().trim();
  const myDept = (ctx.toChuyenMon || '').toLowerCase().trim();

  if (myEmail && sharedTeachers.includes(myEmail)) return true;
  if (myId && sharedTeachers.includes(myId)) return true;
  if (myDept && sharedGroups.includes(myDept)) return true;
  if (sharedGroups.includes('all') || sharedGroups.includes('toan_truong')) return true;

  return false;
}

export function getContentPermissions(item: any, ctx: AccessContext): ContentPermissions {
  const isOwner = isContentOwner(item, ctx);
  const isShared = isContentSharedWithTeacher(item, ctx);
  const ownerName =
    item?.ownerName || item?.authorName || item?.teacherName || 'Đồng nghiệp';
  const sharePermission: SharePermissionLevel = item?.sharePermission || 'assign';

  if (ctx.isAdmin) {
    return {
      isOwner: true,
      isShared,
      ownerName,
      sharedByBadge: undefined,
      sharePermission: 'assign',
      canView: true,
      canEdit: true,
      canDelete: true,
      canShare: true,
      canAssign: true
    };
  }

  if (ctx.isStudent) {
    return {
      isOwner: false,
      isShared: false,
      ownerName,
      sharedByBadge: undefined,
      sharePermission: 'view',
      canView: true,
      canEdit: false,
      canDelete: false,
      canShare: false,
      canAssign: false
    };
  }

  if (isOwner) {
    return {
      isOwner: true,
      isShared,
      ownerName,
      sharedByBadge: undefined,
      sharePermission: 'assign',
      canView: true,
      canEdit: true,
      canDelete: true,
      canShare: true,
      canAssign: true
    };
  }

  // Shared content or school bank visibility
  const canEdit = isShared && (sharePermission === 'edit' || sharePermission === 'assign');
  const canAssign = isShared ? sharePermission === 'assign' || sharePermission === 'edit' : true;
  const canDelete = Boolean(isShared && item?.allowDeleteByShared);

  return {
    isOwner: false,
    isShared: isShared || true,
    ownerName,
    sharedByBadge: `Chia sẻ bởi ${ownerName}`,
    sharePermission,
    canView: true,
    canEdit,
    canDelete,
    canShare: false,
    canAssign
  };
}

export type ResourceFilterTab = 'my' | 'mine' | 'colleague' | 'colleagues' | 'all';

export function filterAccessibleItems<T>(
  items: T[],
  tabOrCtx: ResourceFilterTab | AccessContext,
  ctxOrTab?: AccessContext | ResourceFilterTab
): T[] {
  if (!Array.isArray(items)) return [];

  let rawTab: ResourceFilterTab = 'all';
  let ctx: AccessContext;

  if (typeof tabOrCtx === 'string') {
    rawTab = tabOrCtx;
    ctx =
      ctxOrTab && typeof ctxOrTab === 'object'
        ? ctxOrTab
        : getCurrentAccessContext();
  } else {
    ctx = tabOrCtx || getCurrentAccessContext();
    rawTab = typeof ctxOrTab === 'string' ? ctxOrTab : 'all';
  }

  const tab = rawTab === 'mine' ? 'my' : rawTab === 'colleagues' ? 'colleague' : rawTab;

  if (tab === 'my') {
    if (ctx.isAdmin) {
      // Show items created by this admin or without another owner
      return items.filter((item: any) => {
        const email = (item?.ownerEmail || item?.teacherEmail || '').toLowerCase().trim();
        const id = (item?.ownerId || item?.teacherId || '').toLowerCase().trim();
        if (!email && !id) return true;
        return (
          (ctx.email && email === ctx.email.toLowerCase()) ||
          (ctx.teacherId && id === ctx.teacherId.toLowerCase())
        );
      });
    }
    return items.filter((item) => isContentOwner(item, ctx));
  }

  if (tab === 'colleague') {
    return items.filter((item: any) => {
      const email = (item?.ownerEmail || item?.teacherEmail || '').toLowerCase().trim();
      const id = (item?.ownerId || item?.teacherId || '').toLowerCase().trim();
      const strictlyMine =
        Boolean((ctx.email && email === ctx.email.toLowerCase()) || (ctx.teacherId && id === ctx.teacherId.toLowerCase()));
      return !strictlyMine;
    });
  }

  return items;
}

export function canTeacherAccessClass(
  className: string | undefined | null,
  ctx: AccessContext
): boolean {
  if (!ctx || ctx.isAdmin || ctx.isStudent) return true;
  if (!className) return true;
  if (ctx.allowedClasses.length === 0) return true;

  const target = normalizeClassToken(className);
  if (!target || target === 'tất cả' || target === 'all') return true;

  return ctx.allowedClasses.some((cls) => normalizeClassToken(cls) === target);
}

export function filterAccessibleClasses(classes: string[], ctx: AccessContext): string[] {
  if (!Array.isArray(classes)) return [];
  if (!ctx || ctx.isAdmin || ctx.isStudent || ctx.allowedClasses.length === 0) {
    return classes;
  }
  const filtered = classes.filter((cls) => canTeacherAccessClass(cls, ctx));
  return filtered.length > 0 ? filtered : classes;
}

export function attachOwnershipOnCreate<T extends Record<string, any>>(
  item: T,
  existing?: Partial<T> | null
): T {
  const ctx = getCurrentAccessContext();
  return {
    ...item,
    ownerId: existing?.ownerId || item.ownerId || item.teacherId || ctx.teacherId,
    ownerEmail: existing?.ownerEmail || item.ownerEmail || item.teacherEmail || ctx.email,
    ownerName: existing?.ownerName || item.ownerName || item.authorName || item.teacherName || ctx.teacherName,
    toChuyenMon: existing?.toChuyenMon || item.toChuyenMon || ctx.toChuyenMon
  };
}

const QUERY_CACHE: Record<string, { items: any[]; timestamp: number }> = {};
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateQueryCache(collectionName?: string): void {
  if (!collectionName) {
    Object.keys(QUERY_CACHE).forEach((k) => delete QUERY_CACHE[k]);
    return;
  }
  delete QUERY_CACHE[collectionName];
}

export async function queryAccessibleCollection<T>(
  collectionName: string,
  options?: { forceRefresh?: boolean; maxPerSource?: number; adminLimit?: number }
): Promise<T[]> {
  if (!db) return [];

  const cached = QUERY_CACHE[collectionName];
  if (
    !options?.forceRefresh &&
    cached &&
    Date.now() - cached.timestamp < QUERY_CACHE_TTL_MS
  ) {
    return cached.items as T[];
  }

  const ctx = getCurrentAccessContext();
  const fetchLimit = ctx.isAdmin
    ? options?.adminLimit || 100
    : options?.maxPerSource ? options.maxPerSource * 3 : 60;

  try {
    const colRef = collection(db, collectionName);
    const snap = await getDocs(query(colRef, limit(fetchLimit)));
    const items: T[] = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...(docSnap.data() as any) } as T);
    });
    QUERY_CACHE[collectionName] = {
      items,
      timestamp: Date.now()
    };
    return items;
  } catch (err) {
    console.warn(`Lỗi truy vấn collection ${collectionName}:`, err);
    return cached?.items || [];
  }
}
