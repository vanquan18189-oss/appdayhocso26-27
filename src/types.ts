export type UserRole = 'admin' | 'teacher' | 'student';

export type ActiveModule = 
  | 'dashboard'
  | 'lesson_5e'
  | 'exam_management'
  | 'assignment'
  | 'question_bank'
  | 'interactive_games'
  | 'user_management'
  | 'hoc_ba_so';

export type ModuleType = ActiveModule;

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  classGroup?: string;
  gradeClass?: string;
  subject?: string;
  status: 'active' | 'inactive';
  joinedDate?: string;
}

export interface Lesson5EStep {
  title: string;
  subtitle: string;
  objectives: string;
  teacherActivities: string;
  studentActivities: string;
  materials: string;
}

export interface FeedbackBlockConfig {
  id: string;
  levelTitle: string; // e.g. "HOÀN THÀNH XUẤT SẮC 🏆"
  useLaurelWreath: boolean;
  laurelWreathUrl?: string;
  backgroundImageUrl?: string;
  sticker: string;
  praiseTitle: string;
  praiseContent: string;
  teacherName: string;
}

export interface Lesson5EPlan {
  id: string;
  title: string;
  subject: string;
  grade: string;
  duration: string; // e.g. "45 phút"
  topic: string;
  authorName: string;
  teacherId?: string;
  teacherEmail?: string;
  createdBy?: string;
  createdAt: string;
  objectivesContent?: string;
  isObjectivesEnabled?: boolean;
  introContent?: string;
  isIntroEnabled?: boolean;
  stepEngage: Lesson5EStep;
  stepExplore: Lesson5EStep;
  stepElaborate: Lesson5EStep;
  stepEvaluate: Lesson5EStep;
  feedbackConfig?: {
    blocks: FeedbackBlockConfig[];
  };
}

export type CognitiveLevelKey = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'van_dung_cao';
export type QuestionLevel = CognitiveLevelKey;
export type CognitiveLevel =
  | CognitiveLevelKey
  | '1. Nhận biết'
  | '2. Thông hiểu'
  | '3. Vận dụng'
  | '4. Vận dụng cao';
export type QuestionType = 'multiple_choice' | 'essay' | 'true_false' | 'Lựa chọn' | 'Đúng / Sai' | 'Điền khuyết' | 'Ghép nối' | 'Tự luận ngắn' | string;

export type Subject = 'Công nghệ' | 'Tin học' | 'Toán học' | 'Tiếng Việt' | 'Khoa học tự nhiên' | 'Lịch sử & Địa lý' | 'Tiếng Anh' | string;
export type Grade = 'Khối 1' | 'Khối 2' | 'Khối 3' | 'Khối 4' | 'Khối 5' | 'Khối 6' | 'Khối 7' | 'Khối 8' | 'Khối 9' | string;

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface Question {
  id: string;
  code: string;
  type: QuestionType;
  subject: Subject;
  grade: Grade;
  level: CognitiveLevel;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  explanation?: string;
  createdAt: string;
  author?: string;
  tags?: string[];
}

export interface TrueFalseStatement {
  statement: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface ClassificationItem {
  name: string;
  group: string; // group name or index
}

export interface QuestionItem {
  id: string;
  code: string;
  subject: string;
  grade: string;
  level: CognitiveLevel;
  type: QuestionType;
  content: string;
  lessonName?: string; // Topic / Lesson Name
  options?: string[]; // 4 choices for multiple choice: [A, B, C, D] or ordering steps
  order?: number[]; // Ordering indices
  indices?: number[]; // Ordering indices
  correctOrder?: string[]; // The correct sequence of step texts
  statements?: TrueFalseStatement[]; // For True/False statement table questions
  classificationGroups?: string[]; // For classification questions (e.g. ['Đối tượng tự nhiên', 'Sản phẩm công nghệ'])
  classificationItems?: ClassificationItem[]; // For classification questions
  correctAnswer?: string; // "A" | "B" | "C" | "D" or text for essay
  explanation?: string;
  imageUrl?: string;
  imagePrompt?: string;
  matchingPairs?: { left: string; right: string; match?: string }[]; // For matching questions
  authorName?: string;
  authorType?: 'my' | 'colleague' | 'all';
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdBy?: string;
  createdAt?: string | number;
}

export interface ExamMatrix {
  nhanBiet: number;
  thongHieu: number;
  vanDung: number;
  vanDungCao: number;
}

export interface ExamPaper {
  id: string;
  title: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  duration?: number;
  matrix: ExamMatrix;
  questions: QuestionItem[];
  createdBy: string;
  authorName?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdAt: string;
  isShuffled?: boolean;
  status?: 'draft' | 'published' | 'completed';
  targetClass?: string;
  targetClasses?: string[];
  examType?: string;
  testType?: string;
  startTime?: string;
  endTime?: string;
  submissionsCount?: number;
  totalStudents?: number;
  authorType?: 'my' | 'colleague' | 'all';
  originalExamId?: string;
  assignmentDate?: string;
  submissions?: any[];
  enableRealtimeLeaderboard?: boolean;
}

export interface AssignmentSubmission {
  id: string;
  studentId: string;
  sddcn?: string;
  studentPersistentId?: string;
  academicYear?: string;
  maHs?: string;
  studentCode?: string;
  studentName: string;
  className?: string;
  submittedAt: string;
  submittedTime?: string;
  attachmentUrl?: string;
  content?: string;
  score?: number | string; // 0 - 10
  totalScore?: number | string;
  answers?: any;
  studentAnswers?: any;
  feedback?: string;
  status: 'pending' | 'graded' | 'submitted';
}

export interface HomeworkAssignment {
  id: string;
  title: string;
  subject: string;
  grade?: string; // e.g. "Khối 3"
  targetClass: string; // e.g., "Lớp 3A" or "Tất cả"
  targetClasses?: string[];
  classId?: string;
  teacherName?: string; // e.g., "Nguyễn Thị Thu"
  teacherId?: string; // e.g., "gv-12"
  teacherEmail?: string;
  createdBy?: string;
  dueDate: string;
  assignedDate?: string; // e.g., "18/8/2026"
  description: string;
  totalStudents: number;
  completedCount?: number;
  isApproved?: boolean;
  authorType?: 'my' | 'colleague' | 'all';
  type?: 'assignment' | 'elearning' | string;
  category?: 'assignment' | 'elearning' | string;
  contentType?: 'assignment' | 'elearning' | string;
  lessonId?: string;
  lessonData?: any;
  questions?: QuestionItem[];
  submissions: AssignmentSubmission[];
  submittedCount?: number;
  submittedIds?: string[];
  createdAt: string;
  originalAssignmentId?: string;
  enableRealtimeLeaderboard?: boolean;
}

export type GameType = 'golden_bell' | 'speed_quiz' | 'lucky_wheel' | 'flashcards';

export interface GameItem {
  id: string;
  title: string;
  type: GameType;
  subject: string;
  grade: string;
  description: string;
  questions: {
    id: string;
    question: string;
    content?: string;
    options?: string[];
    answer: string;
    explanation?: string;
    type?: string;
    matchingPairs?: { left: string; right: string }[];
    statements?: { statement: string; isCorrect: boolean }[];
    classificationItems?: { name: string; group: string }[];
    classificationGroups?: string[];
  }[];
  playersCount?: number;
  maxPlayers?: number;
  classInfo?: string;
  status?: 'open' | 'closed';
  timePerQuestion?: string;
  isTimeLimited?: boolean;
  originalGameId?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdBy?: string;
  authorName?: string;
  authorType?: 'my' | 'colleague' | 'all';
}

export interface ActivityLog {
  id: string;
  user: string;
  role: UserRole;
  action: string;
  module: string;
  timestamp: string;
  time?: string;
}

export interface LatencyTestResult {
  latencyMs: number;
  status: 'online' | 'error' | 'testing';
  modelName: string;
  message?: string;
  isCachedModel?: boolean;
  modelSource?: 'admin' | 'cached' | 'default';
  sourceLabel?: string;
  httpStatus?: number | string;
  rawErrorDetails?: string;
}

export interface TeacherRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  subject: string;
  status: 'active' | 'locked';
  dob?: string;
  phone?: string;
  sddcn?: string;
  toChuyenMon: string;
  nhomGvCn?: string;
  avatar?: string;
  teachingAssignments?: Array<{ subject: string; classes: string[] }>;
}

export interface StudentRecord {
  id: string;
  stt: number;
  code: string; // Mã HS theo lớp/năm học (ví dụ "3c1", "5c2") - dùng để hiển thị và gọi tên
  sddcn: string; // Số định danh cá nhân (Persistent key không đổi qua các năm học)
  studentPersistentId?: string; // Khóa định danh bất biến (đồng nhất với sddcn)
  academicYear?: string; // Niên khóa / Năm học (ví dụ "2026-2027")
  name: string;
  gender: 'Nam' | 'Nữ';
  dob: string;
  className: string;
  parentName: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  conduct: 'Tốt' | 'Khá';
  avgScore: number;
  notes?: string;
  coins?: number;
  avatar: string;
  avatarUrl?: string;
  pin?: string;
  address?: string;
  // Aliases for Excel column mapping compatibility
  username?: string;
  password?: string;
  fullName?: string;
  idCard?: string;
  birthday?: string;
  commentDetail?: {
    correctCount: number;
    totalQuestions: number;
    strengths: string;
    reminders: string;
    overallDat: 'T' | 'H' | 'CHT';
    score: number;
    hasCommented: boolean;
  };
}

export interface StudentEnrollmentRecord {
  sddcn: string;
  academicYear: string;
  classId: string;
  className?: string;
  displayCode: string;
  homeroomTeacherId?: string;
}

export interface QuizziGameItem {
  id: number | string;
  originalGameId?: string;
  subject: string;
  subjectLabel: string;
  title: string;
  desc: string;
  grade: string;
  classInfo: string;
  icon?: string;
  color?: string;
  type?: string;
  embedUrl?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdBy?: string;
  authorName?: string;
  authorType?: 'my' | 'colleague' | 'all';
  createdAt?: string;
  updatedAt?: string;
}

