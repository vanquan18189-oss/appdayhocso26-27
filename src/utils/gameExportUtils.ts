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
import { GameItem, QuizziGameItem } from '../types';

export type ExportableGame = GameItem | QuizziGameItem;

export const GAME_HEADER_LINE_1 = 'PHIẾU DANH MỤC TRÒ CHƠI HỌC TẬP KÈM MÃ QR';
export const GAME_HEADER_LINE_2 = 'Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang';
export const GAME_HEADER_LINE_3 =
  'Dùng camera điện thoại hoặc Zalo quét mã QR để tham gia trực tiếp trò chơi học tập.';

export function getExportableGameId(item: ExportableGame): string {
  return String(item.id);
}

export function buildGamePublicUrl(item: ExportableGame): string {
  const rawExternal =
    (item as QuizziGameItem).embedUrl ||
    (item as any).gameUrl ||
    (item as any).externalLink ||
    (item as any).url ||
    '';

  if (typeof rawExternal === 'string' && /^https?:\/\//i.test(rawExternal.trim())) {
    return rawExternal.trim();
  }

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://appdayhocso26-27.vercel.app';

  return `${origin}/game/${encodeURIComponent(getExportableGameId(item))}`;
}

export function getGameFormatOrType(item: ExportableGame): string {
  const rawType = String(item.type || '').trim();

  if (rawType === 'golden_bell') return 'Rung Chuông Vàng';
  if (rawType === 'flashcards') return 'Thẻ Ghi Nhớ Flashcards';
  if (rawType === 'speed_quiz') return 'Đua Thuyền / Vượt Chướng Ngại Vật';
  if (rawType === 'lucky_wheel') return 'Vòng Quay May Mắn';

  const isQuizzi =
    'subjectLabel' in item ||
    'desc' in item ||
    String(item.id).toLowerCase().startsWith('quizzi');

  if (isQuizzi) {
    if (rawType && rawType.toLowerCase() !== 'quizzi') {
      return `Trò chơi Quizzi (${rawType})`;
    }
    return 'Trò chơi Quizzi';
  }

  return rawType || 'Trò chơi học tập tương tác';
}

export function formatGameSubjectGradeClass(item: ExportableGame): string {
  const rawSubject =
    ((item as QuizziGameItem).subjectLabel || item.subject || 'Chưa rõ môn').trim();

  const rawGrade = ((item as GameItem).khoi || item.grade || 'Khối 3').trim();
  const normalizedGrade = /^khối\s+/i.test(rawGrade) ? rawGrade : `Khối ${rawGrade}`;

  const rawClass = ((item as GameItem).lop || item.classInfo || '').trim();
  let normalizedClass = 'Tất cả các lớp';
  if (rawClass) {
    if (/^(lớp|tất cả)/i.test(rawClass)) {
      normalizedClass = rawClass;
    } else {
      normalizedClass = `Lớp ${rawClass}`;
    }
  }

  return `Môn: ${rawSubject} • ${normalizedGrade} • ${normalizedClass}`;
}

export function sanitizeGameExportFilename(input: string): string {
  return (input || 'tro_choi')
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

export async function generateGameQrDataUrl(url: string, size = 200): Promise<string> {
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

export async function generateQrMapForGames(
  games: ExportableGame[],
  size = 200
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    games.map(async (game) => {
      const key = getExportableGameId(game);
      const url = buildGamePublicUrl(game);
      const dataUrl = await generateGameQrDataUrl(url, size);
      return [key, dataUrl] as const;
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

export async function exportGameCatalogToDocx(
  games: ExportableGame[],
  existingQrMap?: Record<string, string>
): Promise<void> {
  if (!games || games.length === 0) return;

  const qrMap = { ...(existingQrMap || {}) };
  for (const game of games) {
    const key = getExportableGameId(game);
    if (!qrMap[key]) {
      qrMap[key] = await generateGameQrDataUrl(buildGamePublicUrl(game), 200);
    }
  }

  // A4 portrait width = 11906 DXA, margins 900 left + 900 right => usable table width = 10106 DXA
  const colWidths = [650, 2500, 1850, 3250, 1856];

  const headerCells = [
    { label: 'STT', width: colWidths[0] },
    { label: 'Tiêu đề trò chơi', width: colWidths[1] },
    { label: 'Hình thức / Loại', width: colWidths[2] },
    { label: 'Đường dẫn tham gia', width: colWidths[3] },
    { label: 'Mã QR của trò chơi', width: colWidths[4] }
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

  const dataRows = games.map((game, idx) => {
    const key = getExportableGameId(game);
    const publicUrl = buildGamePublicUrl(game);
    const qrBytes = dataUrlToUint8Array(qrMap[key]);

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
        // 2. Tiêu đề trò chơi + dòng phụ màu xanh (Môn • Khối • Lớp)
        new TableCell({
          width: { size: colWidths[1], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: game.title || 'Trò chơi học tập',
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
                  text: formatGameSubjectGradeClass(game),
                  font: 'Times New Roman',
                  size: 20,
                  color: '0284C7'
                })
              ]
            })
          ]
        }),
        // 3. Hình thức / Loại
        new TableCell({
          width: { size: colWidths[2], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: getGameFormatOrType(game),
                  font: 'Times New Roman',
                  size: 21,
                  color: '1E293B'
                })
              ]
            })
          ]
        }),
        // 4. Đường dẫn tham gia (blue underlined ExternalHyperlink)
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
        // 5. Mã QR 100x100px chèn trực tiếp vào ô trong file Word .docx
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
                text: GAME_HEADER_LINE_1,
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
                text: GAME_HEADER_LINE_2,
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
                text: GAME_HEADER_LINE_3,
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
    games.length === 1
      ? `Phieu-QR-TroChoi-${sanitizeGameExportFilename(games[0].title)}-${dateStamp}.docx`
      : `Phieu-danh-muc-tro-choi-QR-${dateStamp}.docx`;
  triggerBlobDownload(blob, filename);
}

export async function downloadGameQrImages(games: ExportableGame[]): Promise<void> {
  if (!games || games.length === 0) return;

  if (games.length === 1) {
    const game = games[0];
    const url = buildGamePublicUrl(game);
    const hiResDataUrl = await generateGameQrDataUrl(url, 400);
    const bytes = dataUrlToUint8Array(hiResDataUrl);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
    triggerBlobDownload(
      blob,
      `MaQR_TroChoi_${sanitizeGameExportFilename(game.title)}_${getExportableGameId(game)}.png`
    );
    return;
  }

  const zip = new JSZip();
  const manifestLines: string[] = [
    GAME_HEADER_LINE_1,
    GAME_HEADER_LINE_2,
    '',
    'DANH SÁCH MÃ QR TRÒ CHƠI HỌC TẬP:'
  ];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const url = buildGamePublicUrl(game);
    const hiResDataUrl = await generateGameQrDataUrl(url, 400);
    const bytes = dataUrlToUint8Array(hiResDataUrl);
    const imgName = `${String(i + 1).padStart(2, '0')}_MaQR_${sanitizeGameExportFilename(game.title)}.png`;
    zip.file(imgName, bytes);
    manifestLines.push(
      `${i + 1}. ${game.title} (${formatGameSubjectGradeClass(game)} - ${getGameFormatOrType(game)}) -> ${url} [${imgName}]`
    );
  }

  zip.file('Danh_sach_duong_dan_tro_choi.txt', manifestLines.join('\n'));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const dateStamp = getDateStampForFilename();
  triggerBlobDownload(zipBlob, `MaQR_TroChoi_HocTap_${dateStamp}.zip`);
}
