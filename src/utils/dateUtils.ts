/**
 * Unified Date & Time Utility for the entire application.
 *
 * SINGLE CONVENTION:
 * - Storage (Firestore): ISO 8601 UTC string (e.g. "2026-12-13T00:55:00.000Z") or Firestore Timestamp.
 *   Never store raw display strings like "13/12/2026 07:55" or "11/12/2026 07:55 AM".
 * - Display (UI / Exports): Always "DD/MM/YYYY HH:mm" (24-hour clock, Asia/Ho_Chi_Minh UTC+7),
 *   never AM/PM, never browser-dependent toLocaleString().
 * - Input (DateTimePicker): Controlled "DD/MM/YYYY HH:mm" (24h) + native datetime-local picker,
 *   with strict calendar validation (month 1..12, valid day for month/leap year, hour 0..23, minute 0..59).
 */

export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

/**
 * Returns the number of days in a given month (1-indexed: 1 = Jan .. 12 = Dec).
 */
export function getDaysInMonth(year: number, month1To12: number): number {
  if (month1To12 < 1 || month1To12 > 12) return 0;
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/**
 * Checks whether (year, month 1..12, day 1..31, hour 0..23, minute 0..59) is a strictly valid calendar date/time.
 * Prevents JavaScript Date overflow (e.g., month 13 overflowing into January of the following year).
 */
export function isValidCalendarDateTime(
  year: number,
  month1To12: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): boolean {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return false;
  if (!Number.isInteger(month1To12) || month1To12 < 1 || month1To12 > 12) return false;
  const maxDay = getDaysInMonth(year, month1To12);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) return false;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return false;
  if (!Number.isInteger(second) || second < 0 || second > 59) return false;
  return true;
}

/**
 * Creates a UTC Date object from Vietnam local time components (Asia/Ho_Chi_Minh, UTC+7).
 */
export function createDateFromVNComponents(
  year: number,
  month1To12: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date | null {
  if (!isValidCalendarDateTime(year, month1To12, day, hour, minute, second)) {
    return null;
  }
  const utcMs = Date.UTC(year, month1To12 - 1, day, hour, minute, second) - VN_OFFSET_MS;
  return new Date(utcMs);
}

/**
 * Extracts Vietnam local time components (year, month 1..12, day, hour 0..23, minute 0..59, second 0..59)
 * from any valid Date object, independent of the user's browser timezone setting.
 */
export function getVNDateComponents(date: Date): {
  year: number;
  month: number; // 1..12
  day: number;   // 1..31
  hour: number;  // 0..23
  minute: number;// 0..59
  second: number;// 0..59
} {
  const vnTime = new Date(date.getTime() + VN_OFFSET_MS);
  return {
    year: vnTime.getUTCFullYear(),
    month: vnTime.getUTCMonth() + 1,
    day: vnTime.getUTCDate(),
    hour: vnTime.getUTCHours(),
    minute: vnTime.getUTCMinutes(),
    second: vnTime.getUTCSeconds()
  };
}

/**
 * Safely parses any stored or legacy date/time value into a JavaScript Date:
 * - Date object
 * - Firestore Timestamp (with .toDate() or { seconds, nanoseconds } or { _seconds, _nanoseconds })
 * - Epoch milliseconds (number)
 * - Canonical ISO 8601 UTC string ("2026-12-13T00:55:00.000Z")
 * - Local ISO 8601 string ("2026-11-06T23:59") -> interpreted in Asia/Ho_Chi_Minh (UTC+7)
 * - Vietnamese "DD/MM/YYYY HH:mm" or "DD/MM/YYYY" (24-hour)
 * - Legacy US "MM/DD/YYYY hh:mm AM/PM" (from old DateTimePicker)
 * - Legacy "HH:mm:ss DD/MM/YYYY"
 *
 * Guarantees that month overflow (e.g. "13/12/2026" -> month 13 -> Jan 2027) NEVER happens.
 */
export function parseDateTimeVN(input?: any): Date | null {
  if (input === null || input === undefined || input === '') return null;

  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    // Handle seconds vs milliseconds
    const ms = input < 1e11 ? input * 1000 : input;
    const d = new Date(ms);
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
    const secs = input.seconds ?? input._seconds;
    if (typeof secs === 'number') {
      const nanos = input.nanoseconds ?? input._nanoseconds ?? 0;
      return new Date(secs * 1000 + Math.floor(nanos / 1e6));
    }
    return null;
  }

  if (typeof input !== 'string') return null;

  const str = input.trim();
  if (!str || str === '--' || str === '-' || str.toLowerCase() === 'vô thời hạn') {
    return null;
  }

  // 1. Canonical ISO 8601 with explicit timezone (Z or +/-HH:mm)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. Local ISO 8601 without timezone: "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD HH:mm[:ss]" or "YYYY-MM-DD"
  const localIsoMatch = str.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (localIsoMatch) {
    const y = parseInt(localIsoMatch[1], 10);
    const m = parseInt(localIsoMatch[2], 10);
    const d = parseInt(localIsoMatch[3], 10);
    const h = localIsoMatch[4] !== undefined ? parseInt(localIsoMatch[4], 10) : 0;
    const min = localIsoMatch[5] !== undefined ? parseInt(localIsoMatch[5], 10) : 0;
    const sec = localIsoMatch[6] !== undefined ? parseInt(localIsoMatch[6], 10) : 0;
    return createDateFromVNComponents(y, m, d, h, min, sec);
  }

  // 3. Time-first format: "HH:mm[:ss] DD/MM/YYYY"
  const timeFirstMatch = str.match(
    /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
  );
  if (timeFirstMatch) {
    const h = parseInt(timeFirstMatch[1], 10);
    const min = parseInt(timeFirstMatch[2], 10);
    const sec = timeFirstMatch[3] ? parseInt(timeFirstMatch[3], 10) : 0;
    const d = parseInt(timeFirstMatch[4], 10);
    const m = parseInt(timeFirstMatch[5], 10);
    const y = parseInt(timeFirstMatch[6], 10);
    return createDateFromVNComponents(y, m, d, h, min, sec);
  }

  // 4. Slash or dash date format: "P1/P2/YYYY [HH:mm[:ss] [AM|PM|SA|CH]]"
  const slashMatch = str.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\s,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|SA|CH)?)?$/i
  );
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const y = parseInt(slashMatch[3], 10);
    let h = slashMatch[4] !== undefined ? parseInt(slashMatch[4], 10) : 0;
    const min = slashMatch[5] !== undefined ? parseInt(slashMatch[5], 10) : 0;
    const sec = slashMatch[6] !== undefined ? parseInt(slashMatch[6], 10) : 0;
    const periodRaw = slashMatch[7] ? slashMatch[7].toUpperCase() : null;

    if (periodRaw) {
      const isPM = periodRaw === 'PM' || periodRaw === 'CH';
      const isAM = periodRaw === 'AM' || periodRaw === 'SA';
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
    }

    let day: number;
    let month: number;

    if (p1 > 12 && p2 <= 12) {
      // Unambiguously DD/MM/YYYY (e.g. 13/12/2026)
      day = p1;
      month = p2;
    } else if (p2 > 12 && p1 <= 12) {
      // Unambiguously legacy US MM/DD/YYYY (e.g. 11/19/2026 or 10/30/2026 11:59 PM)
      month = p1;
      day = p2;
    } else if (periodRaw === 'AM' || periodRaw === 'PM') {
      // Both p1 <= 12 and p2 <= 12, WITH English AM/PM suffix:
      // Only the legacy US formatter (MM/DD/YYYY hh:mm AM/PM) produced AM/PM strings (e.g. "11/12/2026 07:55 AM").
      month = p1;
      day = p2;
    } else {
      // Standard Vietnamese DD/MM/YYYY HH:mm (24h)
      day = p1;
      month = p2;
    }

    return createDateFromVNComponents(y, month, day, h, min, sec);
  }

  return null;
}

/**
 * Formats any date/time value into standard Vietnamese 24-hour format: "DD/MM/YYYY HH:mm"
 * in timezone Asia/Ho_Chi_Minh (UTC+7).
 * Never outputs AM/PM.
 */
export function formatDateTimeVN(input?: any, fallback = ''): string {
  if (input === null || input === undefined || input === '') return fallback;
  if (typeof input === 'string' && input.trim().toLowerCase() === 'vô thời hạn') {
    return 'Vô thời hạn';
  }
  const parsed = parseDateTimeVN(input);
  if (!parsed) {
    return fallback || (typeof input === 'string' ? input.trim() : '');
  }
  const { year, month, day, hour, minute } = getVNDateComponents(parsed);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const yyyy = String(year);
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Formats any date/time value into "DD/MM/YYYY" in timezone Asia/Ho_Chi_Minh (UTC+7).
 */
export function formatDateVN(input?: any, fallback = ''): string {
  if (input === null || input === undefined || input === '') return fallback;
  const parsed = parseDateTimeVN(input);
  if (!parsed) return fallback;
  const { year, month, day } = getVNDateComponents(parsed);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return `${dd}/${mm}/${year}`;
}

/**
 * Converts any valid date/time input into a canonical ISO 8601 UTC string ("YYYY-MM-DDTHH:mm:ss.sssZ")
 * suitable for storing in Firestore.
 * If input is "Vô thời hạn", preserves "Vô thời hạn".
 */
export function toISOStringUTC(input?: any): string {
  if (input === null || input === undefined || input === '') return '';
  if (typeof input === 'string' && input.trim().toLowerCase() === 'vô thời hạn') {
    return 'Vô thời hạn';
  }
  const parsed = parseDateTimeVN(input);
  if (!parsed) return '';
  return parsed.toISOString();
}

/**
 * Returns the current date/time (plus optional days offset) formatted as "DD/MM/YYYY HH:mm" in Vietnam time.
 */
export function getCurrentDateTimeVNDisplay(
  addDays = 0,
  overrideHour?: number,
  overrideMinute?: number
): string {
  const now = new Date();
  const comp = getVNDateComponents(now);
  const baseDate = new Date(
    Date.UTC(
      comp.year,
      comp.month - 1,
      comp.day + addDays,
      overrideHour !== undefined ? overrideHour : comp.hour,
      overrideMinute !== undefined ? overrideMinute : comp.minute,
      0
    ) - VN_OFFSET_MS
  );
  return formatDateTimeVN(baseDate);
}

/**
 * Returns the current date/time (plus optional days offset) as an ISO 8601 UTC string.
 */
export function getCurrentDateTimeISO(
  addDays = 0,
  overrideHour?: number,
  overrideMinute?: number
): string {
  const now = new Date();
  const comp = getVNDateComponents(now);
  const baseDate = new Date(
    Date.UTC(
      comp.year,
      comp.month - 1,
      comp.day + addDays,
      overrideHour !== undefined ? overrideHour : comp.hour,
      overrideMinute !== undefined ? overrideMinute : comp.minute,
      0
    ) - VN_OFFSET_MS
  );
  return baseDate.toISOString();
}

/**
 * Converts a date/time input into "YYYY-MM-DDTHH:mm" in Vietnam time for <input type="datetime-local" />.
 */
export function toDateTimeLocalValue(input?: any): string {
  const parsed = parseDateTimeVN(input);
  if (!parsed) return '';
  const { year, month, day, hour, minute } = getVNDateComponents(parsed);
  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Strictly validates user-entered date/time input (manual typing or picker).
 * Only accepts:
 *  - "DD/MM/YYYY HH:mm" (24-hour clock, no AM/PM, month 1..12, valid day for month/year)
 *  - "YYYY-MM-DDTHH:mm" (from native datetime-local input)
 *  - Canonical ISO 8601 string ("YYYY-MM-DDTHH:mm:ss.sssZ")
 * Rejects invalid months (e.g. month 13), invalid days (e.g. 31/02/2026), or US MM/DD/YYYY with month > 12.
 */
export function validateStrictDateTimeInputVN(rawInput?: string): {
  valid: boolean;
  date?: Date;
  iso?: string;
  display?: string;
  error?: string;
} {
  if (!rawInput || !rawInput.trim()) {
    return { valid: false, error: 'Vui lòng nhập ngày giờ theo định dạng DD/MM/YYYY HH:mm (24 giờ).' };
  }

  const str = rawInput.trim();
  if (str.toLowerCase() === 'vô thời hạn') {
    return { valid: true, iso: 'Vô thời hạn', display: 'Vô thời hạn' };
  }

  // 1. Check strict DD/MM/YYYY HH:mm (24-hour)
  const vnMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})$/);
  if (vnMatch) {
    const day = parseInt(vnMatch[1], 10);
    const month = parseInt(vnMatch[2], 10);
    const year = parseInt(vnMatch[3], 10);
    const hour = parseInt(vnMatch[4], 10);
    const minute = parseInt(vnMatch[5], 10);

    if (month < 1 || month > 12) {
      return {
        valid: false,
        error: `Tháng "${vnMatch[2]}" không hợp lệ (chỉ từ 01 đến 12). Định dạng chuẩn là Ngày/Tháng/Năm Giờ:Phút (DD/MM/YYYY HH:mm).`
      };
    }
    const maxDay = getDaysInMonth(year, month);
    if (day < 1 || day > maxDay) {
      return {
        valid: false,
        error: `Ngày "${vnMatch[1]}" không hợp lệ cho tháng ${String(month).padStart(2, '0')}/${year} (tối đa ${maxDay} ngày).`
      };
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return {
        valid: false,
        error: 'Giờ phút không hợp lệ (Giờ: 00–23, Phút: 00–59 theo định dạng 24 giờ).'
      };
    }

    const date = createDateFromVNComponents(year, month, day, hour, minute, 0);
    if (!date) {
      return { valid: false, error: 'Ngày giờ không hợp lệ.' };
    }
    return {
      valid: true,
      date,
      iso: date.toISOString(),
      display: formatDateTimeVN(date)
    };
  }

  // 2. Check native datetime-local "YYYY-MM-DDTHH:mm" or full ISO 8601 UTC
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    const date = parseDateTimeVN(str);
    if (!date) {
      return { valid: false, error: 'Ngày giờ không hợp lệ.' };
    }
    return {
      valid: true,
      date,
      iso: date.toISOString(),
      display: formatDateTimeVN(date)
    };
  }

  // 3. Check if user still has AM/PM in input
  if (/\b(AM|PM)\b/i.test(str)) {
    return {
      valid: false,
      error: 'Không dùng AM/PM. Vui lòng nhập theo định dạng 24 giờ: DD/MM/YYYY HH:mm (ví dụ: 13/12/2026 07:55).'
    };
  }

  return {
    valid: false,
    error: 'Định dạng ngày giờ không hợp lệ. Vui lòng nhập đúng: DD/MM/YYYY HH:mm (ví dụ: 13/12/2026 07:55).'
  };
}

/**
 * Validates the logical ordering between schedule time, open time, and deadline time.
 * Rules:
 * - Deadline (endTime / dueDate) MUST be strictly AFTER Open time (startTime / startDate).
 * - Schedule time (scheduleDate) MUST NOT be after Deadline.
 */
export function validateScheduleAndDeadline(params: {
  scheduleTime?: any;
  openTime?: any;
  deadlineTime?: any;
  isUnlimited?: boolean;
}): { valid: boolean; error?: string } {
  const { scheduleTime, openTime, deadlineTime, isUnlimited } = params;
  if (isUnlimited || (typeof deadlineTime === 'string' && deadlineTime.trim().toLowerCase() === 'vô thời hạn')) {
    return { valid: true };
  }

  const deadlineDate = parseDateTimeVN(deadlineTime);
  if (!deadlineDate) {
    return { valid: false, error: 'Hạn làm bài không hợp lệ. Vui lòng kiểm tra lại định dạng DD/MM/YYYY HH:mm.' };
  }

  if (openTime) {
    const openDate = parseDateTimeVN(openTime);
    if (!openDate) {
      return { valid: false, error: 'Thời điểm mở đề / bắt đầu không hợp lệ.' };
    }
    if (deadlineDate.getTime() <= openDate.getTime()) {
      return {
        valid: false,
        error: `Hạn làm bài (${formatDateTimeVN(deadlineDate)}) phải SAU thời điểm mở đề (${formatDateTimeVN(openDate)})!`
      };
    }
  }

  if (scheduleTime) {
    const schedDate = parseDateTimeVN(scheduleTime);
    if (!schedDate) {
      return { valid: false, error: 'Thời điểm lên lịch giao bài không hợp lệ.' };
    }
    if (schedDate.getTime() >= deadlineDate.getTime()) {
      return {
        valid: false,
        error: `Thời điểm lên lịch giao bài (${formatDateTimeVN(schedDate)}) không được sau hoặc trùng với hạn làm bài (${formatDateTimeVN(deadlineDate)})!`
      };
    }
  }

  return { valid: true };
}

/**
 * Checks whether a value is already a canonical ISO 8601 UTC string ("YYYY-MM-DDTHH:mm:ss.sssZ").
 */
export function isCanonicalISOString(val: any): boolean {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(val.trim());
}
