import {
  UserAccount,
  Lesson5EPlan,
  QuestionItem,
  ExamPaper,
  HomeworkAssignment,
  GameItem,
  ActivityLog
} from '../types';

export interface TeacherRecord {
  id: string;
  name: string;            // Họ và tên giáo viên
  email: string;           // Thư điện tử liên hệ
  role: string;            // Vai trò (Tổ trưởng, Giáo viên, Hiệu trưởng, Admin...)
  subject: string;         // Môn học phụ trách
  status: 'active' | 'locked'; // Trạng thái hoạt động
  dob?: string;            // Ngày sinh (dd/mm/yyyy)
  phone?: string;          // Số điện thoại (SĐT)
  sddcn?: string;          // Số định danh cá nhân (SĐDCN / CCCD)
  toChuyenMon: string;     // Tổ chuyên môn (Ban Giám Hiệu, Tổ 1, Tổ 2+3, Tổ 4+5, Tổ Chuyên biệt)
  nhomGvCn?: string;       // Nhóm GVCN / Phụ trách khối
  homeroomClasses?: string[]; // Danh sách lớp chủ nhiệm
  teachingClasses?: string[]; // Danh sách lớp giảng dạy bộ môn
  avatar?: string;         // Icon/Avatar
}

export const PRIMARY_SCHOOL_SUBJECTS = [
  'Tiếng Việt',
  'Toán',
  'Đạo đức',
  'Tự nhiên và Xã hội',
  'Khoa học',
  'Lịch sử và Địa lí',
  'Ngoại ngữ 1 (Tiếng Anh)',
  'Tin học',
  'Công nghệ',
  'Tin học (tự chọn)',
  'Giáo dục thể chất',
  'Mĩ thuật',
  'Âm nhạc',
  'Hoạt động trải nghiệm'
];

export const INITIAL_TEACHERS: TeacherRecord[] = [];

export const INITIAL_DASHBOARD_STATS = {
  totalStudents: 0,
  totalLessons: 0,
  totalExams: 0,
  totalQuestions: 0,
  pendingAssignments: 0,
  averageScore: 0,
};

// Đã dọn dẹp sạch toàn bộ mock data - tất cả các collection mặc định trống rỗng ([])
export const INITIAL_USERS: UserAccount[] = [];
export const INITIAL_LESSONS: Lesson5EPlan[] = [];
export const INITIAL_ASSIGNMENTS: HomeworkAssignment[] = [];
export const INITIAL_QUESTIONS: QuestionItem[] = [];
export const INITIAL_EXAMS: ExamPaper[] = [];
export const INITIAL_GAMES: GameItem[] = [];
export const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [];
