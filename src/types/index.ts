export type CognitiveLevel = '1. Nhận biết' | '2. Thông hiểu' | '3. Vận dụng' | '4. Vận dụng cao';

export type QuestionType = 'Lựa chọn' | 'Đúng / Sai' | 'Điền khuyết' | 'Ghép nối' | 'Tự luận ngắn';

export type Subject = 'Công nghệ' | 'Tin học' | 'Toán học' | 'Tiếng Việt' | 'Khoa học tự nhiên' | 'Lịch sử & Địa lý' | 'Tiếng Anh';

export type Grade = 'Khối 1' | 'Khối 2' | 'Khối 3' | 'Khối 4' | 'Khối 5' | 'Khối 6' | 'Khối 7' | 'Khối 8' | 'Khối 9';

export interface QuestionOption {
  id: string; // 'A' | 'B' | 'C' | 'D' or '1' | '2' | '3' | '4'
  text: string;
  isCorrect?: boolean;
}

export interface Question {
  id: string;
  code: string; // e.g., 'CH-CÔN-4450-1', 'CH-TIN3-01'
  type: QuestionType;
  subject: Subject;
  grade: Grade;
  level: CognitiveLevel;
  content: string;
  options: QuestionOption[];
  correctAnswer: string; // text explanation or letter
  explanation?: string;
  createdAt: string;
  author?: string;
  tags?: string[];
}

export type ActiveModule = 'questions' | 'exams' | 'homework' | 'users';

export interface FilterState {
  search: string;
  grade: string;
  subject: string;
  level: string;
  type: string;
  quickLevel?: string;
}
