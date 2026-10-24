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

/**
 * Chuẩn hóa mã học sinh: cắt khoảng trắng, viết hoa toàn bộ.
 */
export function normalizeStudentCode(code?: string): string {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Kiểm tra mã học sinh có hợp lệ theo định dạng chuẩn hay không.
 * Định dạng mẫu: ^[A-Z0-9]+\d{2}-\d{2}-\d+$ (Ví dụ: 5D26-27-1, 3C26-27-12)
 */
export function isValidStudentCode(code?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const normalized = normalizeStudentCode(code);
  const regex = /^[A-Z0-9]+\d{2}-\d{2}-\d+$/;
  return regex.test(normalized);
}

/**
 * Tạo mã học sinh mới dựa trên lớp, năm học và số thứ tự lớn nhất hiện có + 1.
 * Đảm bảo không dùng lại số cũ.
 */
export function generateStudentCode(className: string, academicYear: string = '2026-2027', existingStts: number[] = []): { code: string; stt: number } {
  // 1. Chuẩn hóa tên lớp (ví dụ "Lớp 5D" -> "5D", "5d" -> "5D")
  const cleanClass = className.replace(/^Lớp\s*/i, '').trim().toUpperCase();

  // 2. Chuẩn hóa năm học (ví dụ "2026-2027" -> "26-27")
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

  // 3. Tính số thứ tự tiếp theo (lớn nhất + 1, tránh trùng lặp)
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

  // Ví dụ: 5D26-27-1 -> className: 5D, academicYear: 26-27, stt: 1
  const match = normalized.match(/^([A-Z0-9]+)(\d{2}-\d{2})-(\d+)$/);
  if (!match) return null;

  return {
    className: match[1],
    academicYear: match[2],
    stt: parseInt(match[3], 10),
    raw: normalized
  };
}

/**
 * Chuẩn hóa mọi biến thể của Mã học sinh về dạng chuẩn duy nhất Lớp-NămHọc-STT (ví dụ: 3C26-27-1, 5D26-27-12)
 */
export function formatStandardStudentCode(rawCode?: string, defaultClass: string = '3C', stt?: number): string {
  if (!rawCode && !stt) {
    const cleanCls = (defaultClass || '3C').replace(/^Lớp\s*/i, '').trim().toUpperCase();
    return `${cleanCls}26-27-1`;
  }
  const clean = (rawCode || '').trim().toUpperCase();
  if (/^[A-Z0-9]+\d{2}-\d{2}-\d+$/.test(clean)) {
    return clean;
  }
  // Nếu là dạng 3C1, 3c1, st-3c-1, hs-3c-1, 3c-1
  const legacyMatch = clean.match(/^(?:ST-|HS-)?([0-9][A-Z0-9]*)[-_]?(\d+)$/i);
  if (legacyMatch) {
    const cls = legacyMatch[1].toUpperCase();
    const num = parseInt(legacyMatch[2], 10);
    return `${cls}26-27-${num}`;
  }
  if (stt && typeof stt === 'number') {
    const cls = (defaultClass || '3C').replace(/^Lớp\s*/i, '').trim().toUpperCase();
    return `${cls}26-27-${stt}`;
  }
  return clean || `${(defaultClass || '3C').replace(/^Lớp\s*/i, '').trim().toUpperCase()}26-27-1`;
}

