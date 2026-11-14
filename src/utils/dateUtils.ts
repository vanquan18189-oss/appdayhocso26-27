/**
 * Standardized Date/Time utilities for Vietnam timezone (UTC+7, Asia/Ho_Chi_Minh)
 * Display standard: DD/MM/YYYY HH:mm (24h)
 * Storage standard: ISO 8601 UTC string
 */

export interface VNDateComponents {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
}

export function getVNDateComponents(date: Date = new Date()): VNDateComponents {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(date);

    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') {
        map[p.type] = parseInt(p.value, 10);
      }
    }

    return {
      year: map.year || date.getFullYear(),
      month: map.month || date.getMonth() + 1,
      day: map.day || date.getDate(),
      hour: (map.hour === 24 ? 0 : map.hour) ?? date.getHours(),
      minute: map.minute ?? date.getMinutes(),
      second: map.second ?? date.getSeconds()
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds()
    };
  }
}

export function createDateFromVNComponents(
  year: number,
  month1To12: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date | null {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month1To12) ||
    !Number.isFinite(day) ||
    month1To12 < 1 ||
    month1To12 > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  // Construct UTC timestamp representing Asia/Ho_Chi_Minh (UTC+7)
  const utcMs = Date.UTC(year, month1To12 - 1, day, hour - 7, minute, second);
  const d = new Date(utcMs);
  if (isNaN(d.getTime())) return null;

  // Verify no calendar overflow (e.g. Feb 30 -> Mar 2)
  const verify = getVNDateComponents(d);
  if (verify.year !== year || verify.month !== month1To12 || verify.day !== day) {
    return null;
  }
  return d;
}

export function parseDateTimeVN(input: any): Date | null {
  if (!input) return null;

  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof input === 'object') {
    if (typeof input.toDate === 'function') {
      try {
        const d = input.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof input.seconds === 'number') {
      const d = new Date(input.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const str = String(input).trim();
  if (!str || str.toLowerCase() === 'vô thời hạn') return null;

  // DD/MM/YYYY[ HH:mm[:ss]]
  const vnMatch = str.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (vnMatch) {
    const day = parseInt(vnMatch[1], 10);
    const month = parseInt(vnMatch[2], 10);
    const year = parseInt(vnMatch[3], 10);
    const hour = vnMatch[4] !== undefined ? parseInt(vnMatch[4], 10) : 0;
    const minute = vnMatch[5] !== undefined ? parseInt(vnMatch[5], 10) : 0;
    const second = vnMatch[6] !== undefined ? parseInt(vnMatch[6], 10) : 0;
    return createDateFromVNComponents(year, month, day, hour, minute, second);
  }

  // HH:mm DD/MM/YYYY
  const timeFirstMatch = str.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (timeFirstMatch) {
    const hour = parseInt(timeFirstMatch[1], 10);
    const minute = parseInt(timeFirstMatch[2], 10);
    const day = parseInt(timeFirstMatch[3], 10);
    const month = parseInt(timeFirstMatch[4], 10);
    const year = parseInt(timeFirstMatch[5], 10);
    return createDateFromVNComponents(year, month, day, hour, minute, 0);
  }

  // ISO or standard YYYY-MM-DD
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTimeVN(input: any, fallback = ''): string {
  if (!input) return fallback;
  if (typeof input === 'string' && input.trim().toLowerCase() === 'vô thời hạn') {
    return 'Vô thời hạn';
  }
  const d = parseDateTimeVN(input);
  if (!d) return fallback || String(input);

  const comp = getVNDateComponents(d);
  const dd = String(comp.day).padStart(2, '0');
  const mm = String(comp.month).padStart(2, '0');
  const yyyy = String(comp.year);
  const hh = String(comp.hour).padStart(2, '0');
  const min = String(comp.minute).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function toISOStringUTC(input: any): string {
  if (!input) return '';
  if (typeof input === 'string' && input.trim().toLowerCase() === 'vô thời hạn') {
    return 'Vô thời hạn';
  }
  const d = parseDateTimeVN(input);
  if (!d) return typeof input === 'string' ? input : '';
  return d.toISOString();
}

export function getCurrentDateTimeVNDisplay(
  addDays = 0,
  overrideHour?: number,
  overrideMinute?: number
): string {
  const now = new Date();
  const target = new Date(now.getTime() + addDays * 24 * 60 * 60 * 1000);
  const comp = getVNDateComponents(target);
  const hh = overrideHour !== undefined ? overrideHour : comp.hour;
  const min = overrideMinute !== undefined ? overrideMinute : comp.minute;
  return `${String(comp.day).padStart(2, '0')}/${String(comp.month).padStart(2, '0')}/${comp.year} ${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function validateStrictDateTimeInputVN(raw: string): {
  valid: boolean;
  error?: string;
  date?: Date;
  display?: string;
} {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Vui lòng nhập ngày giờ theo định dạng DD/MM/YYYY HH:mm (24 giờ).' };
  }

  if (trimmed.toLowerCase() === 'vô thời hạn') {
    return { valid: true, display: 'Vô thời hạn' };
  }

  const strictMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (strictMatch) {
    const d = parseInt(strictMatch[1], 10);
    const m = parseInt(strictMatch[2], 10);
    const y = parseInt(strictMatch[3], 10);
    const h = parseInt(strictMatch[4], 10);
    const min = parseInt(strictMatch[5], 10);
    const dateObj = createDateFromVNComponents(y, m, d, h, min, 0);
    if (!dateObj) {
      return { valid: false, error: 'Ngày hoặc giờ không hợp lệ (kiểm tra lại ngày/tháng và giờ 00-23).' };
    }
    return { valid: true, date: dateObj, display: formatDateTimeVN(dateObj) };
  }

  const parsed = parseDateTimeVN(trimmed);
  if (!parsed) {
    return {
      valid: false,
      error: 'Định dạng chưa đúng. Vui lòng nhập DD/MM/YYYY HH:mm (VD: 25/10/2026 08:30).'
    };
  }
  return { valid: true, date: parsed, display: formatDateTimeVN(parsed) };
}

export function validateScheduleAndDeadline(opts: {
  scheduleTime?: string;
  openTime?: string;
  deadlineTime?: string;
  isUnlimited?: boolean;
}): { valid: boolean; error?: string } {
  if (opts.isUnlimited) return { valid: true };

  const openDate = parseDateTimeVN(opts.openTime);
  const deadlineDate = parseDateTimeVN(opts.deadlineTime);

  if (openDate && deadlineDate && deadlineDate.getTime() <= openDate.getTime()) {
    return {
      valid: false,
      error: 'Thời điểm kết thúc / hạn nộp phải sau thời điểm mở bài.'
    };
  }

  const scheduleDate = parseDateTimeVN(opts.scheduleTime);
  if (scheduleDate && deadlineDate && deadlineDate.getTime() <= scheduleDate.getTime()) {
    return {
      valid: false,
      error: 'Thời điểm kết thúc / hạn nộp phải sau thời điểm hẹn giờ.'
    };
  }

  return { valid: true };
}

export function toDateTimeLocalValue(input: any): string {
  const d = parseDateTimeVN(input);
  if (!d) return '';
  const comp = getVNDateComponents(d);
  return `${comp.year}-${String(comp.month).padStart(2, '0')}-${String(comp.day).padStart(2, '0')}T${String(comp.hour).padStart(2, '0')}:${String(comp.minute).padStart(2, '0')}`;
}
