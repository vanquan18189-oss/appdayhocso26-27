/**
 * Tiện ích Quản lý và Phân quyền Người dùng (Permissions Utility)
 * 
 * Cung cấp các hàm kiểm tra quyền truy cập và phân công lớp học dùng chung cho toàn bộ hệ thống:
 * - Admin: Luôn có toàn quyền trên toàn bộ các lớp, học bạ, đề thi, bài tập và cấu hình.
 * - Giáo viên: Phân quyền theo lớp chủ nhiệm (lopChuNhiem) và danh sách lớp giảng dạy bộ môn (lopDay).
 * 
 * Tương thích ngược 100%: Giáo viên cũ chưa có trường mới tự động được xem là mảng rỗng [] / chuỗi rỗng "".
 */

import { UserRole, TeacherRecord } from '../types';

/**
 * Kiểu dữ liệu hồ sơ người dùng / giáo viên dùng cho phân quyền
 */
export interface UserPermissionsProfile {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  userRole?: UserRole | string;
  isSystemAdmin?: boolean;
  lopDay?: string[]; // Mảng tên các lớp được phân công dạy (ví dụ: ["5C", "4A"])
  lopChuNhiem?: string; // Tên lớp được phân công làm chủ nhiệm (ví dụ: "5C", hoặc "" nếu không có)
  // Các trường dự phòng tương thích dữ liệu cũ
  teachingClasses?: string[];
  homeroomClasses?: string[];
  nhomGvCn?: string;
  teachingAssignments?: Array<{ subject?: string; classes?: string[] }>;
  [key: string]: any;
}

/**
 * Chuẩn hóa tên lớp học về dạng viết gọn thống nhất (ví dụ: "Lớp 5C" -> "5C", "5c" -> "5C", "  4A  " -> "4A")
 */
export function normalizeClassName(lop?: string | null): string {
  if (!lop || typeof lop !== 'string') return '';
  return lop.trim().replace(/^Lớp\s*/i, '').toUpperCase();
}

/**
 * Kiểm tra xem người dùng có phải là Quản trị viên (Admin) hay không.
 * Quản trị viên luôn có toàn quyền trong toàn bộ hệ thống.
 * 
 * @param user Đối tượng hồ sơ người dùng, giáo viên hoặc chuỗi vai trò
 * @returns true nếu là Admin, false nếu không phải
 */
export function isAdmin(user?: UserPermissionsProfile | TeacherRecord | string | null): boolean {
  if (!user) return false;

  // Nếu truyền trực tiếp chuỗi vai trò
  if (typeof user === 'string') {
    const cleanRole = user.trim().toLowerCase();
    return cleanRole === 'admin' || cleanRole.includes('quản trị') || cleanRole.includes('hiệu trưởng');
  }

  // 1. Kiểm tra trường userRole
  if (user.userRole === 'admin') return true;

  // 2. Kiểm tra cờ isSystemAdmin
  if ('isSystemAdmin' in user && (user as any).isSystemAdmin === true) return true;

  // 3. Kiểm tra trường vai trò văn bản (role)
  if (typeof user.role === 'string') {
    const roleLower = user.role.toLowerCase();
    if (
      roleLower.includes('admin') ||
      roleLower.includes('quản trị') ||
      roleLower.includes('hiệu trưởng')
    ) {
      return true;
    }
  }

  // 4. Whitelist Super Admin theo email xác thực
  if (typeof user.email === 'string') {
    const emailLower = user.email.trim().toLowerCase();
    if (
      emailLower === 'vanquan18189@gmail.com' ||
      emailLower === 'thuthuthtk@gmail.com' ||
      emailLower.includes('vanquan18189') ||
      emailLower.includes('thuthuthtk')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Kiểm tra xem người dùng có phải là Giáo viên hay không.
 * (Admin cũng được xem là có toàn quyền của giáo viên).
 * 
 * @param user Đối tượng người dùng hoặc chuỗi vai trò
 * @returns true nếu là giáo viên hoặc admin, false nếu là học sinh hoặc không xác định
 */
export function isTeacher(user?: UserPermissionsProfile | TeacherRecord | string | null): boolean {
  if (!user) return false;

  // Admin luôn có toàn quyền và được tính là giáo viên quản trị
  if (isAdmin(user)) return true;

  if (typeof user === 'string') {
    const clean = user.trim().toLowerCase();
    return clean === 'teacher' || clean.includes('giáo viên') || clean.includes('gv');
  }

  if (user.userRole === 'teacher') return true;
  if (user.userRole === 'student') return false;

  if (typeof user.role === 'string') {
    const roleLower = user.role.toLowerCase();
    if (
      roleLower.includes('giáo viên') ||
      roleLower.includes('bộ môn') ||
      roleLower.includes('chủ nhiệm') ||
      roleLower.includes('teacher')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Lấy danh sách các lớp được phân công dạy bộ môn của giáo viên (chuẩn hóa dạng ["5C", "4A"]).
 * Giáo viên cũ chưa có trường này thì xem như mảng rỗng [].
 * 
 * @param user Đối tượng giáo viên
 * @returns Mảng tên các lớp được dạy (đã chuẩn hóa viết hoa)
 */
export function getLopDay(user?: UserPermissionsProfile | TeacherRecord | null): string[] {
  if (!user) return [];

  const rawList: string[] = [];

  // 1. Ưu tiên trường mới 'lopDay'
  if (Array.isArray(user.lopDay) && user.lopDay.length > 0) {
    rawList.push(...user.lopDay);
  } else {
    // 2. Dự phòng tương thích ngược với các trường cũ nếu có
    if (Array.isArray(user.teachingClasses) && user.teachingClasses.length > 0) {
      rawList.push(...user.teachingClasses);
    }
    if (Array.isArray(user.teachingAssignments)) {
      user.teachingAssignments.forEach((item) => {
        if (item && Array.isArray(item.classes)) {
          rawList.push(...item.classes);
        }
      });
    }
  }

  // Chuẩn hóa và khử trùng lặp
  const normalizedSet = new Set<string>();
  rawList.forEach((cls) => {
    const norm = normalizeClassName(cls);
    if (norm) normalizedSet.add(norm);
  });

  return Array.from(normalizedSet);
}

/**
 * Lấy tên lớp chủ nhiệm của giáo viên (chuẩn hóa dạng chuỗi, ví dụ: "5C").
 * Giáo viên cũ chưa có trường này hoặc không chủ nhiệm thì xem như chuỗi rỗng "".
 * 
 * @param user Đối tượng giáo viên
 * @returns Tên lớp chủ nhiệm (chuỗi chuẩn hóa viết hoa, ví dụ "5C", hoặc "" nếu không có)
 */
export function getLopChuNhiem(user?: UserPermissionsProfile | TeacherRecord | null): string {
  if (!user) return '';

  // 1. Ưu tiên trường mới 'lopChuNhiem'
  if (typeof user.lopChuNhiem === 'string' && user.lopChuNhiem.trim()) {
    return normalizeClassName(user.lopChuNhiem);
  }

  // 2. Dự phòng tương thích ngược với mảng 'homeroomClasses' cũ
  if (Array.isArray(user.homeroomClasses) && user.homeroomClasses.length > 0) {
    const firstHomeroom = user.homeroomClasses[0];
    if (typeof firstHomeroom === 'string' && firstHomeroom.trim()) {
      return normalizeClassName(firstHomeroom);
    }
  }

  // 3. Dự phòng tương thích ngược với 'nhomGvCn' cũ (nếu chứa tên lớp)
  if (typeof user.nhomGvCn === 'string' && user.nhomGvCn.trim()) {
    const norm = normalizeClassName(user.nhomGvCn);
    if (norm) return norm;
  }

  return '';
}

/**
 * Kiểm tra xem người dùng có quyền quản lý một lớp học cụ thể hay không.
 * - Admin: Luôn trả về true (toàn quyền).
 * - Giáo viên: Có quyền nếu lớp đó là lớp chủ nhiệm hoặc nằm trong danh sách lớp dạy bộ môn.
 * 
 * @param user Đối tượng người dùng / giáo viên
 * @param lop Tên lớp học cần kiểm tra (ví dụ: "5C", "Lớp 5C", "4A")
 * @returns true nếu có quyền quản lý lớp, false nếu không
 */
export function canManageClass(
  user?: UserPermissionsProfile | TeacherRecord | null,
  lop?: string | null
): boolean {
  if (!user) return false;

  // Admin luôn có toàn quyền với mọi lớp
  if (isAdmin(user)) return true;

  if (!lop) return false;

  const target = normalizeClassName(lop);
  if (!target) return false;

  // Kiểm tra nếu là lớp chủ nhiệm
  const homeroom = getLopChuNhiem(user);
  if (homeroom && homeroom === target) {
    return true;
  }

  // Kiểm tra nếu nằm trong danh sách lớp dạy bộ môn
  const teaching = getLopDay(user);
  if (teaching.includes(target)) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra xem người dùng có quyền xem Học Bạ Số của một lớp học cụ thể hay không.
 * - Admin: Luôn trả về true (toàn quyền).
 * - Giáo viên: Có quyền xem học bạ nếu lớp đó là lớp chủ nhiệm hoặc nằm trong danh sách lớp dạy bộ môn.
 * 
 * @param user Đối tượng người dùng / giáo viên
 * @param lop Tên lớp học cần kiểm tra (ví dụ: "5C", "Lớp 5C"). Nếu để trống, kiểm tra xem giáo viên có phụ trách bất kỳ lớp nào không.
 * @returns true nếu có quyền xem học bạ, false nếu không
 */
export function canViewHocBa(
  user?: UserPermissionsProfile | TeacherRecord | null,
  lop?: string | null
): boolean {
  if (!user) return false;

  // Admin luôn có toàn quyền xem học bạ mọi lớp
  if (isAdmin(user)) return true;

  // Nếu không truyền lớp cụ thể: Cho phép vào phân hệ nếu giáo viên có ít nhất 1 lớp phụ trách
  if (!lop) {
    const homeroom = getLopChuNhiem(user);
    const teaching = getLopDay(user);
    return Boolean(homeroom) || teaching.length > 0;
  }

  const target = normalizeClassName(lop);
  if (!target) return false;

  // Giáo viên chủ nhiệm lớp
  const homeroom = getLopChuNhiem(user);
  if (homeroom && homeroom === target) {
    return true;
  }

  // Giáo viên bộ môn dạy lớp
  const teaching = getLopDay(user);
  if (teaching.includes(target)) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra xem giáo viên có phải là Giáo viên Chủ nhiệm của lớp này hay không.
 * - Admin: Luôn trả về true.
 * - Giáo viên: true nếu lớp trùng với lopChuNhiem.
 */
export function isHomeroomTeacher(
  user?: UserPermissionsProfile | TeacherRecord | null,
  lop?: string | null
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (!lop) return false;
  return getLopChuNhiem(user) === normalizeClassName(lop);
}

/**
 * Kiểm tra xem giáo viên có phải là Giáo viên Dạy bộ môn của lớp này hay không.
 * - Admin: Luôn trả về true.
 * - Giáo viên: true nếu lớp nằm trong lopDay.
 */
export function isSubjectTeacher(
  user?: UserPermissionsProfile | TeacherRecord | null,
  lop?: string | null
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (!lop) return false;
  return getLopDay(user).includes(normalizeClassName(lop));
}

/**
 * Lấy toàn bộ danh sách lớp mà người dùng có quyền tiếp cận (gộp lớp chủ nhiệm + lớp dạy bộ môn).
 * - Admin: trả về toàn bộ danh sách các lớp nếu truyền allSystemClasses, hoặc danh sách rỗng nếu không truyền.
 */
export function getAllAccessibleClasses(
  user?: UserPermissionsProfile | TeacherRecord | null,
  allSystemClasses: string[] = []
): string[] {
  if (!user) return [];

  // Nếu là Admin và có danh sách tất cả các lớp của hệ thống -> trả về tất cả
  if (isAdmin(user) && allSystemClasses.length > 0) {
    return allSystemClasses.map(normalizeClassName).filter(Boolean);
  }

  const classesSet = new Set<string>();

  const homeroom = getLopChuNhiem(user);
  if (homeroom) classesSet.add(homeroom);

  const teaching = getLopDay(user);
  teaching.forEach((c) => classesSet.add(c));

  return Array.from(classesSet);
}
