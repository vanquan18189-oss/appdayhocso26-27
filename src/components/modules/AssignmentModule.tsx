import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { getSubjectColorStyles } from '../../utils/subjectColors';
import { StatCard } from '../common/StatCard';
import { DateTimePicker } from '../common/DateTimePicker';
import { PaginationControl } from '../common/PaginationControl';
import {
  ClipboardList,
  Sparkles,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  User,
  Users,
  Award,
  RefreshCw,
  Zap,
  FileCheck,
  Share2,
  MoreVertical,
  Eye,
  Edit3,
  Trash2,
  BookOpen,
  GraduationCap,
  Layers,
  Search,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  X,
  FileText,
  Download,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  RotateCcw,
  Trophy,
  BarChart3,
  Medal,
  Crown,
  Printer,
  HeartHandshake,
  Database,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GripVertical,
  Settings
} from 'lucide-react';
import { SUBJECTS, GRADES, CLASSES_BY_GRADE, ALL_CLASSES, QUESTION_TYPES, normalizeQuestionType, getDefaultAnswerSchemaByType, sanitizeQuestionForFirestore, getQuestionTypeLabel, isGradeMatching, extractGradeDigit } from '../../lib/constants';
import { useClassesList } from '../../services/classStorageService';
import { HomeworkAssignment, AssignmentSubmission, UserRole, QuestionItem } from '../../types';
import { gradeSubmissionAI } from '../../services/geminiService';
import { exportAssignmentResultsExcel } from '../../services/excelService';
import { ManualQuestionBankModal } from './ManualQuestionBankModal';
import { UseQuestionBankModal } from './UseQuestionBankModal';
import { ShareContentModal } from './ShareContentModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { getLocalCachedQuestions, QUESTIONS_CACHE_KEY, saveQuestionsBatchToFirestore } from '../../services/questionStorageService';
import { useScoreSort } from '../../lib/useScoreSort';
import { StudentAssignmentModule } from './StudentAssignmentModule';
import { studentResultService } from '../../services/studentResultService';
import { resetOrDeleteStudentAssignmentSubmission } from '../../services/studentSubmissionResetService';
import { syncAssignmentQuestions } from '../../services/assignmentSyncService';
import { getCurrentTeacherProfile, resolveCurrentTeacherProfile } from '../../services/teacherStorageService';
import {
  getCurrentAccessContext,
  getContentPermissions,
  filterAccessibleItems,
  isContentOwner,
  isContentSharedWithTeacher,
  canTeacherAccessClass
} from '../../services/permissionService';
import { getStudentsFromLocalStorage, getClassStudentCount, generateDefaultClassRoster } from '../../services/studentStorageService';
import { auth, db } from '../../services/firebase';
import { doc, onSnapshot, getDoc, setDoc, collection, getDocs, deleteDoc, runTransaction } from 'firebase/firestore';
import { trackedSetDoc } from '../../services/firestoreWriteTracker';
import { normalizeStudentCode, formatStandardStudentCode, isSameStudent } from '../../services/studentCode';
import { checkQuestionCorrectLocal } from './StudentExamModule';
import { useAcademicYear } from '../../contexts/AcademicYearContext';
import { formatScore, formatTotalScore, roundTotalScore, isSubjectWithScore, getQualitativeLevel, getQualitativeLabel, getCurrentSubmissionTimestamp, formatSubmissionDateTime } from '../../utils/scoreUtils';
import { parseDateTimeVN, formatDateTimeVN, toISOStringUTC, validateStrictDateTimeInputVN, validateScheduleAndDeadline } from '../../utils/dateUtils';
import { scanMisfiledAssignmentSubmissions, executeMisfiledAssignmentMigration, MisfiledSubmissionItem, MigrationReport } from '../../services/assignmentMigrationService';

import { StudentSubmissionDetailModal } from './StudentSubmissionDetailModal';
import { createNotificationIfNotExists, LOW_SCORE_THRESHOLD } from '../../services/notificationService';
import {
  AssignmentTrackingResult,
  TrackingStudentRow,
  STANDARD_STUDENT_CODE_REGEX,
  getMemoryTrackingData,
  setMemoryTrackingData,
  clearMemoryTrackingData,
  clearIndexedDBTrackingData,
  getOrFetchAssignmentTrackingData,
  parseSubmissionTimestamp
} from '../../services/assignmentTrackingData';

export interface StudentSubmissionRow {
  code: string;
  name: string;
  answers: ('pass' | 'fail' | 'none')[];
  gradeStatuses?: ('ok' | 'error' | 'uncertain')[];
  gradeNotes?: string[];
  totalScore: number | string;
  aiStatus: 'pass' | 'fail' | 'none';
  submittedTime: string;
  status?: 'submitted' | 'waiting' | string;
  rawSubmission?: any;
  hasOrangeAlert?: boolean;
  hasRedAlert?: boolean;
  errorQuestionsCount?: number;
  errorDetails?: { questionIndex: number; status: 'error' | 'uncertain'; note: string }[];
}

/**
 * Chuyển bất kỳ chuỗi Ngày giao / Ngày tạo / Date / Timestamp thành milliseconds để so sánh thời gian thực.
 */
export function parseAssignedDateToTime(rawDate?: any, rawCreatedAt?: any): number {
  const d1 = parseDateTimeVN(rawDate);
  if (d1) return d1.getTime();
  const d2 = parseDateTimeVN(rawCreatedAt);
  if (d2) return d2.getTime();
  return 0;
}

/**
 * Chuẩn hóa hiển thị cột "NGÀY GIAO" theo đúng định dạng chuẩn: DD/MM/YYYY HH:mm (24h Asia/Ho_Chi_Minh)
 */
export function formatAssignedDateDisplay(rawDate?: any, rawCreatedAt?: any): string {
  const timeMs = parseAssignedDateToTime(rawDate, rawCreatedAt);
  if (timeMs <= 0) {
    return '18/08/2026 00:00';
  }
  return formatDateTimeVN(timeMs, '18/08/2026 00:00');
}

const CLASS_3A_STUDENTS: StudentSubmissionRow[] = [
  {
    code: '3a1',
    name: 'Hoàng Bảo An',
    answers: ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'],
    totalScore: 10,
    aiStatus: 'pass',
    submittedTime: '03:50:00 18/8/2026',
    status: 'submitted'
  },
  {
    code: '3a10',
    name: 'Hà Việt Hoàng',
    answers: ['fail', 'fail', 'fail', 'pass', 'pass', 'pass', 'pass', 'fail', 'pass'],
    totalScore: 4,
    aiStatus: 'pass',
    submittedTime: '05:38:47 29/8/2026',
    status: 'submitted'
  },
  { code: '3a2', name: 'Trần Bảo An', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a3', name: 'Nguyễn Nguyên Anh', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a4', name: 'Nguyễn Quốc Bảo', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a5', name: 'Tống Thị Quỳnh Chi', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a6', name: 'Vũ Ngọc Diệp', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a7', name: 'Mai Hải Đăng', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a8', name: 'Nguyễn Minh Đức', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a9', name: 'Hà Ngọc Hoa', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a11', name: 'Ngô Nhật Hưng', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a12', name: 'Nguyễn Bảo Khánh', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a13', name: 'Hoàng Tuấn Kiệt', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a14', name: 'Đỗ Diệu Linh', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a15', name: 'Phan Tú Linh', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a16', name: 'Hà Bảo Long', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a17', name: 'Hà Bảo Nam', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a18', name: 'Hà Duy Nam', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a19', name: 'Dương Bảo Ngân', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a20', name: 'Nguyễn Trung Nghĩa', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a21', name: 'Đào Thị Bích Ngọc', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a22', name: 'Phan Vũ Khánh Ngọc', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a23', name: 'Nguyễn Bình Nguyên', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a24', name: 'Đoàn Yến Nhi', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a25', name: 'Nguyễn Quỳnh Như', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a26', name: 'Lê Hải Phong', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a27', name: 'Hà Đại Phú', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a28', name: 'Đồng Xuân Phúc', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a29', name: 'Vũ Huy Thái', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a30', name: 'Hoàng Mai Phương Thảo', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a31', name: 'Hà Đình Tiến', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a32', name: 'Hoàng Khánh Trang', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a33', name: 'Vũ Hà Trang', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a34', name: 'Đoàn Minh Tú', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a35', name: 'Hà Phạm Hiền Tuệ', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a36', name: 'Đoàn Duy Tùng', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a37', name: 'Hà Thanh Tùng', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a38', name: 'Hà Hồng Vui', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' },
  { code: '3a39', name: 'Hà Thị Khánh Vy', answers: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'], totalScore: '-', aiStatus: 'none', submittedTime: 'Chờ HS', status: 'waiting' }
];

interface AssignmentModuleProps {
  assignments: HomeworkAssignment[];
  questionsBank?: QuestionItem[];
  onSaveAssignment: (assignment: HomeworkAssignment) => void;
  onDeleteAssignment?: (id: string) => void;
  userRole: UserRole;
  currentUserId?: string;
  currentUserName?: string;
}

export const AssignmentModule: React.FC<AssignmentModuleProps> = ({
  assignments = [],
  questionsBank,
  onSaveAssignment,
  onDeleteAssignment,
  userRole,
  currentUserId,
  currentUserName
}) => {
  // Derive authentic teacher profile from Single Source of Truth (`teachers` / `to_chuyen_mon` collections)
  const authEmail = (typeof window !== 'undefined' ? (auth?.currentUser?.email || localStorage.getItem('eduplay_teacher_email')) : null);
  const accessContext = useMemo(() => getCurrentAccessContext(userRole, authEmail), [userRole, authEmail]);
  const activeTeacherProfile = accessContext.teacherProfile;
  const effectiveTeacherName = (currentUserName && currentUserName !== 'Lê Minh Anh' && !(currentUserName.includes('Văn Quân') && !authEmail?.includes('vanquan')))
    ? currentUserName
    : activeTeacherProfile.name;
  const effectiveTeacherId = (currentUserId && currentUserId !== 'u-4' && currentUserId.length <= 10 && currentUserId.startsWith('gv-'))
    ? currentUserId
    : activeTeacherProfile.id;

  const isAdmin = accessContext.isAdmin;

  const isAssignmentOwner = useCallback((as: HomeworkAssignment): boolean => {
    return isContentOwner(as, accessContext);
  }, [accessContext]);

  const effectiveQuestionsBank = questionsBank && questionsBank.length > 0 ? questionsBank : getLocalCachedQuestions();
  // Perspective view: 'teacher' or 'student'
  const [activeRoleView, setActiveRoleView] = useState<'teacher' | 'student'>(
    userRole === 'student' ? 'student' : 'teacher'
  );

  // Repeat homework toggle state
  const [allowRepeat, setAllowRepeat] = useState<boolean>(true);

  // Active Category Tab: 'all' | 'my' | 'colleague'
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'colleague'>('all');

  // Academic Period from context
  const { selectedAcademicYear, selectedSemester } = useAcademicYear();

  // Dropdown filters
  const [selectedGrade, setSelectedGrade] = useState<string>('Tất cả các khối');
  const [selectedSubject, setSelectedSubject] = useState<string>('Tất cả các môn');
  const [selectedClass, setSelectedClass] = useState<string>('Tất cả các lớp');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Pagination states
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Selected assignment for Detail Modal / Submissions
  const [detailAssignment, setDetailAssignment] = useState<HomeworkAssignment | null>(null);

  // Tracking modal states
  const [trackingTab, setTrackingTab] = useState<'all' | 'needs_action' | 'support'>('all');
  const [needsActionSubFilter, setNeedsActionSubFilter] = useState<'all' | 'orange' | 'red'>('all');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentSubmissionRow | null>(null);
  const [regradeToggle, setRegradeToggle] = useState(true);
  const [regradeScore, setRegradeScore] = useState('10');
  const [regradeComment, setRegradeComment] = useState('Chấm lại bởi AI thành công.');

  // Delete submission confirmation modal states
  const [deleteTarget, setDeleteTarget] = useState<StudentSubmissionRow | null>(null);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Misfiled assignment migration states
  const [isMisfiledScanModalOpen, setIsMisfiledScanModalOpen] = useState(false);
  const [misfiledItems, setMisfiledItems] = useState<MisfiledSubmissionItem[]>([]);
  const [selectedMisfiledIds, setSelectedMisfiledIds] = useState<Set<string>>(new Set());
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState<MigrationReport | null>(null);

  // Listener for opening tracking modal from Header notification
  useEffect(() => {
    const handleOpenTracking = (e: CustomEvent) => {
      const { assignmentId } = e.detail || {};
      if (assignmentId) {
        const found = assignments.find(a => a.id === assignmentId);
        if (found) {
          setDetailAssignment(found);
          setTrackingTab('needs_action');
        }
      }
    };
    window.addEventListener('eduplay_open_assignment_tracking', handleOpenTracking as EventListener);
    return () => {
      window.removeEventListener('eduplay_open_assignment_tracking', handleOpenTracking as EventListener);
    };
  }, [assignments]);

  // Live submissions synced from Firestore subcollection & local records
  const [liveSubmissions, setLiveSubmissions] = useState<any[]>([]);
  const [isSyncingSubmissions, setIsSyncingSubmissions] = useState(false);
  const [submissionSyncTick, setSubmissionSyncTick] = useState(0);

  // Real-time synchronization for detailAssignment and its submissions from Firestore
  useEffect(() => {
    if (!detailAssignment?.id || !db) return;

    // 1. Listen to parent assignment document updates
    const assignDocRef = doc(db, 'assignments', detailAssignment.id);
    const unsubDoc = onSnapshot(
      assignDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const freshData = { id: docSnap.id, ...docSnap.data() } as HomeworkAssignment;
          setDetailAssignment(prev => {
            if (!prev || prev.id !== freshData.id) return prev;
            return {
              ...prev,
              ...freshData,
              questions: (freshData.questions && freshData.questions.length > 0) ? freshData.questions : prev.questions,
              submissions: Array.isArray(freshData.submissions) ? freshData.submissions : (prev.submissions || [])
            };
          });
        }
      },
      (err) => {
        console.warn('Real-time assignment doc snapshot listener error:', err);
      }
    );

    // 2. Real-time listener for subcollection: assignments/{id}/submissions
    const subsCollRef = collection(db, 'assignments', detailAssignment.id, 'submissions');
    const unsubSubs = onSnapshot(
      subsCollRef,
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (docs.length > 0) {
          setLiveSubmissions(prev => {
            const map = new Map<string, any>();
            prev.forEach((s: any) => map.set(s.id || s.studentId || s.studentCode || s.maHs, s));
            docs.forEach((s: any) => map.set(s.id || s.studentId || s.studentCode || s.maHs, s));
            return Array.from(map.values());
          });
          setSubmissionSyncTick(t => t + 1);
        }
      },
      (err) => {
        console.warn('Real-time subcollection submissions listener error:', err);
      }
    );

    return () => {
      unsubDoc();
      unsubSubs();
    };
  }, [detailAssignment?.id]);

  // Comprehensive manual/automatic submission sync function (Read-only, no Firestore write)
  const handleSyncSubmissions = useCallback(async (showToastNotice = true) => {
    if (!detailAssignment?.id) return;
    setIsSyncingSubmissions(true);
    try {
      const mergedSubsMap = new Map<string, any>();

      // 1. Existing submissions on detailAssignment
      if (Array.isArray(detailAssignment.submissions)) {
        detailAssignment.submissions.forEach((s: any) => {
          const key = s.studentId || s.studentCode || s.maHs || s.id;
          if (key) mergedSubsMap.set(String(key).toLowerCase(), s);
        });
      }

      // 2. Query Firestore subcollection: assignments/{id}/submissions
      if (db) {
        try {
          const subsCollRef = collection(db, 'assignments', detailAssignment.id, 'submissions');
          const subsSnap = await getDocs(subsCollRef);
          subsSnap.docs.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            const key = (data as any).studentId || (data as any).studentCode || (data as any).maHs || docSnap.id;
            if (key) mergedSubsMap.set(String(key).toLowerCase(), data);
          });
        } catch (err) {
          console.warn('Không thể đọc subcollection submissions:', err);
        }

        // Also fetch fresh assignment doc to see if submissions array was updated
        try {
          const assignDocRef = doc(db, 'assignments', detailAssignment.id);
          const assignSnap = await getDoc(assignDocRef);
          if (assignSnap.exists()) {
            const assignData = assignSnap.data() as HomeworkAssignment;
            if (Array.isArray(assignData.submissions)) {
              assignData.submissions.forEach((s: any) => {
                const key = s.studentId || s.studentCode || s.maHs || s.id;
                if (key) mergedSubsMap.set(String(key).toLowerCase(), s);
              });
            }
          }
        } catch (err) {
          console.warn('Không thể đọc assignment doc:', err);
        }
      }

      // 3. Scan localStorage for student submissions
      if (typeof window !== 'undefined') {
        const targetClass = detailAssignment.targetClass || 'Lớp 3A';
        const classStudents = getStudentsFromLocalStorage(targetClass) || [];
        classStudents.forEach(st => {
          const keys = [st.code, st.id, st.username].filter(Boolean) as string[];
          keys.forEach(k => {
            try {
              const raw = localStorage.getItem(`eduplay_student_submissions_${k}`);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  const m = parsed.find((item: any) =>
                    item.assignment?.id === detailAssignment.id ||
                    item.id === detailAssignment.id ||
                    item.assignmentId === detailAssignment.id ||
                    (item.title && item.title === detailAssignment.title)
                  );
                  if (m) {
                    mergedSubsMap.set(String(st.code).toLowerCase(), {
                      id: m.id || `sub-${st.code}`,
                      studentId: st.code,
                      studentCode: st.code,
                      maHs: st.code,
                      studentName: st.fullName || st.name,
                      score: m.score !== undefined ? m.score : (m.totalScore !== undefined ? m.totalScore : '-'),
                      totalScore: m.totalScore !== undefined ? m.totalScore : (m.score !== undefined ? m.score : '-'),
                      submittedAt: m.submittedTime || m.submittedAt || new Date().toLocaleString('vi-VN'),
                      submittedTime: m.submittedTime || m.submittedAt || new Date().toLocaleString('vi-VN'),
                      answers: m.answers || [],
                      status: 'submitted'
                    });
                  }
                }
              }
            } catch {}
          });
        });

        // Also check eduplay_all_exam_submissions & eduplay_exam_subs_{id}
        try {
          const rawExamSubs = localStorage.getItem(`eduplay_exam_subs_${detailAssignment.id}`);
          if (rawExamSubs) {
            const parsed = JSON.parse(rawExamSubs);
            if (Array.isArray(parsed)) {
              parsed.forEach((s: any) => {
                const sCode = s.studentId || s.studentCode || s.maHs;
                if (sCode) {
                  mergedSubsMap.set(String(sCode).toLowerCase(), {
                    ...s,
                    status: 'submitted'
                  });
                }
              });
            }
          }
        } catch {}
      }

      const allMerged = Array.from(mergedSubsMap.values());
      setLiveSubmissions(allMerged);
      setSubmissionSyncTick(prev => prev + 1);

      if (showToastNotice) {
        showToast(`✅ Đã đồng bộ kết quả nộp bài! Tìm thấy ${allMerged.length} bài nộp.`);
      }
    } catch (err) {
      console.error('Lỗi khi đồng bộ kết quả bài tập:', err);
      if (showToastNotice) {
        showToast('⚠️ Không thể đồng bộ kết quả, vui lòng thử lại.');
      }
    } finally {
      setIsSyncingSubmissions(false);
    }
  }, [detailAssignment, showToast]);

  // Auto-sync once on detailAssignment open (Read-only, no Firestore write)
  useEffect(() => {
    if (detailAssignment?.id) {
      handleSyncSubmissions(false);
    } else {
      setLiveSubmissions([]);
    }
  }, [detailAssignment?.id]);

  useEffect(() => {
    const handleSubmissionsUpdated = () => {
      setSubmissionSyncTick(prev => prev + 1);
    };
    window.addEventListener('eduplay_student_submissions_updated', handleSubmissionsUpdated);
    window.addEventListener('storage', handleSubmissionsUpdated);
    return () => {
      window.removeEventListener('storage', handleSubmissionsUpdated);
    };
  }, []);

  // Async handler for confirming delete submission via React State Modal
  const handleConfirmDeleteSubmission = async () => {
    if (!deleteTarget || !detailAssignment?.id) {
      console.warn('[Delete Submission] deleteTarget hoặc detailAssignment không có dữ liệu.', {
        deleteTarget,
        detailAssignmentId: detailAssignment?.id
      });
      return;
    }

    const targetCode = deleteTarget.code;
    const targetName = deleteTarget.name;
    const assignmentId = detailAssignment.id;

    console.log(`[Delete Submission Start] Deleting assignment submission: StudentName="${targetName}", StudentCode="${targetCode}", AssignmentId="${assignmentId}"`);

    setIsDeletingSubmission(true);
    setDeleteError(null);

    try {
      const result = await resetOrDeleteStudentAssignmentSubmission({
        studentCode: targetCode,
        studentName: targetName,
        studentId: targetCode,
        assignmentId: assignmentId,
        originalAssignmentId: detailAssignment.originalAssignmentId,
        targetClass: detailAssignment.targetClass
      });

      console.log(`[Delete Submission Success] Resetted/deleted submission for ${targetName} (${targetCode}):`, result);

      // 1. Immediately remove student's submission from liveSubmissions state
      setLiveSubmissions(prev => prev.filter((s: any) => {
        const code = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || s.id || '');
        return code !== normalizeStudentCode(targetCode);
      }));

      // 2. Update detailAssignment.submissions locally so tracking list re-evaluates
      setDetailAssignment(prev => {
        if (!prev) return null;
        const subs = Array.isArray(prev.submissions) ? prev.submissions : [];
        const updatedSubs = subs.filter((s: any) => {
          const code = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || s.id || '');
          return code !== normalizeStudentCode(targetCode);
        });
        return {
          ...prev,
          submissions: updatedSubs,
          submittedCount: Math.max(0, updatedSubs.length),
          completedCount: Math.max(0, updatedSubs.length)
        };
      });

      // 3. Force submissionSyncTick increment to trigger recalculation of trackingStudentsList
      setSubmissionSyncTick(tick => tick + 1);

      // 4. Also call handleSyncSubmissions to ensure complete state sync
      await handleSyncSubmissions(false);

      // 5. Show Toast notification on UI
      showToast(`Đã xóa kết quả bài làm của ${targetName}`);

      // 6. Close the delete target modal
      setDeleteTarget(null);
    } catch (err: any) {
      console.error(`[Delete Submission Error] Lỗi khi xóa kết quả bài làm của ${targetName} (${targetCode}):`, err);
      setDeleteError(err?.message || 'Không thể xóa kết quả bài làm. Vui lòng kiểm tra lại kết nối mạng!');
    } finally {
      setIsDeletingSubmission(false);
    }
  };

  // Helper calculating authentic unique submitted student count
  const getAssignmentSubmissionCount = useCallback((as: HomeworkAssignment): number => {
    if (!as) return 0;
    const uniqueStudentKeys = new Set<string>();

    const addSubKey = (s: any) => {
      if (!s) return;
      const k = normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '');
      if (k) uniqueStudentKeys.add(k);
    };

    // 1. as.submissions
    const subs = Array.isArray(as.submissions) ? as.submissions : [];
    subs.forEach(addSubKey);

    // 2. submittedIds
    if (Array.isArray(as.submittedIds)) {
      as.submittedIds.forEach((id: string) => {
        const norm = normalizeStudentCode(id);
        if (norm) uniqueStudentKeys.add(norm);
      });
    }

    // 3. If this is detailAssignment, include liveSubmissions
    if (detailAssignment && detailAssignment.id === as.id && Array.isArray(liveSubmissions)) {
      liveSubmissions.forEach(addSubKey);
    }

    // 4. Scan localStorage for students in targetClass
    if (typeof window !== 'undefined' && as.targetClass) {
      const roster = getStudentsFromLocalStorage(as.targetClass) || [];
      roster.forEach(st => {
        const stdCode = formatStandardStudentCode(st.code) || normalizeStudentCode(st.code);
        if (!stdCode) return;
        try {
          const raw = localStorage.getItem(`eduplay_student_submissions_${stdCode}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const matched = parsed.find((item: any) =>
                (item.assignment?.id === as.id ||
                item.id === as.id ||
                item.assignmentId === as.id ||
                (item.title && item.title === as.title)) &&
                isSameStudent(st, item, as.targetClass)
              );
              if (matched) {
                addSubKey({ studentCode: stdCode });
              }
            }
          }
        } catch {}
      });

      // Also check eduplay_exam_subs_{as.id}
      try {
        const rawExamSubs = localStorage.getItem(`eduplay_exam_subs_${as.id}`);
        if (rawExamSubs) {
          const parsed = JSON.parse(rawExamSubs);
          if (Array.isArray(parsed)) {
            parsed.forEach(addSubKey);
          }
        }
      } catch {}
    }

    if (uniqueStudentKeys.size > 0) return uniqueStudentKeys.size;
    if (typeof as.submittedCount === 'number' && as.submittedCount > 0) return as.submittedCount;
    if (typeof as.completedCount === 'number' && as.completedCount > 0) return as.completedCount;
    return 0;
  }, [detailAssignment, liveSubmissions, submissionSyncTick]);

  // Dynamic tracking students derived from detailAssignment submissions and class roster (chỉ khớp theo mã học sinh đầy đủ + lớp, tuyệt đối không dùng họ tên)
  const trackingStudentsList = useMemo(() => {
    if (!detailAssignment) return [];
    
    const targetClassName = detailAssignment.targetClass || 'Lớp 3A';
    const classStudentsRoster = getStudentsFromLocalStorage(targetClassName) || [];
    
    const subList: any[] = [
      ...(Array.isArray(detailAssignment.submissions) ? detailAssignment.submissions : []),
      ...liveSubmissions
    ];

    // Also scan localStorage for submissions of each student in this class
    if (typeof window !== 'undefined') {
      classStudentsRoster.forEach(st => {
        const stdCode = formatStandardStudentCode(st.code) || normalizeStudentCode(st.code);
        if (!stdCode) return;
        try {
          const raw = localStorage.getItem(`eduplay_student_submissions_${stdCode}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const matched = parsed.find((item: any) => 
                (item.assignment?.id === detailAssignment.id ||
                item.id === detailAssignment.id ||
                item.assignmentId === detailAssignment.id ||
                (item.title && item.title === detailAssignment.title)) &&
                isSameStudent(st, item, targetClassName)
              );
              if (matched) {
                subList.push({
                  id: matched.id || `sub-${stdCode}`,
                  studentId: stdCode,
                  studentCode: stdCode,
                  maHs: stdCode,
                  studentClass: targetClassName,
                  studentName: st.fullName || st.name,
                  score: matched.score !== undefined ? matched.score : (matched.totalScore !== undefined ? matched.totalScore : '-'),
                  totalScore: matched.totalScore !== undefined ? matched.totalScore : (matched.score !== undefined ? matched.score : '-'),
                  submittedAt: matched.submittedTime || matched.submittedAt || new Date().toLocaleString('vi-VN'),
                  submittedTime: matched.submittedTime || matched.submittedAt || new Date().toLocaleString('vi-VN'),
                  answers: matched.answers || [],
                  status: 'submitted'
                });
              }
            }
          }
        } catch {}
      });
    }

    const questions = detailAssignment.questions || [];
    const questionCount = questions.length > 0 ? questions.length : 5;

    const resultList = classStudentsRoster.map((st, idx) => {
      const submission = subList.find(sub => isSameStudent(st, sub, targetClassName)) || null;

      if (submission) {
        const rawAnswers = submission.answers || submission.studentAnswers || submission.answersById;
        const evaluatedAnswers: ('pass' | 'fail' | 'none')[] = Array.from({ length: questionCount }).map((_, qi) => {
          const q = questions[qi];
          let rawChoice: any = undefined;
          if (Array.isArray(rawAnswers)) {
            rawChoice = rawAnswers[qi];
          } else if (rawAnswers && typeof rawAnswers === 'object') {
            rawChoice = rawAnswers[qi] !== undefined 
              ? rawAnswers[qi] 
              : (rawAnswers[String(qi)] !== undefined ? rawAnswers[String(qi)] : (q?.id ? rawAnswers[q.id] : undefined));
          }
          if (rawChoice === undefined && submission.answersById && q?.id) {
            rawChoice = submission.answersById[q.id];
          }

          // 1. Direct pass / fail values
          if (rawChoice === 'pass' || rawChoice === true || rawChoice === 'correct') return 'pass';
          if (rawChoice === 'fail' || rawChoice === false || rawChoice === 'incorrect') return 'fail';

          // 2. Pre-evaluated questionResults if present
          const preEvaluated = submission.questionResults || submission.results || submission.gradedAnswers;
          if (Array.isArray(preEvaluated) && preEvaluated[qi] !== undefined) {
            const p = preEvaluated[qi];
            if (typeof p === 'boolean') return p ? 'pass' : 'fail';
            if (p === 'pass' || p === 'fail') return p;
            if (p && typeof p === 'object' && p.isCorrect !== undefined) return p.isCorrect ? 'pass' : 'fail';
          }

          // 3. Question-level evaluation via checkQuestionCorrectLocal
          if (q && rawChoice !== undefined && rawChoice !== null && rawChoice !== '') {
            try {
              return checkQuestionCorrectLocal(q, rawChoice) ? 'pass' : 'fail';
            } catch (err) {
              console.warn(`Lỗi chấm điểm câu ${qi}:`, err);
            }
          }
          return 'fail';
        });

        const correctCount = evaluatedAnswers.filter(a => a === 'pass').length;
        const computedScore = questionCount > 0 ? Math.round((correctCount / questionCount) * 10) : 0;

        const rawScore = submission.score !== undefined ? submission.score : (submission.totalScore !== undefined ? submission.totalScore : '-');
        let finalScore: number | string = computedScore;
        if (rawScore !== undefined && rawScore !== null && rawScore !== '-' && rawScore !== '0' && rawScore !== 0) {
          const num = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore));
          if (!isNaN(num) && num > 0) finalScore = num;
          else if (correctCount > 0) finalScore = computedScore;
        } else if (correctCount > 0) {
          finalScore = computedScore;
        } else {
          finalScore = rawScore;
        }

        const numericScoreVal = typeof finalScore === 'number' ? finalScore : (finalScore !== '-' ? parseFloat(String(finalScore)) : 0);
        const isPassed = !isNaN(numericScoreVal) ? numericScoreVal >= LOW_SCORE_THRESHOLD : false;

        // Trạng thái chấm từng câu (gradeStatus: 'ok' | 'error' | 'uncertain') và lý do (gradeNote)
        const rawGradeStatuses = submission.gradeStatuses || submission.questionStatuses || submission.gradeStatus;
        const rawGradeNotes = submission.gradeNotes || submission.questionNotes;

        const gradeStatuses: ('ok' | 'error' | 'uncertain')[] = Array.from({ length: questionCount }).map((_, qi) => {
          if (Array.isArray(rawGradeStatuses) && rawGradeStatuses[qi]) {
            return rawGradeStatuses[qi];
          }
          if (submission.aiFailedQuestions && Array.isArray(submission.aiFailedQuestions) && submission.aiFailedQuestions.includes(qi)) {
            return 'error';
          }
          if (submission.uncertainQuestions && Array.isArray(submission.uncertainQuestions) && submission.uncertainQuestions.includes(qi)) {
            return 'uncertain';
          }
          return 'ok';
        });

        const gradeNotes: string[] = Array.from({ length: questionCount }).map((_, qi) => {
          if (Array.isArray(rawGradeNotes) && rawGradeNotes[qi]) {
            return rawGradeNotes[qi];
          }
          const st = gradeStatuses[qi];
          if (st === 'error') return `Câu ${qi + 1}: Lỗi kết nối mạng khi AI chấm bài`;
          if (st === 'uncertain') return `Câu ${qi + 1}: Đáp án tự luận phức tạp, AI chưa khẳng định được`;
          return '';
        });

        const errorDetails: { questionIndex: number; status: 'error' | 'uncertain'; note: string }[] = [];
        gradeStatuses.forEach((st, qi) => {
          if (st === 'error' || st === 'uncertain') {
            errorDetails.push({
              questionIndex: qi,
              status: st,
              note: gradeNotes[qi] || (st === 'error' ? 'Lỗi hệ thống khi chấm câu này' : 'Đáp án phức tạp, cần GV duyệt')
            });
          }
        });

        const hasOrangeAlert = errorDetails.length > 0;
        const hasRedAlert = typeof numericScoreVal === 'number' && numericScoreVal < LOW_SCORE_THRESHOLD;
        const stCode = st.code || `st-${idx + 1}`;
        const stName = st.name || st.fullName || `Học sinh ${idx + 1}`;

        // Auto trigger notifications for orange and red alerts
        if (hasOrangeAlert) {
          createNotificationIfNotExists({
            teacherId: effectiveTeacherId,
            studentId: stCode,
            studentCode: stCode,
            studentName: stName,
            assignmentId: detailAssignment.id,
            assignmentTitle: detailAssignment.title,
            type: 'ai_failed',
            message: `Bài làm của ${stName} có ${errorDetails.length} câu AI chưa chấm được.`,
            targetClass: detailAssignment.targetClass,
            details: {
              failedQuestionIndexes: errorDetails.map(e => e.questionIndex),
              gradeNotes: errorDetails.map(e => e.note)
            }
          });
        }

        if (hasRedAlert) {
          createNotificationIfNotExists({
            teacherId: effectiveTeacherId,
            studentId: stCode,
            studentCode: stCode,
            studentName: stName,
            assignmentId: detailAssignment.id,
            assignmentTitle: detailAssignment.title,
            type: 'low_score',
            message: `Học sinh ${stName} làm bài đạt điểm dưới ${LOW_SCORE_THRESHOLD} (${numericScoreVal} điểm).`,
            targetClass: detailAssignment.targetClass,
            details: {
              score: numericScoreVal
            }
          });
        }

        return {
          code: stCode,
          name: stName,
          answers: evaluatedAnswers,
          gradeStatuses,
          gradeNotes,
          totalScore: finalScore,
          aiStatus: isPassed ? ('pass' as const) : ('fail' as const),
          submittedTime: formatSubmissionDateTime(submission.submittedAt || submission.submittedTime || getCurrentSubmissionTimestamp()),
          status: 'submitted' as const,
          rawSubmission: submission,
          hasOrangeAlert,
          hasRedAlert,
          errorQuestionsCount: errorDetails.length,
          errorDetails
        };
      } else {
        return {
          code: st.code || `st-${idx + 1}`,
          name: st.name || st.fullName || `Học sinh ${idx + 1}`,
          answers: Array.from({ length: questionCount }).map(() => 'none' as const),
          totalScore: '-',
          aiStatus: 'none' as const,
          submittedTime: 'Chờ HS',
          status: 'waiting' as const
        };
      }
    });

    if (detailAssignment?.id) {
      try {
        setMemoryTrackingData(detailAssignment.id, {
          assignmentId: detailAssignment.id,
          targetClass: targetClassName,
          totalStudents: resultList.length,
          submittedCount: resultList.filter(s => s.status === 'submitted').length,
          trackingList: resultList as any,
          timestamp: Date.now()
        });
      } catch {}
    }

    return resultList;
  }, [detailAssignment, liveSubmissions, submissionSyncTick]);

  const filteredTrackingStudents = useMemo(() => {
    if (trackingTab === 'needs_action') {
      const candidates = trackingStudentsList.filter(
        st => st.status === 'submitted' && (st.hasOrangeAlert || st.hasRedAlert)
      );

      let subFiltered = candidates;
      if (needsActionSubFilter === 'orange') {
        subFiltered = candidates.filter(st => st.hasOrangeAlert);
      } else if (needsActionSubFilter === 'red') {
        subFiltered = candidates.filter(st => st.hasRedAlert);
      }

      // Priority sort: Orange alert first, then Red alert second
      return [...subFiltered].sort((a, b) => {
        if (a.hasOrangeAlert && !b.hasOrangeAlert) return -1;
        if (!a.hasOrangeAlert && b.hasOrangeAlert) return 1;
        return 0;
      });
    }
    if (trackingTab === 'support') {
      return trackingStudentsList.filter(st => st.totalScore !== '-' && Number(st.totalScore) < LOW_SCORE_THRESHOLD);
    }
    return trackingStudentsList;
  }, [trackingStudentsList, trackingTab, needsActionSubFilter]);

  const getAssignmentScoreInfo = useCallback((st: StudentSubmissionRow) => ({
    isSubmitted: st.status === 'submitted',
    score: st.totalScore !== '-' && !isNaN(Number(st.totalScore)) ? Number(st.totalScore) : null
  }), []);

  const {
    sortScoreDirection: assignmentSortScoreDirection,
    handleToggleSortScore: handleToggleAssignmentSortScore,
    resetSortScore: resetAssignmentSortScore,
    sortedItems: sortedTrackingStudents
  } = useScoreSort(filteredTrackingStudents, getAssignmentScoreInfo);

  // Vinh danh modal state
  const [vinhDanhAssignment, setVinhDanhAssignment] = useState<HomeworkAssignment | null>(null);
  const [vinhDanhTrackingResult, setVinhDanhTrackingResult] = useState<AssignmentTrackingResult | null>(null);
  const [isLoadingVinhDanh, setIsLoadingVinhDanh] = useState(false);
  const [vinhDanhError, setVinhDanhError] = useState<string | null>(null);
  const [sharingAssignment, setSharingAssignment] = useState<HomeworkAssignment | null>(null);

  const { classes: allRealClasses, getClassesForGrade: fetchClassesForGrade } = useClassesList();

  // Helper to parse date string into timestamp via unified dateUtils
  const parseCustomDateTimeToMs = (dateStr?: string): number => {
    const d = parseDateTimeVN(dateStr);
    return d ? d.getTime() : 0;
  };

  const formatToDdMmYyyyHhMm = (dateInput?: string | Date): string => {
    if (!dateInput) {
      return formatDateTimeVN(new Date());
    }
    return formatDateTimeVN(dateInput, typeof dateInput === 'string' ? dateInput : '');
  };

  const getHomeworkRootId = (as: HomeworkAssignment): string => {
    return as.originalAssignmentId || (as as any).groupId || as.id.replace(/-class-.*$/, '');
  };

  const getGroupAssignments = (as: HomeworkAssignment, allAssignments: HomeworkAssignment[]): HomeworkAssignment[] => {
    const rootId = getHomeworkRootId(as);
    const cleanAsTitle = (as.title || '').trim().toLowerCase().replace(/^bài tập tự luyện:\s*/i, '').replace(/^bài tập:\s*/i, '');
    return allAssignments.filter(item => {
      if (item.id === as.id) return true;
      const itemRootId = getHomeworkRootId(item);
      if (rootId && itemRootId && rootId === itemRootId) return true;
      const cleanItemTitle = (item.title || '').trim().toLowerCase().replace(/^bài tập tự luyện:\s*/i, '').replace(/^bài tập:\s*/i, '');
      if (cleanItemTitle === cleanAsTitle && item.grade === as.grade && item.subject === as.subject) return true;
      return false;
    });
  };

  const findExistingAssignmentForClass = (as: HomeworkAssignment, targetClassName: string): HomeworkAssignment | undefined => {
    const rootId = getHomeworkRootId(as);
    const cleanAsTitle = (as.title || '').trim().toLowerCase().replace(/^bài tập tự luyện:\s*/i, '').replace(/^bài tập:\s*/i, '');
    const normTargetClass = (targetClassName || '').trim().toLowerCase().replace(/\s+/g, '');

    return assignments.find(item => {
      const itemClasses = (item.targetClasses || (item.targetClass ? item.targetClass.split(',') : [])).map(c => c.trim().toLowerCase().replace(/\s+/g, ''));
      const itemTargetClass = (item.targetClass || '').trim().toLowerCase().replace(/\s+/g, '');
      const matchesClass = itemClasses.includes(normTargetClass) || itemTargetClass === normTargetClass || item.id.includes(`-lp${normTargetClass}`);
      if (!matchesClass) return false;

      const itemRootId = getHomeworkRootId(item);
      if (rootId && itemRootId && rootId === itemRootId) return true;
      const cleanItemTitle = (item.title || '').trim().toLowerCase().replace(/^bài tập tự luyện:\s*/i, '').replace(/^bài tập:\s*/i, '');
      return cleanItemTitle === cleanAsTitle && item.grade === as.grade;
    });
  };

  // Modal state for "🚀 Giao Bài Tập"
  const [assigningConfigAssignment, setAssigningConfigAssignment] = useState<HomeworkAssignment | null>(null);
  const [assignTitle, setAssignTitle] = useState<string>('');
  const [selectedAssignClasses, setSelectedAssignClasses] = useState<string[]>([]);
  const [assignStartDate, setAssignStartDate] = useState<string>('');
  const [assignDueDate, setAssignDueDate] = useState<string>('');
  const [assignMaxAttempts, setAssignMaxAttempts] = useState<string>('Không giới hạn số lần luyện tập');
  const [assignShuffleQuestions, setAssignShuffleQuestions] = useState<boolean>(true);
  const [assignShuffleOptions, setAssignShuffleOptions] = useState<boolean>(true);
  const [assignTargetType, setAssignTargetType] = useState<'all' | 'specific'>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [assignRealtimeLeaderboard, setAssignRealtimeLeaderboard] = useState<boolean>(false);

  // Modal state for "⚙️ Sửa cài đặt giao bài"
  const [editingConfigAssignment, setEditingConfigAssignment] = useState<HomeworkAssignment | null>(null);
  const [editConfigStartDate, setEditConfigStartDate] = useState<string>('');
  const [editConfigDueDate, setEditConfigDueDate] = useState<string>('');
  const [editConfigMaxAttempts, setEditConfigMaxAttempts] = useState<string>('Không giới hạn số lần luyện tập');
  const [editConfigShuffleQuestions, setEditConfigShuffleQuestions] = useState<boolean>(true);
  const [editConfigShuffleOptions, setEditConfigShuffleOptions] = useState<boolean>(true);
  const [editConfigRealtimeLeaderboard, setEditConfigRealtimeLeaderboard] = useState<boolean>(false);
  const [editConfigLeaderboardScope, setEditConfigLeaderboardScope] = useState<'all' | 'since_enabled'>('all');
  const [editConfigApplyToGroup, setEditConfigApplyToGroup] = useState<boolean>(true);
  const [editConfigDateError, setEditConfigDateError] = useState<string | null>(null);

  // Conflict warning modal state
  const [conflictAssignData, setConflictAssignData] = useState<{
    conflicts: { className: string; submittedCount: number; totalCount: number; existingAssignment: HomeworkAssignment }[];
    newTitle: string;
    selectedClasses: string[];
    startDate: string;
    dueDate: string;
    maxAttempts: string;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    realtimeLeaderboard: boolean;
  } | null>(null);

  // Duplicate Scanner tool state (Debug mode: ?debug=1)
  const isDebugMode = typeof window !== 'undefined' && window.location.search.includes('debug=1');
  const [isScanDuplicatesModalOpen, setIsScanDuplicatesModalOpen] = useState(false);

  const getClassesForGrade = useCallback((gradeRaw?: string): string[] => {
    return fetchClassesForGrade(gradeRaw).map(c => c.name);
  }, [fetchClassesForGrade]);

  const handleOpenAssignConfig = (as: HomeworkAssignment) => {
    setAssigningConfigAssignment(as);
    setAssignTitle(as.title || '');
    
    const initialClasses = as.targetClass
      ? as.targetClass.split(',').map(c => c.trim()).filter(Boolean)
      : [];
      
    setSelectedAssignClasses(initialClasses);
    const now = new Date();
    setAssignStartDate(formatToDdMmYyyyHhMm(now));

    const nowPlus7 = new Date(now);
    nowPlus7.setDate(nowPlus7.getDate() + 7);
    nowPlus7.setHours(23, 59, 0, 0);
    setAssignDueDate(as.dueDate ? formatToDdMmYyyyHhMm(as.dueDate) : formatToDdMmYyyyHhMm(nowPlus7));

    setAssignMaxAttempts('Không giới hạn số lần luyện tập');
    setAssignShuffleQuestions(true);
    setAssignShuffleOptions(true);
    setAssignTargetType('all');
    setSelectedStudentIds(CLASS_3A_STUDENTS.map(s => s.code));
    setAssignRealtimeLeaderboard(as.enableRealtimeLeaderboard === true);
  };

  const handleOpenEditConfig = (as: HomeworkAssignment) => {
    setEditingConfigAssignment(as);
    const now = new Date();
    const defaultStart = formatToDdMmYyyyHhMm(as.startDate || as.assignedDate || now);
    
    let defaultDue = as.dueDate ? formatToDdMmYyyyHhMm(as.dueDate) : '';
    if (!defaultDue) {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      d.setHours(23, 59, 0, 0);
      defaultDue = formatToDdMmYyyyHhMm(d);
    }

    setEditConfigStartDate(defaultStart);
    setEditConfigDueDate(defaultDue);
    setEditConfigMaxAttempts(as.maxAttempts || (as.allowRepeat === false ? '1 lần' : 'Không giới hạn số lần luyện tập'));
    setEditConfigShuffleQuestions(as.shuffleQuestions !== false);
    setEditConfigShuffleOptions(as.shuffleOptions !== false);
    setEditConfigRealtimeLeaderboard(as.enableRealtimeLeaderboard === true);
    setEditConfigLeaderboardScope(as.leaderboardScope === 'since_enabled' ? 'since_enabled' : 'all');
    setEditConfigApplyToGroup(true);
    setEditConfigDateError(null);
  };

  const handleSaveEditConfig = async () => {
    if (!editingConfigAssignment) return;

    const startCheck = validateStrictDateTimeInputVN(editConfigStartDate);
    if (!startCheck.valid) {
      setEditConfigDateError(startCheck.error || 'Thời điểm bắt đầu không hợp lệ!');
      return;
    }

    const dueCheck = validateStrictDateTimeInputVN(editConfigDueDate);
    if (!dueCheck.valid) {
      setEditConfigDateError(dueCheck.error || 'Hạn làm bài không hợp lệ!');
      return;
    }

    const rangeCheck = validateScheduleAndDeadline({
      openTime: editConfigStartDate,
      deadlineTime: editConfigDueDate
    });
    if (!rangeCheck.valid) {
      setEditConfigDateError(rangeCheck.error || 'Thời điểm hết hạn làm bài phải sau thời điểm bắt đầu giao bài!');
      return;
    }

    try {
      const groupList = getGroupAssignments(editingConfigAssignment, assignments);
      const targetDocs = editConfigApplyToGroup && groupList.length > 0 ? groupList : [editingConfigAssignment];

      const startISO = toISOStringUTC(editConfigStartDate);
      const dueISO = toISOStringUTC(editConfigDueDate);
      const formattedDueVN = formatDateTimeVN(dueISO);

      const patch: any = {
        startDate: startISO,
        assignedDate: startISO,
        dueDate: dueISO,
        maxAttempts: editConfigMaxAttempts,
        allowRepeat: editConfigMaxAttempts === 'Không giới hạn số lần luyện tập' || editConfigMaxAttempts !== '1 lần',
        shuffleQuestions: editConfigShuffleQuestions,
        shuffleOptions: editConfigShuffleOptions,
        enableRealtimeLeaderboard: editConfigRealtimeLeaderboard,
        leaderboardScope: editConfigRealtimeLeaderboard ? editConfigLeaderboardScope : 'all',
        updatedAt: new Date().toISOString()
      };

      if (editConfigRealtimeLeaderboard && !editingConfigAssignment.enableRealtimeLeaderboard) {
        patch.leaderboardEnabledAt = new Date().toISOString();
      }

      for (const targetDoc of targetDocs) {
        if (db && targetDoc.id) {
          const docRef = doc(db, 'assignments', targetDoc.id);
          await trackedSetDoc(docRef, patch, { merge: true });
          const verifiedSnap = await getDoc(docRef).catch(() => null);
          if (verifiedSnap && verifiedSnap.exists()) {
            onSaveAssignment({ id: verifiedSnap.id, ...verifiedSnap.data() } as HomeworkAssignment);
            continue;
          }
        }
        onSaveAssignment({
          ...targetDoc,
          ...patch
        });
      }

      showToast(`✅ Đã cập nhật cài đặt giao bài thành công cho ${targetDocs.length} lớp! Hạn làm bài mới: ${formattedDueVN}`);
      setEditingConfigAssignment(null);
    } catch (err: any) {
      console.error('Lỗi lưu cài đặt bài tập:', err);
      showToast(`⚠️ Không thể lưu cài đặt: ${err?.message || String(err)}`);
    }
  };

  const executeAssignStandard = async (
    mode: 'create_or_update' | 'update_existing' | 'create_new_round',
    finalTitle: string,
    classesToAssign: string[]
  ) => {
    if (!assigningConfigAssignment) return;

    try {
      const rootId = assigningConfigAssignment.originalAssignmentId || assigningConfigAssignment.id.replace(/-class-.*$/, '');
      const startISO = toISOStringUTC(assignStartDate);
      const dueISO = toISOStringUTC(assignDueDate);
      const formattedDueVN = formatDateTimeVN(dueISO);

      if (mode === 'update_existing') {
        for (const cls of classesToAssign) {
          const existing = findExistingAssignmentForClass(assigningConfigAssignment, cls);
          if (existing && existing.id) {
            const patch: any = {
              title: finalTitle,
              startDate: startISO,
              assignedDate: startISO,
              dueDate: dueISO,
              maxAttempts: assignMaxAttempts,
              allowRepeat: assignMaxAttempts === 'Không giới hạn số lần luyện tập' || assignMaxAttempts !== '1 lần',
              shuffleQuestions: assignShuffleQuestions,
              shuffleOptions: assignShuffleOptions,
              enableRealtimeLeaderboard: assignRealtimeLeaderboard,
              updatedAt: new Date().toISOString()
            };
            if (db) {
              await trackedSetDoc(doc(db, 'assignments', existing.id), patch, { merge: true });
            }
            onSaveAssignment({
              ...existing,
              ...patch
            });
          } else {
            const singleClassId = `${rootId}-class-${cls.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            const classRoster = getStudentsFromLocalStorage(cls) || generateDefaultClassRoster(cls, 38);
            const newDoc: HomeworkAssignment = {
              ...assigningConfigAssignment,
              id: singleClassId,
              originalAssignmentId: rootId,
              title: finalTitle,
              targetClass: cls,
              targetClasses: [cls],
              startDate: startISO,
              assignedDate: startISO,
              dueDate: dueISO,
              maxAttempts: assignMaxAttempts,
              allowRepeat: assignMaxAttempts === 'Không giới hạn số lần luyện tập' || assignMaxAttempts !== '1 lần',
              shuffleQuestions: assignShuffleQuestions,
              shuffleOptions: assignShuffleOptions,
              enableRealtimeLeaderboard: assignRealtimeLeaderboard,
              totalStudents: classRoster.length || 38,
              completedCount: 0,
              submissions: []
            };
            if (db) {
              await trackedSetDoc(doc(db, 'assignments', singleClassId), newDoc);
            }
            onSaveAssignment(newDoc);
          }
        }
        showToast(`✅ Đã cập nhật bài giao cho (${classesToAssign.join(', ')})! Hạn làm bài mới: ${formattedDueVN}`);
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
        setAssigningConfigAssignment(null);
        setConflictAssignData(null);
        return;
      }

      let assignTitleResolved = finalTitle;
      let newRoundBaseId = rootId;
      if (mode === 'create_new_round') {
        const roundMatch = finalTitle.match(/\(Lượt (\d+)\)$/i);
        const nextRound = roundMatch ? parseInt(roundMatch[1], 10) + 1 : 2;
        assignTitleResolved = roundMatch ? finalTitle.replace(/\(Lượt \d+\)$/i, `(Lượt ${nextRound})`) : `${finalTitle} (Lượt 2)`;
        newRoundBaseId = `${rootId}-round-${Date.now()}`;
      }

      for (const cls of classesToAssign) {
        const singleClassId = `${newRoundBaseId}-class-${cls.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const classRoster = getStudentsFromLocalStorage(cls) || generateDefaultClassRoster(cls, 38);
        const newAssignmentDoc: HomeworkAssignment = {
          ...assigningConfigAssignment,
          id: singleClassId,
          originalAssignmentId: newRoundBaseId,
          title: assignTitleResolved,
          targetClass: cls,
          targetClasses: [cls],
          startDate: startISO,
          assignedDate: startISO,
          dueDate: dueISO,
          maxAttempts: assignMaxAttempts,
          allowRepeat: assignMaxAttempts === 'Không giới hạn số lần luyện tập' || assignMaxAttempts !== '1 lần',
          shuffleQuestions: assignShuffleQuestions,
          shuffleOptions: assignShuffleOptions,
          enableRealtimeLeaderboard: assignRealtimeLeaderboard,
          totalStudents: classRoster.length || 38,
          completedCount: 0,
          submissions: []
        };
        if (db) {
          await trackedSetDoc(doc(db, 'assignments', singleClassId), newAssignmentDoc);
        }
        onSaveAssignment(newAssignmentDoc);
      }

      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      showToast(`🚀 Đã giao bài tập thành công cho (${classesToAssign.join(', ')})! Hạn làm bài mới: ${formattedDueVN}`);
    } catch (err: any) {
      console.error('Lỗi khi giao bài tập:', err);
      showToast(`⚠️ Không thể lưu giao bài tập lên máy chủ: ${err?.message || String(err)}`);
    } finally {
      setAssigningConfigAssignment(null);
      setConflictAssignData(null);
    }
  };

  const handleConfirmAssignConfig = () => {
    if (!assigningConfigAssignment) return;

    if (selectedAssignClasses.length === 0) {
      showToast('⚠️ Vui lòng chọn ít nhất 1 lớp học để giao bài tập!');
      return;
    }

    const startCheck = validateStrictDateTimeInputVN(assignStartDate);
    if (!startCheck.valid) {
      showToast(`⚠️ Thời điểm bắt đầu không hợp lệ: ${startCheck.error}`);
      return;
    }

    const dueCheck = validateStrictDateTimeInputVN(assignDueDate);
    if (!dueCheck.valid) {
      showToast(`⚠️ Hạn làm bài không hợp lệ: ${dueCheck.error}`);
      return;
    }

    const rangeCheck = validateScheduleAndDeadline({
      openTime: assignStartDate,
      deadlineTime: assignDueDate
    });
    if (!rangeCheck.valid) {
      showToast(`⚠️ ${rangeCheck.error}`);
      return;
    }

    // Check conflict: classes that were already assigned this homework
    const conflicts: { className: string; submittedCount: number; totalCount: number; existingAssignment: HomeworkAssignment }[] = [];
    selectedAssignClasses.forEach(cls => {
      const existing = findExistingAssignmentForClass(assigningConfigAssignment, cls);
      if (existing) {
        const subs = Array.isArray(existing.submissions) ? existing.submissions.length : (existing.completedCount || 0);
        const total = existing.totalStudents || getClassStudentCount(cls) || 40;
        conflicts.push({
          className: cls,
          submittedCount: subs,
          totalCount: total,
          existingAssignment: existing
        });
      }
    });

    if (conflicts.length > 0) {
      setConflictAssignData({
        conflicts,
        newTitle: assignTitle.trim() || assigningConfigAssignment.title,
        selectedClasses: [...selectedAssignClasses],
        startDate: assignStartDate,
        dueDate: assignDueDate,
        maxAttempts: assignMaxAttempts,
        shuffleQuestions: assignShuffleQuestions,
        shuffleOptions: assignShuffleOptions,
        realtimeLeaderboard: assignRealtimeLeaderboard
      });
      return;
    }

    executeAssignStandard('create_or_update', assignTitle.trim() || assigningConfigAssignment.title, selectedAssignClasses);
  };

  // Local state for shared assignment IDs, persisted in localStorage
  const [sharedAssignmentIds, setSharedAssignmentIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('eduplay_shared_assignment_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('eduplay_shared_assignment_ids', JSON.stringify(sharedAssignmentIds));
    } catch {
      // ignore storage errors
    }
  }, [sharedAssignmentIds]);

  const isAssignmentShared = (as: HomeworkAssignment) => {
    return sharedAssignmentIds.includes(as.id) || (as as any).isShared === true;
  };

  const handleConfirmShare = (as: HomeworkAssignment) => {
    const updatedSharedIds = Array.from(new Set([...sharedAssignmentIds, as.id]));
    setSharedAssignmentIds(updatedSharedIds);
    try {
      localStorage.setItem('eduplay_shared_assignment_ids', JSON.stringify(updatedSharedIds));
    } catch (e) {
      console.error(e);
    }

    const updatedAssignment: HomeworkAssignment = {
      ...as,
      isShared: true
    } as HomeworkAssignment;

    onSaveAssignment(updatedAssignment);
    showToast('✅ Đã chia sẻ bài tập thành công vào kho Học liệu của đồng nghiệp!');
    setSharingAssignment(null);
  };

  const handleCopyAndAssign = (as: HomeworkAssignment) => {
    const copiedAssignment: HomeworkAssignment = {
      ...as,
      id: `as-copy-${Date.now()}`,
      title: `${as.title} (Bản sao giao cho lớp)`,
      targetClass: 'Lớp 3A',
      authorType: 'my',
      teacherId: activeTeacherProfile.id,
      teacherName: activeTeacherProfile.name,
      teacherEmail: activeTeacherProfile.email,
      createdBy: activeTeacherProfile.id,
      assignedDate: new Date().toLocaleDateString('vi-VN'),
      submissions: []
    };
    onSaveAssignment(copiedAssignment);
    showToast(`✅ Đã sao chép & giao bài tập "${as.title}" cho Lớp 3A thành công!`);
  };

  useEffect(() => {
    if (vinhDanhAssignment) {
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.5 },
        });
      } catch {
        // ignore if confetti fails
      }
    }
  }, [vinhDanhAssignment]);

  // Load tracking data for Bảng Vàng (reusing memory cache if already in detail modal, or IndexedDB, or 1-time read)
  useEffect(() => {
    if (!vinhDanhAssignment) {
      setVinhDanhTrackingResult(null);
      setVinhDanhError(null);
      return;
    }

    // 1. If detailAssignment is the same and trackingStudentsList already loaded in memory, use it directly (0 reads)
    if (detailAssignment?.id === vinhDanhAssignment.id && trackingStudentsList && trackingStudentsList.length > 0) {
      const memoryData: AssignmentTrackingResult = {
        assignmentId: vinhDanhAssignment.id,
        targetClass: vinhDanhAssignment.targetClass || 'Lớp 3C',
        totalStudents: trackingStudentsList.length,
        submittedCount: trackingStudentsList.filter(s => s.status === 'submitted').length,
        trackingList: trackingStudentsList as any,
        timestamp: Date.now()
      };
      setMemoryTrackingData(vinhDanhAssignment.id, memoryData);
      setVinhDanhTrackingResult(memoryData);
      setIsLoadingVinhDanh(false);
      return;
    }

    // 2. Fetch or load from cache (memory -> IndexedDB -> 1-time Firestore read)
    let isMounted = true;
    setIsLoadingVinhDanh(true);
    setVinhDanhError(null);

    getOrFetchAssignmentTrackingData(vinhDanhAssignment, false)
      .then((res) => {
        if (isMounted) {
          setVinhDanhTrackingResult(res);
          setIsLoadingVinhDanh(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[Bảng Vàng] Lỗi tải dữ liệu:', err);
          setVinhDanhError('Chưa tải được bảng vàng, thử lại');
          setIsLoadingVinhDanh(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [vinhDanhAssignment, detailAssignment?.id, trackingStudentsList]);

  const handleRefreshVinhDanh = useCallback(async () => {
    if (!vinhDanhAssignment?.id) return;
    setIsLoadingVinhDanh(true);
    setVinhDanhError(null);
    try {
      await clearIndexedDBTrackingData(vinhDanhAssignment.id);
      clearMemoryTrackingData(vinhDanhAssignment.id);
      const res = await getOrFetchAssignmentTrackingData(vinhDanhAssignment, true);
      setVinhDanhTrackingResult(res);
      showToast('✅ Đã làm mới dữ liệu Bảng Vàng thành công!');
    } catch (err: any) {
      console.error('[Bảng Vàng] Lỗi làm mới:', err);
      setVinhDanhError('Chưa tải được bảng vàng, thử lại');
    } finally {
      setIsLoadingVinhDanh(false);
    }
  }, [vinhDanhAssignment]);

  const vinhDanhRankedData = useMemo(() => {
    if (!vinhDanhTrackingResult?.trackingList) {
      return { top10: [] };
    }

    const list = vinhDanhTrackingResult.trackingList;
    const submitted = list.filter(st => st.status === 'submitted');

    // Sắp xếp học sinh đã nộp:
    // 1. Điểm giảm dần (numericScore DESC)
    // 2. Bằng điểm: thời điểm nộp sớm hơn (parseSubmissionTimestamp ASC)
    // 3. Không hiểu được định dạng thời điểm nộp -> xếp sau cùng khi bằng điểm
    submitted.sort((a, b) => {
      const scoreA = typeof a.numericScore === 'number' ? a.numericScore : (typeof a.totalScore === 'number' ? a.totalScore : (parseFloat(String(a.totalScore)) || 0));
      const scoreB = typeof b.numericScore === 'number' ? b.numericScore : (typeof b.totalScore === 'number' ? b.totalScore : (parseFloat(String(b.totalScore)) || 0));
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      const rawA = a.rawSubmission?.submittedAt || a.rawSubmission?.submittedTime || a.submittedTime;
      const rawB = b.rawSubmission?.submittedAt || b.rawSubmission?.submittedTime || b.submittedTime;
      const timeA = parseSubmissionTimestamp(rawA);
      const timeB = parseSubmissionTimestamp(rawB);
      return timeA - timeB;
    });

    // Lấy chính xác TOP 10
    const top10 = submitted.slice(0, 10);

    return {
      top10
    };
  }, [vinhDanhTrackingResult]);

  // Export Excel (.xlsx chuẩn)
  const handleExportExcel = () => {
    const title = detailAssignment?.title || 'Luyện tập: bài 1: Tự nhiên và công nghệ';
    const targetClass = detailAssignment?.targetClass || (selectedClass !== 'Tất cả các lớp' ? selectedClass : 'Lớp 3A');
    exportAssignmentResultsExcel(title, targetClass, trackingStudentsList.length > 0 ? trackingStudentsList : CLASS_3A_STUDENTS, detailAssignment?.questions?.length);
    showToast(`✅ Đã xuất danh sách kết quả ${targetClass} (.xlsx chuẩn) thành công!`);
  };



  // Synchronization state
  const [syncingAssignmentId, setSyncingAssignmentId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);

  const handleSyncAssignment = (as: HomeworkAssignment) => {
    setSyncingAssignmentId(as.id);
    try {
      const result = syncAssignmentQuestions(as);
      if (result.changed) {
        onSaveAssignment(result.updatedAssignment);
        if (detailAssignment && detailAssignment.id === as.id) {
          setDetailAssignment(result.updatedAssignment);
        }
        if (editingConfigAssignment && editingConfigAssignment.id === as.id) {
          setEditingConfigAssignment(result.updatedAssignment);
        }
        showToast(`✅ ${result.message}`);
      } else {
        showToast(`ℹ️ ${result.message}`);
      }
    } catch (err) {
      console.error('Lỗi khi đồng bộ câu hỏi:', err);
      showToast('❌ Đồng bộ câu hỏi thất bại!');
    } finally {
      setSyncingAssignmentId(null);
    }
  };

  const handleSyncAllAssignments = () => {
    setIsSyncingAll(true);
    try {
      let updatedCount = 0;
      assignments.forEach((as) => {
        const result = syncAssignmentQuestions(as);
        if (result.changed) {
          onSaveAssignment(result.updatedAssignment);
          updatedCount++;
        }
      });
      if (updatedCount > 0) {
        showToast(`✅ Đã đồng bộ câu hỏi mới nhất từ đề gốc/ngân hàng cho ${updatedCount} bài tập!`);
      } else {
        showToast('ℹ️ Toàn bộ bài tập đã ở phiên bản câu hỏi mới nhất!');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ Quá trình đồng bộ câu hỏi thất bại!');
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Action Menu Popup per row ID
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Modals
  const [isCreatingModalOpen, setIsCreatingModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<HomeworkAssignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<HomeworkAssignment | null>(null);

  const getFormattedDateTimeInput = (addDays: number = 7): string => {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Create/Edit Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('Công nghệ');
  const [formGrade, setFormGrade] = useState('Khối 3');
  const [formTargetClass, setFormTargetClass] = useState('Lớp 3A');
  const [formTeacherName, setFormTeacherName] = useState(() => effectiveTeacherName);
  const [formDueDate, setFormDueDate] = useState(() => getFormattedDateTimeInput(7));
  const [formDescription, setFormDescription] = useState('');
  const [formQuestions, setFormQuestions] = useState<QuestionItem[]>([]);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isBankAssignmentModalOpen, setIsBankAssignmentModalOpen] = useState(false);
  const [isBankSelectModalOpen, setIsBankSelectModalOpen] = useState(false);

  const handleAssignFromBank = (config: {
    title: string;
    subject: string;
    grade: string;
    classes: string[];
    dueDate: string;
    questionCount: number;
    selectedQuestions: QuestionItem[];
    maxAttempts: string;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
  }) => {
    const rootId = `hw-bank-${Date.now()}`;
    const rawClasses = config.classes && config.classes.length > 0 ? config.classes : [];
    if (rawClasses.length === 0) {
      showToast('⚠️ Vui lòng chọn ít nhất một lớp để giao bài!');
      return;
    }
    const classes = Array.from(new Set(rawClasses.map(c => c.trim()).filter(Boolean)));

    classes.forEach((cls, idx) => {
      const classRoster = getStudentsFromLocalStorage(cls) || generateDefaultClassRoster(cls, 38);
      const realTotal = classRoster && classRoster.length > 0 ? classRoster.length : (cls.includes('3C') ? 38 : 35);

      const newAssignment: HomeworkAssignment = {
        id: classes.length === 1 ? rootId : `${rootId}-class-${cls.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        title: config.title || `Bài tập rèn luyện môn ${config.subject} (${new Date().toLocaleDateString('vi-VN')})`,
        subject: config.subject,
        grade: config.grade,
        targetClass: cls,
        dueDate: config.dueDate || '2026-09-10T23:59',
        description: `Bài tập tự luyện từ Ngân hàng câu hỏi gồm ${config.selectedQuestions.length} câu hỏi chuẩn sư phạm.`,
        questions: config.selectedQuestions,
        teacherId: activeTeacherProfile.id,
        teacherName: activeTeacherProfile.name,
        teacherEmail: activeTeacherProfile.email,
        createdBy: activeTeacherProfile.id,
        authorType: 'my',
        assignedDate: new Date().toLocaleDateString('vi-VN'),
        totalStudents: realTotal,
        completedCount: 0,
        submissions: [],
        createdAt: new Date().toISOString()
      };
      onSaveAssignment(newAssignment);
    });

    showToast(
      classes.length > 1
        ? `✅ Đã giao bài tập thành công cho ${classes.length} lớp riêng biệt (${classes.join(', ')})!`
        : `✅ Đã giao bài tập "${config.title || 'từ Ngân hàng'}" thành công!`
    );
    setIsBankAssignmentModalOpen(false);
  };

  const handleSelectQuestionsForForm = (selected: QuestionItem[]) => {
    setFormQuestions(prev => [...prev, ...selected]);
    showToast(`✅ Đã thêm ${selected.length} câu hỏi từ Ngân hàng vào danh sách!`);
    setIsBankSelectModalOpen(false);
  };

  // Student Solver Modal
  const [solvingAssignment, setSolvingAssignment] = useState<HomeworkAssignment | null>(null);
  const [studentContent, setStudentContent] = useState('');

  // AI Grading State
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);


  // Chuẩn hóa danh sách bài tập: Mỗi dòng đại diện cho 1 lớp duy nhất (Mô hình 1 bài - N lần giao)
  const normalizedAssignments = useMemo(() => {
    const list: HomeworkAssignment[] = [];
    (assignments || []).forEach(as => {
      const itemType = ((as as any).type || (as as any).category || (as as any).contentType || '').toLowerCase();
      // Loại trừ các bài giảng E-Learning để hiển thị đúng khu vực Bài giảng E-Learning độc lập
      if (itemType === 'elearning' || itemType === 'bai_giang' || itemType === 'lesson_5e' || (as.id && as.id.startsWith('elearn-'))) {
        return;
      }
      if (as.targetClass && as.targetClass.includes(',')) {
        const classes = as.targetClass.split(',').map(c => c.trim()).filter(Boolean);
        if (classes.length > 0) {
          classes.forEach((cls, idx) => {
            const rootId = as.originalAssignmentId || as.id.replace(/-class-.*$/, '');
            list.push({
              ...as,
              id: idx === 0 ? as.id : `${rootId}-class-${cls.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
              targetClass: cls,
              originalAssignmentId: rootId,
            });
          });
        } else {
          list.push(as);
        }
      } else {
        list.push(as);
      }
    });

    // Deduplication pass
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const cleanList: HomeworkAssignment[] = [];

    list.forEach(item => {
      if (!item || !item.id || seenIds.has(item.id)) return;
      const key = `${(item.title || '').trim().toLowerCase()}::${(item.targetClass || '').trim().toLowerCase()}::${(item.dueDate || '').trim()}`;
      if (seenKeys.has(key)) return;
      seenIds.add(item.id);
      seenKeys.add(key);
      cleanList.push(item);
    });

    return cleanList;
  }, [assignments]);

  const accessibleAssignmentsAll = useMemo(() => {
    return filterAccessibleItems(normalizedAssignments, 'all', accessContext);
  }, [normalizedAssignments, accessContext]);

  // Tab counts calculation
  const allCount = accessibleAssignmentsAll.length;
  const myCount = filterAccessibleItems(normalizedAssignments, 'my', accessContext).length;
  const colleagueCount = filterAccessibleItems(normalizedAssignments, 'colleague', accessContext).length;

  // Filter & Sort Logic (Sắp xếp theo NGÀY GIAO thực tế giảm dần/tăng dần TRƯỚC khi phân trang)
  const filteredAssignments = useMemo(() => {
    const tabItems = filterAccessibleItems(normalizedAssignments, activeTab, accessContext);
    const list = tabItems.filter((as) => {

      // Grade filter
      if (selectedGrade !== 'Tất cả các khối') {
        if (as.grade && !isGradeMatching(as.grade, selectedGrade)) return false;
      }

      // Subject filter
      if (selectedSubject !== 'Tất cả các môn') {
        if (as.subject.toLowerCase() !== selectedSubject.toLowerCase()) return false;
      }

      // Class filter (chuẩn xác 1 lớp duy nhất)
      if (selectedClass !== 'Tất cả các lớp') {
        if (as.targetClass !== selectedClass) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = as.title.toLowerCase().includes(q);
        const matchTeacher = (as.teacherName || '').toLowerCase().includes(q);
        const matchSubject = as.subject.toLowerCase().includes(q);
        if (!matchTitle && !matchTeacher && !matchSubject) return false;
      }

      return true;
    });

    // Sắp xếp theo NGÀY GIAO thực tế (Date/Timestamp/ms) giảm dần (mặc định) hoặc tăng dần
    return [...list].sort((a, b) => {
      const timeA = parseAssignedDateToTime(a.assignedDate || a.startDate, a.createdAt);
      const timeB = parseAssignedDateToTime(b.assignedDate || b.startDate, b.createdAt);

      if (timeA !== timeB) {
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      }

      // Nếu trùng thời điểm giao, so sánh tiếp theo thời gian tạo (createdAt) mới nhất lên trên
      const createdA = parseAssignedDateToTime(a.createdAt);
      const createdB = parseAssignedDateToTime(b.createdAt);
      if (createdA !== createdB) {
        return sortOrder === 'desc' ? createdB - createdA : createdA - createdB;
      }

      return (a.id || '').localeCompare(b.id || '');
    });
  }, [
    normalizedAssignments,
    activeTab,
    selectedGrade,
    selectedSubject,
    selectedClass,
    searchQuery,
    sortOrder
  ]);

  // Pagination calculation
  const totalItems = filteredAssignments.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedAssignments = filteredAssignments.slice(startIndex, startIndex + itemsPerPage);

  // Create Assignment handler
  const handleSaveForm = () => {
    if (!formTitle.trim()) {
      showToast('Vui lòng nhập tiêu đề bài tập!');
      return;
    }

    const sanitizedQuestions = (formQuestions || []).map(q => sanitizeQuestionForFirestore(q));

    const classRoster = getStudentsFromLocalStorage(formTargetClass) || generateDefaultClassRoster(formTargetClass, 38);
    const realTotal = classRoster && classRoster.length > 0 ? classRoster.length : (formTargetClass.includes('3C') ? 38 : (editingAssignment?.totalStudents || 38));

    const assignmentToSave: HomeworkAssignment = {
      id: editingAssignment ? editingAssignment.id : `as-${Date.now()}`,
      title: formTitle,
      subject: formSubject,
      grade: formGrade,
      targetClass: formTargetClass,
      teacherId: editingAssignment?.teacherId || activeTeacherProfile.id,
      teacherName: editingAssignment?.teacherName || formTeacherName || activeTeacherProfile.name,
      teacherEmail: activeTeacherProfile.email,
      createdBy: editingAssignment?.createdBy || activeTeacherProfile.id,
      assignedDate: editingAssignment?.assignedDate || '18/8/2026',
      dueDate: formDueDate,
      description: formDescription,
      totalStudents: realTotal,
      completedCount: editingAssignment?.completedCount || 0,
      isApproved: true,
      authorType: 'my',
      createdAt: new Date().toLocaleDateString('vi-VN'),
      questions: sanitizedQuestions,
      submissions: editingAssignment ? editingAssignment.submissions : []
    };

    onSaveAssignment(assignmentToSave);
    setIsCreatingModalOpen(false);
    setEditingAssignment(null);
    resetForm();
    showToast(editingAssignment ? 'Cập nhật bài tập thành công!' : 'Tạo bài tập mới từ ngân hàng câu hỏi thành công!');
  };

  const resetForm = () => {
    setFormTitle('');
    setFormSubject('Công nghệ');
    setFormGrade('Khối 3');
    setFormTargetClass('Lớp 3A');
    setFormTeacherName(effectiveTeacherName);
    setFormDueDate('2026-09-10T23:59');
    setFormDescription('');
    setFormQuestions([]);
  };

  const handleOpenEdit = (as: HomeworkAssignment) => {
    const perms = getContentPermissions(as, accessContext);
    if (!perms.canEdit) {
      showToast('⚠️ Bạn không có quyền chỉnh sửa nội dung này!');
      setOpenActionMenuId(null);
      return;
    }
    setEditingAssignment(as);
    setFormTitle(as.title);
    setFormSubject(as.subject);
    setFormGrade(as.grade || 'Khối 3');
    setFormTargetClass(as.targetClass);
    setFormTeacherName(as.teacherName || effectiveTeacherName);
    setFormDueDate(as.dueDate);
    setFormDescription(as.description);
    setFormQuestions(as.questions || []);
    setIsCreatingModalOpen(true);
    setOpenActionMenuId(null);
  };

  const handleDeleteAssignment = (id: string) => {
    const target = assignments.find(a => a.id === id);
    if (target && !getContentPermissions(target, accessContext).canDelete) {
      showToast('⚠️ Bạn không có quyền xóa nội dung này!');
      setOpenActionMenuId(null);
      return;
    }
    if (target) {
      setDeletingAssignment(target);
      setOpenActionMenuId(null);
    }
  };

  const handleShareLink = (as: HomeworkAssignment) => {
    const url = `${window.location.origin}/assignment/${as.id}`;
    navigator.clipboard?.writeText(url);
    showToast(`Đã sao chép liên kết bài tập: "${as.title}"`);
    setOpenActionMenuId(null);
  };

  // Student submission handler
  const handleStudentSubmit = async () => {
    if (!solvingAssignment || !studentContent.trim() || !currentUserId) return;

    const newSubmission: AssignmentSubmission = {
      id: `sub-${Date.now()}`,
      studentId: currentUserId,
      studentName: currentUserName || 'Học sinh',
      submittedAt: new Date().toLocaleString('vi-VN'),
      content: studentContent,
      status: 'pending'
    };

    const updated: HomeworkAssignment = {
      ...solvingAssignment,
      completedCount: (solvingAssignment.completedCount || 0) + 1,
      submissions: [newSubmission, ...solvingAssignment.submissions]
    };

    try {
      // Lưu trực tiếp vào Firestore
      await studentResultService.saveFullAssignmentSubmission(currentUserId, solvingAssignment.id, newSubmission);
      
      onSaveAssignment(updated);
      setSolvingAssignment(null);
      setStudentContent('');
      showToast('Nộp bài tập thành công! Giáo viên và Gemini AI sẽ chấm bài sớm.');
    } catch (err) {
      console.error('Lỗi khi nộp bài tập:', err);
      showToast('Nộp bài thất bại, vui lòng thử lại!');
    }
  };

  // AI Grading
  const handleAiGrade = async (sub: AssignmentSubmission) => {
    if (!detailAssignment) return;
    setGradingSubId(sub.id);

    const refAnswer = detailAssignment.description || (detailAssignment.questions && detailAssignment.questions[0]?.correctAnswer) || '';
    const aiResult = await gradeSubmissionAI(detailAssignment.title, sub.content, refAnswer, 10);

    const isWaitingTeacher = aiResult.ketQua === 'cho_giao_vien_cham' || aiResult.score === null;

    const updatedSubmissions = detailAssignment.submissions.map((item) =>
      item.id === sub.id
        ? {
            ...item,
            score: isWaitingTeacher ? (item.score || 0) : aiResult.score,
            feedback: aiResult.feedback,
            status: isWaitingTeacher ? ('submitted' as const) : ('graded' as const),
            needsTeacherReview: aiResult.needsTeacherReview,
            canhBao: aiResult.canhBao
          }
        : item
    );

    const updated: HomeworkAssignment = {
      ...detailAssignment,
      submissions: updatedSubmissions
    };

    onSaveAssignment(updated);
    setDetailAssignment(updated);
    setGradingSubId(null);
    if (isWaitingTeacher) {
      showToast(`Bài làm của ${sub.studentName} đã được đánh dấu: Chờ giáo viên chấm.`);
    } else {
      showToast(`Đã dùng Gemini AI chấm bài cho ${sub.studentName} (${aiResult.score}/10đ)${aiResult.needsTeacherReview ? ' - ⚠️ Giáo viên nên xem lại' : ''}!`);
    }
  };

  return (
    <div className="space-y-6 text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================== */}
      {/* 1. KHỐI THỐNG KÊ & ĐIỀU KHIỂN TRÊN CÙNG    */}
      {/* ========================================== */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
        {/* Header Title & Perspective Toggle */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 font-heading flex items-center gap-2">
              <span>📝 Quản lý bài tập (Homework Mode)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Quản lý, theo dõi tiến độ và giao phiếu học liệu rèn luyện cho các lớp học sinh.
            </p>
          </div>

          {/* Perspective View Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setActiveRoleView('student')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeRoleView === 'student'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" /> Góc nhìn Học sinh
            </button>
            <button
              onClick={() => setActiveRoleView('teacher')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeRoleView === 'teacher'
                  ? 'bg-indigo-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Góc nhìn Giáo viên
            </button>
          </div>
        </div>

        {/* 3 Stats Cards */}
        {activeRoleView === 'teacher' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              variant="blue"
              title="Tổng số phiếu rèn luyện đã giao"
              value={`${normalizedAssignments.length} Bài tập về nhà`}
              subtext="Đầy đủ các lớp học sinh"
              icon={ClipboardList}
            />

            <StatCard
              variant="green"
              title="Tỷ lệ hoàn thành trung bình lớp 3A"
              value="81.5% hoàn thành"
              subtext="Đạt chuẩn xuất sắc"
              icon={CheckCircle2}
            />

            <StatCard
              variant="purple"
              title="Tính năng kiểm soát ôn tập"
              icon={RotateCcw}
            >
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-950 hover:text-purple-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={allowRepeat}
                    onChange={(e) => setAllowRepeat(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-300 cursor-pointer"
                  />
                  <span>Cho phép học sinh làm lại nhiều lần</span>
                </label>
              </div>
            </StatCard>
          </div>
        )}
      </div>

      {activeRoleView === 'student' ? (
        <StudentAssignmentModule
          assignments={assignments}
          onSaveAssignment={onSaveAssignment}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isPreviewMode={true}
          onExitPreview={() => setActiveRoleView('teacher')}
        />
      ) : (
        <>
          {/* ========================================== */}
          {/* 2. BẢNG QUẢN LÝ HỌC LIỆU & BỘ LỌC CHUYÊN SÂU */}
          {/* ========================================== */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
        {/* Section Header & Highlight Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h3 className="text-base font-extrabold text-slate-900 font-heading flex items-center gap-2">
            <span>📁 Quản lý Học liệu & Theo dõi Bài tập đã giao</span>
          </h3>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={async () => {
                const items = await scanMisfiledAssignmentSubmissions(assignments);
                setMisfiledItems(items);
                setSelectedMisfiledIds(new Set(items.map(i => i.id)));
                setMigrationReport(null);
                setIsMisfiledScanModalOpen(true);
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-all"
              title="Quét và khôi phục bài tập bị lưu nhầm vào đề kiểm tra"
            >
              <RotateCcw className="w-4 h-4" />
              <span>🛠️ Quét & Khôi phục bài tập lưu nhầm</span>
            </button>
            {isDebugMode && (
              <button
                onClick={() => setIsScanDuplicatesModalOpen(true)}
                className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Quét các bài tập giao trùng lặp và xem trước phương án gộp"
              >
                <Search className="w-4 h-4" />
                <span>Quét bài giao trùng (Debug)</span>
              </button>
            )}
            <button
              onClick={handleSyncAllAssignments}
              disabled={isSyncingAll}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-all disabled:opacity-50"
              title="Đồng bộ lại câu hỏi mới nhất từ đề gốc hoặc ngân hàng cho tất cả bài tập đã giao"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'Đang đồng bộ...' : 'Đồng bộ câu hỏi từ đề gốc'}</span>
            </button>
            <button
              onClick={() => setIsBankAssignmentModalOpen(true)}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-all"
            >
              <Database className="w-4 h-4" />
              <span>Chọn từ Ngân hàng câu hỏi</span>
            </button>
          </div>
        </div>

        {/* UseQuestionBankModal for AssignmentModule */}
        <UseQuestionBankModal
          isOpen={isBankAssignmentModalOpen}
          onClose={() => setIsBankAssignmentModalOpen(false)}
          questions={effectiveQuestionsBank}
          targetContext="assignment"
          initialSubject={selectedSubject !== 'Tất cả các môn' ? selectedSubject : 'Công nghệ'}
          initialGrade={selectedGrade !== 'Tất cả các khối' ? selectedGrade : 'Khối 3'}
          onAssignHomework={handleAssignFromBank}
        />

        {/* 3 Category Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => {
              setActiveTab('all');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" /> Tất cả bài tập ({allCount})
          </button>

          <button
            onClick={() => {
              setActiveTab('my');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'my'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" /> Bài tập của tôi ({myCount})
          </button>

          <button
            onClick={() => {
              setActiveTab('colleague');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'colleague'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Học liệu của đồng nghiệp ({colleagueCount})
          </button>
        </div>

        {/* 3 Dropdown Filters with Rounded Design & Icons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
          {/* Filter 1: Khối */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Layers className="w-4 h-4" />
            </div>
            <select
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setSelectedClass('Tất cả các lớp');
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-8 py-2.5 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
            >
              <option value="Tất cả các khối">Tất cả các khối</option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Filter 2: Môn */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-8 py-2.5 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
            >
              <option value="Tất cả các môn">Tất cả các môn</option>
              {SUBJECTS.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Filter 3: Lớp */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <GraduationCap className="w-4 h-4" />
            </div>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-8 py-2.5 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
            >
              <option value="Tất cả các lớp">Tất cả các lớp</option>
              {(selectedGrade === 'Tất cả các khối' ? ALL_CLASSES : CLASSES_BY_GRADE[selectedGrade] || []).map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm theo tên bài giao..."
              className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* ========================================== */}
        {/* 3. BẢNG DANH SÁCH BÀI TẬP (TABLE LISTING)  */}
        {/* ========================================== */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">TIÊU ĐỀ BÀI GIAO</th>
                <th className="py-3.5 px-4 whitespace-nowrap">GIÁO VIÊN GIAO</th>
                <th className="py-3.5 px-4 whitespace-nowrap">LỚP</th>
                <th 
                  onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  className="py-3.5 px-4 whitespace-nowrap cursor-pointer select-none hover:text-indigo-900 transition-colors group/sort"
                  title="Bấm để đổi chiều sắp xếp theo Ngày giao (Mặc định: Giảm dần - Mới nhất lên đầu)"
                >
                  <div className="flex items-center gap-1.5">
                    <span>NGÀY GIAO</span>
                    {sortOrder === 'desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 font-bold" />
                    ) : (
                      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 font-bold" />
                    )}
                  </div>
                </th>
                <th className="py-3.5 px-4 whitespace-nowrap">ĐÃ LÀM</th>
                <th className="py-3.5 px-4 text-center whitespace-nowrap">THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedAssignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 font-medium">
                    Không tìm thấy bài tập nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                paginatedAssignments.map((as) => {
                  const classRoster = getStudentsFromLocalStorage(as.targetClass || '');
                  const total = (classRoster && classRoster.length > 0) ? classRoster.length : (as.targetClass?.includes('3C') ? 38 : (as.totalStudents || 38));
                  const completed = getAssignmentSubmissionCount(as);
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                  const perms = getContentPermissions(as, accessContext);
                  const isShared = isAssignmentShared(as) || (perms.isShared && !perms.isOwner);
                  const subjColor = getSubjectColorStyles(as.subject);

                  return (
                    <tr
                      key={as.id}
                      onClick={() => {
                        if (!perms.canView) {
                          showToast('Bạn không có quyền xem nội dung này');
                          return;
                        }
                        if (!isAdmin && as.targetClass && !canTeacherAccessClass(as.targetClass, accessContext) && !perms.isOwner) {
                          showToast(`Bạn chỉ được xem bài nộp của các lớp mình phụ trách (không có quyền truy cập ${as.targetClass}).`);
                          return;
                        }
                        setDetailAssignment(as);
                      }}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Tiêu đề bài giao */}
                      <td className="py-4 px-4 max-w-md">
                        <div className="space-y-1.5">
                          <div className="font-medium text-slate-900 text-base leading-snug group-hover:text-indigo-900 transition-colors">
                            {as.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Badge Môn - Dynamic Subject Color */}
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase ${subjColor.badgeClass}`}>
                              {as.subject || subjColor.name.toUpperCase()}
                            </span>
                            {/* Badge Khối */}
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium uppercase bg-amber-100 text-amber-800 border border-amber-200">
                              {as.grade || 'KHỐI 3'}
                            </span>
                            {/* Badge Đã duyệt */}
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 text-emerald-600" /> Đã duyệt nội dung
                            </span>
                            {/* Badge Chia sẻ bởi */}
                            {perms.isShared && !perms.isOwner && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1">
                                <Share2 className="w-3.5 h-3.5 text-purple-600" /> Chia sẻ bởi {perms.ownerName}
                              </span>
                            )}
                            {/* Badge Đã chia sẻ */}
                            {isShared && perms.isOwner && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5 text-emerald-600" /> ĐÃ CHIA SẺ VÀO TỔ CHUYÊN MÔN
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Giáo viên giao */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">
                              👩‍🏫
                            </div>
                            <div>
                              <span className="font-bold text-slate-800 text-xs block">
                                {as.teacherName || perms.ownerName || activeTeacherProfile.name}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium block">
                                Tổ {as.grade || 'Khối 3'} • Môn {as.subject || 'Công nghệ'}
                              </span>
                            </div>
                          </div>
                          {(activeTab === 'colleague' || isShared) && (
                            <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1 w-fit">
                              Chia sẻ bởi {perms.ownerName}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Lớp */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-500 text-emerald-700 bg-emerald-50/60">
                          {as.targetClass || 'Lớp 3A'}
                        </span>
                      </td>

                      {/* Ngày giao */}
                      <td className="py-4 px-4 whitespace-nowrap text-slate-700 font-semibold font-mono text-xs">
                        {formatAssignedDateDisplay(as.assignedDate || as.startDate, as.createdAt)}
                      </td>

                      {/* Đã làm */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">
                            {completed}/{total}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            {percent}%
                          </span>
                        </div>
                      </td>

                      {/* Thao tác */}
                      <td className="py-4 px-4 text-center whitespace-nowrap relative" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {/* Quick action button for colleague/shared assignment - when canAssign */}
                          {(activeTab === 'colleague' || isShared) && activeRoleView === 'teacher' && perms.canAssign && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyAndAssign(as);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                              title="Sao chép bài tập này và giao cho lớp của bạn"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Sao chép & Giao cho lớp tôi</span>
                            </button>
                          )}

                          {/* 3 dots Menu Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuId(openActionMenuId === as.id ? null : as.id);
                            }}
                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-indigo-600 transition-all cursor-pointer border border-transparent hover:border-slate-200"
                            title="Tùy chọn thao tác"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Popup Menu */}
                          {openActionMenuId === as.id && (
                            <div className="absolute right-4 top-12 z-30 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-left text-xs animate-fade-in divide-y divide-slate-100">
                              <div className="py-1">
                                {perms.canEdit && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditConfig(as);
                                        setOpenActionMenuId(null);
                                      }}
                                      className="w-full px-3.5 py-2 text-left hover:bg-indigo-50 flex items-center gap-2.5 font-bold text-indigo-900 cursor-pointer"
                                      title="Chỉnh sửa hạn nộp, lịch giao, tráo đề hoặc bật/tắt thi đấu trực tiếp"
                                    >
                                      <Settings className="w-4 h-4 text-indigo-600" /> ⚙️ Sửa cài đặt giao bài
                                    </button>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSyncAssignment(as);
                                        setOpenActionMenuId(null);
                                      }}
                                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 flex items-center gap-2.5 font-bold text-emerald-800 cursor-pointer"
                                      title="Cập nhật các thay đổi thêm/xóa/sửa câu hỏi từ bộ đề gốc hoặc ngân hàng câu hỏi"
                                    >
                                      <RefreshCw className={`w-4 h-4 text-emerald-600 ${syncingAssignmentId === as.id ? 'animate-spin' : ''}`} />
                                      <span>🔄 Cập nhật lại danh sách câu hỏi</span>
                                    </button>
                                  </>
                                )}

                                {perms.canAssign && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenAssignConfig(as);
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-left hover:bg-indigo-50 flex items-center gap-2.5 font-bold text-indigo-700 cursor-pointer"
                                  >
                                    <Send className="w-4 h-4 text-indigo-600" /> 🚀 Giao Bài Tập
                                  </button>
                                )}

                                {perms.canView && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isAdmin && as.targetClass && !canTeacherAccessClass(as.targetClass, accessContext) && !perms.isOwner) {
                                        showToast(`Bạn chỉ được xem bài nộp của các lớp mình phụ trách (không có quyền truy cập ${as.targetClass}).`);
                                        setOpenActionMenuId(null);
                                        return;
                                      }
                                      setDetailAssignment(as);
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-semibold text-slate-700 cursor-pointer"
                                  >
                                    <Eye className="w-4 h-4 text-indigo-600" /> Xem chi tiết
                                  </button>
                                )}

                                {perms.canShare && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSharingAssignment(as);
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-left hover:bg-sky-50 flex items-center gap-2.5 font-semibold text-sky-800 cursor-pointer"
                                  >
                                    <Users className="w-4 h-4 text-sky-600" /> Chia sẻ bài tập
                                  </button>
                                )}

                                {perms.canView && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVinhDanhAssignment(as);
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-left hover:bg-amber-50 flex items-center gap-2.5 font-bold text-amber-800 cursor-pointer"
                                  >
                                    <Trophy className="w-4 h-4 text-amber-500" /> Thống kê vinh danh
                                  </button>
                                )}

                                {perms.canEdit && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEdit(as);
                                    }}
                                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-semibold text-slate-700 cursor-pointer"
                                  >
                                    <Edit3 className="w-4 h-4 text-amber-600" /> Sửa bài tập
                                  </button>
                                )}
                              </div>

                              {perms.canDelete && (
                                <div className="py-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingAssignment(as);
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-left hover:bg-red-50 flex items-center gap-2.5 font-semibold text-red-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" /> Xóa bài tập
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ========================================== */}
        {/* 4. PHÂN TRANG & THÔNG TIN DƯỚI CÙNG (PAGINATION) */}
        {/* ========================================== */}
        <PaginationControl
          currentPage={currentPage}
          pageSize={itemsPerPage}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          onPageSizeChange={setItemsPerPage}
          pageSizeOptions={[10, 20, 50]}
          itemLabel="bài"
        />
      </div>
    </>
  )}

      {/* ========================================== */}
      {/* MODAL 1: CREATE / EDIT ASSIGNMENT          */}
      {/* ========================================== */}
      {isCreatingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 animate-scale-up max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900 font-heading flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span>
                  {editingAssignment
                    ? 'Cập Nhật Bài Tập Về Nhà & Danh Sách Câu Hỏi'
                    : 'Tạo Bài Tập Từ Ngân Hàng Câu Hỏi'}
                </span>
              </h3>
              <button
                onClick={() => setIsCreatingModalOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tiêu đề bài tập */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                Tiêu Đề Bài Tập Về Nhà:
              </label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Nhập tiêu đề phiếu bài giao..."
                className="w-full p-3 text-sm rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>

            {/* Mô tả chi tiết */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                Nội Dung & Yêu Cầu Học Liệu:
              </label>
              <textarea
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Mô tả nội dung bài tập, yêu cầu rèn luyện cho học sinh..."
                className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            {/* Questions Section with Full Cards & Editing */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <span>DANH SÁCH CÂU HỎI BÀI TẬP</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black">
                      {formQuestions.length} câu
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500">Chỉnh sửa nội dung, đáp án, điểm số hoặc thêm/xóa câu hỏi trực tiếp dưới đây.</p>
                </div>
                
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsBankSelectModalOpen(true)}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Database className="w-4 h-4" />
                    <span>Chọn từ Ngân hàng</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(true)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm câu hỏi mới</span>
                  </button>
                </div>
              </div>

              {/* Danh sách thẻ chi tiết câu hỏi */}
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {formQuestions.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                    <p className="text-sm font-bold text-slate-600">Chưa có câu hỏi nào trong bài tập này</p>
                    <p className="text-xs text-slate-400">Bấm "Chọn từ Ngân hàng" hoặc "Thêm câu hỏi mới" để xây dựng bộ câu hỏi.</p>
                  </div>
                ) : (
                  formQuestions.map((q, idx) => (
                    <div key={q.id || idx} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3 relative group">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <select
                            value={normalizeQuestionType(q.type)}
                            onChange={(e) => {
                              const newType = e.target.value;
                              const normType = normalizeQuestionType(newType);
                              const defaultSchema = getDefaultAnswerSchemaByType(normType);
                              const updated = [...formQuestions];
                              const currentQ = formQuestions[idx];

                              const cleanQ: any = {
                                ...currentQ,
                                type: normType,
                                content: currentQ.content || '',
                                explanation: currentQ.explanation || ''
                              };

                              delete cleanQ.options;
                              delete cleanQ.correctAnswer;
                              delete cleanQ.statements;
                              delete cleanQ.matchingPairs;
                              delete cleanQ.classificationGroups;
                              delete cleanQ.classificationItems;

                              if (defaultSchema.options) cleanQ.options = defaultSchema.options;
                              if (defaultSchema.correctAnswer !== undefined) cleanQ.correctAnswer = defaultSchema.correctAnswer;
                              if (defaultSchema.statements) cleanQ.statements = defaultSchema.statements;
                              if (defaultSchema.matchingPairs) cleanQ.matchingPairs = defaultSchema.matchingPairs;
                              if (defaultSchema.classificationGroups) cleanQ.classificationGroups = defaultSchema.classificationGroups;
                              if (defaultSchema.classificationItems) cleanQ.classificationItems = defaultSchema.classificationItems;

                              updated[idx] = cleanQ;
                              setFormQuestions(updated);
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white text-indigo-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          >
                            {QUESTION_TYPES.map(qt => (
                              <option key={qt.id} value={qt.id}>{qt.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                            <span className="font-semibold text-slate-500">Điểm:</span>
                            <input
                              type="number"
                              step="0.5"
                              value={(q as any).score || 2}
                              onChange={(e) => {
                                const updated = [...formQuestions];
                                updated[idx] = { ...q, score: Number(e.target.value) } as any;
                                setFormQuestions(updated);
                              }}
                              className="w-12 text-center font-black text-indigo-600 focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormQuestions(formQuestions.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer transition-colors"
                            title="Xóa câu hỏi này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Nội dung câu hỏi */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nội dung câu hỏi {idx + 1}:</label>
                        <textarea
                          rows={2}
                          value={q.content}
                          onChange={(e) => {
                            const updated = [...formQuestions];
                            updated[idx] = { ...q, content: e.target.value };
                            setFormQuestions(updated);
                          }}
                          placeholder="Nhập nội dung câu hỏi..."
                          className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                        />
                      </div>

                      {/* Render giao diện nhập đáp án theo switch-case normalizeQuestionType */}
                      {(() => {
                        const currentNormType = normalizeQuestionType(q.type);
                        switch (currentNormType) {
                          case 'multiple_choice':
                            return (
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] font-bold text-slate-500 uppercase">
                                    Các phương án trả lời (nhập nội dung & bấm chữ cái để chọn 1 đáp án đúng):
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...formQuestions];
                                      const newOpts = [...(q.options || ['A.', 'B.', 'C.', 'D.']), ''];
                                      updated[idx] = { ...q, options: newOpts };
                                      setFormQuestions(updated);
                                    }}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Thêm phương án
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(q.options && q.options.length > 0 ? q.options : ['', '', '', '']).map((opt, oIdx) => {
                                    const letter = ['A', 'B', 'C', 'D', 'E', 'F'][oIdx] || String.fromCharCode(65 + oIdx);
                                    const isSelected = (q.correctAnswer || 'A').toUpperCase() === letter;

                                    return (
                                      <div key={oIdx} className={`flex items-center gap-2 p-2 rounded-xl border bg-white ${isSelected ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200'}`}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...formQuestions];
                                            updated[idx] = { ...q, correctAnswer: letter };
                                            setFormQuestions(updated);
                                          }}
                                          className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 cursor-pointer transition-all ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                          title="Đánh dấu đây là đáp án đúng"
                                        >
                                          {letter}
                                        </button>
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const newOpts = [...(q.options || ['', '', '', ''])];
                                            newOpts[oIdx] = e.target.value;
                                            updated[idx] = { ...q, options: newOpts };
                                            setFormQuestions(updated);
                                          }}
                                          placeholder={`Đáp án ${letter}...`}
                                          className="w-full text-xs font-medium focus:outline-none bg-transparent"
                                        />
                                        {(q.options && q.options.length > 2) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const newOpts = (q.options || []).filter((_, i) => i !== oIdx);
                                              updated[idx] = { ...q, options: newOpts };
                                              setFormQuestions(updated);
                                            }}
                                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                            title="Xóa phương án này"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );

                          case 'multiple_response':
                            return (
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] font-bold text-fuchsia-700 uppercase">
                                    Chọn nhiều đáp án đúng (tick chọn các đáp án chính xác):
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...formQuestions];
                                      const newOpts = [...(q.options || ['', '', '', '']), ''];
                                      updated[idx] = { ...q, options: newOpts };
                                      setFormQuestions(updated);
                                    }}
                                    className="text-[11px] font-bold text-fuchsia-600 hover:text-fuchsia-800 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Thêm phương án
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(q.options && q.options.length > 0 ? q.options : ['', '', '', '']).map((opt, oIdx) => {
                                    const letter = ['A', 'B', 'C', 'D', 'E', 'F'][oIdx] || String.fromCharCode(65 + oIdx);
                                    const correctArr = String(q.correctAnswer || '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
                                    const isSelected = correctArr.includes(letter);

                                    return (
                                      <div key={oIdx} className={`flex items-center gap-2 p-2 rounded-xl border bg-white ${isSelected ? 'border-fuchsia-500 bg-fuchsia-50/50' : 'border-slate-200'}`}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const currentCorrect = String(q.correctAnswer || '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
                                            const nextCorrect = e.target.checked ? [...currentCorrect, letter] : currentCorrect.filter(x => x !== letter);
                                            updated[idx] = { ...q, correctAnswer: nextCorrect.sort().join(',') };
                                            setFormQuestions(updated);
                                          }}
                                          className="w-4 h-4 text-fuchsia-600 rounded focus:ring-fuchsia-500 cursor-pointer"
                                          title="Đánh dấu là đáp án đúng"
                                        />
                                        <span className={`w-5 h-5 rounded-md text-[11px] font-black flex items-center justify-center shrink-0 ${isSelected ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                          {letter}
                                        </span>
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const newOpts = [...(q.options || ['', '', '', ''])];
                                            newOpts[oIdx] = e.target.value;
                                            updated[idx] = { ...q, options: newOpts };
                                            setFormQuestions(updated);
                                          }}
                                          placeholder={`Đáp án ${letter}...`}
                                          className="w-full text-xs font-medium focus:outline-none bg-transparent"
                                        />
                                        {(q.options && q.options.length > 2) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const newOpts = (q.options || []).filter((_, i) => i !== oIdx);
                                              updated[idx] = { ...q, options: newOpts };
                                              setFormQuestions(updated);
                                            }}
                                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                            title="Xóa phương án này"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );

                          case 'true_false':
                            return (
                              <div className="space-y-2.5 pt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Danh sách các nhận định Đúng / Sai:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...formQuestions];
                                      const statements = [...(q.statements || []), { statement: '', isCorrect: true }];
                                      updated[idx] = { ...q, statements };
                                      setFormQuestions(updated);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Thêm nhận định
                                  </button>
                                </div>
                                
                                <div className="space-y-2">
                                  {(q.statements && q.statements.length > 0 ? q.statements : [{ statement: 'Nhận định 1...', isCorrect: true }, { statement: 'Nhận định 2...', isCorrect: false }]).map((st, sIdx) => (
                                    <div key={sIdx} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center gap-3">
                                      <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                                        {sIdx + 1}
                                      </span>
                                      <input
                                        type="text"
                                        value={st.statement}
                                        onChange={(e) => {
                                          const updated = [...formQuestions];
                                          const statements = [...(q.statements || [{ statement: '', isCorrect: true }])];
                                          statements[sIdx] = { ...statements[sIdx], statement: e.target.value };
                                          updated[idx] = { ...q, statements };
                                          setFormQuestions(updated);
                                        }}
                                        placeholder="Nhập nội dung nhận định..."
                                        className="w-full text-xs font-medium focus:outline-none bg-transparent"
                                      />
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...formQuestions];
                                            const statements = [...(q.statements || [])];
                                            statements[sIdx] = { ...statements[sIdx], isCorrect: true };
                                            updated[idx] = { ...q, statements };
                                            setFormQuestions(updated);
                                          }}
                                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${st.isCorrect ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                          Đúng
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...formQuestions];
                                            const statements = [...(q.statements || [])];
                                            statements[sIdx] = { ...statements[sIdx], isCorrect: false };
                                            updated[idx] = { ...q, statements };
                                            setFormQuestions(updated);
                                          }}
                                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${st.isCorrect === false ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                          Sai
                                        </button>
                                        {(q.statements && q.statements.length > 1) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const statements = (q.statements || []).filter((_, i) => i !== sIdx);
                                              updated[idx] = { ...q, statements };
                                              setFormQuestions(updated);
                                            }}
                                            className="p-1 rounded text-rose-500 hover:text-rose-700 cursor-pointer ml-1"
                                            title="Xóa nhận định này"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );

                          case 'fill_blank':
                            return (
                              <div className="space-y-1.5 pt-1">
                                <label className="block text-[10px] font-bold text-amber-700 uppercase">Đáp án điền khuyết / trả lời ngắn chính xác:</label>
                                <input
                                  type="text"
                                  value={q.correctAnswer || ''}
                                  onChange={(e) => {
                                    const updated = [...formQuestions];
                                    updated[idx] = { ...q, correctAnswer: e.target.value };
                                    setFormQuestions(updated);
                                  }}
                                  placeholder="Nhập từ hoặc cụm từ đáp án đúng (ví dụ: 15, mười lăm)..."
                                  className="w-full p-2.5 text-xs rounded-xl border border-amber-300 bg-amber-50/40 font-bold text-slate-900 focus:ring-2 focus:ring-amber-400"
                                />
                              </div>
                            );

                          case 'ordering':
                            return (
                              <div className="space-y-2.5 pt-1">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-[10px] font-bold text-indigo-700 uppercase">Các bước / sự kiện theo đúng thứ tự logic chuẩn:</span>
                                    <p className="text-[10px] text-slate-500">Dùng nút ▲ / ▼ hoặc kéo thả để đổi thứ tự các bước.</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...formQuestions];
                                      const options = [...(q.options || []), `Bước ${(q.options || []).length + 1}`];
                                      updated[idx] = { 
                                        ...q, 
                                        options, 
                                        correctOrder: [...options], 
                                        correctAnswer: options.map((o, i) => `${i + 1}. ${o}`).join('\n') 
                                      };
                                      setFormQuestions(updated);
                                    }}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Thêm mục sắp xếp
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  {(q.options && q.options.length > 0 ? q.options : ['Bước 1...', 'Bước 2...', 'Bước 3...']).map((item, oIdx) => {
                                    const currentOpts = q.options && q.options.length > 0 ? q.options : ['Bước 1...', 'Bước 2...', 'Bước 3...'];
                                    return (
                                      <div 
                                        key={oIdx} 
                                        draggable
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData('text/plain', JSON.stringify({ qIdx: idx, oIdx }));
                                          e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          try {
                                            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                                            if (data.qIdx === idx && data.oIdx !== oIdx) {
                                              const updated = [...formQuestions];
                                              const newOpts = [...currentOpts];
                                              const moved = newOpts.splice(data.oIdx, 1)[0];
                                              newOpts.splice(oIdx, 0, moved);
                                              updated[idx] = { 
                                                ...q, 
                                                options: newOpts,
                                                correctOrder: [...newOpts],
                                                correctAnswer: newOpts.map((o, i) => `${i + 1}. ${o}`).join('\n')
                                              };
                                              setFormQuestions(updated);
                                            }
                                          } catch {}
                                        }}
                                        className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center gap-2.5 hover:border-indigo-200 transition-colors"
                                      >
                                        <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-600 p-0.5" title="Kéo thả để sắp xếp">
                                          <GripVertical className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center shrink-0">
                                          {oIdx + 1}
                                        </span>
                                        <input
                                          type="text"
                                          value={item}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const newOpts = [...currentOpts];
                                            newOpts[oIdx] = e.target.value;
                                            updated[idx] = { 
                                              ...q, 
                                              options: newOpts,
                                              correctOrder: [...newOpts],
                                              correctAnswer: newOpts.map((o, i) => `${i + 1}. ${o}`).join('\n')
                                            };
                                            setFormQuestions(updated);
                                          }}
                                          placeholder={`Nội dung bước ${oIdx + 1}...`}
                                          className="w-full text-xs font-medium focus:outline-none bg-transparent"
                                        />
                                        
                                        {/* Move Up / Down Buttons */}
                                        <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={oIdx === 0}
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const newOpts = [...currentOpts];
                                              const temp = newOpts[oIdx];
                                              newOpts[oIdx] = newOpts[oIdx - 1];
                                              newOpts[oIdx - 1] = temp;
                                              updated[idx] = { 
                                                ...q, 
                                                options: newOpts,
                                                correctOrder: [...newOpts],
                                                correctAnswer: newOpts.map((o, i) => `${i + 1}. ${o}`).join('\n')
                                              };
                                              setFormQuestions(updated);
                                            }}
                                            title="Chuyển bước lên trên"
                                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 cursor-pointer"
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={oIdx === currentOpts.length - 1}
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const newOpts = [...currentOpts];
                                              const temp = newOpts[oIdx];
                                              newOpts[oIdx] = newOpts[oIdx + 1];
                                              newOpts[oIdx + 1] = temp;
                                              updated[idx] = { 
                                                ...q, 
                                                options: newOpts,
                                                correctOrder: [...newOpts],
                                                correctAnswer: newOpts.map((o, i) => `${i + 1}. ${o}`).join('\n')
                                              };
                                              setFormQuestions(updated);
                                            }}
                                            title="Chuyển bước xuống dưới"
                                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 cursor-pointer"
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                        </div>

                                        {(currentOpts.length > 2) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const newOpts = currentOpts.filter((_, i) => i !== oIdx);
                                              updated[idx] = { 
                                                ...q, 
                                                options: newOpts,
                                                correctOrder: [...newOpts],
                                                correctAnswer: newOpts.map((o, i) => `${i + 1}. ${o}`).join('\n')
                                              };
                                              setFormQuestions(updated);
                                            }}
                                            className="p-1 rounded text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                                            title="Xóa mục"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );

                          case 'matching':
                            return (
                              <div className="space-y-2.5 pt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-cyan-700 uppercase">Các cặp ghép nối tương ứng (Trái - Phải):</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...formQuestions];
                                      const matchingPairs = [...(q.matchingPairs || []), { left: '', right: '' }];
                                      updated[idx] = { ...q, matchingPairs };
                                      setFormQuestions(updated);
                                    }}
                                    className="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Thêm cặp nối
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  {(q.matchingPairs && q.matchingPairs.length > 0 ? q.matchingPairs : [{ left: 'Vế A 1...', right: 'Vế B 1...' }, { left: 'Vế A 2...', right: 'Vế B 2...' }]).map((pair, pIdx) => (
                                    <div key={pIdx} className="p-2.5 bg-white rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-cyan-800 shrink-0">Trái {pIdx + 1}:</span>
                                        <input
                                          type="text"
                                          value={pair.left}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const matchingPairs = [...(q.matchingPairs || [{ left: '', right: '' }])];
                                            matchingPairs[pIdx] = { ...matchingPairs[pIdx], left: e.target.value };
                                            updated[idx] = { ...q, matchingPairs };
                                            setFormQuestions(updated);
                                          }}
                                          placeholder="Cột trái..."
                                          className="w-full text-xs font-medium p-1.5 rounded-lg border border-slate-200 bg-slate-50"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-cyan-800 shrink-0">Phải {pIdx + 1}:</span>
                                        <input
                                          type="text"
                                          value={pair.right}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const matchingPairs = [...(q.matchingPairs || [{ left: '', right: '' }])];
                                            matchingPairs[pIdx] = { ...matchingPairs[pIdx], right: e.target.value };
                                            updated[idx] = { ...q, matchingPairs };
                                            setFormQuestions(updated);
                                          }}
                                          placeholder="Cột phải tương ứng..."
                                          className="w-full text-xs font-medium p-1.5 rounded-lg border border-slate-200 bg-slate-50"
                                        />
                                        {(q.matchingPairs && q.matchingPairs.length > 1) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const matchingPairs = (q.matchingPairs || []).filter((_, i) => i !== pIdx);
                                              updated[idx] = { ...q, matchingPairs };
                                              setFormQuestions(updated);
                                            }}
                                            className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );

                          case 'classification':
                            return (
                              <div className="space-y-3 pt-1">
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-violet-700 uppercase">Danh sách các nhóm / danh mục:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...formQuestions];
                                        const currentGroups = q.classificationGroups || ['Nhóm 1', 'Nhóm 2'];
                                        const newGroups = [...currentGroups, `Nhóm ${currentGroups.length + 1}`];
                                        updated[idx] = { ...q, classificationGroups: newGroups };
                                        setFormQuestions(updated);
                                      }}
                                      className="px-2 py-0.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" /> Thêm nhóm
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {(q.classificationGroups || ['Nhóm 1', 'Nhóm 2']).map((groupName, gIdx) => (
                                      <div key={gIdx} className="flex items-center gap-1 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg">
                                        <input
                                          type="text"
                                          value={groupName}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const oldGroup = (q.classificationGroups || ['Nhóm 1', 'Nhóm 2'])[gIdx];
                                            const newGroups = [...(q.classificationGroups || ['Nhóm 1', 'Nhóm 2'])];
                                            newGroups[gIdx] = e.target.value;
                                            const newItems = (q.classificationItems || []).map(item => item.group === oldGroup ? { ...item, group: e.target.value } : item);
                                            updated[idx] = { ...q, classificationGroups: newGroups, classificationItems: newItems };
                                            setFormQuestions(updated);
                                          }}
                                          className="text-xs font-bold text-violet-900 bg-transparent outline-none w-24"
                                        />
                                        {(q.classificationGroups && q.classificationGroups.length > 1) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const newGroups = (q.classificationGroups || []).filter((_, i) => i !== gIdx);
                                              updated[idx] = { ...q, classificationGroups: newGroups };
                                              setFormQuestions(updated);
                                            }}
                                            className="text-violet-400 hover:text-rose-600 text-xs font-bold"
                                          >
                                            ×
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-violet-700 uppercase">Danh sách mục và nhóm tương ứng:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...formQuestions];
                                        const groups = q.classificationGroups || ['Nhóm 1', 'Nhóm 2'];
                                        const items = [...(q.classificationItems || []), { name: '', group: groups[0] || 'Nhóm 1' }];
                                        updated[idx] = { ...q, classificationItems: items };
                                        setFormQuestions(updated);
                                      }}
                                      className="px-2 py-0.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" /> Thêm mục
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {(q.classificationItems && q.classificationItems.length > 0 ? q.classificationItems : [{ name: 'Mục 1', group: (q.classificationGroups || ['Nhóm 1'])[0] }]).map((item, iIdx) => (
                                      <div key={iIdx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                                        <input
                                          type="text"
                                          value={item.name}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const items = [...(q.classificationItems || [{ name: '', group: 'Nhóm 1' }])];
                                            items[iIdx] = { ...items[iIdx], name: e.target.value };
                                            updated[idx] = { ...q, classificationItems: items };
                                            setFormQuestions(updated);
                                          }}
                                          placeholder={`Tên mục ${iIdx + 1}...`}
                                          className="flex-1 text-xs font-medium outline-none bg-transparent"
                                        />
                                        <select
                                          value={item.group}
                                          onChange={(e) => {
                                            const updated = [...formQuestions];
                                            const items = [...(q.classificationItems || [])];
                                            items[iIdx] = { ...items[iIdx], group: e.target.value };
                                            updated[idx] = { ...q, classificationItems: items };
                                            setFormQuestions(updated);
                                          }}
                                          className="text-xs font-bold text-violet-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none"
                                        >
                                          {(q.classificationGroups || ['Nhóm 1', 'Nhóm 2']).map(g => (
                                            <option key={g} value={g}>{g}</option>
                                          ))}
                                        </select>
                                        {(q.classificationItems && q.classificationItems.length > 1) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formQuestions];
                                              const items = (q.classificationItems || []).filter((_, i) => i !== iIdx);
                                              updated[idx] = { ...q, classificationItems: items };
                                              setFormQuestions(updated);
                                            }}
                                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );

                          case 'essay':
                            return (
                              <div className="space-y-1.5 pt-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Gợi ý đáp án mẫu / Rubric chấm điểm:</label>
                                <textarea
                                  rows={2}
                                  value={q.correctAnswer || q.explanation || ''}
                                  onChange={(e) => {
                                    const updated = [...formQuestions];
                                    updated[idx] = { ...q, correctAnswer: e.target.value, explanation: e.target.value };
                                    setFormQuestions(updated);
                                  }}
                                  placeholder="Nhập hướng dẫn chấm, biểu điểm hoặc gợi ý đáp án mẫu cho giáo viên..."
                                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-blue-50/50 text-blue-900 font-medium"
                                />
                              </div>
                            );

                          default:
                            return null;
                        }
                      })()}

                      {/* Lời giải / Hướng dẫn */}
                      {normalizeQuestionType(q.type) !== 'essay' && (
                        <div>
                          <input
                            type="text"
                            value={q.explanation || ''}
                            onChange={(e) => {
                              const updated = [...formQuestions];
                              updated[idx] = { ...q, explanation: e.target.value };
                              setFormQuestions(updated);
                            }}
                            placeholder="Nhập hướng dẫn giải chi tiết (tùy chọn)..."
                            className="w-full px-3 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-amber-50/50 text-amber-900 placeholder-amber-400 font-medium"
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <ManualQuestionBankModal
              isOpen={isManualModalOpen}
              onClose={() => setIsManualModalOpen(false)}
              onSaveQuestions={(newQs, saveToGlobal) => {
                setFormQuestions(prev => [...prev, ...newQs]);
                if (saveToGlobal) {
                  const existing = getLocalCachedQuestions();
                  const updated = [...existing, ...newQs];
                  localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(updated));
                  saveQuestionsBatchToFirestore(newQs).catch(console.error);
                }
              }}
              initialLessonName={formTitle}
              initialGrade={formGrade}
              initialSubject={formSubject}
              defaultSaveToGlobal={false}
            />

            <UseQuestionBankModal
              isOpen={isBankSelectModalOpen}
              onClose={() => setIsBankSelectModalOpen(false)}
              questions={effectiveQuestionsBank}
              targetContext="assignment"
              initialSubject={formSubject}
              initialGrade={formGrade}
              onSelectQuestions={handleSelectQuestionsForForm}
            />

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => setIsCreatingModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveForm}
                className="px-6 py-2.5 rounded-xl text-xs font-black bg-indigo-900 hover:bg-indigo-950 text-white shadow-lg cursor-pointer transition-all flex items-center gap-2"
              >
                <span>💾 Lưu toàn bộ & Đóng</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: THEO DÕI NỘP BÀI RÈN LUYỆN        */}
      {/* ========================================== */}
      {detailAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-6xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden space-y-4 animate-scale-up">
            
            {/* 1. MODAL HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 font-heading flex items-center gap-2.5">
                  <Eye className="w-6 h-6 text-indigo-600 bg-indigo-50 p-1 rounded-lg" />
                  <span>Theo dõi nộp bài rèn luyện</span>
                </h3>
                <p className="text-xs text-slate-600 mt-1 font-medium">
                  Bài tập: <span className="font-extrabold text-slate-800">{detailAssignment.title || 'Bài tập: Luyện tập: bài 1: Tự nhiên và công nghệ'}</span>
                  <span className="mx-2 text-slate-300">•</span>
                  Sĩ số {detailAssignment.targetClass ? (detailAssignment.targetClass.startsWith('Lớp') ? detailAssignment.targetClass : `Lớp ${detailAssignment.targetClass}`) : 'Lớp 3C'}: <span className="font-extrabold text-indigo-900">{trackingStudentsList.length || (detailAssignment.targetClass ? getClassStudentCount(detailAssignment.targetClass, detailAssignment.totalStudents) : (detailAssignment.totalStudents || 38))} học sinh</span>
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleSyncSubmissions(true)}
                  disabled={isSyncingSubmissions}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Làm mới và đồng bộ kết quả nộp bài mới nhất từ học sinh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncingSubmissions ? 'animate-spin' : ''}`} />
                  <span>Đồng bộ kết quả</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSyncAssignment(detailAssignment)}
                  disabled={syncingAssignmentId === detailAssignment.id}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Đồng bộ cập nhật câu hỏi mới nhất từ đề gốc hoặc ngân hàng"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingAssignmentId === detailAssignment.id ? 'animate-spin' : ''}`} />
                  <span>Đồng bộ câu hỏi ({detailAssignment.questions?.length || 0})</span>
                </button>

                <button
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất danh sách (Excel)</span>
                </button>

                <button
                  onClick={() => { setDetailAssignment(null); resetAssignmentSortScore(); }}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 2. TOOLBAR & FILTER TABS & WARNING BANNER */}
            {(() => {
              const orangeCount = trackingStudentsList.filter(st => st.status === 'submitted' && st.hasOrangeAlert).length;
              const redCount = trackingStudentsList.filter(st => st.status === 'submitted' && st.hasRedAlert).length;
              const totalNeedsAction = trackingStudentsList.filter(st => st.status === 'submitted' && (st.hasOrangeAlert || st.hasRedAlert)).length;
              const supportCount = trackingStudentsList.filter(st => st.totalScore !== '-' && Number(st.totalScore) < LOW_SCORE_THRESHOLD).length;

              return (
                <div className="space-y-2.5">
                  {/* Top Warning Banner */}
                  {(orangeCount > 0 || redCount > 0) && (
                    <div
                      onClick={() => { setTrackingTab('needs_action'); setNeedsActionSubFilter('all'); }}
                      className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs font-bold text-amber-900 cursor-pointer hover:bg-amber-500/20 transition-all shadow-xs animate-pulse-subtle"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          Có <strong className="text-amber-700 font-extrabold">{orangeCount}</strong> bài AI chưa chấm được, <strong className="text-rose-700 font-extrabold">{redCount}</strong> bài dưới 5 điểm. Bấm để xem.
                        </span>
                      </div>
                      <span className="text-[11px] bg-amber-200 text-amber-800 px-2.5 py-0.5 rounded-full font-extrabold">
                        Xem ngay ➔
                      </span>
                    </div>
                  )}

                  {/* Filter Tabs Toolbar */}
                  <div className="bg-slate-50/90 p-2.5 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => { setTrackingTab('all'); setNeedsActionSubFilter('all'); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          trackingTab === 'all'
                            ? 'bg-sky-100/90 text-sky-900 border border-sky-300 shadow-2xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        Tất cả ({trackingStudentsList.length})
                      </button>

                      <button
                        onClick={() => setTrackingTab('needs_action')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          trackingTab === 'needs_action'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                            : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Cần xử lý bài tập ({totalNeedsAction})
                      </button>

                      <button
                        onClick={() => setTrackingTab('support')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          trackingTab === 'support'
                            ? 'bg-rose-100 text-rose-950 border border-rose-300 shadow-2xs'
                            : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
                        }`}
                      >
                        <HeartHandshake className="w-3.5 h-3.5 text-rose-600" />
                        <span>🆘 Danh sách hỗ trợ ({supportCount})</span>
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-500 italic font-medium flex items-center gap-1">
                      <span>Mẹo: Giáo viên xem danh sách cần hỗ trợ để kịp thời kèm cặp các em điểm dưới 5.</span>
                    </div>
                  </div>

                  {/* Sub-filter Pills inside "Cần xử lý bài tập" */}
                  {trackingTab === 'needs_action' && (
                    <div className="flex items-center gap-2 pt-1 animate-fade-in">
                      <span className="text-xs font-bold text-slate-600">Lọc theo loại:</span>
                      <button
                        onClick={() => setNeedsActionSubFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          needsActionSubFilter === 'all'
                            ? 'bg-slate-800 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Tất cả ({totalNeedsAction})
                      </button>
                      <button
                        onClick={() => setNeedsActionSubFilter('orange')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          needsActionSubFilter === 'orange'
                            ? 'bg-amber-500 text-white shadow-2xs'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        AI chưa chấm được ({orangeCount})
                      </button>
                      <button
                        onClick={() => setNeedsActionSubFilter('red')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          needsActionSubFilter === 'red'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        Dưới 5 điểm ({redCount})
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3. STUDENT SUBMISSION TABLE */}
            <div className="flex-1 overflow-x-auto border border-slate-200 rounded-2xl max-h-[52vh] overflow-y-auto bg-white shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-2 text-center whitespace-nowrap w-12">STT</th>
                    <th className="py-3 px-3 whitespace-nowrap w-16">MÃ HS</th>
                    <th className="py-3 px-4 whitespace-nowrap">TÊN HỌC SINH</th>
                    {Array.from({ length: detailAssignment?.questions?.length || 5 }).map((_, qIdx) => (
                      <th key={qIdx} className="py-3 px-2 text-center whitespace-nowrap font-black text-slate-700">
                        CÂU {qIdx + 1}
                      </th>
                    ))}
                    <th 
                      onClick={handleToggleAssignmentSortScore}
                      className={`py-3 px-3 text-center whitespace-nowrap select-none cursor-pointer transition-colors ${
                        assignmentSortScoreDirection ? 'bg-indigo-50/80 hover:bg-indigo-100/70' : 'hover:bg-slate-100/70'
                      }`}
                      title={
                        assignmentSortScoreDirection === 'desc'
                          ? 'Đang sắp xếp: Điểm giảm dần (Cao → Thấp). Click để đổi sang Tăng dần.'
                          : assignmentSortScoreDirection === 'asc'
                          ? 'Đang sắp xếp: Điểm tăng dần (Thấp → Cao). Click để về mặc định.'
                          : 'Click để sắp xếp theo Tổng điểm (Giảm dần → Tăng dần → Mặc định)'
                      }
                    >
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <span className={assignmentSortScoreDirection ? 'text-indigo-800 font-black' : 'text-slate-600 font-extrabold'}>
                          TỔNG ĐIỂM
                        </span>
                        {assignmentSortScoreDirection === 'desc' ? (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-md bg-indigo-600 text-white font-black text-xs shadow-xs" title="Giảm dần">
                            <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                          </span>
                        ) : assignmentSortScoreDirection === 'asc' ? (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-md bg-indigo-600 text-white font-black text-xs shadow-xs" title="Tăng dần">
                            <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors" title="Chưa sắp xếp">
                            <ArrowUpDown className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">AI THÔNG BÁO</th>
                    <th className="py-3 px-4 text-center whitespace-nowrap">THỜI GIAN NỘP</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedTrackingStudents.map((st, index) => {
                    const rowBgClass = st.hasOrangeAlert
                      ? 'bg-amber-50/60 hover:bg-amber-100/60'
                      : (st.hasRedAlert
                          ? 'bg-rose-50/60 hover:bg-rose-100/60'
                          : 'hover:bg-slate-50/80');

                    return (
                      <tr
                        key={st.code}
                        onClick={() => {
                          setSelectedStudentDetail(st);
                          setRegradeScore(st.totalScore !== '-' ? String(st.totalScore) : '10');
                        }}
                        className={`transition-colors cursor-pointer group ${rowBgClass}`}
                      >
                        {/* STT */}
                        <td className="py-3 px-2 text-center whitespace-nowrap font-bold text-slate-500">
                          {index + 1}
                        </td>

                        {/* Mã HS */}
                        <td className="py-3 px-3 whitespace-nowrap font-extrabold text-fuchsia-700">
                          {st.code}
                        </td>

                        {/* Tên HS */}
                        <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-900 group-hover:text-indigo-900 transition-colors">
                          {st.name}
                        </td>

                        {/* Cột câu hỏi động */}
                        {Array.from({ length: detailAssignment?.questions?.length || 5 }).map((_, qIdx) => {
                          const qStatus = st.gradeStatuses?.[qIdx] || 'ok';
                          const qNote = st.gradeNotes?.[qIdx] || '';
                          const ans = st.answers[qIdx] || 'none';

                          return (
                            <td key={qIdx} className="py-3 px-2 text-center whitespace-nowrap">
                              {(qStatus === 'error' || qStatus === 'uncertain') ? (
                                <span
                                  className="inline-flex w-5 h-5 rounded-full bg-amber-100 border border-amber-400 text-amber-900 items-center justify-center text-[11px] font-extrabold cursor-help"
                                  title={qNote || 'AI chưa chấm được câu này'}
                                >
                                  ?
                                </span>
                              ) : ans === 'pass' ? (
                                <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 items-center justify-center text-[10px] font-black">
                                  ✓
                                </span>
                              ) : ans === 'fail' ? (
                                <span className="inline-flex w-5 h-5 rounded-full bg-rose-100 border border-rose-300 text-rose-700 items-center justify-center text-[10px] font-black">
                                  ✗
                                </span>
                              ) : (
                                <span className="text-slate-300 font-semibold">-</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Tổng điểm / Mức đạt */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {st.totalScore !== '-' ? (
                            isSubjectWithScore(detailAssignment?.subject) ? (
                              <span className={`px-2.5 py-0.5 rounded-md font-black text-xs border ${
                                typeof st.totalScore === 'number' && st.totalScore < LOW_SCORE_THRESHOLD
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-indigo-100/90 text-indigo-800 border-indigo-200'
                              }`}>
                                {formatTotalScore(st.totalScore)}
                              </span>
                            ) : (
                              (() => {
                                const correctCount = Array.isArray(st.answers) ? st.answers.filter((a: any) => a === 'pass').length : 0;
                                const totalQ = detailAssignment?.questions?.length || st.answers.length || 1;
                                const lvl = getQualitativeLabel(correctCount, totalQ);
                                return (
                                  <span className={`px-2.5 py-0.5 rounded-md font-black text-xs border ${
                                    lvl === 'Tốt' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                    lvl === 'Hoàn thành' ? 'bg-sky-100 text-sky-800 border-sky-200' :
                                    'bg-rose-100 text-rose-800 border-rose-200'
                                  }`}>
                                    {lvl}
                                  </span>
                                );
                              })()
                            )
                          ) : (
                            <span className="text-slate-300 font-semibold">-</span>
                          )}
                        </td>

                        {/* AI Thông báo */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {st.status === 'submitted' ? (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {st.hasOrangeAlert && (
                                <span
                                  className="px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-[10px] inline-flex items-center gap-1 cursor-help"
                                  title={`AI chưa chấm được ${st.errorQuestionsCount || 1} câu:\n${(st.errorDetails || []).map(e => `• Câu ${e.questionIndex + 1}: ${e.note}`).join('\n')}`}
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>AI chưa chấm được ({st.errorQuestionsCount || 1} câu)</span>
                                </span>
                              )}

                              {st.hasRedAlert && (
                                <span
                                  className="px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 text-rose-900 font-extrabold text-[10px] inline-flex items-center gap-1 cursor-help"
                                  title={`Điểm bài làm dưới 5: ${st.totalScore} điểm.`}
                                >
                                  <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                  <span>Dưới 5 điểm</span>
                                </span>
                              )}

                              {!st.hasOrangeAlert && !st.hasRedAlert && (
                                <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 items-center justify-center text-[10px] font-black">
                                  ✓
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-semibold">-</span>
                          )}
                        </td>

                      {/* Thời gian nộp */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {st.status === 'submitted' ? (
                          <span className="text-sky-700 font-bold text-[11px] inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-sky-500" />
                            {formatSubmissionDateTime(st.submittedTime)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[10px]">
                            Chờ HS
                          </span>
                        )}
                      </td>

                      {/* Thao tác: Chấm lại & Xóa nhanh */}
                      <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStudentDetail(st);
                              setRegradeScore(st.totalScore !== '-' ? String(st.totalScore) : '10');
                            }}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center ${
                              st.status === 'submitted'
                                ? 'hover:bg-indigo-100 text-slate-700 hover:text-indigo-700'
                                : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                            }`}
                            title="Chấm lại bài tập"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {st.status === 'submitted' && (
                            <button
                              onClick={() => {
                                console.log(`[Delete Button Clicked] Học sinh: ${st.name} (${st.code}), Assignment ID: ${detailAssignment?.id}`);
                                setDeleteTarget(st);
                                setDeleteError(null);
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                              title="Xóa bài làm của học sinh này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>

            {/* 4. MODAL FOOTER */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setDetailAssignment(null)}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
              >
                Đóng bảng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: XÁC NHẬN XÓA BÀI LÀM HỌC SINH       */}
      {/* ========================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 overflow-hidden flex flex-col space-y-4 animate-scale-up relative">
            {/* Modal Header */}
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900 font-heading">
                  Xác nhận xóa kết quả bài làm
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">Thao tác xóa sẽ được lưu trực tiếp</p>
              </div>
            </div>

            {/* Body Content */}
            <div className="text-xs text-slate-700 leading-relaxed space-y-2.5">
              <p>
                Bạn có chắc muốn xóa kết quả bài làm của học sinh{' '}
                <strong className="text-slate-900 font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                  {deleteTarget.name}
                </strong>{' '}
                ({deleteTarget.code}) không?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Sau khi xóa, học sinh sẽ trở về trạng thái &quot;Chờ HS&quot; và phải làm lại bài.</span>
              </div>
            </div>

            {/* Error display if deletion failed */}
            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2 animate-fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingSubmission}
                onClick={() => {
                  if (!isDeletingSubmission) {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeletingSubmission}
                onClick={handleConfirmDeleteSubmission}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isDeletingSubmission ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: CHẤM LẠI BÀI TẬP HỌC SINH CHI TIẾT   */}
      {/* ========================================== */}
      {selectedStudentDetail && (
        <StudentSubmissionDetailModal
          isOpen={Boolean(selectedStudentDetail)}
          onClose={() => setSelectedStudentDetail(null)}
          mode="assignment"
          targetItem={detailAssignment}
          studentSubmission={selectedStudentDetail}
          onSaveRegrade={async () => {
            showToast(`Đã lưu kết quả chấm lại cho học sinh ${selectedStudentDetail.name} thành công!`);
          }}
          onDeleteSubmission={() => {
            showToast(`Đã xoá bài làm của học sinh ${selectedStudentDetail.name}`);
            setSelectedStudentDetail(null);
            handleSyncSubmissions(false);
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL 3: STUDENT SOLVER FORM               */}
      {/* ========================================== */}
      {solvingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  Góc nhìn Học sinh - Làm bài
                </span>
                <h3 className="text-base font-extrabold text-slate-900 font-heading mt-1">
                  {solvingAssignment.title}
                </h3>
              </div>
              <button
                onClick={() => setSolvingAssignment(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
              <strong>Yêu cầu bài tập:</strong> {solvingAssignment.description}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Bài làm của học sinh ({currentUserName}):
              </label>
              <textarea
                rows={5}
                value={studentContent}
                onChange={(e) => setStudentContent(e.target.value)}
                placeholder="Nhập nội dung bài làm hoặc kết quả câu hỏi vào đây..."
                className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 bg-slate-50/50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSolvingAssignment(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleStudentSubmit}
                disabled={!studentContent.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md cursor-pointer disabled:opacity-50"
              >
                Gửi bài nộp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 4: BẢNG VÀNG VINH DANH & THỐNG KÊ   */}
      {/* ========================================== */}
      {vinhDanhAssignment && (() => {
        const vinhDanhTargetClass = vinhDanhAssignment.targetClass
          ? (vinhDanhAssignment.targetClass.startsWith('Lớp') ? vinhDanhAssignment.targetClass : `Lớp ${vinhDanhAssignment.targetClass}`)
          : 'Lớp 3C';

        const totalStudentsCount = vinhDanhTrackingResult?.totalStudents || 38;

        const top1 = vinhDanhRankedData.top10[0];
        const top2 = vinhDanhRankedData.top10[1];
        const top3 = vinhDanhRankedData.top10[2];

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full my-auto shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-scale-up">
              
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 text-white p-5 sm:p-6 relative overflow-hidden flex-shrink-0">
                <div className="absolute -right-6 -bottom-6 opacity-15 pointer-events-none">
                  <Trophy className="w-48 h-48 text-white" />
                </div>

                <div className="flex items-start justify-between relative z-10 gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-amber-100 font-extrabold text-[11px] uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
                      Thống kê vinh danh
                    </div>
                    <h2 className="text-lg sm:text-2xl font-black text-white font-heading tracking-tight flex items-center gap-2">
                      🏆 BẢNG VÀNG VINH DANH & THỐNG KÊ KẾT QUẢ RÈN LUYỆN
                    </h2>
                    <p className="text-xs sm:text-sm text-amber-100 font-medium">
                      Bài tập: <span className="font-bold text-white">{vinhDanhAssignment.title}</span> • Sĩ số {vinhDanhTargetClass}: <span className="font-extrabold text-white">{totalStudentsCount} học sinh</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleRefreshVinhDanh}
                      disabled={isLoadingVinhDanh}
                      className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs backdrop-blur-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Xóa cache IndexedDB và tải lại dữ liệu mới nhất"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVinhDanh ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Làm mới</span>
                    </button>

                    <button
                      onClick={() => setVinhDanhAssignment(null)}
                      className="p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/90 hover:text-white transition-all cursor-pointer flex-shrink-0"
                      title="Đóng cửa sổ"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Body Scrollable */}
              <div className="p-4 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto flex-1 bg-slate-50/50">
                {isLoadingVinhDanh ? (
                  <div className="py-20 text-center text-slate-500 font-medium flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                    <p className="text-sm font-bold text-slate-700">Đang tải bảng vàng vinh danh...</p>
                    <p className="text-xs text-slate-400">Đang đồng bộ dữ liệu học sinh và kết quả bài làm</p>
                  </div>
                ) : vinhDanhError ? (
                  <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-4 my-6">
                    <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-slate-800">Chưa tải được bảng vàng, thử lại</h4>
                      <p className="text-xs text-slate-500">
                        {vinhDanhError || 'Không thể tải dữ liệu bảng vàng. Vui lòng thử lại.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRefreshVinhDanh()}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Thử lại
                    </button>
                  </div>
                ) : (
                  <>
                    {/* BỤC VINH DANH TOP 3 (PODIUM UI) */}
                    <div className="bg-gradient-to-b from-amber-50/80 via-orange-50/40 to-white rounded-2xl p-4 sm:p-5 border border-amber-200 shadow-xs space-y-3 sm:space-y-4">
                      <div className="text-center space-y-1">
                        <h3 className="text-base font-extrabold text-amber-900 font-heading flex items-center justify-center gap-2">
                          <Crown className="w-5 h-5 text-amber-500 animate-bounce" />
                          BỤC VINH DANH HỌC SINH XUẤT SẮC
                        </h3>
                        <p className="text-xs text-amber-700 font-medium">Tuyên dương các học sinh đạt thành tích cao nhất bài rèn luyện</p>
                      </div>

                      {/* Podium visual */}
                      <div className="flex items-end justify-center gap-2 sm:gap-4 pt-6 max-w-lg mx-auto">
                        
                        {/* Rank 2 (Silver) */}
                        <div className="flex-1 flex flex-col items-center">
                          <div className="mb-2 text-center">
                            <span className="text-2xl">🥈</span>
                            <div className="font-extrabold text-xs text-slate-800 mt-1 truncate max-w-[120px]" title={top2?.name || '—'}>
                              {top2 ? top2.name : '—'}
                            </div>
                            <div className="text-[11px] font-bold text-slate-600">
                              {top2 ? `${formatScore(top2.totalScore)} điểm` : '—'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {top2 ? `⏱️ ${top2.submittedTime || top2.displayTime}` : '—'}
                            </div>
                          </div>
                          <div className="w-full h-28 bg-gradient-to-b from-slate-300 via-slate-400 to-slate-500 rounded-t-2xl shadow-md border-t-2 border-slate-200 flex flex-col items-center justify-center text-white">
                            <span className="text-2xl font-black">2</span>
                            <span className="text-[10px] font-bold tracking-wider uppercase opacity-80">HẠNG NHÌ</span>
                          </div>
                        </div>

                        {/* Rank 1 (Gold) */}
                        <div className="flex-1 flex flex-col items-center">
                          <div className="mb-2 text-center">
                            <div className="inline-block relative">
                              <Crown className="w-6 h-6 text-yellow-500 absolute -top-5 left-1/2 -translate-x-1/2 drop-shadow-md animate-pulse" />
                              <span className="text-3xl">🥇</span>
                            </div>
                            <div className="font-black text-sm text-amber-900 mt-1 truncate max-w-[140px]" title={top1?.name || '—'}>
                              {top1 ? top1.name : '—'}
                            </div>
                            <div className="text-xs font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full inline-block">
                              {top1 ? `${formatScore(top1.totalScore)} điểm` : '—'}
                            </div>
                            <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                              {top1 ? `⏱️ ${top1.submittedTime || top1.displayTime}` : '—'}
                            </div>
                          </div>
                          <div className="w-full h-36 bg-gradient-to-b from-amber-400 via-yellow-500 to-amber-600 rounded-t-2xl shadow-xl border-t-2 border-yellow-200 flex flex-col items-center justify-center text-white">
                            <Trophy className="w-6 h-6 text-yellow-100 mb-1" />
                            <span className="text-3xl font-black">1</span>
                            <span className="text-[10px] font-extrabold tracking-wider uppercase text-yellow-100">QUÁN QUÂN</span>
                          </div>
                        </div>

                        {/* Rank 3 (Bronze) */}
                        <div className="flex-1 flex flex-col items-center">
                          <div className="mb-2 text-center">
                            <span className="text-2xl">🥉</span>
                            <div className="font-extrabold text-xs text-amber-900 mt-1 truncate max-w-[120px]" title={top3?.name || '—'}>
                              {top3 ? top3.name : '—'}
                            </div>
                            <div className="text-[11px] font-bold text-slate-500">
                              {top3 ? `${formatScore(top3.totalScore)} điểm` : '—'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {top3 ? `⏱️ ${top3.submittedTime || top3.displayTime}` : '—'}
                            </div>
                          </div>
                          <div className="w-full h-20 bg-gradient-to-b from-amber-700 via-amber-800 to-amber-900 rounded-t-2xl shadow-xs border-t-2 border-amber-600 flex flex-col items-center justify-center text-amber-100">
                            <span className="text-xl font-black">3</span>
                            <span className="text-[9px] font-bold tracking-wider uppercase opacity-80">HẠNG BA</span>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* 3. BẢNG DANH SÁCH TOP 10 HỌC SINH XUẤT SẮC */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between gap-2">
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Trophy className="w-4 h-4 text-amber-600" />
                          Bảng vinh danh TOP 10 học sinh xuất sắc nhất
                        </h4>
                      </div>

                      <div className="overflow-x-auto max-h-80">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                              <th className="py-2.5 px-3 text-center w-12">HẠNG</th>
                              <th className="py-2.5 px-3 min-w-[120px]">MÃ HS</th>
                              <th className="py-2.5 px-4 min-w-[150px]">HỌ VÀ TÊN</th>
                              <th className="py-2.5 px-3 text-center">ĐIỂM SỐ</th>
                              <th className="py-2.5 px-3 text-center">THỜI ĐIỂM NỘP</th>
                              <th className="py-2.5 px-4 text-center">DANH HIỆU / HUY HIỆU</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {vinhDanhRankedData.top10.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-500 font-medium text-xs">
                                  Chưa có học sinh nào nộp bài
                                </td>
                              </tr>
                            ) : (
                              vinhDanhRankedData.top10.map((st, idx) => {
                                const numScore = typeof st.numericScore === 'number' ? st.numericScore : (typeof st.totalScore === 'number' ? st.totalScore : (parseFloat(String(st.totalScore)) || 0));

                                let bgClass = 'hover:bg-slate-50';
                                let badgeTitle = '👍 Đạt yêu cầu';
                                let badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';

                                if (idx === 0) {
                                  bgClass = 'bg-amber-50/60 hover:bg-amber-50 font-bold';
                                  badgeTitle = '🌟 Quán quân xuất sắc';
                                  badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
                                } else if (idx === 1) {
                                  bgClass = 'bg-slate-50/80 hover:bg-slate-100 font-medium';
                                  badgeTitle = '🥈 Á quân toàn diện';
                                  badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                                } else if (idx === 2) {
                                  bgClass = 'bg-orange-50/40 hover:bg-orange-50 font-medium';
                                  badgeTitle = '🥉 Hạng ba nổi bật';
                                  badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                                } else if (numScore >= 8) {
                                  badgeTitle = '🏆 Giỏi toàn diện';
                                  badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                                } else if (numScore >= 5) {
                                  badgeTitle = '👍 Đạt yêu cầu';
                                  badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                                } else {
                                  badgeTitle = '⚡ Cần cố gắng thêm';
                                  badgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
                                }

                                return (
                                  <tr key={`${st.code}-${idx}`} className={`transition-colors ${bgClass}`}>
                                    {/* Hạng */}
                                    <td className="py-2.5 px-3 text-center font-black">
                                      {idx === 0 ? (
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-white font-black text-xs shadow-xs">
                                          1
                                        </span>
                                      ) : idx === 1 ? (
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400 text-white font-black text-xs shadow-xs">
                                          2
                                        </span>
                                      ) : idx === 2 ? (
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs shadow-xs">
                                          3
                                        </span>
                                      ) : (
                                        <span className="text-slate-600 font-bold">{idx + 1}</span>
                                      )}
                                    </td>

                                    {/* Mã HS */}
                                    <td className="py-2.5 px-3 font-extrabold text-fuchsia-700 font-mono text-[11px]">
                                      <span className="inline-flex items-center gap-1">
                                        <span>{st.code}</span>
                                        {st.hasInvalidCodeFormat && (
                                          <span title="Mã học sinh chưa đúng định dạng chuẩn (ví dụ: 3C26-27-5)" className="inline-flex items-center">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline shrink-0" />
                                          </span>
                                        )}
                                      </span>
                                    </td>

                                    {/* Họ tên */}
                                    <td className="py-2.5 px-4 font-extrabold text-slate-800">
                                      {st.name}
                                    </td>

                                    {/* Điểm số */}
                                    <td className="py-2.5 px-3 text-center">
                                      {isSubjectWithScore(vinhDanhAssignment?.subject) ? (
                                        <span className="inline-block px-2.5 py-0.5 rounded-full font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                                          {formatScore(st.totalScore)} / 10
                                        </span>
                                      ) : (
                                        (() => {
                                          const lvl = getQualitativeLabel(st.totalScore);
                                          return (
                                            <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs border ${
                                              lvl === 'Tốt' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                              lvl === 'Hoàn thành' ? 'bg-sky-100 text-sky-800 border-sky-300' :
                                              'bg-rose-100 text-rose-800 border-rose-300'
                                            }`}>
                                              {lvl}
                                            </span>
                                          );
                                        })()
                                      )}
                                    </td>

                                    {/* Thời điểm nộp */}
                                    <td className="py-2.5 px-3 text-center font-medium text-slate-600 text-[11px]">
                                      {st.submittedTime || (st.rawSubmission?.submittedAt ? formatSubmissionDateTime(st.rawSubmission.submittedAt) : '--')}
                                    </td>

                                    {/* Danh hiệu */}
                                    <td className="py-2.5 px-4 text-center">
                                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeColor}`}>
                                        {badgeTitle}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer Buttons */}
              <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
                <button
                  onClick={() => {
                    showToast(`✅ Đã tải xuống file Bảng vàng vinh danh ${vinhDanhTargetClass} (PDF/Ảnh) thành công!`);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-white transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 w-full sm:w-auto active:scale-95"
                >
                  <Download className="w-4 h-4" /> Xuất Bảng Vinh Danh (PDF/Ảnh)
                </button>

                <button
                  onClick={() => setVinhDanhAssignment(null)}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer w-full sm:w-auto"
                >
                  Đóng
                </button>
              </div>

            </div>
          </div>
        );
      })()}
      {/* ========================================== */}
      {/* MODAL 5: CHIA SẺ BÀI TẬP & HỌC LIỆU       */}
      {/* ========================================== */}
      <ShareContentModal
        isOpen={!!sharingAssignment}
        onClose={() => setSharingAssignment(null)}
        contentType="assignment"
        content={sharingAssignment ? {
          id: sharingAssignment.id,
          title: sharingAssignment.title,
          grade: sharingAssignment.grade,
          subject: sharingAssignment.subject,
          sharedWithTeachers: sharingAssignment.sharedWithTeachers,
          sharedWithGroups: sharingAssignment.sharedWithGroups,
          sharePermission: sharingAssignment.sharePermission,
          allowDeleteByShared: sharingAssignment.allowDeleteByShared
        } : null}
        onConfirmShare={(payload) => {
          if (sharingAssignment) {
            onSaveAssignment({
              ...sharingAssignment,
              sharedWithTeachers: payload.sharedWithTeachers,
              sharedWithGroups: payload.sharedWithGroups,
              sharePermission: payload.sharePermission,
              allowDeleteByShared: payload.allowDeleteByShared
            });
          }
          showToast(
            payload.revoked
              ? `Đã thu hồi chia sẻ bài tập "${payload.title}"!`
              : `Đã chia sẻ bài tập "${payload.title}" thành công!`
          );
          setSharingAssignment(null);
        }}
      />

      {/* MODAL: CẤU HÌNH GIAO BÀI TẬP */}
      {assigningConfigAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl shadow-inner border border-white/20">
                  🚀
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white font-heading tracking-wide">
                    Cấu Hình Giao Bài Tập
                  </h3>
                  <p className="text-xs text-indigo-200 font-medium">
                    {assigningConfigAssignment.grade || 'Khối 3'} • Môn {assigningConfigAssignment.subject || 'Công nghệ'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssigningConfigAssignment(null)}
                className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* 1. Tiêu đề bài giao */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
                  Tiêu đề bài giao
                </label>
                <input
                  type="text"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="Nhập tiêu đề bài tập..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50/50"
                />
              </div>

              {/* 2. Chọn lớp giao bài (Thuộc khối đã chọn khi tạo ra bài tập) */}
              {(() => {
                const currentGradeClasses = getClassesForGrade(assigningConfigAssignment.grade);
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-indigo-600" />
                        <span>Chọn lớp giao bài ({assigningConfigAssignment.grade || 'Khối 3'})</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedAssignClasses.length === currentGradeClasses.length) {
                            setSelectedAssignClasses([]);
                          } else {
                            setSelectedAssignClasses([...currentGradeClasses]);
                          }
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        {selectedAssignClasses.length === currentGradeClasses.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả các lớp'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                      {currentGradeClasses.map((clsName) => {
                        const isChecked = selectedAssignClasses.includes(clsName);
                        const existingForCls = assigningConfigAssignment ? findExistingAssignmentForClass(assigningConfigAssignment, clsName) : null;
                        const existingSubs = existingForCls ? (Array.isArray(existingForCls.submissions) ? existingForCls.submissions.length : (existingForCls.completedCount || 0)) : 0;
                        const existingTotal = existingForCls ? (existingForCls.totalStudents || getClassStudentCount(clsName) || 40) : 0;

                        return (
                          <label
                            key={clsName}
                            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAssignClasses([...selectedAssignClasses, clsName]);
                                  } else {
                                    setSelectedAssignClasses(selectedAssignClasses.filter((c) => c !== clsName));
                                  }
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                              />
                              <span>{clsName}</span>
                            </div>
                            {existingForCls && (
                              <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
                                Đã giao ({existingSubs}/{existingTotal} đã làm)
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 3 & 4. Lên lịch giao bài & Đặt hạn làm bài */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Lên lịch giao bài</span>
                  </label>
                  <DateTimePicker
                    value={assignStartDate}
                    onChange={setAssignStartDate}
                    placeholder="DD/MM/YYYY HH:mm"
                    format="dd/mm/yyyy HH:mm"
                  />
                  <p className="text-[11px] text-slate-400 font-medium">Thời điểm bài tập bắt đầu hiển thị cho học sinh</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Đặt hạn làm bài</span>
                  </label>
                  <DateTimePicker
                    value={assignDueDate}
                    onChange={setAssignDueDate}
                    placeholder="DD/MM/YYYY HH:mm"
                    format="dd/mm/yyyy HH:mm"
                  />
                  <p className="text-[11px] text-slate-400 font-medium">Thời điểm hết hạn nộp bài rèn luyện</p>
                </div>
              </div>

              {/* 5. Quy Chế Luyện Tập & Tráo Đề */}
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100/90 space-y-3">
                <div className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-indigo-600" />
                  <span>Quy Chế Luyện Tập & Tráo Đề</span>
                </div>

                <div className="space-y-3 pt-1">
                  {/* Số lần làm bài tối đa */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Số lần làm bài tối đa
                    </label>
                    <select
                      value={assignMaxAttempts}
                      onChange={(e) => setAssignMaxAttempts(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="Không giới hạn số lần luyện tập">Không giới hạn số lần luyện tập</option>
                      <option value="1 lần">1 lần</option>
                      <option value="2 lần">2 lần</option>
                      <option value="3 lần">3 lần</option>
                      <option value="5 lần">5 lần</option>
                      <option value="10 lần">10 lần</option>
                    </select>
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={assignShuffleQuestions}
                        onChange={(e) => setAssignShuffleQuestions(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span>Tráo đổi thứ tự câu hỏi</span>
                        <p className="text-[11px] text-slate-500 font-normal">Xáo trộn câu hỏi tự động đối với mỗi lượt làm bài của học sinh</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={assignShuffleOptions}
                        onChange={(e) => setAssignShuffleOptions(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span>Tráo đổi thứ tự phương án chọn</span>
                        <p className="text-[11px] text-slate-500 font-normal">Xáo trộn thứ tự các đáp án A, B, C, D ngẫu nhiên</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={assignRealtimeLeaderboard}
                        onChange={(e) => setAssignRealtimeLeaderboard(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span>Bật chế độ thi đấu trực tiếp (Real-time Leaderboard)</span>
                        <p className="text-[11px] text-slate-500 font-normal">Hiển thị bảng xếp hạng trực tiếp cho học sinh (cần kết nối thời gian thực)</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* 6. Giao bài cho */}
              <div className="space-y-2.5">
                <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Giao bài cho</span>
                </label>

                <div className="flex items-center gap-6 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="assignTargetType"
                      value="all"
                      checked={assignTargetType === 'all'}
                      onChange={() => setAssignTargetType('all')}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Cả lớp ({selectedAssignClasses.join(', ')})</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="assignTargetType"
                      value="specific"
                      checked={assignTargetType === 'specific'}
                      onChange={() => setAssignTargetType('specific')}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Từng thành viên</span>
                  </label>
                </div>

                {assignTargetType === 'specific' && (
                  <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>Danh sách học sinh nhận bài ({selectedStudentIds.length}/{CLASS_3A_STUDENTS.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedStudentIds.length === CLASS_3A_STUDENTS.length) {
                            setSelectedStudentIds([]);
                          } else {
                            setSelectedStudentIds(CLASS_3A_STUDENTS.map(s => s.code));
                          }
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        {selectedStudentIds.length === CLASS_3A_STUDENTS.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả học sinh'}
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pr-1">
                      {CLASS_3A_STUDENTS.map((st) => {
                        const isSelected = selectedStudentIds.includes(st.code);
                        return (
                          <label
                            key={st.code}
                            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStudentIds([...selectedStudentIds, st.code]);
                                } else {
                                  setSelectedStudentIds(selectedStudentIds.filter(id => id !== st.code));
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="truncate">{st.name} ({st.code.toUpperCase()})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAssigningConfigAssignment(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmAssignConfig}
                className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-200 flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>Xác nhận Giao Bài</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SỬA CÀI ĐẶT GIAO BÀI TẬP */}
      {editingConfigAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl shadow-inner border border-white/20">
                  ⚙️
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white font-heading tracking-wide">
                    Sửa Cài Đặt Giao Bài Tập
                  </h3>
                  <p className="text-xs text-indigo-200 font-medium">
                    {editingConfigAssignment.title} • {editingConfigAssignment.grade || 'Khối 4'} • Môn {editingConfigAssignment.subject}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingConfigAssignment(null)}
                className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Thống kê bài nộp hiện có */}
              {(() => {
                const groupList = getGroupAssignments(editingConfigAssignment, assignments);
                const groupStats = groupList.map((item) => {
                  const subsCount = Array.isArray(item.submissions) ? item.submissions.length : (item.completedCount || 0);
                  const total = item.totalStudents || getClassStudentCount(item.targetClass || '') || 40;
                  return {
                    cls: item.targetClass || 'Chưa rõ',
                    submitted: subsCount,
                    total
                  };
                });
                const totalSubmitted = groupStats.reduce((sum, s) => sum + s.submitted, 0);

                return (
                  <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl space-y-2 text-xs text-sky-950">
                    <div className="flex items-center gap-2 font-bold text-sky-900">
                      <Sparkles className="w-4 h-4 text-sky-600" />
                      <span>Thông tin tiến độ nộp bài của học sinh ({totalSubmitted} bài đã nộp)</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {groupStats.map((st, idx) => (
                        <span key={idx} className="px-2.5 py-1 bg-white border border-sky-300 rounded-lg font-black text-sky-800 shadow-2xs">
                          {st.cls}: {st.submitted}/{st.total} đã làm
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-sky-700 font-medium">
                      🔒 Toàn bộ nội dung câu hỏi, danh sách bài làm và điểm số của học sinh được bảo lưu 100% khi cập nhật cài đặt.
                    </p>
                  </div>
                );
              })()}

              {/* Đồng bộ nội dung câu hỏi từ đề gốc / Ngân hàng câu hỏi */}
              <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-emerald-900">
                    <RefreshCw className={`w-4 h-4 text-emerald-600 ${syncingAssignmentId === editingConfigAssignment.id ? 'animate-spin' : ''}`} />
                    <span>Nội dung câu hỏi: {editingConfigAssignment.questions?.length || 0} câu</span>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    Nếu bạn vừa thêm, sửa hoặc xóa câu hỏi trong bộ đề gốc hoặc ngân hàng câu hỏi, hãy bấm nút này để cập nhật ngay cho bài tập đã giao.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSyncAssignment(editingConfigAssignment)}
                  disabled={syncingAssignmentId === editingConfigAssignment.id}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all shrink-0 disabled:opacity-50"
                  title="Cập nhật lại danh sách câu hỏi từ đề gốc hoặc ngân hàng câu hỏi"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingAssignmentId === editingConfigAssignment.id ? 'animate-spin' : ''}`} />
                  <span>Cập nhật lại danh sách câu hỏi</span>
                </button>
              </div>

              {/* Lên lịch & Đặt hạn làm bài */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Lên lịch giao bài</span>
                  </label>
                  <DateTimePicker
                    value={editConfigStartDate}
                    onChange={(val) => {
                      setEditConfigStartDate(val);
                      setEditConfigDateError(null);
                    }}
                    placeholder="DD/MM/YYYY HH:mm"
                    format="dd/mm/yyyy HH:mm"
                  />
                  <p className="text-[11px] text-slate-400 font-medium">Thời điểm bài bắt đầu hiển thị</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Đặt hạn làm bài</span>
                  </label>
                  <DateTimePicker
                    value={editConfigDueDate}
                    onChange={(val) => {
                      setEditConfigDueDate(val);
                      setEditConfigDateError(null);
                    }}
                    placeholder="DD/MM/YYYY HH:mm"
                    format="dd/mm/yyyy HH:mm"
                  />
                  <p className="text-[11px] text-slate-400 font-medium">Thời điểm hết hạn nộp bài</p>
                </div>
              </div>

              {editConfigDateError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editConfigDateError}</span>
                </div>
              )}

              {/* Quy chế luyện tập */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-indigo-600" />
                  <span>Quy Chế Luyện Tập & Tráo Đề</span>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Số lần làm bài tối đa
                    </label>
                    <select
                      value={editConfigMaxAttempts}
                      onChange={(e) => setEditConfigMaxAttempts(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="Không giới hạn số lần luyện tập">Không giới hạn số lần luyện tập</option>
                      <option value="1 lần">1 lần</option>
                      <option value="2 lần">2 lần</option>
                      <option value="3 lần">3 lần</option>
                      <option value="5 lần">5 lần</option>
                      <option value="10 lần">10 lần</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={editConfigShuffleQuestions}
                        onChange={(e) => setEditConfigShuffleQuestions(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span>Tráo đổi thứ tự câu hỏi</span>
                        <p className="text-[11px] text-slate-500 font-normal">Xáo trộn câu hỏi tự động đối với mỗi lượt làm</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={editConfigShuffleOptions}
                        onChange={(e) => setEditConfigShuffleOptions(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span>Tráo đổi thứ tự phương án chọn</span>
                        <p className="text-[11px] text-slate-500 font-normal">Xáo trộn thứ tự các đáp án A, B, C, D</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={editConfigRealtimeLeaderboard}
                        onChange={(e) => setEditConfigRealtimeLeaderboard(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span>Bật chế độ thi đấu trực tiếp (Real-time Leaderboard)</span>
                        <p className="text-[11px] text-slate-500 font-normal">Hiển thị bảng xếp hạng trực tiếp cho học sinh</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Phạm vi xếp hạng Real-time Leaderboard */}
              {editConfigRealtimeLeaderboard && (
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2.5 text-xs text-amber-950">
                  <div className="font-extrabold uppercase tracking-wide flex items-center gap-1.5 text-amber-900">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <span>Phạm vi tính điểm Bảng Xếp Hạng:</span>
                  </div>
                  <div className="space-y-2 pl-1">
                    <label className="flex items-center gap-2 cursor-pointer font-bold">
                      <input
                        type="radio"
                        name="leaderboardScope"
                        value="all"
                        checked={editConfigLeaderboardScope === 'all'}
                        onChange={() => setEditConfigLeaderboardScope('all')}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Tất cả các lượt nộp từ trước đến nay (Lấy điểm cao nhất của mỗi học sinh)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold">
                      <input
                        type="radio"
                        name="leaderboardScope"
                        value="since_enabled"
                        checked={editConfigLeaderboardScope === 'since_enabled'}
                        onChange={() => setEditConfigLeaderboardScope('since_enabled')}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Chỉ tính các lượt nộp bài sau khi bật chế độ này</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Áp dụng cho cả nhóm bài tập nếu có nhiều lớp */}
              {(() => {
                const groupList = getGroupAssignments(editingConfigAssignment, assignments);
                if (groupList.length <= 1) return null;
                const classesInGroup = groupList.map((g) => g.targetClass).filter(Boolean).join(', ');

                return (
                  <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-200">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-indigo-950 select-none">
                      <input
                        type="checkbox"
                        checked={editConfigApplyToGroup}
                        onChange={(e) => setEditConfigApplyToGroup(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-indigo-300 cursor-pointer"
                      />
                      <span>
                        Áp dụng cài đặt này đồng bộ cho tất cả các lớp trong đợt giao ({classesInGroup})
                      </span>
                    </label>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingConfigAssignment(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveEditConfig}
                className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-200 flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Lưu Cài Đặt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CẢNH BÁO XUNG ĐỘT GIAO BÀI ĐÃ TỒN TẠI */}
      {conflictAssignData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-amber-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl">
                  ⚠️
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white font-heading">
                    Cảnh Báo: Lớp Đã Được Giao Bài Tập Này
                  </h3>
                  <p className="text-xs text-amber-100 font-medium">Phát hiện bài giao đã tồn tại trong hệ thống</p>
                </div>
              </div>
              <button
                onClick={() => setConflictAssignData(null)}
                className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-xs">
              <div className="text-slate-700 font-medium leading-relaxed">
                Các lớp sau đã được giao bài tập này từ trước:
              </div>

              <div className="space-y-2">
                {conflictAssignData.conflicts.map((c, idx) => (
                  <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <span className="font-extrabold text-amber-950">{c.className}</span>
                    <span className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg font-black text-amber-800 shadow-2xs">
                      {c.submittedCount}/{c.totalCount} học sinh đã làm
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-slate-600 leading-relaxed">
                Để bảo vệ điểm số và không gây trùng bài trên màn hình học sinh, vui lòng chọn hướng xử lý:
              </p>

              {/* 3 Choices */}
              <div className="space-y-2.5 pt-1">
                <button
                  onClick={() => executeAssignStandard('update_existing', conflictAssignData.newTitle, conflictAssignData.selectedClasses)}
                  className="w-full p-3.5 rounded-xl border-2 border-indigo-600 bg-indigo-50/70 hover:bg-indigo-100 text-left transition-all cursor-pointer group flex items-start gap-3"
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <div className="font-extrabold text-indigo-950 group-hover:text-indigo-800">
                      Cập nhật cài đặt bài đã giao (Khuyến nghị)
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                      Cập nhật hạn nộp và cài đặt trực tiếp vào bài đã giao, bảo lưu 100% bài làm hiện có của học sinh.
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => executeAssignStandard('create_new_round', conflictAssignData.newTitle, conflictAssignData.selectedClasses)}
                  className="w-full p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-left transition-all cursor-pointer group flex items-start gap-3"
                >
                  <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <div className="font-extrabold text-slate-900 group-hover:text-indigo-900">
                      Giao thêm một lượt mới
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                      Tạo bài giao đợt mới độc lập (tự động gắn thêm "(Lượt 2)" vào tiêu đề).
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setConflictAssignData(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUÉT BÀI GIAO TRÙNG LẶP (DEBUG TOOL: ?debug=1) */}
      {isScanDuplicatesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-rose-900 via-rose-800 to-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl border border-white/20">
                  🔍
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white font-heading tracking-wide">
                    Quét Bài Giao Trùng Lặp & Xem Trước Phương Án Gộp
                  </h3>
                  <p className="text-xs text-rose-200 font-medium">
                    Chế độ xem trước (Dry-run preview) • An toàn tuyệt đối không ghi đè dữ liệu
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsScanDuplicatesModalOpen(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {(() => {
                // Nhóm bài tập theo chữ ký ngữ nghĩa (Tiêu đề + Môn + Khối)
                const groupsMap = new Map<string, HomeworkAssignment[]>();
                assignments.forEach((as) => {
                  const cleanTitle = (as.title || '')
                    .trim()
                    .toLowerCase()
                    .replace(/^bài tập tự luyện:\s*/i, '')
                    .replace(/^bài tập:\s*/i, '')
                    .replace(/\s+/g, ' ');
                  const key = `${cleanTitle}::${(as.grade || '').trim().toLowerCase()}::${(as.subject || '').trim().toLowerCase()}`;
                  if (!groupsMap.has(key)) groupsMap.set(key, []);
                  groupsMap.get(key)!.push(as);
                });

                const duplicateGroups = Array.from(groupsMap.entries()).filter(([_, list]) => list.length > 1);

                if (duplicateGroups.length === 0) {
                  return (
                    <div className="p-8 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-xl">
                        ✓
                      </div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Hệ thống bài tập hoàn toàn sạch sẽ!</h4>
                      <p className="text-xs text-slate-500">Không tìm thấy bài tập nào bị trùng lặp.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    <p className="text-xs text-slate-600 font-medium">
                      Tìm thấy <strong className="text-rose-600 font-bold">{duplicateGroups.length} nhóm bài tập</strong> có nhiều bản ghi song song trong Firestore:
                    </p>

                    {duplicateGroups.map(([groupKey, docList], gIdx) => {
                      const firstDoc = docList[0];
                      // Phân loại: bản ghi đơn lớp vs bản ghi đa lớp
                      const singleClassDocs = docList.filter((d) => d.targetClass && !d.targetClass.includes(','));
                      const multiClassDocs = docList.filter((d) => d.targetClass && d.targetClass.includes(','));

                      return (
                        <div key={gIdx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                            <div>
                              <h4 className="font-extrabold text-sm text-slate-900">{firstDoc.title}</h4>
                              <p className="text-[11px] text-slate-500 font-medium">
                                {firstDoc.grade} • Môn {firstDoc.subject} • Tổng cộng {docList.length} bản ghi Firestore
                              </p>
                            </div>
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-black text-[11px] rounded-lg border border-amber-300 w-fit">
                              Trùng lặp ({docList.length} docs)
                            </span>
                          </div>

                          {/* Table of documents */}
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3">Mã Document ID</th>
                                  <th className="py-2.5 px-3">Lớp Mục Tiêu</th>
                                  <th className="py-2.5 px-3 text-center">Số bài đã nộp</th>
                                  <th className="py-2.5 px-3 text-center">Real-time Leaderboard</th>
                                  <th className="py-2.5 px-3">Hạn nộp</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {docList.map((docItem) => {
                                  const subsCount = Array.isArray(docItem.submissions) ? docItem.submissions.length : (docItem.completedCount || 0);
                                  const isMulti = docItem.targetClass && docItem.targetClass.includes(',');

                                  return (
                                    <tr key={docItem.id} className={isMulti ? 'bg-amber-50/50' : ''}>
                                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 font-bold">
                                        {docItem.id}
                                      </td>
                                      <td className="py-2.5 px-3 font-bold text-slate-800">
                                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                                          isMulti ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                                        }`}>
                                          {docItem.targetClass || '-'}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-extrabold text-slate-900">
                                        {subsCount} bài
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-bold">
                                        {docItem.enableRealtimeLeaderboard ? (
                                          <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">Bật</span>
                                        ) : (
                                          <span className="text-slate-400 bg-slate-100 px-2 py-0.5 rounded text-[10px]">Tắt</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-600 font-medium font-mono text-[11px]">
                                        {formatDateTimeVN(docItem.dueDate, '-')}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Dry-run Merge Preview */}
                          <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
                            <div className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Phương án chuẩn hóa đề xuất (Dry-run preview):</span>
                            </div>
                            <ul className="list-disc pl-5 space-y-1 text-slate-700 text-[11px]">
                              {singleClassDocs.map((sc) => (
                                <li key={sc.id}>
                                  Giữ lại bản ghi chuẩn lớp <strong className="text-slate-900">{sc.targetClass}</strong>: mã <code className="text-indigo-800 font-mono">{sc.id}</code> ({Array.isArray(sc.submissions) ? sc.submissions.length : sc.completedCount || 0} bài nộp).
                                </li>
                              ))}
                              {multiClassDocs.map((mc) => (
                                <li key={mc.id} className="text-amber-800">
                                  Bản ghi lai ghép nhiều lớp <code className="font-mono">{mc.id}</code>: Đã được phía học sinh tự động khử trùng lặp (không hiển thị thừa cho học sinh).
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">
                ℹ️ Công cụ chỉ hiển thị bản xem trước chẩn đoán, không tự ý xóa dữ liệu máy chủ.
              </span>
              <button
                type="button"
                onClick={() => setIsScanDuplicatesModalOpen(false)}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        isOpen={!!deletingAssignment}
        onClose={() => setDeletingAssignment(null)}
        onConfirm={() => {
          if (deletingAssignment) {
            const perms = getContentPermissions(deletingAssignment, accessContext);
            if (!perms.canDelete) {
              showToast('⚠️ Bạn không có quyền xóa nội dung này!');
              setDeletingAssignment(null);
              return;
            }
            if (onDeleteAssignment) onDeleteAssignment(deletingAssignment.id);
            showToast(`🗑️ Đã xóa bài tập "${deletingAssignment.title}" khỏi danh sách!`);
            setDeletingAssignment(null);
          }
        }}
        title="Xác nhận xóa bài tập rèn luyện"
        itemType="bài tập rèn luyện"
        itemName={deletingAssignment?.title}
      />

      {/* MODAL: QUÉT VÀ KHÔI PHỤC BÀI TẬP LƯU NHẦM */}
      {isMisfiledScanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl border border-white/20">
                  🛠️
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white font-heading tracking-wide">
                    Quét & Khôi phục Bài tập lưu nhầm vào Đề kiểm tra
                  </h3>
                  <p className="text-xs text-indigo-200 font-medium">
                    Chuyển dữ liệu sang đúng cấu trúc, sao lưu backup & cộng bù Xu/EXP 1 lần duy nhất
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMisfiledScanModalOpen(false);
                  setMigrationReport(null);
                }}
                className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {migrationReport ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-2 text-xs text-emerald-950">
                    <div className="font-extrabold text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>Đã hoàn tất chuyển dữ liệu và cộng bù thành công!</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-slate-700">
                      <li><strong>(a) Hàm/file lưu nhầm trước đây:</strong> <code>StudentExamModule.tsx</code> executeSubmitExam & auto-submit ghi vào <code>exams/*/submissions</code> thay vì <code>assignments</code>.</li>
                      <li><strong>(b) Số bản ghi đã chuyển:</strong> {migrationReport.misfiledRecordsCount} bản ghi. Danh sách học sinh: {migrationReport.transferredList.map(t => `${t.studentName} (${t.studentCode}) - ${t.title}`).join(', ') || 'Không có'}.</li>
                      <li><strong>(c) Tổng số xu & EXP đã cộng bù:</strong> <span className="text-amber-700 font-bold">+{migrationReport.totalCoinsCompensated} Xu</span>, <span className="text-indigo-700 font-bold">+{migrationReport.totalExpCompensated} EXP</span>.</li>
                      <li><strong>(d) Các file đã đổi:</strong> <code>{migrationReport.filesModified.join(', ')}</code>.</li>
                    </ul>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setIsMisfiledScanModalOpen(false);
                        setMigrationReport(null);
                        window.location.reload();
                      }}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md"
                    >
                      Hoàn tất & Tải lại trang
                    </button>
                  </div>
                </div>
              ) : misfiledItems.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-xl font-bold">
                    ✓
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm">Không tìm thấy bài tập nào bị lưu nhầm!</h4>
                  <p className="text-xs text-slate-500">Tất cả các bản ghi nộp bài kiểm tra và bài tập hiện đang nằm đúng vị trí.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600 font-medium">
                      Tìm thấy <strong className="text-rose-600 font-bold">{misfiledItems.length} bản ghi</strong> bài tập đang nằm nhầm trong Đề kiểm tra:
                    </p>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMisfiledIds.size === misfiledItems.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMisfiledIds(new Set(misfiledItems.map(i => i.id)));
                          } else {
                            setSelectedMisfiledIds(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Chọn tất cả</span>
                    </label>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">Chọn</th>
                          <th className="py-2.5 px-3">Học sinh (Mã HS)</th>
                          <th className="py-2.5 px-3">Tên bài tập</th>
                          <th className="py-2.5 px-3 text-center">Điểm / Giờ nộp</th>
                          <th className="py-2.5 px-3">Nơi lưu nhầm hiện tại</th>
                          <th className="py-2.5 px-3">Nơi chuyển đến đích</th>
                          <th className="py-2.5 px-3 text-center">Thưởng bù (Xu/EXP)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {misfiledItems.map((item) => {
                          const isSelected = selectedMisfiledIds.has(item.id);
                          return (
                            <tr key={item.id} className={isSelected ? 'bg-indigo-50/40' : ''}>
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(selectedMisfiledIds);
                                    if (e.target.checked) next.add(item.id);
                                    else next.delete(item.id);
                                    setSelectedMisfiledIds(next);
                                  }}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-extrabold text-slate-900">{item.studentName}</div>
                                <div className="font-mono text-[10px] text-slate-500">{item.studentCode} • {item.className}</div>
                              </td>
                              <td className="py-2.5 px-3 font-bold text-indigo-950">
                                {item.title}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="font-extrabold text-emerald-700">{item.score}đ</span>
                                <div className="text-[10px] text-slate-400">{item.submittedTime}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[10px] text-rose-600 bg-rose-50/50 rounded">
                                exams/{item.currentIncorrectExamId}/submissions
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[10px] text-emerald-700 bg-emerald-50/50 rounded">
                                assignments/{item.targetAssignmentId}/submissions
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {item.alreadyRewarded ? (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold" title="Đã nhận thưởng trước đó, không cộng chồng">
                                    Đã nhận (0 xu)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded text-[10px] font-black">
                                    +{item.expectedCoins} Xu, +{item.expectedExp} EXP
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500 font-medium">
                      Đã chọn {selectedMisfiledIds.size} / {misfiledItems.length} bản ghi để chuyển.
                    </span>
                    <button
                      type="button"
                      disabled={selectedMisfiledIds.size === 0 || isMigrating}
                      onClick={async () => {
                        setIsMigrating(true);
                        try {
                          const itemsToMigrate = misfiledItems.filter(i => selectedMisfiledIds.has(i.id));
                          const report = await executeMisfiledAssignmentMigration(itemsToMigrate);
                          setMigrationReport(report);
                          showToast('✅ Khôi phục và chuyển dữ liệu bài tập thành công!');
                        } catch (err: any) {
                          showToast('⚠️ Lỗi khi chuyển dữ liệu: ' + (err?.message || String(err)));
                        } finally {
                          setIsMigrating(false);
                        }
                      }}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-xl text-xs cursor-pointer shadow-lg transition-all flex items-center gap-2"
                    >
                      {isMigrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{isMigrating ? 'Đang xử lý chuyển & sao lưu...' : 'Xác nhận chuyển dữ liệu & Cộng bù'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!migrationReport && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsMisfiledScanModalOpen(false)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Hủy bỏ
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
