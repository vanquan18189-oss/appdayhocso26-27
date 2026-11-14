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
import { HomeworkAssignment } from '../types';
import { extractGradeDigit } from '../lib/constants';

export const ASSIGNMENT_HEADER_LINE_1 = 'PHIẾU DANH MỤC BÀI TẬP GIAO HỌC SINH KÈM MÃ QR';
export const ASSIGNMENT_HEADER_LINE_2 = 'Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang';
export const ASSIGNMENT_HEADER_LINE_3 =
  'Dùng camera điện thoại hoặc Zalo quét mã QR để mở trực tiếp bài tập làm bài trực tuyến.';

/**
 * Tạo đường dẫn chia sẻ công khai của bài tập để học sinh làm bài trực tuyến.
 */
export function buildAssignmentPublicUrl(assignmentId: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://eduplay.vn';
  return `${origin}/assignment/${encodeURIComponent(assignmentId)}`;
}

/**
 * Định dạng dòng phụ hiển thị Môn, Khối, Lớp cho từng bài tập.
 * Ví dụ: "Môn: Tin học • Khối 5 • Lớp 5D"
 */
export function formatAssignmentSubjectGradeClass(assignment: HomeworkAssignment): string {
  const subjectText = (assignment.subject || 'Chưa phân môn').trim();

  const rawClass = (assignment.targetClass || '').trim();
  const classDigit = extractGradeDigit(rawClass);
  const rawGrade = (assignment.grade || '').trim();

  let gradeText = rawGrade;
  if (!gradeText) {
    gradeText = classDigit ? `Khối ${classDigit}` : 'Khối 3';
  } else if (!gradeText.toLowerCase().startsWith('khối')) {
    gradeText = `Khối ${gradeText}`;
  }

  let classText = rawClass || 'Tất cả các lớp';
  if (
    classText &&
    !classText.toLowerCase().startsWith('lớp') &&
    !classText.toLowerCase().startsWith('tất cả')
  ) {
    classText = `Lớp ${classText}`;
  }

  return `Môn: ${subjectText} • ${gradeText} • ${classText}`;
}

/**
 * Trả về nhãn Loại bài tập (VD: Bài tập tự luyện, Bài tập chấm tự động AI, Phiếu bài tập...)
 */
export function getAssignmentTypeLabel(assignment: HomeworkAssignment): string {
  const typeVal = (assignment.type || assignment.category || assignment.contentType || '').toLowerCase();
  if (typeVal === 'elearning' || Boolean(assignment.lessonId)) {
    return 'Bài tập E-learning tương tác';
  }

  const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
  if (questions.length > 0) {
    const hasEssayOrAi = questions.some((q) => {
      const qType = String(q.type || '').toLowerCase();
      return qType === 'essay' || qType.includes('tự luận');
    });
    if (hasEssayOrAi) {
      return `Bài tập chấm tự động AI (${questions.length} câu hỏi)`;
    }
    return `Bài tập tự luyện (${questions.length} câu hỏi)`;
  }

  return 'Phiếu bài tập tự luyện (Chấm tự động AI)';
}

/**
 * Tạo Data URL ảnh PNG của Mã QR từ đường dẫn bài tập.
 */
export async function generateAssignmentQrDataUrl(url: string, size = 200): Promise<string> {
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
 * Tạo bản đồ QR DataURL cho danh sách bài tập.
 */
export async function generateQrMapForAssignments(
  assignments: HomeworkAssignment[],
  size = 200
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    assignments.map(async (item) => {
      const url = buildAssignmentPublicUrl(item.id);
      try {
        result[item.id] = await generateAssignmentQrDataUrl(url, size);
      } catch (err) {
        console.error('Lỗi tạo QR cho bài tập:', item.id, err);
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
  return (raw || 'bai-tap')
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
 * Xuất danh sách bài tập ra tệp Word (.docx) chuẩn khổ A4 với bảng 5 cột kẻ khung rõ nét
 * và chèn trực tiếp ảnh QR 100x100px vào từng dòng.
 */
export async function exportAssignmentCatalogToDocx(
  assignments: HomeworkAssignment[],
  existingQrMap?: Record<string, string>
): Promise<void> {
  const qrMap = existingQrMap || (await generateQrMapForAssignments(assignments, 220));

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
                text: 'Tiêu đề bài tập',
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
                text: 'Loại bài tập',
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
                text: 'Đường dẫn làm bài',
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
                text: 'Mã QR của bài tập',
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
  for (let index = 0; index < assignments.length; index++) {
    const item = assignments[index];
    const url = buildAssignmentPublicUrl(item.id);
    const qrDataUrl = qrMap[item.id] || (await generateAssignmentQrDataUrl(url, 220));
    const qrBytes = dataUrlToUint8Array(qrDataUrl);
    const metaSubline = formatAssignmentSubjectGradeClass(item);
    const assignmentTypeLabel = getAssignmentTypeLabel(item);

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
          // 2. Tiêu đề bài tập + Dòng phụ màu xanh (Môn • Khối • Lớp)
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: item.title || 'Bài tập chưa đặt tên',
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
          // 3. Loại bài tập
          new TableCell({
            width: { size: 19, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: assignmentTypeLabel,
                    size: 20,
                    font: 'Times New Roman',
                    color: '1E293B',
                  }),
                ],
              }),
            ],
          }),
          // 4. Đường dẫn làm bài (hyperlink màu xanh gạch chân)
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
          // 5. Mã QR của bài tập (100x100px sắc nét)
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
                text: ASSIGNMENT_HEADER_LINE_1,
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
                text: ASSIGNMENT_HEADER_LINE_2,
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
                text: ASSIGNMENT_HEADER_LINE_3,
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
    assignments.length === 1
      ? sanitizeFileName(assignments[0].title)
      : `danh-muc-${assignments.length}-bai-tap`;
  triggerDownloadBlob(blob, `Phieu-Bai-Tap-QR_${fileSuffix}.docx`);
}

/**
 * Tải xuống ảnh Mã QR:
 * - Nếu chỉ có 1 bài tập: tải trực tiếp ảnh PNG chất lượng cao.
 * - Nếu có nhiều bài tập: đóng gói tất cả ảnh QR PNG vào 1 tệp ZIP để tải về.
 */
export async function downloadAssignmentQrImages(
  assignments: HomeworkAssignment[]
): Promise<void> {
  if (assignments.length === 0) return;

  if (assignments.length === 1) {
    const item = assignments[0];
    const url = buildAssignmentPublicUrl(item.id);
    const dataUrl = await generateAssignmentQrDataUrl(url, 400);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const safeName = sanitizeFileName(item.title);
    triggerDownloadBlob(blob, `QR_BaiTap_${safeName}.png`);
    return;
  }

  const zip = new JSZip();
  for (let i = 0; i < assignments.length; i++) {
    const item = assignments[i];
    const url = buildAssignmentPublicUrl(item.id);
    const dataUrl = await generateAssignmentQrDataUrl(url, 400);
    const bytes = dataUrlToUint8Array(dataUrl);
    const safeName = sanitizeFileName(item.title);
    const fileName = `${String(i + 1).padStart(2, '0')}_QR_${safeName}.png`;
    zip.file(fileName, bytes);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownloadBlob(zipBlob, `Ma-QR-Danh-Muc-${assignments.length}-Bai-Tap.zip`);
}
