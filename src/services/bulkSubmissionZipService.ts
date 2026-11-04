import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { ExamPaper, QuestionItem } from '../types';
import { TrackingSubmissionStudent } from '../components/modules/ExamManagementModule';
import { 
  generateSubmissionDocxBlob, 
  buildSubmissionDocxFileName,
  removeVietnameseAccents 
} from './studentSubmissionWordService';
import { QuestionEvaluation, extractStudentAnswer } from '../components/modules/StudentSubmissionDetailModal';
import { checkQuestionCorrectLocal } from '../components/modules/StudentExamModule';
import { buildExamWorkbook } from './excelService';

export interface BulkZipOptions {
  trackingExam: ExamPaper;
  studentsList: TrackingSubmissionStudent[];
  scope: 'all' | 'filtered';
  attemptMode: 'highest_score' | 'latest';
  onProgress?: (current: number, total: number, studentName: string, percent: number) => void;
}

/**
 * Tạo và tải file ZIP chứa toàn bộ bài làm Word (.docx) của học sinh và file tổng hợp Excel chuẩn hóa.
 * Tái sử dụng 100% hàm generateSubmissionDocxBlob của nút "Tải riêng" để đảm bảo mọi file Word trong ZIP
 * mở được trực tiếp trên Microsoft Word hoàn toàn không có lỗi format.
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

  const questions: QuestionItem[] = trackingExam.questions || [];
  const totalStudents = targetStudents.length;

  for (let i = 0; i < totalStudents; i++) {
    const st = targetStudents[i];
    const stt = i + 1;
    const studentName = st.name || 'HocSinh';
    const rawSub = st.rawSubmission || st;
    const studentCode = st.id || rawSub.studentCode || rawSub.maHs || `HS${stt}`;
    const percent = Math.round(((i + 1) / totalStudents) * 100);

    if (onProgress) {
      onProgress(i + 1, totalStudents, studentName, percent);
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
      const calcScore = st.totalScore !== null && st.totalScore !== undefined 
        ? Number(st.totalScore) 
        : Math.round((correctCount / totalCount) * 10 * 10) / 10;

      const stats = {
        correctCount,
        totalCount: evaluations.length,
        calculatedScore: calcScore,
        scoreOutOf10: calcScore
      };

      // TÁI SỬ DỤNG TRỰC TIẾP hàm generateSubmissionDocxBlob của nút "Tải riêng"
      const wordBlob = await generateSubmissionDocxBlob({
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

      if (!wordBlob || wordBlob.size === 0) {
        throw new Error('Không thể tạo file Word (kết quả rỗng).');
      }

      // Đặt tên tệp chuẩn: BaiLam_<MãHS>_<TênKhôngDấu>_<Môn>_<Lớp>.docx
      const docxFileName = buildSubmissionDocxFileName({
        studentCode,
        studentName,
        subject: trackingExam.subject,
        className: trackingExam.targetClass
      });

      zip.file(docxFileName, wordBlob);
      successCount++;
    } catch (err: any) {
      console.warn(`Lỗi tạo file bài làm cho học sinh ${studentName}:`, err);
      errors.push({
        name: studentName,
        error: err?.message || String(err)
      });
    }
  }

  // Đính kèm file Excel tổng hợp kết quả (dùng chung hàm xuất Excel chuẩn hóa buildExamWorkbook)
  try {
    const { workbook, defaultFilename } = buildExamWorkbook(trackingExam);
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    zip.file(defaultFilename || 'DanhSach_TongHop_KetQua.xlsx', excelBuffer);
  } catch (err) {
    console.warn('Lỗi tạo file Excel tổng hợp trong ZIP:', err);
  }

  // Nếu có lỗi ở học sinh nào, tạo file LOI.txt ghi nhận chi tiết
  if (errors.length > 0) {
    const loiContent = `BÁO CÁO LỖI TẠO FILE BÀI LÀM HỌC SINH\n=====================================\nTổng số lỗi: ${errors.length}\n\n` +
      errors.map((e, idx) => `${idx + 1}. Học sinh: ${e.name}\n   Chi tiết lỗi: ${e.error}\n`).join('\n');
    zip.file('LOI.txt', loiContent);
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
