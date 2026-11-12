/**
 * Tiện ích quản lý và chuẩn hóa Mã học sinh duy nhất theo định dạng chuẩn: Lớp-NămHọc-STT (Ví dụ: 5D26-27-1)
 * Quy tắc: Khóa duy nhất của học sinh là Mã HS dạng 5D26-27-1 (lớp, năm học, số thứ tự). 
 * Không dùng sddcn, studentId cũ, tên hay mã khác.
 */

export interface ParsedStudentCode {
  className: string;      // e.g. "5D"
  academicYear: string;   // e.g. "2026-2027" (represented as "26-27")
  stt: number;            // e.g. 1
  raw: string;            // normalized raw string
}

export const UNKNOWN_STUDENT_CODE = '';

export type StudentIdentityInput =
  | string
  | null
  | undefined
  | {
      code?: string;
      studentCode?: string;
      maHs?: string;
      studentId?: string;
      id?: string;
      docId?: string;
      studentClass?: string;
      className?: string;
      class?: string;
      targetClass?: string;
      [key: string]: any;
    };

/**
 * Chuẩn hóa mã học sinh: chỉ bỏ khoảng trắng đầu cuối và đổi sang chữ HOA thống nhất.
 * Ví dụ: " 5c26-27-79 " -> "5C26-27-79"
 */
export function normalizeStudentCode(code?: string): string {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Chuẩn hóa tên lớp để đối chiếu nhất quán với tiền tố lớp trong mã học sinh.
 * Ví dụ: "Lớp 5C" -> "5C", "5c" -> "5C"
 */
export function normalizeStudentClass(rawClass?: string): string {
  if (!rawClass || typeof rawClass !== 'string') return '';
  let clean = rawClass.trim();
  while (/^(lớp|lop)\s+/i.test(clean)) {
    clean = clean.replace(/^(lớp|lop)\s+/i, '').trim();
  }
  if (/^(khối|khoi)\s+/i.test(clean)) {
    return '';
  }
  return clean.toUpperCase();
}

/**
 * Chuẩn hóa chuỗi họ tên phục vụ hiển thị/sắp xếp (TUYỆT ĐỐI KHÔNG dùng để so khớp/nhận diện học sinh).
 */
export function normalizeStudentName(name?: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kiểm tra mã học sinh có hợp lệ theo định dạng chuẩn đầy đủ có tiền tố lớp hay không.
 * Định dạng mẫu: ^[A-Z0-9]+\d{2}-\d{2}-\d+$ (Ví dụ: 5D26-27-79, 5C26-27-79, 3C26-27-12)
 */
export function isValidStudentCode(code?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const normalized = normalizeStudentCode(code);
  // Phải bắt đầu bằng chữ số khối + chữ cái lớp (ví dụ 5C, 5D, 3C) rồi đến năm học 26-27 và STT
  const regex = /^[1-9][A-Z][A-Z0-9]*\d{2}-\d{2}-\d+$/;
  return regex.test(normalized);
}

/**
 * Tạo mã học sinh mới dựa trên lớp, năm học và số thứ tự lớn nhất hiện có + 1.
 * Đảm bảo không dùng lại số cũ.
 */
export function generateStudentCode(className: string, academicYear: string = '2026-2027', existingStts: number[] = []): { code: string; stt: number } {
  const cleanClass = normalizeStudentClass(className) || className.replace(/^Lớp\s*/i, '').trim().toUpperCase();

  let yearCode = '26-27';
  if (academicYear.includes('2026')) {
    yearCode = '26-27';
  } else if (academicYear.includes('-')) {
    const parts = academicYear.split('-');
    if (parts.length === 2) {
      const y1 = parts[0].trim().slice(-2);
      const y2 = parts[1].trim().slice(-2);
      yearCode = `${y1}-${y2}`;
    }
  }

  let nextStt = 1;
  if (Array.isArray(existingStts) && existingStts.length > 0) {
    const validNums = existingStts.filter(n => typeof n === 'number' && !isNaN(n));
    if (validNums.length > 0) {
      const maxStt = Math.max(...validNums);
      nextStt = maxStt >= 1 ? maxStt + 1 : 1;
    }
  }

  const code = `${cleanClass}${yearCode}-${nextStt}`;
  return { code, stt: nextStt };
}

/**
 * Đọc và tách mã học sinh thành các thành phần: lớp, năm học, số thứ tự.
 */
export function parseStudentCode(code?: string): ParsedStudentCode | null {
  if (!isValidStudentCode(code)) return null;
  const normalized = normalizeStudentCode(code);

  const match = normalized.match(/^([1-9][A-Z][A-Z0-9]*)(\d{2}-\d{2})-(\d+)$/);
  if (!match) return null;

  return {
    className: match[1],
    academicYear: match[2],
    stt: parseInt(match[3], 10),
    raw: normalized
  };
}

/**
 * Kiểm tra và trả về Mã học sinh chuẩn đầy đủ (ví dụ: 5C26-27-79).
 * Quy tắc:
 * - KHÔNG dùng Regex lấy số cuối rồi ghép vào tiền tố lớp.
 * - Nếu chuỗi đầu vào đã là mã đầy đủ hợp lệ thì giữ nguyên (sau khi trim & viết hoa).
 * - Nếu chỉ là mã ngắn hoặc thiếu tiền tố lớp thì KHÔNG tự suy ra lớp, trả về '' (không xác định) để nơi gọi xử lý an toàn.
 */
export function formatStandardStudentCode(rawCode?: string, _defaultClass?: string, _stt?: number): string {
  if (!rawCode || typeof rawCode !== 'string') {
    return UNKNOWN_STUDENT_CODE;
  }
  const clean = normalizeStudentCode(rawCode);
  if (isValidStudentCode(clean)) {
    return clean;
  }
  return UNKNOWN_STUDENT_CODE;
}

/**
 * Trích xuất mã học sinh đầy đủ hợp lệ từ chuỗi hoặc đối tượng bản ghi.
 * Nếu bản ghi có nhiều trường mã nhưng mâu thuẫn nhau hoặc chỉ có mã ngắn, trả về ''.
 */
export function extractFullStudentCode(input: StudentIdentityInput): string {
  if (!input) return UNKNOWN_STUDENT_CODE;

  if (typeof input === 'string') {
    const norm = normalizeStudentCode(input);
    if (isValidStudentCode(norm)) return norm;
    // Hỗ trợ tách mã đầy đủ từ khóa tài liệu dạng "{FULL_CODE}_{EXAM_ID}_{ATTEMPT}"
    if (norm.includes('_')) {
      const firstPart = norm.split('_')[0];
      if (firstPart && isValidStudentCode(firstPart)) {
        return firstPart;
      }
    }
    return UNKNOWN_STUDENT_CODE;
  }

  if (typeof input === 'object') {
    const primaryFields = [
      input.studentCode,
      input.code,
      input.maHs,
      input.studentId
    ];

    const validPrimaryCodes = new Set<string>();
    for (const val of primaryFields) {
      if (typeof val === 'string' && val.trim()) {
        const norm = normalizeStudentCode(val);
        if (isValidStudentCode(norm)) {
          validPrimaryCodes.add(norm);
        }
      }
    }

    // Nếu trong cùng bản ghi có 2 mã đầy đủ khác nhau -> mâu thuẫn, từ chối khớp
    if (validPrimaryCodes.size > 1) {
      return UNKNOWN_STUDENT_CODE;
    }

    if (validPrimaryCodes.size === 1) {
      return Array.from(validPrimaryCodes)[0];
    }

    // Kiểm tra docId / id nếu là khóa tài liệu dạng "{FULL_CODE}_{EXAM_ID}"
    const docIds = [input.docId, input.id];
    for (const dId of docIds) {
      if (typeof dId === 'string' && dId.trim()) {
        const norm = normalizeStudentCode(dId);
        if (isValidStudentCode(norm)) return norm;
        if (norm.includes('_')) {
          const firstPart = norm.split('_')[0];
          if (firstPart && isValidStudentCode(firstPart)) {
            return firstPart;
          }
        }
      }
    }
  }

  return UNKNOWN_STUDENT_CODE;
}

/**
 * Trích xuất tên lớp chuẩn hóa từ đối tượng học sinh / bài nộp (nếu có).
 */
export function extractRecordClass(input: StudentIdentityInput): string {
  if (!input || typeof input !== 'object') return '';
  const rawCls = input.studentClass || input.className || input.class || '';
  return normalizeStudentClass(rawCls);
}

/**
 * HÀM SO KHỚP HỌC SINH DUY NHẤT DÙNG CHUNG TOÀN HỆ THỐNG:
 * - Chuẩn hóa chỉ gồm: bỏ khoảng trắng đầu cuối và đổi chữ HOA thống nhất.
 * - So khớp CHÍNH XÁC toàn bộ chuỗi mã đầy đủ có tiền tố lớp (ví dụ: 5C26-27-79).
 * - TUYỆT ĐỐI KHÔNG dùng họ tên và KHÔNG dùng số cuối mã.
 * - Nếu bản ghi có trường lớp (studentClass / className) thì lớp phải trùng khớp với tiền tố mã và trùng nhau.
 *   Nếu mã và lớp mâu thuẫn nhau thì coi là KHÔNG khớp.
 */
export function isSameStudent(
  a: StudentIdentityInput,
  b: StudentIdentityInput,
  expectedClass?: string
): boolean {
  const codeA = extractFullStudentCode(a);
  const codeB = extractFullStudentCode(b);

  if (!codeA || !codeB || codeA !== codeB) {
    return false;
  }

  const parsed = parseStudentCode(codeA);
  if (!parsed) {
    return false;
  }

  const codeClassPrefix = parsed.className; // Ví dụ: "5C"

  const classA = extractRecordClass(a);
  if (classA && classA !== codeClassPrefix) {
    return false; // Mã và lớp của bản ghi A mâu thuẫn nhau
  }

  const classB = extractRecordClass(b);
  if (classB && classB !== codeClassPrefix) {
    return false; // Mã và lớp của bản ghi B mâu thuẫn nhau
  }

  if (classA && classB && classA !== classB) {
    return false;
  }

  if (expectedClass) {
    const normExpected = normalizeStudentClass(expectedClass);
    if (normExpected && normExpected !== codeClassPrefix) {
      return false;
    }
  }

  return true;
}

/**
 * Phân định loại bản ghi kết quả bài làm: 'exam' (Bài kiểm tra) hoặc 'assignment' (Bài tập rèn luyện)
 */
export function getRecordType(sub: any): 'exam' | 'assignment' {
  try {
    if (sub?.recordType === 'exam' || sub?.recordType === 'assignment') {
      return sub.recordType;
    }
    if (sub?.examId) {
      return 'exam';
    }
    if (sub?.assignmentId) {
      return 'assignment';
    }
    if (sub?.exam || sub?.type === 'exam' || sub?.submissionType === 'exam') {
      return 'exam';
    }
    return 'assignment';
  } catch {
    return 'assignment';
  }
}




