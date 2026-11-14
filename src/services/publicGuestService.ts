import { db, auth } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  runTransaction,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import {
  ExamPaper,
  HomeworkAssignment,
  Lesson5EPlan,
  GameItem,
  QuizziGameItem,
} from '../types';
import { getLocalCachedExams } from './examStorageService';
import { getLocalCachedAssignments } from './assignmentStorageService';
import { getLocalCachedLessons, ELEARNING_LESSONS_COLLECTION } from './lessonStorageService';
import {
  getLocalCachedGames,
  getLocalCachedQuizziGames,
  QUIZZI_COLLECTION,
} from './gameStorageService';
import {
  INITIAL_EXAMS,
  INITIAL_ASSIGNMENTS,
  INITIAL_LESSONS,
  INITIAL_GAMES,
} from './mockData';
import { removeUndefined } from './teacherStorageService';
import { studentResultService } from './studentResultService';
import { ELEARNING_STUDENT_PROGRESS_COLLECTION } from '../components/modules/LessonFlowController';

export type PublicRouteType = 'exam' | 'assignment' | 'lesson' | 'game';

export interface ParsedPublicRoute {
  type: PublicRouteType;
  id: string;
}

export interface GuestStudentProfile {
  studentName: string;
  classOrSchool: string;
  guestCode: string;
  normalizedClass: string;
  startedAt: string;
}

const GUEST_PROFILE_STORAGE_KEY = 'eduplay_guest_student_profile';

/**
 * Kiểm tra window.location.pathname để phát hiện các đường dẫn chia sẻ công khai:
 * /exam/[id], /assignment/[id], /lesson/[id], /game/[id]
 */
export function extractPublicRouteFromPath(pathname?: string): ParsedPublicRoute | null {
  const rawPath = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!rawPath) return null;

  const patterns: Array<{ type: PublicRouteType; regex: RegExp }> = [
    { type: 'exam', regex: /^\/exams?\/([^/?#]+)\/?$/i },
    { type: 'assignment', regex: /^\/assignments?\/([^/?#]+)\/?$/i },
    { type: 'lesson', regex: /^\/lessons?\/([^/?#]+)\/?$/i },
    { type: 'game', regex: /^\/games?\/([^/?#]+)\/?$/i },
  ];

  for (const item of patterns) {
    const match = rawPath.match(item.regex);
    if (match && match[1]) {
      try {
        const decoded = decodeURIComponent(match[1]).trim();
        if (decoded) {
          return { type: item.type, id: decoded };
        }
      } catch {
        const fallback = match[1].trim();
        if (fallback) {
          return { type: item.type, id: fallback };
        }
      }
    }
  }

  return null;
}

/**
 * Tự động đăng nhập ẩn danh (signInAnonymously) ngầm nếu Firestore yêu cầu xác thực,
 * tuyệt đối không bắt học sinh nhập mã PIN hay chọn danh sách học sinh của trường.
 */
export async function ensurePublicGuestAuth(): Promise<void> {
  if (!auth) return;
  if (auth.currentUser) return;
  try {
    await signInAnonymously(auth);
  } catch (err: any) {
    const code = err?.code || '';
    if (code !== 'auth/operation-not-allowed' && code !== 'auth/admin-restricted-operation') {
      console.warn('Guest anonymous sign-in warning:', err?.message || err);
    }
  }
}

/**
 * Sinh mã định danh học sinh tự do tương thích với định dạng mã học sinh của hệ thống
 * (Ví dụ: 3C26-27-9412) dựa trên tên và lớp/trường để lưu bài làm không bị chặn.
 */
export function buildGuestStudentCode(studentName: string, classOrSchool: string): string {
  const classMatch = (classOrSchool || '').toUpperCase().match(/([1-5][A-Z])/);
  const classPrefix = classMatch ? classMatch[1] : '3A';

  const seedStr = `${(studentName || '').trim().toLowerCase()}__${(classOrSchool || '')
    .trim()
    .toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 8999;
  }
  const sttNum = 9000 + Math.abs(hash || 101);
  return `${classPrefix}26-27-${sttNum}`;
}

/**
 * Đọc thông tin học sinh tự do đã lưu tạm trên trình duyệt (nếu có)
 */
export function getSavedGuestStudentProfile(): GuestStudentProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GUEST_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.studentName === 'string' && parsed.studentName.trim()) {
      return parsed as GuestStudentProfile;
    }
  } catch {}
  return null;
}

/**
 * Lưu thông tin học sinh tự do (Họ và tên + Lớp / Trường) và đồng bộ vào session tạm
 * để toàn bộ hệ thống chấm điểm/lưu bài hoạt động trơn tru.
 */
export function saveGuestStudentProfile(
  studentName: string,
  classOrSchool: string
): GuestStudentProfile {
  const cleanName = studentName.trim() || 'Học sinh tự do';
  const cleanClassOrSchool = classOrSchool.trim() || 'Học sinh tự do';
  const guestCode = buildGuestStudentCode(cleanName, cleanClassOrSchool);
  const classMatch = cleanClassOrSchool.toUpperCase().match(/([1-5][A-Z])/);
  const normalizedClass = classMatch ? `Lớp ${classMatch[1]}` : cleanClassOrSchool;

  const profile: GuestStudentProfile = {
    studentName: cleanName,
    classOrSchool: cleanClassOrSchool,
    guestCode,
    normalizedClass,
    startedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(profile));
      const guestSessionRecord = {
        id: guestCode,
        code: guestCode,
        studentCode: guestCode,
        maHs: guestCode,
        sddcn: guestCode,
        name: cleanName,
        fullName: cleanName,
        className: cleanClassOrSchool,
        class: cleanClassOrSchool,
        isGuest: true,
        academicYear: '2026-2027',
        avatar: '🐰',
      };
      localStorage.setItem('eduplay_student_session', JSON.stringify(guestSessionRecord));
      window.dispatchEvent(new Event('eduplay_student_session_updated'));
    } catch (e) {
      console.warn('Không thể lưu bộ nhớ tạm cho học sinh tự do:', e);
    }
  }

  return profile;
}

/**
 * Tải Đề kiểm tra trực tiếp từ Cloud Firestore theo ID trên URL (/exam/[id])
 */
export async function fetchPublicExamById(
  examId: string
): Promise<{ status: 'ok'; exam: ExamPaper } | { status: 'not_found' } | { status: 'error'; message?: string }> {
  const cleanId = (examId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensurePublicGuestAuth();

  if (db) {
    try {
      const exactRef = doc(db, 'exams', cleanId);
      let snap;
      try {
        snap = await getDocFromServer(exactRef);
      } catch {
        snap = await getDoc(exactRef);
      }

      if (snap && snap.exists()) {
        const examData = { id: snap.id, ...snap.data() } as ExamPaper;
        return { status: 'ok', exam: examData };
      }

      // Tìm kiếm dự phòng nếu ID trên link là rootId / originalExamId hoặc biến thể
      const allExamsSnap = await getDocs(collection(db, 'exams'));
      let matchedExam: ExamPaper | null = null;
      const lowerClean = cleanId.toLowerCase();
      const baseClean = lowerClean.replace(/-class-.*$/, '').replace(/^ex-/, '');

      allExamsSnap.forEach((docSnap) => {
        if (matchedExam) return;
        const data = docSnap.data();
        const docIdLower = docSnap.id.toLowerCase();
        const origIdLower = String(data.originalExamId || '').toLowerCase();
        const docBase = docIdLower.replace(/-class-.*$/, '').replace(/^ex-/, '');

        if (
          docIdLower === lowerClean ||
          (origIdLower && origIdLower === lowerClean) ||
          (baseClean && docBase === baseClean)
        ) {
          matchedExam = { id: docSnap.id, ...data } as ExamPaper;
        }
      });

      if (matchedExam) {
        return { status: 'ok', exam: matchedExam };
      }
    } catch (err) {
      console.warn('Firestore fetchPublicExamById fallback:', err);
    }
  }

  // Fallback sang bộ nhớ đệm hoặc dữ liệu khởi tạo
  const localPool = [...getLocalCachedExams(), ...INITIAL_EXAMS];
  const lowerClean = cleanId.toLowerCase();
  const baseClean = lowerClean.replace(/-class-.*$/, '').replace(/^ex-/, '');
  const foundLocal = localPool.find((e) => {
    if (!e?.id) return false;
    const eId = e.id.toLowerCase();
    const eOrig = (e.originalExamId || '').toLowerCase();
    const eBase = eId.replace(/-class-.*$/, '').replace(/^ex-/, '');
    return eId === lowerClean || (eOrig && eOrig === lowerClean) || (baseClean && eBase === baseClean);
  });

  if (foundLocal) {
    return { status: 'ok', exam: foundLocal };
  }

  return { status: 'not_found' };
}

/**
 * Tải Bài tập trực tiếp từ Cloud Firestore theo ID trên URL (/assignment/[id])
 */
export async function fetchPublicAssignmentById(
  assignmentId: string
): Promise<
  | { status: 'ok'; assignment: HomeworkAssignment }
  | { status: 'not_found' }
  | { status: 'error'; message?: string }
> {
  const cleanId = (assignmentId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensurePublicGuestAuth();

  if (db) {
    try {
      const exactRef = doc(db, 'assignments', cleanId);
      let snap;
      try {
        snap = await getDocFromServer(exactRef);
      } catch {
        snap = await getDoc(exactRef);
      }

      if (snap && snap.exists()) {
        const assignData = { id: snap.id, ...snap.data() } as HomeworkAssignment;
        return { status: 'ok', assignment: assignData };
      }

      const allAssignSnap = await getDocs(collection(db, 'assignments'));
      let matchedAssign: HomeworkAssignment | null = null;
      const lowerClean = cleanId.toLowerCase();
      const baseClean = lowerClean.replace(/-class-.*$/, '').replace(/^as-/, '');

      allAssignSnap.forEach((docSnap) => {
        if (matchedAssign) return;
        const data = docSnap.data();
        const docIdLower = docSnap.id.toLowerCase();
        const origIdLower = String(data.originalAssignmentId || '').toLowerCase();
        const docBase = docIdLower.replace(/-class-.*$/, '').replace(/^as-/, '');

        if (
          docIdLower === lowerClean ||
          (origIdLower && origIdLower === lowerClean) ||
          (baseClean && docBase === baseClean)
        ) {
          matchedAssign = { id: docSnap.id, ...data } as HomeworkAssignment;
        }
      });

      if (matchedAssign) {
        return { status: 'ok', assignment: matchedAssign };
      }
    } catch (err) {
      console.warn('Firestore fetchPublicAssignmentById fallback:', err);
    }
  }

  const localPool = [...getLocalCachedAssignments(), ...INITIAL_ASSIGNMENTS];
  const lowerClean = cleanId.toLowerCase();
  const baseClean = lowerClean.replace(/-class-.*$/, '').replace(/^as-/, '');
  const foundLocal = localPool.find((a) => {
    if (!a?.id) return false;
    const aId = a.id.toLowerCase();
    const aOrig = (a.originalAssignmentId || '').toLowerCase();
    const aBase = aId.replace(/-class-.*$/, '').replace(/^as-/, '');
    return aId === lowerClean || (aOrig && aOrig === lowerClean) || (baseClean && aBase === baseClean);
  });

  if (foundLocal) {
    return { status: 'ok', assignment: foundLocal };
  }

  return { status: 'not_found' };
}

/**
 * Tải Bài giảng E-learning trực tiếp từ Cloud Firestore theo ID trên URL (/lesson/[id])
 */
export async function fetchPublicLessonForGuest(
  lessonId: string
): Promise<
  | { status: 'ok'; lesson: Lesson5EPlan }
  | { status: 'not_found' }
  | { status: 'error'; message?: string }
> {
  const cleanId = (lessonId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensurePublicGuestAuth();

  if (db) {
    try {
      const ref = doc(db, ELEARNING_LESSONS_COLLECTION, cleanId);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch {
        snap = await getDoc(ref);
      }

      if (snap && snap.exists()) {
        const lesson = { id: snap.id, ...snap.data() } as Lesson5EPlan;
        return { status: 'ok', lesson };
      }

      // Kiểm tra thêm trong bảng elearning_lessons theo id không phân biệt hoa thường
      const allLessonsSnap = await getDocs(collection(db, ELEARNING_LESSONS_COLLECTION));
      let matchedLesson: Lesson5EPlan | null = null;
      const lowerClean = cleanId.toLowerCase();
      allLessonsSnap.forEach((docSnap) => {
        if (matchedLesson) return;
        if (docSnap.id.toLowerCase() === lowerClean) {
          matchedLesson = { id: docSnap.id, ...docSnap.data() } as Lesson5EPlan;
        }
      });

      if (matchedLesson) {
        return { status: 'ok', lesson: matchedLesson };
      }
    } catch (err) {
      console.warn('Firestore fetchPublicLessonForGuest fallback:', err);
    }
  }

  const localPool = [...getLocalCachedLessons(), ...INITIAL_LESSONS];
  const lowerClean = cleanId.toLowerCase();
  const foundLocal = localPool.find((l) => l?.id && l.id.toLowerCase() === lowerClean);
  if (foundLocal) {
    return { status: 'ok', lesson: foundLocal };
  }

  return { status: 'not_found' };
}

export type PublicGameFetchedData =
  | { kind: 'arena'; game: GameItem }
  | { kind: 'quizzi'; quizzi: QuizziGameItem };

/**
 * Tải Trò chơi học tập (cả Phòng thi đấu GameItem trong 'games' và Trò chơi Quizzi trong 'quizzi_games')
 * trực tiếp từ Cloud Firestore theo ID trên URL (/game/[id])
 */
export async function fetchPublicGameForGuest(
  gameId: string
): Promise<
  | { status: 'ok'; data: PublicGameFetchedData }
  | { status: 'not_found' }
  | { status: 'error'; message?: string }
> {
  const cleanId = (gameId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensurePublicGuestAuth();

  if (db) {
    // 1. Kiểm tra collection 'games' (Phòng thi đấu Rung Chuông Vàng, Đua Thuyền, Flashcards...)
    try {
      const gameRef = doc(db, 'games', cleanId);
      let gameSnap;
      try {
        gameSnap = await getDocFromServer(gameRef);
      } catch {
        gameSnap = await getDoc(gameRef);
      }

      if (gameSnap && gameSnap.exists()) {
        const game = { id: gameSnap.id, ...gameSnap.data() } as GameItem;
        return { status: 'ok', data: { kind: 'arena', game } };
      }
    } catch (err) {
      console.warn('Firestore games check fallback:', err);
    }

    // 2. Kiểm tra collection 'quizzi_games' (Trò chơi Quizzi / HTML tự chứa)
    try {
      const quizziRef = doc(db, QUIZZI_COLLECTION, cleanId);
      let quizziSnap;
      try {
        quizziSnap = await getDocFromServer(quizziRef);
      } catch {
        quizziSnap = await getDoc(quizziRef);
      }

      if (quizziSnap && quizziSnap.exists()) {
        const quizzi = { id: quizziSnap.id, ...quizziSnap.data() } as QuizziGameItem;
        return { status: 'ok', data: { kind: 'quizzi', quizzi } };
      }
    } catch (err) {
      console.warn('Firestore quizzi_games check fallback:', err);
    }

    // 3. Quét tìm kiếm dự phòng theo ID không phân biệt hoa thường
    try {
      const allGamesSnap = await getDocs(collection(db, 'games'));
      let matchedArena: GameItem | null = null;
      const lowerClean = cleanId.toLowerCase();
      allGamesSnap.forEach((docSnap) => {
        if (matchedArena) return;
        const data = docSnap.data();
        if (
          docSnap.id.toLowerCase() === lowerClean ||
          String(data.originalGameId || '').toLowerCase() === lowerClean
        ) {
          matchedArena = { id: docSnap.id, ...data } as GameItem;
        }
      });
      if (matchedArena) {
        return { status: 'ok', data: { kind: 'arena', game: matchedArena } };
      }
    } catch {}
  }

  // 4. Fallback sang bộ nhớ cục bộ
  const localArenaPool = [...getLocalCachedGames(), ...INITIAL_GAMES];
  const lowerClean = cleanId.toLowerCase();
  const foundArena = localArenaPool.find(
    (g) =>
      g?.id &&
      (g.id.toLowerCase() === lowerClean ||
        String(g.originalGameId || '').toLowerCase() === lowerClean)
  );
  if (foundArena) {
    return { status: 'ok', data: { kind: 'arena', game: foundArena } };
  }

  const localQuizziPool = getLocalCachedQuizziGames();
  const foundQuizzi = localQuizziPool.find(
    (q) => q?.id && String(q.id).toLowerCase() === lowerClean
  );
  if (foundQuizzi) {
    return { status: 'ok', data: { kind: 'quizzi', quizzi: foundQuizzi } };
  }

  return { status: 'not_found' };
}

/**
 * Lưu bài làm Đề kiểm tra của Học sinh tự do lên Cloud Firestore để giáo viên theo dõi
 */
export async function saveGuestExamSubmissionToFirestore(params: {
  exam: ExamPaper;
  guestProfile: GuestStudentProfile;
  answers: Record<number, any>;
  scoreNumber: number;
  scoreLabel: string;
  rankLabel: string;
  correctCount: number;
  totalQuestions: number;
  submittedTime: string;
}): Promise<void> {
  const {
    exam,
    guestProfile,
    answers,
    scoreNumber,
    scoreLabel,
    rankLabel,
    correctCount,
    totalQuestions,
    submittedTime,
  } = params;

  await ensurePublicGuestAuth();

  const studentCode = guestProfile.guestCode;
  const displayStudentName = `${guestProfile.studentName} (${guestProfile.classOrSchool})`;
  const officialExamId = exam.id;
  const fixedDocId = `${studentCode}_${officialExamId}_1`;

  const answersById: Record<string, any> = {};
  (exam.questions || []).forEach((q: any, idx: number) => {
    const key = q.id || `q_${idx}`;
    answersById[key] = answers[idx];
  });

  const submissionPayload = removeUndefined({
    id: fixedDocId,
    recordType: 'exam',
    type: 'exam',
    submissionType: 'exam',
    isGuest: true,
    isGuestSubmission: true,
    examId: officialExamId,
    studentId: studentCode,
    studentCode,
    maHs: studentCode,
    sddcn: studentCode,
    studentPersistentId: studentCode,
    studentName: guestProfile.studentName,
    displayStudentName,
    studentClass: guestProfile.classOrSchool,
    className: guestProfile.classOrSchool,
    guestSchoolOrClass: guestProfile.classOrSchool,
    academicYear: '2026-2027',
    title: exam.title,
    subject: exam.subject || 'Môn học',
    rank: rankLabel,
    score: scoreLabel,
    totalScore: scoreNumber,
    scoreNumber,
    correctCount,
    totalQuestions,
    submittedAt: submittedTime,
    submittedTime,
    attempts: 1,
    attemptNumber: 1,
    answers,
    answersById,
    feedback:
      scoreNumber >= 8
        ? 'Làm bài xuất sắc, nắm chắc kiến thức.'
        : scoreNumber >= 5
        ? 'Đã hoàn thành đạt yêu cầu.'
        : 'Cần ôn tập và rèn luyện thêm.',
    updatedAt: new Date().toISOString(),
  });

  if (db && officialExamId) {
    try {
      const subDocRef = doc(db, 'exams', officialExamId, 'submissions', fixedDocId);
      await setDoc(subDocRef, submissionPayload, { merge: true });
    } catch (err) {
      console.warn('Lưu subcollection bài thi học sinh tự do warning:', err);
    }

    try {
      const examRef = doc(db, 'exams', officialExamId);
      await runTransaction(db, async (transaction) => {
        const examSnap = await transaction.get(examRef);
        if (!examSnap.exists()) return;
        const currentData = examSnap.data();
        const existingSubs = Array.isArray(currentData.submissions)
          ? [...currentData.submissions]
          : [];
        const filtered = existingSubs.filter(
          (s: any) => String(s?.id || '') !== fixedDocId && String(s?.studentCode || '') !== studentCode
        );
        filtered.unshift(submissionPayload);
        transaction.update(examRef, {
          submissions: filtered,
          updatedAt: new Date().toISOString(),
        });
      });
    } catch (err) {
      console.warn('Cập nhật mảng submissions trên đề thi warning:', err);
    }
  }

  try {
    await studentResultService.saveFullExamSubmission(studentCode, officialExamId, submissionPayload);
    await studentResultService.saveExamResult(studentCode, officialExamId, {
      score: scoreNumber,
      maxScore: 10,
      submittedAt: submittedTime,
      type: 'exam',
    });
  } catch {}
}

/**
 * Lưu bài làm Bài tập của Học sinh tự do lên Cloud Firestore để giáo viên theo dõi
 */
export async function saveGuestAssignmentSubmissionToFirestore(params: {
  assignment: HomeworkAssignment;
  guestProfile: GuestStudentProfile;
  answers: Record<number, any>;
  scoreNumber: number;
  scoreLabel: string;
  correctCount: number;
  totalQuestions: number;
  submittedTime: string;
}): Promise<void> {
  const {
    assignment,
    guestProfile,
    answers,
    scoreNumber,
    scoreLabel,
    correctCount,
    totalQuestions,
    submittedTime,
  } = params;

  await ensurePublicGuestAuth();

  const studentCode = guestProfile.guestCode;
  const assignmentId = assignment.id;

  const submissionRecord = removeUndefined({
    id: `sub-${assignmentId}-${studentCode}`,
    recordType: 'assignment',
    type: 'assignment',
    submissionType: 'assignment',
    isGuest: true,
    isGuestSubmission: true,
    assignmentId,
    studentId: studentCode,
    studentCode,
    maHs: studentCode,
    code: studentCode,
    studentName: guestProfile.studentName,
    studentClass: guestProfile.classOrSchool,
    className: guestProfile.classOrSchool,
    guestSchoolOrClass: guestProfile.classOrSchool,
    score: scoreNumber,
    scoreLabel,
    totalScore: scoreNumber,
    correctCount,
    totalQuestions,
    submittedAt: submittedTime,
    submittedTime,
    answers,
    status: 'submitted',
    updatedAt: new Date().toISOString(),
  });

  if (db && assignmentId) {
    try {
      const subDocRef = doc(db, 'assignments', assignmentId, 'submissions', studentCode);
      await setDoc(subDocRef, submissionRecord, { merge: true });
    } catch (err) {
      console.warn('Lưu subcollection bài tập học sinh tự do warning:', err);
    }

    try {
      const assignRef = doc(db, 'assignments', assignmentId);
      await runTransaction(db, async (transaction) => {
        const assignSnap = await transaction.get(assignRef);
        if (!assignSnap.exists()) return;
        const currentData = assignSnap.data();
        const existingSubs = Array.isArray(currentData.submissions)
          ? [...currentData.submissions]
          : [];
        const filtered = existingSubs.filter(
          (s: any) => String(s?.studentCode || s?.studentId || '') !== studentCode
        );
        filtered.push(submissionRecord);
        transaction.set(
          assignRef,
          {
            submissions: filtered,
            submittedCount: filtered.length,
            completedCount: filtered.length,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      });
    } catch (err) {
      console.warn('Cập nhật mảng submissions trên bài tập warning:', err);
    }
  }

  try {
    await studentResultService.saveAssignmentResult(studentCode, {
      assignmentId,
      score: scoreNumber,
      maxScore: 10,
      submittedAt: submittedTime,
      answers,
      keepAttempts: 'last',
    });
  } catch {}
}

/**
 * Lưu tiến độ & kết quả học Bài giảng E-learning của Học sinh tự do lên Firestore
 */
export async function saveGuestLessonProgressToFirestore(
  lesson: Lesson5EPlan,
  guestProfile: GuestStudentProfile,
  progressData: Record<string, any>
): Promise<void> {
  await ensurePublicGuestAuth();

  const studentCode = guestProfile.guestCode;
  const docId = `${studentCode}___${lesson.id}`;
  const payload = removeUndefined({
    ...progressData,
    studentId: studentCode,
    studentCode,
    studentName: guestProfile.studentName,
    className: guestProfile.classOrSchool,
    studentClass: guestProfile.classOrSchool,
    isGuest: true,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    academicYear: '2026-2027',
    updatedAt: new Date().toISOString(),
  });

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        `viet_elearning_student_progress_${studentCode}_${lesson.id}`,
        JSON.stringify(payload)
      );
    } catch {}
  }

  if (db) {
    try {
      const ref = doc(db, ELEARNING_STUDENT_PROGRESS_COLLECTION, docId);
      await setDoc(ref, payload, { merge: true });
    } catch (err) {
      console.warn('Lưu tiến độ bài giảng học sinh tự do warning:', err);
    }
  }
}
