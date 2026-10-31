import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  BookOpen,
  Lock,
  Unlock,
  Minimize2,
  Maximize2,
  Printer,
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Eye,
  Award,
  Sparkles,
  TrendingUp,
  MessageSquare,
  Filter,
  Flame,
  Target,
  Brain,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Calendar,
  User,
  ShieldCheck,
  Heart,
  HelpCircle,
  GraduationCap,
  Star,
  Check,
  Zap,
  Clock,
  BarChart2,
  ChevronDown,
  Download,
  Info,
  AlertTriangle,
  Edit3,
  UserCheck
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
  ReferenceLine
} from 'recharts';
import { UserRole, StudentRecord as GlobalStudentRecord, ExamPaper, HomeworkAssignment, Lesson5EPlan, GameItem } from '../../types';
import { PRIMARY_SCHOOL_SUBJECTS } from '../../services/mockData';
import { GRADES, CLASSES_BY_GRADE, EXAM_TYPES } from '../../lib/constants';
import { useClassesList, getSubjectsForClassOrGrade, getSubjectColorStyles, extractGradeDigit } from '../../services/classStorageService';
import { isSubjectMatch, getCurrentStudentSession, getEffectiveStudentClassAndGrade } from '../../services/studentSessionService';
import {
  calculateUnifiedHocBaData,
  calculateOverallClassification,
  SCORE_WEIGHTS,
  SubjectScoreBreakdown,
  StudentHocBaSummary,
  isSubjectWithScore,
  normalizeExamTypeKey,
  getStudentExamSubmissions,
  getStudentHomeworkSubmissions,
  isExamTypeMatch,
  getSubjectShortName,
  formatScore,
  formatTotalScore,
  formatSubmissionDateTime
} from '../../services/hocBaDataService';
import {
  getAllStudentsFromLocalStorage,
  getStudentsFromLocalStorage,
  generateDefaultClassRoster,
  saveStudentsToLocalStorage,
  saveAllStudentsToLocalStorage,
  syncClassStudentsToFirestore,
  subscribeToFirestoreClassStudents,
  getStandardClassName,
  normalizeClassKey,
  getStudentClassInfo,
  getCurrentActiveAcademicYear,
  getYearEndResult,
  saveYearEndResult,
  YearEndResultRecord,
  YearEndPromotionStatus
} from '../../services/studentStorageService';
import { useAcademicYear } from '../../contexts/AcademicYearContext';
import {
  AcademicYearWarningBanner,
  AcademicYearEmptyState
} from '../common/AcademicYearWarningBanner';
import { exportSoNhanXetToExcel, exportSoTongKetToExcel } from '../../services/excelService';
import { getStudentGameProfile } from '../../services/studentGameStoreService';
import { db } from '../../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { normalizeStudentCode, isValidStudentCode, formatStandardStudentCode } from '../../services/studentCode';

interface StudentRecord {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
  dob: string;
  isFemale: boolean;
  className: string;
  evaluations: Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }>;
  commentDetail?: {
    correctCount: number;
    totalQuestions: number;
    strengths: string;
    reminders: string;
    overallDat: 'T' | 'H' | 'CHT';
    score: number;
    hasCommented: boolean;
    testTitle?: string;
  };
}

export interface HocBaSoModuleProps {
  userRole?: UserRole;
  exams?: ExamPaper[];
  assignments?: HomeworkAssignment[];
  lessons?: Lesson5EPlan[];
  games?: GameItem[];
  currentStudent?: GlobalStudentRecord | null;
}

function cleanStudentName(rawName: string): string {
  if (!rawName) return '';
  return rawName.replace(/([À-ỹa-zđĐ])A$/i, '$1').trim();
}

function convertToHocBaStudent(st: GlobalStudentRecord): StudentRecord {
  const name = cleanStudentName(st.fullName || st.name || '');
  const parts = name.trim().split(/\s+/);
  const firstName = parts.length > 0 ? parts[parts.length - 1] : '';
  const lastName = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : '';
  const rawCode = st.code || (st as any).studentCode || (st as any).maHs || formatStandardStudentCode(st.id, st.className || '', (st as any).stt || 1);
  const code = normalizeStudentCode(rawCode);

  const rawEvaluations = (st as any).evaluations;
  const evaluations: Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }> =
    rawEvaluations && typeof rawEvaluations === 'object' ? rawEvaluations : {};

  const rawComment = (st as any).commentDetail;
  const commentDetail =
    rawComment && rawComment.hasCommented ? rawComment : undefined;

  return {
    id: st.id,
    code,
    lastName,
    firstName,
    dob: st.dob || '',
    isFemale: st.gender === 'Nữ',
    className: st.className || '',
    evaluations,
    commentDetail,
    _rawSt: st
  } as any;
}

// ============================================================================
// STUDENT UNIFIED HỌC BẠ SỐ COMPONENT (WITH CHARTS & PROGRESS VISUALIZATION)
// ============================================================================

interface SubjectScoreItem {
  subject: string;
  shortName: string;
  score: number;
  level: string;
  status: 'T' | 'H' | 'CHT';
  note: string;
}

const MONTH_FILTER_OPTIONS = [
  { key: '9', label: 'Tháng 9' },
  { key: '10', label: 'Tháng 10' },
  { key: '11', label: 'Tháng 11' },
  { key: '12', label: 'Tháng 12' },
  { key: '1', label: 'Tháng 1' },
  { key: '2', label: 'Tháng 2' },
  { key: '3', label: 'Tháng 3' },
  { key: '4', label: 'Tháng 4' },
  { key: '5', label: 'Tháng 5' }
];

const EXAM_FILTER_OPTIONS = [
  { key: 'all', label: 'Tất cả bài kiểm tra' },
  { key: 'giua_ki_1', label: 'Giữa kì 1' },
  { key: 'cuoi_ki_1', label: 'Cuối kì 1' },
  { key: 'giua_ki_2', label: 'Giữa kì 2' },
  { key: 'cuoi_ki_2', label: 'Cuối kì 2' }
];

const BAR_FILTER_CHIPS = [
  { key: 'giua_ki_1', label: 'Giữa kỳ 1' },
  { key: 'cuoi_ki_1', label: 'Cuối kỳ 1' },
  { key: 'giua_ki_2', label: 'Giữa kỳ 2' },
  { key: 'cuoi_ki_2', label: 'Cuối kỳ 2' }
];

const BAR_MONTH_OPTIONS = [
  { key: '9', label: 'Tháng 9' },
  { key: '10', label: 'Tháng 10' },
  { key: '11', label: 'Tháng 11' },
  { key: '12', label: 'Tháng 12' },
  { key: '1', label: 'Tháng 1' },
  { key: '2', label: 'Tháng 2' },
  { key: '3', label: 'Tháng 3' },
  { key: '4', label: 'Tháng 4' },
  { key: '5', label: 'Tháng 5' }
];

// Custom XAxis Tick for Bar Chart: Hiển thị tên môn học ngắn + Nhãn nhỏ "Chưa có bài" nếu môn chưa có điểm
const CustomBarXAxisTick: React.FC<any> = ({ x, y, payload, chartData }) => {
  const entry = Array.isArray(chartData) ? chartData.find((d: any) => d.shortName === payload?.value || d.subject === payload?.value) : null;
  const isNoData = entry ? !entry.hasData : false;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="middle"
        fill={isNoData ? '#94a3b8' : '#334155'}
        fontSize={11}
        fontWeight={700}
      >
        {payload?.value}
      </text>
      {isNoData && (
        <text
          x={0}
          y={0}
          dy={22}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize={9}
          fontStyle="italic"
        >
          Chưa có bài
        </text>
      )}
    </g>
  );
};

// Custom Tooltip for Bar Chart
interface CustomBarTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: any }>;
}

const CustomBarTooltip: React.FC<CustomBarTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const hasScore = data.score !== null && data.score !== undefined && data.hasData;

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl text-xs shadow-2xl border border-slate-700/80 space-y-1.5 z-50 max-w-xs pointer-events-none">
        <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 pb-1.5">
          <span className="font-extrabold text-teal-300 text-sm">{data.subject}</span>
          {hasScore ? (
            <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono font-black text-xs border border-amber-400/30">
              {formatScore(data.score)}đ
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-slate-700/80 text-slate-300 text-[10px] font-semibold">
              Chưa có bài
            </span>
          )}
        </div>

        {hasScore ? (
          <div className="space-y-1 pt-0.5">
            {data.calculationSummary && (
              <p className="text-[11px] text-amber-200 font-medium leading-tight">
                {data.calculationSummary}
              </p>
            )}
            {Array.isArray(data.itemsDetail) && data.itemsDetail.length > 0 && (
              <div className="space-y-0.5 pt-1 border-t border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Chi tiết bài làm:</span>
                {data.itemsDetail.slice(0, 5).map((it: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-[10px] text-slate-200">
                    <span className="truncate max-w-[170px]">• {it.title}</span>
                    <span className="font-bold font-mono text-emerald-300 shrink-0">{it.score}đ</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic pt-0.5">
            Chưa có dữ liệu bài kiểm tra / bài tập ở mốc này.
          </p>
        )}
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Single Subject Line Chart
interface CustomLineTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: any }>;
  subjectName?: string;
}

const CustomLineTooltip: React.FC<CustomLineTooltipProps> = ({ active, payload, subjectName }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.hasData || data.score === null) {
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white px-3 py-2 rounded-xl text-xs shadow-xl border border-slate-700 space-y-0.5 z-50 pointer-events-none">
          <span className="font-extrabold text-slate-300">{data.period}</span>
          <p className="text-[11px] text-slate-400 italic">Chưa có bài kiểm tra ở mốc này</p>
        </div>
      );
    }

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl text-xs shadow-2xl border border-indigo-500/40 space-y-1 z-50 pointer-events-none max-w-xs">
        <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 pb-1">
          <span className="font-extrabold text-teal-300">{data.period} {subjectName ? `• ${subjectName}` : ''}</span>
          <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono font-black text-xs border border-amber-400/30">
            {formatScore(data.score)}đ
          </span>
        </div>
        {data.examTitle && (
          <p className="text-[11px] text-slate-200 font-medium truncate">• {data.examTitle}</p>
        )}
        {data.submittedTime && (
          <p className="text-[10px] text-slate-400">Thời gian: {formatSubmissionDateTime(data.submittedTime)}</p>
        )}
      </div>
    );
  }
  return null;
};

interface StudentHocBaSoViewProps {
  exams?: ExamPaper[];
  assignments?: HomeworkAssignment[];
  lessons?: Lesson5EPlan[];
  games?: GameItem[];
  currentStudent?: GlobalStudentRecord | null;
  allStudentsDb?: Record<string, GlobalStudentRecord[]>;
}

const StudentHocBaSoView: React.FC<StudentHocBaSoViewProps> = memo(({
  exams = [],
  assignments = [],
  lessons = [],
  games = [],
  currentStudent = null,
  allStudentsDb: propAllStudentsDb
}) => {
  const { classes } = useClassesList();
  const { selectedSemester, selectedAcademicYear } = useAcademicYear();
  const isHk2 = selectedSemester === 'Học kỳ II';

  // Block 2: Test Type Filter & Month Filter state
  const [selectedExamFilter, setSelectedExamFilter] = useState<string>(() => {
    const saved = localStorage.getItem('eduplay_hocba_exam_filter');
    if (!saved || saved === 'thuong_xuyen' || saved === 'Thường xuyên' || !['giua_ki_1', 'cuoi_ki_1', 'giua_ki_2', 'cuoi_ki_2', 'all'].includes(saved)) {
      return isHk2 ? 'giua_ki_2' : 'giua_ki_1';
    }
    return saved;
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(isHk2 ? '1' : '9');

  useEffect(() => {
    if (selectedExamFilter) {
      localStorage.setItem('eduplay_hocba_exam_filter', selectedExamFilter);
    }
  }, [selectedExamFilter]);

  // Block 7: AI Advisor state
  const [isAiAdvisorActive, setIsAiAdvisorActive] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Tự động đồng bộ tháng và đợt kiểm tra khi thay đổi Học kỳ toàn cục
  useEffect(() => {
    if (selectedSemester === 'Học kỳ II') {
      setSelectedMonth('1');
      setSelectedExamFilter(prev => (prev === 'thuong_xuyen' || !['giua_ki_1', 'cuoi_ki_1', 'giua_ki_2', 'cuoi_ki_2', 'all'].includes(prev)) ? 'giua_ki_2' : prev);
      setBarFilter(prev => (prev === 'thuong_xuyen' || !['giua_ki_1', 'cuoi_ki_1', 'giua_ki_2', 'cuoi_ki_2'].includes(prev)) ? 'giua_ki_2' : prev);
      setBarSelectedMonth('1');
    } else {
      setSelectedMonth('9');
      setSelectedExamFilter(prev => (prev === 'thuong_xuyen' || !['giua_ki_1', 'cuoi_ki_1', 'giua_ki_2', 'cuoi_ki_2', 'all'].includes(prev)) ? 'giua_ki_1' : prev);
      setBarFilter(prev => (prev === 'thuong_xuyen' || !['giua_ki_1', 'cuoi_ki_1', 'giua_ki_2', 'cuoi_ki_2'].includes(prev)) ? 'giua_ki_1' : prev);
      setBarSelectedMonth('9');
    }
  }, [selectedSemester]);

  // Student Database State and Real-Time Sync
  const [studentsDb, setStudentsDb] = useState<Record<string, GlobalStudentRecord[]>>(() => {
    if (propAllStudentsDb && Object.keys(propAllStudentsDb).length > 0) {
      return propAllStudentsDb;
    }
    return getAllStudentsFromLocalStorage();
  });

  useEffect(() => {
    if (propAllStudentsDb && Object.keys(propAllStudentsDb).length > 0) {
      setStudentsDb(propAllStudentsDb);
    }
  }, [propAllStudentsDb]);

  useEffect(() => {
    const handleStudentsUpdated = () => {
      setStudentsDb(getAllStudentsFromLocalStorage());
    };
    window.addEventListener('student-data-updated', handleStudentsUpdated);
    window.addEventListener('eduplay_students_updated', handleStudentsUpdated);
    window.addEventListener('eduplay_student_session_updated', handleStudentsUpdated);

    return () => {
      window.removeEventListener('student-data-updated', handleStudentsUpdated);
      window.removeEventListener('eduplay_students_updated', handleStudentsUpdated);
      window.removeEventListener('eduplay_student_session_updated', handleStudentsUpdated);
    };
  }, []);

  // Determine current active student session from Single Source of Truth
  const [sessionStudent, setSessionStudent] = useState<GlobalStudentRecord | null>(() => {
    return getCurrentStudentSession();
  });

  useEffect(() => {
    const handleSessionChange = () => {
      setSessionStudent(getCurrentStudentSession());
    };
    window.addEventListener('eduplay_student_session_updated', handleSessionChange);
    window.addEventListener('student-data-updated', handleSessionChange);
    window.addEventListener('storage', handleSessionChange);
    return () => {
      window.removeEventListener('eduplay_student_session_updated', handleSessionChange);
      window.removeEventListener('student-data-updated', handleSessionChange);
      window.removeEventListener('storage', handleSessionChange);
    };
  }, []);

  // Lắng nghe các sự kiện nộp bài tập & bài kiểm tra để tự động cập nhật tiến độ huy hiệu theo thời gian thực
  const [submissionsVersion, setSubmissionsVersion] = useState<number>(0);

  useEffect(() => {
    const handleSubmissionsUpdated = () => {
      setSubmissionsVersion(prev => prev + 1);
    };
    window.addEventListener('eduplay_student_submissions_updated', handleSubmissionsUpdated);
    window.addEventListener('eduplay_exam_submissions_updated', handleSubmissionsUpdated);
    window.addEventListener('storage', handleSubmissionsUpdated);

    return () => {
      window.removeEventListener('eduplay_student_submissions_updated', handleSubmissionsUpdated);
      window.removeEventListener('eduplay_exam_submissions_updated', handleSubmissionsUpdated);
      window.removeEventListener('storage', handleSubmissionsUpdated);
    };
  }, []);

  // Combine prop and session data for the logged-in student, prioritizing fresher sessionStudent
  const effectiveBaseStudent = useMemo(() => {
    if (sessionStudent && (!currentStudent || sessionStudent.id !== currentStudent.id || sessionStudent.name !== currentStudent.name)) {
      return sessionStudent;
    }
    return currentStudent || sessionStudent;
  }, [currentStudent, sessionStudent]);

  // Find exact student record in the class roster / database
  const activeDbStudent = useMemo(() => {
    if (!effectiveBaseStudent) return null;
    const targetId = (effectiveBaseStudent.id || (effectiveBaseStudent as any).code || '').trim();
    const targetCode = ((effectiveBaseStudent as any).code || effectiveBaseStudent.id || '').trim();
    const targetName = (effectiveBaseStudent.fullName || effectiveBaseStudent.name || '').trim().toLowerCase();
    const targetClass = (effectiveBaseStudent.className || '').trim();
    const normClass = normalizeClassKey(targetClass);
    const stdClass = getStandardClassName(targetClass);

    // Get specific class roster first, fallback to LocalStorage/Default roster if needed
    const classRoster = studentsDb[stdClass] || studentsDb[normClass] || studentsDb[targetClass] ||
      getStudentsFromLocalStorage(targetClass) || generateDefaultClassRoster(targetClass);

    if (Array.isArray(classRoster) && classRoster.length > 0) {
      // 1. Try matching BOTH ID/Code AND Name inside the same class
      const exactBoth = classRoster.find((st) => {
        if (!st) return false;
        const stId = (st.id || '').trim();
        const stCode = ((st as any).code || '').trim();
        const stName = (st.fullName || st.name || '').trim().toLowerCase();
        const idMatches = Boolean(
          (targetId && stId && stId === targetId) ||
          (targetCode && stCode && stCode.toLowerCase() === targetCode.toLowerCase())
        );
        const nameMatches = Boolean(targetName && stName && (stName === targetName || stName.includes(targetName) || targetName.includes(stName)));
        return idMatches && nameMatches;
      });
      if (exactBoth) return exactBoth;

      // 2. Try matching by Name inside the same class
      if (targetName) {
        const nameMatch = classRoster.find((st) => {
          if (!st) return false;
          const stName = (st.fullName || st.name || '').trim().toLowerCase();
          return stName === targetName || (stName && (stName.includes(targetName) || targetName.includes(stName)));
        });
        if (nameMatch) return nameMatch;
      }

      // 3. Try matching by ID/Code inside the same class ONLY if name doesn't contradict
      if (targetId) {
        const idMatch = classRoster.find((st) => {
          if (!st) return false;
          const stId = (st.id || '').trim();
          const stCode = ((st as any).code || '').trim();
          return (stId && stId === targetId) || (stCode && stCode.toLowerCase() === targetCode.toLowerCase());
        });
        if (idMatch) {
          const idMatchName = (idMatch.fullName || idMatch.name || '').trim().toLowerCase();
          if (!targetName || !idMatchName || targetName === idMatchName || targetName.includes(idMatchName) || idMatchName.includes(targetName)) {
            return idMatch;
          }
        }
      }
    }

    // 4. Fallback search across all classes ONLY if Name strictly matches (never match another student's name)
    if (targetName) {
      for (const roster of Object.values(studentsDb)) {
        if (Array.isArray(roster)) {
          const found = roster.find((st) => {
            if (!st) return false;
            const stName = (st.fullName || st.name || '').trim().toLowerCase();
            return stName === targetName;
          });
          if (found) return found;
        }
      }
    }

    return null;
  }, [effectiveBaseStudent, studentsDb]);

  // Unified target student
  const targetStudent = useMemo(() => {
    if (!effectiveBaseStudent && !activeDbStudent) {
      const eff = getEffectiveStudentClassAndGrade();
      return {
        id: eff.studentId || 'u-4',
        code: eff.studentId || 'u-4',
        name: eff.studentName || 'Học sinh',
        fullName: eff.studentName || 'Học sinh',
        className: eff.studentClass || 'Lớp 3A'
      } as any;
    }
    const base = activeDbStudent ? { ...effectiveBaseStudent, ...activeDbStudent } : effectiveBaseStudent;

    // Ensure the student's actual identity is strictly preserved (never overwrite with another student)
    const effFallback = getEffectiveStudentClassAndGrade();
    const finalName = (effectiveBaseStudent?.fullName || effectiveBaseStudent?.name || activeDbStudent?.fullName || activeDbStudent?.name || sessionStudent?.name || sessionStudent?.fullName || currentStudent?.name || effFallback.studentName || 'Học sinh').trim();
    const finalClass = (effectiveBaseStudent?.className || activeDbStudent?.className || sessionStudent?.className || currentStudent?.className || effFallback.studentClass || 'Lớp 3A').trim();
    const finalId = (effectiveBaseStudent?.id || (effectiveBaseStudent as any)?.code || activeDbStudent?.id || (activeDbStudent as any)?.code || sessionStudent?.id || (sessionStudent as any)?.code || currentStudent?.id || (currentStudent as any)?.code || effFallback.studentId || 'u-4').trim();
    const finalCode = ((effectiveBaseStudent as any)?.code || (activeDbStudent as any)?.code || effectiveBaseStudent?.id || activeDbStudent?.id || sessionStudent?.code || currentStudent?.code || finalId).trim();
    const finalDob = (effectiveBaseStudent?.dob || activeDbStudent?.dob || '').trim();
    const finalGender = (effectiveBaseStudent?.gender || activeDbStudent?.gender || 'Nam').trim();
    const finalParent = (effectiveBaseStudent?.parentName || activeDbStudent?.parentName || (finalName ? `Phụ huynh em ${finalName}` : '')).trim();

    return {
      ...base,
      id: finalId,
      code: finalCode,
      name: finalName,
      fullName: finalName,
      className: finalClass,
      dob: finalDob,
      gender: finalGender,
      parentName: finalParent
    };
  }, [activeDbStudent, effectiveBaseStudent, sessionStudent, currentStudent]);

  const studentId = targetStudent?.id || '';
  const studentName = targetStudent?.fullName || targetStudent?.name || 'Học sinh';
  const studentClassName = targetStudent?.className || '';

  // --------------------------------------------------------------------------
  // LỌC NHẬN XÉT CỦA GIÁO VIÊN CHỦ NHIỆM & NỀ NẾP CHÍNH XÁC THEO STUDENT_ID
  // --------------------------------------------------------------------------
  const studentOfficialComment = useMemo(() => {
    if (!targetStudent) return null;

    const normExamFilter = normalizeExamTypeKey(selectedExamFilter);
    const targetId = (targetStudent.id || '').trim().toLowerCase();
    const targetCode = ((targetStudent as any).code || '').trim().toLowerCase();
    const targetName = (targetStudent.fullName || targetStudent.name || '').trim().toLowerCase();

    // Hàm kiểm tra an toàn: Lời nhận xét BẮT BUỘC phải thuộc về đúng học sinh này
    // Chống rò rỉ: Tuyệt đối không hiển thị nhận xét nếu có tên học sinh khác (ví dụ: "Em Hoàng Bảo An...")
    const isValidCommentForThisStudent = (comment: any): boolean => {
      if (!comment || !comment.hasCommented) return false;

      // 1. Kiểm tra studentId nếu có gắn kèm trong dữ liệu nhận xét
      if (comment.studentId) {
        const cId = String(comment.studentId).trim().toLowerCase();
        const matchesId = (targetId && cId === targetId) || (targetCode && cId === targetCode);
        if (!matchesId) return false;
      }

      // 2. Kiểm tra studentName nếu có gắn kèm trong dữ liệu nhận xét
      if (comment.studentName) {
        const cName = String(comment.studentName).trim().toLowerCase();
        if (targetName && cName !== targetName && !targetName.includes(cName) && !cName.includes(targetName)) {
          return false;
        }
      }

      const text = `${comment.strengths || ''} ${comment.reminders || ''}`.trim();
      if (!text) return false;
      
      const lowerText = text.toLowerCase();
      
      // 3. Nếu lời nhận xét nêu rõ tên học sinh khác và không trùng với tên học sinh hiện tại -> Loại bỏ ngay
      if (lowerText.includes('hoàng bảo an') && !targetName.includes('bảo an')) {
        return false;
      }
      
      // 4. Kiểm tra cấu trúc "Em [Tên]..." nếu tên nêu trong lời nhận xét khác tên học sinh đang xem
      const emMatch = lowerText.match(/^em\s+([a-zà-ỹ\s]+?)(?:\s+chăm|\s+học|\s+có|\s+cần|\s+luôn|\s+tích|\s+hoàn|\s+làm|,|\.)/i);
      if (emMatch && emMatch[1]) {
        const namedStudent = emMatch[1].trim();
        if (namedStudent.length >= 2 && !targetName.includes(namedStudent) && !namedStudent.includes(targetName)) {
          return false;
        }
      }

      return true;
    };

    // 1. Ưu tiên cao nhất: Lấy từ activeDbStudent (CSDL Firestore & LocalStorage chính thức của lớp)
    if (activeDbStudent) {
      // 1a. Nhận xét theo đợt kiểm tra / học kỳ đang được lọc
      const byExam = (activeDbStudent as any).commentDetailByExamType?.[selectedExamFilter] ||
                     (activeDbStudent as any).commentDetailByExamType?.[normExamFilter];
      if (byExam && isValidCommentForThisStudent(byExam)) {
        return byExam;
      }

      // 1b. Nhận xét chung của giáo viên chủ nhiệm
      const dbComment = (activeDbStudent as any).commentDetail;
      if (dbComment && isValidCommentForThisStudent(dbComment)) {
        if (selectedExamFilter !== 'all' && selectedExamFilter !== 'giua_ki_1' && (activeDbStudent as any).commentDetailByExamType) {
          return null;
        }
        return dbComment;
      }
    }

    // 2. Dự phòng: Kiểm tra từ targetStudent trong session, nhưng bắt buộc phải qua bộ lọc hợp lệ
    const sessionComment = (targetStudent as any).commentDetail;
    if (sessionComment && isValidCommentForThisStudent(sessionComment)) {
      if (sessionComment.studentId && sessionComment.studentId !== targetId) {
        return null;
      }
      return sessionComment;
    }

    // Học sinh chưa có nhận xét hợp lệ từ giáo viên -> Trả về null để hiển thị trạng thái rỗng
    return null;
  }, [activeDbStudent, targetStudent, selectedExamFilter]);

  // Calculate real unified Học Bạ data from the 3 modules with student subject filtering
  const hocBaSummary: StudentHocBaSummary = useMemo(() => {
    const activeYear = getCurrentActiveAcademicYear();
    const effId = (targetStudent as any)?.sddcn || (targetStudent as any)?.studentPersistentId || studentId || (targetStudent as any)?.code || 'u-4';
    const effCode = (targetStudent as any)?.code || studentId || 'u-4';
    const classInfo = getStudentClassInfo(effId, activeYear);
    const resolvedClass = classInfo?.className || studentClassName;

    return calculateUnifiedHocBaData({
      studentId: effId,
      sddcn: effId,
      studentName: studentName,
      studentCode: effCode,
      className: resolvedClass,
      academicYear: activeYear,
      examFilter: selectedExamFilter,
      selectedMonth,
      exams,
      assignments,
      lessons,
      games,
      classesList: classes,
      onlyAssignedSubjects: true
    });
  }, [studentId, studentName, targetStudent, studentClassName, selectedExamFilter, selectedMonth, exams, assignments, lessons, games, classes, submissionsVersion]);

  // Synchronized subject scores based on unified real data calculation
  const activeSubjects: SubjectScoreItem[] = useMemo(() => {
    return hocBaSummary.subjects.map(sub => ({
      subject: sub.subject,
      shortName: sub.shortName,
      score: sub.score,
      level: sub.level,
      status: sub.status,
      note: sub.note
    }));
  }, [hocBaSummary]);

  // Block 8: Personal Goals state
  const [goals, setGoals] = useState<{ id: string; text: string; completed: boolean }[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('eduplay_student_goals');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return [
      { id: '1', text: 'Hoàn thành đầy đủ 100% bài tập tuần này', completed: false },
      { id: '2', text: 'Luyện tập thực hành chuột và gõ phím ít nhất 15 phút mỗi ngày', completed: false },
      { id: '3', text: 'Tích lũy thêm 3 Bông Hoa Điểm 10 thi đua lớp học', completed: false }
    ];
  });

  const [newGoalText, setNewGoalText] = useState<string>('');

  const handleSaveGoals = (updatedGoals: { id: string; text: string; completed: boolean }[]) => {
    setGoals(updatedGoals);
    if (typeof window !== 'undefined') {
      localStorage.setItem('eduplay_student_goals', JSON.stringify(updatedGoals));
    }
  };

  const handleToggleGoal = (id: string) => {
    const next = goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g);
    handleSaveGoals(next);
  };

  const handleDeleteGoal = (id: string) => {
    const next = goals.filter(g => g.id !== id);
    handleSaveGoals(next);
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim()) return;
    const newGoal = {
      id: `goal-${Date.now()}`,
      text: newGoalText.trim(),
      completed: false
    };
    const next = [...goals, newGoal];
    handleSaveGoals(next);
    setNewGoalText('');
  };

  const completedGoalsCount = goals.filter(g => g.completed).length;

  const handleActivateAI = () => {
    setIsAiLoading(true);
    setTimeout(() => {
      setIsAiLoading(false);
      setIsAiAdvisorActive(true);
    }, 900);
  };

  // Dynamic Homeroom Teacher lookup for student's class
  const studentHomeroomTeacher = useMemo(() => {
    if (!studentClassName) return 'Phạm Thị Thanh Thảo';
    const clean = studentClassName.replace(/^Lớp\s+/i, '').trim().toLowerCase();
    const found = classes.find(c => {
      const cClean = c.name.replace(/^Lớp\s+/i, '').trim().toLowerCase();
      return c.id.toLowerCase() === clean || cClean === clean || c.name.toLowerCase() === studentClassName.toLowerCase();
    });
    return found?.homeroomTeacher?.trim() || 'Phạm Thị Thanh Thảo';
  }, [studentClassName, classes]);

  // Compute calculated GPA dynamically from real calculated data (dùng nội bộ cho xếp loại & huy hiệu)
  const calculatedGPA = hocBaSummary.gpa !== null
    ? formatTotalScore(hocBaSummary.gpa)
    : 'Chưa có dữ liệu';

  // Trạng thái hiển thị mở rộng thông tin hành chính cá nhân (Việc 8)
  const [showAdminDetails, setShowAdminDetails] = useState<boolean>(false);

  // Helper tính nhãn định tính & số sao cho "KẾT QUẢ HỌC TẬP" theo Việc 6
  const qualitativeResult = useMemo(() => {
    if (!hocBaSummary.hasData || hocBaSummary.gpa === null || hocBaSummary.evaluatedSubjectsCount === 0) {
      return {
        label: '🌱 Chưa có bài nào được chấm',
        subText: `(0/${hocBaSummary.totalSubjectsCount} môn có dữ liệu)`
      };
    }
    const g = hocBaSummary.gpa;
    const countInfo = `(${hocBaSummary.evaluatedSubjectsCount}/${hocBaSummary.totalSubjectsCount} môn có dữ liệu)`;
    if (g >= 9.0) {
      return {
        label: '🌟🌟🌟 Xuất sắc!',
        subText: countInfo
      };
    }
    if (g >= 7.0) {
      return {
        label: '🌟🌟 Rất tốt!',
        subText: countInfo
      };
    }
    if (g >= 5.0) {
      return {
        label: '🌟 Đang cố gắng',
        subText: countInfo
      };
    }
    return {
      label: '💪 Cần cố gắng hơn nhé',
      subText: countInfo
    };
  }, [hocBaSummary.hasData, hocBaSummary.gpa, hocBaSummary.evaluatedSubjectsCount, hocBaSummary.totalSubjectsCount]);

  // Câu động viên tích cực theo bối cảnh học tập (Việc 8)
  const encouragementMessage = useMemo(() => {
    const gpa = hocBaSummary.gpa;
    const flowers = hocBaSummary.hoaDiem10Count;
    const attendance = hocBaSummary.attendance.overallRate ?? 0;

    if (flowers >= 3 || (gpa !== null && gpa >= 9.5)) {
      return 'Phong độ học tập xuất sắc! Em là tấm gương sáng của cả lớp, tiếp tục phát huy nhé! 🌟🌈';
    }
    if (gpa !== null && gpa >= 9.0) {
      return 'Kết quả học tập tuyệt vời! Em đang học rất chăm chỉ và tự tin tỏa sáng mỗi ngày! 🌟✨';
    }
    if (gpa !== null && gpa >= 8.0) {
      return 'Em đang tiến bộ rất nhanh và giữ vững phong độ học tập thật đáng khen! 🚀👏';
    }
    if (attendance >= 80) {
      return 'Em đang học rất chăm chỉ, cố gắng thêm chút nữa để gặt hái thêm hoa điểm 10 nhé! 🌸💪';
    }
    if (hocBaSummary.hasData) {
      return 'Mỗi ngày học tập là một niềm vui mới, hãy luôn tự tin và nỗ lực hết mình em nhé! 💖🌱';
    }
    return 'Chào mừng em đến với Học Bạ Số! Hãy bắt đầu làm bài để cùng khám phá và tích lũy những bông hoa điểm 10 rực rỡ nhé! 🚀✨';
  }, [hocBaSummary.gpa, hocBaSummary.hoaDiem10Count, hocBaSummary.attendance.overallRate, hocBaSummary.hasData]);

  // =========================================================================
  // BỘ LỌC DẠNG CHIP & DỮ LIỆU CHO BIỂU ĐỒ "SO SÁNH ĐIỂM SỐ CÁC MÔN HỌC"
  // =========================================================================
  const [barFilter, setBarFilter] = useState<string>(() => {
    const saved = localStorage.getItem('eduplay_hocba_bar_filter');
    if (!saved || saved === 'thuong_xuyen' || saved === 'Thường xuyên' || !['giua_ki_1', 'cuoi_ki_1', 'giua_ki_2', 'cuoi_ki_2'].includes(saved)) {
      return isHk2 ? 'giua_ki_2' : 'giua_ki_1';
    }
    return saved;
  });
  const [barSelectedMonth, setBarSelectedMonth] = useState<string>(isHk2 ? '1' : '9');

  useEffect(() => {
    if (barFilter) {
      localStorage.setItem('eduplay_hocba_bar_filter', barFilter);
    }
  }, [barFilter]);

  // Lấy dữ liệu bài nộp kiểm tra & bài tập của học sinh
  const rawStudentExamSubs = useMemo(() => {
    const effId = studentId || (targetStudent as any)?.code || 'u-4';
    const effCode = (targetStudent as any)?.code || studentId || 'u-4';
    return getStudentExamSubmissions({
      studentId: effId,
      studentName,
      studentCode: effCode,
      exams
    });
  }, [studentId, studentName, targetStudent, exams, submissionsVersion]);

  const rawStudentHwSubs = useMemo(() => {
    const effId = studentId || (targetStudent as any)?.code || 'u-4';
    const effCode = (targetStudent as any)?.code || studentId || 'u-4';
    return getStudentHomeworkSubmissions({
      studentId: effId,
      studentName,
      studentCode: effCode,
      assignments
    });
  }, [studentId, studentName, targetStudent, assignments, submissionsVersion]);

  // Danh sách môn học thuộc nhóm đánh giá bằng ĐIỂM SỐ của khối lớp học sinh (lọc đúng từ cấu hình Môn Học Của Khối)
  const scoredClassSubjects = useMemo(() => {
    const gradeLevel = (targetStudent as any)?.grade || (targetStudent as any)?.grade_level || (studentClassName ? `Khối ${extractGradeDigit(studentClassName)}` : '') || 'Khối 3';
    const classIdentifier = studentClassName || gradeLevel;
    const rawSubjects = getSubjectsForClassOrGrade(classIdentifier, classes);
    return rawSubjects.filter(isSubjectWithScore);
  }, [studentClassName, targetStudent, classes]);

  // Helper kiểm tra bài nộp trong tháng (hỗ trợ date string, title, submittedTime)
  const isSubmissionInMonth = (submittedTimeStr?: string, targetMonth?: string, titleStr?: string): boolean => {
    if (!targetMonth || targetMonth === 'all') return true;
    const targetMonthNum = parseInt(targetMonth, 10);
    const text = `${submittedTimeStr || ''} ${titleStr || ''}`.toLowerCase();
    
    if (text.includes(`tháng ${targetMonthNum}`) || text.includes(`tháng ${targetMonthNum.toString().padStart(2, '0')}`) || text.includes(`t${targetMonthNum}`)) {
      return true;
    }
    if (submittedTimeStr) {
      try {
        const d = new Date(submittedTimeStr);
        if (!isNaN(d.getTime())) {
          if (d.getMonth() + 1 === targetMonthNum) return true;
        }
      } catch {}
      const parts = submittedTimeStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (parts) {
        const m1 = parseInt(parts[2], 10);
        const m2 = parseInt(parts[1], 10);
        if (m1 === targetMonthNum || m2 === targetMonthNum) return true;
      }
    }
    if (text.includes('hôm nay') || text.includes('vừa xong') || text.includes('hôm qua')) {
      if (targetMonthNum === 9 || targetMonthNum === 10) return true;
    }
    return false;
  };

  // Tính toán dữ liệu các cột cho biểu đồ "So sánh điểm số các môn học"
  const barChartData = useMemo(() => {
    return scoredClassSubjects.map(subject => {
      const shortName = getSubjectShortName(subject);
      
      // Bảng màu môn học chuẩn hóa cố định trong hệ thống
      let subjectColor = '#2563eb'; // fallback Blue
      const sLower = subject.toLowerCase();
      if (sLower.includes('toán')) subjectColor = '#f59e0b'; // Amber
      else if (sLower.includes('tiếng việt')) subjectColor = '#e11d48'; // Rose
      else if (sLower.includes('tiếng anh') || sLower.includes('ngoại ngữ')) subjectColor = '#8b5cf6'; // Purple
      else if (sLower.includes('tin học')) subjectColor = '#2563eb'; // Blue
      else if (sLower.includes('công nghệ')) subjectColor = '#059669'; // Emerald
      else if (sLower.includes('khoa học')) subjectColor = '#0891b2'; // Cyan
      else if (sLower.includes('lịch sử') || sLower.includes('địa')) subjectColor = '#ea580c'; // Orange

      // Định kỳ: Giữa kỳ 1, Cuối kỳ 1, Giữa kỳ 2, Cuối kỳ 2 -> Lấy trực tiếp điểm bài kiểm tra định kỳ đó
      const matchedExams = rawStudentExamSubs.filter(ex => {
        if (!isSubjectMatch(ex.subject, subject)) return false;
        return isExamTypeMatch(ex.examType, ex.title, barFilter);
      });

      if (matchedExams.length > 0) {
        const mainExam = matchedExams[0];
        const scoreVal = Math.round(mainExam.score);
        const allExamDetails = matchedExams.map(e => ({
          title: e.title || 'Bài kiểm tra định kỳ',
          score: e.score,
          type: 'Đề định kỳ',
          time: e.submittedTime
        }));

        return {
          subject,
          shortName,
          score: scoreVal,
          displayScore: scoreVal,
          hasData: true,
          color: subjectColor,
          itemCount: matchedExams.length,
          calculationSummary: `${mainExam.title}: ${scoreVal}đ`,
          itemsDetail: allExamDetails,
          subtext: `${scoreVal}đ`
        };
      }

      return {
        subject,
        shortName,
        score: null,
        displayScore: 0,
        hasData: false,
        color: '#cbd5e1',
        itemCount: 0,
        calculationSummary: 'Chưa có bài kiểm tra',
        itemsDetail: [],
        subtext: 'Chưa có bài'
      };
    });
  }, [scoredClassSubjects, barFilter, barSelectedMonth, rawStudentExamSubs, rawStudentHwSubs]);

  // Kiểm tra có dữ liệu điểm hay không
  const hasAnyBarChartData = useMemo(() => {
    return barChartData.some(d => d.hasData && d.score !== null);
  }, [barChartData]);

  const evaluatedBarCount = useMemo(() => {
    return barChartData.filter(d => d.hasData && d.score !== null).length;
  }, [barChartData]);

  const barMaxScore = useMemo(() => {
    const scores = barChartData.filter(d => d.hasData && d.score !== null).map(d => d.score as number);
    return scores.length > 0 ? Math.max(...scores) : null;
  }, [barChartData]);

  const barMaxSubjects = useMemo(() => {
    if (barMaxScore === null) return [];
    return barChartData.filter(d => d.hasData && d.score === barMaxScore);
  }, [barChartData, barMaxScore]);

  // =========================================================================
  // DỮ LIỆU CHO BIỂU ĐỒ "XU HƯỚNG TIẾN BỘ THEO MÔN" (VIỆC 2)
  // =========================================================================
  const [selectedSubjectTrend, setSelectedSubjectTrend] = useState<string>('');

  // Tìm môn học có nhiều dữ liệu kiểm tra định kỳ nhất để chọn mặc định
  const defaultSubjectForTrend = useMemo(() => {
    if (scoredClassSubjects.length === 0) return '';
    let maxCount = -1;
    let bestSubject = scoredClassSubjects[0];
    for (const sub of scoredClassSubjects) {
      const count = rawStudentExamSubs.filter(e => isSubjectMatch(e.subject, sub)).length;
      if (count > maxCount) {
        maxCount = count;
        bestSubject = sub;
      }
    }
    return bestSubject;
  }, [scoredClassSubjects, rawStudentExamSubs]);

  const currentTrendSubject = selectedSubjectTrend && scoredClassSubjects.includes(selectedSubjectTrend)
    ? selectedSubjectTrend
    : defaultSubjectForTrend;

  // Dữ liệu 4 mốc định kỳ cố định cho đúng 1 môn đang chọn: Giữa kỳ 1 -> Cuối kỳ 1 -> Giữa kỳ 2 -> Cuối kỳ 2
  const subjectTrendData = useMemo(() => {
    const periods = [
      { key: 'giua_ki_1', period: 'Giữa kì 1' },
      { key: 'cuoi_ki_1', period: 'Cuối kì 1' },
      { key: 'giua_ki_2', period: 'Giữa kì 2' },
      { key: 'cuoi_ki_2', period: 'Cuối kì 2' }
    ];

    return periods.map(p => {
      const matched = rawStudentExamSubs.filter(e => 
        isSubjectMatch(e.subject, currentTrendSubject) && 
        isExamTypeMatch(e.examType, e.title, p.key)
      );

      if (matched.length > 0) {
        const exam = matched[0];
        const scoreVal = Math.round(exam.score);
        return {
          period: p.period,
          periodKey: p.key,
          score: scoreVal,
          examTitle: exam.title || 'Bài kiểm tra định kỳ',
          submittedTime: exam.submittedTime || '',
          hasData: true
        };
      }

      return {
        period: p.period,
        periodKey: p.key,
        score: null,
        examTitle: '',
        submittedTime: '',
        hasData: false
      };
    });
  }, [rawStudentExamSubs, currentTrendSubject]);

  // Các mốc có dữ liệu điểm thực tế
  const validTrendPoints = useMemo(() => {
    return subjectTrendData.filter(d => d.hasData && d.score !== null);
  }, [subjectTrendData]);

  // Chỉ báo xu hướng ở góc biểu đồ (So sánh mốc gần nhất với mốc liền trước)
  const subjectTrendIndicator = useMemo(() => {
    if (validTrendPoints.length < 2) return null;
    const lastPoint = validTrendPoints[validTrendPoints.length - 1];
    const prevPoint = validTrendPoints[validTrendPoints.length - 2];
    const diff = Math.round(((lastPoint.score as number) - (prevPoint.score as number)) * 10) / 10;

    if (diff > 0.05) {
      return {
        type: 'up',
        label: '↗ Đang tiến bộ',
        text: `Tăng +${formatScore(diff)}đ so với ${prevPoint.period} (${formatScore(prevPoint.score)}đ → ${formatScore(lastPoint.score)}đ)`,
        className: 'text-emerald-700 bg-emerald-50 border-emerald-300'
      };
    }
    if (diff < -0.05) {
      return {
        type: 'down',
        label: '↘ Cần chú ý thêm',
        text: `Giảm ${formatScore(Math.abs(diff))}đ so với ${prevPoint.period} (${formatScore(prevPoint.score)}đ → ${formatScore(lastPoint.score)}đ)`,
        className: 'text-amber-700 bg-amber-50 border-amber-300' // Màu cam theo đúng yêu cầu
      };
    }
    return {
      type: 'same',
      label: '→ Ổn định',
      text: `Duy trì phong độ ${formatScore(lastPoint.score)}đ so với ${prevPoint.period}`,
      className: 'text-blue-700 bg-blue-50 border-blue-300'
    };
  }, [validTrendPoints]);

  // Màu đường kẻ line đặc trưng của môn đang chọn
  const currentSubjectLineColor = useMemo(() => {
    const sLower = (currentTrendSubject || '').toLowerCase();
    if (sLower.includes('toán')) return '#f59e0b';
    if (sLower.includes('tiếng việt')) return '#e11d48';
    if (sLower.includes('tiếng anh') || sLower.includes('ngoại ngữ')) return '#8b5cf6';
    if (sLower.includes('tin học')) return '#2563eb';
    if (sLower.includes('công nghệ')) return '#059669';
    if (sLower.includes('khoa học')) return '#0891b2';
    if (sLower.includes('lịch sử') || sLower.includes('địa')) return '#ea580c';
    return '#6366f1';
  }, [currentTrendSubject]);

  // =========================================================================
  // DỮ LIỆU BIỂU ĐỒ CÁC MÔN ĐÁNH GIÁ BẰNG NHẬN XÉT (MỨC ĐỘ T / H / CHT)
  // =========================================================================
  const qualitativeSubjects = useMemo(() => {
    const gradeLevel = (targetStudent as any)?.grade || (targetStudent as any)?.grade_level || (studentClassName ? `Khối ${extractGradeDigit(studentClassName)}` : '') || 'Khối 3';
    const classIdentifier = studentClassName || gradeLevel;
    const rawSubjects = getSubjectsForClassOrGrade(classIdentifier, classes);
    return rawSubjects.filter(s => !isSubjectWithScore(s));
  }, [studentClassName, targetStudent, classes]);

  const qualitativeSubjectsData = useMemo(() => {
    const rawEvals = (targetStudent as any)?.evaluationsBySemester?.[barFilter] ||
                     (activeDbStudent as any)?.evaluationsBySemester?.[barFilter] ||
                     (targetStudent as any)?.evaluations ||
                     (activeDbStudent as any)?.evaluations || {};

    return qualitativeSubjects.map(subject => {
      const shortName = getSubjectShortName(subject);
      const colorStyles = getSubjectColorStyles(subject);

      // Tìm trong hocBaSummary
      const subBreakdown = hocBaSummary.subjects.find(s => isSubjectMatch(s.subject, subject));

      let manualDat: 'T' | 'H' | 'CHT' | null = null;
      let commentText = '';

      for (const [subjKey, evalVal] of Object.entries(rawEvals as Record<string, any>)) {
        if (isSubjectMatch(subjKey, subject)) {
          if (evalVal && ['T', 'H', 'CHT'].includes(evalVal.dat)) {
            manualDat = evalVal.dat;
            if (evalVal.comment) commentText = evalVal.comment;
          }
          break;
        }
      }

      let status: 'T' | 'H' | 'CHT' | null = manualDat;
      let hasData = Boolean(manualDat);

      if (!status && subBreakdown && subBreakdown.hasRealData && subBreakdown.status) {
        status = subBreakdown.status;
        hasData = true;
        if (subBreakdown.note && !subBreakdown.note.includes('Chưa có')) {
          commentText = subBreakdown.note;
        }
      }

      let levelLabel = 'Chưa có đánh giá';
      let levelBadgeBg = 'bg-slate-100 text-slate-500 border-slate-200';
      let barColor = 'bg-slate-300';
      let barWidthPct = 0;
      let iconEmoji = '🌱';

      if (status === 'T') {
        levelLabel = 'Hoàn thành Tốt';
        levelBadgeBg = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
        barColor = 'bg-emerald-500';
        barWidthPct = 100;
        iconEmoji = '🌟';
      } else if (status === 'H') {
        levelLabel = 'Hoàn thành';
        levelBadgeBg = 'bg-blue-100 text-blue-800 border-blue-300 font-bold';
        barColor = 'bg-blue-500';
        barWidthPct = 70;
        iconEmoji = '👍';
      } else if (status === 'CHT') {
        levelLabel = 'Cần cố gắng thêm';
        levelBadgeBg = 'bg-amber-100 text-amber-800 border-amber-300 font-bold'; // Vàng/cam, không dùng đỏ
        barColor = 'bg-amber-500';
        barWidthPct = 40;
        iconEmoji = '💪';
      }

      return {
        subject,
        shortName,
        status,
        hasData,
        levelLabel,
        levelBadgeBg,
        barColor,
        barWidthPct,
        iconEmoji,
        commentText: commentText || (hasData ? `Đã hoàn thành các nội dung rèn luyện môn ${subject}` : 'Chưa có ghi nhận đánh giá định kỳ trong đợt này'),
        emoji: colorStyles.emoji || '📚'
      };
    });
  }, [qualitativeSubjects, barFilter, targetStudent, activeDbStudent, hocBaSummary]);

  const qualitativeCounts = useMemo(() => {
    const tCount = qualitativeSubjectsData.filter(d => d.status === 'T').length;
    const hCount = qualitativeSubjectsData.filter(d => d.status === 'H').length;
    const chtCount = qualitativeSubjectsData.filter(d => d.status === 'CHT').length;
    const evaluatedCount = qualitativeSubjectsData.filter(d => d.hasData).length;
    return { tCount, hCount, chtCount, evaluatedCount, totalCount: qualitativeSubjectsData.length };
  }, [qualitativeSubjectsData]);

  // Find max and min scores for visual highlights among evaluated subjects
  const evaluatedSubjects = activeSubjects.filter(s => s.score !== null && s.score !== undefined);
  const maxScore = evaluatedSubjects.length > 0 ? Math.max(...evaluatedSubjects.map(s => s.score as number)) : null;
  const minScore = evaluatedSubjects.length > 0 ? Math.min(...evaluatedSubjects.map(s => s.score as number)) : null;
  const maxSubjects = maxScore !== null ? evaluatedSubjects.filter(s => s.score === maxScore) : [];
  const minSubjects = minScore !== null ? evaluatedSubjects.filter(s => s.score === minScore) : [];

  // Soft, child-friendly color palette for normal bars
  const SOFT_COLORS = [
    '#38bdf8', // Sky
    '#818cf8', // Indigo
    '#a78bfa', // Purple
    '#f472b6', // Pink
    '#2dd4bf', // Teal
    '#60a5fa', // Blue
    '#c084fc', // Violet
    '#4ade80', // Green
    '#fb923c'  // Orange
  ];

  // Incentive Badges Filter & Modal States
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [selectedBadgeModal, setSelectedBadgeModal] = useState<{
    id: string;
    name: string;
    icon: string;
    category: string;
    description: string;
    conditionText: string;
    isUnlocked: boolean;
    currentValue: number;
    targetValue: number;
    unit: string;
    progressPct: number;
    colorScheme: string;
    rewardExp: string;
    statusLabel: string;
    quote: string;
    customProgressText?: string;
    customProgressSubtext?: string;
  } | null>(null);

  // Read student game profile from localStorage
  const studentGameProfile = useMemo(() => {
    return getStudentGameProfile(studentId, studentName);
  }, [studentId, studentName]);

  // Calculate 7 Incentive Badges 100% from REAL student activity & evaluation data
  const studentIncentiveBadges = useMemo(() => {
    // 1. Chăm chỉ nộp bài (Attendance / Homework submissions)
    const hwCompleted = hocBaSummary.homeworkCompletedCount ?? hocBaSummary.attendance.homeworkCompleted ?? 0;
    const hwTarget = 3;
    const isHwUnlocked = hwCompleted >= hwTarget;
    const hwProgress = Math.min(100, Math.round((hwCompleted / hwTarget) * 100));

    // 2. Vườn hoa điểm 10 (10-Score Flowers)
    const hoaCount = hocBaSummary.hoaDiem10Count || 0;
    const hoaTarget = 2;
    const isHoaUnlocked = hoaCount >= 1;
    const hoaProgress = Math.min(100, Math.round((hoaCount / hoaTarget) * 100));

    // 3. Chiến binh Đấu Trường (Game EXP / Coins / Level)
    const currentExp = studentGameProfile.currentExp || 0;
    const currentCoins = studentGameProfile.coins || targetStudent?.coins || 0;
    const currentLvl = studentGameProfile.level || 1;
    const isArenaUnlocked = currentLvl >= 2 || currentExp >= 50 || currentCoins >= 50;
    const arenaTarget = 100;
    const arenaMetric = Math.max(currentExp, currentCoins);
    const arenaProgress = Math.min(100, Math.round((arenaMetric / arenaTarget) * 100));

    // 4. Kiên trì luyện đề (Exam Submissions - Đếm số đề kiểm tra thực tế đã hoàn thành)
    const examCompletedCount = hocBaSummary.examsCompletedCount ?? 0;
    const examTarget = 2;
    const isExamUnlocked = examCompletedCount >= examTarget;
    const examProgress = Math.min(100, Math.round((examCompletedCount / examTarget) * 100));

    // 5. Nhà thám hiểm 5E (E-Learning 5E Lessons)
    const lesCompleted = hocBaSummary.attendance.lessonsCompleted || 0;
    const isLesUnlocked = lesCompleted >= 1;
    const lesTarget = 1;
    const lesProgress = Math.min(100, Math.round((lesCompleted / lesTarget) * 100));

    // 6. Ngôi sao Toàn diện (Xếp loại học bạ đạt Hoàn thành Tốt hoặc Hoàn thành Xuất sắc dựa trên các môn có dữ liệu thực tế)
    const overallClassResult = calculateOverallClassification({
      studentId,
      studentName,
      className: studentClassName,
      hocBaSummary,
      evaluations: (activeDbStudent as any)?.evaluations || (targetStudent as any)?.evaluations
    });

    // 7. Tự chủ Mục tiêu (Completed Personal Goals)
    const isGoalUnlocked = completedGoalsCount >= 1;
    const goalTarget = Math.max(1, goals.length);
    const goalProgress = Math.min(100, Math.round((completedGoalsCount / goalTarget) * 100));

    // Debug log tiến độ nộp bài & đề thi theo yêu cầu kiểm tra (Việc 3)
    console.log(
      `🎖️ [HỌC BẠ SỐ - TIẾN ĐỘ HUY HIỆU] Học sinh: "${studentName}" (ID: "${studentId}", Code: "${(targetStudent as any)?.code || ''}", Lớp: "${studentClassName}"):` +
      `\n  - Chăm chỉ nộp bài: ${hwCompleted}/${hwTarget} bài tập (Đã đạt: ${isHwUnlocked})` +
      `\n  - Kiên trì luyện đề: ${examCompletedCount}/${examTarget} đề thi (Đã đạt: ${isExamUnlocked})`
    );

    // Debug log chi tiết danh sách Bài Tập & Đề Thi Điểm 10 theo yêu cầu kiểm tra (Việc 5)
    console.log(
      `🌸 [HỌC BẠ SỐ - VƯỜN HOA ĐIỂM 10] Học sinh: "${studentName}" (ID: "${studentId}", Code: "${(targetStudent as any)?.code || ''}"):` +
      `\n  - Tổng số Hoa Điểm 10 thực tế: ${hoaCount} (Đã đạt: ${isHoaUnlocked})` +
      `\n  - Danh sách Bài Tập Điểm 10 (${hocBaSummary.hoaDiem10HomeworkList?.length || 0}):`, hocBaSummary.hoaDiem10HomeworkList || [],
      `\n  - Danh sách Đề Kiểm Tra Điểm 10 (${hocBaSummary.hoaDiem10ExamList?.length || 0}):`, hocBaSummary.hoaDiem10ExamList || []
    );

    return [
      {
        id: 'badge-cham-chi',
        name: 'CHĂM CHỈ NỘP BÀI',
        icon: '📚',
        category: 'Chuyên cần',
        description: 'Hoàn thành và nộp đầy đủ các bài tập tự luyện được giao trên hệ thống.',
        conditionText: 'Hoàn thành từ 3 bài tập trở lên hoặc đạt tỷ lệ chuyên cần bài tập ≥ 80%',
        isUnlocked: isHwUnlocked,
        currentValue: hwCompleted,
        targetValue: hwTarget,
        unit: 'bài tập',
        progressPct: isHwUnlocked ? 100 : hwProgress,
        colorScheme: 'emerald',
        rewardExp: '+100 EXP',
        statusLabel: isHwUnlocked ? (hwCompleted >= hwTarget ? 'Xuất Sắc 🌟' : 'Đã Đạt 🏆') : `Còn thiếu ${Math.max(1, hwTarget - hwCompleted)} bài`,
        quote: '“Kiến tha lâu đầy tổ” — Sự chăm chỉ nộp bài mỗi ngày giúp em tích lũy hành trang vững vàng!'
      },
      {
        id: 'badge-hoa-diem-10',
        name: 'VƯỜN HOA ĐIỂM 10',
        icon: '🌸',
        category: 'Thành tích',
        description: 'Đạt điểm số 10 tuyệt đối trong các bài kiểm tra, bài tập hoặc bài học 5E.',
        conditionText: 'Đạt từ 1 Bông Hoa Điểm 10 trở lên trong quá trình học tập',
        isUnlocked: isHoaUnlocked,
        currentValue: hoaCount,
        targetValue: hoaTarget,
        unit: 'bông hoa',
        progressPct: isHoaUnlocked ? 100 : hoaProgress,
        colorScheme: 'rose',
        rewardExp: '+150 EXP',
        statusLabel: isHoaUnlocked ? `${hoaCount} Bông Hoa 🌸` : 'Chưa có hoa điểm 10',
        quote: '“Mỗi bông hoa điểm 10 là một niềm tự hào rạng rỡ của em và thầy cô!”'
      },
      {
        id: 'badge-dau-truong',
        name: 'CHIẾN BINH ĐẤU TRƯỜNG',
        icon: '🛡️',
        category: 'Đấu trường',
        description: 'Tích cực tham gia trò chơi trí tuệ, flashcard và tích lũy điểm thưởng Xu/EXP.',
        conditionText: 'Đạt Cấp độ 2 (Level 2) hoặc tích lũy từ 50 EXP / 50 Xu trở lên',
        isUnlocked: isArenaUnlocked,
        currentValue: arenaMetric,
        targetValue: arenaTarget,
        unit: 'EXP/Xu',
        progressPct: isArenaUnlocked ? 100 : arenaProgress,
        colorScheme: 'amber',
        rewardExp: '+200 EXP',
        statusLabel: isArenaUnlocked ? `Level ${currentLvl} ⚡` : `Tiến độ ${arenaMetric}/${arenaTarget}`,
        quote: '“Dũng cảm thử thách, nhanh trí giải đố — Em là chiến binh tri thức cừ khôi!”'
      },
      {
        id: 'badge-kien-tri',
        name: 'KIÊN TRÌ LUYỆN ĐỀ',
        icon: '🧗',
        category: 'Rèn luyện',
        description: 'Chủ động tham gia các bài kiểm tra định kỳ hoặc thường xuyên để rèn luyện.',
        conditionText: 'Hoàn thành từ 2 bài kiểm tra trên hệ thống',
        isUnlocked: isExamUnlocked,
        currentValue: examCompletedCount,
        targetValue: examTarget,
        unit: 'đề thi',
        progressPct: isExamUnlocked ? 100 : examProgress,
        colorScheme: 'blue',
        rewardExp: '+120 EXP',
        statusLabel: isExamUnlocked ? `${examCompletedCount} Bài Thi ✨` : `Cần thêm ${Math.max(1, examTarget - examCompletedCount)} bài`,
        quote: '“Vượt qua thử thách kiểm tra giúp em ngày càng tự tin và vững vàng hơn!”'
      },
      {
        id: 'badge-tham-hiem-5e',
        name: 'NHÀ THÁM HIỂM 5E',
        icon: '🚀',
        category: 'E-Learning',
        description: 'Tự giác trải nghiệm bài giảng E-Learning và hoàn thành chặng Đánh giá 5E.',
        conditionText: 'Hoàn thành trọn vẹn ít nhất 1 bài giảng E-Learning mô hình 5E',
        isUnlocked: isLesUnlocked,
        currentValue: lesCompleted,
        targetValue: lesTarget,
        unit: 'bài 5E',
        progressPct: isLesUnlocked ? 100 : lesProgress,
        colorScheme: 'purple',
        rewardExp: '+100 EXP',
        statusLabel: isLesUnlocked ? `${lesCompleted} Bài 5E 🚀` : 'Chưa làm bài 5E',
        quote: '“5E: Gắn kết - Khám phá - Giải thích - Củng cố - Đánh giá giúp em hiểu sâu sắc bài học!”'
      },
      {
        id: 'badge-ngoi-sao-toan-dien',
        name: 'NGÔI SAO TOÀN DIỆN',
        icon: '🏆',
        category: 'Học tập',
        description: 'Duy trì phong độ học tập xuất sắc toàn diện với kết quả xếp loại học bạ ấn tượng.',
        conditionText: 'Đạt Xếp loại học bạ từ Hoàn thành Tốt hoặc Hoàn thành Xuất sắc (chỉ xét trên các môn đã có đánh giá)',
        isUnlocked: overallClassResult.isUnlocked,
        currentValue: overallClassResult.evaluatedCount,
        targetValue: overallClassResult.totalCount,
        unit: 'môn đánh giá',
        progressPct: overallClassResult.progressPct,
        colorScheme: 'gold',
        rewardExp: '+300 EXP',
        statusLabel: overallClassResult.statusLabel,
        customProgressText: overallClassResult.progressText,
        customProgressSubtext: overallClassResult.progressSubtext,
        quote: '“Ngôi sao sáng ngời — Em là tấm gương sáng về học tập đều khắp các môn!”'
      },
      {
        id: 'badge-tu-chu-muc-tieu',
        name: 'TỰ CHỦ MỤC TIÊU',
        icon: '🎯',
        category: 'Kỹ năng',
        description: 'Tự lập kế hoạch rèn luyện và kiên trì hoàn thành mục tiêu đề ra.',
        conditionText: 'Đánh dấu hoàn thành ít nhất 1 mục tiêu học tập trong sổ tay cá nhân',
        isUnlocked: isGoalUnlocked,
        currentValue: completedGoalsCount,
        targetValue: goalTarget,
        unit: 'mục tiêu',
        progressPct: isGoalUnlocked ? 100 : goalProgress,
        colorScheme: 'emerald',
        rewardExp: '+100 EXP',
        statusLabel: isGoalUnlocked ? `${completedGoalsCount}/${goals.length} Đã Xong` : 'Chưa có mục tiêu xong',
        quote: '“Người có mục tiêu rõ ràng và tự giác thực hiện sẽ chạm tới mọi ước mơ!”'
      }
    ];
  }, [hocBaSummary, studentGameProfile, targetStudent, activeDbStudent, completedGoalsCount, goals.length, studentId, studentName, studentClassName]);

  const unlockedBadgesCount = studentIncentiveBadges.filter(b => b.isUnlocked).length;

  const filteredBadges = useMemo(() => {
    if (badgeFilter === 'unlocked') return studentIncentiveBadges.filter(b => b.isUnlocked);
    if (badgeFilter === 'locked') return studentIncentiveBadges.filter(b => !b.isUnlocked);
    return studentIncentiveBadges;
  }, [studentIncentiveBadges, badgeFilter]);

  return (
    <div className="space-y-6 w-full pb-12 animate-in fade-in duration-300">
      
      {/* ========================================================================= */}
      {/* 1. KHỐI HEADER HỌC SINH + KHÍCH LỆ HỌC TẬP + KẾT QUẢ HỌC TẬP (VIỆC 6 & VIỆC 8) */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-700 rounded-[28px] p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden border border-teal-300/40">
        {/* Background Ambient Glows & Sparkles Decor */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-200 via-teal-400 to-transparent pointer-events-none" />
        <div className="absolute -right-8 -top-8 w-64 h-64 bg-emerald-400/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-56 h-56 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />
        
        {/* Subtle background star sparkles */}
        <div className="absolute top-4 right-1/4 text-emerald-200/30 text-lg pointer-events-none select-none">✦</div>
        <div className="absolute bottom-4 left-1/4 text-teal-200/30 text-base pointer-events-none select-none">✧</div>
        <div className="absolute top-1/2 right-1/3 text-amber-300/25 text-sm pointer-events-none select-none">★</div>
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Avatar + Thông tin cốt lõi ngắn gọn & Câu động viên (Việc 8) */}
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
            <div className="relative shrink-0">
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center text-4xl shadow-2xl border border-white/35 ring-4 ring-white/15">
                🐰
              </div>
              <span className="absolute -bottom-2 -right-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 font-black text-[10px] shadow-md border border-amber-100">
                {studentClassName ? `LỚP ${studentClassName.replace(/^Lớp\s+/i, '').toUpperCase()}` : 'LỚP 3A'}
              </span>
            </div>

            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-widest text-teal-100 bg-white/20 backdrop-blur-md px-3 py-0.5 rounded-full border border-white/30 shadow-xs">
                  📊 HỌC BẠ SỐ CÁ NHÂN
                </span>
                <span className="text-[10px] font-bold text-amber-200 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-300/20">
                  Năm học 2026 - 2027
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-heading tracking-tight text-white truncate">
                {studentName}
              </h2>
              {/* Câu động viên khích lệ thân thiện, tích cực theo bối cảnh (Việc 8) */}
              <p className="text-xs sm:text-sm text-teal-100/95 font-medium flex items-center gap-2 leading-relaxed">
                <span>{encouragementMessage}</span>
              </p>
            </div>
          </div>

          {/* Ô KẾT QUẢ HỌC TẬP dạng định tính / sao ở góc phải banner theo Việc 6 */}
          <div className="bg-white/15 backdrop-blur-md border border-white/30 rounded-3xl p-5 text-center shrink-0 w-full sm:w-auto shadow-2xl shadow-teal-950/20 sm:min-w-[220px]">
            <span className="text-[11px] text-teal-100 block font-black uppercase tracking-wider">
              KẾT QUẢ HỌC TẬP
            </span>
            <span className="text-2xl sm:text-3xl font-black font-heading text-amber-300 tracking-tight drop-shadow-md block my-1.5 whitespace-nowrap">
              {qualitativeResult.label}
            </span>
            <span className="inline-block text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-500/40 text-emerald-100 border border-emerald-300/30">
              {qualitativeResult.subText}
            </span>
          </div>
        </div>

        {/* Dòng rút gọn & Link xem thông tin hồ sơ chi tiết (Việc 8) */}
        <div className="mt-5 pt-3.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs text-teal-100/80">
          <div className="flex items-center gap-2 text-[11px] text-teal-200/90">
            <span>✨ Hãy cùng cố gắng và tích lũy thật nhiều bông hoa điểm 10 rực rỡ nhé!</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAdminDetails(!showAdminDetails)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-100 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-colors cursor-pointer border border-white/20"
          >
            <Info className="w-3.5 h-3.5 text-teal-300" />
            <span>{showAdminDetails ? 'Ẩn thông tin hồ sơ' : 'Xem thông tin chi tiết'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdminDetails ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Khối chi tiết hành chính khi học sinh/phụ huynh muốn tra cứu */}
        {showAdminDetails && (
          <div className="mt-3 pt-3 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/15">
              <span className="text-teal-200 text-[10px] font-bold block uppercase tracking-wider">Mã học sinh</span>
              <span className="font-extrabold text-white text-xs mt-0.5 font-mono">{targetStudent?.code || targetStudent?.id || 'HS-01'}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/15">
              <span className="text-teal-200 text-[10px] font-bold block uppercase tracking-wider">Ngày sinh</span>
              <span className="font-extrabold text-white text-xs mt-0.5">{targetStudent?.dob || 'Chưa cập nhật'}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/15">
              <span className="text-teal-200 text-[10px] font-bold block uppercase tracking-wider">Giới tính</span>
              <span className="font-extrabold text-white text-xs mt-0.5">{targetStudent?.gender || 'Nam'}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/15">
              <span className="text-teal-200 text-[10px] font-bold block uppercase tracking-wider">Phụ huynh</span>
              <span className="font-extrabold text-white text-xs mt-0.5 truncate">{targetStudent?.parentName || (studentName ? `Phụ huynh em ${studentName}` : 'Chưa cập nhật')}</span>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. KHỐI "CHỈ SỐ RÈN LUYỆN & HỌC TẬP" */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <TrendingUp className="w-4.5 h-4.5 text-teal-600" /> Chỉ Số Rèn Luyện & Học Tập
          </h3>
          <span className="text-[11px] font-bold text-slate-500">
            {hocBaSummary.hasData 
              ? `Đã đánh giá ${hocBaSummary.evaluatedSubjectsCount}/${hocBaSummary.totalSubjectsCount} môn học` 
              : 'Chưa có môn nào được chấm'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: KẾT QUẢ HỌC TẬP (Định tính theo Việc 6) */}
          <div className="bg-teal-50/70 border border-teal-200/80 rounded-2xl p-5 text-center space-y-1 hover:shadow-xs transition-shadow">
            <span className="text-xs font-bold text-teal-800 uppercase tracking-wider block">KẾT QUẢ HỌC TẬP</span>
            <span className="text-xl sm:text-2xl font-black font-heading text-teal-700 block py-1.5 whitespace-nowrap">
              {qualitativeResult.label}
            </span>
            <span className="text-[11px] text-teal-600 font-medium block">
              {qualitativeResult.subText}
            </span>
          </div>

          {/* Card 2: Hoa Điểm 10 */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 text-center space-y-1 hover:shadow-xs transition-shadow">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">Hoa Điểm 10</span>
            <div className="flex items-center justify-center gap-1.5 text-3xl sm:text-4xl font-black font-heading text-amber-600">
              <Flame className="w-8 h-8 text-amber-500 fill-amber-500" />
              <span>{hocBaSummary.hoaDiem10Count}</span>
            </div>
            <span className="text-[11px] text-amber-600 font-medium">Bông hoa thi đua</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MỚI: KHỐI "BIỂU ĐỒ ĐÁNH GIÁ TIẾN ĐỘ" (2 BIỂU ĐỒ TRỰC QUAN CẠNH NHAU) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <BarChart2 className="w-4.5 h-4.5 text-teal-600" /> Biểu Đồ Đánh Giá Tiến Độ
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Trực quan hóa điểm số từng môn và quỹ đạo tiến bộ qua các mốc đánh giá
            </p>
          </div>
          <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200/70 shrink-0">
            {selectedExamFilter === 'all' 
              ? 'Tất cả bài kiểm tra' 
              : EXAM_FILTER_OPTIONS.find(o => o.key === selectedExamFilter)?.label}
          </span>
        </div>

        {/* 2 Charts side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Bar Chart - Subject Scores Comparison (Nâng cấp theo yêu cầu) */}
          <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-4.5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  So sánh điểm số các môn học
                </h4>
                <span className="text-[10px] font-bold text-slate-500">
                  {hasAnyBarChartData ? `Đã có điểm ${evaluatedBarCount}/${scoredClassSubjects.length} môn` : 'Chưa có dữ liệu'}
                </span>
              </div>

              {/* Bộ lọc dạng chip ngay trên biểu đồ */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
                  {BAR_FILTER_CHIPS.map(chip => {
                    const isSelected = barFilter === chip.key;
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setBarFilter(chip.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Highlight badge môn cao nhất hoặc câu động viên khi chưa có dữ liệu */}
              {scoredClassSubjects.length === 0 ? (
                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-amber-700 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/60 animate-in fade-in">
                  <span>🌱</span>
                  <span>Chưa có môn điểm số nào được cấu hình cho khối này.</span>
                </div>
              ) : hasAnyBarChartData && barMaxScore !== null ? (
                <div className="flex items-center gap-2 flex-wrap pt-0.5 text-[10px]">
                  <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Môn cao nhất ({barMaxScore}đ): {barMaxSubjects.map(s => s.subject).join(', ')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-teal-700 bg-teal-50/80 px-2.5 py-1 rounded-lg border border-teal-200/60 animate-in fade-in">
                  <span>🌱</span>
                  <span>Chưa có bài kiểm tra/bài tập ở đợt này. Hãy tiếp tục ôn tập và tự tin làm bài nhé! ✨</span>
                </div>
              )}
            </div>

            {/* Recharts Bar Chart bọc trong container cho phép cuộn ngang */}
            <div className="w-full overflow-x-auto pb-1 scrollbar-thin">
              <div className="min-w-[340px] sm:min-w-[380px] h-60 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barChartData}
                    margin={{ top: 10, right: 10, left: -25, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="shortName"
                      tick={<CustomBarXAxisTick chartData={barChartData} />}
                      interval={0}
                      height={36}
                    />
                    <YAxis
                      domain={[0, 10]}
                      ticks={[0, 2, 4, 6, 8, 10]}
                      tick={{ fontSize: 10, fontWeight: 600, fill: '#64748b' }}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Bar dataKey="displayScore" radius={[6, 6, 0, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell
                          key={`bar-cell-${index}`}
                          fill={entry.hasData ? entry.color : '#cbd5e1'}
                          className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Chart 2: Line Chart - Xu hướng tiến bộ theo môn (VIỆC 2) */}
          <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-4.5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Xu hướng tiến bộ theo môn
                  </h4>
                  {/* Dropdown chọn môn học cụ thể (Lọc đúng từ cấu hình Môn Học Của Khối) */}
                  {scoredClassSubjects.length > 0 ? (
                    <div className="relative">
                      <select
                        value={currentTrendSubject}
                        onChange={(e) => setSelectedSubjectTrend(e.target.value)}
                        className="pl-2.5 pr-7 py-1 rounded-lg text-xs font-extrabold bg-white border border-teal-300 text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer appearance-none shadow-2xs"
                      >
                        {scoredClassSubjects.map(subj => (
                          <option key={subj} value={subj}>
                            {subj}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-teal-600 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  ) : (
                    <span className="text-[10.5px] font-bold text-amber-800 bg-amber-100/90 px-2.5 py-0.5 rounded-lg border border-amber-200">
                      Chưa có môn điểm số nào được cấu hình cho khối này
                    </span>
                  )}
                </div>

                {/* Chỉ báo xu hướng ở góc biểu đồ */}
                {subjectTrendIndicator && (
                  <span className={`inline-flex items-center gap-1 font-extrabold text-[11px] px-2.5 py-0.5 rounded-full border shadow-2xs ${subjectTrendIndicator.className}`}>
                    {subjectTrendIndicator.label}
                  </span>
                )}
              </div>

              {/* Mô tả phụ / câu động viên */}
              {scoredClassSubjects.length === 0 ? (
                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-amber-700 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/60 animate-in fade-in">
                  <span>🌱</span>
                  <span>Chưa có môn điểm số nào được cấu hình cho khối này.</span>
                </div>
              ) : subjectTrendIndicator ? (
                <p className="text-[11px] text-slate-500 pt-0.5 leading-tight">
                  {subjectTrendIndicator.text} • Bài kiểm tra định kỳ môn {currentTrendSubject}
                </p>
              ) : validTrendPoints.length > 0 ? (
                <p className="text-[11px] text-slate-500 pt-0.5 leading-tight">
                  Điểm bài kiểm tra định kỳ môn {currentTrendSubject} qua các mốc đánh giá
                </p>
              ) : (
                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-teal-700 bg-teal-50/80 px-2.5 py-1 rounded-lg border border-teal-200/60 animate-in fade-in">
                  <span>🌱</span>
                  <span>Chưa có bài kiểm tra định kỳ môn {currentTrendSubject}. Hãy tự tin ôn tập nhé! ✨</span>
                </div>
              )}
            </div>

            {/* Recharts Line Chart */}
            <div className="w-full h-60 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={subjectTrendData}
                  margin={{ top: 15, right: 20, left: -25, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
                    height={30}
                  />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    tick={{ fontSize: 10, fontWeight: 600, fill: '#64748b' }}
                  />
                  <ReferenceLine
                    y={9.0}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Chuẩn Xuất sắc (9.0đ)',
                      position: 'insideTopRight',
                      fill: '#059669',
                      fontSize: 10,
                      fontWeight: 700
                    }}
                  />
                  <Tooltip content={<CustomLineTooltip subjectName={currentTrendSubject} />} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={currentSubjectLineColor}
                    strokeWidth={3.5}
                    dot={{ r: 5, fill: currentSubjectLineColor, stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: currentSubjectLineColor, stroke: '#e0e7ff', strokeWidth: 3 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Chart 3: Biểu đồ kết quả rèn luyện các môn đánh giá bằng nhận xét (T / H / CHT) */}
        {qualitativeSubjects.length > 0 && (
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <span>📋 Kết quả rèn luyện các môn đánh giá bằng nhận xét</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Đánh giá mức độ: Hoàn thành Tốt (T) • Hoàn thành (H) • Cần cố gắng thêm (CHT) — Căn cứ Thông tư 27/2020/TT-BGDĐT
                </p>
              </div>

              {/* Thống kê nhanh số lượng môn đạt mức độ */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                  🌟 Hoàn thành Tốt: {qualitativeCounts.tCount}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                  👍 Hoàn thành: {qualitativeCounts.hCount}
                </span>
                {qualitativeCounts.chtCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                    💪 Cần cố gắng: {qualitativeCounts.chtCount}
                  </span>
                )}
              </div>
            </div>

            {/* Danh sách thanh ngang (Horizontal Bars) từng môn nhận xét */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {qualitativeSubjectsData.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 hover:shadow-xs transition-shadow"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{item.emoji}</span>
                      <span className="font-bold text-xs text-slate-800 truncate">{item.subject}</span>
                    </div>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${item.levelBadgeBg}`}>
                      <span>{item.iconEmoji}</span>
                      <span>{item.levelLabel}</span>
                    </span>
                  </div>

                  {/* Visual Progress Bar representing qualitative level */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${item.barColor}`}
                      style={{ width: `${item.barWidthPct}%` }}
                    />
                  </div>

                  <p className="text-[10.5px] text-slate-500 italic truncate pt-0.5">
                    {item.commentText}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. KHỐI "HUY HIỆU KHÍCH LỆ CỦA EM" (GAMIFICATION & VINH DANH DỰA TRÊN DỮ LIỆU THẬT) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
        {/* Header with Title + Unlocked Summary Counter */}
        <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2 font-heading">
              <Award className="w-5 h-5 text-amber-500 fill-amber-500 shrink-0" /> Huy Hiệu Khích Lệ Của Em
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Hệ thống vinh danh thành tích học tập & hoạt động được tính tự động từ dữ liệu thực tế
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-slate-950 font-black text-xs shadow-xs flex items-center gap-1.5 border border-amber-300">
              <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950" />
              Đã mở khóa: {unlockedBadgesCount}/{studentIncentiveBadges.length} Huy hiệu
            </span>
          </div>
        </div>

        {/* Disclaimer Note (Yêu cầu minh bạch: đây là huy hiệu khích lệ, không phải học bạ chính thức) */}
        <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/90 flex items-start gap-3 text-xs text-amber-950 leading-relaxed shadow-2xs">
          <div className="p-1 rounded-lg bg-amber-200/80 text-amber-800 shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-amber-900">🏅 Lưu ý minh bạch: </span>
            <span className="text-amber-900/90 font-medium">
              Đây là hệ thống huy hiệu khích lệ tinh thần học tập tự động trong ứng dụng (tương tự Ví Xu &amp; Cấp độ EXP), <b>không phải đánh giá học bạ chính thức của nhà trường hay Bộ GD&amp;ĐT</b>.
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <div className="flex items-center gap-1.5">
            {[
              { key: 'all', label: `Tất cả (${studentIncentiveBadges.length})` },
              { key: 'unlocked', label: `Đã đạt 🏆 (${unlockedBadgesCount})` },
              { key: 'locked', label: `Đang phấn đấu 🎯 (${studentIncentiveBadges.length - unlockedBadgesCount})` }
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setBadgeFilter(tab.key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  badgeFilter === tab.key
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-semibold text-slate-400 italic">
            * Bấm vào từng huy hiệu để xem chi tiết &amp; nhiệm vụ
          </span>
        </div>

        {/* Badges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          {filteredBadges.map((badge) => {
            const isUnlocked = badge.isUnlocked;
            
            // Color variations for unlocked badges
            const colorMap: Record<string, { bg: string; border: string; iconBg: string; text: string; badgeTag: string; bar: string }> = {
              emerald: {
                bg: 'bg-emerald-50/70',
                border: 'border-emerald-200/90 hover:border-emerald-400',
                iconBg: 'bg-emerald-100 border-emerald-300 ring-2 ring-emerald-200/50',
                text: 'text-emerald-950',
                badgeTag: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                bar: 'bg-gradient-to-r from-emerald-400 to-teal-500'
              },
              rose: {
                bg: 'bg-rose-50/70',
                border: 'border-rose-200/90 hover:border-rose-400',
                iconBg: 'bg-rose-100 border-rose-300 ring-2 ring-rose-200/50',
                text: 'text-rose-950',
                badgeTag: 'bg-rose-100 text-rose-800 border-rose-200',
                bar: 'bg-gradient-to-r from-rose-400 to-pink-500'
              },
              amber: {
                bg: 'bg-amber-50/70',
                border: 'border-amber-200/90 hover:border-amber-400',
                iconBg: 'bg-amber-100 border-amber-300 ring-2 ring-amber-200/50',
                text: 'text-amber-950',
                badgeTag: 'bg-amber-100 text-amber-900 border-amber-200',
                bar: 'bg-gradient-to-r from-amber-400 to-yellow-500'
              },
              blue: {
                bg: 'bg-sky-50/70',
                border: 'border-sky-200/90 hover:border-sky-400',
                iconBg: 'bg-sky-100 border-sky-300 ring-2 ring-sky-200/50',
                text: 'text-sky-950',
                badgeTag: 'bg-sky-100 text-sky-800 border-sky-200',
                bar: 'bg-gradient-to-r from-sky-400 to-blue-500'
              },
              cyan: {
                bg: 'bg-teal-50/70',
                border: 'border-teal-200/90 hover:border-teal-400',
                iconBg: 'bg-teal-100 border-teal-300 ring-2 ring-teal-200/50',
                text: 'text-teal-950',
                badgeTag: 'bg-teal-100 text-teal-800 border-teal-200',
                bar: 'bg-gradient-to-r from-teal-400 to-cyan-500'
              },
              purple: {
                bg: 'bg-purple-50/70',
                border: 'border-purple-200/90 hover:border-purple-400',
                iconBg: 'bg-purple-100 border-purple-300 ring-2 ring-purple-200/50',
                text: 'text-purple-950',
                badgeTag: 'bg-purple-100 text-purple-800 border-purple-200',
                bar: 'bg-gradient-to-r from-purple-400 to-indigo-500'
              },
              gold: {
                bg: 'bg-yellow-50/70',
                border: 'border-yellow-200/90 hover:border-yellow-400',
                iconBg: 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-200/50',
                text: 'text-yellow-950',
                badgeTag: 'bg-yellow-100 text-yellow-900 border-yellow-200',
                bar: 'bg-gradient-to-r from-amber-400 to-orange-400'
              }
            };

            const colors = colorMap[badge.colorScheme] || colorMap.emerald;

            return (
              <div
                key={badge.id}
                onClick={() => setSelectedBadgeModal(badge)}
                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-3 cursor-pointer group relative overflow-hidden ${
                  isUnlocked
                    ? `${colors.bg} ${colors.border} shadow-xs hover:shadow-md hover:-translate-y-0.5`
                    : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300 opacity-80 hover:opacity-100'
                }`}
              >
                {/* Subtle shine on unlocked */}
                {isUnlocked && (
                  <div className="absolute -top-10 -right-10 w-20 h-20 bg-white/40 rounded-full blur-xl pointer-events-none group-hover:scale-150 transition-transform" />
                )}

                {/* Top: Icon + Status Tag */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border transition-transform group-hover:scale-110 ${
                        isUnlocked
                          ? `${colors.iconBg} shadow-xs`
                          : 'bg-slate-200/70 border-slate-300 text-slate-400 grayscale'
                      }`}>
                        {badge.icon}
                      </div>
                      {!isUnlocked && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] border border-white shadow-xs">
                          <Lock className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight border shrink-0 ${
                      isUnlocked
                        ? colors.badgeTag
                        : 'bg-slate-200 text-slate-600 border-slate-300'
                    }`}>
                      {badge.statusLabel}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h4 className={`text-xs font-black uppercase tracking-wide ${
                    isUnlocked ? colors.text : 'text-slate-700'
                  }`}>
                    {badge.name}
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug line-clamp-2">
                    {badge.description}
                  </p>
                </div>

                {/* Bottom: Progress bar & info */}
                <div className="space-y-1.5 pt-2 border-t border-black/5">
                  <div className="flex items-start justify-between text-[10px] font-bold gap-1.5">
                    <span className={isUnlocked ? 'text-slate-700 font-extrabold shrink-0' : 'text-slate-500 shrink-0'}>
                      {badge.customProgressText ? 'Tiến độ' : (isUnlocked ? 'Đã hoàn thành' : 'Tiến độ')}
                    </span>
                    {badge.customProgressText ? (
                      <div className="text-right">
                        <span className={`text-[10px] sm:text-[10.5px] font-black block leading-tight ${isUnlocked ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {badge.customProgressText}
                        </span>
                        {badge.customProgressSubtext && (
                          <span className="text-[9px] text-slate-500 font-medium block leading-tight pt-0.5">
                            {badge.customProgressSubtext}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className={isUnlocked ? 'text-emerald-700 font-extrabold' : 'text-slate-600 font-mono font-extrabold'}>
                        {isUnlocked ? '100% 🏆' : `${badge.currentValue}/${badge.targetValue} ${badge.unit}`}
                      </span>
                    )}
                  </div>

                  {/* Progress track */}
                  <div className="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isUnlocked
                          ? colors.bar
                          : 'bg-slate-400'
                      }`}
                      style={{ width: `${badge.progressPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-semibold text-slate-400 pt-0.5">
                    <span>{badge.category}</span>
                    <span className="text-amber-600 font-bold">{badge.rewardExp}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Modal for Clicked Badge */}
        {selectedBadgeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border ${
                    selectedBadgeModal.isUnlocked
                      ? 'bg-amber-100 border-amber-300 ring-4 ring-amber-100 shadow-md'
                      : 'bg-slate-100 border-slate-200 grayscale'
                  }`}>
                    {selectedBadgeModal.icon}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      {selectedBadgeModal.category}
                    </span>
                    <h4 className="text-base font-black text-slate-900 font-heading">
                      {selectedBadgeModal.name}
                    </h4>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBadgeModal(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Ý nghĩa huy hiệu:</span>
                    <p className="text-slate-700 font-medium mt-0.5">{selectedBadgeModal.description}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Điều kiện đạt được:</span>
                    <p className="text-teal-800 font-extrabold mt-0.5">{selectedBadgeModal.conditionText}</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-900 font-bold text-xs">Trạng thái hiện tại:</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                      selectedBadgeModal.isUnlocked
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-200 text-slate-700 border-slate-300'
                    }`}>
                      {selectedBadgeModal.isUnlocked ? 'ĐÃ ĐẠT 🏆' : 'ĐANG PHẤN ĐẤU 🎯'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between text-[11px] text-amber-900 font-medium gap-2">
                    <span className="shrink-0">{selectedBadgeModal.customProgressText ? 'Xếp loại thực tế:' : 'Số liệu thực tế:'}</span>
                    {selectedBadgeModal.customProgressText ? (
                      <div className="text-right">
                        <span className="font-black text-xs text-amber-950 block">
                          {selectedBadgeModal.customProgressText}
                        </span>
                        {selectedBadgeModal.customProgressSubtext && (
                          <span className="text-[10px] text-amber-800/80 block pt-0.5">
                            {selectedBadgeModal.customProgressSubtext}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono font-extrabold">{selectedBadgeModal.currentValue} / {selectedBadgeModal.targetValue} {selectedBadgeModal.unit}</span>
                    )}
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-amber-200/70 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedBadgeModal.isUnlocked
                          ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${selectedBadgeModal.progressPct}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-teal-50/50 border border-teal-100 text-[11px] text-teal-800 italic text-center">
                  {selectedBadgeModal.quote}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedBadgeModal(null)}
                  className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition-all shadow-sm cursor-pointer"
                >
                  Đã hiểu &amp; Tiếp tục phấn đấu ✨
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* 6. KHỐI "NHẬN XÉT TỔNG KẾT TỪ GIÁO VIÊN & AI" */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <MessageSquare className="w-4.5 h-4.5 text-teal-600" /> Nhận xét tổng kết từ Giáo viên & AI
          </h3>
          <span className="text-[11px] font-bold text-slate-500">Giáo viên chủ nhiệm: <b className="text-slate-800 font-extrabold">{studentHomeroomTeacher}</b></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Lời nhận xét GVCN */}
          <div className="p-4.5 rounded-2xl bg-teal-50/70 border border-teal-200 text-slate-800 space-y-2">
            <p className="font-extrabold text-teal-900 flex items-center gap-1.5 text-xs">
              <Check className="w-4 h-4 text-teal-600" /> Nhận xét của Giáo viên chủ nhiệm:
            </p>
            <p className="text-slate-700 leading-relaxed italic bg-white/80 p-3 rounded-xl border border-teal-100">
              {studentOfficialComment?.hasCommented 
                ? `"${studentOfficialComment.strengths}${studentOfficialComment.reminders ? ` ${studentOfficialComment.reminders}` : ''}"`
                : "Giáo viên chưa có nhận xét cho em trong kỳ này."
              }
            </p>
          </div>

          {/* Lời nhận xét Chuyên cần & Nề nếp */}
          <div className="p-4.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-slate-800 space-y-2">
            <p className="font-extrabold text-amber-900 flex items-center gap-1.5 text-xs">
              <Sparkles className="w-4 h-4 text-amber-600" /> Nề nếp & Kỹ năng học tập:
            </p>
            <p className="text-slate-700 leading-relaxed italic bg-white/80 p-3 rounded-xl border border-amber-100">
              {studentOfficialComment?.hasCommented 
                ? ((studentOfficialComment as any).conductComment || "Tác phong học tập nghiêm túc, tham gia sôi nổi vào các hoạt động trải nghiệm và rèn luyện kỹ năng sống. Luôn tôn trọng thầy cô và đoàn kết, nhiệt tình giúp đỡ bạn bè trong lớp.")
                : "Giáo viên chưa có nhận xét về nề nếp cho em trong kỳ này."
              }
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. KHỐI "CỐ VẤN HỌC TẬP AI THÔNG MINH" */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Brain className="w-4.5 h-4.5 text-purple-600" /> Cố Vấn Học Tập AI Thông Minh
            </h3>
            <p className="text-xs text-slate-500">
              Ứng dụng mô hình Gemini để phân tích toàn diện, xây dựng lời khuyên và gợi ý lộ trình thích ứng.
            </p>
          </div>

          <button
            type="button"
            onClick={handleActivateAI}
            disabled={isAiLoading}
            className="px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>{isAiLoading ? 'Đang phân tích...' : isAiAdvisorActive ? 'Phân tích lại với AI' : 'Kích hoạt Cố vấn AI'}</span>
          </button>
        </div>

        {!isAiAdvisorActive && !isAiLoading ? (
          /* Placeholder khi chưa kích hoạt */
          <div className="py-12 px-6 text-center space-y-3 bg-slate-50/80 rounded-2xl border border-dashed border-slate-300">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-400 flex items-center justify-center mx-auto">
              <Brain className="w-8 h-8 opacity-60" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-700">
                Chưa có kết quả phân tích AI cho học sinh này
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Hãy bấm nút <b>"Kích hoạt Cố vấn AI"</b> ở trên để tổng hợp dữ liệu rèn luyện và xây dựng học bạ số thông minh.
              </p>
            </div>
          </div>
        ) : isAiLoading ? (
          <div className="py-12 text-center space-y-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 animate-pulse">
            <Sparkles className="w-8 h-8 text-indigo-600 mx-auto animate-spin" />
            <p className="text-xs font-bold text-indigo-900">
              AI Sư Phạm đang phân tích biểu đồ năng lực và tổng hợp kết quả học tập...
            </p>
          </div>
        ) : (
          /* Kết quả phân tích AI */
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-1.5">
                <span className="font-extrabold uppercase text-[11px] text-emerald-800 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" /> Điểm mạnh nổi trội:
                </span>
                <p className="text-emerald-900/90 leading-relaxed text-xs">
                  Tư duy logic Toán học xuất sắc ({maxScore}đ), khả năng đọc hiểu nhanh và diễn đạt lưu loát trong môn Tiếng Việt.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-950 space-y-1.5">
                <span className="font-extrabold uppercase text-[11px] text-amber-800 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-amber-600" /> Trọng tâm bồi dưỡng:
                </span>
                <p className="text-amber-900/90 leading-relaxed text-xs">
                  Tăng cường thời gian luyện tập gõ phím 10 ngón và thao tác phần mềm học tập môn Tin học khoảng 15 phút/ngày.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-indigo-950 space-y-1.5">
                <span className="font-extrabold uppercase text-[11px] text-indigo-800 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-indigo-600" /> Lộ trình 7 ngày tới:
                </span>
                <p className="text-indigo-900/90 leading-relaxed text-xs">
                  Tiếp tục duy trì giải các bài toán nâng cao 5E, tham gia thử thách Đấu trường tri thức để tích lũy thêm Hoa điểm 10.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 8. KHỐI "KẾ HOẠCH & MỤC TIÊU RÈN LUYỆN CÁ NHÂN" */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Target className="w-4.5 h-4.5 text-emerald-600" /> Kế Hoạch & Mục Tiêu Rèn Luyện Cá Nhân
          </h3>
          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
            {completedGoalsCount}/{goals.length} Hoàn thành
          </span>
        </div>

        {/* Goals Checklist */}
        <div className="space-y-2.5">
          {goals.map(goal => (
            <div
              key={goal.id}
              className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                goal.completed
                  ? 'bg-emerald-50/50 border-emerald-200 text-slate-400'
                  : 'bg-slate-50/80 border-slate-200 text-slate-800 hover:bg-slate-50'
              }`}
            >
              <button
                type="button"
                onClick={() => handleToggleGoal(goal.id)}
                className="flex items-center gap-3 text-left flex-1 cursor-pointer"
              >
                {goal.completed ? (
                  <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 shrink-0" />
                )}
                <span className={`text-xs font-bold leading-snug ${goal.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                  {goal.text}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleDeleteGoal(goal.id)}
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-xs font-bold cursor-pointer"
              >
                Xóa
              </button>
            </div>
          ))}
        </div>

        {/* Add Goal Input */}
        <form onSubmit={handleAddGoal} className="pt-2 flex items-center gap-2">
          <input
            type="text"
            placeholder="Thêm mục tiêu rèn luyện mới cho em..."
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm mục tiêu</span>
          </button>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* 9. KHỐI "DANH HIỆU & BẢNG VINH DANH" */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Award className="w-4.5 h-4.5 text-amber-500" /> Danh Hiệu & Bảng Vinh Danh
          </h3>
          <span className="text-[11px] font-bold text-slate-500">Huy hiệu thành tích đạt được</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Danh hiệu 1: Mầm non hy vọng */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0 shadow-2xs">
              🌱
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Mầm non hy vọng</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Đang phấn đấu rèn luyện mỗi ngày</p>
            </div>
          </div>

          {/* Danh hiệu 2: Kiện Tướng Điểm 10 */}
          <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center text-xl shrink-0 shadow-2xs">
              🌟
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Kiện Tướng Điểm 10</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Tích lũy 12 hoa điểm 10 rực rỡ</p>
            </div>
          </div>

          {/* Danh hiệu 3: Học Sinh Xuất Sắc */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl shrink-0 shadow-2xs">
              🥇
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Học Sinh Xuất Sắc</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Kết quả học tập nổi trội Lớp 3A</p>
            </div>
          </div>

          {/* Danh hiệu 4: Chiến Binh Chăm Chỉ */}
          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-xl shrink-0 shadow-2xs">
              🚀
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Chiến Binh Chăm Chỉ</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Hoàn thành 100% nhiệm vụ đúng hạn</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
});

export const HocBaSoModule: React.FC<HocBaSoModuleProps> = memo(({
  userRole = 'teacher',
  exams = [],
  assignments = [],
  lessons = [],
  games = [],
  currentStudent = null
}) => {
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [isCollapsed1, setIsCollapsed1] = useState<boolean>(false);
  const [isCollapsed2, setIsCollapsed2] = useState<boolean>(false);

  const { classes, getClassesForGrade } = useClassesList();
  const gradesList = GRADES;
  
  // Academic Year & Semester selection from AcademicYearContext
  const {
    selectedAcademicYear,
    setSelectedAcademicYear,
    selectedSemester,
    activeAcademicYear,
    availableYears,
    hasYearEnrollments
  } = useAcademicYear();

  const isHk2 = selectedSemester === 'Học kỳ II';

  // Section 1 Filters
  const [selectedGrade1, setSelectedGrade1] = useState<string>('Khối 3');
  const [selectedClass1, setSelectedClass1] = useState<string>(() => {
    const initList = getClassesForGrade('Khối 3');
    return initList?.[0]?.name || 'Lớp 3C';
  });
  const [selectedSubject1, setSelectedSubject1] = useState<string>('Công nghệ');
  const [selectedExamType1, setSelectedExamType1] = useState<string>(() => {
    const saved = localStorage.getItem('eduplay_hocba_exam_type_1');
    if (!saved || saved === 'Thường xuyên' || saved === 'thuong_xuyen' || !['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'].includes(saved)) {
      return isHk2 ? 'Giữa kì 2' : 'Giữa kì 1';
    }
    return saved;
  });
  const [selectedTestName1, setSelectedTestName1] = useState<string>('Tất cả bài kiểm tra');
  const [searchKeyword1, setSearchKeyword1] = useState<string>('');

  // Section 2 Filters (Sổ Tổng Kết Kết Quả Giáo Dục)
  const [selectedGrade2, setSelectedGrade2] = useState<string>('Khối 3');
  const [selectedClass2, setSelectedClass2] = useState<string>(() => {
    const initList = getClassesForGrade('Khối 3');
    return initList?.[0]?.name || 'Lớp 3C';
  });
  const [selectedSemester2, setSelectedSemester2] = useState<string>(() => {
    const saved = localStorage.getItem('eduplay_hocba_semester_2');
    if (!saved || saved === 'Thường xuyên' || saved === 'thuong_xuyen' || !['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'].includes(saved)) {
      return isHk2 ? 'Giữa kì 2' : 'Giữa kì 1';
    }
    return saved;
  });
  const [searchKeyword2, setSearchKeyword2] = useState<string>('');

  const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentRecord | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };
  
  const classesList1 = useMemo(() => {
    const list = getClassesForGrade(selectedGrade1).map(c => c.name);
    return [...Array.from(new Set(list)), 'Tất cả Lớp'];
  }, [selectedGrade1, classes]);

  const classesList2 = useMemo(() => {
    const list = getClassesForGrade(selectedGrade2).map(c => c.name);
    return [...Array.from(new Set(list)), 'Tất cả Lớp'];
  }, [selectedGrade2, classes]);

  // Tự động chọn lớp đầu tiên của khối khi đổi khối học ở Section 1
  useEffect(() => {
    const available = getClassesForGrade(selectedGrade1);
    if (available && available.length > 0) {
      setSelectedClass1(available[0].name);
    } else {
      setSelectedClass1('Tất cả Lớp');
    }
  }, [selectedGrade1]);

  // Tự động chọn lớp đầu tiên của khối khi đổi khối học ở Section 2
  useEffect(() => {
    const available = getClassesForGrade(selectedGrade2);
    if (available && available.length > 0) {
      setSelectedClass2(available[0].name);
    } else {
      setSelectedClass2('Tất cả Lớp');
    }
  }, [selectedGrade2]);

  // Tự động đồng bộ Học kỳ từ Header toàn cục xuống Sổ Nhận Xét và Sổ Tổng Kết
  useEffect(() => {
    if (selectedSemester === 'Học kỳ II') {
      setSelectedExamType1(prev => (prev === 'Thường xuyên' || !['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'].includes(prev)) ? 'Giữa kì 2' : prev);
      setSelectedSemester2(prev => (!['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'].includes(prev)) ? 'Giữa kì 2' : prev);
    } else {
      setSelectedExamType1(prev => (prev === 'Thường xuyên' || !['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'].includes(prev)) ? 'Giữa kì 1' : prev);
      setSelectedSemester2(prev => (!['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'].includes(prev)) ? 'Giữa kì 1' : prev);
    }
  }, [selectedSemester]);

  useEffect(() => {
    if (selectedExamType1) {
      localStorage.setItem('eduplay_hocba_exam_type_1', selectedExamType1);
    }
  }, [selectedExamType1]);

  useEffect(() => {
    if (selectedSemester2) {
      localStorage.setItem('eduplay_hocba_semester_2', selectedSemester2);
    }
  }, [selectedSemester2]);

  // Section 2 Subjects filter based on Grade/Class configured in DB
  const getSubjectsForGrade = (grade: string) => {
    return getSubjectsForClassOrGrade(grade, classes);
  };

  const currentGradeSubjects2 = getSubjectsForGrade(selectedGrade2);
  const subjectsList = PRIMARY_SCHOOL_SUBJECTS;
  const examTypesList1 = isHk2
    ? ['Giữa kì 2', 'Cuối kì 2', 'Giữa kì 1', 'Cuối kì 1']
    : ['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'];
  const testNamesList = ['Tất cả bài kiểm tra', 'Kiểm tra 15 phút', 'Kiểm tra miệng', 'Bài thực hành định kì', 'Kiểm tra học kì'];
  const semestersList = isHk2
    ? ['Giữa kì 2', 'Cuối kì 2', 'Giữa kì 1', 'Cuối kì 1']
    : ['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'];

  const mapFilterToExamFilter = (filterStr: string): string => {
    const clean = (filterStr || '').toLowerCase();
    if (clean.includes('giữa kì 1') || clean.includes('giữa k 1')) return 'giua_ki_1';
    if (clean.includes('cuối kì 1') || clean.includes('cuối k 1')) return 'cuoi_ki_1';
    if (clean.includes('giữa kì 2') || clean.includes('giữa k 2')) return 'giua_ki_2';
    if (clean.includes('cuối kì 2') || clean.includes('cuối k 2')) return 'cuoi_ki_2';
    return isHk2 ? 'giua_ki_2' : 'giua_ki_1';
  };

  // Student Database State and Real-Time Sync
  const [allStudentsDb, setAllStudentsDb] = useState<Record<string, GlobalStudentRecord[]>>(() => {
    return getAllStudentsFromLocalStorage();
  });

  const [modalOverallDat, setModalOverallDat] = useState<'T' | 'H' | 'CHT'>('T');
  const [modalScore, setModalScore] = useState<string>('8.5');
  const [modalCorrectCount, setModalCorrectCount] = useState<number>(8);
  const [modalTotalQuestions, setModalTotalQuestions] = useState<number>(10);
  const [modalStrengths, setModalStrengths] = useState<string>('');
  const [modalReminders, setModalReminders] = useState<string>('');

  useEffect(() => {
    const handleStudentsUpdated = () => {
      setAllStudentsDb(getAllStudentsFromLocalStorage());
    };
    window.addEventListener('student-data-updated', handleStudentsUpdated);
    window.addEventListener('eduplay_students_updated', handleStudentsUpdated);

    // Live sync all class rosters from Firestore collection
    let unsubSnapshot: (() => void) | undefined;
    if (db) {
      try {
        unsubSnapshot = onSnapshot(collection(db, 'class_rosters'), (snapshot) => {
          const cloudDb: Record<string, GlobalStudentRecord[]> = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data && Array.isArray(data.students)) {
              const stdName = data.className || getStandardClassName(docSnap.id);
              cloudDb[stdName] = data.students;
            }
          });
          if (Object.keys(cloudDb).length > 0) {
            setAllStudentsDb((prev) => ({
              ...prev,
              ...cloudDb
            }));
          }
        }, (err) => {
          console.warn('Cannot listen to class_rosters:', err);
        });
      } catch (err) {
        console.warn('Cannot listen to class_rosters:', err);
      }
    }

    return () => {
      window.removeEventListener('student-data-updated', handleStudentsUpdated);
      window.removeEventListener('eduplay_students_updated', handleStudentsUpdated);
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  useEffect(() => {
    const classesToSync = new Set<string>();
    if (selectedClass1 && selectedClass1 !== 'Tất cả Lớp') classesToSync.add(selectedClass1);
    if (selectedClass2 && selectedClass2 !== 'Tất cả Lớp') classesToSync.add(selectedClass2);

    const unsubscribes: Array<() => void> = [];
    classesToSync.forEach((className) => {
      const unsub = subscribeToFirestoreClassStudents(className, (updatedStudents) => {
        if (Array.isArray(updatedStudents) && updatedStudents.length > 0) {
          const stdName = getStandardClassName(className);
          setAllStudentsDb((prev) => ({
            ...prev,
            [stdName]: updatedStudents
          }));
        }
      });
      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [selectedClass1, selectedClass2]);

  const activeStudentsList: StudentRecord[] = useMemo(() => {
    const studentMap = new Map<string, StudentRecord>();
    const normSelectedExam = normalizeExamTypeKey(selectedExamType1);

    Object.entries(allStudentsDb).forEach(([clsName, classRoster]) => {
      if (Array.isArray(classRoster)) {
        classRoster.forEach((rawSt) => {
          if (rawSt && rawSt.id) {
            const st = convertToHocBaStudent({ ...rawSt, className: rawSt.className || clsName });
            if (!isValidStudentCode(st.code)) {
              st.commentDetail = {
                correctCount: 0,
                totalQuestions: 10,
                strengths: 'Mã HS không hợp lệ',
                reminders: 'Cần cập nhật lại Mã HS chuẩn [Lớp]26-27-[STT]',
                overallDat: 'CHT',
                score: 0,
                hasCommented: true,
                testTitle: 'Mã HS lỗi'
              };
              studentMap.set(st.code || st.id, st);
              return;
            }

            const examFilterVal = mapFilterToExamFilter(selectedExamType1);
            const summary = calculateUnifiedHocBaData({
              studentId: st.id,
              studentCode: st.code,
              studentName: `${st.lastName} ${st.firstName}`,
              className: st.className,
              examFilter: examFilterVal,
              exams,
              assignments,
              lessons,
              games,
              classesList: classes,
              onlyAssignedSubjects: true
            });

            // 1. Check if there is an explicit saved manual comment for this exam type
            const manualCommentForExam =
              (rawSt as any).commentDetailByExamType?.[selectedExamType1] ||
              (rawSt as any).commentDetailByExamType?.[normSelectedExam];

            // 2. Check if there are real online exam submissions for this exam type
            const hasRealDataForExamType = summary.hasData && summary.subjects.some(s => s.hasRealData && s.score !== null);

            const rawComment = (rawSt as any).commentDetail;
            const rawEvals = (rawSt as any).evaluations;

            // 3. Fallback for default benchmark term "Giữa kì 1":
            // If selecting "Giữa kì 1" and the student record in roster already has commentDetail or evaluations,
            // keep that default benchmark evaluation data!
            const isDefaultTermAndHasRosterData =
              normSelectedExam === 'giua_ki_1' &&
              ((rawComment && rawComment.hasCommented) ||
               (rawEvals && Object.keys(rawEvals).length > 0));

            if (manualCommentForExam) {
              st.commentDetail = manualCommentForExam;
              if (!st.evaluations) st.evaluations = {};
              st.evaluations[selectedSubject1] = {
                dat: manualCommentForExam.overallDat || 'T',
                score: String(manualCommentForExam.score ?? '')
              };
            } else if (hasRealDataForExamType) {
              st.evaluations = {};
              summary.subjects.forEach(sub => {
                if (sub.score !== null && sub.hasRealData) {
                  st.evaluations[sub.subject] = {
                    dat: sub.status,
                    score: formatTotalScore(sub.score)
                  };
                }
              });

              const targetSub = summary.subjects.find(s => isSubjectMatch(s.subject, selectedSubject1) && s.hasRealData && s.score !== null)
                             || summary.subjects.find(s => s.hasRealData && s.score !== null);

              if (targetSub && targetSub.score !== null) {
                st.commentDetail = {
                  correctCount: Math.round((targetSub.score / 10) * 10),
                  totalQuestions: 10,
                  strengths: targetSub.note,
                  reminders: targetSub.score >= 8 ? `Đã hoàn thành xuất sắc bài kiểm tra ${selectedExamType1}.` : 'Cần chú ý ôn tập thêm nội dung bài học.',
                  overallDat: targetSub.status,
                  score: targetSub.score,
                  hasCommented: true
                };
              } else {
                st.commentDetail = undefined;
              }
            } else if (isDefaultTermAndHasRosterData) {
              if (rawEvals) st.evaluations = { ...rawEvals };
              if (rawComment && rawComment.hasCommented) {
                st.commentDetail = { ...rawComment };
              }
            } else {
              st.evaluations = {};
              st.commentDetail = undefined;
            }

            studentMap.set(st.code, st);
          }
        });
      }
    });
    return Array.from(studentMap.values());
  }, [allStudentsDb, exams, assignments, lessons, games, classes, selectedExamType1, selectedSubject1]);

  const filteredStudents1 = useMemo(() => {
    return activeStudentsList.filter(st => {
      if (selectedClass1 !== 'Tất cả Lớp') {
        const normSel = getStandardClassName(selectedClass1).toLowerCase().replace(/\s+/g, '');
        const normSt = getStandardClassName(st.className).toLowerCase().replace(/\s+/g, '');
        if (normSel !== normSt && st.className !== selectedClass1) return false;
      }
      if (selectedGrade1 && selectedGrade1 !== 'Tất cả') {
        const gradeNum = selectedGrade1.match(/\d+/)?.[0];
        if (gradeNum) {
          const stClass = st.className || '';
          const stGradeNum = stClass.match(/\d+/)?.[0];
          if (stGradeNum && stGradeNum !== gradeNum) return false;
        }
      }
      if (searchKeyword1.trim()) {
        const full = `${st.lastName} ${st.firstName}`.toLowerCase();
        if (!full.includes(searchKeyword1.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      const fnCmp = (a.firstName || '').localeCompare(b.firstName || '', 'vi', { sensitivity: 'base' });
      if (fnCmp !== 0) return fnCmp;
      return (a.lastName || '').localeCompare(b.lastName || '', 'vi', { sensitivity: 'base' });
    });
  }, [activeStudentsList, selectedClass1, selectedGrade1, searchKeyword1]);

  const filteredStudents2 = useMemo(() => {
    return activeStudentsList.filter(st => {
      if (selectedClass2 !== 'Tất cả Lớp') {
        const normSel = getStandardClassName(selectedClass2).toLowerCase().replace(/\s+/g, '');
        const normSt = getStandardClassName(st.className).toLowerCase().replace(/\s+/g, '');
        if (normSel !== normSt && st.className !== selectedClass2) return false;
      }
      if (selectedGrade2 && selectedGrade2 !== 'Tất cả') {
        const gradeNum = selectedGrade2.match(/\d+/)?.[0];
        if (gradeNum) {
          const stClass = st.className || '';
          const stGradeNum = stClass.match(/\d+/)?.[0];
          if (stGradeNum && stGradeNum !== gradeNum) return false;
        }
      }
      if (searchKeyword2.trim()) {
        const full = `${st.lastName} ${st.firstName}`.toLowerCase();
        if (!full.includes(searchKeyword2.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      const fnCmp = (a.firstName || '').localeCompare(b.firstName || '', 'vi', { sensitivity: 'base' });
      if (fnCmp !== 0) return fnCmp;
      return (a.lastName || '').localeCompare(b.lastName || '', 'vi', { sensitivity: 'base' });
    });
  }, [activeStudentsList, selectedClass2, selectedGrade2, searchKeyword2]);

  const studentSubmissionStatusMap = useMemo(() => {
    const map = new Map<string, { hasSubmitted: boolean; hasComment: boolean; score?: number; dat?: string }>();
    filteredStudents1.forEach(st => {
      const subs = getStudentExamSubmissions({
        studentId: st.id,
        studentName: `${st.lastName} ${st.firstName}`,
        studentCode: st.code,
        exams
      });
      const matched = subs.filter(ex => isExamTypeMatch(ex.examType, ex.title, selectedExamType1) && isSubjectMatch(ex.subject, selectedSubject1));
      const hasSubmitted = matched.length > 0;
      const hasComment = Boolean(st.commentDetail?.hasCommented);
      const score = hasSubmitted ? matched[0].score : (st.commentDetail?.score !== undefined ? st.commentDetail.score : undefined);
      const dat = st.commentDetail?.overallDat || (score !== undefined ? (score >= 5 ? 'T' : 'H') : undefined);
      map.set(st.code, { hasSubmitted, hasComment, score, dat });
    });
    return map;
  }, [filteredStudents1, exams, selectedExamType1, selectedSubject1]);

  const submittedCount = useMemo(() => {
    let count = 0;
    studentSubmissionStatusMap.forEach(val => {
      if (val.hasSubmitted) count++;
    });
    return count;
  }, [studentSubmissionStatusMap]);

  const commentedCount = useMemo(() => {
    let count = 0;
    studentSubmissionStatusMap.forEach(val => {
      if (val.hasSubmitted && val.hasComment) count++;
    });
    return count;
  }, [studentSubmissionStatusMap]);

  const handleGenerateMissingComments = useCallback(() => {
    const missingStudents = filteredStudents1.filter(st => {
      const status = studentSubmissionStatusMap.get(st.code);
      return status?.hasSubmitted && !status?.hasComment;
    });

    if (missingStudents.length === 0) {
      showToast('✨ Tất cả học sinh đã nộp bài đều đã có nhận xét!');
      return;
    }

    showToast(`⏳ Đang tạo nhận xét cho ${missingStudents.length} học sinh còn thiếu...`);

    const updatedDb = { ...allStudentsDb };
    let count = 0;

    missingStudents.forEach(st => {
      const subs = getStudentExamSubmissions({
        studentId: st.id,
        studentName: `${st.lastName} ${st.firstName}`,
        studentCode: st.code,
        exams
      });
      const matched = subs.filter(ex => isExamTypeMatch(ex.examType, ex.title, selectedExamType1) && isSubjectMatch(ex.subject, selectedSubject1));
      if (matched.length > 0) {
        const examSub = matched[0];
        const scoreVal = examSub.score !== undefined ? examSub.score : 8.0;
        const datVal = scoreVal >= 5 ? 'T' : 'H';
        const comment = {
          correctCount: Math.round((scoreVal / 10) * 10),
          totalQuestions: 10,
          strengths: examSub.title || 'Bài kiểm tra định kỳ',
          reminders: scoreVal >= 8 ? `Đã hoàn thành xuất sắc bài kiểm tra ${selectedExamType1}.` : 'Cần chú ý ôn tập thêm nội dung bài học.',
          overallDat: datVal as 'T' | 'H' | 'CHT',
          score: scoreVal,
          hasCommented: true,
          testTitle: examSub.title
        };

        st.commentDetail = comment;
        if (!st.evaluations) st.evaluations = {};
        st.evaluations[selectedSubject1] = {
          dat: datVal,
          score: formatTotalScore(scoreVal)
        };

        const cls = st.className || selectedClass1;
        if (updatedDb[cls]) {
          updatedDb[cls] = updatedDb[cls].map((item: any) => {
            const itemCode = normalizeStudentCode(item.code || item.studentCode || item.maHs || item.id);
            if (itemCode === st.code) {
              return {
                ...item,
                commentDetail: comment,
                evaluations: {
                  ...(item.evaluations || {}),
                  [selectedSubject1]: { dat: datVal, score: formatTotalScore(scoreVal) }
                },
                commentDetailByExamType: {
                  ...(item.commentDetailByExamType || {}),
                  [selectedExamType1]: comment
                }
              };
            }
            return item;
          });
        }
        count++;
      }
    });

    setAllStudentsDb(updatedDb);
    saveAllStudentsToLocalStorage(updatedDb);
    showToast(`✅ Đã tạo thành công nhận xét cho ${count} học sinh còn thiếu!`, 'success');
  }, [filteredStudents1, studentSubmissionStatusMap, allStudentsDb, exams, selectedExamType1, selectedSubject1, selectedClass1]);

  /**
   * Helper function: Tra cứu GVCN chính xác của từng lớp từ Firestore classes collection
   */
  const getHomeroomTeacherName = useCallback((className?: string): string => {
    if (!className || className === 'Tất cả Lớp' || className === 'Tất cả') return '';
    const clean = className.replace(/^Lớp\s+/i, '').trim().toLowerCase();
    const matched = classes.find(c => {
      const cClean = c.name.replace(/^Lớp\s+/i, '').trim().toLowerCase();
      return c.id.toLowerCase() === clean || cClean === clean || c.name.toLowerCase() === className.toLowerCase();
    });
    return matched?.homeroomTeacher?.trim() || '';
  }, [classes]);

  const homeroomTeacherName2 = useMemo(() => {
    if (selectedClass2 === 'Tất cả Lớp') return '';
    return getHomeroomTeacherName(selectedClass2);
  }, [selectedClass2, getHomeroomTeacherName]);

  const handleExportExcelSection1 = useCallback(() => {
    if (filteredStudents1.length === 0) {
      showToast('⚠️ Không có dữ liệu học sinh để xuất Excel.', 'error');
      return;
    }
    exportSoNhanXetToExcel({
      students: filteredStudents1,
      grade: selectedGrade1,
      className: selectedClass1,
      subject: selectedSubject1,
      examType: selectedExamType1,
      month: 'Định kỳ',
      testName: selectedTestName1
    });
    showToast(`✅ Đã xuất file Excel Sổ Nhận Xét cho ${selectedClass1 === 'Tất cả Lớp' ? selectedGrade1 : selectedClass1} thành công!`);
  }, [filteredStudents1, selectedGrade1, selectedClass1, selectedSubject1, selectedExamType1, selectedTestName1]);

  /**
   * Helper function: Lấy bảng điểm đánh giá của học sinh cô lập hoàn toàn theo Học Kỳ trong Sổ Tổng Kết (Phần 2)
   */
  const getStudentEvaluationsForSemester2 = useCallback((st: StudentRecord, rawSt: any): Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }> => {
    const normSemester2 = normalizeExamTypeKey(selectedSemester2);

    const summary2 = calculateUnifiedHocBaData({
      studentId: st.id,
      studentName: `${st.lastName} ${st.firstName}`,
      className: st.className,
      examFilter: normSemester2,
      exams,
      assignments,
      lessons,
      games,
      classesList: classes,
      onlyAssignedSubjects: false
    });

    const targetRaw = rawSt || (st as any)._rawSt || st;

    // 1. Kiểm tra nhận xét/đánh giá thủ công đã lưu riêng cho học kỳ này
    const manualCommentForSemester =
      targetRaw.commentDetailByExamType?.[selectedSemester2] ||
      targetRaw.commentDetailByExamType?.[normSemester2];

    const manualEvalsForSemester =
      targetRaw.evaluationsBySemester?.[selectedSemester2] ||
      targetRaw.evaluationsBySemester?.[normSemester2];

    // 2. Kiểm tra bài nộp đề kiểm tra trực tuyến thuộc đúng học kỳ này
    const hasRealExamSubmission = summary2.hasData && summary2.subjects.some(s => s.hasRealData && s.score !== null);

    // 3. Dự phòng cho học kỳ mặc định "Giữa kì 1": sử dụng đánh giá danh sách lớp ban đầu
    const isDefaultSemesterAndHasRosterData =
      normSemester2 === 'giua_ki_1' &&
      ((targetRaw.evaluations && Object.keys(targetRaw.evaluations).length > 0) ||
       (targetRaw.commentDetail && targetRaw.commentDetail.hasCommented));

    if (manualEvalsForSemester) {
      return manualEvalsForSemester;
    }

    if (manualCommentForSemester) {
      const res: Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }> = {};
      if (targetRaw.evaluations) {
        Object.entries(targetRaw.evaluations as Record<string, any>).forEach(([subj, val]) => {
          res[subj] = { dat: (val as any).dat || 'T', score: String((val as any).score ?? '') };
        });
      }
      res[selectedSubject1] = {
        dat: manualCommentForSemester.overallDat || 'T',
        score: String(manualCommentForSemester.score ?? '')
      };
      return res;
    }

    if (hasRealExamSubmission) {
      const res: Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }> = {};
      summary2.subjects.forEach(sub => {
        if (sub.score !== null && sub.hasRealData) {
          res[sub.subject] = {
            dat: sub.status,
            score: formatTotalScore(sub.score)
          };
        }
      });
      return res;
    }

    if (isDefaultSemesterAndHasRosterData) {
      return (targetRaw.evaluations as Record<string, { dat: 'T' | 'H' | 'CHT'; score: string }>) || {};
    }

    // Các học kỳ khác chưa có dữ liệu bài kiểm tra -> trả về rỗng để hiển thị (-)
    return {};
  }, [selectedSemester2, exams, assignments, lessons, games, classes, selectedSubject1]);

  // Year End Confirmation Modal State & Functions
  const [isYearEndModalOpen, setIsYearEndModalOpen] = useState<boolean>(false);
  const [selectedYearEndStudent, setSelectedYearEndStudent] = useState<any | null>(null);
  const [modalYearEndStatus, setModalYearEndStatus] = useState<YearEndPromotionStatus>('promoted');
  const [modalYearEndNote, setModalYearEndNote] = useState<string>('');
  const [modalAutoRating, setModalAutoRating] = useState<string>('');

  const getStudentSddcn = useCallback((st: any): string => {
    return st.sddcn || st._rawSt?.sddcn || st._rawSt?.studentPersistentId || st.id || '';
  }, []);

  const isCuoiKi2 = useMemo(() => {
    const sem = (selectedSemester2 || '').toLowerCase();
    return sem.includes('cuối k') && sem.includes('2');
  }, [selectedSemester2]);

  const getStudentYearEndProposal = useCallback((st: any) => {
    const sddcn = getStudentSddcn(st);
    const saved = getYearEndResult(sddcn, selectedAcademicYear);

    const evals = getStudentEvaluationsForSemester2(st, st._rawSt || st);
    const classRes = calculateOverallClassification({
      studentId: sddcn,
      studentName: `${st.lastName} ${st.firstName}`.trim(),
      className: st.className,
      evaluations: evals
    });

    const autoClassification = classRes.classification;
    let autoStatus: YearEndPromotionStatus = 'promoted';
    if (autoClassification === 'Chưa hoàn thành') {
      autoStatus = 'review_needed';
    } else {
      autoStatus = 'promoted';
    }

    if (saved) {
      return {
        status: saved.status,
        note: saved.note || '',
        isManualConfirmed: saved.isManualConfirmed ?? true,
        autoRating: saved.autoRating || autoClassification,
        autoStatus
      };
    }

    return {
      status: autoStatus,
      note: '',
      isManualConfirmed: false,
      autoRating: autoClassification,
      autoStatus
    };
  }, [selectedAcademicYear, getStudentSddcn, getStudentEvaluationsForSemester2]);

  const handleOpenYearEndModal = useCallback((st: any, proposal: any) => {
    setSelectedYearEndStudent(st);
    setModalYearEndStatus(proposal.status);
    setModalYearEndNote(proposal.note || '');
    setModalAutoRating(proposal.autoRating || '');
    setIsYearEndModalOpen(true);
  }, []);

  const handleSaveYearEndConfirmation = useCallback(() => {
    if (!selectedYearEndStudent) return;
    const sddcn = getStudentSddcn(selectedYearEndStudent);
    saveYearEndResult({
      sddcn,
      academicYear: selectedAcademicYear,
      status: modalYearEndStatus,
      note: modalYearEndNote.trim(),
      autoRating: modalAutoRating,
      isManualConfirmed: true,
      updatedBy: 'Giáo viên'
    });

    const studentName = `${selectedYearEndStudent.lastName} ${selectedYearEndStudent.firstName}`.trim();
    const statusLabel = modalYearEndStatus === 'promoted' ? 'Lên lớp' : modalYearEndStatus === 'review_needed' ? 'Cần xem xét' : 'Ở lại lớp';
    showToast(`✅ Đã xác nhận kết quả cuối năm (${statusLabel}) cho học sinh ${studentName}!`);
    setIsYearEndModalOpen(false);
  }, [selectedYearEndStudent, getStudentSddcn, selectedAcademicYear, modalYearEndStatus, modalYearEndNote, modalAutoRating]);

  const handleExportExcelSection2 = useCallback(() => {
    if (filteredStudents2.length === 0) {
      showToast('⚠️ Không có dữ liệu học sinh để xuất Excel.', 'error');
      return;
    }
    exportSoTongKetToExcel({
      students: filteredStudents2.map(st => ({
        ...st,
        evaluations: getStudentEvaluationsForSemester2(st, (st as any)._rawSt || st),
        homeroomTeacher: getHomeroomTeacherName(st.className)
      })),
      grade: selectedGrade2,
      className: selectedClass2,
      semester: selectedSemester2,
      subjects: currentGradeSubjects2,
      homeroomTeacher: homeroomTeacherName2
    });
    showToast(`✅ Đã xuất file Excel Sổ Tổng Kết cho ${selectedClass2 === 'Tất cả Lớp' ? selectedGrade2 : selectedClass2} thành công!`);
  }, [filteredStudents2, getStudentEvaluationsForSemester2, getHomeroomTeacherName, selectedGrade2, selectedClass2, selectedSemester2, currentGradeSubjects2, homeroomTeacherName2]);

  const handleViewDetail = useCallback((st: StudentRecord) => {
    setSelectedStudentDetail(st);
    const comment = st.commentDetail;
    const existingEval = st.evaluations ? st.evaluations[selectedSubject1] : undefined;
    const datVal = (comment?.overallDat || existingEval?.dat || 'T') as 'T' | 'H' | 'CHT';
    const scoreVal = comment?.score !== undefined ? String(comment.score) : (existingEval?.score || '8.5');

    setModalOverallDat(datVal);
    setModalScore(scoreVal);
    setModalCorrectCount(comment?.correctCount !== undefined ? comment.correctCount : 8);
    setModalTotalQuestions(comment?.totalQuestions !== undefined ? comment.totalQuestions : 10);
    setModalStrengths(comment?.strengths || 'Nắm vững kiến thức trọng tâm, tính toán nhanh và chính xác');
    setModalReminders(comment?.reminders || 'Cần đọc kỹ đề bài và tự tin hơn ở bài tập vận dụng');
    setIsDetailModalOpen(true);
  }, [selectedSubject1]);

  // If the user role is student, render the comprehensive 9-block unified Học Bạ Số view
  if (userRole === 'student') {
    return (
      <StudentHocBaSoView
        exams={exams}
        assignments={assignments}
        lessons={lessons}
        games={games}
        currentStudent={currentStudent}
        allStudentsDb={allStudentsDb}
      />
    );
  }

  return (
    <div className="space-y-8">
      
      {/* Top Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shadow-inner">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              Học Bạ Số & Sổ Tổng Kết Cấp Tiểu Học
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 uppercase">
                Chuẩn Thông Tư
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống tích hợp đồng thời Sổ Nhận Xét Học Sinh & Sổ Tổng Kết Kết Quả Giáo Dục
            </p>
          </div>
        </div>
      </div>

      {/* BANNER CẢNH BÁO KHI NĂM HỌC CHƯA CÓ DỮ LIỆU */}
      <AcademicYearWarningBanner
        academicYear={selectedAcademicYear}
        onGoToPromotion={() => {
          localStorage.setItem('eduplay_open_user_tab', 'promotion');
          window.dispatchEvent(new CustomEvent('eduplay_open_promotion_tab'));
          window.dispatchEvent(new CustomEvent('eduplay_navigate_module', { detail: { module: 'user_management' } }));
        }}
      />

      {/* Global Action Row: Lock Mode & Print Report */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>Bảo mật dữ liệu & Xuất báo cáo báo cáo tổng hợp</span>
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={() => setIsLocked(!isLocked)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
              isLocked
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            {isLocked ? <Lock className="w-4 h-4 text-emerald-600" /> : <Unlock className="w-4 h-4 text-amber-600" />}
            {isLocked ? 'Đã khóa bảo vệ' : 'Đang mở chỉnh sửa'}
          </button>
        </div>
      </div>

      {/* Lock Mode Notice Banner */}
      {isLocked && (
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>
              <b>Đã kích hoạt Khóa An Toàn (Lock Mode):</b> Toàn bộ dữ liệu sổ nhận xét và sổ tổng kết được bảo vệ cố định chống mọi thao tác ghi đè hoặc vô tình làm thay đổi.
            </span>
          </div>
          <button
            onClick={() => setIsLocked(false)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs cursor-pointer shrink-0"
          >
            Thao tác mở khóa
          </button>
        </div>
      )}

      {/* ==================================================== */}
      {/* PHẦN 1: SỔ NHẬN XÉT HỌC SINH (HIỂN THỊ Ở PHÍA TRÊN) */}
      {/* ==================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-6">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 font-bold">
              01
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                Sổ Nhận Xét Học Sinh
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 uppercase">
                  AI Sư Phạm
                </span>
              </h2>
              <p className="text-xs text-slate-500">Tổng hợp lời phê, nhận xét học tập và kết quả bài làm chi tiết</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-extrabold text-slate-700 flex items-center gap-2 shadow-xs">
              <MessageSquare className="w-4 h-4 text-teal-600" />
              <span>Đã nộp <b className="text-teal-700">{submittedCount}/{filteredStudents1.length}</b> — Đã có nhận xét <b className="text-teal-700">{commentedCount}/{submittedCount}</b></span>
            </div>

            <button
              onClick={handleGenerateMissingComments}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition-all flex items-center gap-2 cursor-pointer shadow-xs shadow-teal-200"
              title="Tự động tạo nhận xét cho các em đã làm bài nhưng chưa có nhận xét"
            >
              <Sparkles className="w-4 h-4" />
              <span>Tạo nhận xét thiếu</span>
            </button>

            <button
              onClick={handleExportExcelSection1}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-2 cursor-pointer shadow-xs shadow-emerald-200"
              title="Xuất danh sách nhận xét đang lọc ra file Excel (.xlsx)"
            >
              <Download className="w-4 h-4" />
              <span>Tải Excel</span>
            </button>

            <button
              onClick={() => setIsCollapsed1(!isCollapsed1)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              {isCollapsed1 ? <Maximize2 className="w-4 h-4 text-slate-500" /> : <Minimize2 className="w-4 h-4 text-slate-500" />}
              {isCollapsed1 ? 'Mở rộng' : 'Thu hẹp'}
            </button>
          </div>
        </div>

        {/* Filters Bar 1 */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Chọn khối</label>
            <select
              value={selectedGrade1}
              onChange={(e) => setSelectedGrade1(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {gradesList.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Chọn lớp</label>
            <select
              value={selectedClass1}
              onChange={(e) => setSelectedClass1(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {classesList1.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Chọn môn học</label>
            <select
              value={selectedSubject1}
              onChange={(e) => setSelectedSubject1(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {subjectsList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Loại kiểm tra</label>
            <select
              value={selectedExamType1}
              onChange={(e) => setSelectedExamType1(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {examTypesList1.map(et => (
                <option key={et} value={et}>{et}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Row 1 */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Tìm học sinh theo tên hoặc họ lót..."
              value={searchKeyword1}
              onChange={(e) => setSearchKeyword1(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="text-xs font-bold text-slate-500 hidden sm:block">
            Môn đang xem: <span className="text-teal-700 font-extrabold">{selectedSubject1}</span> ({selectedExamType1})
          </div>
        </div>

        {!isCollapsed1 && (
          !hasYearEnrollments ? (
            <AcademicYearEmptyState
              academicYear={selectedAcademicYear}
              onGoToPromotion={() => {
                localStorage.setItem('eduplay_open_user_tab', 'promotion');
                window.dispatchEvent(new CustomEvent('eduplay_open_promotion_tab'));
                window.dispatchEvent(new CustomEvent('eduplay_navigate_module', { detail: { module: 'user_management' } }));
              }}
            />
          ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto relative">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 text-center">
                    <th className="p-3 border-r border-slate-200 w-12">STT</th>
                    <th className="p-3 border-r border-slate-200 w-28">Mã HS</th>
                    <th className="p-3 border-r border-slate-200 min-w-[150px]">Họ và tên</th>
                    <th className="p-3 border-r border-slate-200 min-w-[100px]">Ngày sinh</th>
                    <th className="p-3 border-r border-slate-200 text-left min-w-[380px]">Lời nhận xét</th>
                    <th className="p-3 border-r border-slate-200 w-16">Đạt</th>
                    {isSubjectWithScore(selectedSubject1) && (
                      <th className="p-3 border-r border-slate-200 w-16">Điểm</th>
                    )}
                    <th className="p-3 w-28">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudents1.length === 0 ? (
                    <tr>
                      <td colSpan={isSubjectWithScore(selectedSubject1) ? 8 : 7} className="text-center py-12 text-slate-400 text-xs">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <AlertCircle className="w-8 h-8 text-slate-300" />
                          <span>Không tìm thấy học sinh nào phù hợp.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStudents1.map((st, idx) => {
                      const comment = st.commentDetail;
                      const hasComment = Boolean(comment && comment.hasCommented);
                      const subStatus = studentSubmissionStatusMap.get(st.code);
                      const hasSubmitted = subStatus?.hasSubmitted;
                      const studentEval = st.evaluations ? st.evaluations[selectedSubject1] : undefined;
                      const displayDat = subStatus?.dat || comment?.overallDat || studentEval?.dat;
                      const displayScore = subStatus?.score !== undefined ? subStatus.score : (comment?.score !== undefined ? comment.score : (studentEval?.score || ''));

                      return (
                        <tr key={st.code} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center border-r border-slate-200 font-semibold text-slate-600">{idx + 1}</td>
                          <td className="p-3 text-center border-r border-slate-200 font-mono text-[11px] font-bold text-teal-800 bg-teal-50/40">{st.code}</td>
                          <td className="p-3 border-r border-slate-200 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{st.lastName} {st.firstName}</span>
                              {st.isFemale && <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-600 font-normal">Nữ</span>}
                            </div>
                            {selectedClass1 === 'Tất cả Lớp' && st.className && (
                              <div className="text-[10px] text-teal-700 font-semibold mt-0.5 flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded bg-teal-50 border border-teal-100">{st.className}</span>
                                {getHomeroomTeacherName(st.className) && (
                                  <span className="text-slate-500 font-normal">GVCN: {getHomeroomTeacherName(st.className)}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center border-r border-slate-200 text-slate-600 font-mono text-[11px]">{st.dob}</td>
                          <td className="p-3.5 border-r border-slate-200 text-slate-700 leading-relaxed">
                            {hasComment && comment ? (
                              <div className="space-y-1">
                                <div className="flex items-start gap-1.5">
                                  <span className="shrink-0 pt-0.5">👏</span>
                                  <span>
                                    Khen ngợi em đã hoàn thành đúng <b>{comment.correctCount}/{comment.totalQuestions} câu</b>. Làm tốt các câu: <b className="text-slate-900">{comment.strengths}</b>.
                                  </span>
                                </div>
                                {comment.reminders && (
                                  <div className="flex items-start gap-1.5 text-slate-600">
                                    <span className="shrink-0 pt-0.5">⚠️</span>
                                    <span>Cần ôn tập kỹ hơn ở {comment.reminders}</span>
                                  </div>
                                )}
                              </div>
                            ) : hasSubmitted ? (
                              <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl text-xs">
                                <span className="font-semibold text-amber-800">⚠️ Đã làm bài, chưa có nhận xét</span>
                                <button
                                  onClick={() => handleViewDetail(st)}
                                  className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold transition-all shadow-2xs cursor-pointer shrink-0"
                                >
                                  Tạo nhận xét
                                </button>
                              </div>
                            ) : (
                              <div className="text-slate-400 italic text-[11px] flex items-center gap-1.5 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                <span>— Chưa làm bài —</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center border-r border-slate-200">
                            {displayDat ? (
                              <span className={`inline-block px-2.5 py-1 rounded-lg font-extrabold text-xs ${
                                displayDat === 'T' ? 'bg-emerald-100 text-emerald-800' :
                                displayDat === 'H' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {displayDat}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold text-xs">-</span>
                            )}
                          </td>
                          {isSubjectWithScore(selectedSubject1) && (
                            <td className="p-3 text-center border-r border-slate-200 font-mono text-slate-800 font-extrabold">
                              {displayScore !== '' ? displayScore : <span className="text-slate-300 font-normal">-</span>}
                            </td>
                          )}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleViewDetail(st)}
                              className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 mx-auto cursor-pointer border border-teal-200 shadow-2xs"
                            >
                              <Eye className="w-3.5 h-3.5" /> {hasComment ? 'Xem chi tiết' : 'Đánh giá / Nhận xét'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )
        )}
      </div>


      {/* ==================================================== */}
      {/* PHẦN 2: SỔ TỔNG KẾT KẾT QUẢ GIÁO DỤC (HIỂN THỊ Ở PHÍA DƯỚI) */}
      {/* ==================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-6">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 font-bold">
              02
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                Sổ Tổng Kết Kết Quả Giáo Dục Học Sinh
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 uppercase">
                  Chuẩn Tiểu Học
                </span>
              </h2>
              <p className="text-xs text-slate-500">Báo cáo đánh giá tổng thể định kì và điểm số định lượng các môn học</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcelSection2}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-2 cursor-pointer shadow-xs shadow-emerald-200"
              title="Xuất bảng điểm tổng kết đang lọc ra file Excel (.xlsx)"
            >
              <Download className="w-4 h-4" />
              <span>Tải Excel</span>
            </button>

            <button
              onClick={() => setIsCollapsed2(!isCollapsed2)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              {isCollapsed2 ? <Maximize2 className="w-4 h-4 text-slate-500" /> : <Minimize2 className="w-4 h-4 text-slate-500" />}
              {isCollapsed2 ? 'Mở rộng' : 'Thu hẹp'}
            </button>
          </div>
        </div>

        {/* Filters Bar 2 */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Khối học</label>
            <select
              value={selectedGrade2}
              onChange={(e) => setSelectedGrade2(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {gradesList.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Lớp học</label>
            <select
              value={selectedClass2}
              onChange={(e) => setSelectedClass2(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {classesList2.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Học kỳ</label>
            <select
              value={selectedSemester2}
              onChange={(e) => setSelectedSemester2(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {semestersList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Tìm kiếm học sinh</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Nhập tên học sinh..."
                value={searchKeyword2}
                onChange={(e) => setSearchKeyword2(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {!isCollapsed2 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" /> Bảng Điểm & Đánh Giá Mức Độ (Tổng số: {filteredStudents2.length} học sinh)
              </div>
              <div className="text-[11px] text-slate-500 italic">
                Ký hiệu mức đạt: T (Tốt), H (Hoàn thành), CHT (Chưa hoàn thành)
              </div>
            </div>

            <div className="overflow-x-auto relative">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 text-center">
                    <th className="p-3 border-r border-slate-200 w-12" rowSpan={2}>STT</th>
                    <th className="p-3 border-r border-slate-200 min-w-[110px]" rowSpan={2}>Họ lót</th>
                    <th className="p-3 border-r border-slate-200 min-w-[90px]" rowSpan={2}>Tên</th>
                    {selectedClass2 === 'Tất cả Lớp' && (
                      <>
                        <th className="p-3 border-r border-slate-200 min-w-[75px]" rowSpan={2}>Lớp</th>
                        <th className="p-3 border-r border-slate-200 min-w-[150px]" rowSpan={2}>GVCN</th>
                      </>
                    )}
                    <th className="p-3 border-r border-slate-200 min-w-[90px]" rowSpan={2}>Ngày sinh</th>
                    <th className="p-3 border-r border-slate-200 w-14" rowSpan={2}>Nữ</th>
                    {currentGradeSubjects2.map((subj) => {
                      const hasScore = isSubjectWithScore(subj);
                      return (
                        <th
                          key={subj}
                          className={`p-2 border-r border-slate-200 ${hasScore ? 'min-w-[95px]' : 'min-w-[60px]'}`}
                          colSpan={hasScore ? 2 : 1}
                        >
                          {subj}
                        </th>
                      );
                    })}
                    <th
                      className="p-3 border-l border-slate-300 min-w-[170px] sticky right-0 bg-slate-100 z-10 shadow-xs text-center font-extrabold text-slate-800"
                      rowSpan={2}
                    >
                      KẾT QUẢ CUỐI NĂM
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold border-b border-slate-200 text-center">
                    {currentGradeSubjects2.map((subj) => {
                      const hasScore = isSubjectWithScore(subj);
                      return (
                        <React.Fragment key={`${subj}-sub`}>
                          <th className="p-1.5 border-r border-slate-200 w-12">Đạt</th>
                          {hasScore && (
                            <th className="p-1.5 border-r border-slate-200 w-12">Điểm</th>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudents2.length === 0 ? (
                    <tr>
                      <td
                        colSpan={(selectedClass2 === 'Tất cả Lớp' ? 7 : 5) + currentGradeSubjects2.reduce((acc, subj) => acc + (isSubjectWithScore(subj) ? 2 : 1), 0) + 1}
                        className="text-center py-12 text-slate-400 text-xs"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <AlertCircle className="w-8 h-8 text-slate-300" />
                          <span>Chưa tìm thấy học sinh nào trong cơ sở dữ liệu của lớp/khối này.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStudents2.map((st, idx) => (
                      <tr key={st.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="p-3 text-center border-r border-slate-200 font-semibold text-slate-600">{idx + 1}</td>
                        <td className="p-3 border-r border-slate-200 font-bold text-slate-800">{st.lastName}</td>
                        <td className="p-3 border-r border-slate-200 font-extrabold text-teal-800">{st.firstName}</td>
                        {selectedClass2 === 'Tất cả Lớp' && (
                          <>
                            <td className="p-3 text-center border-r border-slate-200 font-bold text-teal-700">
                              <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-100 font-bold">{st.className || selectedGrade2}</span>
                            </td>
                            <td className="p-3 border-r border-slate-200 font-medium text-slate-700 whitespace-nowrap">
                              {getHomeroomTeacherName(st.className) || '-'}
                            </td>
                          </>
                        )}
                        <td className="p-3 text-center border-r border-slate-200 text-slate-600 font-mono text-[11px]">{st.dob}</td>
                        <td className="p-3 text-center border-r border-slate-200">
                          <input type="checkbox" checked={st.isFemale} readOnly className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer" />
                        </td>
                        {(() => {
                          const evalMap = getStudentEvaluationsForSemester2(st, (st as any)._rawSt || st);
                          return currentGradeSubjects2.map((subj) => {
                            const evalData = evalMap ? evalMap[subj] : undefined;
                            const hasScore = isSubjectWithScore(subj);
                            return (
                              <React.Fragment key={subj}>
                                <td className="p-1.5 text-center border-r border-slate-200">
                                  {evalData && evalData.dat ? (
                                    <span className={`inline-block px-2 py-0.5 rounded font-extrabold text-[11px] ${
                                      evalData.dat === 'T' ? 'bg-emerald-100 text-emerald-800' :
                                      evalData.dat === 'H' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
                                    }`}>
                                      {evalData.dat}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-bold text-[11px]">-</span>
                                  )}
                                </td>
                                {hasScore && (
                                  <td className="p-1.5 text-center border-r border-slate-200 font-mono text-slate-700 font-semibold">
                                    {evalData && evalData.score ? evalData.score : <span className="text-slate-300 font-normal">-</span>}
                                  </td>
                                )}
                              </React.Fragment>
                            );
                          });
                        })()}

                        {/* Sticky Column: KẾT QUẢ CUỐI NĂM */}
                        <td className="p-2 border-l border-slate-300 sticky right-0 bg-white group-hover:bg-slate-50 transition-colors z-10 text-center shadow-2xs">
                          {isCuoiKi2 ? (() => {
                            const proposal = getStudentYearEndProposal(st);
                            return (
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {proposal.status === 'promoted' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    Lên lớp
                                  </span>
                                )}
                                {proposal.status === 'review_needed' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    Cần xem xét
                                  </span>
                                )}
                                {proposal.status === 'retained' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                                    🛑 Ở lại lớp
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleOpenYearEndModal(st, proposal)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                                    proposal.isManualConfirmed
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-teal-600 hover:bg-teal-700 text-white border-teal-600 shadow-2xs'
                                  }`}
                                  title={proposal.isManualConfirmed ? "Sửa xác nhận kết quả" : "Thao tác xác nhận trạng thái cuối năm"}
                                >
                                  {proposal.isManualConfirmed ? <Edit3 className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                                  <span>{proposal.isManualConfirmed ? 'Đã duyệt' : 'Xác nhận'}</span>
                                </button>
                              </div>
                            );
                          })() : (
                            <span className="text-slate-400 font-medium text-[11px] block" title="Chỉ xét cuối năm học">
                              - <span className="text-[10px] text-slate-300 hidden sm:inline">(Chỉ xét cuối năm)</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Hiển thị {filteredStudents2.length} học sinh</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Cuộn ngang để xem đầy đủ các môn học</span>
                <div className="flex gap-1">
                  <button className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 cursor-pointer">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 cursor-pointer">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Student Detail Modal */}
      {isDetailModalOpen && selectedStudentDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Chi Tiết Nhận Xét & Phân Tích Bài Làm Học Sinh
                  </h3>
                  <p className="text-xs text-slate-500">Môn: {selectedSubject1} • {selectedExamType1}</p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className={`grid ${isSubjectWithScore(selectedSubject1) ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'} gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200`}>
                <div>
                  <span className="text-slate-400 font-semibold block">HỌ VÀ TÊN</span>
                  <span className="font-extrabold text-slate-900 text-sm">{selectedStudentDetail.lastName} {selectedStudentDetail.firstName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block">LỚP HỌC</span>
                  <span className="font-bold text-slate-800">{selectedStudentDetail.className}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">MỨC ĐẠT</span>
                  <div className="flex gap-1">
                    {(['T', 'H', 'CHT'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setModalOverallDat(lvl)}
                        className={`px-2 py-0.5 rounded font-extrabold text-xs transition-all cursor-pointer ${
                          modalOverallDat === lvl
                            ? lvl === 'T'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : lvl === 'H'
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'bg-rose-600 text-white shadow-xs'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
                {isSubjectWithScore(selectedSubject1) && (
                  <div>
                    <span className="text-slate-400 font-semibold block mb-1">ĐIỂM SỐ</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={modalScore}
                      onChange={(e) => setModalScore(e.target.value)}
                      className="w-20 px-2 py-0.5 rounded-lg border border-slate-300 font-mono font-extrabold text-teal-700 text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" /> Nhận xét & Đánh giá giáo viên:
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      if (modalOverallDat === 'T') {
                        setModalStrengths('Nắm vững kiến thức trọng tâm, tính toán chính xác và chủ động giải quyết bài tập.');
                        setModalReminders('Phát huy thêm tinh thần sáng tạo trong các bài toán mở.');
                        setModalCorrectCount(9);
                        setModalTotalQuestions(10);
                        if (!modalScore || Number(modalScore) < 8) setModalScore('9.0');
                      } else if (modalOverallDat === 'H') {
                        setModalStrengths('Hiểu bài, hoàn thành tốt các câu hỏi cơ bản và thực hành đúng quy trình.');
                        setModalReminders('Cần đọc kỹ đề bài và rèn luyện thêm kỹ năng tính toán cẩn thận.');
                        setModalCorrectCount(7);
                        setModalTotalQuestions(10);
                        if (!modalScore || Number(modalScore) < 6) setModalScore('7.5');
                      } else {
                        setModalStrengths('Có cố gắng hoàn thành bài, có ý thức học tập tốt.');
                        setModalReminders('Cần tăng cường ôn tập kiến thức cơ bản và trao đổi thường xuyên với giáo viên.');
                        setModalCorrectCount(4);
                        setModalTotalQuestions(10);
                        if (!modalScore || Number(modalScore) > 5) setModalScore('4.5');
                      }
                      showToast('✨ Đã sinh gợi ý nhận xét AI Sư Phạm phù hợp với mức đạt!');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] border border-teal-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Gợi ý AI Sư Phạm
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-3 text-slate-800 leading-relaxed">
                  <div className="flex items-center gap-3">
                    <span className="text-teal-700 font-bold text-xs shrink-0">Số câu đúng / Tổng:</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      <input
                        type="number"
                        min="0"
                        value={modalCorrectCount}
                        onChange={(e) => setModalCorrectCount(Number(e.target.value) || 0)}
                        className="w-14 px-2 py-0.5 rounded-lg border border-slate-300 bg-white font-bold text-center text-xs"
                      />
                      <span className="text-slate-400 font-bold">/</span>
                      <input
                        type="number"
                        min="1"
                        value={modalTotalQuestions}
                        onChange={(e) => setModalTotalQuestions(Number(e.target.value) || 1)}
                        className="w-14 px-2 py-0.5 rounded-lg border border-slate-300 bg-white font-bold text-center text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-teal-700 font-bold text-xs block mb-1">
                      👏 Khen ngợi & Điểm mạnh nổi bật:
                    </label>
                    <textarea
                      rows={2}
                      value={modalStrengths}
                      onChange={(e) => setModalStrengths(e.target.value)}
                      placeholder="Nhập lời khen ngợi học sinh..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-amber-700 font-bold text-xs block mb-1">
                      ⚠️ Gợi ý cải thiện & Nhắc nhở:
                    </label>
                    <textarea
                      rows={2}
                      value={modalReminders}
                      onChange={(e) => setModalReminders(e.target.value)}
                      placeholder="Gợi ý nội dung học sinh cần ôn tập..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
              >
                Đóng cửa sổ
              </button>
              <button
                onClick={async () => {
                  if (!selectedStudentDetail) return;
                  try {
                    const stdClassName = getStandardClassName(selectedStudentDetail.className);
                    const currentRoster = allStudentsDb[stdClassName] || [];
                    const studentFullName = `${selectedStudentDetail.lastName} ${selectedStudentDetail.firstName}`.trim();
                    const updatedComment = {
                      studentId: selectedStudentDetail.id,
                      studentName: studentFullName,
                      correctCount: Number(modalCorrectCount) || 0,
                      totalQuestions: Number(modalTotalQuestions) || 10,
                      strengths: modalStrengths.trim(),
                      reminders: modalReminders.trim(),
                      overallDat: modalOverallDat,
                      score: Number(modalScore) || 0,
                      hasCommented: true
                    };

                    const updatedRoster = currentRoster.map((st) => {
                      if (st.id === selectedStudentDetail.id || (st.fullName || st.name) === `${selectedStudentDetail.lastName} ${selectedStudentDetail.firstName}`.trim()) {
                        const existingEvals = (st as any).evaluations || {};
                        const existingComments = (st as any).commentDetailByExamType || {};
                        return {
                          ...st,
                          evaluations: {
                            ...existingEvals,
                            [selectedSubject1]: {
                              dat: modalOverallDat,
                              score: isSubjectWithScore(selectedSubject1) ? String(modalScore) : ''
                            }
                          },
                          commentDetail: updatedComment,
                          commentDetailByExamType: {
                            ...existingComments,
                            [selectedExamType1]: updatedComment
                          }
                        };
                      }
                      return st;
                    });

                    saveStudentsToLocalStorage(stdClassName, updatedRoster);
                    await syncClassStudentsToFirestore(stdClassName, updatedRoster);

                    setAllStudentsDb((prev) => ({
                      ...prev,
                      [stdClassName]: updatedRoster
                    }));

                    showToast(`Đã lưu thành công lời nhận xét cho học sinh ${selectedStudentDetail.lastName} ${selectedStudentDetail.firstName} và đồng bộ lên CSDL Firestore!`, "success");
                    setIsDetailModalOpen(false);
                  } catch (e) {
                    console.error('Save comment error:', e);
                    showToast("Lưu lời nhận xét thất bại, vui lòng kiểm tra lại!", "error");
                  }
                }}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition-all shadow-md shadow-teal-200 cursor-pointer"
              >
                Lưu lời nhận xét & Đồng bộ CSDL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Year End Confirmation Modal */}
      {isYearEndModalOpen && selectedYearEndStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 font-heading">
                    Xác Nhận Kết Quả Cuối Năm
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Học sinh: <strong className="text-teal-800 font-extrabold">{selectedYearEndStudent.lastName} {selectedYearEndStudent.firstName}</strong> ({selectedYearEndStudent.className})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsYearEndModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Auto rating recommendation info */}
              <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-2xl text-indigo-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Đề xuất tự động từ hệ thống:</span>
                </div>
                <div className="text-[11px] font-medium text-indigo-800">
                  Xếp loại tổng thể: <strong className="font-extrabold text-indigo-950">{modalAutoRating || 'Hoàn thành'}</strong>
                </div>
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Chọn trạng thái kết quả cuối năm:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalYearEndStatus('promoted')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold flex flex-col items-center gap-1 ${
                      modalYearEndStatus === 'promoted'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm">✅</span>
                    <span className="text-[11px]">Lên lớp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalYearEndStatus('review_needed')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold flex flex-col items-center gap-1 ${
                      modalYearEndStatus === 'review_needed'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm">⚠️</span>
                    <span className="text-[11px]">Cần xem xét</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalYearEndStatus('retained')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold flex flex-col items-center gap-1 ${
                      modalYearEndStatus === 'retained'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm">🛑</span>
                    <span className="text-[11px]">Ở lại lớp</span>
                  </button>
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi chú / Lý do (không bắt buộc):
                </label>
                <textarea
                  rows={3}
                  value={modalYearEndNote}
                  onChange={(e) => setModalYearEndNote(e.target.value)}
                  placeholder="Nhập ghi chú lý do nếu quyết định khác với đề xuất tự động..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsYearEndModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveYearEndConfirmation}
                className="px-5 py-2 rounded-xl text-xs font-black bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200 transition-all cursor-pointer"
              >
                Lưu Xác Nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] text-white px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 animate-slide-up backdrop-blur-md ${toast.type === 'error' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-emerald-600 border-emerald-400 text-white'}`}>
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-white shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          )}
          <span className="text-xs font-extrabold tracking-wide">{toast.message}</span>
        </div>
      )}

    </div>
  );
});
