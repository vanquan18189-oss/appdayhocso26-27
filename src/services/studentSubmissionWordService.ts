import { QuestionItem } from '../types';
import { 
  formatScore, 
  isSubjectWithScore, 
  getQualitativeLabel, 
  formatSubmissionDateTime 
} from '../utils/scoreUtils';
import { normalizeQuestionType, getQuestionTypeLabel } from '../lib/constants';
import { QuestionEvaluation } from '../components/modules/StudentSubmissionDetailModal';

export interface GenerateSubmissionWordOptions {
  targetItem: {
    id: string;
    title: string;
    subject: string;
    grade?: string;
    targetClass?: string;
    durationMinutes?: number;
    examType?: string;
    type?: string;
    academicYear?: string;
    schoolYear?: string;
    [key: string]: any;
  } | null;
  studentName: string;
  studentCode: string;
  className?: string;
  submittedTime?: string;
  attempts?: number | string;
  evaluations: QuestionEvaluation[];
  stats: {
    correctCount: number;
    totalCount: number;
    calculatedScore: number;
    scoreOutOf10: number;
  };
  mode: 'assignment' | 'exam';
}

/**
 * Tạo tên file Word theo đúng định dạng chuẩn:
 * BaiLam_[MãHS]_[TênHS]_[Môn]_[Lớp].docx
 */
export function buildSubmissionWordFileName(options: {
  studentCode?: string;
  studentName?: string;
  subject?: string;
  className?: string;
}): string {
  const sanitize = (val?: string) => {
    if (!val) return '';
    return val
      .trim()
      .replace(/[\/\s\\:\*\?"<>\|]+/g, '')
      .replace(/_+/g, '_');
  };

  const code = sanitize(options.studentCode) || 'HS';
  const name = sanitize(options.studentName) || 'HocSinh';
  const subject = sanitize(options.subject) || 'MonHoc';
  const cls = sanitize(options.className) || 'Lop';

  return `BaiLam_${code}_${name}_${subject}_${cls}.docx`;
}

/**
 * Trích xuất tiêu đề tự động dòng 1 theo yêu cầu:
 * "ĐỀ KIỂM TRA [GIỮA KÌ 1 / CUỐI KÌ 1 / GIỮA KÌ 2 / CUỐI KÌ 2]"
 */
export function resolveExamHeaderTitle(targetItem: any, mode: 'assignment' | 'exam'): string {
  if (mode === 'assignment') {
    return 'BÀI TẬP VỀ NHÀ & LUYỆN TẬP';
  }

  const rawType = String(targetItem?.examType || targetItem?.type || targetItem?.testType || targetItem?.title || '').trim();
  const lower = rawType.toLowerCase();

  if (lower.includes('giữa') && (lower.includes('1') || (lower.includes('i') && !lower.includes('ii')))) {
    return 'ĐỀ KIỂM TRA GIỮA HỌC KÌ 1';
  }
  if (lower.includes('cuối') && (lower.includes('1') || (lower.includes('i') && !lower.includes('ii')))) {
    return 'ĐỀ KIỂM TRA CUỐI HỌC KÌ 1';
  }
  if (lower.includes('giữa') && (lower.includes('2') || lower.includes('ii'))) {
    return 'ĐỀ KIỂM TRA GIỮA HỌC KÌ 2';
  }
  if (lower.includes('cuối') && (lower.includes('2') || lower.includes('ii'))) {
    return 'ĐỀ KIỂM TRA CUỐI HỌC KÌ 2';
  }
  if (lower.includes('thường xuyên')) {
    return 'ĐỀ KIỂM TRA THƯỜNG XUYÊN';
  }
  if (lower.includes('15')) {
    return 'ĐỀ KIỂM TRA 15 PHÚT';
  }
  if (rawType) {
    const cleanUpper = rawType.toUpperCase();
    return cleanUpper.startsWith('ĐỀ KIỂM TRA') ? cleanUpper : `ĐỀ KIỂM TRA ${cleanUpper}`;
  }
  return 'ĐỀ KIỂM TRA';
}

/**
 * Tạo Blob chứa nội dung file Word (.doc/.docx chuẩn HTML)
 */
export function generateSubmissionWordBlob(options: GenerateSubmissionWordOptions): Blob {
  const { targetItem, studentName, studentCode, submittedTime, attempts, evaluations, stats, mode } = options;

  const resolvedClass = options.className || targetItem?.targetClass || '';
  const fileName = buildSubmissionWordFileName({
    studentCode,
    studentName,
    subject: targetItem?.subject,
    className: resolvedClass
  });

  const line1Title = resolveExamHeaderTitle(targetItem, mode);

  const line2Parts: string[] = [];
  if (targetItem?.subject) line2Parts.push(`Môn: ${targetItem.subject}`);
  if (targetItem?.grade) line2Parts.push(`Khối: ${targetItem.grade}`);
  if (resolvedClass) line2Parts.push(`Lớp: ${resolvedClass}`);
  const line2Text = line2Parts.join(' - ');

  const line3Parts: string[] = [];
  const academicYear = targetItem?.academicYear || targetItem?.schoolYear || '2026 - 2027';
  if (academicYear) line3Parts.push(`Năm học: ${academicYear}`);
  const duration = targetItem?.durationMinutes || targetItem?.duration;
  if (duration) line3Parts.push(`Thời gian làm bài: ${duration} phút`);
  const line3Text = line3Parts.join(' - ');

  const studentInfoItems: { label: string; value: string }[] = [];
  if (studentName) studentInfoItems.push({ label: 'Họ và tên học sinh', value: studentName });
  if (studentCode) studentInfoItems.push({ label: 'Mã số học sinh', value: studentCode });
  if (resolvedClass) studentInfoItems.push({ label: 'Lớp', value: resolvedClass });
  if (submittedTime) studentInfoItems.push({ label: 'Thời gian nộp bài', value: formatSubmissionDateTime(submittedTime) });
  if (attempts !== undefined && attempts !== null && attempts !== '') {
    studentInfoItems.push({ label: 'Số lần làm bài', value: `${attempts} lần` });
  }

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${fileName}</title>
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; color: #000000; line-height: 1.6; margin: 20px; }
        h1 { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
        h2 { text-align: center; font-size: 12pt; font-weight: bold; margin-bottom: 4px; color: #333; }
        .sub-header { text-align: center; font-size: 11pt; color: #555; margin-bottom: 20px; }
        .box { border: 1px solid #ccc; background-color: #f9f9f9; padding: 12px 16px; margin-bottom: 15px; border-radius: 6px; }
        .box-title { font-weight: bold; font-size: 11.5pt; margin-bottom: 6px; color: #111; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 15px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; font-size: 11pt; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .question-card { border: 1px solid #ddd; background-color: #fff; padding: 12px 16px; margin-bottom: 12px; border-radius: 6px; }
        .correct { color: #047857; font-weight: bold; }
        .incorrect { color: #be123c; font-weight: bold; }
        .explanation { background-color: #fefce8; border: 1px solid #fde047; padding: 8px 12px; margin-top: 8px; font-size: 11pt; color: #713f12; }
      </style>
    </head>
    <body>
      <div style="text-align: center; font-size: 10pt; font-weight: bold; color: #4f46e5; text-transform: uppercase; margin-bottom: 5px;">
        HỆ THỐNG DẠY VÀ HỌC SỐ PK TRỰC KHANG
      </div>
      <h1>${line1Title}</h1>
      ${line2Text ? `<h2>${line2Text}</h2>` : ''}
      ${line3Text ? `<div class="sub-header">${line3Text}</div>` : ''}

      <!-- Thông tin học sinh -->
      <div class="box">
        <div class="box-title">Thông tin học sinh</div>
        <table style="border: none; margin: 0;">
          ${studentInfoItems.map((item, idx) => {
            if (idx % 2 === 0) {
              const nextItem = studentInfoItems[idx + 1];
              return `
                <tr style="border: none;">
                  <td style="border: none; text-align: left; padding: 4px 0;"><strong>${item.label}:</strong> ${item.value}</td>
                  <td style="border: none; text-align: left; padding: 4px 0;">${nextItem ? `<strong>${nextItem.label}:</strong> ${nextItem.value}` : ''}</td>
                </tr>
              `;
            }
            return '';
          }).join('')}
        </table>
      </div>

      <!-- Kết quả tổng quan -->
      <div class="box" style="background-color: #fff1f2; border-color: #fecdd3;">
        <div class="box-title" style="color: #881337;">Kết quả bài làm</div>
        <p style="margin: 4px 0;"><strong>Số câu đúng:</strong> <span class="correct">${stats.correctCount}/${stats.totalCount} câu</span></p>
        <p style="margin: 4px 0;"><strong>Tổng số câu hỏi:</strong> ${stats.totalCount} câu</p>
        ${isSubjectWithScore(targetItem?.subject) ? `
          <p style="margin: 4px 0;"><strong>Điểm ${mode === 'assignment' ? 'bài tập' : 'bài thi'}:</strong> <span class="incorrect">${stats.calculatedScore}</span></p>
          <p style="margin: 4px 0;"><strong>Điểm thang 10:</strong> <span class="incorrect" style="font-size: 13pt;">${stats.scoreOutOf10}</span></p>
        ` : `
          <p style="margin: 4px 0;"><strong>Mức đánh giá:</strong> <span class="correct">${getQualitativeLabel(stats.correctCount, stats.totalCount)}</span></p>
        `}
      </div>

      <!-- Bảng điểm tóm tắt -->
      <div style="font-weight: bold; font-size: 11pt; text-transform: uppercase; margin-bottom: 6px;">Bảng điểm tổng hợp theo từng câu</div>
      <table>
        <tr>
          <th style="text-align: left; width: 100px;">Câu hỏi</th>
          ${evaluations.map(e => `<th>${e.questionIndex + 1}</th>`).join('')}
        </tr>
        <tr>
          <td style="text-align: left; font-weight: bold;">Điểm</td>
          ${evaluations.map(e => `<td>${e.isCorrect ? formatScore(e.points) : '0'}</td>`).join('')}
        </tr>
        <tr>
          <td style="text-align: left; font-weight: bold;">Kết quả</td>
          ${evaluations.map(e => `<td>${e.isCorrect ? '✓ Đúng' : '✗ Sai'}</td>`).join('')}
        </tr>
      </table>

      <br/>
      <div style="font-weight: bold; font-size: 12pt; text-transform: uppercase; border-bottom: 2px solid #4f46e5; padding-bottom: 4px; margin-bottom: 15px;">
        Chi tiết từng câu hỏi trong bài (${evaluations.length} câu)
      </div>

      ${evaluations.map((evalItem) => {
        const q = evalItem.question;
        const qIdx = evalItem.questionIndex;
        const qType = normalizeQuestionType(q.type);
        const isPass = evalItem.isCorrect;
        const studentChoice = evalItem.studentChoice;
        const isAnswered = evalItem.isAnswered;

        let answersHtml = '';

        if (qType === 'multiple_choice' && q.options && q.options.length > 0) {
          const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
          answersHtml = q.options.map((optText, oIdx) => {
            const letter = letters[oIdx] || String.fromCharCode(65 + oIdx);
            const isCorrectOpt = String(q.correctAnswer || '').trim().toUpperCase() === letter ||
                                 String(q.correctAnswer || '').trim().toLowerCase() === String(optText).trim().toLowerCase();

            let isSelected = false;
            if (typeof studentChoice === 'number') {
              isSelected = studentChoice === oIdx;
            } else if (typeof studentChoice === 'string') {
              isSelected = studentChoice.trim().toUpperCase() === letter ||
                           studentChoice.trim().toLowerCase() === String(optText).trim().toLowerCase();
            }

            let styleMark = '';
            if (isSelected && isCorrectOpt) {
              styleMark = '<strong>[✓ Đúng / Học sinh chọn]</strong>';
            } else if (isSelected && !isCorrectOpt) {
              styleMark = '<strong style="color: #be123c;">[✗ Học sinh chọn]</strong>';
            } else if (!isSelected && isCorrectOpt) {
              styleMark = '<strong style="color: #047857;">[Đáp án đúng]</strong>';
            }

            return `<div style="margin: 4px 0;"><strong>${letter}.</strong> ${optText} ${styleMark}</div>`;
          }).join('');
        } else if (qType === 'true_false') {
          if (q.statements && q.statements.length > 0) {
            answersHtml = q.statements.map((stmt: any, sIdx: number) => {
              const studentStmtChoice = (typeof studentChoice === 'object' && studentChoice !== null) ? studentChoice[sIdx] : undefined;
              const isStmtCorrect = studentStmtChoice === stmt.isCorrect;
              return `<div style="margin: 4px 0;">- ${stmt.text || stmt.content} | Đáp án: <strong>${stmt.isCorrect ? 'Đúng' : 'Sai'}</strong> | HS chọn: <strong style="${isStmtCorrect ? 'color:#047857;' : 'color:#be123c;'}">${studentStmtChoice === undefined ? 'Chưa chọn' : (studentStmtChoice ? 'Đúng' : 'Sai')}</strong></div>`;
            }).join('');
          } else {
            answersHtml = `<div>Đáp án đúng: <strong>${String(q.correctAnswer)}</strong> | Học sinh chọn: <strong style="${isPass ? 'color:#047857;' : 'color:#be123c;'}">${String(studentChoice ?? 'Chưa trả lời')}</strong></div>`;
          }
        } else if (qType === 'matching' && q.matchingPairs && q.matchingPairs.length > 0) {
          answersHtml = q.matchingPairs.map((pair: any, pIdx: number) => {
            const studentMatched = (typeof studentChoice === 'object' && studentChoice !== null)
              ? (studentChoice[pIdx] !== undefined ? studentChoice[pIdx] : studentChoice[pair.left])
              : undefined;
            const isPairMatch = studentMatched && String(studentMatched).trim().toLowerCase() === String(pair.right).trim().toLowerCase();
            return `<div style="margin: 4px 0;">- ${pair.left} ➔ Đúng: ${pair.right} | HS nối: <strong style="${isPairMatch ? 'color:#047857;' : 'color:#be123c;'}">${studentMatched || 'Chưa nối'}</strong></div>`;
          }).join('');
        } else {
          answersHtml = `<div>Đáp án chuẩn: <strong>${q.correctAnswer || 'Giáo viên tự chấm'}</strong> | Câu trả lời của HS: <strong style="${isPass ? 'color:#047857;' : 'color:#be123c;'}">${studentChoice !== undefined && studentChoice !== '' ? String(studentChoice) : 'Chưa nhập'}</strong></div>`;
        }

        return `
          <div class="question-card">
            <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 6px;">
              <span style="color: ${isPass ? '#047857' : '#be123c'};">Câu ${qIdx + 1} (${formatScore(evalItem.points)}đ) - ${isPass ? 'ĐÚNG' : 'SAI'}</span>
              <span style="color: #666; font-size: 10pt;">${getQuestionTypeLabel(q.type)}</span>
            </div>
            <div style="font-weight: bold; margin-bottom: 8px;">${q.content}</div>
            ${!isAnswered ? '<div style="color: #d97706; margin-bottom: 6px;">⚠️ Học sinh chưa trả lời câu hỏi này.</div>' : ''}
            <div style="margin-bottom: 6px;">${answersHtml}</div>
            ${q.explanation ? `<div class="explanation"><strong>Giải thích / Gợi ý:</strong> ${q.explanation}</div>` : ''}
          </div>
        `;
      }).join('')}
    </body>
    </html>
  `;

  return new Blob(['\ufeff' + htmlContent], {
    type: 'application/msword'
  });
}

/**
 * Tạo và tải file Word (.doc) bài làm học sinh
 */
export async function downloadStudentSubmissionWord(options: GenerateSubmissionWordOptions): Promise<void> {
  const { studentCode, studentName, targetItem } = options;
  const resolvedClass = options.className || targetItem?.targetClass || '';
  const fileName = buildSubmissionWordFileName({
    studentCode,
    studentName,
    subject: targetItem?.subject,
    className: resolvedClass
  });

  const blob = generateSubmissionWordBlob(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/\.docx$/, '.doc');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
