import { Question, Subject, Grade, QuestionType } from '../types';

export const INITIAL_QUESTIONS: Question[] = [];

export const MOCK_TOTAL_QUESTION_COUNT = 0;

export const SUBJECTS: Subject[] = [
  'Công nghệ',
  'Tin học',
  'Toán học',
  'Tiếng Việt',
  'Khoa học tự nhiên',
  'Lịch sử & Địa lý',
  'Tiếng Anh',
];

export const GRADES: Grade[] = [
  'Khối 1',
  'Khối 2',
  'Khối 3',
  'Khối 4',
  'Khối 5',
  'Khối 6',
  'Khối 7',
  'Khối 8',
  'Khối 9',
];

export const COGNITIVE_LEVELS: { id: string; label: string; count: number; color: string; badgeClass: string }[] = [
  { id: '1. Nhận biết', label: '1. Nhận biết', count: 0, color: 'blue', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: '2. Thông hiểu', label: '2. Thông hiểu', count: 0, color: 'emerald', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: '3. Vận dụng', label: '3. Vận dụng', count: 0, color: 'amber', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: '4. Vận dụng cao', label: '4. Vận dụng cao', count: 0, color: 'purple', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
];

export const QUESTION_TYPES: QuestionType[] = [
  'Lựa chọn',
  'Đúng / Sai',
  'Điền khuyết',
  'Ghép nối',
  'Tự luận ngắn',
];
