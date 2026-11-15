import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from 'docx';
import {
  AIExamQuestion,
  GeneratedAIExamPackage,
  MatrixRow,
  SpecificationRow,
} from '../types/aiMatrixExam';

const FONT_FAMILY = 'Times New Roman';

// A4 Portrait: width = 11906 DXA, height = 16838 DXA
// Left + Right margin = 800 DXA each => Usable width = 10306 DXA
const PAGE_WIDTH_DXA = 11906;
const PAGE_HEIGHT_DXA = 16838;
const PAGE_MARGIN_DXA = 800;
const USABLE_WIDTH_DXA = PAGE_WIDTH_DXA - PAGE_MARGIN_DXA * 2; // 10306 DXA

const SOLID_BORDER = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: '334155',
};

const NONE_BORDER = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'FFFFFF',
};

const TABLE_BORDERS = {
  top: SOLID_BORDER,
  bottom: SOLID_BORDER,
  left: SOLID_BORDER,
  right: SOLID_BORDER,
  insideHorizontal: SOLID_BORDER,
  insideVertical: SOLID_BORDER,
};

const BORDERLESS_TABLE = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
  insideHorizontal: NONE_BORDER,
  insideVertical: NONE_BORDER,
};

const COMPACT_CELL_MARGIN = {
  top: 70,
  bottom: 70,
  left: 80,
  right: 80,
};

const STANDARD_CELL_MARGIN = {
  top: 100,
  bottom: 100,
  left: 120,
  right: 120,
};

function formatScoreVN(val: number): string {
  const num = Number.isFinite(val) ? Math.round((val + Number.EPSILON) * 100) / 100 : 0;
  if (num === 0) return '0';
  const fixed = Number.isInteger(num) ? num.toFixed(1) : String(num);
  return fixed.replace('.', ',');
}

function sanitizeExportFilename(raw: string): string {
  return (raw || 'De_Kiem_Tra_TT27')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 65);
}

function triggerDocxDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Tạo tiêu đề hành chính 2 cột chuẩn ở đầu mỗi phần:
 * - Cột trái: TRƯỜNG TIỂU HỌC QUANG HƯNG / PHÂN HIỆU TRỰC KHANG
 * - Cột phải: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc
 */
function createAdministrativeHeaderTable(): Table {
  const leftWidth = Math.floor(USABLE_WIDTH_DXA * 0.46);
  const rightWidth = USABLE_WIDTH_DXA - leftWidth;

  return new Table({
    width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    layout: TableLayoutType.FIXED,
    borders: BORDERLESS_TABLE,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: leftWidth, type: WidthType.DXA },
            margins: { top: 40, bottom: 80, left: 40, right: 40 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'TRƯỜNG TIỂU HỌC QUANG HƯNG',
                    font: FONT_FAMILY,
                    size: 22,
                    bold: false,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'PHÂN HIỆU TRỰC KHANG',
                    font: FONT_FAMILY,
                    size: 22,
                    bold: true,
                    underline: { type: UnderlineType.SINGLE },
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: rightWidth, type: WidthType.DXA },
            margins: { top: 40, bottom: 80, left: 40, right: 40 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                    font: FONT_FAMILY,
                    size: 22,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Độc lập - Tự do - Hạnh phúc',
                    font: FONT_FAMILY,
                    size: 23,
                    bold: true,
                    underline: { type: UnderlineType.SINGLE },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function createCellParagraph(
  text: string,
  options?: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    color?: string;
    afterSpacing?: number;
  }
): Paragraph {
  return new Paragraph({
    alignment: options?.align ?? AlignmentType.CENTER,
    spacing: { before: 20, after: options?.afterSpacing ?? 20 },
    children: [
      new TextRun({
        text,
        font: FONT_FAMILY,
        size: options?.size ?? 21,
        bold: options?.bold ?? false,
        italics: options?.italics ?? false,
        color: options?.color ?? '000000',
      }),
    ],
  });
}

/**
 * PHẦN I: MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ (Bảng 17 cột chuẩn Thông tư 27/2020/TT-BGDĐT)
 */
function buildMatrixSection(pkg: GeneratedAIExamPackage): Array<Paragraph | Table> {
  const { config, matrixRows } = pkg;

  // Tổng chiều rộng 17 cột = 10306 DXA
  // [TT, Mạch KT, M1_TN_C, M1_TN_Đ, M1_TL_C, M1_TL_Đ, M2_TN_C, M2_TN_Đ, M2_TL_C, M2_TL_Đ, M3_TN_C, M3_TN_Đ, M3_TL_C, M3_TL_Đ, Tổng_C, Tổng_Đ, Tỷ lệ %]
  const colWidths = [
    430,  // 1. TT
    2116, // 2. Mạch kiến thức / Chủ đề
    440,  // 3. M1 TNKQ Câu
    480,  // 4. M1 TNKQ Đ
    440,  // 5. M1 TL Câu
    480,  // 6. M1 TL Đ
    440,  // 7. M2 TNKQ Câu
    480,  // 8. M2 TNKQ Đ
    440,  // 9. M2 TL Câu
    480,  // 10. M2 TL Đ
    440,  // 11. M3 TNKQ Câu
    480,  // 12. M3 TNKQ Đ
    440,  // 13. M3 TL Câu
    480,  // 14. M3 TL Đ
    500,  // 15. Tổng Câu
    560,  // 16. Tổng Điểm
    680,  // 17. Tỷ lệ %
  ];

  const headerShading = {
    type: ShadingType.CLEAR,
    fill: 'E2E8F0',
    color: 'auto',
  };

  // Dòng tiêu đề 1 (Gộp cột cho Mức 1, Mức 2, Mức 3, Tổng)
  const headerRow1 = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: colWidths[0], type: WidthType.DXA },
        rowSpan: 3,
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('TT', { bold: true, size: 20 })],
      }),
      new TableCell({
        width: { size: colWidths[1], type: WidthType.DXA },
        rowSpan: 3,
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Mạch kiến thức /\nChủ đề', { bold: true, size: 20 })],
      }),
      new TableCell({
        width: {
          size: colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5],
          type: WidthType.DXA,
        },
        columnSpan: 4,
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Mức 1 (Nhận biết)', { bold: true, size: 20 })],
      }),
      new TableCell({
        width: {
          size: colWidths[6] + colWidths[7] + colWidths[8] + colWidths[9],
          type: WidthType.DXA,
        },
        columnSpan: 4,
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Mức 2 (Kết nối)', { bold: true, size: 20 })],
      }),
      new TableCell({
        width: {
          size: colWidths[10] + colWidths[11] + colWidths[12] + colWidths[13],
          type: WidthType.DXA,
        },
        columnSpan: 4,
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Mức 3 (Vận dụng)', { bold: true, size: 20 })],
      }),
      new TableCell({
        width: { size: colWidths[14] + colWidths[15], type: WidthType.DXA },
        columnSpan: 2,
        rowSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Tổng', { bold: true, size: 20 })],
      }),
      new TableCell({
        width: { size: colWidths[16], type: WidthType.DXA },
        rowSpan: 3,
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Tỷ lệ %', { bold: true, size: 20 })],
      }),
    ],
  });

  // Dòng tiêu đề 2 (TNKQ | TL cho từng mức)
  const headerRow2 = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [0, 1, 2].flatMap((levelIdx) => {
      const baseCol = 2 + levelIdx * 4;
      return [
        new TableCell({
          width: { size: colWidths[baseCol] + colWidths[baseCol + 1], type: WidthType.DXA },
          columnSpan: 2,
          verticalAlign: VerticalAlign.CENTER,
          margins: COMPACT_CELL_MARGIN,
          shading: headerShading,
          children: [createCellParagraph('TNKQ', { bold: true, size: 19 })],
        }),
        new TableCell({
          width: { size: colWidths[baseCol + 2] + colWidths[baseCol + 3], type: WidthType.DXA },
          columnSpan: 2,
          verticalAlign: VerticalAlign.CENTER,
          margins: COMPACT_CELL_MARGIN,
          shading: headerShading,
          children: [createCellParagraph('TL', { bold: true, size: 19 })],
        }),
      ];
    }),
  });

  // Dòng tiêu đề 3 (Câu | Đ cho 3 mức + Câu | Điểm cho cột Tổng)
  const headerRow3 = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      ...[0, 1, 2].flatMap((levelIdx) => {
        const baseCol = 2 + levelIdx * 4;
        return [
          new TableCell({
            width: { size: colWidths[baseCol], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: COMPACT_CELL_MARGIN,
            shading: headerShading,
            children: [createCellParagraph('Câu', { bold: true, size: 18 })],
          }),
          new TableCell({
            width: { size: colWidths[baseCol + 1], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: COMPACT_CELL_MARGIN,
            shading: headerShading,
            children: [createCellParagraph('Đ', { bold: true, size: 18 })],
          }),
          new TableCell({
            width: { size: colWidths[baseCol + 2], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: COMPACT_CELL_MARGIN,
            shading: headerShading,
            children: [createCellParagraph('Câu', { bold: true, size: 18 })],
          }),
          new TableCell({
            width: { size: colWidths[baseCol + 3], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: COMPACT_CELL_MARGIN,
            shading: headerShading,
            children: [createCellParagraph('Đ', { bold: true, size: 18 })],
          }),
        ];
      }),
      new TableCell({
        width: { size: colWidths[14], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Câu', { bold: true, size: 18 })],
      }),
      new TableCell({
        width: { size: colWidths[15], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: headerShading,
        children: [createCellParagraph('Điểm', { bold: true, size: 18 })],
      }),
    ],
  });

  const dataRows = matrixRows.map((row: MatrixRow, idx: number) => {
    const values: Array<{ text: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean }> = [
      { text: String(row.tt || idx + 1) },
      { text: row.machKienThuc, align: AlignmentType.LEFT },
      { text: row.m1_tn_cau ? String(row.m1_tn_cau) : '' },
      { text: row.m1_tn_diem ? formatScoreVN(row.m1_tn_diem) : '' },
      { text: row.m1_tl_cau ? String(row.m1_tl_cau) : '' },
      { text: row.m1_tl_diem ? formatScoreVN(row.m1_tl_diem) : '' },
      { text: row.m2_tn_cau ? String(row.m2_tn_cau) : '' },
      { text: row.m2_tn_diem ? formatScoreVN(row.m2_tn_diem) : '' },
      { text: row.m2_tl_cau ? String(row.m2_tl_cau) : '' },
      { text: row.m2_tl_diem ? formatScoreVN(row.m2_tl_diem) : '' },
      { text: row.m3_tn_cau ? String(row.m3_tn_cau) : '' },
      { text: row.m3_tn_diem ? formatScoreVN(row.m3_tn_diem) : '' },
      { text: row.m3_tl_cau ? String(row.m3_tl_cau) : '' },
      { text: row.m3_tl_diem ? formatScoreVN(row.m3_tl_diem) : '' },
      { text: String(row.tongSoCau), bold: true },
      { text: formatScoreVN(row.tongDiem), bold: true },
      { text: `${formatScoreVN(row.tyLePhanTram)}%` },
    ];

    return new TableRow({
      cantSplit: true,
      children: values.map((cell, cIdx) =>
        new TableCell({
          width: { size: colWidths[cIdx], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: COMPACT_CELL_MARGIN,
          children: [
            createCellParagraph(cell.text, {
              align: cell.align ?? AlignmentType.CENTER,
              bold: cell.bold ?? false,
              size: 20,
            }),
          ],
        })
      ),
    });
  });

  // Tính dòng Tổng cộng
  const sum = matrixRows.reduce(
    (acc, r) => ({
      m1_tn_cau: acc.m1_tn_cau + (r.m1_tn_cau || 0),
      m1_tn_diem: acc.m1_tn_diem + (r.m1_tn_diem || 0),
      m1_tl_cau: acc.m1_tl_cau + (r.m1_tl_cau || 0),
      m1_tl_diem: acc.m1_tl_diem + (r.m1_tl_diem || 0),
      m2_tn_cau: acc.m2_tn_cau + (r.m2_tn_cau || 0),
      m2_tn_diem: acc.m2_tn_diem + (r.m2_tn_diem || 0),
      m2_tl_cau: acc.m2_tl_cau + (r.m2_tl_cau || 0),
      m2_tl_diem: acc.m2_tl_diem + (r.m2_tl_diem || 0),
      m3_tn_cau: acc.m3_tn_cau + (r.m3_tn_cau || 0),
      m3_tn_diem: acc.m3_tn_diem + (r.m3_tn_diem || 0),
      m3_tl_cau: acc.m3_tl_cau + (r.m3_tl_cau || 0),
      m3_tl_diem: acc.m3_tl_diem + (r.m3_tl_diem || 0),
      tongSoCau: acc.tongSoCau + (r.tongSoCau || 0),
      tongDiem: acc.tongDiem + (r.tongDiem || 0),
    }),
    {
      m1_tn_cau: 0,
      m1_tn_diem: 0,
      m1_tl_cau: 0,
      m1_tl_diem: 0,
      m2_tn_cau: 0,
      m2_tn_diem: 0,
      m2_tl_cau: 0,
      m2_tl_diem: 0,
      m3_tn_cau: 0,
      m3_tn_diem: 0,
      m3_tl_cau: 0,
      m3_tl_diem: 0,
      tongSoCau: 0,
      tongDiem: 0,
    }
  );

  const summaryCells = [
    '',
    'Tổng cộng',
    sum.m1_tn_cau ? String(sum.m1_tn_cau) : '0',
    formatScoreVN(sum.m1_tn_diem),
    sum.m1_tl_cau ? String(sum.m1_tl_cau) : '0',
    formatScoreVN(sum.m1_tl_diem),
    sum.m2_tn_cau ? String(sum.m2_tn_cau) : '0',
    formatScoreVN(sum.m2_tn_diem),
    sum.m2_tl_cau ? String(sum.m2_tl_cau) : '0',
    formatScoreVN(sum.m2_tl_diem),
    sum.m3_tn_cau ? String(sum.m3_tn_cau) : '0',
    formatScoreVN(sum.m3_tn_diem),
    sum.m3_tl_cau ? String(sum.m3_tl_cau) : '0',
    formatScoreVN(sum.m3_tl_diem),
    String(sum.tongSoCau || config.soCauTracNghiem + config.soCauTuLuan),
    '10,0',
    '100%',
  ];

  const totalRow = new TableRow({
    cantSplit: true,
    children: summaryCells.map((txt, cIdx) =>
      new TableCell({
        width: { size: colWidths[cIdx], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: COMPACT_CELL_MARGIN,
        shading: { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' },
        children: [createCellParagraph(txt, { bold: true, size: 20 })],
      })
    ),
  });

  return [
    createAdministrativeHeaderTable(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 60 },
      children: [
        new TextRun({
          text: 'I. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ',
          font: FONT_FAMILY,
          size: 26,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `Môn: ${config.monHoc} – Khối ${config.khoiLop} • ${config.thoiDiemKiemTra} (Bộ sách: ${config.boSachGiaoKhoa})`,
          font: FONT_FAMILY,
          size: 22,
          italics: true,
        }),
      ],
    }),
    new Table({
      width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: colWidths,
      layout: TableLayoutType.FIXED,
      borders: TABLE_BORDERS,
      rows: [headerRow1, headerRow2, headerRow3, ...dataRows, totalRow],
    }),
  ];
}

/**
 * PHẦN II: BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
 * Kẻ bảng 6 cột (TT, Mạch kiến thức, Đơn vị kiến thức / Yêu cầu cần đạt (GDPT 2018),
 * Số câu hỏi theo mức độ [Mức 1, Mức 2, Mức 3], Tổng số câu, Mô tả chi tiết năng lực cần đạt ở từng câu)
 */
function buildSpecificationSection(pkg: GeneratedAIExamPackage): Array<Paragraph | Table> {
  const { config, specificationRows } = pkg;

  // Bảng 6 cột chuẩn, tổng chiều rộng = 10306 DXA
  const colWidths = [520, 1750, 2650, 1680, 750, 2956];
  const headerShading = {
    type: ShadingType.CLEAR,
    fill: 'E2E8F0',
    color: 'auto',
  };

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      { label: 'TT', width: colWidths[0] },
      { label: 'Mạch kiến thức', width: colWidths[1] },
      { label: 'Đơn vị kiến thức / Yêu cầu cần đạt (GDPT 2018)', width: colWidths[2] },
      { label: 'Số câu hỏi theo mức độ\n(Mức 1 | Mức 2 | Mức 3)', width: colWidths[3] },
      { label: 'Tổng số câu', width: colWidths[4] },
      { label: 'Mô tả chi tiết năng lực cần đạt ở từng câu', width: colWidths[5] },
    ].map(
      (col) =>
        new TableCell({
          width: { size: col.width, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          shading: headerShading,
          children: [createCellParagraph(col.label, { bold: true, size: 21 })],
        })
    ),
  });

  const dataRows = specificationRows.map((row: SpecificationRow, idx: number) => {
    const totalCau = (row.soCauMuc1 || 0) + (row.soCauMuc2 || 0) + (row.soCauMuc3 || 0);
    const levelBreakdown = `Mức 1: ${row.soCauMuc1 || 0} câu\nMức 2: ${row.soCauMuc2 || 0} câu\nMức 3: ${row.soCauMuc3 || 0} câu`;
    const detailsList =
      Array.isArray(row.moTaChiTietTheoCau) && row.moTaChiTietTheoCau.length > 0
        ? row.moTaChiTietTheoCau
        : ['Đánh giá đúng yêu cầu cần đạt của mạch kiến thức.'];

    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: colWidths[0], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [createCellParagraph(String(row.tt || idx + 1), { bold: true, size: 21 })],
        }),
        new TableCell({
          width: { size: colWidths[1], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [
            createCellParagraph(row.machKienThuc, {
              align: AlignmentType.LEFT,
              bold: true,
              size: 21,
            }),
          ],
        }),
        new TableCell({
          width: { size: colWidths[2], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [
            createCellParagraph(row.donViKienThucYCCD, {
              align: AlignmentType.LEFT,
              size: 21,
            }),
          ],
        }),
        new TableCell({
          width: { size: colWidths[3], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [
            createCellParagraph(`Mức 1: ${row.soCauMuc1 || 0} câu`, { size: 20 }),
            createCellParagraph(`Mức 2: ${row.soCauMuc2 || 0} câu`, { size: 20 }),
            createCellParagraph(`Mức 3: ${row.soCauMuc3 || 0} câu`, { size: 20 }),
          ],
        }),
        new TableCell({
          width: { size: colWidths[4], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [createCellParagraph(`${totalCau} câu`, { bold: true, size: 21 })],
        }),
        new TableCell({
          width: { size: colWidths[5], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: detailsList.map((line) =>
            createCellParagraph(`• ${line}`, {
              align: AlignmentType.LEFT,
              size: 20,
              afterSpacing: 40,
            })
          ),
        }),
      ],
    });
  });

  return [
    new Paragraph({ children: [new PageBreak()] }),
    createAdministrativeHeaderTable(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 60 },
      children: [
        new TextRun({
          text: 'II. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ',
          font: FONT_FAMILY,
          size: 26,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `Môn: ${config.monHoc} – Khối ${config.khoiLop} • ${config.thoiDiemKiemTra} (Theo Chương trình GDPT 2018 & Thông tư 27/2020/TT-BGDĐT)`,
          font: FONT_FAMILY,
          size: 22,
          italics: true,
        }),
      ],
    }),
    new Table({
      width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: colWidths,
      layout: TableLayoutType.FIXED,
      borders: TABLE_BORDERS,
      rows: [headerRow, ...dataRows],
    }),
  ];
}

/**
 * Kẻ bảng 2 cột (Cột A và Cột B) cho câu hỏi dạng Nối
 */
function buildMatchingQuestionTable(q: AIExamQuestion): Table {
  const halfWidth = Math.floor(USABLE_WIDTH_DXA / 2);
  const colWidths = [halfWidth, USABLE_WIDTH_DXA - halfWidth];
  const cotA = Array.isArray(q.cotA) && q.cotA.length > 0 ? q.cotA : ['1. Nội dung A1', '2. Nội dung A2'];
  const cotB = Array.isArray(q.cotB) && q.cotB.length > 0 ? q.cotB : ['a. Nội dung B1', 'b. Nội dung B2'];
  const maxRows = Math.max(cotA.length, cotB.length);

  const itemRows: TableRow[] = [];
  for (let i = 0; i < maxRows; i++) {
    itemRows.push(
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: colWidths[0], type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              createCellParagraph(cotA[i] || '', {
                align: AlignmentType.LEFT,
                size: 22,
              }),
            ],
          }),
          new TableCell({
            width: { size: colWidths[1], type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              createCellParagraph(cotB[i] || '', {
                align: AlignmentType.LEFT,
                size: 22,
              }),
            ],
          }),
        ],
      })
    );
  }

  return new Table({
    width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: colWidths[0], type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' },
            children: [createCellParagraph('Cột A', { bold: true, size: 22 })],
          }),
          new TableCell({
            width: { size: colWidths[1], type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' },
            children: [createCellParagraph('Cột B', { bold: true, size: 22 })],
          }),
        ],
      }),
      ...itemRows,
    ],
  });
}

/**
 * PHẦN III: ĐỀ KIỂM TRA CHÍNH THỨC
 */
function buildOfficialExamSection(pkg: GeneratedAIExamPackage): Array<Paragraph | Table> {
  const { config, questions } = pkg;
  const tnQuestions = questions.filter((q) => q.phan === 'TRAC_NGHIEM');
  const tlQuestions = questions.filter((q) => q.phan === 'TU_LUAN');
  const totalTNScore = tnQuestions.reduce((acc, q) => acc + (q.diem || 0), 0);
  const totalTLScore = tlQuestions.reduce((acc, q) => acc + (q.diem || 0), 0);

  // Khung thông tin học sinh (Họ và tên, Lớp, Môn, Thời gian làm bài)
  const studentInfoTable = new Table({
    width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [USABLE_WIDTH_DXA],
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: 'Họ và tên học sinh: ',
                    font: FONT_FAMILY,
                    size: 23,
                    bold: true,
                  }),
                  new TextRun({
                    text: '....................................................................................   ',
                    font: FONT_FAMILY,
                    size: 23,
                  }),
                  new TextRun({
                    text: 'Lớp: ',
                    font: FONT_FAMILY,
                    size: 23,
                    bold: true,
                  }),
                  new TextRun({
                    text: `......... (Khối ${config.khoiLop})`,
                    font: FONT_FAMILY,
                    size: 23,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Môn kiểm tra: ${config.monHoc}`,
                    font: FONT_FAMILY,
                    size: 23,
                    bold: true,
                  }),
                  new TextRun({
                    text: `   •   Thời điểm: ${config.thoiDiemKiemTra}   •   Thời gian làm bài: ${config.thoiGianLamBai} phút (không kể thời gian phát đề)`,
                    font: FONT_FAMILY,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Khung ĐIỂM (Bằng số, Bằng chữ) và LỜI PHÊ CỦA GIÁO VIÊN
  const scoreColWidth = Math.floor(USABLE_WIDTH_DXA * 0.34);
  const commentColWidth = USABLE_WIDTH_DXA - scoreColWidth;

  const scoreAndCommentTable = new Table({
    width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [scoreColWidth, commentColWidth],
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: scoreColWidth, type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            shading: { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' },
            children: [createCellParagraph('ĐIỂM', { bold: true, size: 22 })],
          }),
          new TableCell({
            width: { size: commentColWidth, type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            shading: { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' },
            children: [createCellParagraph('LỜI PHÊ CỦA GIÁO VIÊN', { bold: true, size: 22 })],
          }),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: scoreColWidth, type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            children: [
              new Paragraph({
                spacing: { before: 80, after: 140 },
                children: [
                  new TextRun({
                    text: 'Bằng số: ..............................',
                    font: FONT_FAMILY,
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: 'Bằng chữ: ............................',
                    font: FONT_FAMILY,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: commentColWidth, type: WidthType.DXA },
            margins: STANDARD_CELL_MARGIN,
            children: [
              new Paragraph({
                spacing: { before: 60, after: 100 },
                children: [
                  new TextRun({
                    text: '.....................................................................................................................',
                    font: FONT_FAMILY,
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 100 },
                children: [
                  new TextRun({
                    text: '.....................................................................................................................',
                    font: FONT_FAMILY,
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: '.....................................................................................................................',
                    font: FONT_FAMILY,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const children: Array<Paragraph | Table> = [
    new Paragraph({ children: [new PageBreak()] }),
    createAdministrativeHeaderTable(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 60 },
      children: [
        new TextRun({
          text: `III. ĐỀ KIỂM TRA ĐỊNH KÌ – ${config.thoiDiemKiemTra.toUpperCase()}`,
          font: FONT_FAMILY,
          size: 26,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: `MÔN: ${config.monHoc.toUpperCase()} – LỚP ${config.khoiLop}`,
          font: FONT_FAMILY,
          size: 24,
          bold: true,
        }),
      ],
    }),
    studentInfoTable,
    new Paragraph({ spacing: { after: 100 }, children: [] }),
    scoreAndCommentTable,
  ];

  // I. PHẦN TRẮC NGHIỆM
  if (tnQuestions.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 100 },
        children: [
          new TextRun({
            text: `I. PHẦN TRẮC NGHIỆM (${formatScoreVN(totalTNScore)} điểm)`,
            font: FONT_FAMILY,
            size: 24,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: 'Khoanh vào chữ cái đặt trước câu trả lời đúng hoặc thực hiện theo yêu cầu của từng câu hỏi:',
            font: FONT_FAMILY,
            size: 22,
            italics: true,
          }),
        ],
      })
    );

    tnQuestions.forEach((q) => {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 80 },
          children: [
            new TextRun({
              text: `Câu ${q.soThuTu} (${formatScoreVN(q.diem)} điểm) [${q.mucDo}]: `,
              font: FONT_FAMILY,
              size: 23,
              bold: true,
            }),
            new TextRun({
              text: q.noiDungCauHoi,
              font: FONT_FAMILY,
              size: 23,
            }),
          ],
        })
      );

      if (q.hinhThuc === 'Nối') {
        children.push(buildMatchingQuestionTable(q));
        const pairCount = Array.isArray(q.cotA) && q.cotA.length > 0 ? q.cotA.length : 3;
        const blankPairs = Array.from({ length: pairCount }, (_, idx) => `${idx + 1} nối với .....`).join(
          '   ;   '
        );
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 100 },
            children: [
              new TextRun({
                text: 'Trả lời: ',
                font: FONT_FAMILY,
                size: 22,
                bold: true,
              }),
              new TextRun({
                text: blankPairs,
                font: FONT_FAMILY,
                size: 22,
              }),
            ],
          })
        );
      } else if (Array.isArray(q.luaChon) && q.luaChon.length > 0) {
        q.luaChon.forEach((opt) => {
          children.push(
            new Paragraph({
              indent: { left: 360 },
              spacing: { after: 50 },
              children: [
                new TextRun({
                  text: opt,
                  font: FONT_FAMILY,
                  size: 22,
                }),
              ],
            })
          );
        });
      } else if (q.hinhThuc === 'Đúng - Sai') {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: '[   ] Đúng          [   ] Sai',
                font: FONT_FAMILY,
                size: 22,
                bold: true,
              }),
            ],
          })
        );
      } else if (q.hinhThuc === 'Điền khuyết') {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'Điền đáp án: ..........................................................................................................',
                font: FONT_FAMILY,
                size: 22,
              }),
            ],
          })
        );
      }
    });
  }

  // II. PHẦN TỰ LUẬN
  if (tlQuestions.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 100 },
        children: [
          new TextRun({
            text: `II. PHẦN TỰ LUẬN (${formatScoreVN(totalTLScore)} điểm)`,
            font: FONT_FAMILY,
            size: 24,
            bold: true,
          }),
        ],
      })
    );

    tlQuestions.forEach((q) => {
      children.push(
        new Paragraph({
          spacing: { before: 140, after: 80 },
          children: [
            new TextRun({
              text: `Câu ${q.soThuTu} (${formatScoreVN(q.diem)} điểm) [${q.mucDo}]: `,
              font: FONT_FAMILY,
              size: 23,
              bold: true,
            }),
            new TextRun({
              text: q.noiDungCauHoi,
              font: FONT_FAMILY,
              size: 23,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 40, after: 80 },
          children: [
            new TextRun({
              text: 'Bài làm:',
              font: FONT_FAMILY,
              size: 22,
              bold: true,
              italics: true,
            }),
          ],
        })
      );

      // 4 dòng kẻ chấm bên dưới câu Tự luận
      for (let lineIdx = 0; lineIdx < 4; lineIdx++) {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: '..........................................................................................................................................................................',
                font: FONT_FAMILY,
                size: 22,
              }),
            ],
          })
        );
      }
    });
  }

  return children;
}

/**
 * PHẦN IV: ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (BIỂU ĐIỂM)
 * Kẻ bảng 5 cột (Câu, Mức độ / Dạng, Đáp án chính xác, Hướng dẫn chấm chi tiết, Biểu điểm)
 * + Dòng Tổng điểm toàn bài: 10,0 điểm
 */
function buildAnswerKeySection(pkg: GeneratedAIExamPackage): Array<Paragraph | Table> {
  const { config, questions } = pkg;

  // Bảng 5 cột chuẩn, tổng chiều rộng = 10306 DXA
  const colWidths = [850, 1850, 2750, 3656, 1200];
  const headerShading = {
    type: ShadingType.CLEAR,
    fill: 'E2E8F0',
    color: 'auto',
  };

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      { label: 'Câu', width: colWidths[0] },
      { label: 'Mức độ / Dạng', width: colWidths[1] },
      { label: 'Đáp án chính xác', width: colWidths[2] },
      { label: 'Hướng dẫn chấm chi tiết', width: colWidths[3] },
      { label: 'Biểu điểm', width: colWidths[4] },
    ].map(
      (col) =>
        new TableCell({
          width: { size: col.width, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          shading: headerShading,
          children: [createCellParagraph(col.label, { bold: true, size: 21 })],
        })
    ),
  });

  const dataRows = questions.map((q) =>
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: colWidths[0], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [createCellParagraph(`Câu ${q.soThuTu}`, { bold: true, size: 21 })],
        }),
        new TableCell({
          width: { size: colWidths[1], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [
            createCellParagraph(q.mucDo, { bold: true, size: 20 }),
            createCellParagraph(`(${q.hinhThuc})`, { italics: true, size: 19 }),
          ],
        }),
        new TableCell({
          width: { size: colWidths[2], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [
            createCellParagraph(q.dapAnChinhXac, {
              align: AlignmentType.LEFT,
              bold: true,
              size: 21,
            }),
          ],
        }),
        new TableCell({
          width: { size: colWidths[3], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [
            createCellParagraph(q.huongDanCham, {
              align: AlignmentType.LEFT,
              size: 21,
            }),
          ],
        }),
        new TableCell({
          width: { size: colWidths[4], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: STANDARD_CELL_MARGIN,
          children: [createCellParagraph(`${formatScoreVN(q.diem)} điểm`, { bold: true, size: 21 })],
        }),
      ],
    })
  );

  const totalScoreRow = new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        width: {
          size: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
          type: WidthType.DXA,
        },
        columnSpan: 4,
        verticalAlign: VerticalAlign.CENTER,
        margins: STANDARD_CELL_MARGIN,
        shading: { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' },
        children: [
          createCellParagraph('Tổng điểm toàn bài', {
            align: AlignmentType.RIGHT,
            bold: true,
            size: 22,
          }),
        ],
      }),
      new TableCell({
        width: { size: colWidths[4], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: STANDARD_CELL_MARGIN,
        shading: { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' },
        children: [createCellParagraph('10,0 điểm', { bold: true, size: 22 })],
      }),
    ],
  });

  return [
    new Paragraph({ children: [new PageBreak()] }),
    createAdministrativeHeaderTable(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 60 },
      children: [
        new TextRun({
          text: 'IV. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (BIỂU ĐIỂM)',
          font: FONT_FAMILY,
          size: 26,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `Môn: ${config.monHoc} – Khối ${config.khoiLop} • ${config.thoiDiemKiemTra}`,
          font: FONT_FAMILY,
          size: 22,
          italics: true,
        }),
      ],
    }),
    new Table({
      width: { size: USABLE_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: colWidths,
      layout: TableLayoutType.FIXED,
      borders: TABLE_BORDERS,
      rows: [headerRow, ...dataRows, totalScoreRow],
    }),
  ];
}

/**
 * Xuất trọn bộ hồ sơ Ma trận + Bản đặc tả + Đề kiểm tra chính thức + Đáp án & Hướng dẫn chấm ra file Word (.docx)
 */
export async function exportAIExamToWord(pkg: GeneratedAIExamPackage): Promise<void> {
  const { config } = pkg;

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_WIDTH_DXA,
              height: PAGE_HEIGHT_DXA,
            },
            margin: {
              top: PAGE_MARGIN_DXA,
              bottom: PAGE_MARGIN_DXA,
              left: PAGE_MARGIN_DXA,
              right: PAGE_MARGIN_DXA,
            },
          },
        },
        children: [
          ...buildMatrixSection(pkg),
          ...buildSpecificationSection(pkg),
          ...buildOfficialExamSection(pkg),
          ...buildAnswerKeySection(pkg),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeSubject = sanitizeExportFilename(config.monHoc);
  const safePeriod = sanitizeExportFilename(config.thoiDiemKiemTra);
  const filename = `De_MaTran_TT27_${safeSubject}_Khoi_${config.khoiLop}_${safePeriod}.docx`;

  triggerDocxDownload(blob, filename);
}
