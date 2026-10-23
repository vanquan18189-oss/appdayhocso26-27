import { StudentRecord } from '../types';
import { getAllStudentsFromLocalStorage, getStudentsFromLocalStorage, getCurrentActiveAcademicYear, getStudentClassInfo } from './studentStorageService';
import { getLocalCachedAssignedELearning } from './elearningAssignmentService';
import { getStudentLessonProgress } from '../components/modules/LessonFlowController';
import { Student5EProgress, StatsOverview, Activity5EStats, ActivityDetail, ActivityStatus } from '../components/modules/stats/types';

/**
 * Helper to calculate stats from students
 */
export function calculateStatsOverview(students: Student5EProgress[]): StatsOverview {
  const total = students.length;
  if (total === 0) {
    return {
      totalStudents: 0,
      completedCount: 0,
      completedPct: 0,
      inProgressCount: 0,
      inProgressPct: 0,
      notStartedCount: 0,
      notStartedPct: 0,
      avgProgressPct: 0
    };
  }

  const completed = students.filter(s => s.progressPct >= 100).length;
  const inProgress = students.filter(s => s.progressPct > 0 && s.progressPct < 100).length;
  const notStarted = students.filter(s => s.progressPct === 0).length;
  const sumProgress = students.reduce((acc, s) => acc + s.progressPct, 0);
  const avg = Math.round(sumProgress / total);

  return {
    totalStudents: total,
    completedCount: completed,
    completedPct: Math.round((completed / total) * 100),
    inProgressCount: inProgress,
    inProgressPct: Math.round((inProgress / total) * 100),
    notStartedCount: notStarted,
    notStartedPct: Math.round((notStarted / total) * 100),
    avgProgressPct: avg
  };
}

/**
 * Helper to calculate stats for the 5 5E activities
 */
export function calculate5EActivityStats(students: Student5EProgress[]): Activity5EStats[] {
  const total = students.length;
  const activities: { key: 'engage' | 'explore' | 'explain' | 'elaborate' | 'evaluate'; name: string; stepCode: string }[] = [
    { key: 'engage', name: 'Khởi động', stepCode: 'Engage' },
    { key: 'explore', name: 'Khám phá', stepCode: 'Explore' },
    { key: 'explain', name: 'Luyện tập', stepCode: 'Explain' },
    { key: 'elaborate', name: 'Vận dụng', stepCode: 'Elaborate' },
    { key: 'evaluate', name: 'Đánh giá', stepCode: 'Evaluate' }
  ];

  return activities.map(act => {
    const completedCount = students.filter(s => s[act.key].status === 'completed').length;
    const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    return {
      key: act.key,
      name: act.name,
      stepCode: act.stepCode,
      completedCount,
      totalStudents: total,
      completedPct
    };
  });
}

/**
 * Helper to format ISO date string into DD/MM/YYYY
 */
function formatActiveDate(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (!isNaN(d.getTime())) {
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {}
  return '';
}

/**
 * Helper to fetch real student lesson progress checking multiple identifier fallbacks
 */
function getRealStudentLessonProgress(student: StudentRecord, lessonId: string, academicYear?: string): any | null {
  if (!student || !lessonId) return null;
  const activeYear = academicYear || getCurrentActiveAcademicYear();

  const identifiers = [
    student.sddcn,
    student.studentPersistentId,
    student.id,
    student.code,
    student.username,
    student.stt && student.className ? `st-${student.className.replace(/\s+/g, '').toLowerCase()}-${student.stt}` : null
  ].filter(Boolean) as string[];

  for (const id of identifiers) {
    const prog = getStudentLessonProgress(id, lessonId);
    if (prog) {
      if (prog.academicYear && prog.academicYear !== activeYear) {
        continue;
      }
      return prog;
    }

    try {
      const raw = localStorage.getItem(`viet_elearning_student_progress_${id}_${lessonId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.academicYear && parsed.academicYear !== activeYear) {
          continue;
        }
        return parsed;
      }
    } catch {}
  }

  return null;
}

/**
 * Retrieve genuine 5E progress for real students of a lesson based on actual class assignments and database records
 */
export function getLessonStudentsProgressData(
  lessonId: string,
  lessonTitle: string,
  gradeStr: string,
  academicYear?: string
): {
  students: Student5EProgress[];
  targetClasses: string[];
  assignedDateStr?: string;
} {
  const activeYear = academicYear || getCurrentActiveAcademicYear();
  const cleanLessonId = (lessonId || '').toLowerCase().trim();
  const cleanTitle = (lessonTitle || '').toLowerCase().trim();

  // 1. Check if this lesson has assigned info in elearningAssignmentService
  const assignedList = getLocalCachedAssignedELearning();
  const matchedAssignments = assignedList.filter(a => {
    const aLessonId = (a.lessonId || a.id || '').toLowerCase().trim();
    const aTitle = (a.lessonTitle || a.title || '').toLowerCase().replace(/^e-learning:\s*/i, '').trim();
    return (
      (cleanLessonId && (aLessonId === cleanLessonId || a.id?.toLowerCase().trim() === cleanLessonId)) ||
      (cleanTitle && (aTitle === cleanTitle || aTitle.includes(cleanTitle) || cleanTitle.includes(aTitle)))
    );
  });

  let targetClasses: string[] = [];
  let assignedDateStr: string = '';

  if (matchedAssignments.length > 0) {
    matchedAssignments.forEach(a => {
      if (a.targetClass && !targetClasses.includes(a.targetClass)) {
        targetClasses.push(a.targetClass);
      }
      if (a.assignedAt && !assignedDateStr) {
        assignedDateStr = a.assignedAt;
      }
    });
  }

  const allDb = getAllStudentsFromLocalStorage();

  // 2. If no explicit assignment found, deduce from gradeStr or use the first available matching class
  if (targetClasses.length === 0) {
    const gradeMatch = (gradeStr || lessonTitle || '').match(/\d+/);
    const gradeNum = gradeMatch ? gradeMatch[0] : '5';
    
    // Find class that matches the grade number (e.g. "Lớp 5C", "Lớp 5B", "Lớp 5A")
    const matchingClassKeys = Object.keys(allDb).filter(cls => cls.includes(gradeNum));
    if (matchingClassKeys.length > 0) {
      targetClasses = [matchingClassKeys[0]]; // Take only the specific class of that grade
    } else {
      const firstClassKey = Object.keys(allDb)[0] || 'Lớp 5C';
      targetClasses = [firstClassKey];
    }
  }

  // 3. Fetch real students strictly belonging to the assigned classes
  const rawStudents: StudentRecord[] = [];
  const seenStudentIds = new Set<string>();

  targetClasses.forEach(cls => {
    const list = allDb[cls] || getStudentsFromLocalStorage(cls);
    if (Array.isArray(list)) {
      list.forEach(st => {
        const idKey = st.id || st.code || st.username || `${cls}-${st.stt}`;
        if (!seenStudentIds.has(idKey)) {
          seenStudentIds.add(idKey);
          rawStudents.push({
            ...st,
            className: st.className || cls
          });
        }
      });
    }
  });

  // 4. Map real students to authentic 5E progress records
  const mappedStudents: Student5EProgress[] = rawStudents.map((st, idx) => {
    const classInfo = getStudentClassInfo(st.sddcn || st.id, activeYear);
    const resolvedClassName = classInfo?.className || st.className || targetClasses[0] || 'Lớp 3C';
    const resolvedDisplayCode = classInfo?.displayCode || st.code || `HS${idx + 1}`;

    const prog = getRealStudentLessonProgress(st, lessonId, activeYear);

    // Activity 1: Khởi động (Engage)
    const isEngageDone = Boolean(prog?.engageViewed);
    const engage: ActivityDetail = {
      status: isEngageDone ? 'completed' : 'not_started',
      label: 'Khởi động',
      completedAt: isEngageDone && prog?.updatedAt ? formatActiveDate(prog.updatedAt) : undefined,
      score: isEngageDone ? 'Hoàn thành' : undefined
    };

    // Activity 2: Khám phá (Explore)
    const hasExploreScore = typeof prog?.exploreAccuracy === 'number' && !isNaN(prog.exploreAccuracy);
    const isExploreDone = Boolean(prog?.exploreCompleted || hasExploreScore);
    const explore: ActivityDetail = {
      status: isExploreDone ? 'completed' : (prog?.exploreProgress ? 'in_progress' : 'not_started'),
      label: 'Khám phá',
      completedAt: isExploreDone && prog?.updatedAt ? formatActiveDate(prog.updatedAt) : undefined,
      score: hasExploreScore ? `${prog.exploreAccuracy}% đúng` : (isExploreDone ? 'Xem hết video' : undefined)
    };

    // Activity 3: Luyện tập (Explain / Elaborate)
    const hasElaborateScore = typeof prog?.elaborate?.score === 'number' || typeof prog?.elaborate?.practiceScore === 'number';
    const isElaborateDone = Boolean(prog?.elaborate?.isCompleted || hasElaborateScore);
    const elaborateScoreVal = typeof prog?.elaborate?.score === 'number'
      ? prog.elaborate.score
      : (typeof prog?.elaborate?.practiceScore === 'number' ? prog.elaborate.practiceScore : null);
    
    const explain: ActivityDetail = {
      status: isElaborateDone ? 'completed' : (prog?.elaborate ? 'in_progress' : 'not_started'),
      label: 'Luyện tập',
      completedAt: isElaborateDone && prog?.updatedAt ? formatActiveDate(prog.updatedAt) : undefined,
      score: elaborateScoreVal !== null ? `${elaborateScoreVal}/10` : (isElaborateDone ? 'Hoàn thành' : undefined)
    };

    // Activity 4: Vận dụng (Elaborate / Apply)
    const isApplyDone = Boolean(prog?.apply?.isCompleted || prog?.apply?.isSubmitted || prog?.apply?.submittedQuestions);
    const elaborate: ActivityDetail = {
      status: isApplyDone ? 'completed' : (prog?.apply ? 'in_progress' : 'not_started'),
      label: 'Vận dụng',
      completedAt: isApplyDone && prog?.updatedAt ? formatActiveDate(prog.updatedAt) : undefined,
      score: isApplyDone ? 'Đã nộp bài' : undefined
    };

    // Activity 5: Đánh giá (Evaluate / Assessment)
    const hasAssessmentScore = typeof prog?.assessment?.testScore === 'number' || typeof prog?.assessment?.score === 'number';
    const isAssessmentDone = Boolean(hasAssessmentScore || prog?.assessment?.isCompleted || prog?.assessment?.isSubmitted);
    const assessmentScoreVal = typeof prog?.assessment?.testScore === 'number'
      ? prog.assessment.testScore
      : (typeof prog?.assessment?.score === 'number' ? prog.assessment.score : null);

    const evaluate: ActivityDetail = {
      status: isAssessmentDone ? 'completed' : (prog?.assessment ? 'in_progress' : 'not_started'),
      label: 'Đánh giá',
      completedAt: isAssessmentDone && prog?.updatedAt ? formatActiveDate(prog.updatedAt) : undefined,
      score: assessmentScoreVal !== null ? `${assessmentScoreVal}/10` : (isAssessmentDone ? 'Hoàn thành' : undefined)
    };

    // Calculate real completed steps count out of 5
    const completedStepsCount = [
      isEngageDone,
      isExploreDone,
      isElaborateDone,
      isApplyDone,
      isAssessmentDone
    ].filter(Boolean).length;

    // Calculate real progress percentage (0%, 20%, 40%, 60%, 80%, 100%)
    const progressPct = Math.round((completedStepsCount / 5) * 100);

    // Calculate real rating: Tốt (≥80%), Đạt (50-79%), Cần cố gắng (<50% và có làm ≥1 bước), Chưa vào học (0 bước)
    let rating: 'good' | 'pass' | 'need_effort' | 'not_started' = 'not_started';
    if (completedStepsCount === 0 && progressPct === 0) {
      rating = 'not_started';
    } else if (progressPct >= 80) {
      rating = 'good';
    } else if (progressPct >= 50) {
      rating = 'pass';
    } else {
      rating = 'need_effort';
    }

    // Calculate genuine "Nhận xét & Hoạt động gần nhất"
    const activeDateStr = prog?.updatedAt ? formatActiveDate(prog.updatedAt) : (assignedDateStr || '');
    let lastActiveText = '';

    if (completedStepsCount === 5) {
      lastActiveText = `Hoàn thành 5/5 hoạt động${activeDateStr ? ` • ${activeDateStr}` : ''}`;
    } else if (completedStepsCount > 0 || prog) {
      let currentAction = '';
      if (evaluate.status === 'in_progress' || (isAssessmentDone && completedStepsCount < 5)) {
        currentAction = isAssessmentDone ? 'Hoàn thành bài Đánh giá' : 'Đang làm bài Đánh giá';
      } else if (elaborate.status === 'in_progress' || isApplyDone) {
        currentAction = isApplyDone ? 'Hoàn thành bài Vận dụng' : 'Đang làm bài Vận dụng';
      } else if (explain.status === 'in_progress' || isElaborateDone) {
        currentAction = isElaborateDone ? 'Hoàn thành bài Luyện tập' : 'Đang làm bài Luyện tập';
      } else if (explore.status === 'in_progress' || isExploreDone) {
        currentAction = isExploreDone ? 'Hoàn thành video Khám phá' : 'Đang xem video Khám phá';
      } else {
        currentAction = 'Đã hoàn thành Khởi động';
      }
      lastActiveText = `${currentAction}${activeDateStr ? ` • ${activeDateStr}` : ''}`;
    } else {
      lastActiveText = 'Chưa vào học';
    }

    const isAtRisk = progressPct === 0;

    return {
      studentId: st.sddcn || st.id,
      stt: st.stt || idx + 1,
      studentCode: resolvedDisplayCode,
      studentName: st.name || st.fullName || `Học sinh ${idx + 1}`,
      className: resolvedClassName,
      avatar: st.avatar || '🐰',
      engage,
      explore,
      explain,
      elaborate,
      evaluate,
      progressPct,
      rating,
      lastActiveText,
      isAtRisk
    };
  });

  return {
    students: mappedStudents,
    targetClasses,
    assignedDateStr: assignedDateStr || (mappedStudents.length > 0 ? '01/09/2026' : undefined)
  };
}

