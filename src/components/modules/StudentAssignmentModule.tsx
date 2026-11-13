import React, { useState, useMemo, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  Award, 
  CheckCircle2, 
  FileText, 
  ChevronRight, 
  Sparkles, 
  Eye, 
  Check, 
  BookMarked,
  AlertCircle
} from 'lucide-react';
import { StatsSummaryRow } from '../common/StatsSummaryRow';
import { StudentRewardBadgeCard } from '../common/StudentRewardBadgeCard';
// import { HistoryErrorBoundary } from '../common/HistoryErrorBoundary';
import { getStudentGameProfile } from '../../services/studentGameStoreService';
import { HomeworkAssignment, QuestionItem, ExamPaper } from '../../types';
import { getSubjectColorStyles } from '../../utils/subjectColors';
import { QuizTakingView } from './QuizTakingView';
import { 
  StudentExamModule, 
  checkQuestionCorrectLocal,
  isMatchingQuestion,
  isEssayQuestion,
  resolveLatestQuestion,
  getLatestCorrectOrder
} from './StudentExamModule';
import { isMeaninglessAnswer } from '../../utils/essayGuard';
import { awardAssignmentReward } from '../../config/rewardConfig';
import {
  getEffectiveStudentClassAndGrade,
  isTargetingStudent,
  getAuthenticStudentCode,
  getCurrentStudentSession
} from '../../services/studentSessionService';
import { studentResultService } from '../../services/studentResultService';
import { getRecordType, isSameStudent, isValidStudentCode, normalizeStudentCode } from '../../services/studentCode';
import {
  subscribeToAssignmentsFromFirestore,
  getAssignmentsFromFirestore,
  getLocalCachedAssignments
} from '../../services/assignmentStorageService';
import { syncAssignmentQuestions } from '../../services/assignmentSyncService';
import { formatScore, isSubjectWithScore, getQualitativeLevel, getQualitativeLabel, getCurrentSubmissionTimestamp, formatSubmissionDateTime, parseScoreValue, calculateExamScore } from '../../utils/scoreUtils';
import { db } from '../../services/firebase';
import { doc, getDoc, setDoc, runTransaction, onSnapshot } from 'firebase/firestore';

interface StudentAssignmentModuleProps {
  assignments: HomeworkAssignment[];
  onSaveAssignment: (assignment: HomeworkAssignment) => void;
  currentUserId?: string;
  currentUserName?: string;
  isPreviewMode?: boolean;
  onExitPreview?: () => void;
}

export interface AssignmentSubmissionItem {
  id: string;
  recordType?: 'assignment';
  type: 'assignment';
  submissionType?: 'assignment';
  studentId?: string;
  title: string;
  subject: string;
  rank: string;
  score: string;
  submittedTime: string;
  assignment: HomeworkAssignment;
  answers: Record<number, any>;
}

const isAssignmentSubmission = (sub: any): boolean => {
  if (!sub) return false;
  return getRecordType(sub) === 'assignment';
};

export const getCanonicalAssignmentKey = (item: any): string => {
  if (!item) return '';
  const as = item.assignment || item;
  const rawId = String(as.id || item.id || as.assignmentId || item.assignmentId || '').trim();
  const cleanTitle = String(as.title || item.title || '')
    .trim()
    .toLowerCase()
    .replace(/^bài tập:\s*/i, '')
    .replace(/^luyện tập:\s*/i, '')
    .replace(/\s+/g, ' ');
  const rootId = as.originalAssignmentId || as.groupId || (rawId && !rawId.startsWith('as-custom') ? rawId.replace(/-class-.*$/, '') : '');
  if (rootId && rootId !== 'legacy' && !rootId.startsWith('as-custom')) {
    return `root::${rootId}`;
  }
  if (cleanTitle) {
    const subj = String(as.subject || item.subject || '').trim().toLowerCase();
    const grade = String(as.grade || item.grade || '').trim().toLowerCase();
    return `semantic::${cleanTitle}__${subj}__${grade}`;
  }
  return rawId || 'unknown';
};

export const getMaxAllowedAttempts = (as: HomeworkAssignment): number => {
  if (!as) return Infinity;
  if (as.allowRepeat === false) return 1;
  const maxStr = String(as.maxAttempts || '').trim().toLowerCase();
  if (maxStr.includes('1 lần') || maxStr === '1') return 1;
  if (maxStr.includes('2 lần') || maxStr === '2') return 2;
  if (maxStr.includes('3 lần') || maxStr === '3') return 3;
  if (maxStr.includes('5 lần') || maxStr === '5') return 5;
  if (maxStr.includes('10 lần') || maxStr === '10') return 10;
  if (maxStr.includes('không giới hạn') || maxStr.includes('nhiều lần') || !maxStr) return Infinity;
  const parsed = parseInt(maxStr, 10);
  return isNaN(parsed) ? Infinity : parsed;
};

export const deduplicateAssignmentSubmissions = (subs: AssignmentSubmissionItem[]): AssignmentSubmissionItem[] => {
  if (!Array.isArray(subs)) return [];
  const map = new Map<string, AssignmentSubmissionItem>();
  subs.forEach((sub) => {
    if (!sub) return;
    const key = getCanonicalAssignmentKey(sub);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, sub);
    } else {
      // Keep preferred submission (latest or valid score)
      const existingTime = new Date(existing.submittedTime || 0).getTime();
      const subTime = new Date(sub.submittedTime || 0).getTime();
      const preferred = (!isNaN(subTime) && !isNaN(existingTime) && subTime >= existingTime && sub.score !== '-') 
        ? sub 
        : (existing.score !== '-' ? existing : sub);

      map.set(key, {
        ...preferred,
        id: preferred.id || existing.id,
        assignment: (sub.assignment?.questions && sub.assignment.questions.length > 0) ? sub.assignment : existing.assignment,
        answers: (sub.answers && Object.keys(sub.answers).length > 0) ? sub.answers : existing.answers
      });
    }
  });
  return Array.from(map.values());
};

export const StudentAssignmentModule: React.FC<StudentAssignmentModuleProps> = ({
  assignments = [],
  onSaveAssignment,
  currentUserId,
  currentUserName,
  isPreviewMode = false,
  onExitPreview
}) => {
  const [studentInfo, setStudentInfo] = useState(() => getEffectiveStudentClassAndGrade());

  useEffect(() => {
    const handleUpdate = () => {
      setStudentInfo(getEffectiveStudentClassAndGrade());
    };
    window.addEventListener('eduplay_student_session_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('eduplay_student_session_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const {
    studentClass,
    studentGrade,
    studentName,
    studentId
  } = studentInfo;

  const [liveAssignments, setLiveAssignments] = useState<HomeworkAssignment[]>(() => {
    if (Array.isArray(assignments) && assignments.length > 0) return assignments;
    return getLocalCachedAssignments();
  });

  useEffect(() => {
    if (Array.isArray(assignments) && assignments.length > 0) {
      setLiveAssignments(assignments);
    }
  }, [assignments]);

  // Real-time synchronization: fetch fresh assignments from Firestore on mount & listen to window & Firestore events
  useEffect(() => {
    // 1. Fetch fresh list from Firestore on mount
    getAssignmentsFromFirestore().then(items => {
      if (Array.isArray(items) && items.length > 0) {
        setLiveAssignments(items);
      }
    }).catch(() => {});

    // 2. Custom window event handlers
    const handleAssignmentEvent = (e?: any) => {
      const detailAssignments = e?.detail?.assignments;
      if (Array.isArray(detailAssignments) && detailAssignments.length > 0) {
        setLiveAssignments(detailAssignments);
      } else {
        setLiveAssignments(getLocalCachedAssignments());
      }
    };

    window.addEventListener('eduplay_assignments_updated', handleAssignmentEvent);
    window.addEventListener('assignment-data-updated', handleAssignmentEvent);
    window.addEventListener('storage', handleAssignmentEvent);

    // 3. Real-time Firestore snapshot listener
    const unsubscribe = subscribeToAssignmentsFromFirestore((updatedList) => {
      if (Array.isArray(updatedList) && updatedList.length > 0) {
        setLiveAssignments(updatedList);
      }
    });

    return () => {
      window.removeEventListener('eduplay_assignments_updated', handleAssignmentEvent);
      window.removeEventListener('assignment-data-updated', handleAssignmentEvent);
      window.removeEventListener('storage', handleAssignmentEvent);
      unsubscribe();
    };
  }, []);

  const studentSession = getCurrentStudentSession();
  const effectiveInfo = getEffectiveStudentClassAndGrade();
  const rawAuthCode = getAuthenticStudentCode(
    studentSession, 
    currentUserId || studentId, 
    effectiveInfo.studentClass
  );
  const effectiveUserId = isValidStudentCode(rawAuthCode) ? normalizeStudentCode(rawAuthCode) : '';
  const effectiveUserName = studentSession?.name || studentSession?.fullName || currentUserName || studentName || effectiveInfo.studentName || 'Học sinh';

  const [activeTab, setActiveTab] = useState<'todo' | 'history'>('todo');
  const [solvingAssignment, setSolvingAssignment] = useState<HomeworkAssignment | null>(null);
  const [detailSubmission, setDetailSubmission] = useState<{ assignment: HomeworkAssignment; score: string; time: string; answers: Record<number, any>; title: string; subject: string; rank: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Student assignment history - Tách riêng biệt độc lập cho Bài tập (type === 'assignment')
  const [assignmentHistory, setAssignmentHistory] = useState<Array<AssignmentSubmissionItem>>(() => {
    try {
      const saved = localStorage.getItem(`eduplay_student_submissions_${effectiveUserId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const onlyAssignments: AssignmentSubmissionItem[] = parsed
            .filter(isAssignmentSubmission)
            .map((s: any) => ({
              ...s,
              type: 'assignment' as const,
              submissionType: 'assignment' as const,
              assignment: s.assignment || {
                id: s.id || 'as-legacy',
                title: s.title || 'Bài tập tự luyện',
                subject: s.subject || 'Môn học',
                questions: s.exam?.questions || []
              }
            }));
          return deduplicateAssignmentSubmissions(onlyAssignments);
        }
      }
    } catch (e) {
      console.error('Error loading assignment history:', e);
    }
    return [];
  });

  // Tối ưu hóa đọc dữ liệu: Chỉ đọc duy nhất 1 lần khi mở (Single getDoc on mount) thay vì onSnapshot / polling
  useEffect(() => {
    if (!effectiveUserId || !db) return;
    let isCancelled = false;

    const fetchStudentResultsOnce = async () => {
      try {
        const studentResultRef = doc(db, 'student_results', effectiveUserId);
        const docSnap = await getDoc(studentResultRef);
        if (isCancelled || !docSnap.exists()) return;

        const data = docSnap.data();
        const assignmentsMap = data.assignments || {};
        const resultItems: AssignmentSubmissionItem[] = [];

        Object.entries(assignmentsMap).forEach(([assignmentId, resData]: [string, any]) => {
          const matchingLive = liveAssignments.find(as => as.id === assignmentId);
          const assignmentObj = matchingLive || (resData.assignment || {
            id: assignmentId,
            title: resData.title || 'Bài tập rèn luyện',
            subject: resData.subject || 'Môn học',
            questions: resData.questions || []
          });

          resultItems.push({
            id: resData.id || `sub-${assignmentId}-${effectiveUserId}`,
            type: 'assignment' as const,
            submissionType: 'assignment' as const,
            studentId: effectiveUserId,
            title: assignmentObj.title,
            subject: assignmentObj.subject || 'Môn học',
            rank: resData.rank || 'Hoàn thành',
            score: resData.score !== undefined ? String(resData.score) : '-',
            submittedTime: formatSubmissionDateTime(resData.submittedAt || resData.submittedTime || getCurrentSubmissionTimestamp()),
            assignment: assignmentObj,
            answers: resData.answers || resData.lastAttempt?.answers || {}
          });
        });

        if (resultItems.length > 0 && !isCancelled) {
          setAssignmentHistory(prev => {
            const map = new Map<string, AssignmentSubmissionItem>();
            prev.forEach(item => map.set(getCanonicalAssignmentKey(item), item));
            resultItems.push(...prev); // Keep existing as well
            resultItems.forEach(item => map.set(getCanonicalAssignmentKey(item), item));
            return deduplicateAssignmentSubmissions(Array.from(map.values()));
          });
        }
      } catch (err) {
        console.warn('Lỗi đọc student_results 1 lần:', err);
      }
    };

    fetchStudentResultsOnce();
    return () => {
      isCancelled = true;
    };
  }, [effectiveUserId]);

  // Re-sync assignment history from LocalStorage, student_results, and assignments/{assignmentId}/submissions/{effectiveUserId} (Single Source of Truth)
  useEffect(() => {
    try {
      if (!effectiveUserId) {
        setAssignmentHistory([]);
        return;
      }
      const studentIdentity = { code: effectiveUserId, className: effectiveInfo.studentClass };
      const saved = localStorage.getItem(`eduplay_student_submissions_${effectiveUserId}`);
      let localItems: AssignmentSubmissionItem[] = [];
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          localItems = parsed
            .filter(isAssignmentSubmission)
            .filter((s: any) => isSameStudent(studentIdentity, s, effectiveInfo.studentClass))
            .map((s: any) => ({
              ...s,
              type: 'assignment' as const,
              submissionType: 'assignment' as const,
              studentId: effectiveUserId,
              assignment: s.assignment || {
                id: s.id || 'as-legacy',
                title: s.title || 'Bài tập tự luyện',
                subject: s.subject || 'Môn học',
                questions: s.exam?.questions || []
              }
            }));
        }
      }

      // Query & Sync from Firestore live assignments documents (chỉ khớp theo mã học sinh đầy đủ + lớp, tuyệt đối không khớp theo tên)
      const firestoreItems: AssignmentSubmissionItem[] = [];
      (liveAssignments || []).forEach((as) => {
        if (!as || !Array.isArray(as.submissions)) return;
        const matchedSub = as.submissions.find((s: any) => {
          if (!s) return false;
          return isSameStudent(studentIdentity, s, effectiveInfo.studentClass);
        });

        if (matchedSub) {
          const answers = matchedSub.answers || {};
          const questionsList = as.questions || [];
          const totalQ = Math.max(1, questionsList.length);
          let correctCount = 0;
          if (answers && Object.keys(answers).length > 0) {
            questionsList.forEach((q, idx) => {
              const studentChoice = answers[idx];
              if (checkQuestionCorrectLocal(q, studentChoice)) {
                correctCount++;
              }
            });
          }

          const rawScore = matchedSub.score !== undefined ? matchedSub.score : (matchedSub.totalScore !== undefined ? matchedSub.totalScore : '-');
          let parsedScore = parseScoreValue(rawScore, correctCount, totalQ);
          if ((parsedScore === 0 || isNaN(parsedScore)) && correctCount > 0) {
            parsedScore = calculateExamScore(correctCount, totalQ);
          }

          const hasScore = isSubjectWithScore(as.subject);
          const scoreDisplay = hasScore 
            ? (parsedScore > 0 || correctCount > 0 ? String(parsedScore) : (rawScore !== '-' ? String(rawScore) : '0'))
            : getQualitativeLabel(correctCount, totalQ);

          const rankTier = (matchedSub as any).rank || (hasScore ? (parsedScore >= 8 ? 'Xuất sắc' : parsedScore >= 5 ? 'Đạt' : 'Cần cố gắng') : 'Hoàn thành');

          firestoreItems.push({
            id: matchedSub.id || `sub-${as.id}-${effectiveUserId}`,
            type: 'assignment' as const,
            submissionType: 'assignment' as const,
            studentId: effectiveUserId,
            title: as.title,
            subject: as.subject || 'Môn học',
            rank: rankTier,
            score: scoreDisplay,
            submittedTime: formatSubmissionDateTime(matchedSub.submittedAt || matchedSub.submittedTime || getCurrentSubmissionTimestamp()),
            assignment: as,
            answers
          });
        }
      });

      // Bỏ vòng lặp getDoc duyệt từng bài tập để tiết kiệm tối đa lượt đọc Firestore (đã nạp qua student_results và liveAssignments)


      // Merge LocalStorage items and Firestore items (deduplicating by canonical assignment key)
      const mergedMap = new Map<string, AssignmentSubmissionItem>();
      localItems.forEach(item => {
        const key = getCanonicalAssignmentKey(item);
        if (key) mergedMap.set(key, item);
      });
      firestoreItems.forEach(item => {
        const key = getCanonicalAssignmentKey(item);
        if (!key) return;
        const existing = mergedMap.get(key);
        if (!existing) {
          mergedMap.set(key, item);
        } else {
          mergedMap.set(key, {
            ...existing,
            ...item,
            id: item.id || existing.id,
            assignment: item.assignment || existing.assignment,
            answers: (item.answers && Object.keys(item.answers).length > 0) ? item.answers : existing.answers
          });
        }
      });

      const mergedList = deduplicateAssignmentSubmissions(Array.from(mergedMap.values()));
      setAssignmentHistory(mergedList);
      localStorage.setItem(`eduplay_student_submissions_${effectiveUserId}`, JSON.stringify(mergedList));
    } catch (err) {
      console.warn('Lỗi đồng bộ lịch sử bài tập học sinh:', err);
    }
  }, [effectiveUserId, effectiveUserName, studentId, liveAssignments]);

  // Diagnostic Audit Log for storage & real-time assignments
  useEffect(() => {
    console.group(`🔍 [STUDENT ASSIGNMENTS AUDIT] Danh sách bài tập của học sinh ${effectiveUserName} (${effectiveUserId})`);
    console.log(`Lớp: ${studentClass} | Khối: ${studentGrade}`);
    console.log(`Tổng số bản ghi đầu vào: ${assignments.length}`);
    console.log(`Lịch sử bài tập nộp (${assignmentHistory.length} bài):`, assignmentHistory);
    assignments.forEach((as, idx) => {
      const targeted = isTargetingStudent(as.targetClass, as.grade, studentClass, studentGrade);
      console.log(`[#${idx + 1}] ID: ${as.id} | Title: "${as.title}" | TargetClass: "${as.targetClass}" | Grade: "${as.grade}" | TargetedForMe: ${targeted}`);
    });
    console.groupEnd();
  }, [assignments, assignmentHistory, effectiveUserName, effectiveUserId, studentClass, studentGrade]);

  const handleAddNewSubmission = (newSub: {
    id: string;
    studentId?: string;
    title: string;
    subject: string;
    rank: string;
    score: string;
    submittedTime: string;
    assignment: HomeworkAssignment;
    answers: Record<number, any>;
    totalScore?: number;
    scoreNumber?: number;
    correctCount?: number;
    totalQuestions?: number;
    evaluatedAnswers?: Record<number, { isCorrect: boolean; feedback?: string }>;
  }) => {
    // Calculate correct answers & evaluations
    const questions = newSub.assignment?.questions || [];
    const totalQuestions = Math.max(1, questions.length);
    let correctCount = 0;
    const evaluatedAnswers: Record<number, { isCorrect: boolean; feedback?: string }> = newSub.evaluatedAnswers ? { ...newSub.evaluatedAnswers } : {};

    questions.forEach((q, idx) => {
      const studentChoice = newSub.answers?.[idx];
      const isEssay = isEssayQuestion(q);
      const essayGuard = isEssay ? isMeaninglessAnswer(String(studentChoice || ''), q.content || '') : null;
      let isCorr = false;
      let fb: string | undefined = undefined;

      if (essayGuard?.invalid) {
        isCorr = false;
        fb = 'Bài làm chưa có nội dung phù hợp với câu hỏi. Em hãy đọc kỹ đề và trả lời bằng câu hoàn chỉnh nhé.';
      } else {
        isCorr = checkQuestionCorrectLocal(q, studentChoice);
      }

      if (isCorr) {
        correctCount++;
      }

      if (!evaluatedAnswers[idx]) {
        evaluatedAnswers[idx] = {
          isCorrect: isCorr,
          feedback: fb
        };
      }
    });

    const hasScore = isSubjectWithScore(newSub.subject || newSub.assignment?.subject);
    const calculatedScore = calculateExamScore(correctCount, totalQuestions);

    let numScore = newSub.totalScore !== undefined && !isNaN(newSub.totalScore)
      ? newSub.totalScore
      : (newSub.scoreNumber !== undefined && !isNaN(newSub.scoreNumber) ? newSub.scoreNumber : parseScoreValue(newSub.score, correctCount, totalQuestions));

    if ((numScore === 0 || isNaN(numScore)) && correctCount > 0) {
      numScore = calculatedScore;
    }

    const formattedScore = hasScore ? String(numScore) : (newSub.score || getQualitativeLabel(correctCount, totalQuestions));

    const subWithStudent: AssignmentSubmissionItem = { 
      ...newSub, 
      recordType: 'assignment',
      type: 'assignment',
      submissionType: 'assignment',
      studentId: effectiveUserId,
      score: formattedScore,
      evaluatedAnswers
    } as any;
    const newKey = getCanonicalAssignmentKey(subWithStudent);
    const remaining = assignmentHistory.filter(s => getCanonicalAssignmentKey(s) !== newKey);
    const updatedList = deduplicateAssignmentSubmissions([subWithStudent, ...remaining]);
    setAssignmentHistory(updatedList);
    try {
      localStorage.setItem(`eduplay_student_submissions_${effectiveUserId}`, JSON.stringify(updatedList));
      window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    } catch (err) {
      console.error('Error saving student assignment submission:', err);
    }

    const submissionRecord = {
      id: newSub.id || `sub-${Date.now()}`,
      recordType: 'assignment' as const,
      studentId: effectiveUserId,
      studentCode: effectiveUserId,
      maHs: effectiveUserId,
      code: effectiveUserId,
      studentClass: effectiveInfo.studentClass,
      studentName: effectiveUserName || 'Học sinh',
      score: numScore,
      totalScore: numScore,
      correctCount,
      totalQuestions,
      submittedAt: formatSubmissionDateTime(newSub.submittedTime || getCurrentSubmissionTimestamp()),
      submittedTime: formatSubmissionDateTime(newSub.submittedTime || getCurrentSubmissionTimestamp()),
      answers: newSub.answers,
      evaluatedAnswers,
      status: 'submitted' as const
    };

    // Update parent state if available (tuyệt đối không lọc theo tên)
    if (onSaveAssignment && newSub.assignment) {
      const existingSubs = Array.isArray(newSub.assignment.submissions) ? [...newSub.assignment.submissions] : [];
      const filtered = existingSubs.filter((s: any) => !isSameStudent(effectiveUserId, s, effectiveInfo.studentClass));
      filtered.push(submissionRecord as any);
      const updatedAssignment: HomeworkAssignment = {
        ...newSub.assignment,
        submissions: filtered,
        completedCount: filtered.length
      };
      onSaveAssignment(updatedAssignment);
    }

    // Save directly to Firestore for instant real-time sync across teachers & students using runTransaction (Atomic operation)
    if (db && newSub.assignment?.id && effectiveUserId) {
      const assignmentId = newSub.assignment.id;
      const assignRef = doc(db, 'assignments', assignmentId);
      const subDocRef = doc(db, 'assignments', assignmentId, 'submissions', effectiveUserId);

      runTransaction(db, async (transaction) => {
        const assignSnap = await transaction.get(assignRef);
        let existingSubs: any[] = [];
        if (assignSnap.exists()) {
          const currentData = assignSnap.data();
          existingSubs = Array.isArray(currentData.submissions) ? [...currentData.submissions] : [];
        }

        // Filter out previous submission by same student strictly by full student code + class
        const filtered = existingSubs.filter((s: any) => !isSameStudent(effectiveUserId, s, effectiveInfo.studentClass));

        filtered.push(submissionRecord);

        // Calculate unique submitted student IDs strictly by full student code (không dùng tên)
        const uniqueStudentKeys = new Set(
          filtered.map((s: any) => normalizeStudentCode(s.studentCode || s.code || s.maHs || s.studentId || '')).filter(Boolean)
        );
        const count = uniqueStudentKeys.size;
        const submittedIdsList = Array.from(uniqueStudentKeys);

        // Atomic write 1: Sub-collection detail submission document
        transaction.set(subDocRef, {
          ...submissionRecord,
          assignmentId,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Atomic write 2: Parent assignment document summary & array update
        transaction.set(assignRef, {
          submissions: filtered,
          submittedIds: submittedIdsList,
          submittedCount: count,
          completedCount: count,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }).then(() => {
        console.log(`✅ [Transaction Nộp Bài] Bài tập ${assignmentId} đã được lưu nguyên khối (Subcollection & Master Doc) cho HS ${effectiveUserName} (${effectiveUserId})`);
      }).catch(e => {
        console.warn('❌ [Transaction Nộp Bài Error]:', e);
      });

      try {
        studentResultService.saveAssignmentResult(effectiveUserId, {
          assignmentId,
          score: numScore,
          maxScore: 10,
          submittedAt: formatSubmissionDateTime(newSub.submittedTime || getCurrentSubmissionTimestamp()),
          answers: newSub.answers,
          keepAttempts: 'last'
        });
      } catch {}
    }

    // Automatic reward calculation (+10 Xu / +5 EXP, bonus +5 Xu if >=80% correct, first-time only)
    awardAssignmentReward(
      effectiveUserId,
      newSub.assignment.id,
      newSub.title,
      correctCount,
      totalQuestions
    );

    showToast(`🎉 Nộp bài thành công! Điểm số của em: ${formattedScore}`);
  };

  // Phân loại dữ liệu độc lập: loại trừ các bài giảng E-Learning, lọc theo lớp học và khử trùng lặp triệt để
  const todoAssignments = useMemo(() => {
    // 1. Loại trừ e-learning và lọc theo đúng lớp học sinh
    const filtered = (liveAssignments || []).filter((as) => {
      if (!as || !as.id) return false;
      const itemType = ((as as any).type || (as as any).category || (as as any).contentType || '').toLowerCase();
      if (itemType === 'elearning' || itemType === 'bai_giang' || itemType === 'lesson_5e' || as.id.startsWith('elearn-')) {
        return false;
      }

      if (!isPreviewMode && !isTargetingStudent(as.targetClass, as.grade, studentClass, studentGrade, {
        targetClasses: (as as any).targetClasses,
        classId: (as as any).classId,
        classes: (as as any).classes,
        assignedClasses: (as as any).assignedClasses
      })) {
        return false;
      }
      return true;
    });

    // Sắp xếp bài tập ưu tiên bài khớp chính xác với lớp học sinh hoặc bài học sinh đã nộp
    const sortedFiltered = [...filtered].sort((a, b) => {
      // Ưu tiên bài mà học sinh hiện tại đã có bài nộp
      const aHasSub = Array.isArray(a.submissions) && a.submissions.some((s: any) => 
        (effectiveUserId && (s.studentId === effectiveUserId || s.code === effectiveUserId || s.studentCode === effectiveUserId))
      );
      const bHasSub = Array.isArray(b.submissions) && b.submissions.some((s: any) => 
        (effectiveUserId && (s.studentId === effectiveUserId || s.code === effectiveUserId || s.studentCode === effectiveUserId))
      );
      if (aHasSub && !bHasSub) return -1;
      if (!aHasSub && bHasSub) return 1;

      // Ưu tiên bài gán chính xác duy nhất lớp học sinh hơn là gán chuỗi nhiều lớp
      const aIsExactClass = (a.targetClass || '').trim().toLowerCase() === (studentClass || '').trim().toLowerCase();
      const bIsExactClass = (b.targetClass || '').trim().toLowerCase() === (studentClass || '').trim().toLowerCase();
      if (aIsExactClass && !bIsExactClass) return -1;
      if (!aIsExactClass && bIsExactClass) return 1;

      // Ưu tiên bài có completedCount hoặc submissions nhiều hơn
      const aSubs = (a.submissions?.length || a.completedCount || 0);
      const bSubs = (b.submissions?.length || b.completedCount || 0);
      return bSubs - aSubs;
    });

    // 2. Cơ chế Khử trùng lặp thông minh (Smart Deduplication): Gom nhóm theo rootId hoặc tiêu đề + môn + khối, chọn bản tốt nhất (nhiều bài nộp nhất hoặc mới nhất)
    const map = new Map<string, HomeworkAssignment>();
    sortedFiltered.forEach(as => {
      if ((as as any).status === 'archived') return;
      const cleanTitle = (as.title || '')
        .trim()
        .toLowerCase()
        .replace(/^bài tập tự luyện:\s*/i, '')
        .replace(/^bài tập:\s*/i, '')
        .replace(/^luyện tập:\s*/i, '')
        .replace(/\s+/g, ' ');

      const rootId = as.originalAssignmentId || (as as any).groupId || as.id.replace(/-class-.*$/, '');
      const semanticKey = `${cleanTitle}__${(as.subject || '').trim().toLowerCase()}__${(as.grade || '').trim().toLowerCase()}`;
      const groupKey = rootId && rootId !== 'legacy' ? `root::${rootId}` : `semantic::${semanticKey}`;

      if (!map.has(groupKey)) {
        map.set(groupKey, as);
      } else {
        const existing = map.get(groupKey)!;
        const existingSubs = (existing.submissions?.length || existing.completedCount || 0);
        const currentSubs = (as.submissions?.length || as.completedCount || 0);
        if (currentSubs > existingSubs) {
          map.set(groupKey, as);
        }
      }
    });

    return Array.from(map.values());
  }, [liveAssignments, studentClass, studentGrade, isPreviewMode, effectiveUserId]);

  const historySubmissions = useMemo(() => {
    const list = (assignmentHistory || []).filter((sub) => {
      if (sub.type !== 'assignment') return false;
      const as = sub.assignment;
      if (!as) return true;
      const itemType = ((as as any).type || (as as any).category || (as as any).contentType || '').toLowerCase();
      if (itemType === 'elearning' || itemType === 'bai_giang' || itemType === 'lesson_5e' || (as.id && as.id.startsWith('elearn-'))) {
        return false;
      }
      return true;
    });
    const deduplicated = deduplicateAssignmentSubmissions(list);
    return deduplicated.sort((a, b) => {
      const timeA = new Date(a.submittedTime || 0).getTime();
      const timeB = new Date(b.submittedTime || 0).getTime();
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
  }, [assignmentHistory]);

  // Thống kê 4 ô cho Phân hệ Nhiệm vụ học tập (Bộ đếm nhất quán: Tổng = số thẻ khác nhau, Đã hoàn thành = số bài có ít nhất 1 bài nộp, Cần làm = Tổng - Đã hoàn thành)
  const assignmentStats = useMemo(() => {
    const totalCount = todoAssignments.length;
    const completedAssignments = todoAssignments.filter(as => {
      const subs = Array.isArray(as.submissions) ? as.submissions : [];
      const hasSub = subs.some((s: any) => {
        const sid = String(s.studentId || s.studentCode || s.maHs || s.code || '').trim().toLowerCase();
        return sid === effectiveUserId.toLowerCase();
      }) || historySubmissions.some(sub => sub.assignment?.id === as.id || sub.id === as.id);
      return hasSub;
    });
    const completedCount = completedAssignments.length;
    const pendingCount = Math.max(0, totalCount - completedCount);

    let avgScoreStr = '0 / 10';
    const scoredHistory = historySubmissions.filter(sub => isSubjectWithScore(sub.subject || sub.assignment?.subject));
    if (scoredHistory.length > 0) {
      const sum = scoredHistory.reduce((acc, curr) => {
        const s = typeof curr.score === 'number' ? curr.score : parseFloat(String(curr.score)) || 0;
        return acc + s;
      }, 0);
      const avg = Math.round(sum / scoredHistory.length);
      avgScoreStr = `${avg} / 10`;
    }

    return {
      totalCount,
      completedCount,
      pendingCount,
      avgScoreStr,
    };
  }, [todoAssignments, historySubmissions, effectiveUserId]);

  // Nếu đang làm bài, render component StudentExamModule chuyên biệt để hỗ trợ đầy đủ các dạng câu hỏi (phân loại, ghép nối...)
  if (solvingAssignment) {
    const syncRes = syncAssignmentQuestions(solvingAssignment);
    const activeQuestions = (syncRes.changed && syncRes.updatedAssignment.questions && syncRes.updatedAssignment.questions.length > 0)
      ? syncRes.updatedAssignment.questions
      : (solvingAssignment.questions || []);

    const examFromAssignment: ExamPaper = {
      id: solvingAssignment.id,
      title: solvingAssignment.title,
      subject: solvingAssignment.subject || 'Toán',
      grade: solvingAssignment.grade || 'Khối 3',
      durationMinutes: 45,
      matrix: { nhanBiet: 0, thongHieu: 0, vanDung: 0, vanDungCao: 0 },
      questions: activeQuestions,
      createdBy: solvingAssignment.teacherName || 'Giáo viên',
      createdAt: solvingAssignment.createdAt || new Date().toISOString(),
      enableRealtimeLeaderboard: solvingAssignment.enableRealtimeLeaderboard
    };

    return (
      <div className="relative">
        {isPreviewMode && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-1.5 text-center text-[11px] font-black uppercase tracking-wider shadow-md">
            ⚡ Đang làm thử bài tập: {solvingAssignment.title} (Kết quả không lưu)
          </div>
        )}
        <StudentExamModule
          exams={[examFromAssignment]}
          currentUserId={effectiveUserId}
          currentUserName={effectiveUserName}
          initialActiveExam={examFromAssignment}
          mode="assignment"
          allowMultipleAttempts={false}
          onCloseExam={() => {
            setSolvingAssignment(null);
            setActiveTab('history');
          }}
          onSubmitted={(newSub) => {
            handleAddNewSubmission({
              id: newSub.id,
              studentId: effectiveUserId,
              title: newSub.title,
              subject: newSub.subject,
              rank: newSub.rank,
              score: newSub.score,
              submittedTime: newSub.submittedTime,
              assignment: solvingAssignment,
              answers: newSub.answers || {},
              totalScore: (newSub as any).totalScore,
              scoreNumber: (newSub as any).scoreNumber,
              correctCount: (newSub as any).correctCount,
              totalQuestions: (newSub as any).totalQuestions,
              evaluatedAnswers: (newSub as any).evaluatedAnswers
            });
          }}
          isPreviewMode={isPreviewMode}
        />
      </div>
    );
  }

  const isDebugMode = typeof window !== 'undefined' && window.location.search.includes('debug=1');

  return (
    <div className="space-y-6 pb-12 w-full">
      {!isPreviewMode && !effectiveUserId && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-amber-900 shadow-sm">
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
          <div className="text-sm font-bold">
            Không xác định được mã học sinh, vui lòng đăng xuất và đăng nhập lại
          </div>
        </div>
      )}
      {isDebugMode && (
        <div className="bg-slate-900 text-emerald-300 p-4 rounded-2xl text-xs font-mono space-y-2 border border-emerald-500/40">
          <div className="font-bold text-white flex items-center justify-between">
            <span>🐛 [STUDENT DEBUG MODE (?debug=1)] Học sinh: {effectiveUserName} ({effectiveUserId}) - Lớp {studentClass}</span>
            <span>Tổng bài: {todoAssignments.length}</span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {todoAssignments.map((as, idx) => {
              const subs = Array.isArray(as.submissions) ? as.submissions : [];
              const hasSubmitted = subs.some((s: any) => String(s.studentId || s.studentCode || s.maHs || '').toLowerCase() === effectiveUserId.toLowerCase());
              const source = as.id.startsWith('as-') ? 'Firestore/Cache' : 'Local';
              return (
                <div key={as.id} className="bg-slate-800 p-2 rounded border border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-amber-400 font-bold">#{idx + 1} ID: {as.id}</span> | 
                    <span> Tiêu đề: {as.title}</span> | 
                    <span> Lớp: {as.targetClass || 'Chung'}</span> | 
                    <span> Nguồn: {source}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${hasSubmitted ? 'bg-emerald-900 text-emerald-200' : 'bg-amber-900 text-amber-200'}`}>
                      {hasSubmitted ? 'Đã hoàn thành' : 'Chưa làm'} ({subs.length} nộp)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isPreviewMode && (
        <div className="bg-amber-500/15 border-2 border-dashed border-amber-500/40 text-amber-900 rounded-2xl p-4 text-xs font-black flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <span>
              <strong>CHẾ ĐỘ XEM THỬ:</strong> Đây là bản demo cách học sinh nhìn thấy và làm bài tập này. Kết quả làm thử sẽ KHÔNG được lưu thật vào cơ sở dữ liệu.
            </span>
          </div>
          {onExitPreview && (
            <button
              onClick={onExitPreview}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black tracking-wide transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
            >
              <span>Quay lại Góc nhìn Giáo viên</span>
              <span>🚪</span>
            </button>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <span className="text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-rose-500 rounded-[28px] p-5 sm:p-6 lg:p-7 text-white shadow-xl relative overflow-hidden border border-orange-300/40 min-h-[140px] flex items-center">
        {/* Background Ambient Glows & Sparkles Decor */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-yellow-200 via-orange-400 to-transparent pointer-events-none" />
        <div className="absolute -right-8 -top-8 w-64 h-64 bg-amber-400/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-10 w-56 h-56 bg-rose-400/20 rounded-full blur-2xl pointer-events-none" />
        
        {/* Subtle background star sparkles */}
        <div className="absolute top-4 right-1/4 text-yellow-200/30 text-lg pointer-events-none select-none">✦</div>
        <div className="absolute bottom-4 left-1/4 text-orange-200/30 text-base pointer-events-none select-none">✧</div>
        <div className="absolute top-1/2 right-1/3 text-amber-300/20 text-sm pointer-events-none select-none">★</div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 w-full">
          {/* Left Content Area */}
          <div className="space-y-3 max-w-2xl">
            {/* Top Badges Row: Distinct separated tags */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/35 text-white text-[11px] font-black uppercase tracking-wider shadow-xs">
                <span className="text-amber-300">📝</span> NHIỆM VỤ RÈN LUYỆN
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/30 backdrop-blur-md border border-amber-300/30 text-amber-100 text-xs font-bold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse"></span>
                <span>Học sinh: <strong className="text-white font-extrabold">{effectiveUserName} ({studentClass})</strong></span>
              </span>
            </div>

            {/* Title & Subtitle */}
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black font-heading tracking-tight text-white drop-shadow-sm flex items-center gap-3">
                <span>Bài Tập Của Tôi</span>
                <span className="text-xl sm:text-2xl animate-bounce">✍️</span>
              </h1>
              <p className="text-orange-100 text-xs sm:text-sm mt-1.5 leading-relaxed font-medium">
                Hoàn thành các phiếu rèn luyện tự học để tích lũy Xu và tăng cấp EXP mỗi ngày nhé!
              </p>
            </div>
          </div>

          {/* Right Mascot / Assignment 3D Stage (Takes ~1/4 width) */}
          <div className="hidden sm:flex items-center justify-center relative shrink-0">
            <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-3xl bg-gradient-to-tr from-white/10 via-white/25 to-amber-300/30 backdrop-blur-md border border-white/40 shadow-2xl flex items-center justify-center relative transform hover:scale-105 transition-transform duration-300 group">
              <div className="relative flex flex-col items-center justify-center">
                <BookMarked className="w-12 h-12 lg:w-14 lg:h-14 text-amber-200 drop-shadow-[0_6px_16px_rgba(251,191,36,0.6)] animate-pulse" />
                
                {/* Floating Micro Badges */}
                <span className="absolute -top-3.5 -right-3.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 font-black text-[9px] shadow-md border border-amber-100 tracking-wider">
                  +{todoAssignments.length} BÀI 🎯
                </span>
                
                <span className="absolute -bottom-3 px-2 py-0.5 rounded-full bg-amber-900/90 text-amber-300 font-black text-[9px] shadow-md border border-amber-400/50 backdrop-blur-xs whitespace-nowrap">
                  +30 Xu / Bài 🪙
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 STAT CARDS */}
      <StatsSummaryRow
        items={[
          {
            id: 'total-assignments',
            label: 'Tổng nhiệm vụ',
            value: assignmentStats.totalCount,
            icon: BookMarked,
            colorScheme: 'orange',
          },
          {
            id: 'completed-assignments',
            label: 'Đã hoàn thành',
            value: assignmentStats.completedCount,
            icon: CheckCircle2,
            colorScheme: 'emerald',
          },
          {
            id: 'pending-assignments',
            label: 'Nhiệm vụ cần làm',
            value: assignmentStats.pendingCount,
            icon: Clock,
            colorScheme: 'amber',
          },
          {
            id: 'avg-score',
            label: 'Điểm & Xu thưởng',
            value: assignmentStats.avgScoreStr,
            icon: Award,
            colorScheme: 'purple',
            customContent: (() => {
              const profile = getStudentGameProfile(currentUserId || studentId, currentUserName || studentName);
              const numScore = parseFloat((assignmentStats.avgScoreStr || '0').split('/')[0]?.trim()) || 0;
              return (
                <StudentRewardBadgeCard
                  compact
                  score={numScore}
                  maxScore={10}
                  scoreDisplay={assignmentStats.avgScoreStr}
                  scoreLabel="Hoa Điểm 10 & EXP"
                  coins={profile?.coins || 1000}
                  exp={assignmentStats.completedCount * 30}
                  level={profile?.level || 1}
                />
              );
            })(),
          },
        ]}
      />

      {/* TABS NAVIGATION */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('todo')}
          className={`px-5 py-3 rounded-2xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2.5 cursor-pointer ${
            activeTab === 'todo'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Bài Tập Cần Làm</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'todo' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800'
          }`}>
            {todoAssignments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-3 rounded-2xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2.5 cursor-pointer ${
            activeTab === 'history'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Nhật Ký & Lịch Sử Nộp Bài</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {historySubmissions.length}
          </span>
        </button>
      </div>

      {/* TAB 1: BÀI TẬP CẦN LÀM */}
      {activeTab === 'todo' && (
        <div className="space-y-4">
          {todoAssignments.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs space-y-3">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Tuyệt vời! Em đã hoàn thành tất cả bài tập</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Không có bài tập rèn luyện nào đang chờ. Hãy sang mục Đấu Trường Tri Thức hoặc Phòng Kiểm Tra để luyện tập thêm nhé!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {todoAssignments.map((as) => {
                const subjColor = getSubjectColorStyles(as.subject);
                const asKey = getCanonicalAssignmentKey(as);
                const matchingHistory = (assignmentHistory || []).filter(
                  sub => getCanonicalAssignmentKey(sub) === asKey || (sub.assignment?.id && sub.assignment.id === as.id) || (sub.id && sub.id === as.id) || (sub.title && sub.title === as.title)
                );
                const submissionsList = Array.isArray(as.submissions) ? as.submissions : [];
                const directSubmission = submissionsList.find((s: any) => {
                  if (!s) return false;
                  const sid = String(s.studentId || s.studentCode || s.maHs || s.code || '').trim().toLowerCase();
                  const targetKeys = [
                    effectiveUserId.toLowerCase().trim(),
                    (studentId || '').toLowerCase().trim(),
                    (effectiveUserName || '').toLowerCase().trim()
                  ].filter(Boolean);
                  return targetKeys.includes(sid);
                });

                const existingSub = matchingHistory[0] || (directSubmission ? {
                  id: directSubmission.id || `sub-${as.id}-${effectiveUserId}`,
                  type: 'assignment' as const,
                  submissionType: 'assignment' as const,
                  studentId: effectiveUserId,
                  title: as.title,
                  subject: as.subject || 'Môn học',
                  rank: (directSubmission as any).rank || 'Hoàn thành',
                  score: directSubmission.score !== undefined ? String(directSubmission.score) : (directSubmission.totalScore !== undefined ? String(directSubmission.totalScore) : '-'),
                  submittedTime: formatSubmissionDateTime(directSubmission.submittedAt || directSubmission.submittedTime || getCurrentSubmissionTimestamp()),
                  assignment: as,
                  answers: directSubmission.answers || {}
                } : null);

                const isDone = Boolean(existingSub);
                const attemptCount = Math.max(matchingHistory.length, directSubmission ? 1 : 0);
                const maxAllowed = getMaxAllowedAttempts(as);
                const isMaxReached = attemptCount >= maxAllowed;

                const isExpired = (() => {
                  if (!as.dueDate) return false;
                  try {
                    const end = new Date(as.dueDate);
                    if (!isNaN(end.getTime())) {
                      return new Date().getTime() > end.getTime();
                    }
                  } catch {}
                  return false;
                })();

                const isDisabled = (isExpired && !isDone) || isMaxReached;

                return (
                <div 
                  key={as.id}
                  className={`bg-white rounded-3xl p-6 border ${isDone ? 'border-emerald-200 bg-gradient-to-b from-emerald-50/20 to-white' : 'border-slate-200'} ${subjColor.cardBorderHover} shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative overflow-hidden group`}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-2xl group-hover:bg-emerald-100 transition-all pointer-events-none"></div>

                  <div className="space-y-3 relative z-10">
                    {/* Tags */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full uppercase ${subjColor.badgeClass}`}>
                          {as.subject || subjColor.name}
                        </span>
                        <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-1 rounded-full">
                          {as.grade || 'Khối 3'}
                        </span>
                      </div>
                      {isDone ? (
                        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-xs border ${
                          isMaxReached && maxAllowed === 1 
                            ? 'bg-rose-100 text-rose-800 border-rose-200' 
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 
                          {isMaxReached ? `Đã hoàn thành (${attemptCount}/${maxAllowed} lần - Khóa)` : `Đã hoàn thành (${existingSub?.score})`}
                        </span>
                      ) : isExpired ? (
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-xs border border-rose-200">
                          🔒 Đã hết hạn
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-xs border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" /> Đang chờ làm
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                      {as.title}
                    </h3>

                    {/* Meta info */}
                    <div className="pt-1.5 text-xs text-slate-600">
                      <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-100 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span>Số câu: <b>{as.questions?.length || 5} câu</b></span>
                      </div>
                    </div>

                    <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between px-1">
                      <span>Cho phép làm lại: <strong className="text-slate-800">{as.maxAttempts || (as.allowRepeat === false ? '1 lần' : 'Nhiều lần ♾️')}</strong></span>
                      <span className="text-indigo-600 font-semibold">Tự chấm điểm AI ⚡</span>
                    </div>
                  </div>

                  {/* CTA Buttons */}
                  <div className="pt-2 relative z-10 flex flex-col gap-2">
                    {isDone ? (
                      <button
                        onClick={() => {
                          const qList = as.questions || [];
                          const tQ = Math.max(1, qList.length);
                          let cCount = 0;
                          if (existingSub?.answers) {
                            qList.forEach((q, idx) => {
                              if (checkQuestionCorrectLocal(q, existingSub.answers[idx])) cCount++;
                            });
                          }
                          const calcScore = calculateExamScore(cCount, tQ);
                          let parsed = parseScoreValue(existingSub?.score, cCount, tQ);
                          if ((parsed === 0 || isNaN(parsed)) && cCount > 0) {
                            parsed = calcScore;
                          }
                          const fixedScore = isSubjectWithScore(as.subject)
                            ? (parsed > 0 || cCount > 0 ? String(parsed) : (existingSub?.score || '0'))
                            : (existingSub?.score || getQualitativeLabel(cCount, tQ));

                          setDetailSubmission({
                            assignment: as,
                            score: fixedScore,
                            time: formatSubmissionDateTime(existingSub?.submittedTime || getCurrentSubmissionTimestamp()),
                            answers: existingSub?.answers || {},
                            title: as.title,
                            subject: as.subject || 'Môn học',
                            rank: existingSub?.rank || 'Hoàn thành'
                          });
                        }}
                        className="w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-extrabold bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white shadow-md shadow-teal-600/20 cursor-pointer active:scale-98 flex items-center justify-center gap-2 transition-all"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Xem lại bài</span>
                      </button>
                    ) : (
                      <button
                        disabled={isDisabled}
                        onClick={() => {
                          setSolvingAssignment(as);
                        }}
                        className={`w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-extrabold transition-all shadow-md flex items-center justify-center gap-2 ${
                          isDisabled
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/20 cursor-pointer active:scale-98'
                        }`}
                      >
                        <span>
                          {isExpired ? '🔒 Đã hết hạn làm bài' : '⚡ Bắt đầu làm bài tập'}
                        </span>
                        {!isDisabled && <ChevronRight className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NHẬT KÝ & LỊCH SỬ NỘP BÀI */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          {historySubmissions.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-2xl">
                💤
              </div>
              <h3 className="text-base font-bold text-slate-800">Chưa có lịch sử nộp bài</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Em chưa hoàn thành bài tập rèn luyện nào gần đây. Hãy chọn một bài ở danh sách bên trên để bứt phá điểm số nhé!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-extrabold uppercase tracking-wider">
                    <th className="py-4 px-6">STT</th>
                    <th className="py-4 px-6">Tên bài luyện tập</th>
                    <th className="py-4 px-6">Môn học</th>
                    <th className="py-4 px-6 text-center">Xếp thứ</th>
                    <th className="py-4 px-6 text-center">Điểm số</th>
                    <th className="py-4 px-6">Thời gian nộp</th>
                    <th className="py-4 px-6 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                  {historySubmissions.map((sub, index) => {
                    const subjColor = getSubjectColorStyles(sub.subject);
                    return (
                    <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-500">#{index + 1}</td>
                      <td className="py-4 px-6 font-bold text-slate-900">{sub.title}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${subjColor.badgeClass}`}>
                          {sub.subject}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className="bg-amber-100 text-amber-900 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                          {sub.rank}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {(() => {
                          const qList = sub.assignment?.questions || [];
                          const tQ = Math.max(1, qList.length);
                          let cCount = 0;
                          if (sub.answers) {
                            qList.forEach((q, idx) => {
                              if (checkQuestionCorrectLocal(q, sub.answers[idx])) cCount++;
                            });
                          }
                          const calcScore = calculateExamScore(cCount, tQ);
                          let parsed = parseScoreValue(sub.score, cCount, tQ);
                          if ((parsed === 0 || isNaN(parsed)) && cCount > 0) {
                            parsed = calcScore;
                          }
                          const hasScore = isSubjectWithScore(sub.subject);
                          const tableScore = hasScore
                            ? (parsed > 0 || cCount > 0 ? String(parsed) : (sub.score !== '-' ? sub.score : '0'))
                            : getQualitativeLabel(sub.score);
                          return (
                            <span className={`font-extrabold px-3 py-1 rounded-full text-xs ${
                              !hasScore
                                ? (getQualitativeLevel(tableScore) === 'T' ? 'bg-emerald-100 text-emerald-800' : getQualitativeLevel(tableScore) === 'HT' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800')
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {tableScore}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-6 text-slate-500">{formatSubmissionDateTime(sub.submittedTime)}</td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => {
                            const qList = sub.assignment?.questions || [];
                            const tQ = Math.max(1, qList.length);
                            let cCount = 0;
                            if (sub.answers) {
                              qList.forEach((q, idx) => {
                                if (checkQuestionCorrectLocal(q, sub.answers[idx])) cCount++;
                              });
                            }
                            const calcScore = calculateExamScore(cCount, tQ);
                            let parsed = parseScoreValue(sub.score, cCount, tQ);
                            if ((parsed === 0 || isNaN(parsed)) && cCount > 0) {
                              parsed = calcScore;
                            }
                            const fixedScore = isSubjectWithScore(sub.subject)
                              ? (parsed > 0 || cCount > 0 ? String(parsed) : sub.score)
                              : sub.score;
                            setDetailSubmission({
                              assignment: sub.assignment,
                              score: fixedScore,
                              time: formatSubmissionDateTime(sub.submittedTime),
                              answers: sub.answers,
                              title: sub.title,
                              subject: sub.subject,
                              rank: sub.rank
                            });
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DETAIL SUBMISSION MODAL */}
      {detailSubmission && (() => {
        const questionsList = detailSubmission.assignment.questions || [];
        const totalQ = questionsList.length || 1;
        
        // Calculate correct count
        let correctCount = 0;
        const correctQuestionNums: number[] = [];
        const incorrectQuestionIndices: number[] = [];

        questionsList.forEach((q, idx) => {
          const studentChoice = detailSubmission.answers[idx];
          const isCorrect = checkQuestionCorrectLocal(q, studentChoice);
          if (isCorrect) {
            correctCount++;
            correctQuestionNums.push(idx + 1);
          } else {
            incorrectQuestionIndices.push(idx);
          }
        });

        // Extract numeric score from string e.g. "9.0 / 10" or calculate ratio
        const calculatedScore = calculateExamScore(correctCount, totalQ);
        const scoreParts = String(detailSubmission.score || '').split('/');
        let numericScore = parseScoreValue(scoreParts[0], correctCount, totalQ);
        if ((numericScore === 0 || isNaN(numericScore)) && correctCount > 0) {
          numericScore = calculatedScore;
        }
        const maxScore = parseFloat(scoreParts[1]) || 10;
        const ratio = numericScore / maxScore;
        const isHighRatio = ratio >= 0.8;

        const hasScore = isSubjectWithScore(detailSubmission.subject);
        const displayScore = hasScore 
          ? (detailSubmission.score && detailSubmission.score !== '0' && detailSubmission.score !== '-' 
              ? (detailSubmission.score.includes('/') ? detailSubmission.score : String(numericScore))
              : String(numericScore))
          : getQualitativeLabel(correctCount, totalQ);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              
              {/* 1. HEADER MODAL */}
              <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="space-y-1">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                    🏆 CHI TIẾT BÀI LUYỆN TẬP ĐÃ LÀM
                  </span>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {detailSubmission.title}
                  </h2>
                </div>
                <button
                  onClick={() => setDetailSubmission(null)}
                  className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all cursor-pointer border border-slate-200"
                >
                  ✕
                </button>
              </div>

              {/* MODAL BODY */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
                
                {/* 2. KHỐI ĐIỂM SỐ NỔI BẬT (BANNER XANH LÁ ĐẬM) */}
                <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-200">
                      {isSubjectWithScore(detailSubmission.subject) ? 'ĐIỂM SỐ ĐẠT ĐƯỢC' : 'MỨC ĐẠT ĐƯỢC'}
                    </span>
                    <div className="text-2xl sm:text-3xl font-black">
                      {displayScore}
                    </div>
                    <p className="text-xs text-emerald-100 font-medium">
                      Đúng {correctCount} trên tổng số {totalQ} câu {incorrectQuestionIndices.length > 0 ? `(Làm sai ${incorrectQuestionIndices.length} câu)` : '(Làm đúng toàn bộ)'}
                    </p>
                  </div>

                  <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20 space-y-1.5 text-xs text-emerald-50 w-full md:w-auto">
                    <div className="flex items-center justify-between gap-4">
                      <span>Trạng thái:</span>
                      <strong className="text-white font-bold bg-emerald-500/30 px-2 py-0.5 rounded-full">Đã nộp bài</strong>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Số lượt làm:</span>
                      <strong className="text-white">1 lượt</strong>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Thời gian:</span>
                      <strong className="text-white">{detailSubmission.time}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. KHỐI ĐÁNH GIÁ VÀ NHẬN XÉT */}
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Đánh giá và nhận xét từ hệ thống</h3>
                  
                  {/* Nếu tỉ lệ >= 80%: Khối Khen Ngợi */}
                  {isHighRatio && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
                        <span>🎉</span>
                        <span>KHEN NGỢI ĐIỂM TỐT</span>
                      </div>
                      <p className="text-xs sm:text-sm text-emerald-800 leading-relaxed font-medium">
                        Khen ngợi em đã hoàn thành đúng {correctCount}/{totalQ} câu. Em làm rất tốt các câu: <strong className="text-emerald-900 font-bold">{correctQuestionNums.join(', ')}</strong>.
                      </p>
                    </div>
                  )}

                  {/* Luôn hiển thị nếu còn câu sai */}
                  {incorrectQuestionIndices.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
                      <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
                        <span>💡</span>
                        <span>NỘI DUNG CẦN CHÚ Ý ÔN TẬP</span>
                      </div>
                      <p className="text-xs sm:text-sm text-amber-800 leading-relaxed font-medium">
                        Em còn {incorrectQuestionIndices.length} câu chưa chính xác (Câu: <strong className="text-amber-900 font-bold">{incorrectQuestionIndices.map(i => i + 1).join(', ')}</strong>). Hãy ôn tập lại lý thuyết và làm lại để đạt điểm tuyệt đối nhé!
                      </p>
                    </div>
                  )}

                  {/* Lời khuyên động viên của giáo viên (AI) */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm">
                      <span>💬</span>
                      <span>LỜI KHUYÊN ĐỘNG VIÊN CỦA GIÁO VIÊN</span>
                    </div>
                    <p className="text-xs sm:text-sm text-indigo-800 leading-relaxed font-medium">
                      {isHighRatio 
                        ? "Thầy cô rất tự hào vì tinh thần học tập và kết quả xuất sắc của em. Hãy tiếp tục phát huy sự tập trung và phong độ tuyệt vời này trong các bài luyện tập tiếp theo nhé!"
                        : "Em đã có gắng rất nhiều! Đừng nản lòng khi gặp câu hỏi khó nhé, đây là cơ hội tuyệt vời để em ôn tập sâu hơn. Thầy cô tin rằng với một chút chú ý, lần luyện tập sau em sẽ bứt phá điểm số cao hơn."
                      }
                    </p>
                  </div>
                </div>

                {/* 4. KHỐI ĐÁP ÁN VÀ KẾT QUẢ GIẢI CHI TIẾT */}
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Đáp án và kết quả giải chi tiết từng câu:</h3>
                  
                  <div className="space-y-4">
                    {questionsList.map((q: QuestionItem, idx: number) => {
                      const studentChoice = detailSubmission.answers[idx];
                      const isCorrect = checkQuestionCorrectLocal(q, studentChoice);

                      let studentAnswerText = 'Chưa chọn / Chưa làm';
                      let correctAnswerText = q.correctAnswer || 'Xem hướng dẫn giải';

                      const isOrdering = (q.type || '').includes('ordering') || (q.type || '').includes('sắp xếp');

                      if (isMatchingQuestion(q)) {
                        const pairs = q.matchingPairs || [];
                        correctAnswerText = pairs.map((p, pIdx) => `(${pIdx + 1}) ${p.left} ➔ ${p.right}`).join('\n');
                        const sPairs = (typeof studentChoice === 'object' && studentChoice !== null) ? studentChoice : {};
                        if (Object.keys(sPairs).length === 0) {
                          studentAnswerText = 'Chưa nối cặp nào';
                        } else {
                          studentAnswerText = pairs.map((p, pIdx) => {
                            const val = sPairs[pIdx] !== undefined ? sPairs[pIdx] : sPairs[p.left];
                            let displayVal = val;
                            if (typeof val === 'number' && pairs[val]) {
                              displayVal = pairs[val].right;
                            }
                            return `(${pIdx + 1}) ${p.left} ➔ ${displayVal || '(Chưa nối)'}`;
                          }).join('\n');
                        }
                      } else if (isOrdering) {
                        const freshQ = resolveLatestQuestion(q);
                        const opts = getLatestCorrectOrder(freshQ);
                        correctAnswerText = opts.map((opt, oIdx) => `${oIdx + 1}. ${opt}`).join('\n');
                        const sOrder = Array.isArray(studentChoice) ? studentChoice : (q.options || []);
                        studentAnswerText = sOrder.length > 0 ? sOrder.map((opt, oIdx) => `${oIdx + 1}. ${opt}`).join('\n') : 'Em chưa sắp xếp thứ tự';
                      } else if (studentChoice !== undefined && studentChoice !== null) {
                        if (typeof studentChoice === 'number') {
                          const letter = String.fromCharCode(65 + studentChoice);
                          studentAnswerText = q.options && q.options[studentChoice] ? `${letter}. ${q.options[studentChoice]}` : letter;
                        } else if (Array.isArray(studentChoice)) {
                          studentAnswerText = studentChoice.map((item, oIdx) => typeof item === 'number' ? String.fromCharCode(65 + item) : String(item)).join(', ');
                        } else if (typeof studentChoice === 'object') {
                          studentAnswerText = Object.keys(studentChoice).length > 0 ? 'Đã hoàn thành các mục' : 'Chưa hoàn thành';
                        } else {
                          studentAnswerText = String(studentChoice);
                        }
                      }

                      const isEssay = isEssayQuestion(q);
                      const essayGuard = isEssay ? isMeaninglessAnswer(String(studentChoice || ''), q.content || '') : null;

                      return (
                        <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-slate-700 uppercase">
                              CÂU HỎI {idx + 1}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                              isCorrect 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                              {isCorrect ? 'Đúng ✓' : 'Chưa đúng ✗'}
                            </span>
                          </div>

                          <h4 className="text-sm font-extrabold text-slate-900 leading-relaxed">
                            {q.content}
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                              <span className="text-slate-500 font-semibold mb-1">Đáp án em chọn:</span>
                              <span className={`font-extrabold whitespace-pre-line ${isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                                {studentAnswerText}
                              </span>
                            </div>

                            <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 flex flex-col justify-between">
                              <span className="text-indigo-600 font-semibold mb-1">Đáp án chuẩn:</span>
                              <span className="font-extrabold text-indigo-900 whitespace-pre-line">
                                {correctAnswerText}
                              </span>
                            </div>
                          </div>

                          {isEssay && essayGuard?.invalid && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <strong className="text-amber-950 block font-bold">Nhận xét:</strong>
                                <span>Bài làm chưa có nội dung phù hợp với câu hỏi. Em hãy đọc kỹ đề và trả lời bằng câu hoàn chỉnh nhé.</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* 5. FOOTER MODAL */}
              <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-4">
                <button
                  onClick={() => {
                    const assignmentToRetry = detailSubmission.assignment;
                    const asKey = getCanonicalAssignmentKey(assignmentToRetry);
                    const matchingHistory = (assignmentHistory || []).filter(
                      sub => getCanonicalAssignmentKey(sub) === asKey || (sub.assignment?.id && sub.assignment.id === assignmentToRetry.id) || (sub.id && sub.id === assignmentToRetry.id)
                    );
                    const attemptCount = matchingHistory.length;
                    const maxAllowed = getMaxAllowedAttempts(assignmentToRetry);
                    if (attemptCount >= maxAllowed) {
                      showToast(`⚠️ Bài tập này giới hạn tối đa ${maxAllowed} lần làm. Em đã hoàn thành (${attemptCount}/${maxAllowed}) và không thể làm lại.`);
                      return;
                    }
                    setDetailSubmission(null);
                    setSolvingAssignment(assignmentToRetry);
                  }}
                  className="py-3 px-5 rounded-2xl border-2 border-indigo-600 text-indigo-700 hover:bg-indigo-50 text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2"
                >
                  🔄 Luyện tập lại bài này
                </button>

                <button
                  onClick={() => setDetailSubmission(null)}
                  className="py-3 px-6 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-extrabold transition-all cursor-pointer"
                >
                  Đóng và quay lại
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};
