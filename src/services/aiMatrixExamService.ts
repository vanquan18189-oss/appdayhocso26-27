import { callGeminiApi } from './geminiService';
import {
  AIExamConfig,
  AIExamQuestion,
  DangCauHoiTracNghiem,
  GeneratedAIExamPackage,
  HinhThucCauHoi,
  MatrixRow,
  MucDoNhanThucTT27,
  PhanCauHoi,
  SpecificationRow,
  SUBJECTS_BY_GRADE,
} from '../types/aiMatrixExam';

const QUESTION_TYPE_LABEL_MAP: Record<DangCauHoiTracNghiem, HinhThucCauHoi> = {
  multiple_choice: 'Trắc nghiệm 4 lựa chọn',
  fill_blank: 'Điền khuyết',
  matching: 'Nối',
  true_false: 'Đúng - Sai',
};

function roundToTwoDecimals(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * Loại bỏ các tiền tố lặp thừa ở đầu nội dung câu hỏi như:
 * "I. PHẦN TRẮC NGHIỆM - Câu 1:", "PHẦN II. TỰ LUẬN - Câu 8 (1,0 điểm):", "Câu 1:", "Bài 2."...
 */
export function stripRedundantQuestionPrefix(rawText: string): string {
  if (!rawText) return '';
  let cleaned = String(rawText).trim();

  // Xóa tiền tố Phần La Mã / Phần chữ ở đầu câu
  cleaned = cleaned.replace(
    /^(?:(?:PHẦN\s*)?[I1V2X]+\s*[\.\:\-\–\—]?\s*)?(?:PHẦN\s+(?:TRẮC\s+NGHIỆM|TỰ\s+LUẬN)(?:\s+KHÁCH\s+QUAN)?)\s*[\.\:\-\–\—]?\s*/i,
    ''
  );

  // Xóa tiếp tiền tố "Câu 1 (0,5 điểm):", "Câu 1 [Mức 1]:", "Câu 1:", "Bài 1." lặp lại nhiều lần nếu có
  for (let i = 0; i < 2; i++) {
    cleaned = cleaned.replace(
      /^(?:Câu\s*(?:hỏi\s*)?(?:số\s*)?\d+|Bài\s*\d+)\s*(?:\([^)]*\)|\[[^\]]*\])?\s*[\.\:\-\–\—]\s*/i,
      ''
    );
  }

  return cleaned.trim();
}

function normalizeMucDo(raw: unknown, fallback: MucDoNhanThucTT27 = 'Mức 1'): MucDoNhanThucTT27 {
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('3') || s.includes('vận dụng')) return 'Mức 3';
  if (s.includes('2') || s.includes('kết nối') || s.includes('thông hiểu')) return 'Mức 2';
  if (s.includes('1') || s.includes('nhận biết')) return 'Mức 1';
  return fallback;
}

function normalizeHinhThuc(
  raw: unknown,
  phan: PhanCauHoi,
  allowedTypes: DangCauHoiTracNghiem[]
): HinhThucCauHoi {
  if (phan === 'TU_LUAN') return 'Tự luận';

  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('nối') || s.includes('matching') || s.includes('ghép')) {
    return 'Nối';
  }
  if (s.includes('điền') || s.includes('khuyết') || s.includes('fill')) {
    return 'Điền khuyết';
  }
  if (s.includes('đúng') || s.includes('sai') || s.includes('true')) {
    return 'Đúng - Sai';
  }
  if (s.includes('4 lựa chọn') || s.includes('trắc nghiệm') || s.includes('multiple')) {
    return 'Trắc nghiệm 4 lựa chọn';
  }

  const firstAllowed = allowedTypes[0] || 'multiple_choice';
  return QUESTION_TYPE_LABEL_MAP[firstAllowed] || 'Trắc nghiệm 4 lựa chọn';
}

/**
 * Đảm bảo câu hỏi dạng 'Nối' luôn có đầy đủ cả cotA và cotB tương ứng, tuyệt đối không để trống cotB
 */
function ensureValidMatchingColumns(
  rawCotA: unknown,
  rawCotB: unknown,
  rawLuaChon: unknown,
  dapAnChinhXac: string,
  monHoc: string
): { cotA: string[]; cotB: string[]; dapAnChinhXac: string } {
  let cotA: string[] = Array.isArray(rawCotA)
    ? rawCotA.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  let cotB: string[] = Array.isArray(rawCotB)
    ? rawCotB.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  // Trường hợp AI để cặp nối dạng "Vế A -> Vế B" hoặc "1. ... - a. ..." bên trong cotA hoặc luaChon
  if (cotA.length > 0 && cotB.length === 0) {
    const splitA: string[] = [];
    const splitB: string[] = [];
    for (const line of cotA) {
      const parts = line.split(/\s*(?:->|→|↔|—|–|\s-\s|\|)\s*/);
      if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
        splitA.push(parts[0].trim());
        splitB.push(parts.slice(1).join(' - ').trim());
      }
    }
    if (splitA.length >= 2 && splitB.length === splitA.length) {
      cotA = splitA;
      cotB = splitB;
    }
  }

  // Nếu vẫn chưa có cotB, thử tách từ luaChon
  if (cotB.length === 0 && Array.isArray(rawLuaChon) && rawLuaChon.length >= 2) {
    const optStrings = rawLuaChon.map((x) => String(x || '').trim()).filter(Boolean);
    if (cotA.length === 0) {
      const half = Math.ceil(optStrings.length / 2);
      cotA = optStrings.slice(0, half);
      cotB = optStrings.slice(half);
    } else {
      cotB = optStrings.slice(0, cotA.length);
    }
  }

  // Nếu cả cotA và cotB vẫn trống hoặc thiếu, khởi tạo cặp nối mặc định chuẩn theo môn học
  if (cotA.length < 2) {
    cotA = [
      `1. Nội dung kiến thức ${monHoc} thứ nhất`,
      `2. Nội dung kiến thức ${monHoc} thứ hai`,
      `3. Nội dung kiến thức ${monHoc} thứ ba`,
    ];
  }

  if (cotB.length === 0) {
    cotB = cotA.map((_, idx) => {
      const letter = String.fromCharCode(97 + idx);
      return `${letter}. Kết quả / Khái niệm tương ứng với ý ${idx + 1}`;
    });
  } else if (cotB.length < cotA.length) {
    while (cotB.length < cotA.length) {
      const idx = cotB.length;
      const letter = String.fromCharCode(97 + idx);
      cotB.push(`${letter}. Nội dung tương ứng số ${idx + 1}`);
    }
  }

  // Chuẩn hóa nhãn đầu dòng cho Cột A (1, 2, 3...) và Cột B (a, b, c...)
  cotA = cotA.map((item, idx) =>
    /^\d+[\.\)\:]/.test(item) ? item : `${idx + 1}. ${item}`
  );
  cotB = cotB.map((item, idx) => {
    const letter = String.fromCharCode(97 + idx);
    return /^[a-zA-Z][\.\)\:]/.test(item) ? item : `${letter}. ${item}`;
  });

  const normalizedAnswer =
    dapAnChinhXac && dapAnChinhXac.trim()
      ? dapAnChinhXac.trim()
      : cotA.map((_, idx) => `${idx + 1} - ${String.fromCharCode(97 + idx)}`).join('; ');

  return {
    cotA,
    cotB,
    dapAnChinhXac: normalizedAnswer,
  };
}

/**
 * Cân bằng điểm số của danh sách câu hỏi sao cho tổng điểm luôn bằng đúng 10.0
 */
function normalizeQuestionScoresToTen(questions: AIExamQuestion[]): AIExamQuestion[] {
  const n = questions.length;
  if (n === 0) return [];

  // Khởi tạo điểm hợp lệ (> 0) cho từng câu
  const rawScores = questions.map((q) => {
    const d = Number(q.diem);
    if (Number.isFinite(d) && d > 0) return roundToTwoDecimals(d);
    return q.phan === 'TU_LUAN' ? 1.5 : 0.5;
  });

  const rawSum = rawScores.reduce((acc, s) => acc + s, 0);

  if (Math.abs(rawSum - 10) <= 0.001) {
    return questions.map((q, idx) => ({ ...q, diem: roundToTwoDecimals(rawScores[idx]) }));
  }

  // Quy đổi theo bội số 0.25 điểm để đẹp chuẩn sư phạm Tiểu học (tổng 10.0 điểm = 40 đơn vị 0.25)
  const totalQuarterUnits = 40;
  if ( n <= totalQuarterUnits) {
    const scale = totalQuarterUnits / (rawSum > 0 ? rawSum : n);
    const units = rawScores.map((s) => Math.max(1, Math.round(s * scale)));
    let currentUnits = units.reduce((a, b) => a + b, 0);

    // Điều chỉnh phần dư ưu tiên vào câu Tự luận hoặc câu cuối cùng
    let cursor = n - 1;
    while (currentUnits !== totalQuarterUnits) {
      if (currentUnits < totalQuarterUnits) {
        units[cursor] += 1;
        currentUnits += 1;
      } else if (units[cursor] > 1) {
        units[cursor] -= 1;
        currentUnits -= 1;
      }
      cursor = (cursor - 1 + n) % n;
    }

    return questions.map((q, idx) => ({
      ...q,
      diem: roundToTwoDecimals(units[idx] * 0.25),
    }));
  }

  // Trường hợp tổng số câu > 40 (hiếm gặp), chia chính xác tới 2 chữ số thập phân
  const scaled = rawScores.map((s) => roundToTwoDecimals((s / rawSum) * 10));
  const sumExceptLast = scaled.slice(0, n - 1).reduce((a, b) => a + b, 0);
  scaled[n - 1] = roundToTwoDecimals(Math.max(0.05, 10 - sumExceptLast));

  return questions.map((q, idx) => ({
    ...q,
    diem: scaled[idx],
  }));
}

/**
 * Đồng bộ bảng Ma trận đề (`matrixRows`) khớp tuyệt đối với danh sách câu hỏi đã chuẩn hóa
 * (Tổng số câu = soCauTracNghiem + soCauTuLuan, Tổng điểm = 10.0, Tỷ lệ = 100%)
 */
function buildSynchronizedMatrixRows(
  rawMatrixRows: unknown,
  questions: AIExamQuestion[],
  defaultTopic: string
): MatrixRow[] {
  const rawRows = Array.isArray(rawMatrixRows) ? rawMatrixRows : [];
  const topicNames: string[] = rawRows
    .map((r: any) => String(r?.machKienThuc || '').trim())
    .filter(Boolean);

  if (topicNames.length === 0) {
    const splitTopics = defaultTopic
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (splitTopics.length > 0) {
      topicNames.push(...splitTopics.slice(0, 4));
    } else {
      topicNames.push('Mạch kiến thức trọng tâm học kì');
    }
  }

  const rowCount = Math.min(topicNames.length, Math.max(1, questions.length));
  const finalTopics = topicNames.slice(0, rowCount);

  const buckets: MatrixRow[] = finalTopics.map((machKienThuc, idx) => ({
    tt: idx + 1,
    machKienThuc,
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
    tyLePhanTram: 0,
  }));

  questions.forEach((q, qIdx) => {
    const bucketIdx = qIdx % buckets.length;
    const row = buckets[bucketIdx];
    const isTN = q.phan === 'TRAC_NGHIEM';

    if (q.mucDo === 'Mức 1') {
      if (isTN) {
        row.m1_tn_cau += 1;
        row.m1_tn_diem = roundToTwoDecimals(row.m1_tn_diem + q.diem);
      } else {
        row.m1_tl_cau += 1;
        row.m1_tl_diem = roundToTwoDecimals(row.m1_tl_diem + q.diem);
      }
    } else if (q.mucDo === 'Mức 2') {
      if (isTN) {
        row.m2_tn_cau += 1;
        row.m2_tn_diem = roundToTwoDecimals(row.m2_tn_diem + q.diem);
      } else {
        row.m2_tl_cau += 1;
        row.m2_tl_diem = roundToTwoDecimals(row.m2_tl_diem + q.diem);
      }
    } else {
      if (isTN) {
        row.m3_tn_cau += 1;
        row.m3_tn_diem = roundToTwoDecimals(row.m3_tn_diem + q.diem);
      } else {
        row.m3_tl_cau += 1;
        row.m3_tl_diem = roundToTwoDecimals(row.m3_tl_diem + q.diem);
      }
    }

    row.tongSoCau += 1;
    row.tongDiem = roundToTwoDecimals(row.tongDiem + q.diem);
    row.tyLePhanTram = roundToTwoDecimals(row.tongDiem * 10);
  });

  return buckets.filter((b) => b.tongSoCau > 0);
}

/**
 * Đồng bộ bảng Bản đặc tả (`specificationRows`) với Ma trận đề và danh sách câu hỏi
 */
function buildSynchronizedSpecificationRows(
  rawSpecRows: unknown,
  matrixRows: MatrixRow[],
  questions: AIExamQuestion[]
): SpecificationRow[] {
  const rawList = Array.isArray(rawSpecRows) ? rawSpecRows : [];

  return matrixRows.map((mRow, idx) => {
    const rawMatch: any =
      rawList[idx] ||
      rawList.find(
        (item: any) =>
          String(item?.machKienThuc || '').trim().toLowerCase() ===
          mRow.machKienThuc.toLowerCase()
      ) ||
      {};

    const assignedQuestions = questions.filter(
      (_, qIdx) => qIdx % matrixRows.length === idx
    );

    const rawDetails = Array.isArray(rawMatch.moTaChiTietTheoCau)
      ? rawMatch.moTaChiTietTheoCau.map((d: any) => String(d || '').trim()).filter(Boolean)
      : [];

    const moTaChiTietTheoCau =
      rawDetails.length > 0
        ? rawDetails
        : assignedQuestions.map(
            (q) =>
              `Câu ${q.soThuTu} (${q.mucDo} - ${q.hinhThuc} - ${q.diem} điểm): Đánh giá yêu cầu cần đạt thuộc mạch "${mRow.machKienThuc}".`
          );

    return {
      tt: idx + 1,
      machKienThuc: mRow.machKienThuc,
      donViKienThucYCCD:
        String(rawMatch.donViKienThucYCCD || '').trim() ||
        `Đạt chuẩn yêu cầu cần đạt mạch kiến thức "${mRow.machKienThuc}" theo CT GDPT 2018.`,
      soCauMuc1: mRow.m1_tn_cau + mRow.m1_tl_cau,
      soCauMuc2: mRow.m2_tn_cau + mRow.m2_tl_cau,
      soCauMuc3: mRow.m3_tn_cau + mRow.m3_tl_cau,
      moTaChiTietTheoCau,
    };
  });
}

function parseJsonResponseSafely(rawText: string): any {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    throw new Error('Máy chủ AI trả về dữ liệu rỗng.');
  }

  // Gỡ bỏ markdown codeblock nếu có
  const cleanedBlock = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleanedBlock);
  } catch {
    const firstBrace = cleanedBlock.indexOf('{');
    const lastBrace = cleanedBlock.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleanedBlock.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Không thể phân tích cấu trúc JSON từ phản hồi của AI.');
  }
}

/**
 * Chuẩn hóa toàn bộ gói Đề kiểm tra + Ma trận + Bản đặc tả trả về từ AI
 */
export function normalizeAIExamPackage(
  rawPackage: any,
  config: AIExamConfig
): GeneratedAIExamPackage {
  const allowedSubjects = SUBJECTS_BY_GRADE[config.khoiLop] || [];
  if (!allowedSubjects.includes(config.monHoc)) {
    throw new Error(
      `Môn "${config.monHoc}" không thuộc danh mục môn kiểm tra định kì chấm điểm của Khối ${config.khoiLop} theo Thông tư 27/2020/TT-BGDĐT.`
    );
  }

  const targetTN = Math.max(0, Math.round(Number(config.soCauTracNghiem) || 0));
  const targetTL = Math.max(0, Math.round(Number(config.soCauTuLuan) || 0));
  const totalTargetQuestions = Math.max(1, targetTN + targetTL);

  const rawQuestions: any[] = Array.isArray(rawPackage?.questions)
    ? rawPackage.questions
    : [];

  const rawTNList = rawQuestions.filter(
    (q) => String(q?.phan || '').toUpperCase() !== 'TU_LUAN' && String(q?.hinhThuc || '') !== 'Tự luận'
  );
  const rawTLList = rawQuestions.filter(
    (q) => String(q?.phan || '').toUpperCase() === 'TU_LUAN' || String(q?.hinhThuc || '') === 'Tự luận'
  );

  const allowedTypes: DangCauHoiTracNghiem[] =
    Array.isArray(config.dangCauHoiTracNghiem) && config.dangCauHoiTracNghiem.length > 0
      ? config.dangCauHoiTracNghiem
      : ['multiple_choice'];

  // Phân bổ mức độ nhận thức theo tỷ lệ cấu hình Mức 1 / Mức 2 / Mức 3
  const p1 = Math.max(0, Number(config.muc1_NhanBiet) || 40);
  const p2 = Math.max(0, Number(config.muc2_KetNoi) || 40);
  const p3 = Math.max(0, Number(config.muc3_VanDung) || 20);
  const pSum = p1 + p2 + p3 || 100;
  const countM1 = Math.round((p1 / pSum) * totalTargetQuestions);
  const countM2 = Math.round((p2 / pSum) * totalTargetQuestions);

  const defaultLevelForIndex = (idx: number): MucDoNhanThucTT27 => {
    if (idx < countM1) return 'Mức 1';
    if (idx < countM1 + countM2) return 'Mức 2';
    return 'Mức 3';
  };

  const normalizedQuestions: AIExamQuestion[] = [];

  // 1. Xây dựng đúng `targetTN` câu Trắc nghiệm
  for (let i = 0; i < targetTN; i++) {
    const rawQ = rawTNList[i] || rawQuestions[i] || {};
    const soThuTu = i + 1;
    const fallbackLevel = defaultLevelForIndex(i);
    const mucDo = normalizeMucDo(rawQ.mucDo, fallbackLevel);
    const hinhThuc = normalizeHinhThuc(rawQ.hinhThuc, 'TRAC_NGHIEM', allowedTypes);

    const rawContent = stripRedundantQuestionPrefix(
      String(rawQ.noiDungCauHoi || rawQ.content || rawQ.question || '')
    );
    const noiDungCauHoi =
      rawContent ||
      `Câu hỏi trắc nghiệm môn ${config.monHoc} lớp ${config.khoiLop} (${config.chuDeKienThuc || config.thoiDiemKiemTra}) số ${soThuTu}`;

    let luaChon: string[] | undefined = Array.isArray(rawQ.luaChon || rawQ.options)
      ? (rawQ.luaChon || rawQ.options).map((o: any) => String(o || '').trim()).filter(Boolean)
      : undefined;

    let cotA: string[] | undefined;
    let cotB: string[] | undefined;
    let dapAnChinhXac = String(rawQ.dapAnChinhXac || rawQ.correctAnswer || 'A').trim();

    if (hinhThuc === 'Nối') {
      const matchingFixed = ensureValidMatchingColumns(
        rawQ.cotA,
        rawQ.cotB,
        luaChon,
        dapAnChinhXac,
        config.monHoc
      );
      cotA = matchingFixed.cotA;
      cotB = matchingFixed.cotB;
      dapAnChinhXac = matchingFixed.dapAnChinhXac;
      luaChon = undefined;
    } else if (hinhThuc === 'Trắc nghiệm 4 lựa chọn') {
      if (!luaChon || luaChon.length < 4) {
        luaChon = [
          'A. Phương án trả lời A',
          'B. Phương án trả lời B',
          'C. Phương án trả lời C',
          'D. Phương án trả lời D',
        ];
      } else {
        luaChon = luaChon.slice(0, 4).map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx);
          return /^[A-D][\.\:\)]\s*/i.test(opt) ? opt : `${letter}. ${opt}`;
        });
      }
    }

    normalizedQuestions.push({
      soThuTu,
      phan: 'TRAC_NGHIEM',
      mucDo,
      hinhThuc,
      diem: Number(rawQ.diem) > 0 ? Number(rawQ.diem) : 0.5,
      noiDungCauHoi,
      luaChon,
      cotA,
      cotB,
      dapAnChinhXac,
      huongDanCham:
        String(rawQ.huongDanCham || '').trim() ||
        `Học sinh trả lời đúng đáp án (${dapAnChinhXac}) được trọn điểm câu ${soThuTu}.`,
    });
  }

  // 2. Xây dựng đúng `targetTL` câu Tự luận
  for (let j = 0; j < targetTL; j++) {
    const rawQ = rawTLList[j] || rawQuestions[targetTN + j] || {};
    const soThuTu = targetTN + j + 1;
    const fallbackLevel = defaultLevelForIndex(targetTN + j);
    const mucDo = normalizeMucDo(rawQ.mucDo, fallbackLevel);

    const rawContent = stripRedundantQuestionPrefix(
      String(rawQ.noiDungCauHoi || rawQ.content || rawQ.question || '')
    );
    const noiDungCauHoi =
      rawContent ||
      `Bài tập tự luận vận dụng môn ${config.monHoc} lớp ${config.khoiLop} (${config.chuDeKienThuc || config.thoiDiemKiemTra}) số ${j + 1}`;

    const dapAnChinhXac =
      String(rawQ.dapAnChinhXac || rawQ.correctAnswer || '').trim() ||
      'Lời giải chi tiết theo yêu cầu cần đạt của bài học.';

    normalizedQuestions.push({
      soThuTu,
      phan: 'TU_LUAN',
      mucDo,
      hinhThuc: 'Tự luận',
      diem: Number(rawQ.diem) > 0 ? Number(rawQ.diem) : 1.5,
      noiDungCauHoi,
      dapAnChinhXac,
      huongDanCham:
        String(rawQ.huongDanCham || '').trim() ||
        'Chấm điểm theo từng bước lập luận và kết quả đúng của học sinh.',
    });
  }

  // 3. Cân bằng tổng điểm câu hỏi về đúng 10.0 điểm
  const balancedQuestions = normalizeQuestionScoresToTen(normalizedQuestions);

  // 4. Đồng bộ bảng Ma trận & Bản đặc tả khớp tuyệt đối với danh sách câu hỏi (10.0 điểm, đủ số câu)
  const synchronizedMatrixRows = buildSynchronizedMatrixRows(
    rawPackage?.matrixRows,
    balancedQuestions,
    config.chuDeKienThuc || `Kiến thức ${config.monHoc} lớp ${config.khoiLop} - ${config.thoiDiemKiemTra}`
  );

  const synchronizedSpecRows = buildSynchronizedSpecificationRows(
    rawPackage?.specificationRows,
    synchronizedMatrixRows,
    balancedQuestions
  );

  return {
    config,
    matrixRows: synchronizedMatrixRows,
    specificationRows: synchronizedSpecRows,
    questions: balancedQuestions,
  };
}

/**
 * Tạo trọn gói Ma trận + Bản đặc tả + Đề kiểm tra chuẩn Thông tư 27/2020/TT-BGDĐT bằng Gemini AI
 */
export async function generateAIExamPackage(
  config: AIExamConfig
): Promise<GeneratedAIExamPackage> {
  const allowedSubjects = SUBJECTS_BY_GRADE[config.khoiLop] || [];
  if (!allowedSubjects.includes(config.monHoc)) {
    throw new Error(
      `Môn "${config.monHoc}" không áp dụng bài kiểm tra định kì chấm điểm ở Khối ${config.khoiLop} theo Thông tư 27/2020/TT-BGDĐT.`
    );
  }

  const totalQuestions = config.soCauTracNghiem + config.soCauTuLuan;
  const requestedFormats = (config.dangCauHoiTracNghiem || ['multiple_choice'])
    .map((t) => QUESTION_TYPE_LABEL_MAP[t])
    .join(', ');

  const systemInstruction = `Bạn là Chuyên gia khảo thí và thẩm định đề kiểm tra cấp Tiểu học của Bộ Giáo dục và Đào tạo Việt Nam.
Nhiệm vụ của bạn là biên soạn trọn bộ hồ sơ Đề kiểm tra định kì chấm điểm (thang điểm 10,0) theo đúng Chương trình GDPT 2018 và Thông tư 27/2020/TT-BGDĐT (3 mức độ nhận thức: Mức 1 - Nhận biết, Mức 2 - Kết nối/Thông hiểu, Mức 3 - Vận dụng).
BẮT BUỘC trả về DUY NHẤT một đối tượng JSON hợp lệ gồm 3 trường: "matrixRows", "specificationRows", "questions" đồng bộ 100% với nhau.`;

  const prompt = `Hãy thiết kế trọn bộ Ma trận đề, Bản đặc tả và Đề kiểm tra định kì có đáp án - hướng dẫn chấm với các thông số sau:
- Khối lớp: Khối ${config.khoiLop}
- Môn học chấm điểm: ${config.monHoc}
- Thời điểm kiểm tra: ${config.thoiDiemKiemTra}
- Thời gian làm bài: ${config.thoiGianLamBai} phút
- Bộ sách giáo khoa: ${config.boSachGiaoKhoa}
- Cấu trúc số câu hỏi: Tổng ${totalQuestions} câu (gồm đúng ${config.soCauTracNghiem} câu Trắc nghiệm và ${config.soCauTuLuan} câu Tự luận)
- Các dạng câu hỏi trắc nghiệm cần sử dụng: ${requestedFormats}
- Tỷ lệ ma trận nhận thức Thông tư 27: Mức 1 (Nhận biết) = ${config.muc1_NhanBiet}%, Mức 2 (Kết nối) = ${config.muc2_KetNoi}%, Mức 3 (Vận dụng) = ${config.muc3_VanDung}%
- Chủ đề / Mạch kiến thức trọng tâm: ${config.chuDeKienThuc || `Theo phân phối chương trình môn ${config.monHoc} lớp ${config.khoiLop} - ${config.thoiDiemKiemTra}`}
- Ghi chú bổ sung của giáo viên: ${config.ghiChuThem || 'Không có'}

YÊU CẦU KỸ THUẬT BẮT BUỘC:
1. Tổng điểm toàn bài BẮT BUỘC bằng đúng 10.0 điểm. Điểm mỗi câu là bội số của 0.25 hoặc 0.5.
2. Mảng "questions" phải có đúng ${totalQuestions} phần tử (${config.soCauTracNghiem} câu đầu có "phan": "TRAC_NGHIEM", ${config.soCauTuLuan} câu tiếp theo có "phan": "TU_LUAN").
3. Trường "noiDungCauHoi" chỉ chứa nội dung câu hỏi sạch, TUYỆT ĐỐI KHÔNG lặp lại các tiền tố như "I. PHẦN TRẮC NGHIỆM - Câu 1:" hay "Câu 1:".
4. Nếu câu hỏi có "hinhThuc": "Nối", BẮT BUỘC phải cung cấp đầy đủ cả mảng "cotA" (VD: ["1. ...", "2. ...", "3. ..."]) và mảng "cotB" (VD: ["a. ...", "b. ...", "c. ..."]) có số phần tử tương ứng nhau, tuyệt đối không để trống "cotB".
5. Cấu trúc JSON trả về phải tuân thủ chính xác mẫu sau:
{
  "matrixRows": [
    {
      "tt": 1,
      "machKienThuc": "Tên mạch kiến thức",
      "m1_tn_cau": 2, "m1_tn_diem": 1.0, "m1_tl_cau": 0, "m1_tl_diem": 0,
      "m2_tn_cau": 2, "m2_tn_diem": 1.0, "m2_tl_cau": 1, "m2_tl_diem": 1.0,
      "m3_tn_cau": 0, "m3_tn_diem": 0, "m3_tl_cau": 1, "m3_tl_diem": 1.0,
      "tongSoCau": 6, "tongDiem": 4.0, "tyLePhanTram": 40
    }
  ],
  "specificationRows": [
    {
      "tt": 1,
      "machKienThuc": "Tên mạch kiến thức",
      "donViKienThucYCCD": "Mô tả yêu cầu cần đạt theo CT GDPT 2018",
      "soCauMuc1": 2,
      "soCauMuc2": 3,
      "soCauMuc3": 1,
      "moTaChiTietTheoCau": ["Câu 1 (Mức 1): ...", "Câu 2 (Mức 1): ..."]
    }
  ],
  "questions": [
    {
      "soThuTu": 1,
      "phan": "TRAC_NGHIEM",
      "mucDo": "Mức 1",
      "hinhThuc": "Trắc nghiệm 4 lựa chọn",
      "diem": 0.5,
      "noiDungCauHoi": "Nội dung câu hỏi (không ghi tiền tố Câu 1:)",
      "luaChon": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "cotA": [],
      "cotB": [],
      "dapAnChinhXac": "A",
      "huongDanCham": "Khoanh đúng đáp án A được 0,5 điểm."
    }
  ]
}`;

  const rawResponseText = await callGeminiApi(prompt, systemInstruction, true, 1);
  const parsed = parseJsonResponseSafely(rawResponseText);
  return normalizeAIExamPackage(parsed, config);
}
