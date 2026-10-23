import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  BookOpen,
  FileCheck2,
  ClipboardList,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  Clock,
  Award,
  BarChart3,
  Zap,
  Database,
  Gamepad2,
  CheckCircle2,
  ArrowRight,
  Coins,
  Bell,
  MessageSquare,
  Trophy,
  GraduationCap,
  Calendar,
  Star,
  Flame,
  ChevronRight,
  BookMarked
} from 'lucide-react';
import { ActivityLog, ActiveModule, UserRole, StudentRecord, HomeworkAssignment, ExamPaper, Lesson5EPlan, QuizziGameItem, GameItem } from '../../types';
import { getLocalCachedAssignments, isAssignmentDeleted, subscribeToAssignmentsFromFirestore } from '../../services/assignmentStorageService';
import { getLocalCachedExams, isExamDeleted, subscribeToExamsFromFirestore } from '../../services/examStorageService';
import { getStudentGameProfile, StudentGameProfile } from '../../services/studentGameStoreService';
import { calculateUnifiedHocBaData, formatScore, formatTotalScore } from '../../services/hocBaDataService';
import { useClassesList, getSubjectsForClassOrGrade, getSubjectDisplayConfig, getSubjectColorStyles } from '../../services/classStorageService';
import {
  getAllStudentsFromLocalStorage,
  getStudentClassInfo,
  getCurrentActiveAcademicYear
} from '../../services/studentStorageService';
import { useAcademicYear } from '../../contexts/AcademicYearContext';
import {
  AcademicYearWarningBanner,
  AcademicYearEmptyState
} from '../common/AcademicYearWarningBanner';
import { getTeachersFromLocalStorage, resolveTeacherNameByEmail } from '../../services/teacherStorageService';
import { getEffectiveStudentClassAndGrade, isTargetingStudent, isSubjectMatch } from '../../services/studentSessionService';
import {
  subscribeAssignedELearningLessons,
  getLocalCachedAssignedELearning,
  AssignedELearningLesson
} from '../../services/elearningAssignmentService';
import {
  subscribeToQuizziGamesFromFirestore,
  getLocalCachedQuizziGames,
  subscribeToGamesFromFirestore,
  getLocalCachedGames
} from '../../services/gameStorageService';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export interface DashboardModuleProps {
  onNavigate?: (module: ActiveModule) => void;
  userRole?: UserRole;
  currentUserName?: string;
  activityLogs?: ActivityLog[];
  logs?: ActivityLog[];
  stats?: {
    totalStudents?: number;
    totalLessons?: number;
    totalExams?: number;
    totalAssignments?: number;
    pendingAssignments?: number;
    totalQuestions?: number;
    averageScore?: number;
  };
  currentStudent?: StudentRecord | null;
  currentClass?: string;
  assignments?: HomeworkAssignment[];
  exams?: ExamPaper[];
  lessons?: Lesson5EPlan[];
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  onNavigate,
  userRole = 'teacher',
  currentUserName,
  activityLogs,
  logs,
  stats,
  currentStudent,
  currentClass = 'Lớp 3A',
  assignments = [],
  exams = [],
  lessons = []
}) => {
  const actualLogs = activityLogs || logs || [];

  // Academic Year & Semester selection from AcademicYearContext
  const {
    selectedAcademicYear,
    setSelectedAcademicYear,
    selectedSemester,
    activeAcademicYear,
    availableYears,
    hasYearEnrollments
  } = useAcademicYear();

  // Real-time dynamic count states
  const [realStudentCount, setRealStudentCount] = useState<number | null>(() => {
    try {
      const localDb = getAllStudentsFromLocalStorage();
      const seenIds = new Set<string>();
      Object.values(localDb).forEach(list => {
        if (Array.isArray(list)) {
          list.forEach(st => {
            const idKey = st.sddcn || st.code || st.id || st.fullName || st.name;
            if (idKey) seenIds.add(idKey);
          });
        }
      });
      return seenIds.size > 0 ? seenIds.size : null;
    } catch {
      return null;
    }
  });

  const [realClassCount, setRealClassCount] = useState<number | null>(null);
  const [teachersCount, setTeachersCount] = useState<number | null>(() => {
    try {
      const list = getTeachersFromLocalStorage();
      return list.length;
    } catch {
      return null;
    }
  });

  // Calculate local student count synchronously from LocalStorage
  const refreshLocalStudentCount = () => {
    try {
      const localDb = getAllStudentsFromLocalStorage();
      const seenIds = new Set<string>();
      Object.values(localDb).forEach(list => {
        if (Array.isArray(list)) {
          list.forEach(st => {
            const idKey = st.sddcn || st.code || st.id || st.fullName || st.name;
            if (idKey) seenIds.add(idKey);
          });
        }
      });
      if (seenIds.size > 0) {
        setRealStudentCount(seenIds.size);
      }
    } catch (e) {
      console.warn('Error refreshing local student count:', e);
    }
  };

  // Fetch count asynchronously from Firestore
  const fetchCountsFromFirestore = async (isMountedRef: { current: boolean }) => {
    try {
      const classSnap = await getDocs(collection(db, 'classes'));
      if (isMountedRef.current) {
        const uniqueClasses = new Set<string>();
        classSnap.forEach(d => {
          const raw = (d.data().name || d.id || '').replace(/^lớp\s*/i, '').trim().toUpperCase();
          if (raw) uniqueClasses.add(raw);
        });
        setRealClassCount(uniqueClasses.size > 0 ? uniqueClasses.size : classSnap.size);
      }

      const rosterSnap = await getDocs(collection(db, 'class_rosters'));
      const classStudentMap = new Map<string, number>();
      rosterSnap.forEach((doc) => {
        const normKey = doc.id.trim().toUpperCase();
        const data = doc.data();
        if (Array.isArray(data.students)) {
          classStudentMap.set(normKey, data.students.length);
        }
      });
      let total = 0;
      classStudentMap.forEach((count) => { total += count; });
      if (isMountedRef.current && total > 0) {
        setRealStudentCount(total);
      }
    } catch (e) {
      console.warn('Error loading real student/class counts from Firestore:', e);
    }
  };

  // Setup Real-time Event Listeners and Initial Load
  useEffect(() => {
    const isMountedRef = { current: true };

    // Initial load
    refreshLocalStudentCount();
    fetchCountsFromFirestore(isMountedRef);

    // 1. Real-time Student Event Handler
    const handleStudentDataUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      // Immediate local count calculation
      refreshLocalStudentCount();
      // Re-fetch from remote Firestore
      fetchCountsFromFirestore(isMountedRef);
    };

    // 2. Real-time Teacher Event Handler
    const handleTeacherDataUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.teachers && Array.isArray(customEvent.detail.teachers)) {
        setTeachersCount(customEvent.detail.teachers.length);
      } else {
        const list = getTeachersFromLocalStorage();
        setTeachersCount(list.length);
      }
    };

    // 3. Real-time Classes Event Handler
    const handleClassesDataUpdated = () => {
      fetchCountsFromFirestore(isMountedRef);
    };

    // Register listeners
    window.addEventListener('student-data-updated', handleStudentDataUpdated);
    window.addEventListener('eduplay_students_updated', handleStudentDataUpdated);
    window.addEventListener('teacher-data-updated', handleTeacherDataUpdated);
    window.addEventListener('eduplay_teachers_updated', handleTeacherDataUpdated);
    window.addEventListener('classes-updated', handleClassesDataUpdated);
    window.addEventListener('eduplay_classes_updated', handleClassesDataUpdated);

    // Clean up all listeners on component unmount
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('student-data-updated', handleStudentDataUpdated);
      window.removeEventListener('eduplay_students_updated', handleStudentDataUpdated);
      window.removeEventListener('teacher-data-updated', handleTeacherDataUpdated);
      window.removeEventListener('eduplay_teachers_updated', handleTeacherDataUpdated);
      window.removeEventListener('classes-updated', handleClassesDataUpdated);
      window.removeEventListener('eduplay_classes_updated', handleClassesDataUpdated);
    };
  }, []);

  const totalStudentsCount = realStudentCount !== null ? realStudentCount : (stats?.totalStudents || 0);
  const totalLessonsCount = lessons.length || stats?.totalLessons || 0;
  const totalExamsCount = exams.length || stats?.totalExams || 0;
  const totalAssignmentsCount = assignments.length || stats?.totalAssignments || 0;

  // Greeting by time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'Chào buổi sáng';
    if (hour >= 11 && hour < 13) return 'Chào buổi trưa';
    if (hour >= 13 && hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  // Dynamic Teacher / Admin Display Name Resolution
  const rawTeacherName = (
    currentUserName ||
    (typeof window !== 'undefined' ? localStorage.getItem('eduplay_teacher_name') : null) ||
    ''
  ).trim();

  const cleanTeacherName = rawTeacherName
    .replace(/\s*\(admin\)/i, '')
    .replace(/\s*\(giáo viên\)/i, '')
    .trim();

  const getFormattedTeacherDisplayName = (name: string): string => {
    if (!name) return 'Thầy/Cô Giáo';

    // If name already starts with title prefix
    if (name.startsWith('Cô ') || name.startsWith('Thầy ') || name.startsWith('Thầy/Cô ')) {
      return name;
    }

    const lower = name.toLowerCase();

    // Gender detection markers
    const isFemale = /\b(thị|cô|mai|lan|hoa|ngọc|thu|hương|hà|trang|phương|linh|thủ|diễm|dung|vân|thủy|yến|nhung|hạnh|oanh|loan|hằng|cúc|đào|mơ|xuyên|liên|tuyết|nguyệt|hồng|bích|hiền|quỳnh|trâm|thi|nhi|mi|thảo|ngân)\b/i.test(lower);
    const isMale = /\b(văn|đặng|thầy|đô|quân|hùng|long|nam|hoàng|dũng|tuấn|minh|thắng|phong|hải|đạt|kiên|bảo|nguyên|việt|sơn|lâm|thành|trung|đức|khoa)\b/i.test(lower);

    if (isFemale && !isMale) {
      return `Cô ${name}`;
    }
    if (isMale && !isFemale) {
      return `Thầy ${name}`;
    }
    if (isFemale) {
      return `Cô ${name}`;
    }

    return `Thầy/Cô ${name}`;
  };

  const teacherName = getFormattedTeacherDisplayName(cleanTeacherName);

  // --------------------------------------------------------------------------
  // STUDENT SPECIFIC DATA INITIALIZATION
  // --------------------------------------------------------------------------
  const sessionData = useMemo(() => getEffectiveStudentClassAndGrade(currentStudent?.className || currentClass), [currentStudent, currentClass]);
  const studentName = currentStudent?.name || currentStudent?.fullName || currentUserName || sessionData.studentName || 'Hoàng Bảo An';
  const studentClassName = currentStudent?.className || sessionData.studentClass || 'Lớp 3A';
  const studentGrade = sessionData.studentGrade || 'Khối 3';
  const studentId = currentStudent?.id || currentStudent?.code || sessionData.studentId || 'st-3a-01';
  const currentStudentId = currentStudent?.id || currentStudent?.code || studentId || 'HS-3A-01';

  // Student Game & Coin Profile
  const [gameProfile, setGameProfile] = useState<StudentGameProfile>(() =>
    getStudentGameProfile(studentId, studentName)
  );

  useEffect(() => {
    setGameProfile(getStudentGameProfile(studentId, studentName));
  }, [studentId, studentName]);

  // Listen to profile updates (coins, EXP, level) across the app
  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      if (e.detail?.profile) {
        setGameProfile(e.detail.profile);
      } else {
        setGameProfile(getStudentGameProfile(studentId, studentName));
      }
    };
    window.addEventListener('eduplay_game_profile_updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('eduplay_game_profile_updated', handleProfileUpdate);
    };
  }, [studentId, studentName]);

  // Real-time assigned E-Learning lessons & games for student class targeting
  const [assignedLessonsList, setAssignedLessonsList] = useState<AssignedELearningLesson[]>(() => {
    try {
      return getLocalCachedAssignedELearning();
    } catch {
      return [];
    }
  });

  const [quizziGames, setQuizziGames] = useState<QuizziGameItem[]>(() => {
    try {
      return getLocalCachedQuizziGames();
    } catch {
      return [];
    }
  });

  const [roomGames, setRoomGames] = useState<GameItem[]>(() => {
    try {
      return getLocalCachedGames();
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const unsubELearning = subscribeAssignedELearningLessons((items) => {
      setAssignedLessonsList(items);
    });
    const unsubQuizzi = subscribeToQuizziGamesFromFirestore((items) => {
      setQuizziGames(items);
    });
    const unsubGames = subscribeToGamesFromFirestore((items) => {
      setRoomGames(items);
    });
    return () => {
      unsubELearning();
      unsubQuizzi();
      unsubGames();
    };
  }, []);

  // Read student submission IDs and progress maps from localStorage
  const [completedAssignmentIds, setCompletedAssignmentIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`eduplay_student_submissions_${currentStudent?.code || studentId || 'u-4'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((s: any) => s.assignment?.id || s.id).filter(Boolean));
        }
      }
    } catch {}
    return new Set();
  });

  const [completedExamIds, setCompletedExamIds] = useState<Set<string>>(() => {
    try {
      const keyId = currentStudent?.code || studentId || 'u-4';
      const saved = localStorage.getItem(`eduplay_student_exam_subs_${keyId}`) ||
        localStorage.getItem(`eduplay_student_exam_submissions_${keyId}`) ||
        localStorage.getItem('eduplay_exam_results');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((s: any) => s.examId || s.id).filter(Boolean));
        }
      }
    } catch {}
    return new Set();
  });

  const [studentLessonProgressMap, setStudentLessonProgressMap] = useState<Record<string, { status: string; progressPct: number }>>(() => {
    try {
      const saved = localStorage.getItem(`eduplay_student_elearning_progress_${currentStudent?.code || studentId || 'u-4'}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [completedSubmissionsCount, setCompletedSubmissionsCount] = useState<number>(() => completedAssignmentIds.size);

  useEffect(() => {
    const syncStudentProgress = () => {
      try {
        const keyId = currentStudent?.code || studentId || 'u-4';
        const savedSub = localStorage.getItem(`eduplay_student_submissions_${keyId}`);
        if (savedSub) {
          const parsed = JSON.parse(savedSub);
          if (Array.isArray(parsed)) {
            setCompletedAssignmentIds(new Set(parsed.map((s: any) => s.assignment?.id || s.id).filter(Boolean)));
            setCompletedSubmissionsCount(parsed.length);
          }
        }
        const savedExam = localStorage.getItem(`eduplay_student_exam_subs_${keyId}`) ||
          localStorage.getItem(`eduplay_student_exam_submissions_${keyId}`) ||
          localStorage.getItem('eduplay_exam_results');
        if (savedExam) {
          const parsed = JSON.parse(savedExam);
          if (Array.isArray(parsed)) {
            setCompletedExamIds(new Set(parsed.map((s: any) => s.examId || s.id).filter(Boolean)));
          }
        }
        const savedLes = localStorage.getItem(`eduplay_student_elearning_progress_${keyId}`);
        if (savedLes) {
          setStudentLessonProgressMap(JSON.parse(savedLes));
        }
      } catch {}
    };

    syncStudentProgress();
    window.addEventListener('eduplay_student_submissions_updated', syncStudentProgress);
    window.addEventListener('storage', syncStudentProgress);
    return () => {
      window.removeEventListener('eduplay_student_submissions_updated', syncStudentProgress);
      window.removeEventListener('storage', syncStudentProgress);
    };
  }, [currentStudent, studentId]);

  // Real-time synchronization of assignments in DashboardModule
  const [liveAssignments, setLiveAssignments] = useState<HomeworkAssignment[]>(() => {
    try {
      const cached = getLocalCachedAssignments();
      if (Array.isArray(cached)) {
        return cached.filter(as => !isAssignmentDeleted?.(as?.id) && !isAssignmentDeleted?.(as?.originalAssignmentId));
      }
    } catch {}
    return (assignments || []).filter(as => !isAssignmentDeleted?.(as?.id) && !isAssignmentDeleted?.(as?.originalAssignmentId));
  });

  useEffect(() => {
    const clean = (assignments || []).filter(as => !isAssignmentDeleted?.(as?.id) && !isAssignmentDeleted?.(as?.originalAssignmentId));
    setLiveAssignments(clean);
  }, [assignments]);

  useEffect(() => {
    const unsub = subscribeToAssignmentsFromFirestore((updated) => {
      const clean = (updated || []).filter(as => !isAssignmentDeleted?.(as?.id) && !isAssignmentDeleted?.(as?.originalAssignmentId));
      setLiveAssignments(clean);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const syncAssignments = () => {
      try {
        const cached = getLocalCachedAssignments();
        if (Array.isArray(cached)) {
          const clean = cached.filter(as => !isAssignmentDeleted?.(as?.id) && !isAssignmentDeleted?.(as?.originalAssignmentId));
          setLiveAssignments(clean);
        }
      } catch {}
    };
    syncAssignments();
    window.addEventListener('eduplay_assignments_updated', syncAssignments);
    window.addEventListener('eduplay_assignment_deleted', syncAssignments);
    window.addEventListener('storage', syncAssignments);
    return () => {
      window.removeEventListener('eduplay_assignments_updated', syncAssignments);
      window.removeEventListener('eduplay_assignment_deleted', syncAssignments);
      window.removeEventListener('storage', syncAssignments);
    };
  }, []);

  // Real-time synchronization of exams in DashboardModule
  const [liveExams, setLiveExams] = useState<ExamPaper[]>(() => {
    try {
      const cached = getLocalCachedExams();
      if (Array.isArray(cached)) {
        return cached.filter(ex => !isExamDeleted?.(ex?.id) && !isExamDeleted?.(ex?.originalExamId));
      }
    } catch {}
    return (exams || []).filter(ex => !isExamDeleted?.(ex?.id) && !isExamDeleted?.(ex?.originalExamId));
  });

  useEffect(() => {
    const clean = (exams || []).filter(ex => !isExamDeleted?.(ex?.id) && !isExamDeleted?.(ex?.originalExamId));
    setLiveExams(clean);
  }, [exams]);

  useEffect(() => {
    const unsub = subscribeToExamsFromFirestore((updated) => {
      const clean = (updated || []).filter(ex => !isExamDeleted?.(ex?.id) && !isExamDeleted?.(ex?.originalExamId));
      setLiveExams(clean);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const syncExams = () => {
      try {
        const cached = getLocalCachedExams();
        if (Array.isArray(cached)) {
          const clean = cached.filter(ex => !isExamDeleted?.(ex?.id) && !isExamDeleted?.(ex?.originalExamId));
          setLiveExams(clean);
        }
      } catch {}
    };
    syncExams();
    window.addEventListener('eduplay_exams_updated', syncExams);
    window.addEventListener('storage', syncExams);
    return () => {
      window.removeEventListener('eduplay_exams_updated', syncExams);
      window.removeEventListener('storage', syncExams);
    };
  }, []);

  const regularAssignments = useMemo(() => {
    const eff = getEffectiveStudentClassAndGrade(studentClassName);
    const effClass = studentClassName || eff?.studentClass || 'Lớp 3D';
    const effGrade = eff?.studentGrade || 'Khối 3';

    const filtered = (liveAssignments || []).filter((as) => {
      if (!as || !as.id) return false;
      if (isAssignmentDeleted?.(as.id)) {
        return false;
      }
      const itemType = ((as as any)?.type || (as as any)?.category || (as as any)?.contentType || '').toLowerCase();
      if (itemType === 'elearning' || itemType === 'bai_giang' || itemType === 'lesson_5e' || as.id.startsWith('elearn-')) {
        return false;
      }
      if (!isTargetingStudent(as?.targetClass, as?.grade, effClass, effGrade, {
        targetClasses: (as as any)?.targetClasses,
        classId: (as as any)?.classId,
        classes: (as as any)?.classes
      })) {
        return false;
      }
      const isOverdue = as?.dueDate && as.dueDate.toLowerCase() !== 'hôm nay' && !isNaN(Date.parse(as.dueDate)) && new Date(as.dueDate) < new Date();
      return !isOverdue;
    });

    const seenIds = new Set<string>();
    const cleanList: HomeworkAssignment[] = [];
    filtered.forEach(as => {
      if (!as?.id || seenIds.has(as.id)) return;
      seenIds.add(as.id);
      cleanList.push(as);
    });
    return cleanList;
  }, [liveAssignments, studentClassName]);

  const todoAssignmentsCount = Math.max(0, regularAssignments.length - completedSubmissionsCount);
  
  const todoExamsCount = useMemo(() => {
    const rawClass = (studentClassName || 'Lớp 3A').toLowerCase().replace(/\s+/g, '');
    const filtered = (liveExams || []).filter((ex) => {
      if (!ex || !ex.id) return false;
      if (isExamDeleted(ex.id) || (ex.originalExamId && isExamDeleted(ex.originalExamId))) {
        return false;
      }
      if (ex.targetClass) {
        const targetCls = ex.targetClass.trim().toLowerCase().replace(/\s+/g, '');
        if (
          targetCls !== '' &&
          targetCls !== 'all' &&
          !targetCls.includes('tấtcả') &&
          targetCls !== rawClass &&
          !targetCls.includes(rawClass) &&
          !rawClass.includes(targetCls)
        ) {
          return false;
        }
      }
      const isOverdue = ex.endTime && ex.endTime.toLowerCase() !== 'hôm nay' && !isNaN(Date.parse(ex.endTime)) && new Date(ex.endTime) < new Date();
      return !isOverdue;
    });

    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const cleanList: ExamPaper[] = [];
    filtered.forEach(ex => {
      if (seenIds.has(ex.id)) return;
      const cleanTitle = (ex.title || '').trim().toLowerCase().replace(/^đề kiểm tra:\s*/i, '').replace(/\s+/g, ' ');
      const clsKey = (ex.targetClass || '').trim().toLowerCase().replace(/\s+/g, '');
      const semanticKey = `${cleanTitle}__${ex.subject || ''}__${ex.grade || ''}__${clsKey}`;
      if (seenKeys.has(semanticKey)) return;
      seenIds.add(ex.id);
      seenKeys.add(semanticKey);
      cleanList.push(ex);
    });
    return cleanList.length;
  }, [exams, studentClassName]);

  // Unified Real Student Học Bạ Summary (Calculated strictly from real graded submissions)
  const hocBaSummary = useMemo(() => {
    const activeYear = selectedAcademicYear || getCurrentActiveAcademicYear();
    const classInfo = getStudentClassInfo(currentStudentId, activeYear);
    const resolvedClass = classInfo?.className || studentClassName;
    const defaultExamFilter = selectedSemester === 'Học kỳ II' ? 'giua_ki_2' : 'giua_ki_1';
    return calculateUnifiedHocBaData({
      studentId: currentStudentId,
      sddcn: currentStudentId,
      studentName,
      className: resolvedClass,
      academicYear: activeYear,
      examFilter: defaultExamFilter,
      exams,
      assignments,
      lessons
    });
  }, [currentStudentId, studentName, studentClassName, selectedAcademicYear, selectedSemester, exams, assignments, lessons]);

  const hasRealGrades = hocBaSummary.hasData && hocBaSummary.gpa !== null;
  const currentGPA = hasRealGrades ? formatTotalScore(hocBaSummary.gpa) : null;
  const currentCoins = gameProfile.coins;
  const currentExp = gameProfile.currentExp;
  const currentLevel = gameProfile.level;

  // --------------------------------------------------------------------------
  // 1. 4 STUDENT PERSONAL STATS CARDS
  // --------------------------------------------------------------------------
  const studentStatCards = [
    {
      id: 'elearning',
      title: 'Bài Giảng Chưa Học',
      value: `${(assignedLessonsList || []).filter(les => {
        const prog = studentLessonProgressMap[les.id];
        return !prog || prog.progressPct < 100;
      }).length} bài`,
      subtext: 'E-Learning chuẩn 5E',
      icon: BookOpen,
      iconBg: 'bg-blue-100 text-blue-600',
      badge: (assignedLessonsList || []).filter(les => {
        const prog = studentLessonProgressMap[les.id];
        return !prog || prog.progressPct < 100;
      }).length > 0 ? 'Khám phá ngay ✨' : 'Đã học hết tất cả 📚',
      badgeColor: (assignedLessonsList || []).filter(les => {
        const prog = studentLessonProgressMap[les.id];
        return !prog || prog.progressPct < 100;
      }).length > 0 ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200',
      module: 'lesson_5e' as ActiveModule,
      borderHover: 'hover:border-blue-400'
    },
    {
      id: 'exam',
      title: 'Đề Kiểm Tra Sắp Tới',
      value: `${todoExamsCount} đề`,
      subtext: 'Phòng khảo thí trực tuyến',
      icon: FileCheck2,
      iconBg: 'bg-red-100 text-red-600',
      badge: todoExamsCount > 0 ? 'Thời hạn 3 ngày 🎯' : 'Chưa có đề mới 📋',
      badgeColor: 'text-red-600 bg-red-50 border-red-200',
      module: 'exam_management' as ActiveModule,
      borderHover: 'hover:border-red-400'
    },
    {
      id: 'assignment',
      title: 'Bài Tập Cần Làm',
      value: `${todoAssignmentsCount} bài`,
      subtext: 'Phiếu rèn luyện đang mở',
      icon: ClipboardList,
      iconBg: 'bg-orange-100 text-orange-600',
      badge: todoAssignmentsCount > 0 ? 'Ưu tiên nộp sớm ⚡' : 'Đã hoàn thành hết ✨',
      badgeColor: todoAssignmentsCount > 0 ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200',
      module: 'assignment' as ActiveModule,
      borderHover: 'hover:border-orange-400'
    },
    {
      id: 'games',
      title: 'Đấu Trường Đang Chờ',
      value: `${(quizziGames || []).length} trò`,
      subtext: 'Thử thách trí tuệ',
      icon: Gamepad2,
      iconBg: 'bg-purple-100 text-purple-600',
      badge: (quizziGames || []).length > 0 ? 'Thử ngay nào 🎮' : 'Đã khám phá hết 🏆',
      badgeColor: (quizziGames || []).length > 0 ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200',
      module: 'interactive_games' as ActiveModule,
      borderHover: 'hover:border-purple-400'
    }
  ];

  // --------------------------------------------------------------------------
  // 2. TEACHER STAT CARDS
  // --------------------------------------------------------------------------
  const teacherStatCards = [
    {
      title: 'Tổng Sĩ Số Học Sinh',
      value: hasYearEnrollments ? totalStudentsCount : 0,
      subtext: !hasYearEnrollments
        ? `Năm học ${selectedAcademicYear} (Chưa phân lớp)`
        : (realClassCount !== null ? `${realClassCount} lớp học (Khối 1 - Khối 5)` : 'Trường TH Quang Hưng'),
      icon: Users,
      iconBg: 'bg-[#EEF2FF] text-[#4338CA]',
      change: !hasYearEnrollments
        ? 'Chưa có học sinh nào'
        : (totalStudentsCount > 0 ? 'Dữ liệu thực tế từ Firestore' : 'Chưa có học sinh'),
      module: 'user_management' as ActiveModule
    },
    {
      title: 'Bài Giảng 5E Đã Soạn',
      value: totalLessonsCount,
      subtext: totalLessonsCount > 0 ? 'Đã tối ưu hóa với Gemini AI' : 'Chưa có bài giảng 5E',
      icon: BookOpen,
      iconBg: 'bg-[#EEF2FF] text-[#4338CA]',
      change: totalLessonsCount > 0 ? `${totalLessonsCount} giáo án khả dụng` : 'Chưa soạn bài giảng',
      module: 'lesson_5e' as ActiveModule
    },
    {
      title: 'Bộ Đề Kiểm Tra Ma Trận',
      value: totalExamsCount,
      subtext: totalExamsCount > 0 ? 'Sẵn sàng xuất file Word/PDF' : 'Chưa có đề kiểm tra',
      icon: FileCheck2,
      iconBg: 'bg-[#EEF2FF] text-[#4338CA]',
      change: totalExamsCount > 0 ? `${totalExamsCount} đề thi trong kho` : 'Chưa tạo đề thi',
      module: 'exam_management' as ActiveModule
    },
    {
      title: 'Bài Tập Về Nhà Đã Giao',
      value: totalAssignmentsCount,
      subtext: totalAssignmentsCount > 0 ? 'Phiếu rèn luyện đang mở' : 'Chưa có bài tập về nhà',
      icon: ClipboardList,
      iconBg: 'bg-[#EEF2FF] text-[#4338CA]',
      change: totalAssignmentsCount > 0 ? `${totalAssignmentsCount} phiếu bài tập` : 'Chưa giao bài tập',
      module: 'assignment' as ActiveModule
    }
  ];

  // --------------------------------------------------------------------------
  // 3. TIẾN ĐỘ HỌC TẬP CỦA EM (MÔN TIỂU HỌC ĐỒNG BỘ THEO CẤU HÌNH THỰC TẾ CỦA KHỐI/LỚP)
  // --------------------------------------------------------------------------
  const { classes: liveClassesList } = useClassesList();

  // Lấy danh sách môn học thực tế được cấu hình cho Khối / Lớp của học sinh
  const studentConfiguredSubjectNames = useMemo(() => {
    return getSubjectsForClassOrGrade(studentClassName, liveClassesList);
  }, [studentClassName, liveClassesList]);

  // Các bài tập được giao cho đúng lớp/khối của học sinh
  const targetedStudentAssignments = useMemo(() => {
    return (assignments || []).filter(as => {
      if (!as || !as.id) return false;
      return isTargetingStudent(as.targetClass, as.grade, studentClassName, studentGrade);
    });
  }, [assignments, studentClassName, studentGrade]);

  // Các đề thi/khảo thí được giao cho đúng lớp/khối của học sinh
  const targetedStudentExams = useMemo(() => {
    return (exams || []).filter(ex => {
      if (!ex || !ex.id) return false;
      return isTargetingStudent(ex.targetClass, ex.grade, studentClassName, studentGrade);
    });
  }, [exams, studentClassName, studentGrade]);

  // Các bài giảng E-Learning / 5E được giao cho đúng lớp/khối của học sinh
  const targetedStudentELearning = useMemo(() => {
    const list: Array<{ id: string; title: string; subject: string; topic?: string }> = [];
    (assignedLessonsList || []).forEach(item => {
      if (isTargetingStudent(item.targetClass, (item as any).grade, studentClassName, studentGrade)) {
        list.push({
          id: item.id,
          title: item.title || (item as any).lessonTitle || '',
          subject: item.subject || '',
          topic: (item as any).topic || ''
        });
      }
    });
    (lessons || []).forEach(l => {
      if (isTargetingStudent((l as any).targetClass || (l as any).classInfo, l.grade, studentClassName, studentGrade)) {
        if (!list.some(existing => existing.id === l.id || (existing.title && existing.title === l.title))) {
          list.push({
            id: l.id,
            title: l.title,
            subject: l.subject,
            topic: l.topic
          });
        }
      }
    });
    return list;
  }, [assignedLessonsList, lessons, studentClassName, studentGrade]);

  // Các trò chơi tương tác / Quizzi được giao cho đúng lớp/khối của học sinh
  const targetedStudentGames = useMemo(() => {
    const list: Array<{ id: string | number; title: string; subject: string }> = [];
    (quizziGames || []).forEach(g => {
      if (isTargetingStudent(g.classInfo, g.grade, studentClassName, studentGrade)) {
        list.push({
          id: g.id,
          title: g.title,
          subject: g.subject || g.subjectLabel || ''
        });
      }
    });
    (roomGames || []).forEach(g => {
      if (isTargetingStudent(g.classInfo, g.grade, studentClassName, studentGrade)) {
        list.push({
          id: g.id,
          title: g.title,
          subject: g.subject || ''
        });
      }
    });
    return list;
  }, [quizziGames, roomGames, studentClassName, studentGrade]);

  // TIẾN ĐỘ HỌC TẬP GÓC NHÌN HỌC SINH:
  // CHỈ hiển thị những môn học THỰC SỰ có bài giao (assignments/exams/elearning/games) cho lớp của học sinh.
  // Ẩn hoàn toàn các môn chưa từng được giao bài.
  const studentSubjectProgress = useMemo(() => {
    const results: Array<{
      name: string;
      topic: string;
      percentage: number;
      completedLessons: number;
      totalLessons: number;
      gradient: string;
      badge: string;
    }> = [];

    // Tổng hợp tất cả các môn học tiềm năng (từ danh sách môn cấu hình + các môn từ bài đã giao)
    const candidateSubjects = [...studentConfiguredSubjectNames];
    [...targetedStudentAssignments, ...targetedStudentExams, ...targetedStudentELearning, ...targetedStudentGames].forEach(item => {
      if (item.subject && !candidateSubjects.some(s => isSubjectMatch(item.subject, s))) {
        candidateSubjects.push(item.subject);
      }
    });

    candidateSubjects.forEach(subjName => {
      const display = getSubjectDisplayConfig(subjName);
      const matchingAssignments = targetedStudentAssignments.filter(a => isSubjectMatch(a.subject, subjName));
      const matchingExams = targetedStudentExams.filter(e => isSubjectMatch(e.subject, subjName));
      const matchingLessons = targetedStudentELearning.filter(l => isSubjectMatch(l.subject, subjName));
      const matchingGames = targetedStudentGames.filter(g => isSubjectMatch(g.subject, subjName));

      const totalCount = matchingAssignments.length + matchingExams.length + matchingLessons.length + matchingGames.length;

      // ĐIỀU KIỆN QUAN TRỌNG: ẨN MÔN CHƯA CÓ BÀI GIAO (totalCount === 0) Ở GIAO DIỆN HỌC SINH
      if (totalCount === 0) {
        return;
      }

      // Đếm số bài đã nộp / hoàn thành
      let completedCount = 0;
      matchingAssignments.forEach(as => {
        const hasSub = (as.submissions || []).some(s => s.studentId === currentStudentId) ||
          completedAssignmentIds.has(as.id);
        if (hasSub) completedCount++;
      });
      matchingExams.forEach(ex => {
        if (completedExamIds.has(ex.id)) completedCount++;
      });
      matchingLessons.forEach(l => {
        const prog = studentLessonProgressMap[l.id];
        if (prog?.status === 'completed' || (prog?.progressPct && prog.progressPct >= 100)) {
          completedCount++;
        }
      });

      const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      const activeTopic = matchingLessons[0]?.title ||
        matchingAssignments[0]?.title ||
        matchingExams[0]?.title ||
        matchingGames[0]?.title ||
        display.defaultTopic;

      const badge = percentage === 100
        ? 'Hoàn thành 🏆'
        : (completedCount > 0 ? 'Đang học 📚' : 'Mới giao ⚡');

      results.push({
        name: display.name,
        topic: activeTopic,
        percentage,
        completedLessons: completedCount,
        totalLessons: totalCount,
        gradient: display.gradient,
        badge
      });
    });

    return results;
  }, [
    studentConfiguredSubjectNames,
    targetedStudentAssignments,
    targetedStudentExams,
    targetedStudentELearning,
    targetedStudentGames,
    currentStudentId,
    completedAssignmentIds,
    completedExamIds,
    studentLessonProgressMap
  ]);

  // --------------------------------------------------------------------------
  // 4. THÔNG BÁO CỦA EM (THÔNG BÁO CÁ NHÂN HỌC SINH)
  // --------------------------------------------------------------------------
  const studentNotifications = React.useMemo(() => {
    const list = [];
    if (regularAssignments.length > 0) {
      const firstAs = regularAssignments[0];
      list.push({
        id: 'notif-as-1',
        title: 'Phiếu bài tập mới được giao',
        content: `Bài tập: "${firstAs.title}". Hạn nộp: ${firstAs.dueDate || 'Sớm nhất'}.`,
        module: 'assignment' as ActiveModule,
        moduleLabel: 'Bài tập',
        timestamp: 'Hôm nay',
        icon: ClipboardList,
        iconColor: 'bg-orange-100 text-orange-600',
        unread: true
      });
    }
    if (exams.length > 0) {
      const firstEx = exams[0];
      list.push({
        id: 'notif-ex-1',
        title: 'Phòng khảo thí trực tuyến đã mở',
        content: `Đề thi: "${firstEx.title}" (${firstEx.durationMinutes || 45} phút) sẵn sàng làm bài.`,
        module: 'exam_management' as ActiveModule,
        moduleLabel: 'Đề thi',
        timestamp: 'Mới nhất',
        icon: FileCheck2,
        iconColor: 'bg-blue-100 text-blue-600',
        unread: true
      });
    }
    if (lessons.length > 0) {
      const firstLes = lessons[0];
      list.push({
        id: 'notif-les-1',
        title: 'Bài giảng 5E mới sẵn sàng',
        content: `Bài học tương tác: "${firstLes.title}" đã được phát hành.`,
        module: 'lesson_5e' as ActiveModule,
        moduleLabel: 'Bài giảng 5E',
        timestamp: 'Gần đây',
        icon: Sparkles,
        iconColor: 'bg-purple-100 text-purple-600',
        unread: false
      });
    }
    if (completedSubmissionsCount > 0) {
      list.push({
        id: 'notif-sub-1',
        title: 'Lịch sử nộp bài tập',
        content: `Em đã hoàn thành ${completedSubmissionsCount} bài tập rèn luyện. Tiếp tục phát huy nhé!`,
        module: 'assignment' as ActiveModule,
        moduleLabel: 'Bài tập',
        timestamp: 'Gần đây',
        icon: MessageSquare,
        iconColor: 'bg-emerald-100 text-emerald-600',
        unread: false
      });
    }
    if (list.length === 0) {
      list.push({
        id: 'notif-empty',
        title: 'Thông báo học tập',
        content: 'Chưa có thông báo mới từ giáo viên. Em hãy sẵn sàng cho các bài học tiếp theo nhé!',
        module: 'assignment' as ActiveModule,
        moduleLabel: 'Học tập',
        timestamp: 'Hiện tại',
        icon: Bell,
        iconColor: 'bg-slate-100 text-slate-600',
        unread: false
      });
    }
    return list;
  }, [regularAssignments, exams, lessons, completedSubmissionsCount]);

  // Read notification state & dynamic teacher reminders generator
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(() => {
    try {
      const keyId = currentStudent?.code || studentId || 'u-4';
      const saved = localStorage.getItem(`eduplay_read_teacher_notifs_${keyId}`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });

  const handleMarkAsRead = (id: string) => {
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        const keyId = currentStudent?.code || studentId || 'u-4';
        localStorage.setItem(`eduplay_read_teacher_notifs_${keyId}`, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const handleMarkAllAsRead = () => {
    const allIds = teacherReminders.map(r => r.id);
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      allIds.forEach(id => next.add(id));
      try {
        const keyId = currentStudent?.code || studentId || 'u-4';
        localStorage.setItem(`eduplay_read_teacher_notifs_${keyId}`, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const teacherReminders = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'exam' | 'assignment' | 'elearning' | 'game';
      typeLabel: string;
      title: string;
      subject: string;
      teacherName: string;
      badgeText: string;
      badgeBg: string;
      timeText: string;
      module: ActiveModule;
      actionText: string;
      actionBg: string;
      isRead: boolean;
      rawItem?: any;
    }> = [];

    const rawClass = (studentClassName || 'Lớp 3A').toLowerCase().replace(/\s+/g, '');

    // 1. Pending Exams
    (exams || []).forEach((ex) => {
      if (!ex || !ex.id) return;
      if (!isTargetingStudent(ex.targetClass, ex.grade, studentClassName, studentGrade)) {
        return;
      }
      const isDone = completedExamIds.has(ex.id);
      const isOverdue = ex.endTime && ex.endTime.toLowerCase() !== 'hôm nay' && !isNaN(Date.parse(ex.endTime)) && new Date(ex.endTime) < new Date();
      if (!isDone && !isOverdue) {
        const notifId = `rem-ex-${ex.id}`;
        list.push({
          id: notifId,
          type: 'exam',
          typeLabel: 'Đề kiểm tra',
          title: ex.title || 'Bài kiểm tra trực tuyến',
          subject: ex.subject || 'Môn học',
          teacherName: ex.createdBy || 'Giáo viên bộ môn',
          badgeText: 'Mới 🎯',
          badgeBg: 'bg-[#34D399]/20 text-[#059669] border-[#34D399]',
          timeText: `${ex.durationMinutes || 15} phút • Hạn: ${ex.endTime || 'Hôm nay'}`,
          module: 'exam_management',
          actionText: 'Vào thi ngay ⚡',
          actionBg: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
          isRead: readNotifIds.has(notifId),
          rawItem: ex
        });
      }
    });

    // 2. Pending Assignments
    (regularAssignments || []).forEach((as) => {
      if (!as || !as.id) return;
      // Note: regularAssignments already filtered by isTargetingStudent in useMemo above
      const isDone = completedAssignmentIds.has(as.id);
      const isOverdue = as.dueDate && as.dueDate.toLowerCase() !== 'hôm nay' && !isNaN(Date.parse(as.dueDate)) && new Date(as.dueDate) < new Date();
      if (!isDone && !isOverdue) {
        const notifId = `rem-as-${as.id}`;
        list.push({
          id: notifId,
          type: 'assignment',
          typeLabel: 'Bài tập về nhà',
          title: as.title || 'Bài tập rèn luyện',
          subject: as.subject || 'Môn học',
          teacherName: as.createdBy || 'Cô Trang Anh',
          badgeText: 'Cần nộp 📝',
          badgeBg: 'bg-[#FBBF24]/20 text-[#D97706] border-[#FBBF24]',
          timeText: `Hạn nộp: ${as.dueDate || '23:59 hôm nay'}`,
          module: 'assignment',
          actionText: 'Làm bài tập 📝',
          actionBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
          isRead: readNotifIds.has(notifId),
          rawItem: as
        });
      }
    });

    // 3. E-Learning Assigned Lessons
    (assignedLessonsList || []).forEach((les) => {
      if (!les || !les.id) return;
      if (!isTargetingStudent(les.targetClass, (les as any).grade, studentClassName, studentGrade)) {
        return;
      }
      const prog = studentLessonProgressMap[les.id];
      if (!prog || prog.progressPct < 100) {
        const notifId = `rem-el-${les.id}`;
        list.push({
          id: notifId,
          type: 'elearning',
          typeLabel: 'Bài giảng 5E',
          title: les.title || 'Bài giảng E-Learning tương tác',
          subject: les.subject || 'Môn học',
          teacherName: (les as any).assignedByTeacherName || (les as any).createdBy || 'Giáo viên bộ môn',
          badgeText: 'Bài học 💡',
          badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          timeText: `Chuẩn 5E • Tiến độ: ${prog?.progressPct || 0}%`,
          module: 'lesson_5e',
          actionText: 'Học bài ngay 🚀',
          actionBg: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20',
          isRead: readNotifIds.has(notifId),
          rawItem: les
        });
      }
    });

    // 4. Games / Quizzes
    (quizziGames || []).slice(0, 2).forEach((g) => {
      if (!g || !g.id) return;
      const notifId = `rem-gm-${g.id}`;
      const qCount = (g as any).questions?.length || (g as any).questionsCount || 10;
      list.push({
        id: notifId,
        type: 'game',
        typeLabel: 'Đấu trường',
        title: g.title || 'Trò chơi trắc nghiệm',
        subject: g.subject || 'Tin học',
        teacherName: 'Hệ thống AI',
        badgeText: 'Thử thách 🎮',
        badgeBg: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
        timeText: `${qCount} câu hỏi • Tích lũy Xu`,
        module: 'interactive_games',
        actionText: 'Chơi ngay 🏆',
        actionBg: 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white shadow-fuchsia-600/20',
        isRead: readNotifIds.has(notifId),
        rawItem: g
      });
    });

    return list;
  }, [exams, completedExamIds, regularAssignments, completedAssignmentIds, assignedLessonsList, studentLessonProgressMap, quizziGames, readNotifIds, studentClassName]);

  const unreadRemindersCount = useMemo(() => {
    return teacherReminders.filter(r => !r.isRead).length;
  }, [teacherReminders]);

  // --------------------------------------------------------------------------
  // 5. TEACHER SUBJECT PROGRESS & LOGS
  // --------------------------------------------------------------------------
  const primarySubjectsList = [
    { name: 'Toán', scope: 'Khối 1 - Khối 5' },
    { name: 'Tiếng Việt', scope: 'Khối 1 - Khối 5' },
    { name: 'Đạo Đức', scope: 'Khối 1 - Khối 5' },
    { name: 'Tự Nhiên & Xã Hội', scope: 'Khối 1 - Khối 3' },
    { name: 'Khoa Học', scope: 'Khối 4 - Khối 5' },
    { name: 'Lịch Sử & Địa Lý', scope: 'Khối 4 - Khối 5' },
    { name: 'Tiếng Anh', scope: 'Khối 3 - Khối 5' },
    { name: 'Tin Học', scope: 'Khối 3 - Khối 5' },
    { name: 'Công Nghệ', scope: 'Khối 3 - Khối 5' },
    { name: 'Âm Nhạc & Mĩ Thuật', scope: 'Khối 1 - Khối 5' },
    { name: 'Hoạt Động Trải Nghiệm', scope: 'Khối 1 - Khối 5' }
  ];

  const teacherSubjectProgress = primarySubjectsList.map(subj => {
    const matchingLessons = lessons.filter(l => isSubjectMatch(l.subject, subj.name));
    const total = matchingLessons.length;
    const hasData = total > 0;
    return {
      name: subj.name,
      scope: subj.scope,
      totalLessons: total,
      percentage: hasData ? 100 : null,
      hasData
    };
  });

  // --------------------------------------------------------------------------
  // 6. QUICK ACCESS CARDS
  // --------------------------------------------------------------------------
  const studentQuickAccessCards = [
    {
      id: 'hoc_ba_so' as ActiveModule,
      title: 'Học Bạ Số Của Em',
      description: 'Theo dõi bảng điểm, nhận xét từ thầy cô và phân tích năng lực học tập thông minh.',
      icon: BookOpen,
      badge: 'MỚI 🌟',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      bgColor: 'bg-emerald-100 text-emerald-700',
      borderColor: 'border-emerald-200 hover:border-emerald-500 bg-emerald-50/40',
      textColor: 'group-hover:text-emerald-700'
    },
    {
      id: 'assignment' as ActiveModule,
      title: 'Bài Tập Của Tôi',
      description: 'Xem phiếu bài tập được giao, hoàn thành bài làm và tích lũy điểm Xu thưởng mỗi ngày.',
      icon: ClipboardList,
      badge: 'Nộp bài 📝',
      badgeColor: 'bg-orange-100 text-orange-800',
      bgColor: 'bg-orange-100 text-orange-700',
      borderColor: 'border-orange-200 hover:border-orange-500 bg-orange-50/40',
      textColor: 'group-hover:text-orange-700'
    },
    {
      id: 'exam_management' as ActiveModule,
      title: 'Đề Kiểm Tra & Khảo Thí',
      description: 'Tham gia các bài kiểm tra định kỳ trực tuyến, kiểm tra độ chính xác và xem giải thích chi tiết.',
      icon: FileCheck2,
      badge: 'Khảo thí 🎯',
      badgeColor: 'bg-blue-100 text-blue-800',
      bgColor: 'bg-blue-100 text-blue-700',
      borderColor: 'border-blue-200 hover:border-blue-500 bg-blue-50/40',
      textColor: 'group-hover:text-blue-700'
    },
    {
      id: 'interactive_games' as ActiveModule,
      title: 'Đấu Trường Tri Thức',
      description: 'Thử sức với Rung chuông vàng, trắc nghiệm tốc độ, đua top bảng vàng và đổi quà.',
      icon: Gamepad2,
      badge: 'HOT 🔥',
      badgeColor: 'bg-fuchsia-100 text-fuchsia-800',
      bgColor: 'bg-fuchsia-100 text-fuchsia-700',
      borderColor: 'border-fuchsia-200 hover:border-fuchsia-500 bg-fuchsia-50/40',
      textColor: 'group-hover:text-fuchsia-700'
    },
    {
      id: 'lesson_5e' as ActiveModule,
      title: 'Bài Giảng E-Learning',
      description: 'Khám phá video bài giảng tương tác chuẩn 5E sinh động, tự học dễ hiểu và nắm chắc kiến thức.',
      icon: Sparkles,
      badge: 'Chuẩn 5E 💡',
      badgeColor: 'bg-amber-100 text-amber-800',
      bgColor: 'bg-amber-100 text-amber-700',
      borderColor: 'border-amber-200 hover:border-amber-500 bg-amber-50/40',
      textColor: 'group-hover:text-amber-700'
    }
  ];

  const teacherQuickAccessCards = [
    {
      id: 'exam_management' as ActiveModule,
      title: 'Tạo & Quản Lý Đề Kiểm Tra',
      description: 'Khởi tạo ma trận đề, trộn câu hỏi ngẫu nhiên và xuất file Word/PDF chuyên nghiệp.',
      icon: FileCheck2,
      bgColor: 'bg-indigo-50 text-[#4338CA]',
      borderColor: 'border-indigo-100 hover:border-[#4338CA]'
    },
    {
      id: 'lesson_5e' as ActiveModule,
      title: 'Bài Giảng 5E Tương Tác',
      description: 'Soạn thảo và quản lý giáo án 5E chuẩn 4 bước sư phạm tích hợp Gemini AI.',
      icon: Sparkles,
      bgColor: 'bg-purple-50 text-purple-700',
      borderColor: 'border-purple-100 hover:border-purple-500'
    },
    {
      id: 'question_bank' as ActiveModule,
      title: 'Ngân Hàng Câu Hỏi',
      description: 'Quản lý kho câu hỏi theo 4 mức độ nhận thức chuẩn Bộ GD&ĐT, hỗ trợ import Excel.',
      icon: Database,
      bgColor: 'bg-blue-50 text-blue-700',
      borderColor: 'border-blue-100 hover:border-blue-500'
    },
    {
      id: 'interactive_games' as ActiveModule,
      title: 'Trò Chơi Học Tập AI',
      description: 'Tổ chức mini-game Rung chuông vàng và Flashcards sinh động kích thích hứng thú học tập.',
      icon: Gamepad2,
      bgColor: 'bg-amber-50 text-amber-700',
      borderColor: 'border-amber-100 hover:border-amber-500'
    }
  ];

  const quickAccessCards = userRole === 'student' ? studentQuickAccessCards : teacherQuickAccessCards;

  // Điều hướng màn hình mặc định cho học sinh: khi vừa đăng nhập sẽ lập tức trỏ thẳng vào 'assignment' ("Nhiệm vụ học tập")
  useEffect(() => {
    if (userRole === 'student' && typeof window !== 'undefined') {
      let hasExplicitDashboard = false;
      try {
        hasExplicitDashboard = sessionStorage.getItem('eduplay_student_explicit_dashboard') === 'true';
      } catch {}
      if (!hasExplicitDashboard) {
        onNavigate?.('assignment');
      }
    }
  }, [userRole, onNavigate]);

  // Tránh nhấp nháy màn hình nếu học sinh vừa đăng nhập và cần trỏ thẳng vào Nhiệm Vụ Học Tập
  if (userRole === 'student' && typeof window !== 'undefined') {
    let hasExplicitDashboard = false;
    try {
      hasExplicitDashboard = sessionStorage.getItem('eduplay_student_explicit_dashboard') === 'true';
    } catch {}
    if (!hasExplicitDashboard) {
      return null;
    }
  }

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* BANNER CẢNH BÁO NỔI BẬT NẾU CHỌN NĂM HỌC CHƯA CÓ DỮ LIỆU */}
      <AcademicYearWarningBanner
        academicYear={selectedAcademicYear}
        onGoToPromotion={() => onNavigate?.('user_management')}
      />

      {/* ========================================================================= */}
      {/* 1. WELCOME BANNER (3D Modern Stage) */}
      {/* ========================================================================= */}
      {userRole === 'student' ? (
        <div className="bg-gradient-to-r from-[#60A5FA] to-[#A78BFA] rounded-[28px] p-7 sm:p-9 text-white shadow-2xl relative overflow-hidden border border-sky-300/40 min-h-[180px] flex items-center">
          {/* Background Ambient Glows & Sparkles Decor */}
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-200 via-pink-400 to-transparent pointer-events-none" />
          <div className="absolute -right-8 -top-8 w-64 h-64 bg-pink-400/25 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 -bottom-10 w-56 h-56 bg-purple-400/20 rounded-full blur-2xl pointer-events-none" />
          
          {/* Subtle background star sparkles */}
          <div className="absolute top-4 right-1/4 text-amber-200/30 text-lg pointer-events-none select-none">✦</div>
          <div className="absolute bottom-4 left-1/4 text-pink-200/30 text-base pointer-events-none select-none">✧</div>
          <div className="absolute top-1/2 right-1/3 text-amber-300/20 text-sm pointer-events-none select-none">★</div>
          
          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 w-full">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur-md border border-white/30 shadow-xs">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Góc Học Tập Của {studentName} ({studentClassName}) ✨</span>
              </div>
              
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-heading tracking-tight drop-shadow-sm flex items-center gap-3">
                <span>{getGreeting()}, {studentName}!</span>
                <span className="text-2xl sm:text-3xl animate-bounce">👋</span>
              </h2>
              <p className="text-xs sm:text-sm text-purple-100 leading-relaxed font-medium">
                Hôm nay em muốn khám phá điều gì? Làm bài tập về nhà, tham gia đấu trường đối kháng, xem bài giảng 5E sinh động hay kiểm tra học bạ số của mình nhé!
              </p>
            </div>

            {/* Right Mascot 3D Stage */}
            <div className="hidden sm:flex items-center justify-center relative shrink-0">
              <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-3xl bg-gradient-to-tr from-white/10 via-white/25 to-pink-300/30 backdrop-blur-md border border-white/40 shadow-2xl flex items-center justify-center relative transform hover:scale-105 transition-transform duration-300 group">
                <div className="relative flex flex-col items-center justify-center">
                  <span className="text-4xl lg:text-5xl filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.25)] animate-pulse">
                    🚀
                  </span>
                  
                  {/* Floating Micro Badges */}
                  <span className="absolute -top-3.5 -right-3.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 font-black text-[9px] shadow-md border border-amber-100 tracking-wider">
                    LV.{currentLevel} 🌟
                  </span>
                  
                  <span className="absolute -bottom-3 px-2 py-0.5 rounded-full bg-purple-900/90 text-amber-300 font-black text-[9px] shadow-md border border-purple-400/50 backdrop-blur-xs whitespace-nowrap">
                    Học Sinh Chăm Chỉ 🥇
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#4338CA] rounded-3xl p-6 sm:p-9 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none" />
          
          <div className="relative z-10 max-w-3xl space-y-3.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-indigo-100 text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Dạy & Học Số PK Trực Khang - Nền tảng Giáo dục 4.0 Tích hợp AI</span>
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight">
              {getGreeting()}, {teacherName}!
            </h2>
            <p className="text-sm text-indigo-100 leading-relaxed max-w-2xl font-normal">
              Hệ thống quản lý dạy và học tập trung cho Trường Tiểu học Trực Khang. Khởi tạo ngân hàng câu hỏi thông minh với Gemini AI, tự động trộn đề kiểm tra, tổ chức trò chơi tương tác và theo dõi học bạ số.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                onClick={() => onNavigate?.('question_bank')}
                className="px-6 py-3.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-sm rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 duration-200 shrink-0"
              >
                <Sparkles className="w-5 h-5 text-amber-200 animate-pulse" />
                <span>Tạo Câu Hỏi Với AI</span>
              </button>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-indigo-100 font-medium pt-1 sm:pt-0">
                <span className="text-indigo-200/80 font-normal">Khám phá nhanh:</span>
                <button
                  onClick={() => onNavigate?.('exam_management')}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors backdrop-blur-xs"
                >
                  Quản lý đề thi
                </button>
                <button
                  onClick={() => onNavigate?.('interactive_games')}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors backdrop-blur-xs"
                >
                  Trò chơi học tập
                </button>
                <button
                  onClick={() => onNavigate?.('lesson_5e')}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors backdrop-blur-xs"
                >
                  Bài giảng
                </button>
                <button
                  onClick={() => onNavigate?.('hoc_ba_so')}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors backdrop-blur-xs"
                >
                  Học bạ số
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. 4 METRIC / KPI CARDS (Personalized for Student, School-wide for Teacher) */}
      {/* ========================================================================= */}
      {userRole === 'student' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {studentStatCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.id}
                onClick={() => onNavigate?.(stat.module)}
                className={`bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md ${stat.borderHover} transition-all duration-200 group cursor-pointer flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {stat.title}
                    </span>
                    <div className={`p-2.5 rounded-xl ${stat.iconBg} shadow-xs group-hover:scale-105 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="mt-3">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 font-heading tracking-tight block">
                      {stat.value}
                    </span>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${stat.badgeColor}`}>
                        {stat.badge}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{stat.subtext}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 group-hover:text-indigo-600 transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {teacherStatCards.map((stat, idx) => {
            const Icon = stat.icon;
            const isZero = stat.value === 0 || stat.value === undefined || stat.value === null;
            return (
              <div
                key={idx}
                onClick={() => onNavigate?.(stat.module)}
                className="bg-white rounded-2xl p-5 border border-[#F3F4F6] shadow-xs hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {stat.title}
                    </span>
                    <div className={`p-2.5 rounded-xl ${stat.iconBg}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline gap-2">
                    {isZero ? (
                      <span className="text-sm font-bold text-[#4338CA] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        Bắt đầu ngay <ArrowRight className="w-4 h-4" />
                      </span>
                    ) : (
                      <>
                        <span className="text-3xl font-extrabold text-slate-900 font-heading">
                          {stat.value}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                          <TrendingUp className="w-3 h-3" /> {stat.change}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
                  {stat.subtext}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* KHU VỰC TRẠNG THÁI RỖNG RÕ RÀNG NẾU NĂM HỌC CHƯA CÓ DỮ LIỆU */}
      {!hasYearEnrollments && (
        <AcademicYearEmptyState
          academicYear={selectedAcademicYear}
          onGoToPromotion={() => onNavigate?.('user_management')}
        />
      )}

      {/* ========================================================================= */}
      {/* 2.5. TEACHER REMINDERS & NOTIFICATIONS SMART MODULE (For Student) */}
      {/* ========================================================================= */}
      {userRole === 'student' && (
        <div className="bg-[#F0F7FF] rounded-3xl p-6 shadow-xl border border-sky-100 space-y-4 relative overflow-hidden">
          {/* Ambient background glows */}
          <div className="absolute right-0 top-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/4 bottom-0 w-60 h-60 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shadow-inner shrink-0">
                <Bell className="w-5 h-5 animate-bounce text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-[#1E293B] font-heading tracking-tight">
                    Lời Nhắc & Thông Báo Từ Giáo Viên
                  </h3>
                  {unreadRemindersCount > 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[11px] shadow-sm animate-pulse">
                      {unreadRemindersCount} mới
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px] border border-emerald-500/30">
                      Đã hoàn thành hết
                    </span>
                  )}
                </div>
                <p className="text-xs text-indigo-200 mt-0.5 font-medium">
                  Nhiệm vụ học tập, đề kiểm tra & bài giảng mới do Thầy/Cô giao cho <strong>{studentName}</strong> ({studentClassName})
                </p>
              </div>
            </div>

            {teacherReminders.length > 0 && unreadRemindersCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-indigo-100 text-xs font-bold transition-all border border-white/15 cursor-pointer self-start sm:self-auto shrink-0 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Đánh dấu đã xem tất cả</span>
              </button>
            )}
          </div>

          {/* Notification Cards List */}
          <div className="relative z-10">
            {teacherReminders.length === 0 ? (
              <div className="py-8 px-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xl">
                  🎉
                </div>
                <h4 className="text-sm font-bold text-white">
                  Tuyệt vời! Em chưa có lời nhắc mới từ Giáo viên.
                </h4>
                <p className="text-xs text-indigo-200 max-w-md mx-auto leading-relaxed">
                  Tất cả các bài tập và đề kiểm tra đã được hoàn thành. Em hãy tự do luyện tập thêm ở Đấu Trường Tri Thức nhé!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {teacherReminders.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between space-y-3 group ${
                      item.isRead
                        ? 'bg-white/5 border-white/10 opacity-75 hover:opacity-100'
                        : 'bg-white/10 border-white/20 hover:border-amber-400/60 shadow-lg backdrop-blur-md'
                    }`}
                  >
                    {/* Top row: Badge & Mark Read toggle */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${item.badgeBg}`}>
                        {item.badgeText}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-indigo-200 font-semibold">
                          {item.teacherName}
                        </span>
                        {!item.isRead ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(item.id);
                            }}
                            title="Đánh dấu đã xem"
                            className="p-1 rounded-lg bg-white/10 hover:bg-emerald-500 hover:text-white text-indigo-200 transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-md border border-emerald-500/30">
                            Đã xem
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & info */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                        [{item.typeLabel}] • {item.subject}
                      </span>
                      <h4 className="text-sm font-black text-[#1E293B] group-hover:text-orange-600 transition-colors line-clamp-2 leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-[#475569] font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#FB923C]" />
                        <span>{item.timeText}</span>
                      </p>
                    </div>

                    {/* Action button */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[10px] text-indigo-300 font-semibold">
                        Giao cho {studentClassName}
                      </span>
                      <button
                        onClick={() => {
                          handleMarkAsRead(item.id);
                          if (item.type === 'exam' && item.rawItem) {
                            onNavigate?.('exam_management');
                          } else {
                            onNavigate?.(item.module);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-xl font-extrabold text-xs transition-all shadow-md cursor-pointer flex items-center gap-1 active:scale-95 bg-[#FB923C] hover:bg-[#F97316] text-white"
                      >
                        <span>{item.actionText}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* 3. MAIN SECTION: (Student: Tiến Độ Của Em + Thông Báo Của Em) / (Teacher) */}
      {/* ========================================================================= */}
      {userRole === 'student' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Left Col: TIẾN ĐỘ HỌC TẬP CỦA EM */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5 flex flex-col justify-between col-span-2">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2 font-heading">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                    <span>Tiến Độ Học Tập Của Em</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Theo dõi mức độ hoàn thành bài giảng 5E và bài luyện tập của <strong>{studentName}</strong> ({studentClassName})
                  </p>
                </div>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200 shrink-0">
                  {selectedSemester || 'Học kỳ I'} • {selectedAcademicYear || '2026-2027'}
                </span>
              </div>

              {studentSubjectProgress.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {studentSubjectProgress.map((sub, idx) => {
                    const subjColor = getSubjectColorStyles(sub.name);
                    return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl bg-white border ${subjColor.cardBorder} hover:shadow-xs transition-all space-y-2 relative overflow-hidden`}
                    >
                      <div className={`absolute top-0 left-0 right-0 h-1 ${subjColor.topBarBg}`} />
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{subjColor.emoji}</span>
                          <span className="font-extrabold text-sm text-slate-800">{sub.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${subjColor.badgeClass} shadow-2xs`}>
                            {sub.badge}
                          </span>
                        </div>
                        <span className={`font-black text-sm ${subjColor.text} font-heading`}>
                          {sub.percentage}%
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 leading-snug line-clamp-1">
                        {sub.topic}
                      </p>

                      <div className="space-y-1">
                        <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden p-0.5">
                          <div
                            className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${sub.gradient}`}
                            style={{ width: `${sub.percentage}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                          <span>Đã học {sub.completedLessons}/{sub.totalLessons} bài</span>
                          <span className={sub.percentage === 100 ? 'text-emerald-600 font-bold' : (sub.percentage > 0 ? 'text-indigo-600 font-bold' : 'text-amber-600 font-bold')}>
                            {sub.percentage === 100 ? 'Hoàn thành tốt' : (sub.percentage > 0 ? 'Đang tiến bộ' : 'Chưa hoàn thành')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              ) : (
                <div className="py-8 px-4 rounded-2xl bg-slate-50/80 border border-dashed border-slate-200 text-center space-y-2.5">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                    <Sparkles className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Thầy/Cô chưa giao bài môn nào, em quay lại sau nhé!
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Khi thầy cô giao bài tập, bài giảng 5E hoặc đề kiểm tra cho {studentClassName}, tiến độ các môn học sẽ tự động xuất hiện tại đây.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                💡 Lời khuyên: Học đều đặn mỗi ngày để duy trì chuỗi chăm chỉ!
              </span>
              <button
                onClick={() => onNavigate?.('lesson_5e')}
                className="font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer shrink-0 ml-2"
              >
                Vào học ngay <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          
        </div>
      ) : (
        /* TEACHER / ADMIN MAIN SECTION */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Teacher Subject Completion Progress */}
            <div className="bg-white rounded-2xl p-6 border border-[#F3F4F6] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 font-heading">
                    <BarChart3 className="w-5 h-5 text-[#4338CA]" /> Tiến Độ Hoàn Thành Chương Trình Học
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Thống kê theo dõi bài giảng 5E và ngân hàng câu hỏi môn học
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                {teacherSubjectProgress.map((sub, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{sub.name}</span>
                        <span className="text-[10px] text-slate-400 font-medium">({sub.scope})</span>
                      </div>
                      {sub.hasData ? (
                        <span className="font-bold text-indigo-600">100% ({sub.totalLessons} bài)</span>
                      ) : (
                        <span className="font-medium text-slate-400 bg-slate-100 text-[10px] px-2 py-0.5 rounded-full">
                          Chưa có dữ liệu
                        </span>
                      )}
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          sub.hasData
                            ? 'bg-gradient-to-r from-[#4338CA] to-[#F97316]'
                            : 'bg-slate-200'
                        }`}
                        style={{ width: `${sub.hasData ? 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Teacher Academic Grade Distribution Chart */}
            <div className="bg-white rounded-2xl p-6 border border-[#F3F4F6] shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 font-heading">
                <Award className="w-5 h-5 text-amber-500" /> Phân Phối Bảng Điểm Học Sinh Toàn Khối
              </h3>

              <div className="p-6 rounded-xl bg-slate-50/80 border border-dashed border-slate-200 text-center space-y-1.5">
                <span className="text-2xl">📊</span>
                <h4 className="text-xs font-bold text-slate-700">Chưa có dữ liệu bảng điểm</h4>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Dữ liệu phân phối kết quả đánh giá (Giỏi, Khá, Trung bình) sẽ tự động tổng hợp khi giáo viên cập nhật sổ điểm định kỳ tại Học Bạ Số.
                </p>
              </div>
            </div>
          </div>

          {/* Teacher Activity Stream */}
          <div className="bg-white rounded-2xl p-6 border border-[#F3F4F6] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 font-heading">
                  <Clock className="w-5 h-5 text-[#4338CA]" /> Hoạt Động Mới Nhất
                </h3>
                <span className="text-[11px] font-semibold text-slate-400">
                  Cập nhật trực tiếp
                </span>
              </div>

              {actualLogs.length > 0 ? (
                <div className="space-y-3.5">
                  {actualLogs.map((log: any, idx: number) => {
                    const ItemIcon = log.icon || Clock;
                    return (
                      <div
                        key={log.id || idx}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-all space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <ItemIcon className="w-3.5 h-3.5 text-[#4338CA]" />
                            {log.user}
                          </span>
                          <span className="text-[10px] text-slate-400">{log.timestamp || log.time}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-snug pl-5">
                          {log.action}
                        </p>
                        <div className="pt-1 pl-5 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#EEF2FF] text-[#4338CA]">
                            {log.module}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Chưa có hoạt động mới</p>
                  <p className="text-[11px] text-slate-400">Nhật ký hệ thống sẽ hiển thị ở đây khi có thao tác mới.</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <button
                onClick={() => onNavigate?.('lesson_5e')}
                className="text-xs font-bold text-[#4338CA] hover:text-[#3730A3] flex items-center justify-center gap-1 w-full cursor-pointer"
              >
                Khám phá tất cả tính năng <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
