import QRCode from 'qrcode';
import JSZip from 'jszip';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  VerticalAlign,
  ImageRun,
  ExternalHyperlink,
} from 'docx';
import { ExamPaper } from '../types';
import { extractGradeDigit } from '../lib/constants';

export const EXAM_HEADER_LINE_1 = 'PHIẾU DANH MỤC ĐỀ KIỂM TRA KÈM MÃ QR';
export const EXAM_HEADER_LINE_2 = 'Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang';
export const EXAM_HEADER_LINE_3 =
  'Dùng camera điện thoại hoặc Zalo quét mã QR để mở trực tiếp đề kiểm tra.';

/**
 * Tạo đường dẫn công khai truy cập/làm bài trực tuyến của đề kiểm tra.
 */
export function buildExamPublicUrl(examId: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://eduplay.vn';
  return `${origin}/exam/${encodeURIComponent(examId)}`;
}

/**
 * Định dạng dòng phụ hiển thị Môn, Khối (và Lớp giao nếu có) cho đề kiểm tra.
 * Ví dụ: "Môn: Công nghệ • Khối 5" hoặc "Môn: Công nghệ • Khối 5 • Lớp 5D"
 */
export function formatExamSubjectAndGrade(exam: ExamPaper): string {
  const subjectText = (exam.subject || 'Chưa phân môn').trim();
  const rawClass = (exam.targetClass || '').trim();
  const classDigit = extractGradeDigit(rawClass);
  const rawGrade = (exam.grade || '').trim();

  let gradeText = rawGrade;
  if (!gradeText) {
    gradeText = classDigit ? `Khối ${classDigit}` : 'Khối 3';
  } else if (!gradeText.toLowerCase().startsWith('khối')) {
    gradeText = `Khối ${gradeText}`;
  }

  if (rawClass && rawClass !== '---') {
    const classLabel =
      rawClass.toLowerCase().startsWith('lớp') || rawClass.toLowerCase().startsWith('tất cả')
        ? rawClass
        : `Lớp ${rawClass}`;
    return `Môn: ${subjectText} • ${gradeText} • ${classLabel}`;
  }

  return `Môn: ${subjectText} • ${gradeText}`;
}

/**
 * Trả về nhãn Loại đề / Kỳ kiểm tra (VD: Giữa học kì I, Cuối học kì I, Đề trắc nghiệm trực tuyến...)
 */
export function getExamTypeOrPeriodLabel(exam: ExamPaper): string {
  const rawType = (
    exam.examType ||
    exam.testType ||
    (exam as unknown as { type?: string }).type ||
    ''
  ).trim();

  if (rawType) {
    return rawType;
  }

  const qCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
  if (qCount > 0) {
    return `Đề trắc nghiệm trực tuyến (${qCount} câu)`;
  }

  return 'Đề trắc nghiệm trực tuyến';
}

/**
 * Tạo Data URL ảnh PNG của Mã QR từ đường dẫn đề kiểm tra.
 */
export async function generateExamQrDataUrl(url: string, size = 200): Promise<string> {
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Tạo bản đồ QR DataURL cho danh sách đề kiểm tra.
 */
export async function generateQrMapForExams(
  exams: ExamPaper[],
  size = 200
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    exams.map(async (item) => {
      const url = buildExamPublicUrl(item.id);
      try {
        result[item.id] = await generateExamQrDataUrl(url, size);
      } catch (err) {
        console.error('Lỗi tạo QR cho đề kiểm tra:', item.id, err);
      }
    })
  );
  return result;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sanitizeFileName(raw: string): string {
  return (raw || 'de-kiem-tra')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function triggerDownloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Xuất danh sách đề kiểm tra ra tệp Word (.docx) chuẩn khổ A4 với bảng 5 cột kẻ khung rõ nét
 * và chèn trực tiếp ảnh QR 100x100px vào từng dòng.
 */
export async function exportExamCatalogToDocx(
  exams: ExamPaper[],
  existingQrMap?: Record<string, string>
): Promise<void> {
  const qrMap = existingQrMap || (await generateQrMapForExams(exams, 220));

  const standardBorder = {
    style: BorderStyle.SINGLE,
    size: 6,
    color: '64748B',
  };

  const cellBorders = {
    top: standardBorder,
    bottom: standardBorder,
    left: standardBorder,
    right: standardBorder,
  };

  // Hàng tiêu đề 5 cột
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 7, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: 'F1F5F9' },
        borders: cellBorders,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'STT',
                bold: true,
                size: 22,
                font: 'Times New Roman',
                color: '0F172A',
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: 'F1F5F9' },
        borders: cellBorders,
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: 'Tiêu đề đề kiểm tra',
                bold: true,
                size: 22,
                font: 'Times New Roman',
                color: '0F172A',
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 19, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: 'F1F5F9' },
        borders: cellBorders,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Loại đề / Kỳ kiểm tra',
                bold: true,
                size: 22,
                font: 'Times New Roman',
                color: '0F172A',
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 28, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: 'F1F5F9' },
        borders: cellBorders,
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: 'Đường dẫn đề kiểm tra',
                bold: true,
                size: 22,
                font: 'Times New Roman',
                color: '0F172A',
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 16, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: 'F1F5F9' },
        borders: cellBorders,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Mã QR của đề kiểm tra',
                bold: true,
                size: 22,
                font: 'Times New Roman',
                color: '0F172A',
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Các hàng dữ liệu
  const dataRows: TableRow[] = [];
  for (let index = 0; index < exams.length; index++) {
    const item = exams[index];
    const url = buildExamPublicUrl(item.id);
    const qrDataUrl = qrMap[item.id] || (await generateExamQrDataUrl(url, 220));
    const qrBytes = dataUrlToUint8Array(qrDataUrl);
    const metaSubline = formatExamSubjectAndGrade(item);
    const examTypeLabel = getExamTypeOrPeriodLabel(item);

    dataRows.push(
      new TableRow({
        children: [
          // 1. STT
          new TableCell({
            width: { size: 7, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: String(index + 1),
                    bold: true,
                    size: 22,
                    font: 'Times New Roman',
                  }),
                ],
              }),
            ],
          }),
          // 2. Tiêu đề đề kiểm tra + Dòng phụ màu xanh (Môn • Khối)
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: item.title || 'Đề kiểm tra chưa đặt tên',
                    bold: true,
                    size: 22,
                    font: 'Times New Roman',
                    color: '0F172A',
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: metaSubline,
                    size: 19,
                    font: 'Times New Roman',
                    color: '0284C7',
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
          // 3. Loại đề / Kỳ kiểm tra
          new TableCell({
            width: { size: 19, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: examTypeLabel,
                    size: 20,
                    font: 'Times New Roman',
                    color: '1E293B',
                  }),
                ],
              }),
            ],
          }),
          // 4. Đường dẫn đề kiểm tra (hyperlink màu xanh gạch chân)
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            children: [
              new Paragraph({
                children: [
                  new ExternalHyperlink({
                    link: url,
                    children: [
                      new TextRun({
                        text: url,
                        style: 'Hyperlink',
                        color: '2563EB',
                        underline: {},
                        size: 19,
                        font: 'Times New Roman',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          // 5. Mã QR của đề kiểm tra (100x100px sắc nét)
          new TableCell({
            width: { size: 16, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80, after: 80 },
                children: [
                  new ImageRun({
                    data: qrBytes,
                    transformation: {
                      width: 100,
                      height: 100,
                    },
                    type: 'png',
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: EXAM_HEADER_LINE_1,
                bold: true,
                size: 30,
                font: 'Times New Roman',
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: EXAM_HEADER_LINE_2,
                bold: true,
                size: 24,
                font: 'Times New Roman',
                color: '1E293B',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 280 },
            children: [
              new TextRun({
                text: EXAM_HEADER_LINE_3,
                italics: true,
                size: 21,
                font: 'Times New Roman',
                color: '475569',
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileSuffix =
    exams.length === 1
      ? sanitizeFileName(exams[0].title)
      : `danh-muc-${exams.length}-de-kiem-tra`;
  triggerDownloadBlob(blob, `Phieu-De-Kiem-Tra-QR_${fileSuffix}.docx`);
}

/**
 * Tải xuống ảnh Mã QR của đề kiểm tra:
 * - Nếu chỉ có 1 đề kiểm tra: tải trực tiếp ảnh PNG chất lượng cao.
 * - Nếu có nhiều đề kiểm tra: đóng gói tất cả ảnh QR PNG vào 1 tệp ZIP để tải về.
 */
export async function downloadExamQrImages(exams: ExamPaper[]): Promise<void> {
  if (exams.length === 0) return;

  if (exams.length === 1) {
    const item = exams[0];
    const url = buildExamPublicUrl(item.id);
    const dataUrl = await generateExamQrDataUrl(url, 400);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const safeName = sanitizeFileName(item.title);
    triggerDownloadBlob(blob, `QR_DeKiemTra_${safeName}.png`);
    return;
  }

  const zip = new JSZip();
  for (let i = 0; i < exams.length; i++) {
    const item = exams[i];
    const url = buildExamPublicUrl(item.id);
    const dataUrl = await generateExamQrDataUrl(url, 400);
    const bytes = dataUrlToUint8Array(dataUrl);
    const safeName = sanitizeFileName(item.title);
    const fileName = `${String(i + 1).padStart(2, '0')}_QR_${safeName}.png`;
    zip.file(fileName, bytes);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownloadBlob(zipBlob, `Ma-QR-Danh-Muc-${exams.length}-De-Kiem-Tra.zip`);
}
