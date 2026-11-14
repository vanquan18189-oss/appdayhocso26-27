import { TeacherRecord, UserRole } from '../types';

export type { TeacherRecord };

export type DepartmentName =
  | 'Tổ Ban Giám Hiệu'
  | 'Tổ 1'
  | 'Tổ 2+3'
  | 'Tổ 4+5'
  | 'Tổ Chuyên biệt'
  | 'Tổ Văn Phòng';

export const TEACHER_DEPARTMENTS: DepartmentName[] = [
  'Tổ Ban Giám Hiệu',
  'Tổ 1',
  'Tổ 2+3',
  'Tổ 4+5',
  'Tổ Chuyên biệt',
  'Tổ Văn Phòng'
];

export interface DepartmentMetadata {
  slug: string;
  title: string;
  icon: string;
  badge: string;
  border: string;
  headerBg: string;
  statColor: string;
  desc: string;
  defaultSubjects: string[];
}

export const DEPARTMENTS_METADATA: Record<DepartmentName, DepartmentMetadata> = {
  'Tổ Ban Giám Hiệu': {
    slug: 'ban-giam-hieu',
    title: 'Ban Giám Hiệu & Quản Trị',
    icon: '🏛️',
    badge: 'BGH',
    border: 'border-rose-200',
    headerBg: 'bg-gradient-to-r from-rose-500/10 via-rose-100/30 to-orange-50/20 text-rose-950',
    statColor: 'bg-rose-50/80 border-rose-200 text-rose-900',
    desc: 'Quản lý chung, phê duyệt chuyên môn và điều hành nhà trường.',
    defaultSubjects: ['Quản lý giáo dục', 'Tin học', 'Công nghệ']
  },
  'Tổ 1': {
    slug: 'to-1',
    title: 'Tổ Chuyên Môn Khối 1',
    icon: '🌱',
    badge: 'Khối 1',
    border: 'border-emerald-200',
    headerBg: 'bg-gradient-to-r from-emerald-500/10 via-emerald-100/30 to-teal-50/20 text-emerald-950',
    statColor: 'bg-emerald-50/80 border-emerald-200 text-emerald-900',
    desc: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 1.',
    defaultSubjects: ['Tiếng Việt', 'Toán', 'Đạo đức', 'Tự nhiên và Xã hội']
  },
  'Tổ 2+3': {
    slug: 'to-2-3',
    title: 'Tổ Chuyên Môn Khối 2 + 3',
    icon: '📘',
    badge: 'Khối 2-3',
    border: 'border-blue-200',
    headerBg: 'bg-gradient-to-r from-blue-500/10 via-blue-100/30 to-sky-50/20 text-blue-950',
    statColor: 'bg-blue-50/80 border-blue-200 text-blue-900',
    desc: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 2 và Khối 3.',
    defaultSubjects: ['Tiếng Việt', 'Toán', 'Tự nhiên và Xã hội', 'Tin học', 'Công nghệ']
  },
  'Tổ 4+5': {
    slug: 'to-4-5',
    title: 'Tổ Chuyên Môn Khối 4 + 5',
    icon: '🎓',
    badge: 'Khối 4-5',
    border: 'border-indigo-200',
    headerBg: 'bg-gradient-to-r from-indigo-500/10 via-indigo-100/30 to-purple-50/20 text-indigo-950',
    statColor: 'bg-indigo-50/80 border-indigo-200 text-indigo-900',
    desc: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 4 và Khối 5.',
    defaultSubjects: ['Tiếng Việt', 'Toán', 'Khoa học', 'Lịch sử và Địa lí', 'Tin học', 'Công nghệ']
  },
  'Tổ Chuyên biệt': {
    slug: 'to-chuyen-biet',
    title: 'Tổ Chuyên Biệt',
    icon: '🎨',
    badge: 'Chuyên biệt',
    border: 'border-amber-200',
    headerBg: 'bg-gradient-to-r from-amber-500/10 via-amber-100/30 to-yellow-50/20 text-amber-950',
    statColor: 'bg-amber-50/80 border-amber-200 text-amber-900',
    desc: 'Giáo viên Tiếng Anh, Tin học, Âm nhạc, Mĩ thuật, Giáo dục thể chất.',
    defaultSubjects: ['Tiếng Anh', 'Tin học', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất']
  },
  'Tổ Văn Phòng': {
    slug: 'to-van-phong',
    title: 'Tổ Văn Phòng & Hỗ Trợ',
    icon: '🗂️',
    badge: 'Văn phòng',
    border: 'border-slate-200',
    headerBg: 'bg-gradient-to-r from-slate-500/10 via-slate-100/30 to-slate-50/20 text-slate-900',
    statColor: 'bg-slate-50 border-slate-200 text-slate-800',
    desc: 'Nhân viên hành chính, thiết bị, thư viện và y tế học đường.',
    defaultSubjects: ['Hành chính', 'Thư viện', 'Thiết bị']
  }
};

export interface CanonicalTeacherEntry {
  id: string;
  uid?: string;
  name: string;
  emails: string[];
  role: string;
  userRole: UserRole;
  toChuyenMon: DepartmentName;
  subject: string;
  avatar?: string;
  homeroomClasses: string[];
  teachingClasses: string[];
}

export const CANONICAL_TEACHER_DIRECTORY: CanonicalTeacherEntry[] = [
  {
    id: 'gv-10',
    name: 'Nguyễn Thị Thu',
    emails: ['thuthuthtk@gmail.com'],
    role: 'Quản trị viên (ADMIN)',
    userRole: 'admin',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    subject: 'Tin học & Công nghệ',
    avatar: '👩‍🏫',
    homeroomClasses: [],
    teachingClasses: ['Lớp 3C', 'Lớp 3D', 'Lớp 4C', 'Lớp 4D', 'Lớp 5C', 'Lớp 5D']
  },
  {
    id: 'gv-01',
    name: 'Hà Thị Trâm',
    emails: ['hatram@quanghungpk1.edu.vn'],
    role: 'Tổ trưởng Tổ 1',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 1',
    subject: 'Toán & Tiếng Việt',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 1C'],
    teachingClasses: ['Lớp 1C']
  },
  {
    id: 'gv-02',
    name: 'Lưu Thị Minh',
    emails: ['luuminh@quanghungpk1.edu.vn'],
    role: 'Giáo viên chủ nhiệm',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 1',
    subject: 'Toán & Tiếng Việt',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 1D'],
    teachingClasses: ['Lớp 1D']
  },
  {
    id: 'gv-03',
    name: 'Bùi Thị Yến',
    emails: ['buiyen@quanghungpk1.edu.vn'],
    role: 'Tổ trưởng Tổ 2+3',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 2+3',
    subject: 'Toán & Tiếng Việt',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 2C'],
    teachingClasses: ['Lớp 2C']
  },
  {
    id: 'gv-04',
    name: 'Bùi Thị Tuyến',
    emails: ['buituyen@quanghungpk1.edu.vn'],
    role: 'Giáo viên chủ nhiệm',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 2+3',
    subject: 'Toán & Tiếng Việt',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 2D'],
    teachingClasses: ['Lớp 2D']
  },
  {
    id: 'gv-05',
    name: 'Phạm Thị Thanh Thảo',
    emails: ['thanhthao@quanghungpk1.edu.vn'],
    role: 'Giáo viên chủ nhiệm',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 2+3',
    subject: 'Toán & Tiếng Việt',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 3C'],
    teachingClasses: ['Lớp 3C']
  },
  {
    id: 'gv-06',
    name: 'Nguyễn Văn Quân',
    emails: ['vanquan18189@gmail.com'],
    role: 'Quản trị viên (ADMIN)',
    userRole: 'admin',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    subject: 'Tin học & Toán',
    avatar: '👨‍🏫',
    homeroomClasses: ['Lớp 3D'],
    teachingClasses: ['Lớp 3D']
  },
  {
    id: 'gv-07',
    name: 'Trần Hữu Ích',
    emails: ['tranhuuich@quanghungpk1.edu.vn'],
    role: 'Giáo viên chủ nhiệm',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 4+5',
    subject: 'Toán & Tiếng Việt',
    avatar: '👨‍🏫',
    homeroomClasses: ['Lớp 4C'],
    teachingClasses: ['Lớp 4C']
  },
  {
    id: 'gv-08',
    name: 'Đồng Thị Tâm',
    emails: ['dongtam79tk@gmail.com'],
    role: 'Giáo viên chủ nhiệm',
    userRole: 'admin',
    toChuyenMon: 'Tổ Chuyên biệt',
    subject: 'Âm nhạc & Mĩ thuật',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 4D'],
    teachingClasses: ['Lớp 4D']
  },
  {
    id: 'gv-09',
    name: 'Trần Thị Diễm Hương',
    emails: ['diemhuong@quanghungpk1.edu.vn'],
    role: 'Tổ trưởng Tổ 4+5',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 4+5',
    subject: 'Toán & Tiếng Việt',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 5C', 'Lớp 5D'],
    teachingClasses: ['Lớp 5C', 'Lớp 5D']
  }
];

export function getCanonicalTeacherDirectory(): CanonicalTeacherEntry[] {
  return CANONICAL_TEACHER_DIRECTORY;
}

export const initialTeachersList: TeacherRecord[] = CANONICAL_TEACHER_DIRECTORY.map((c) => ({
  id: c.id,
  uid: c.uid,
  name: c.name,
  email: c.emails[0] || `${c.id}@quanghungpk1.edu.vn`,
  role: c.role,
  userRole: c.userRole,
  subject: c.subject,
  status: 'active',
  toChuyenMon: c.toChuyenMon,
  homeroomClasses: c.homeroomClasses,
  teachingClasses: c.teachingClasses,
  lopChuNhiem: c.homeroomClasses[0] || '',
  lopDay: c.teachingClasses,
  avatar: c.avatar || '👩‍🏫'
}));

export function normalizeDepartmentName(
  dept?: string | null,
  teacher?: Partial<TeacherRecord>
): DepartmentName {
  const raw = (dept || '').trim().toLowerCase();
  if (raw.includes('ban giám hiệu') || raw === 'bgh' || raw.includes('quản trị')) {
    return 'Tổ Ban Giám Hiệu';
  }
  if (raw === 'tổ 1' || raw.includes('khối 1') || raw === '1') {
    return 'Tổ 1';
  }
  if (raw.includes('2+3') || raw.includes('2 + 3') || raw.includes('khối 2') || raw.includes('khối 3')) {
    return 'Tổ 2+3';
  }
  if (raw.includes('4+5') || raw.includes('4 + 5') || raw.includes('khối 4') || raw.includes('khối 5')) {
    return 'Tổ 4+5';
  }
  if (raw.includes('chuyên biệt') || raw.includes('năng khiếu') || raw.includes('tiếng anh')) {
    return 'Tổ Chuyên biệt';
  }
  if (raw.includes('văn phòng') || raw.includes('hành chính')) {
    return 'Tổ Văn Phòng';
  }

  const roleLower = (teacher?.role || '').toLowerCase();
  if (roleLower.includes('admin') || roleLower.includes('hiệu trưởng') || roleLower.includes('quản trị')) {
    return 'Tổ Ban Giám Hiệu';
  }
  return 'Tổ 1';
}
