import QRCode from 'qrcode';
import JSZip from 'jszip';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType
} from 'docx';
import { Lesson5EPlan } from '../types';

export const SCHOOL_HEADER_LINE_1 = 'PHIẾU DANH MỤC BÀI GIẢNG E-LEARNING KÈM MÃ QR';
export const SCHOOL_HEADER_LINE_2 = 'Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang';
export const SCHOOL_HEADER_LINE_3 =
  'Dùng camera điện thoại hoặc Zalo quét mã QR để mở trực tiếp bài giảng điện tử.';

export function buildLessonPublicUrl(lessonId: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://appdayhocso26-27.vercel.app';
  return `${origin}/lesson/${encodeURIComponent(lessonId)}`;
}

export function getLessonFormatOrTopic(lesson: Lesson5EPlan): string {
  const topic = (lesson.topic || '').trim();
  if (topic && topic.toLowerCase() !== (lesson.title || '').trim().toLowerCase()) {
    return topic;
  }
  return 'Bài giảng E-learning 4 bước sư phạm';
}

export function formatLessonSubjectGrade(lesson: Lesson5EPlan): string {
  const subj = (lesson.subject || 'Chưa rõ môn').trim();
  const grade = (lesson.grade || 'Chưa rõ khối').trim();
  return `Môn: ${subj} • ${grade}`;
}

export function sanitizeExportFilename(input: string): string {
  return (input || 'bai_giang')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function getDateStampForFilename(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export async function generateLessonQrDataUrl(url: string, size = 200): Promise<string> {
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF'
    }
  });
}

export async function generateQrMapForLessons(
  lessons: Lesson5EPlan[],
  size = 200
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    lessons.map(async (lesson) => {
      const url = buildLessonPublicUrl(lesson.id);
      const dataUrl = await generateLessonQrDataUrl(url, size);
      return [lesson.id, dataUrl] as const;
    })
  );
  return Object.fromEntries(entries);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CELL_BORDER = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: '64748B'
};

const TABLE_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
  insideHorizontal: CELL_BORDER,
  insideVertical: CELL_BORDER
};

const CELL_MARGINS = {
  top: 100,
  bottom: 100,
  left: 110,
  right: 110
};

export async function exportElearningCatalogToDocx(
  lessons: Lesson5EPlan[],
  existingQrMap?: Record<string, string>
): Promise<void> {
  if (!lessons || lessons.length === 0) return;

  const qrMap = { ...(existingQrMap || {}) };
  for (const lesson of lessons) {
    if (!qrMap[lesson.id]) {
      qrMap[lesson.id] = await generateLessonQrDataUrl(buildLessonPublicUrl(lesson.id), 200);
    }
  }

  // A4 portrait width = 11906 DXA, margins 900 left + 900 right => usable table width = 10106 DXA
  const colWidths = [650, 2500, 1850, 3250, 1856];

  const headerCells = [
    { label: 'STT', width: colWidths[0] },
    { label: 'Tiêu đề bài giảng', width: colWidths[1] },
    { label: 'Hình thức / Chủ đề', width: colWidths[2] },
    { label: 'Đường dẫn bài giảng', width: colWidths[3] },
    { label: 'Mã QR của bài giảng', width: colWidths[4] }
  ].map(
    (col) =>
      new TableCell({
        width: { size: col.width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: CELL_MARGINS,
        shading: {
          type: ShadingType.CLEAR,
          fill: 'E2E8F0',
          color: 'auto'
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({
                text: col.label,
                bold: true,
                font: 'Times New Roman',
                size: 22,
                color: '0F172A'
              })
            ]
          })
        ]
      })
  );

  const dataRows = lessons.map((lesson, idx) => {
    const publicUrl = buildLessonPublicUrl(lesson.id);
    const qrBytes = dataUrlToUint8Array(qrMap[lesson.id]);

    return new TableRow({
      cantSplit: true,
      children: [
        // 1. STT
        new TableCell({
          width: { size: colWidths[0], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: String(idx + 1),
                  bold: true,
                  font: 'Times New Roman',
                  size: 22,
                  color: '0F172A'
                })
              ]
            })
          ]
        }),
        // 2. Tiêu đề bài giảng + dòng phụ màu xanh
        new TableCell({
          width: { size: colWidths[1], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: lesson.title || 'Bài giảng E-learning',
                  bold: true,
                  font: 'Times New Roman',
                  size: 22,
                  color: '0F172A'
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: formatLessonSubjectGrade(lesson),
                  font: 'Times New Roman',
                  size: 20,
                  color: '0284C7'
                })
              ]
            })
          ]
        }),
        // 3. Hình thức / Chủ đề
        new TableCell({
          width: { size: colWidths[2], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: getLessonFormatOrTopic(lesson),
                  font: 'Times New Roman',
                  size: 21,
                  color: '1E293B'
                })
              ]
            })
          ]
        }),
        // 4. Đường dẫn bài giảng (blue underlined ExternalHyperlink)
        new TableCell({
          width: { size: colWidths[3], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  link: publicUrl,
                  children: [
                    new TextRun({
                      text: publicUrl,
                      font: 'Times New Roman',
                      size: 20,
                      color: '0563C1',
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: '0563C1'
                      }
                    })
                  ]
                })
              ]
            })
          ]
        }),
        // 5. Mã QR 100x100px embedded directly in cell
        new TableCell({
          width: { size: colWidths[4], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: qrBytes,
                  transformation: {
                    width: 100,
                    height: 100
                  },
                  type: 'png'
                })
              ]
            })
          ]
        })
      ]
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838
            },
            margin: {
              top: 1000,
              bottom: 1000,
              left: 900,
              right: 900
            }
          }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: SCHOOL_HEADER_LINE_1,
                bold: true,
                font: 'Times New Roman',
                size: 30,
                color: '0F172A'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: SCHOOL_HEADER_LINE_2,
                bold: true,
                font: 'Times New Roman',
                size: 24,
                color: '1E293B'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
            children: [
              new TextRun({
                text: SCHOOL_HEADER_LINE_3,
                italics: true,
                font: 'Times New Roman',
                size: 22,
                color: '475569'
              })
            ]
          }),
          new Table({
            width: { size: 10106, type: WidthType.DXA },
            columnWidths: colWidths,
            layout: TableLayoutType.FIXED,
            borders: TABLE_BORDERS,
            rows: [
              new TableRow({
                tableHeader: true,
                cantSplit: true,
                children: headerCells
              }),
              ...dataRows
            ]
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const dateStamp = getDateStampForFilename();
  const filename =
    lessons.length === 1
      ? `Phieu-QR-${sanitizeExportFilename(lessons[0].title)}-${dateStamp}.docx`
      : `Phieu-danh-muc-bai-giang-QR-${dateStamp}.docx`;
  triggerBlobDownload(blob, filename);
}

export async function downloadLessonQrImages(lessons: Lesson5EPlan[]): Promise<void> {
  if (!lessons || lessons.length === 0) return;

  if (lessons.length === 1) {
    const lesson = lessons[0];
    const url = buildLessonPublicUrl(lesson.id);
    const hiResDataUrl = await generateLessonQrDataUrl(url, 400);
    const bytes = dataUrlToUint8Array(hiResDataUrl);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
    triggerBlobDownload(blob, `MaQR_${sanitizeExportFilename(lesson.title)}_${lesson.id}.png`);
    return;
  }

  const zip = new JSZip();
  const manifestLines: string[] = [
    SCHOOL_HEADER_LINE_1,
    SCHOOL_HEADER_LINE_2,
    '',
    'DANH SÁCH MÃ QR TƯƠNG ỨNG:'
  ];

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const url = buildLessonPublicUrl(lesson.id);
    const hiResDataUrl = await generateLessonQrDataUrl(url, 400);
    const bytes = dataUrlToUint8Array(hiResDataUrl);
    const imgName = `${String(i + 1).padStart(2, '0')}_MaQR_${sanitizeExportFilename(lesson.title)}.png`;
    zip.file(imgName, bytes);
    manifestLines.push(`${i + 1}. ${lesson.title} (${formatLessonSubjectGrade(lesson)}) -> ${url} [${imgName}]`);
  }

  zip.file('Danh_sach_duong_dan.txt', manifestLines.join('\n'));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const dateStamp = getDateStampForFilename();
  triggerBlobDownload(zipBlob, `MaQR_BaiGiang_Elearning_${dateStamp}.zip`);
}
