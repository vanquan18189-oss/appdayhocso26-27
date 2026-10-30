import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { QuestionItem } from '../types';
import { 
  formatScore, 
  formatTotalScore, 
  isSubjectWithScore, 
  getQualitativeLabel, 
  formatSubmissionDateTime 
} from '../utils/scoreUtils';
import { normalizeQuestionType, getQuestionTypeLabel } from '../lib/constants';
import { QuestionEvaluation } from '../components/modules/StudentSubmissionDetailModal';

export interface GenerateSubmissionPdfOptions {
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
 * Tạo tên file PDF theo đúng định dạng chuẩn:
 * BaiLam_[MãHS]_[TênHS]_[Môn]_[Lớp].pdf
 * Ví dụ: BaiLam_5C26-27-9_ĐôngTuấnĐạt_CôngNghệ_Lớp5.pdf
 */
export function buildSubmissionPdfFileName(options: {
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

  return `BaiLam_${code}_${name}_${subject}_${cls}.pdf`;
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
 * Tự động tạo và tải file PDF bài làm học sinh về máy tính (100% Client-Side)
 */
export async function downloadStudentSubmissionPdf(options: GenerateSubmissionPdfOptions): Promise<void> {
  const { targetItem, studentName, studentCode, submittedTime, attempts, evaluations, stats, mode } = options;

  // 1. Xác định tên file
  const resolvedClass = options.className || targetItem?.targetClass || '';
  const fileName = buildSubmissionPdfFileName({
    studentCode,
    studentName,
    subject: targetItem?.subject,
    className: resolvedClass
  });

  // 2. Tạo phần tử DOM chuyên biệt cho bản in PDF
  const container = document.createElement('div');
  container.className = 'student-pdf-export-container';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: -9999px;
    width: 780px;
    padding: 32px 36px;
    background-color: #ffffff;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    box-sizing: border-box;
    z-index: -9999;
  `;

  // --- Header Dòng 1, 2, 3 ---
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

  // --- Khung thông tin học sinh ---
  const studentInfoItems: { label: string; value: string }[] = [];
  if (studentName) studentInfoItems.push({ label: 'Họ và tên học sinh', value: studentName });
  if (studentCode) studentInfoItems.push({ label: 'Mã số học sinh', value: studentCode });
  if (resolvedClass) studentInfoItems.push({ label: 'Lớp', value: resolvedClass });
  if (submittedTime) studentInfoItems.push({ label: 'Thời gian nộp bài', value: formatSubmissionDateTime(submittedTime) });
  if (attempts !== undefined && attempts !== null && attempts !== '') {
    studentInfoItems.push({ label: 'Số lần làm bài', value: `${attempts} lần` });
  }

  // --- Tạo HTML Header và Bảng tóm tắt ---
  const headerHtml = `
    <div class="pdf-header-section" style="border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px;">
      <div style="text-align: center; margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 800; color: #4f46e5; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px;">
          HỆ THỐNG DẠY VÀ HỌC SỐ PK TRỰC KHANG
        </div>
        <div style="font-size: 18px; font-weight: 900; color: #1e293b; text-transform: uppercase; margin-bottom: 6px;">
          ${line1Title}
        </div>
        ${line2Text ? `<div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 4px;">${line2Text}</div>` : ''}
        ${line3Text ? `<div style="font-size: 12px; font-weight: 600; color: #64748b;">${line3Text}</div>` : ''}
      </div>

      <!-- Khung thông tin học sinh -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin-bottom: 8px;">
          Thông tin học sinh & bài nộp
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px; font-size: 12.5px;">
          ${studentInfoItems.map(item => `
            <div>
              <span style="color: #64748b; font-weight: 600;">${item.label}:</span>
              <strong style="color: #0f172a; margin-left: 4px;">${item.value}</strong>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Khung kết quả tổng quan (Hồng nhạt đồng bộ giao diện) -->
      <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px;">
        <div style="font-size: 15px; font-weight: 900; color: #881337; margin-bottom: 8px;">
          ${studentName} đã hoàn thành ${mode === 'assignment' ? 'bài tập' : 'bài kiểm tra'} này!
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px; font-size: 12.5px; color: #4c0519;">
          <div>
            <span style="font-weight: 700;">Số câu đúng:</span>
            <strong style="color: #be123c; font-weight: 800; margin-left: 4px;">${stats.correctCount}/${stats.totalCount} câu</strong>
          </div>
          <div>
            <span style="font-weight: 700;">Tổng số câu hỏi:</span>
            <strong style="margin-left: 4px;">${stats.totalCount} câu</strong>
          </div>
          ${isSubjectWithScore(targetItem?.subject) ? `
            <div>
              <span style="font-weight: 700;">Điểm ${mode === 'assignment' ? 'bài tập' : 'bài thi'}:</span>
              <strong style="color: #e11d48; font-weight: 800; margin-left: 4px;">${stats.calculatedScore}</strong>
            </div>
            <div>
              <span style="font-weight: 700;">Điểm thang 10:</span>
              <strong style="color: #e11d48; font-weight: 900; font-size: 14px; margin-left: 4px;">${stats.scoreOutOf10}</strong>
            </div>
          ` : `
            <div>
              <span style="font-weight: 700;">Mức đánh giá:</span>
              <strong style="color: #047857; font-weight: 800; margin-left: 4px;">
                ${getQualitativeLabel(stats.correctCount, stats.totalCount)}
              </strong>
            </div>
          `}
        </div>
      </div>

      <!-- Bảng điểm tóm tắt theo từng câu -->
      <div style="margin-top: 14px;">
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 6px;">
          BẢNG ĐIỂM TỔNG HỢP THEO TỪNG CÂU
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11.5px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
              <th style="padding: 6px 8px; text-align: left; font-weight: 800; color: #1e293b; border-right: 1px solid #cbd5e1; width: 80px;">Câu hỏi</th>
              ${evaluations.map(e => `
                <th style="padding: 6px 4px; font-weight: 800; color: #92400e; background-color: #fef3c7; border-right: 1px solid #cbd5e1;">
                  ${e.questionIndex + 1}
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #cbd5e1; background-color: #ffffff;">
              <td style="padding: 6px 8px; text-align: left; font-weight: 700; color: #475569; border-right: 1px solid #cbd5e1;">Điểm</td>
              ${evaluations.map(e => `
                <td style="padding: 6px 4px; font-weight: 800; color: #0f172a; border-right: 1px solid #cbd5e1;">
                  ${e.isCorrect ? formatScore(e.points) : '0'}
                </td>
              `).join('')}
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 8px; text-align: left; font-weight: 700; color: #475569; border-right: 1px solid #cbd5e1;">Kết quả</td>
              ${evaluations.map(e => `
                <td style="padding: 6px 4px; border-right: 1px solid #cbd5e1;">
                  ${e.isCorrect ? `
                    <span style="display: inline-block; width: 18px; height: 18px; line-height: 18px; border-radius: 50%; background-color: #d1fae5; color: #047857; font-weight: 900; font-size: 11px;">✓</span>
                  ` : `
                    <span style="display: inline-block; width: 18px; height: 18px; line-height: 18px; border-radius: 50%; background-color: #ffe4e6; color: #be123c; font-weight: 900; font-size: 11px;">✗</span>
                  `}
                </td>
              `).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // --- Tạo HTML chi tiết từng câu hỏi ---
  const questionsHtml = evaluations.map((evalItem) => {
    const q = evalItem.question;
    const qIdx = evalItem.questionIndex;
    const qType = normalizeQuestionType(q.type);
    const isPass = evalItem.isCorrect;
    const studentChoice = evalItem.studentChoice;
    const isAnswered = evalItem.isAnswered;

    let answersDetailsHtml = '';

    // DẠNG 1: Trắc nghiệm 4 phương án
    if (qType === 'multiple_choice' && q.options && q.options.length > 0) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      answersDetailsHtml = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-top: 8px;">
          ${q.options.map((optText, oIdx) => {
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

            let borderStyle = '1px solid #e2e8f0';
            let bgStyle = '#ffffff';
            let badge = '';

            if (isSelected && isCorrectOpt) {
              borderStyle = '1.5px solid #10b981';
              bgStyle = '#ecfdf5';
              badge = '<span style="font-size: 10px; font-weight: 800; background-color: #a7f3d0; color: #065f46; padding: 2px 6px; border-radius: 4px;">✓ Đúng / Học sinh chọn</span>';
            } else if (isSelected && !isCorrectOpt) {
              borderStyle = '1.5px solid #f43f5e';
              bgStyle = '#fff1f2';
              badge = '<span style="font-size: 10px; font-weight: 800; background-color: #fecdd3; color: #9f1239; padding: 2px 6px; border-radius: 4px;">✗ Học sinh chọn</span>';
            } else if (!isSelected && isCorrectOpt) {
              borderStyle = '1.5px solid #34d399';
              bgStyle = '#f0fdf4';
              badge = '<span style="font-size: 10px; font-weight: 700; background-color: #d1fae5; color: #047857; padding: 2px 6px; border-radius: 4px;">Đáp án đúng</span>';
            }

            return `
              <div style="border: ${borderStyle}; background-color: ${bgStyle}; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 4px; background-color: #f1f5f9; font-weight: 700; color: #334155; font-size: 11px;">
                    ${letter}
                  </span>
                  <span style="font-weight: 600; color: #1e293b;">${optText}</span>
                </div>
                ${badge}
              </div>
            `;
          }).join('')}
        </div>
      `;
    } 
    // DẠNG 2: Đúng / Sai
    else if (qType === 'true_false') {
      if (q.statements && q.statements.length > 0) {
        answersDetailsHtml = `
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
            ${q.statements.map((stmt: any, sIdx: number) => {
              const studentStmtChoice = (typeof studentChoice === 'object' && studentChoice !== null) ? studentChoice[sIdx] : undefined;
              const isStmtCorrect = studentStmtChoice === stmt.isCorrect;
              return `
                <div style="border: 1px solid #e2e8f0; background-color: #ffffff; border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12px;">
                  <span style="font-weight: 600; color: #1e293b;">${sIdx + 1}. ${stmt.text || stmt.content}</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: #64748b;">Đáp án: <strong style="color: #047857;">${stmt.isCorrect ? 'Đúng' : 'Sai'}</strong></span>
                    <span style="padding: 2px 6px; border-radius: 4px; font-weight: 700; ${isStmtCorrect ? 'background-color: #d1fae5; color: #065f46;' : 'background-color: #ffe4e6; color: #9f1239;'}">
                      HS chọn: ${studentStmtChoice === undefined ? 'Chưa chọn' : (studentStmtChoice ? 'Đúng' : 'Sai')}
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else {
        answersDetailsHtml = `
          <div style="margin-top: 8px; padding: 8px 12px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px;">
            <div>Đáp án đúng: <strong style="color: #047857;">${String(q.correctAnswer)}</strong></div>
            <div>Học sinh trả lời: <strong style="color: ${isPass ? '#047857' : '#be123c'};">${String(studentChoice ?? 'Chưa trả lời')}</strong></div>
          </div>
        `;
      }
    } 
    // DẠNG 3: Nối cặp / Kéo thả
    else if (qType === 'matching' && q.matchingPairs && q.matchingPairs.length > 0) {
      answersDetailsHtml = `
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Các cặp ghép nối:</div>
          ${q.matchingPairs.map((pair: any, pIdx: number) => {
            const studentMatched = (typeof studentChoice === 'object' && studentChoice !== null)
              ? (studentChoice[pIdx] !== undefined ? studentChoice[pIdx] : studentChoice[pair.left])
              : undefined;
            const isPairMatch = studentMatched && String(studentMatched).trim().toLowerCase() === String(pair.right).trim().toLowerCase();

            return `
              <div style="border: 1px solid #e2e8f0; background-color: #ffffff; border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12px;">
                <strong style="color: #1e293b;">${pair.left}</strong>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="color: #047857; font-weight: 600;">➔ Đúng: ${pair.right}</span>
                  <span style="padding: 2px 6px; border-radius: 4px; font-weight: 700; ${isPairMatch ? 'background-color: #d1fae5; color: #065f46;' : 'background-color: #ffe4e6; color: #9f1239;'}">
                    HS nối: ${studentMatched || 'Chưa nối'}
                  </span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    // DẠNG 4: Sắp xếp thứ tự
    else if (qType === 'ordering') {
      const correctOrderStr = Array.isArray(q.correctOrder) ? q.correctOrder.join(' ➔ ') : (q.correctAnswer || 'Theo khai báo bài');
      const studentOrderStr = Array.isArray(studentChoice) ? studentChoice.join(' ➔ ') : (studentChoice || 'Chưa sắp xếp');
      answersDetailsHtml = `
        <div style="margin-top: 8px; padding: 10px 12px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
          <div>Thứ tự đúng: <strong style="color: #047857;">${correctOrderStr}</strong></div>
          <div>Thứ tự học sinh: <strong style="color: ${isPass ? '#047857' : '#be123c'};">${studentOrderStr}</strong></div>
        </div>
      `;
    }
    // DẠNG 5: Điền khuyết / Tự luận
    else {
      answersDetailsHtml = `
        <div style="margin-top: 8px; padding: 10px 12px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
          <div>Đáp án chuẩn: <strong style="color: #047857;">${q.correctAnswer || 'Giáo viên tự chấm'}</strong></div>
          <div>Câu trả lời của HS: <strong style="color: ${isPass ? '#047857' : '#be123c'};">${studentChoice !== undefined && studentChoice !== '' ? String(studentChoice) : 'Chưa nhập câu trả lời'}</strong></div>
        </div>
      `;
    }

    return `
      <div class="pdf-question-card" style="border: 1px solid #cbd5e1; background-color: #f8fafc; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; break-inside: avoid;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 800; font-size: 13.5px; color: ${isPass ? '#047857' : '#be123c'};">
              Câu ${qIdx + 1} (${formatScore(evalItem.points)}đ):
            </span>
            <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; ${isPass ? 'background-color: #d1fae5; color: #065f46; border: 1px solid #6ee7b7;' : 'background-color: #ffe4e6; color: #9f1239; border: 1px solid #fda4af;'}">
              ${isPass ? '✓ Đúng' : '✗ Sai'}
            </span>
          </div>
          <span style="font-size: 11px; font-weight: 600; color: #64748b;">
            ${getQuestionTypeLabel(q.type)}
          </span>
        </div>

        <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 6px; line-height: 1.45;">
          ${q.content}
        </div>

        ${!isAnswered ? `
          <div style="padding: 6px 10px; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: #92400e; margin-bottom: 6px;">
            ⚠️ Học sinh chưa trả lời câu hỏi này (Bỏ trống)
          </div>
        ` : ''}

        ${answersDetailsHtml}

        ${q.explanation ? `
          <div style="margin-top: 8px; padding: 8px 12px; background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; font-size: 11.5px; color: #713f12; font-weight: 500;">
            💡 <strong>Giải thích / Gợi ý:</strong> ${q.explanation}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Gắn HTML vào container
  container.innerHTML = `
    ${headerHtml}
    <div class="pdf-questions-list">
      <div style="font-size: 13px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin-bottom: 12px; border-left: 4px solid #4f46e5; padding-left: 8px;">
        CHI TIẾT TỪNG CÂU HỎI TRONG BÀI (${evaluations.length} CÂU)
      </div>
      ${questionsHtml}
    </div>
  `;

  document.body.appendChild(container);

  try {
    // 3. Phân trang thông minh: Tính toán chiều cao và chèn spacer để câu hỏi không bị cắt đôi giữa 2 trang
    // Chiều cao có thể in trên 1 trang A4 (mm -> px tại 780px container width)
    // Tỷ lệ A4: 297mm / 210mm = 1.414. Trừ margin 10mm mỗi bên: (297 - 20) / (210 - 20) = 277 / 190 = 1.458.
    // Tại width 780px: 780 * 1.458 = 1137px. Đặt ngưỡng an toàn là 1060px để không bao giờ tràn.
    const MAX_PAGE_HEIGHT = 1060;
    let currentAccumulatedHeight = 0;

    const headerEl = container.querySelector('.pdf-header-section') as HTMLElement;
    if (headerEl) {
      currentAccumulatedHeight += headerEl.offsetHeight;
    }

    const titleEl = container.querySelector('.pdf-questions-list > div') as HTMLElement;
    if (titleEl) {
      currentAccumulatedHeight += titleEl.offsetHeight;
    }

    const questionCards = Array.from(container.querySelectorAll('.pdf-question-card')) as HTMLElement[];
    for (const card of questionCards) {
      const cardHeight = card.offsetHeight + 14; // bao gồm margin bottom

      if (currentAccumulatedHeight + cardHeight > MAX_PAGE_HEIGHT) {
        // Cần ngắt trang trước câu hỏi này! Chèn một khoảng trắng bù đủ trang hiện tại
        const spacer = document.createElement('div');
        spacer.className = 'pdf-page-break-spacer';
        const remainingSpace = Math.max(MAX_PAGE_HEIGHT - currentAccumulatedHeight, 10);
        spacer.style.height = `${remainingSpace}px`;
        spacer.style.width = '100%';
        card.parentNode?.insertBefore(spacer, card);
        // Bắt đầu trang mới
        currentAccumulatedHeight = cardHeight;
      } else {
        currentAccumulatedHeight += cardHeight;
      }
    }

    // 4. Chụp toàn bộ container bằng html2canvas với độ nét 2x (High DPI)
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    // 5. Khởi tạo tài liệu jsPDF định dạng A4 chuẩn
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pdfWidth = 210;
    const pdfHeight = 297;
    const margin = 10;
    const contentWidth = pdfWidth - margin * 2; // 190 mm
    const contentHeight = pdfHeight - margin * 2; // 277 mm

    const totalCanvasHeight = canvas.height;
    const pageHeightCanvas = Math.round((canvas.width * contentHeight) / contentWidth);
    const totalPages = Math.ceil(totalCanvasHeight / pageHeightCanvas);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) {
        pdf.addPage();
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = pageHeightCanvas;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        const sourceY = page * pageHeightCanvas;
        const currentSliceHeight = Math.min(pageHeightCanvas, totalCanvasHeight - sourceY);

        ctx.drawImage(
          canvas,
          0, sourceY, canvas.width, currentSliceHeight,
          0, 0, canvas.width, currentSliceHeight
        );
      }

      const imgData = pageCanvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);

      // Thêm chân trang: Trang X / Y
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184); // Slate 400
      pdf.text(
        `Trang ${page + 1} / ${totalPages} - Hệ thống Dạy & Học Số PK Trực Khang`,
        pdfWidth / 2,
        pdfHeight - 5,
        { align: 'center' }
      );
    }

    // 6. Tải trực tiếp file về máy
    pdf.save(fileName);
  } finally {
    // Luôn dọn dẹp phần tử tạm khỏi DOM
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
