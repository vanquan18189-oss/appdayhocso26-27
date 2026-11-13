import { UserRole } from '../types';

export interface TeacherRecord {
  id: string;
  uid?: string;            // Firebase Auth UID (nếu đã liên kết)
  name: string;            // Họ và tên giáo viên (Ví dụ: Cô Hà Thị Trâm)
  email: string;           // Thư điện tử liên hệ
  role: string;            // Vai trò (Tổ trưởng, Giáo viên, Hiệu trưởng...)
  userRole?: UserRole;     // Vai trò phân quyền hệ thống ('admin' | 'teacher')
  subject: string;         // Môn học phụ trách
  status: 'active' | 'locked'; // Trạng thái hoạt động
  dob?: string;            // Ngày sinh (dd/mm/yyyy)
  phone?: string;          // Số điện thoại liên hệ (SĐT)
  sddcn?: string;          // Số định danh cá nhân (CCCD/CMND)
  toChuyenMon: string;     // Tổ chuyên môn (Tổ 1, Tổ 2, Tổ 3, Tổ 4, Tổ 5, Tổ Ban Giám Hiệu)
  nhomGvCn?: string;       // Nhóm Giáo viên chủ nhiệm / Phụ trách khối
  homeroomClasses?: string[]; // Danh sách lớp chủ nhiệm
  teachingClasses?: string[]; // Danh sách lớp giảng dạy bộ môn
  avatar?: string;         // Đường dẫn ảnh hoặc icon linh vật
  teachingAssignments?: Array<{ subject: string; classes: string[] }>;
  lopDay?: string[];
  lopChuNhiem?: string;
}

export interface CanonicalTeacherEntry {
  id: string;
  uid?: string;
  name: string;
  emails: string[];
  role: string;
  userRole: UserRole;
  toChuyenMon: string;
  subject: string;
  avatar: string;
  homeroomClasses: string[];
  teachingClasses: string[];
}

export const TEACHER_DEPARTMENTS = [
  'Tổ Ban Giám Hiệu',
  'Tổ 1',
  'Tổ 2',
  'Tổ 3',
  'Tổ 4',
  'Tổ 5'
] as const;

export type DepartmentName = typeof TEACHER_DEPARTMENTS[number];

export function normalizeDepartmentName(dept: string = '', teacher?: Partial<TeacherRecord>): string {
  const clean = (dept || '').trim();
  if (!clean) return 'Tổ 1';

  if (clean === 'Ban Giám Hiệu' || clean === 'Tổ Ban Giám Hiệu') return 'Tổ Ban Giám Hiệu';
  if (clean === 'Tổ 1') return 'Tổ 1';
  if (clean === 'Tổ 2') return 'Tổ 2';
  if (clean === 'Tổ 3') return 'Tổ 3';
  if (clean === 'Tổ 4') return 'Tổ 4';
  if (clean === 'Tổ 5') return 'Tổ 5';

  if (clean === 'Tổ 2+3') {
    const isGrade3 = teacher?.homeroomClasses?.some(c => c.includes('3')) || teacher?.subject?.includes('3');
    return isGrade3 ? 'Tổ 3' : 'Tổ 2';
  }

  if (clean === 'Tổ 4+5') {
    const isGrade5 = teacher?.homeroomClasses?.some(c => c.includes('5')) || teacher?.subject?.includes('5');
    return isGrade5 ? 'Tổ 5' : 'Tổ 4';
  }

  if (clean === 'Tổ Chuyên biệt') {
    return 'Tổ Ban Giám Hiệu';
  }

  return clean;
}

export const DEPARTMENTS_METADATA: Record<string, {
  slug: string;
  title: string;
  desc: string;
  defaultSubjects: string[];
  icon: string;
  badge: string;
  border: string;
  headerBg: string;
  statColor: string;
}> = {
  'Tổ Ban Giám Hiệu': {
    slug: 'to-bgh',
    title: 'Tổ Ban Giám Hiệu & Quản Trị Hệ Thống',
    desc: 'Cán bộ chỉ đạo chuyên môn toàn trường & Quản trị viên hệ thống RBAC',
    defaultSubjects: ['Quản lý giáo dục', 'Tin học & CNTT'],
    icon: '🏛️',
    badge: 'BGH & Admin',
    border: 'border-amber-200',
    headerBg: 'bg-gradient-to-r from-amber-500/10 via-amber-100/30 to-orange-50/20 text-amber-950',
    statColor: 'bg-amber-50 border-amber-200 text-amber-900'
  },
  'Tổ 1': {
    slug: 'to-1',
    title: 'Tổ Chuyên Môn 1 (Khối Lớp 1)',
    desc: 'Giáo viên phụ trách khối 1: Toán, Tiếng Việt & Hoạt động trải nghiệm',
    defaultSubjects: ['Toán', 'Tiếng Việt', 'Hoạt động trải nghiệm', 'Đạo đức', 'Tự nhiên & Xã hội'],
    icon: '📚',
    badge: 'Tổ Chuyên Môn 1',
    border: 'border-blue-200',
    headerBg: 'bg-gradient-to-r from-blue-500/10 via-blue-100/30 to-indigo-50/20 text-blue-950',
    statColor: 'bg-blue-50 border-blue-200 text-blue-900'
  },
  'Tổ 2': {
    slug: 'to-2',
    title: 'Tổ Chuyên Môn 2 (Khối Lớp 2)',
    desc: 'Giáo viên phụ trách khối 2: Toán, Tiếng Việt, Tự nhiên & Xã hội',
    defaultSubjects: ['Toán', 'Tiếng Việt', 'Hoạt động trải nghiệm', 'Đạo đức', 'Tự nhiên & Xã hội'],
    icon: '📖',
    badge: 'Tổ Chuyên Môn 2',
    border: 'border-emerald-200',
    headerBg: 'bg-gradient-to-r from-emerald-500/10 via-emerald-100/30 to-teal-50/20 text-emerald-950',
    statColor: 'bg-emerald-50 border-emerald-200 text-emerald-900'
  },
  'Tổ 3': {
    slug: 'to-3',
    title: 'Tổ Chuyên Môn 3 (Khối Lớp 3)',
    desc: 'Giáo viên phụ trách khối 3: Toán, Tiếng Việt, Tin học, Công nghệ, Tiếng Anh',
    defaultSubjects: ['Toán', 'Tiếng Việt', 'Tin học', 'Công nghệ', 'Tự nhiên & Xã hội', 'Tiếng Anh'],
    icon: '✏️',
    badge: 'Tổ Chuyên Môn 3',
    border: 'border-teal-200',
    headerBg: 'bg-gradient-to-r from-teal-500/10 via-teal-100/30 to-cyan-50/20 text-teal-950',
    statColor: 'bg-teal-50 border-teal-200 text-teal-900'
  },
  'Tổ 4': {
    slug: 'to-4',
    title: 'Tổ Chuyên Môn 4 (Khối Lớp 4)',
    desc: 'Giáo viên phụ trách khối 4: Khoa học, Lịch sử & Địa lý, Tiếng Anh, Tin học',
    defaultSubjects: ['Toán', 'Tiếng Việt', 'Khoa học', 'Lịch sử & Địa lý', 'Tiếng Anh', 'Tin học'],
    icon: '🔬',
    badge: 'Tổ Chuyên Môn 4',
    border: 'border-indigo-200',
    headerBg: 'bg-gradient-to-r from-indigo-500/10 via-indigo-100/30 to-blue-50/20 text-indigo-950',
    statColor: 'bg-indigo-50 border-indigo-200 text-indigo-900'
  },
  'Tổ 5': {
    slug: 'to-5',
    title: 'Tổ Chuyên Môn 5 (Khối Lớp 5)',
    desc: 'Giáo viên phụ trách khối 5: Khoa học, Lịch sử & Địa lý, Tiếng Anh, Tin học',
    defaultSubjects: ['Toán', 'Tiếng Việt', 'Khoa học', 'Lịch sử & Địa lý', 'Tiếng Anh', 'Tin học'],
    icon: '🎓',
    badge: 'Tổ Chuyên Môn 5',
    border: 'border-purple-200',
    headerBg: 'bg-gradient-to-r from-purple-500/10 via-purple-100/30 to-violet-50/20 text-purple-950',
    statColor: 'bg-purple-50 border-purple-200 text-purple-900'
  }
};

export const CANONICAL_TEACHER_DIRECTORY: CanonicalTeacherEntry[] = [
  {
    id: 'gv-01',
    uid: 'arI370SMMSPVGAfA00w6OBac89E2',
    name: 'Hà Thị Trâm',
    emails: ['tramduongtk@gmail.com', 'hathiram@gmail.com'],
    role: 'Tổ trưởng CM - GVCN Lớp 1D',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 1',
    subject: 'Toán & Tiếng Việt (Khối 1)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 1D'],
    teachingClasses: ['Lớp 1D']
  },
  {
    id: 'gv-02',
    name: 'Lưu Thị Minh',
    emails: ['minhich1980@gmail.com', 'luuminh@gmail.com'],
    role: 'Giáo viên bộ môn - Tổ 1',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 1',
    subject: 'Toán & Tiếng Việt (Khối 1)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 1C'],
    teachingClasses: ['Lớp 1C']
  },
  {
    id: 'gv-03',
    name: 'Bùi Thị Yến',
    emails: ['buiyen@gmail.com'],
    role: 'Giáo viên chủ nhiệm Lớp 2D',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 2',
    subject: 'Toán & Tiếng Việt (Khối 2)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 2D'],
    teachingClasses: ['Lớp 2D']
  },
  {
    id: 'gv-04',
    name: 'Phạm Thị Thanh Thảo',
    emails: ['phamthanhthaotk@gmail.com', 'thanhthao@gmail.com'],
    role: 'Giáo viên bộ môn - Tổ 3',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 3',
    subject: 'Toán & Tiếng Việt (Khối 3)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 3C'],
    teachingClasses: ['Lớp 3C']
  },
  {
    id: 'gv-05',
    name: 'Trần Hữu Ích',
    emails: ['tranhuuich@gmail.com'],
    role: 'Giáo viên chủ nhiệm Lớp 4D',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 4',
    subject: 'Toán & Tiếng Việt (Khối 4)',
    avatar: '👨‍🏫',
    homeroomClasses: ['Lớp 4D'],
    teachingClasses: ['Lớp 4D']
  },
  {
    id: 'gv-06',
    name: 'Trần Thị Diễm Hương',
    emails: ['diemhuong@gmail.com'],
    role: 'Giáo viên chủ nhiệm Lớp 5D',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 5',
    subject: 'Toán & Tiếng Việt (Khối 5)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 5D'],
    teachingClasses: ['Lớp 5D', 'Lớp 5C']
  },
  {
    id: 'gv-07',
    name: 'Nguyễn Thị Lê',
    emails: ['nguyenle@gmail.com'],
    role: 'Giáo viên chủ nhiệm Lớp 5C',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 5',
    subject: 'Toán & Tiếng Việt (Khối 5)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 5C'],
    teachingClasses: ['Lớp 5C']
  },
  {
    id: 'gv-08',
    name: 'Đặng Văn Hùng',
    emails: ['dangtanhung@gmail.com'],
    role: 'Hiệu trưởng - Quản trị viên',
    userRole: 'admin',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    subject: 'Quản lý giáo dục',
    avatar: '👨‍💼',
    homeroomClasses: [],
    teachingClasses: []
  },
  {
    id: 'gv-09',
    name: 'Đồng Thị Tâm',
    emails: ['dongtam@gmail.com'],
    role: 'Giáo viên bộ môn - Tổ 4',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 4',
    subject: 'Toán & Tiếng Việt (Khối 4)',
    avatar: '👩‍🏫',
    homeroomClasses: [],
    teachingClasses: ['Lớp 4C', 'Lớp 4D']
  },
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
    teachingClasses: [
      'Lớp 1C', 'Lớp 1D', 'Lớp 2C', 'Lớp 2D', 'Lớp 3C',
      'Lớp 3D', 'Lớp 4C', 'Lớp 4D', 'Lớp 5C', 'Lớp 5D'
    ]
  },
  {
    id: 'gv-11',
    name: 'Thầy Nguyễn Văn Quân',
    emails: ['vanquan18189@gmail.com'],
    role: 'Quản trị viên (ADMIN)',
    userRole: 'admin',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    subject: 'Tin học & Khoa học',
    avatar: '👨‍🏫',
    homeroomClasses: [],
    teachingClasses: [
      'Lớp 1C', 'Lớp 1D', 'Lớp 2C', 'Lớp 2D', 'Lớp 3C',
      'Lớp 3D', 'Lớp 4C', 'Lớp 4D', 'Lớp 5C', 'Lớp 5D'
    ]
  },
  {
    id: 'gv-12',
    name: 'Bùi Thị Tuyến',
    emails: ['buituyentk@gmail.com'],
    role: 'Giáo viên bộ môn - Tổ 3',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 3',
    subject: 'Toán & Tiếng Việt (Khối 3)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 2C'],
    teachingClasses: ['Lớp 2C', 'Lớp 3C']
  },
  {
    id: 'gv-13',
    name: 'Đồng Thị Tâm Anh',
    emails: ['dongtam79tk@gmail.com'],
    role: 'Quản trị viên (ADMIN)',
    userRole: 'admin',
    toChuyenMon: 'Tổ 5',
    subject: 'Tiếng Anh & Tin học',
    avatar: '👩‍🏫',
    homeroomClasses: [],
    teachingClasses: ['Lớp 3C', 'Lớp 3D', 'Lớp 4C', 'Lớp 4D', 'Lớp 5C', 'Lớp 5D']
  },
  {
    id: 'gv-14',
    name: 'Đỗ Thị Xuân',
    emails: ['xuand7072@gmail.com'],
    role: 'Giáo viên chủ nhiệm Lớp 3D',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 3',
    subject: 'Toán & Tiếng Việt (Khối 3)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 3D'],
    teachingClasses: ['Lớp 3D']
  },
  {
    id: 'gv-15',
    name: 'Nguyễn Thị Thảo',
    emails: ['nguyenthao88trang@gmail.com'],
    role: 'Giáo viên chủ nhiệm Lớp 4C',
    userRole: 'teacher',
    toChuyenMon: 'Tổ 4',
    subject: 'Toán & Tiếng Việt (Khối 4)',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 4C'],
    teachingClasses: ['Lớp 4C']
  }
];

export function getCanonicalTeacherDirectory(): CanonicalTeacherEntry[] {
  return CANONICAL_TEACHER_DIRECTORY;
}

export const initialTeachersList: TeacherRecord[] = [
  {
    id: 'gv-01',
    name: 'Hà Thị Trâm',
    email: 'hathiram@gmail.com',
    role: 'Tổ trưởng chuyên môn',
    subject: 'Toán & Tiếng Việt (Khối 1)',
    status: 'active',
    dob: '15/08/1985',
    phone: '0982957979',
    sddcn: '036175020668',
    toChuyenMon: 'Tổ 1',
    nhomGvCn: 'GVCN Lớp 1A - Trưởng nhóm Khối 1',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-02',
    name: 'Lưu Thị Minh',
    email: 'luuminh@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Tiếng Việt & Đạo đức',
    status: 'active',
    dob: '22/11/1990',
    phone: '0912345678',
    sddcn: '038316001234',
    toChuyenMon: 'Tổ 1',
    nhomGvCn: 'Thành viên Khối 1',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-03',
    name: 'Bùi Thị Yến',
    email: 'buiyen@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Toán & Tự nhiên Xã hội',
    status: 'active',
    dob: '10/05/1988',
    phone: '0978123456',
    sddcn: '034189004567',
    toChuyenMon: 'Tổ 2',
    nhomGvCn: 'GVCN Lớp 2A - Nhóm Khối 2',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-04',
    name: 'Phạm Thị Thanh Thảo',
    email: 'thanhthao@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Công nghệ & Tin học',
    status: 'active',
    dob: '05/09/1992',
    phone: '0935678912',
    sddcn: '031192008910',
    toChuyenMon: 'Tổ 3',
    nhomGvCn: 'GVCN Lớp 3A - Nhóm Khối 3',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-05',
    name: 'Trần Hữu Ích',
    email: 'tranhuuich@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Khoa học & Lịch sử Địa lý',
    status: 'active',
    dob: '12/12/1984',
    phone: '0905123789',
    sddcn: '030184003456',
    toChuyenMon: 'Tổ 4',
    nhomGvCn: 'GVCN Lớp 4A - Nhóm Khối 4',
    avatar: '👨‍🏫'
  },
  {
    id: 'gv-06',
    name: 'Trần Thị Diễm Hương',
    email: 'diemhuong@gmail.com',
    role: 'Tổ trưởng chuyên môn',
    subject: 'Toán & Tiếng Việt (Khối 5)',
    status: 'active',
    dob: '28/03/1983',
    phone: '0979888777',
    sddcn: '032183009988',
    toChuyenMon: 'Tổ 5',
    nhomGvCn: 'GVCN Lớp 5D - Trưởng nhóm Khối 5',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 5D', 'Lớp 5C'],
    teachingClasses: ['Lớp 5D', 'Lớp 5C']
  },
  {
    id: 'gv-07',
    name: 'Nguyễn Thị Lê',
    email: 'nguyenle@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Tiếng Anh',
    status: 'active',
    dob: '19/07/1995',
    phone: '0963111222',
    sddcn: '037195001122',
    toChuyenMon: 'Tổ 5',
    nhomGvCn: 'Thành viên Khối 5',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-08',
    name: 'Đặng Văn Hùng',
    email: 'dangtanhung@gmail.com',
    role: 'Hiệu trưởng (BGH)',
    subject: 'Quản lý & Giảng dạy',
    status: 'active',
    dob: '02/01/1978',
    phone: '0913000999',
    sddcn: '030178001100',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    nhomGvCn: 'Ban Giám Hiệu Nhà Trường',
    avatar: '👨‍💼'
  },
  {
    id: 'gv-09',
    name: 'Đồng Thị Tâm',
    email: 'dongtam@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Âm nhạc & Mỹ thuật',
    status: 'active',
    dob: '25/10/1991',
    phone: '0988555444',
    sddcn: '035191007788',
    toChuyenMon: 'Tổ 4',
    nhomGvCn: 'Nhóm GV Chuyên (Nghệ thuật)',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-10',
    name: 'Nguyễn Thị Thu',
    email: 'thuthuthtk@gmail.com',
    role: 'Quản trị viên (ADMIN)',
    subject: 'Tin học & CNTT',
    status: 'active',
    dob: '01/01/1989',
    phone: '0982957979',
    sddcn: '036189005566',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    nhomGvCn: 'Quản trị hệ thống Dạy và Học Số PK Trực Khang',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-11',
    name: 'Thầy Nguyễn Văn Quân',
    email: 'vanquan18189@gmail.com',
    role: 'Tổ trưởng chuyên môn & Quản trị',
    subject: 'Tin học & Khoa học',
    status: 'active',
    dob: '18/01/1989',
    phone: '0985608063',
    sddcn: '038189001889',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    nhomGvCn: 'Phụ trách Khối 3 & Tin học Nhà Trường',
    avatar: '👨‍🏫'
  },
  {
    id: 'gv-12',
    name: 'Bùi Thị Tuyến',
    email: 'buituyentk@gmail.com',
    role: 'Tổ trưởng chuyên môn',
    subject: 'Toán & Tiếng Việt (Khối 2+3)',
    status: 'active',
    dob: '14/06/1987',
    phone: '0983112233',
    sddcn: '034187002233',
    toChuyenMon: 'Tổ 3',
    nhomGvCn: 'GVCN Lớp 2B - Tổ trưởng 2+3',
    avatar: '👩‍🏫'
  }
];
