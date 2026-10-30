import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { ExamPaper, QuestionItem } from '../types';
import { TrackingSubmissionStudent } from '../components/modules/ExamManagementModule';
import { generateSubmissionWordBlob } from './studentSubmissionWordService';
import { QuestionEvaluation } from '../components/modules/StudentSubmissionDetailModal';
import { extractStudentAnswer } from '../components/modules/StudentSubmissionDetailModal';
import { checkQuestionCorrectLocal } from '../components/modules/StudentExamModule';
import { normalizeQuestionType } from '../lib/constants';

export interface BulkZipOptions {
  trackingExam: ExamPaper;
  studentsList: TrackingSubmissionStudent[];
  scope: 'all' | 'filtered';
  attemptMode: 'highest_score' | 'latest';
  onProgress?: (current: number, total: number, studentName: string) => void;
}

/**
 * Loại bỏ dấu tiếng Việt để đặt tên file an toàn
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[\/\s\\:\*\?"<>\|]+/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

/**
 * Tạo và tải file ZIP chứa toàn bộ bài làm Word của học sinh và file tổng hợp Excel
 */
export async function downloadBulkSubmissionsZip(options: BulkZipOptions): Promise<{ successCount: number; errors: { name: string; error: string }[] }> {
  const { trackingExam, studentsList, onProgress } = options;

  const targetStudents = studentsList.filter(st => st.status === 'submitted' || st.totalScore !== null);

  if (targetStudents.length === 0) {
    throw new Error('Không có học sinh nào đã nộp bài để tải!');
  }

  const zip = new JSZip();
  let successCount = 0;
  const errors: { name: string; error: string }[] = [];
  const excelRows: any[] = [];

  const questions: QuestionItem[] = trackingExam.questions || [];
  const totalStudents = targetStudents.length;

  for (let i = 0; i < totalStudents; i++) {
    const st = targetStudents[i];
    const stt = i + 1;
    const studentName = st.name || 'HocSinh';
    const rawSub = st.rawSubmission || st;
    const studentCode = st.id || rawSub.studentCode || rawSub.maHs || `HS${stt}`;

    if (onProgress) {
      onProgress(i + 1, totalStudents, studentName);
    }

    try {
      const evaluations: QuestionEvaluation[] = questions.map((q, qIdx) => {
        const rawChoice = extractStudentAnswer(q, qIdx, rawSub);
        let isCorrect = false;

        if (rawChoice !== undefined && rawChoice !== null) {
          if (q.statements && q.statements.length > 0) {
            const studentStmts = (typeof rawChoice === 'object' && rawChoice !== null) ? rawChoice : {};
            isCorrect = q.statements.every((stItem: any, sIdx: number) => studentStmts[sIdx] === stItem.isCorrect);
          } else {
            isCorrect = checkQuestionCorrectLocal(q, rawChoice);
          }
        }

        const qAny = q as any;
        const pts = qAny.points !== undefined ? Number(qAny.points) : (10 / (questions.length || 1));

        return {
          questionId: q.id || `q-${qIdx}`,
          questionIndex: qIdx,
          question: q,
          points: pts,
          isCorrect,
          isAnswered: rawChoice !== undefined && rawChoice !== null && rawChoice !== '',
          studentChoice: rawChoice
        };
      });

      const correctCount = evaluations.filter(e => e.isCorrect).length;
      const totalCount = evaluations.length || 1;
      const calcScore = st.totalScore !== null && st.totalScore !== undefined ? Number(st.totalScore) : Math.round((correctCount / totalCount) * 10 * 10) / 10;
      const scoreOutOf10 = calcScore;

      const stats = {
        correctCount,
        totalCount: evaluations.length,
        calculatedScore: calcScore,
        scoreOutOf10
      };

      const wordBlob = generateSubmissionWordBlob({
        targetItem: trackingExam,
        studentName,
        studentCode,
        className: trackingExam.targetClass,
        submittedTime: st.submittedTime,
        attempts: st.attempts || 1,
        evaluations,
        stats,
        mode: 'exam'
      });

      const cleanNameNoAccent = removeVietnameseAccents(studentName);
      const docFileName = `${stt}_${studentCode}_${cleanNameNoAccent}.docx`;

      zip.file(docFileName, wordBlob);
      successCount++;

      excelRows.push({
        'STT': stt,
        'Mã HS': studentCode,
        'Họ và tên học sinh': studentName,
        'Điểm số': calcScore,
        'Số lần làm': st.attempts || 1,
        'Thời gian nộp': st.submittedTime || '---'
      });
    } catch (err: any) {
      console.warn(`Lỗi tạo file bài làm cho học sinh ${studentName}:`, err);
      errors.push({
        name: studentName,
        error: err?.message || String(err)
      });
    }
  }

  try {
    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tổng Hợp Bài Nộp');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    zip.file('DanhSach_TongHop.xlsx', excelBuffer);
  } catch (err) {
    console.warn('Lỗi tạo file Excel tổng hợp trong ZIP:', err);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  const examAny = trackingExam as any;
  const classNameClean = removeVietnameseAccents(trackingExam.targetClass || 'Lop');
  const subjectClean = removeVietnameseAccents(trackingExam.subject || 'MonHoc');
  const examTypeClean = removeVietnameseAccents(trackingExam.examType || examAny.type || examAny.testType || 'KiemTra');
  const schoolYearClean = removeVietnameseAccents(examAny.academicYear || examAny.schoolYear || '2026-2027');

  const zipFileName = `BaiLam_${classNameClean}_${subjectClean}_${examTypeClean}_${schoolYearClean}.zip`;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  return { successCount, errors };
}
