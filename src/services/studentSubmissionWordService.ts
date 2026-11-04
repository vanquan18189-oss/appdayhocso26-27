import JSZip from 'jszip';
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
 * Loại bỏ dấu tiếng Việt để đặt tên file an toàn
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[\/\s\\:\*\?"<>\|]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
}

/**
 * Tạo tên file Word theo đúng định dạng chuẩn:
 * BaiLam_<MãHS>_<TênKhôngDấu>_<Môn>_<Lớp>.docx
 */
export function buildSubmissionDocxFileName(options: {
  studentCode?: string;
  studentName?: string;
  subject?: string;
  className?: string;
}): string {
  const sanitize = (val?: string) => {
    if (!val) return '';
    return removeVietnameseAccents(val);
  };

  const code = sanitize(options.studentCode) || 'HS';
  const name = sanitize(options.studentName) || 'HocSinh';
  const subject = sanitize(options.subject) || 'MonHoc';
  const cls = sanitize(options.className) || 'Lop';

  return `BaiLam_${code}_${name}_${subject}_${cls}.docx`;
}

// Giữ lại alias để tương thích các component cũ
export const buildSubmissionWordFileName = buildSubmissionDocxFileName;

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

function escapeXml(unsafe: any): string {
  if (unsafe === undefined || unsafe === null) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wpRuns(runs: { text: string; bold?: boolean; color?: string; size?: number }[], options?: { align?: 'center' | 'left' | 'right'; spaceAfter?: number }): string {
  const alignXml = options?.align ? `<w:jc w:val="${options.align}"/>` : '';
  const spacingXml = options?.spaceAfter !== undefined ? `<w:spacing w:after="${options.spaceAfter}"/>` : '<w:spacing w:after="80"/>';
  
  const runsXml = runs.map(r => {
    const boldXml = r.bold ? '<w:b/>' : '';
    const colorXml = r.color ? `<w:color w:val="${r.color}"/>` : '';
    const sizeXml = r.size ? `<w:sz w:val="${r.size}"/>` : '<w:sz w:val="24"/>';
    return `<w:r><w:rPr>${boldXml}${colorXml}${sizeXml}</w:rPr><w:t xml:space="preserve">${escapeXml(r.text)}</w:t></w:r>`;
  }).join('');

  return `<w:p><w:pPr>${alignXml}${spacingXml}</w:pPr>${runsXml}</w:p>`;
}

/**
 * Sinh cấu trúc gói OpenXML (.docx) chuẩn 100% bằng JSZip,
 * đảm bảo mở được hoàn hảo trên mọi phiên bản Microsoft Word (0 lỗi format / corrupt).
 */
export async function generateSubmissionDocxBlob(options: GenerateSubmissionWordOptions): Promise<Blob> {
  const { targetItem, studentName, studentCode, submittedTime, attempts, evaluations, stats, mode } = options;

  const resolvedClass = options.className || targetItem?.targetClass || '';
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

  const bodyElements: string[] = [];

  // 1. Tiêu đề trường & tiêu đề đề thi
  bodyElements.push(wpRuns([
    { text: 'HỆ THỐNG DẠY VÀ HỌC SỐ PK TRỰC KHANG', bold: true, color: '4F46E5', size: 20 }
  ], { align: 'center', spaceAfter: 60 }));

  bodyElements.push(wpRuns([
    { text: line1Title, bold: true, color: '111827', size: 30 }
  ], { align: 'center', spaceAfter: 60 }));

  if (line2Text) {
    bodyElements.push(wpRuns([
      { text: line2Text, bold: true, color: '374151', size: 24 }
    ], { align: 'center', spaceAfter: 40 }));
  }

  if (line3Text) {
    bodyElements.push(wpRuns([
      { text: line3Text, color: '4B5563', size: 22 }
    ], { align: 'center', spaceAfter: 180 }));
  }

  // 2. Bảng Thông tin học sinh (Bordered Table)
  const studentInfoRows = [
    [
      { label: 'Họ và tên học sinh:', val: studentName },
      { label: 'Lớp:', val: resolvedClass || '---' }
    ],
    [
      { label: 'Mã số học sinh:', val: studentCode || '---' },
      { label: 'Thời gian nộp bài:', val: submittedTime ? formatSubmissionDateTime(submittedTime) : '---' }
    ],
    [
      { label: 'Số lần làm bài:', val: attempts ? `${attempts} lần` : '1 lần' },
      { label: 'Môn học:', val: targetItem?.subject || '---' }
    ]
  ];

  const studentInfoTableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      ${studentInfoRows.map(row => `
        <w:tr>
          <w:tc>
            <w:tcPr>
              <w:tcW w:w="2500" w:type="pct"/>
              <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
              <w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar>
            </w:tcPr>
            ${wpRuns([
              { text: row[0].label + ' ', bold: true, color: '1E293B', size: 22 },
              { text: row[0].val, bold: true, color: '0F172A', size: 22 }
            ], { spaceAfter: 0 })}
          </w:tc>
          <w:tc>
            <w:tcPr>
              <w:tcW w:w="2500" w:type="pct"/>
              <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
              <w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar>
            </w:tcPr>
            ${wpRuns([
              { text: row[1].label + ' ', bold: true, color: '1E293B', size: 22 },
              { text: row[1].val, color: '0F172A', size: 22 }
            ], { spaceAfter: 0 })}
          </w:tc>
        </w:tr>
      `).join('')}
    </w:tbl>
  `;
  bodyElements.push(studentInfoTableXml);
  bodyElements.push(wpRuns([{ text: '' }], { spaceAfter: 120 }));

  // 3. Khung Kết quả tổng quan
  const isScored = isSubjectWithScore(targetItem?.subject);
  const qualitativeLabel = getQualitativeLabel(stats.correctCount, stats.totalCount);

  const resultsTableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="10" w:space="0" w:color="4F46E5"/>
          <w:left w:val="single" w:sz="10" w:space="0" w:color="4F46E5"/>
          <w:bottom w:val="single" w:sz="10" w:space="0" w:color="4F46E5"/>
          <w:right w:val="single" w:sz="10" w:space="0" w:color="4F46E5"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/>
            <w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="200" w:type="dxa"/><w:right w:w="200" w:type="dxa"/></w:tcMar>
          </w:tcPr>
          ${wpRuns([
            { text: 'KẾT QUẢ BÀI LÀM: ', bold: true, color: '3730A3', size: 24 },
            { text: `${stats.correctCount}/${stats.totalCount} câu đúng`, bold: true, color: '047857', size: 24 },
            { text: isScored ? `  |  Điểm số: ${stats.scoreOutOf10}/10 điểm` : `  |  Mức đánh giá: ${qualitativeLabel}`, bold: true, color: 'BE123C', size: 26 }
          ], { spaceAfter: 0 })}
        </w:tc>
      </w:tr>
    </w:tbl>
  `;
  bodyElements.push(resultsTableXml);
  bodyElements.push(wpRuns([{ text: '' }], { spaceAfter: 140 }));

  // 4. Bảng điểm tổng hợp theo từng câu
  bodyElements.push(wpRuns([
    { text: 'BẢNG TỔNG HỢP KẾT QUẢ TỪNG CÂU HỎI', bold: true, color: '1E293B', size: 22 }
  ], { spaceAfter: 60 }));

  const summaryHeaderRow = ['Câu hỏi', ...evaluations.map((_, i) => String(i + 1))];
  const summaryScoreRow = ['Điểm', ...evaluations.map(e => e.isCorrect ? formatScore(e.points) : '0')];
  const summaryResultRow = ['Kết quả', ...evaluations.map(e => e.isCorrect ? '✓' : '✗')];

  const summaryTableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        </w:tblBorders>
      </w:tblPr>
      ${[summaryHeaderRow, summaryScoreRow, summaryResultRow].map((row, rIdx) => `
        <w:tr>
          ${row.map((cellText, cIdx) => {
            const isHeader = rIdx === 0 || cIdx === 0;
            const isPass = cellText === '✓';
            const isFail = cellText === '✗';
            const color = isPass ? '047857' : isFail ? 'BE123C' : '0F172A';
            return `
              <w:tc>
                <w:tcPr>
                  <w:shd w:val="clear" w:color="auto" w:fill="${isHeader ? 'F1F5F9' : 'FFFFFF'}"/>
                  <w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>
                </w:tcPr>
                ${wpRuns([{ text: cellText, bold: isHeader || isPass || isFail, color, size: 20 }], { align: 'center', spaceAfter: 0 })}
              </w:tc>
            `;
          }).join('')}
        </w:tr>
      `).join('')}
    </w:tbl>
  `;
  bodyElements.push(summaryTableXml);
  bodyElements.push(wpRuns([{ text: '' }], { spaceAfter: 160 }));

  // 5. Chi tiết từng câu hỏi trong đề
  bodyElements.push(wpRuns([
    { text: `CHI TIẾT TỪNG CÂU HỎI TRONG BÀI (${evaluations.length} CÂU)`, bold: true, color: '4338CA', size: 24 }
  ], { spaceAfter: 100 }));

  evaluations.forEach((evalItem) => {
    const q = evalItem.question;
    const qIdx = evalItem.questionIndex;
    const qType = normalizeQuestionType(q.type);
    const isPass = evalItem.isCorrect;
    const studentChoice = evalItem.studentChoice;
    const isAnswered = evalItem.isAnswered;

    // Header câu hỏi
    bodyElements.push(wpRuns([
      { text: `Câu ${qIdx + 1} (${formatScore(evalItem.points)} điểm) - `, bold: true, color: isPass ? '047857' : 'BE123C', size: 22 },
      { text: isPass ? 'ĐÚNG' : 'SAI', bold: true, color: isPass ? '047857' : 'BE123C', size: 22 },
      { text: `  [${getQuestionTypeLabel(q.type)}]`, color: '64748B', size: 20 }
    ], { spaceAfter: 40 }));

    // Nội dung câu hỏi
    bodyElements.push(wpRuns([
      { text: q.content || `Nội dung câu hỏi ${qIdx + 1}`, bold: true, color: '0F172A', size: 22 }
    ], { spaceAfter: 60 }));

    // Cảnh báo chưa làm nếu có
    if (!isAnswered) {
      bodyElements.push(wpRuns([
        { text: '⚠️ Học sinh chưa trả lời câu hỏi này.', bold: true, color: 'D97706', size: 20 }
      ], { spaceAfter: 40 }));
    }

    // Các lựa chọn đáp án
    if (qType === 'multiple_choice' && q.options && q.options.length > 0) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      q.options.forEach((optText, oIdx) => {
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

        const runs: { text: string; bold?: boolean; color?: string; size?: number }[] = [
          { text: `${letter}. ${optText} `, bold: isSelected || isCorrectOpt, color: '1E293B', size: 22 }
        ];

        if (isSelected && isCorrectOpt) {
          runs.push({ text: '[✓ Đúng / Học sinh chọn]', bold: true, color: '047857', size: 20 });
        } else if (isSelected && !isCorrectOpt) {
          runs.push({ text: '[✗ Học sinh chọn]', bold: true, color: 'BE123C', size: 20 });
        } else if (!isSelected && isCorrectOpt) {
          runs.push({ text: '[Đáp án đúng]', bold: true, color: '047857', size: 20 });
        }

        bodyElements.push(wpRuns(runs, { spaceAfter: 30 }));
      });
    } else if (qType === 'true_false') {
      if (q.statements && q.statements.length > 0) {
        q.statements.forEach((stmt: any, sIdx: number) => {
          const studentStmtChoice = (typeof studentChoice === 'object' && studentChoice !== null) ? studentChoice[sIdx] : undefined;
          const isStmtCorrect = studentStmtChoice === stmt.isCorrect;
          bodyElements.push(wpRuns([
            { text: `- ${stmt.text || stmt.content} | Đáp án: `, size: 20 },
            { text: stmt.isCorrect ? 'Đúng' : 'Sai', bold: true, size: 20 },
            { text: ' | HS chọn: ', size: 20 },
            { 
              text: studentStmtChoice === undefined ? 'Chưa chọn' : (studentStmtChoice ? 'Đúng' : 'Sai'), 
              bold: true, 
              color: isStmtCorrect ? '047857' : 'BE123C', 
              size: 20 
            }
          ], { spaceAfter: 30 }));
        });
      } else {
        bodyElements.push(wpRuns([
          { text: `Đáp án chuẩn: ${String(q.correctAnswer)} | Học sinh chọn: `, size: 20 },
          { text: String(studentChoice ?? 'Chưa trả lời'), bold: true, color: isPass ? '047857' : 'BE123C', size: 20 }
        ], { spaceAfter: 40 }));
      }
    } else if (qType === 'matching' && q.matchingPairs && q.matchingPairs.length > 0) {
      q.matchingPairs.forEach((pair: any, pIdx: number) => {
        const studentMatched = (typeof studentChoice === 'object' && studentChoice !== null)
          ? (studentChoice[pIdx] !== undefined ? studentChoice[pIdx] : studentChoice[pair.left])
          : undefined;
        const isPairMatch = studentMatched && String(studentMatched).trim().toLowerCase() === String(pair.right).trim().toLowerCase();
        bodyElements.push(wpRuns([
          { text: `- ${pair.left} ➔ Đúng: ${pair.right} | HS nối: `, size: 20 },
          { text: studentMatched || 'Chưa nối', bold: true, color: isPairMatch ? '047857' : 'BE123C', size: 20 }
        ], { spaceAfter: 30 }));
      });
    } else {
      bodyElements.push(wpRuns([
        { text: `Đáp án chuẩn: ${q.correctAnswer || 'Giáo viên tự chấm'} | Câu trả lời của HS: `, size: 20 },
        { 
          text: studentChoice !== undefined && studentChoice !== '' ? String(studentChoice) : 'Chưa nhập', 
          bold: true, 
          color: isPass ? '047857' : 'BE123C', 
          size: 20 
        }
      ], { spaceAfter: 40 }));
    }

    // Lời giải thích / gợi ý
    if (q.explanation) {
      bodyElements.push(wpRuns([
        { text: 'Gợi ý / Giải thích: ', bold: true, color: '854D0E', size: 20 },
        { text: String(q.explanation), color: '854D0E', size: 20 }
      ], { spaceAfter: 60 }));
    }

    bodyElements.push(wpRuns([{ text: '' }], { spaceAfter: 100 }));
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyElements.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="vi-VN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:line="276" w:lineRule="auto" w:after="80"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/_rels/document.xml.rels', docRelsXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/document.xml', documentXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

/**
 * Tải file Word (.docx) bài làm học sinh khi tải riêng
 */
export async function downloadStudentSubmissionWord(options: GenerateSubmissionWordOptions): Promise<void> {
  const { studentCode, studentName, targetItem } = options;
  const resolvedClass = options.className || targetItem?.targetClass || '';
  const fileName = buildSubmissionDocxFileName({
    studentCode,
    studentName,
    subject: targetItem?.subject,
    className: resolvedClass
  });

  const blob = await generateSubmissionDocxBlob(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Hàm dự phòng đồng bộ cho code cũ nếu cần
 */
export function generateSubmissionWordBlob(options: GenerateSubmissionWordOptions): Blob {
  // Trả về HTML blob dự phòng nếu được gọi đồng bộ
  const { studentCode, studentName, targetItem } = options;
  const resolvedClass = options.className || targetItem?.targetClass || '';
  const fileName = buildSubmissionDocxFileName({
    studentCode,
    studentName,
    subject: targetItem?.subject,
    className: resolvedClass
  });

  const html = `<html><head><meta charset="utf-8"><title>${fileName}</title></head><body><h1>${resolveExamHeaderTitle(targetItem, options.mode)}</h1></body></html>`;
  return new Blob(['\ufeff' + html], { type: 'application/msword' });
}
