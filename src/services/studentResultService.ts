import { doc, setDoc, getDocFromServer, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeStudentCode } from './studentCode';

export const STUDENT_RESULTS_COLLECTION = 'student_results';

export interface StudentResultDocument {
  studentCode: string;
  updatedAt: string;
  exams?: Record<string, any>;
  assignments?: Record<string, any>;
  lessons?: Record<string, any>;
  games?: Record<string, any>;
  hocba?: Record<string, any>;
}

// Định nghĩa chính sách lưu trữ lần làm bài cho bài tập
type KeepAttemptPolicy = 'last' | 'best' | 'all';

interface AssignmentSubmissionPayload {
  assignmentId: string;
  score: number;
  maxScore: number;
  submittedAt: string;
  attemptNumber?: number;
  answers?: Record<string, any>;
  keepAttempts?: KeepAttemptPolicy;
}

/**
 * Dịch vụ quản lý kết quả học tập tập trung theo studentCode
 */
export const studentResultService = {
  /**
   * Lưu kết quả làm bài tập của học sinh
   * Nếu cấu hình keepAttempts là 'last' (lần cuối), hệ thống ghi đè kết quả mới nhất.
   */
  async saveAssignmentResult(
    rawStudentCode: string, 
    payload: AssignmentSubmissionPayload
  ): Promise<boolean> {
    try {
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const policy: KeepAttemptPolicy = payload.keepAttempts || 'last';

      const assignmentData: any = {
        score: payload.score,
        maxScore: payload.maxScore,
        submittedAt: payload.submittedAt,
        attemptNumber: payload.attemptNumber || 1,
      };

      // Nếu chính sách là 'last', chỉ lưu câu trả lời hoặc chi tiết của lần nộp mới nhất
      if (policy === 'last') {
        assignmentData.lastAttempt = {
          score: payload.score,
          submittedAt: payload.submittedAt,
          answers: payload.answers || {},
        };
      } else if (policy === 'best') {
        assignmentData.bestScore = payload.score;
      }

      // Cập nhật cấu trúc lồng nhau dùng dot notation qua { merge: true } để không ghi đè dữ liệu môn khác
      const updatePayload = {
        studentCode,
        [`assignments.${payload.assignmentId}`]: assignmentData,
        updatedAt: new Date().toISOString(),
      };

      // Thực hiện ghi an toàn bằng setDoc merge
      await setDoc(docRef, updatePayload, { merge: true });

      // Xác thực ghi thành công bằng cách đọc lại trực tiếp từ server
      const verifySnap = await getDocFromServer(docRef);
      if (verifySnap.exists()) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('Lỗi khi lưu kết quả bài tập:', error);
      throw error;
    }
  },

  /**
   * Lưu kết quả bài kiểm tra (Exams)
   */
  async saveExamResult(
    rawStudentCode: string,
    examId: string,
    resultData: { score: number; maxScore: number; submittedAt: string; type?: string }
  ): Promise<boolean> {
    try {
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);

      const updatePayload = {
        studentCode,
        [`exams.${examId}`]: {
          ...resultData,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      await setDoc(docRef, updatePayload, { merge: true });
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu kết quả kiểm tra:', error);
      throw error;
    }
  },

  /**
   * Lưu kết quả trò chơi / đấu trường (Games)
   */
  async saveGameResult(
    rawStudentCode: string,
    gameId: string,
    resultData: { score: number; maxScore: number; rank: number | 'unranked'; submittedAt: string }
  ): Promise<boolean> {
    try {
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);

      const updatePayload = {
        studentCode,
        [`games.${gameId}`]: {
          ...resultData,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      await setDoc(docRef, updatePayload, { merge: true });
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu kết quả trò chơi:', error);
      throw error;
    }
  },

  /**
   * Tải kết quả bài kiểm tra (Exams) từ Firestore
   */
  async getExamSubmission(rawStudentCode: string, examId: string): Promise<any | null> {
    try {
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) return null;
      // Fetch from: student_results/{studentCode}/exams/{examId}
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'exams', examId);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      console.error('Lỗi khi tải bài kiểm tra từ Firestore:', error);
      return null;
    }
  },

  /**
   * Lưu toàn bộ kết quả bài kiểm tra (Exams) lên Firestore
   */
  async saveFullExamSubmission(
    rawStudentCode: string,
    examId: string,
    submissionData: any
  ): Promise<boolean> {
    try {
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      // Save to: student_results/{studentCode}/exams/{examId}
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'exams', examId);
      await setDoc(docRef, {
        ...submissionData,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu bài kiểm tra vào Firestore:', error);
      throw error;
    }
  },

  /**
   * Lưu toàn bộ kết quả bài tập (Assignments) lên Firestore
   */
  async saveFullAssignmentSubmission(
    rawStudentCode: string,
    assignmentId: string,
    submissionData: any
  ): Promise<boolean> {
    try {
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      // Save to: student_results/{studentCode}/assignments/{assignmentId}
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'assignments', assignmentId);
      await setDoc(docRef, {
        ...submissionData,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu bài tập vào Firestore:', error);
      throw error;
    }
  }
};
