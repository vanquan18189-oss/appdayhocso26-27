import { StudentRecord, StudentEnrollmentRecord } from '../types';
import { db } from './firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { trackedSetDoc, trackedDeleteDoc, trackedWriteBatch } from './firestoreWriteTracker';
import { formatStandardStudentCode } from './studentCode';

const PRIMARY_SCHOOL_SUBJECTS = [
  'Toán', 'Tiếng Việt', 'Đạo Đức', 'Tự nhiên và Xã hội', 'Khoa học',
  'Lịch sử và Địa lý', 'Ngoại ngữ (Tiếng Anh)', 'Tin học', 'Công nghệ',
  'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'
];

export const EDUPLAY_STUDENTS_DB_KEY = 'eduplay_students_database';
export const EDUPLAY_CLASSES_DATA_KEY = 'eduplay_classes_data';

/**
 * Standardize class identifier to uppercase (e.g. "Lớp 5B" -> "5B", "5b" -> "5B")
 */
export function normalizeClassKey(className: string): string {
  if (!className) return '5B';
  return className.trim().replace(/^Lớp\s*/i, '').toUpperCase();
}

/**
 * Convert normalized key back to standard display format (e.g. "5b" -> "Lớp 5B")
 */
export function getStandardClassName(classKeyOrName: string): string {
  if (!classKeyOrName) return 'Lớp 5B';
  const clean = classKeyOrName.trim();
  if (clean.toLowerCase().startsWith('lớp ')) {
    return clean;
  }
  return `Lớp ${clean.toUpperCase()}`;
}

/**
 * Extract numerical sequence or index from student ID/Code/STT (e.g. "st-5a-37" -> 37, "5b12" -> 12, stt -> 12)
 */
export function extractStudentNumericIndex(student: StudentRecord): number {
  if (!student) return 0;
  if (typeof student.stt === 'number' && !isNaN(student.stt) && student.stt > 0) {
    return student.stt;
  }
  // Try extracting number from id e.g. "st-5a-37" or "st-5b-5"
  const idMatch = (student.id || '').match(/(\d+)(?!.*\d)/);
  if (idMatch && idMatch[1]) {
    const num = parseInt(idMatch[1], 10);
    if (!isNaN(num)) return num;
  }
  // Try extracting from code e.g. "5a37"
  const codeMatch = (student.code || '').match(/(\d+)(?!.*\d)/);
  if (codeMatch && codeMatch[1]) {
    const num = parseInt(codeMatch[1], 10);
    if (!isNaN(num)) return num;
  }
  return 0;
}

/**
 * Deduplicate student records and guarantee clean, strictly unique IDs and consistent indexing
 */
export function deduplicateAndNormalizeStudents(
  students: StudentRecord[],
  className: string = 'Lớp 5B'
): StudentRecord[] {
  if (!Array.isArray(students)) return [];

  const stdName = getStandardClassName(className);
  const key = normalizeClassKey(stdName);
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const uniqueStudents: StudentRecord[] = [];

  students.forEach((st) => {
    if (!st || typeof st !== 'object') return;
    
    const rawId = (st.id || '').trim();
    const rawCode = (st.code || st.username || '').trim().toLowerCase();

    // If duplicate raw ID or code exists in the incoming array, skip duplicate row
    if (rawId && seenIds.has(rawId)) {
      return;
    }
    if (rawCode && seenCodes.has(rawCode)) {
      return;
    }

    if (rawId) seenIds.add(rawId);
    if (rawCode) seenCodes.add(rawCode);
    uniqueStudents.push(st);
  });

  const finalSeenIds = new Set<string>();
  return uniqueStudents.map((st, idx) => {
    const stt = idx + 1;
    const code = formatStandardStudentCode(st.code, key, stt);
    
    // Ensure every record has a unique ID and no collisions
    let id = st.id && !finalSeenIds.has(st.id) ? st.id : `st-${key}-${stt}`;
    if (finalSeenIds.has(id)) {
      id = `st-${key}-${stt}-${idx + 1}`;
    }
    finalSeenIds.add(id);

    const sddcn = (st.sddcn && st.sddcn.trim().length > 0) 
      ? st.sddcn.trim() 
      : (st.idCard && st.idCard.trim().length > 0)
      ? st.idCard.trim()
      : '';

    return {
      ...st,
      id,
      stt,
      code,
      sddcn,
      studentPersistentId: sddcn,
      academicYear: st.academicYear || '2026-2027',
      username: st.username || code,
      className: st.className || stdName,
      pin: st.pin || st.password || '123456',
      password: st.password || st.pin || '123456'
    };
  });
}

/**
 * Extract Vietnamese name sorting key (Tên main given name first, then Họ & tên đệm)
 * E.g., "Hà Phương Vy" -> "Vy Hà Phương", "Nguyễn Văn An" -> "An Nguyễn Văn", "Bùi Hà Kim Nhung" -> "Nhung Bùi Hà Kim"
 */
export function getVietnameseNameSortKey(fullName: string): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return trimmed;
  const firstName = parts[parts.length - 1]; // Tên chính
  const middleAndLast = parts.slice(0, parts.length - 1).join(' '); // Họ & tên đệm
  return `${firstName} ${middleAndLast}`;
}

/**
 * Sort students array in ALPHABETICAL order A-Z by Vietnamese Name
 * (Tên từ A đến Z, học sinh vần A xếp trên cùng, vần V/Z ở cuối)
 */
export function sortStudentsByNameAZ(students: StudentRecord[]): StudentRecord[] {
  if (!Array.isArray(students)) return [];
  const deduped = deduplicateAndNormalizeStudents(students);
  return deduped.sort((a, b) => {
    const nameA = (a.fullName || a.name || '').trim();
    const nameB = (b.fullName || b.name || '').trim();

    // 1. So sánh theo Tên (từ cuối cùng) theo chuẩn Tiếng Việt (A -> Z)
    const keyA = getVietnameseNameSortKey(nameA);
    const keyB = getVietnameseNameSortKey(nameB);
    const cmpName = keyA.localeCompare(keyB, 'vi', { sensitivity: 'base' });
    if (cmpName !== 0) return cmpName;

    // 2. Nếu cùng Tên, so sánh Họ và Tên đệm
    const cmpFull = nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
    if (cmpFull !== 0) return cmpFull;

    return (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
  });
}

/**
 * Sort students array in REVERSE ALPHABETICAL order Z-A by Vietnamese Name
 */
export function sortStudentsByNameZA(students: StudentRecord[]): StudentRecord[] {
  if (!Array.isArray(students)) return [];
  const deduped = deduplicateAndNormalizeStudents(students);
  return deduped.sort((a, b) => {
    const nameA = (a.fullName || a.name || '').trim();
    const nameB = (b.fullName || b.name || '').trim();

    const keyA = getVietnameseNameSortKey(nameA);
    const keyB = getVietnameseNameSortKey(nameB);
    const cmpName = keyB.localeCompare(keyA, 'vi', { sensitivity: 'base' });
    if (cmpName !== 0) return cmpName;

    const cmpFull = nameB.localeCompare(nameA, 'vi', { sensitivity: 'base' });
    if (cmpFull !== 0) return cmpFull;

    return (b.id || '').localeCompare(a.id || '', undefined, { numeric: true });
  });
}

/**
 * Sort students array in DESCENDING order by Student ID / STT (e.g. 37, 36, ... 12, 11, ... 1)
 */
export function sortStudentsDescending(students: StudentRecord[]): StudentRecord[] {
  if (!Array.isArray(students)) return [];
  const deduped = deduplicateAndNormalizeStudents(students);
  return deduped.sort((a, b) => {
    const numA = extractStudentNumericIndex(a);
    const numB = extractStudentNumericIndex(b);
    if (numA !== numB) {
      return numB - numA; // Descending: Largest to Smallest
    }
    return (b.id || '').localeCompare(a.id || '', undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Sort students array in ASCENDING order by Student ID / STT (e.g. 1, 2, ... 37)
 */
export function sortStudentsAscending(students: StudentRecord[]): StudentRecord[] {
  if (!Array.isArray(students)) return [];
  const deduped = deduplicateAndNormalizeStudents(students);
  return deduped.sort((a, b) => {
    const numA = extractStudentNumericIndex(a);
    const numB = extractStudentNumericIndex(b);
    if (numA !== numB) {
      return numA - numB; // Ascending: Smallest to Largest
    }
    return (a.id || '').localeCompare(b.id || '', undefined, { numeric: true, sensitivity: 'base' });
  });
}

const STANDARD_3C_NAMES = [
  'Nguyễn Văn An', 'Trần Đức Bảo', 'Lê Minh Cường', 'Phạm Quốc Dũng', 'Hoàng Văn Đức',
  'Vũ Gia Huy', 'Bùi Hoàng Nam', 'Đỗ Minh Triết', 'Ngô Thành Vinh', 'Trịnh Đức Anh',
  'Đặng Bảo Nam', 'Võ Văn Kiệt', 'Nguyễn Nhật Minh', 'Phạm Hải Đăng', 'Dương Quốc Trung',
  'Nguyễn Khánh Nam', 'Đào Minh Quân', 'Hồ Văn Hùng', 'Nguyễn Gia Bảo', 'Trịnh Hoàng Long',
  'Lê Thị Mai', 'Trần Phương Thảo', 'Phạm Ngọc Anh', 'Nguyễn Khánh Linh', 'Hoàng Thùy Linh',
  'Bùi Bảo Ngọc', 'Đỗ Quỳnh Anh', 'Ngô Thanh Hà', 'Vũ Phương Anh', 'Trịnh Thu Hà',
  'Nguyễn Hoài An', 'Đặng Linh Chi', 'Võ Minh Châu', 'Nguyễn Ngọc Mai', 'Phạm Yến Nhi',
  'Hoàng Mỹ Duyên', 'Đào Thị Hồng', 'Trịnh Bảo Trang'
];

/**
 * Generate default roster for class 5B
 */
export function getDefault5BRoster(): StudentRecord[] {
  return generateDefaultClassRoster('Lớp 5B', 35);
}

/**
 * Danh sách học sinh lớp 3C chuẩn hóa 38 học sinh theo định dạng Mã HS 3C26-27-1 đến 3C26-27-38
 */
export function getDefault3CRoster(): StudentRecord[] {
  const cleanClass = '3C';
  return STANDARD_3C_NAMES.map((name, idx) => {
    const stt = idx + 1;
    const isMale = idx < 20;
    return {
      id: `st-3c-${stt}`,
      stt,
      code: `${cleanClass}26-27-${stt}`,
      name,
      fullName: name,
      gender: isMale ? ('Nam' as const) : ('Nữ' as const),
      dob: `${String((stt % 28) + 1).padStart(2, '0')}/05/2016`,
      className: 'Lớp 3C',
      parentName: `${isMale ? 'Nguyễn' : 'Trần'} Văn ${name.split(' ').slice(-1)[0]}`,
      phone: `0985${String(100000 + stt * 1357).slice(-6)}`,
      email: `hs.3c${stt}@quanghungpk1.edu.vn`,
      status: 'active' as const,
      conduct: 'Tốt' as const,
      avgScore: 8.5,
      avatar: '🌟',
      sddcn: `03831600${String(1000 + stt).slice(-4)}`
    };
  });
}

/**
 * Return roster for any class with standard Student Codes [CLASS]26-27-[STT]
 */
export function generateDefaultClassRoster(className: string, count: number = 38): StudentRecord[] {
  const stdName = getStandardClassName(className);
  const cleanClass = normalizeClassKey(stdName);
  const actualCount = count > 0 ? count : 38;
  return Array.from({ length: actualCount }).map((_, idx) => {
    const stt = idx + 1;
    const isMale = idx % 2 === 0;
    const name = STANDARD_3C_NAMES[idx % STANDARD_3C_NAMES.length];
    return {
      id: `st-${cleanClass.toLowerCase()}-${stt}`,
      stt,
      code: `${cleanClass}26-27-${stt}`,
      name,
      fullName: name,
      gender: isMale ? ('Nam' as const) : ('Nữ' as const),
      dob: `${String((stt % 28) + 1).padStart(2, '0')}/05/2016`,
      className: stdName,
      parentName: `${isMale ? 'Nguyễn' : 'Trần'} Văn ${name.split(' ').slice(-1)[0]}`,
      phone: `0985${String(100000 + stt * 1357).slice(-6)}`,
      email: `hs.${cleanClass.toLowerCase()}${stt}@quanghungpk1.edu.vn`,
      status: 'active' as const,
      conduct: 'Tốt' as const,
      avgScore: 8.0,
      avatar: '🌟',
      sddcn: `03831600${String(1000 + stt).slice(-4)}`
    };
  });
}

/**
 * Tính toán sĩ số thực tế chuẩn xác của lớp dựa trên danh sách học sinh thực tế
 */
export function getClassStudentCount(className: string, fallbackCount?: number): number {
  if (!className) return fallbackCount || 0;
  const roster = getStudentsFromLocalStorage(className);
  if (roster && Array.isArray(roster) && roster.length > 0) {
    return roster.length;
  }
  return fallbackCount || 38;
}

/**
 * Initial full database of all classes
 */
export function getInitialStudentDatabase(): Record<string, StudentRecord[]> {
  return {};
}

/**
 * Get students for a specific class from LocalStorage with fallback
 */
export function getStudentsFromLocalStorage(className: string): StudentRecord[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const stdName = getStandardClassName(className);
    const key = normalizeClassKey(className);

    // 1. Check direct per-class key (e.g. eduplay_students_5b, eduplay_students_3c)
    const directData = localStorage.getItem(`eduplay_students_${key}`) || localStorage.getItem(`eduplay_students_${key.toLowerCase()}`);
    if (directData) {
      const parsed = JSON.parse(directData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return deduplicateAndNormalizeStudents(parsed, stdName);
      }
    }

    // 2. Check full database key (eduplay_students_database)
    const fullDbData = localStorage.getItem(EDUPLAY_STUDENTS_DB_KEY);
    if (fullDbData) {
      const parsedDb = JSON.parse(fullDbData);
      if (parsedDb && typeof parsedDb === 'object') {
        if (Array.isArray(parsedDb[stdName]) && parsedDb[stdName].length > 0) {
          return deduplicateAndNormalizeStudents(parsedDb[stdName], stdName);
        }
        if (Array.isArray(parsedDb[key]) && parsedDb[key].length > 0) {
          return deduplicateAndNormalizeStudents(parsedDb[key], stdName);
        }
        if (Array.isArray(parsedDb[key.toLowerCase()]) && parsedDb[key.toLowerCase()].length > 0) {
          return deduplicateAndNormalizeStudents(parsedDb[key.toLowerCase()], stdName);
        }
      }
    }

    // 3. Fallback danh sách mặc định chuẩn hóa theo sĩ số lớp
    if (key === '3C' || stdName.includes('3C')) {
      const defaultRoster = getDefault3CRoster();
      try {
        localStorage.setItem(`eduplay_students_${key}`, JSON.stringify(defaultRoster));
      } catch {}
      return defaultRoster;
    }
  } catch (err) {
    console.warn('Lỗi đọc LocalStorage học sinh:', err);
  }

  return null;
}

/**
 * Get all students for all classes from LocalStorage with dual key resolution
 */
export function getAllStudentsFromLocalStorage(): Record<string, StudentRecord[]> {
  if (typeof window === 'undefined') return getInitialStudentDatabase();

  const cleanedDb: Record<string, StudentRecord[]> = {};

  try {
    // 1. Read master database object
    const fullDbData = localStorage.getItem(EDUPLAY_STUDENTS_DB_KEY);
    if (fullDbData) {
      const parsedDb = JSON.parse(fullDbData);
      if (parsedDb && typeof parsedDb === 'object') {
        Object.entries(parsedDb).forEach(([cls, list]) => {
          if (Array.isArray(list) && list.length > 0) {
            const stdName = getStandardClassName(cls);
            const key = normalizeClassKey(cls);
            const deduped = deduplicateAndNormalizeStudents(list as StudentRecord[], stdName);
            cleanedDb[stdName] = deduped;
            cleanedDb[key] = deduped;
          }
        });
      }
    }

    // 2. Scan all individual per-class storage keys (e.g. eduplay_students_5D, eduplay_students_5C, etc.)
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && storageKey.startsWith('eduplay_students_') && storageKey !== EDUPLAY_STUDENTS_DB_KEY) {
        const classKey = storageKey.replace('eduplay_students_', '').trim();
        const stdName = getStandardClassName(classKey);
        const normKey = normalizeClassKey(classKey);
        if (!cleanedDb[stdName] || cleanedDb[stdName].length === 0) {
          const itemData = localStorage.getItem(storageKey);
          if (itemData) {
            try {
              const parsed = JSON.parse(itemData);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const deduped = deduplicateAndNormalizeStudents(parsed, stdName);
                cleanedDb[stdName] = deduped;
                cleanedDb[normKey] = deduped;
              }
            } catch {}
          }
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc toàn bộ LocalStorage học sinh:', err);
  }

  return cleanedDb;
}

/**
 * Save all students database to LocalStorage & per-class keys (guaranteeing both standard and short key entries)
 */
export function saveAllStudentsToLocalStorage(dbData: Record<string, StudentRecord[]>) {
  if (typeof window === 'undefined') return;

  try {
    const cleanedDb: Record<string, StudentRecord[]> = {};
    Object.entries(dbData).forEach(([clsName, students]) => {
      if (!Array.isArray(students) || students.length === 0) return;
      const stdName = getStandardClassName(clsName);
      const key = normalizeClassKey(clsName);
      const cleaned = deduplicateAndNormalizeStudents(students, stdName);
      cleanedDb[stdName] = cleaned;
      cleanedDb[key] = cleaned;
      localStorage.setItem(`eduplay_students_${key}`, JSON.stringify(cleaned));
      if (key !== key.toLowerCase()) {
        localStorage.setItem(`eduplay_students_${key.toLowerCase()}`, JSON.stringify(cleaned));
      }
    });

    localStorage.setItem(EDUPLAY_STUDENTS_DB_KEY, JSON.stringify(cleanedDb));

    // Dispatch real-time events for instant UI synchronization asynchronously
    setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent('student-data-updated', {
            detail: { action: 'all-updated', dbData: cleanedDb, timestamp: Date.now() }
          })
        );
        window.dispatchEvent(
          new CustomEvent('eduplay_students_updated', {
            detail: { action: 'all-updated' }
          })
        );
      } catch {}
    }, 0);
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (!msg.includes('INTERNAL ASSERTION FAILED') && !msg.includes('b815') && !msg.includes('ca9')) {
      console.error('Lỗi lưu toàn bộ học sinh vào LocalStorage:', err);
    }
  }
}

/**
 * Save students for a specific class to LocalStorage & dispatch window events
 */
export function saveStudentsToLocalStorage(className: string, students: StudentRecord[]) {
  if (typeof window === 'undefined') return;

  try {
    const stdName = getStandardClassName(className);
    const key = normalizeClassKey(className);
    const cleaned = deduplicateAndNormalizeStudents(students, stdName);

    // 1. Save to direct per-class key (e.g. eduplay_students_5b)
    localStorage.setItem(`eduplay_students_${key}`, JSON.stringify(cleaned));

    // 2. Update the full database object
    let fullDb: Record<string, StudentRecord[]> = {};
    const fullDbData = localStorage.getItem(EDUPLAY_STUDENTS_DB_KEY);
    if (fullDbData) {
      try {
        fullDb = JSON.parse(fullDbData) || {};
      } catch {
        fullDb = {};
      }
    }
    fullDb[stdName] = cleaned;
    localStorage.setItem(EDUPLAY_STUDENTS_DB_KEY, JSON.stringify(fullDb));

    // 3. Dispatch real-time events for instant UI reactivity across components asynchronously
    setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent('student-data-updated', {
            detail: {
              className: stdName,
              classKey: key,
              count: cleaned.length,
              students: cleaned,
              action: 'saved',
              timestamp: Date.now()
            }
          })
        );
        window.dispatchEvent(
          new CustomEvent('eduplay_students_updated', {
            detail: { className: stdName, classKey: key, count: cleaned.length }
          })
        );
      } catch {}
    }, 0);
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (!msg.includes('INTERNAL ASSERTION FAILED') && !msg.includes('b815') && !msg.includes('ca9')) {
      console.error('Lỗi lưu học sinh vào LocalStorage:', err);
    }
  }
}

/**
 * Add or update a single student in a class, updating cache and publishing events
 */
export function addOrUpdateStudentInClass(className: string, student: StudentRecord): StudentRecord[] {
  const stdName = getStandardClassName(className);
  const currentList = getStudentsFromLocalStorage(stdName) || [];
  const existingIdx = currentList.findIndex(s => s.id === student.id || (s.code && s.code === student.code));

  let updatedList: StudentRecord[];
  if (existingIdx >= 0) {
    updatedList = [...currentList];
    updatedList[existingIdx] = { ...updatedList[existingIdx], ...student, className: stdName };
  } else {
    updatedList = [...currentList, { ...student, className: stdName }];
  }

  saveStudentsToLocalStorage(stdName, updatedList);
  syncClassStudentsToFirestore(stdName, updatedList).catch(() => {});

  window.dispatchEvent(
    new CustomEvent('student-data-updated', {
      detail: {
        className: stdName,
        action: existingIdx >= 0 ? 'student-updated' : 'student-added',
        student,
        timestamp: Date.now()
      }
    })
  );

  return updatedList;
}

/**
 * Delete a single student from a class, updating cache and publishing events
 */
export function deleteStudentFromClass(className: string, studentId: string): StudentRecord[] {
  const stdName = getStandardClassName(className);
  const currentList = getStudentsFromLocalStorage(stdName) || [];
  const target = currentList.find(s => s.id === studentId || s.code === studentId);
  const updatedList = currentList.filter(s => s.id !== studentId && s.code !== studentId);

  saveStudentsToLocalStorage(stdName, updatedList);
  syncClassStudentsToFirestore(stdName, updatedList).catch(() => {});
  if (target) {
    deleteStudentPermanently(stdName, target).catch(() => {});
  }

  window.dispatchEvent(
    new CustomEvent('student-data-updated', {
      detail: {
        className: stdName,
        action: 'student-deleted',
        deletedStudentId: studentId,
        count: updatedList.length,
        timestamp: Date.now()
      }
    })
  );

  return updatedList;
}

/**
 * Clear all students in a class
 */
export function clearAllStudentsInClass(className: string): { success: boolean; error?: string; remainingStudents: StudentRecord[] } {
  try {
    const stdName = getStandardClassName(className);
    const classKey = normalizeClassKey(className);
    saveStudentsToLocalStorage(stdName, []);
    localStorage.removeItem(`eduplay_students_${classKey}`);
    localStorage.removeItem(`eduplay_students_${classKey.toLowerCase()}`);
    syncClassStudentsToFirestore(stdName, []).catch(() => {});

    window.dispatchEvent(
      new CustomEvent('student-data-updated', {
        detail: {
          className: stdName,
          action: 'all-cleared',
          count: 0,
          timestamp: Date.now()
        }
      })
    );

    return { success: true, remainingStudents: [] };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err), remainingStudents: [] };
  }
}

/**
 * Completely delete a student from a class across:
 * 1. Class roster in local cache & LocalStorage
 * 2. Firestore 'class_rosters' collection (both normalized uppercase and lowercase documents)
 * 3. Firestore 'students' collection (individual documents by ID/Code/query)
 * 4. Real-time window sync events
 */
export async function deleteStudentPermanently(
  className: string,
  student: StudentRecord
): Promise<{ success: boolean; error?: string; remainingStudents: StudentRecord[] }> {
  try {
    const stdName = getStandardClassName(className);
    const classKey = normalizeClassKey(className);

    // 1. Get current list from LocalStorage / memory
    const currentList = getStudentsFromLocalStorage(stdName) || [];
    
    // Robust filter checking ID, Code, SDDCN, or exact name + DOB
    const filtered = currentList.filter(s => {
      if (student.id && s.id && s.id === student.id) return false;
      if (student.code && s.code && s.code.toLowerCase() === student.code.toLowerCase()) return false;
      if (student.sddcn && s.sddcn && s.sddcn === student.sddcn) return false;
      if (s.name === student.name && s.dob === student.dob && s.dob) return false;
      return true;
    });

    const updated = deduplicateAndNormalizeStudents(filtered, stdName);

    // 2. Save updated list to LocalStorage immediately
    saveStudentsToLocalStorage(stdName, updated);
    saveStudentsToLocalStorage(classKey, updated);

    // 3. Sync to Firestore
    if (db) {
      const maleCount = updated.filter((s) => s.gender === 'Nam').length;
      const femaleCount = updated.filter((s) => s.gender === 'Nữ').length;

      // 3a. Update 'class_rosters' document (uppercase key)
      const rosterRefUpper = doc(db, 'class_rosters', classKey);
      await trackedSetDoc(
        rosterRefUpper,
        {
          className: stdName,
          classKey,
          totalStudents: updated.length,
          male: maleCount,
          female: femaleCount,
          students: updated,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      // Also update lowercase key if present
      if (classKey !== classKey.toLowerCase()) {
        try {
          const lowerRef = doc(db, 'class_rosters', classKey.toLowerCase());
          const lowerSnap = await getDoc(lowerRef);
          if (lowerSnap.exists()) {
            await trackedSetDoc(
              lowerRef,
              {
                className: stdName,
                classKey: classKey.toLowerCase(),
                totalStudents: updated.length,
                male: maleCount,
                female: femaleCount,
                students: updated,
                updatedAt: new Date().toISOString()
              },
              { merge: true }
            );
          }
        } catch (err) {
          console.warn('Lower roster sync warning:', err);
        }
      }

      // 3b. Delete individual student document from 'students' collection if exists
      if (student.id) {
        try {
          await trackedDeleteDoc(doc(db, 'students', student.id));
        } catch (err) {
          console.warn(`Could not delete doc students/${student.id}:`, err);
        }
      }
      if (student.code) {
        try {
          await trackedDeleteDoc(doc(db, 'students', student.code));
        } catch (err) {
          console.warn(`Could not delete doc students/${student.code}:`, err);
        }
      }

      // Delete by query if any matching document exists in 'students'
      try {
        if (student.code) {
          const qCode = query(collection(db, 'students'), where('code', '==', student.code));
          const qSnap = await getDocs(qCode);
          if (!qSnap.empty) {
            const batch = trackedWriteBatch(db);
            qSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }
      } catch (err) {
        console.warn('Query delete student warning:', err);
      }
    }

    // 4. Dispatch live sync events asynchronously
    setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent('student-data-updated', {
            detail: {
              className: stdName,
              classKey,
              deletedStudent: student,
              count: updated.length,
              students: updated,
              action: 'student-deleted',
              timestamp: Date.now()
            }
          })
        );
        window.dispatchEvent(
          new CustomEvent('eduplay_students_updated', {
            detail: {
              className: stdName,
              classKey,
              count: updated.length,
              action: 'student-deleted'
            }
          })
        );
      } catch {}
    }, 0);

    return { success: true, remainingStudents: updated };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (!msg.includes('INTERNAL ASSERTION FAILED') && !msg.includes('b815') && !msg.includes('ca9')) {
      console.error('Lỗi khi xóa học sinh:', err);
    }
    return { success: false, error: err?.message || String(err), remainingStudents: [] };
  }
}

/**
 * Sync / Save students of a class to Firestore
 */
export async function syncClassStudentsToFirestore(
  className: string,
  students: StudentRecord[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!db) {
      return { success: false, error: 'Chưa khởi tạo Firestore' };
    }

    const stdName = getStandardClassName(className);
    const classKey = normalizeClassKey(className);
    const cleaned = deduplicateAndNormalizeStudents(students, stdName);

    const maleCount = cleaned.filter((s) => s.gender === 'Nam').length;
    const femaleCount = cleaned.filter((s) => s.gender === 'Nữ').length;

    // 1. Save full roster document in 'class_rosters' collection
    const rosterRef = doc(db, 'class_rosters', classKey);
    await trackedSetDoc(
      rosterRef,
      {
        className: stdName,
        classKey,
        totalStudents: cleaned.length,
        male: maleCount,
        female: femaleCount,
        students: cleaned,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    // 2. Also update 'classes' collection summary document with correct schema fields
    const classSummaryRef = doc(db, 'classes', classKey);
    await trackedSetDoc(
      classSummaryRef,
      {
        id: classKey,
        name: stdName,
        grade: `Khối ${stdName.replace(/[^0-9]/g, '')}`,
        room: 'Phòng học',
        subjects: PRIMARY_SCHOOL_SUBJECTS.map(s => ({ isVisible: true, subjectName: s }))
      },
      { merge: true }
    );

    return { success: true };
  } catch (err: any) {
    console.warn('Lỗi đồng bộ học sinh lên Firestore:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Fetch students of a class from Firestore
 */
export async function fetchClassStudentsFromFirestore(className: string): Promise<StudentRecord[] | null> {
  try {
    if (!db) return null;

    const classKey = normalizeClassKey(className);
    let rosterRef = doc(db, 'class_rosters', classKey);
    let docSnap = await getDoc(rosterRef);

    if (!docSnap.exists() && classKey !== classKey.toLowerCase()) {
      rosterRef = doc(db, 'class_rosters', classKey.toLowerCase());
      docSnap = await getDoc(rosterRef);
    }

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data?.students) && data.students.length > 0) {
        const cleaned = deduplicateAndNormalizeStudents(data.students as StudentRecord[], className);
        // Cache to LocalStorage immediately
        saveStudentsToLocalStorage(className, cleaned);
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('Không thể đọc dữ liệu học sinh từ Firestore (sử dụng offline cache):', err);
  }

  return null;
}

/**
 * Fetch all classes student rosters from Firestore with parallel promise handling and key normalization
 */
export async function fetchAllStudentsFromFirestore(): Promise<Record<string, StudentRecord[]>> {
  if (!db) return {};

  const allRosters: Record<string, StudentRecord[]> = {};

  try {
    // 1. Fetch all documents from 'class_rosters' collection in parallel
    const rostersSnap = await getDocs(collection(db, 'class_rosters'));
    if (!rostersSnap.empty) {
      rostersSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const rawName = (data.className || data.name || data.classKey || data.id || docSnap.id || '').trim();
        if (rawName) {
          const stdName = getStandardClassName(rawName);
          const upperKey = normalizeClassKey(rawName);
          const studentList = Array.isArray(data.students)
            ? data.students
            : (Array.isArray(data.studentList) ? data.studentList : (Array.isArray(data.roster) ? data.roster : []));

          if (Array.isArray(studentList) && studentList.length > 0) {
            const cleaned = deduplicateAndNormalizeStudents(studentList as StudentRecord[], stdName);
            allRosters[stdName] = cleaned;
            allRosters[upperKey] = cleaned;
            try {
              localStorage.setItem(`eduplay_students_${upperKey}`, JSON.stringify(cleaned));
            } catch {}
          }
        }
      });
    }

    // 2. If 'students' collection exists with individual docs, fetch and merge
    try {
      const studentsSnap = await getDocs(collection(db, 'students'));
      if (!studentsSnap.empty) {
        const individualByClass: Record<string, StudentRecord[]> = {};
        studentsSnap.forEach((d) => {
          const sData = d.data() as StudentRecord;
          const cls = sData.className || (sData as any).class || (sData as any).classId || (sData as any).lop;
          if (cls) {
            const stdName = getStandardClassName(cls);
            if (!individualByClass[stdName]) individualByClass[stdName] = [];
            individualByClass[stdName].push({ ...sData, id: d.id });
          }
        });

        Object.entries(individualByClass).forEach(([stdName, stList]) => {
          const upperKey = normalizeClassKey(stdName);
          const existing = allRosters[stdName] || [];
          const mergedMap = new Map<string, StudentRecord>();
          existing.forEach((s) => mergedMap.set(s.id, s));
          stList.forEach((s) => mergedMap.set(s.id, s));
          const cleaned = deduplicateAndNormalizeStudents(Array.from(mergedMap.values()), stdName);
          allRosters[stdName] = cleaned;
          allRosters[upperKey] = cleaned;
        });
      }
    } catch {}

    // Save aggregated result to LocalStorage
    if (Object.keys(allRosters).length > 0) {
      saveAllStudentsToLocalStorage(allRosters);
    }
  } catch (err) {
    console.warn('Lỗi tải toàn bộ học sinh từ Firestore:', err);
  }

  return allRosters;
}

/**
 * Real-time listener for a class's student roster from Firestore
 */
export function subscribeToFirestoreClassStudents(
  className: string,
  onUpdate: (students: StudentRecord[]) => void
): () => void {
  if (!db) return () => {};

  const classKey = normalizeClassKey(className);
  const rosterRef = doc(db, 'class_rosters', classKey);

  const unsubscribe = onSnapshot(
    rosterRef,
    async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data?.students)) {
          saveStudentsToLocalStorage(className, data.students);
          onUpdate(data.students as StudentRecord[]);
        }
      } else if (classKey !== classKey.toLowerCase()) {
        // Fallback to lowercase document if uppercase is not created yet
        try {
          const lowerSnap = await getDoc(doc(db, 'class_rosters', classKey.toLowerCase()));
          if (lowerSnap.exists()) {
            const data = lowerSnap.data();
            if (Array.isArray(data?.students)) {
              saveStudentsToLocalStorage(className, data.students);
              onUpdate(data.students as StudentRecord[]);
            }
          }
        } catch {}
      }
    },
    (error) => {
      console.warn(`Firestore onSnapshot warning for class ${className}:`, error);
    }
  );

  return unsubscribe;
}

/**
 * Load students with guaranteed persistence (LocalStorage -> Firestore -> Default)
 */
export async function loadStudentsWithPersistence(className: string): Promise<StudentRecord[]> {
  const stdName = getStandardClassName(className);

  // 1. Try local storage first (instant synchronous)
  const localData = getStudentsFromLocalStorage(stdName);
  if (localData && localData.length > 0) {
    // Attempt background Firestore sync
    fetchClassStudentsFromFirestore(stdName).catch(() => {});
    return localData;
  }

  // 2. Try Firestore fetch
  const firestoreData = await fetchClassStudentsFromFirestore(stdName);
  if (firestoreData && firestoreData.length > 0) {
    return firestoreData;
  }

  // 3. If no student records exist in LocalStorage or Firestore, return empty list (no mock fallback)
  return [];
}

/**
 ============================================================================
 STUDENT ENROLLMENTS & ACTIVE ACADEMIC YEAR MANAGEMENT (VIỆC 3)
 ============================================================================
 */
export const EDUPLAY_CURRENT_ACADEMIC_YEAR_KEY = 'eduplay_current_academic_year';
export const EDUPLAY_CURRENT_SEMESTER_KEY = 'eduplay_current_semester';
export const EDUPLAY_STUDENT_ENROLLMENTS_KEY = 'eduplay_student_enrollments_db';

export function getCurrentActiveAcademicYear(): string {
  if (typeof window === 'undefined') return '2026-2027';
  try {
    return localStorage.getItem(EDUPLAY_CURRENT_ACADEMIC_YEAR_KEY) || '2026-2027';
  } catch {
    return '2026-2027';
  }
}

export function getCurrentSelectedSemester(): string {
  if (typeof window === 'undefined') return 'Học kỳ I';
  try {
    return localStorage.getItem(EDUPLAY_CURRENT_SEMESTER_KEY) || 'Học kỳ I';
  } catch {
    return 'Học kỳ I';
  }
}

export function setActiveAcademicYear(year: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EDUPLAY_CURRENT_ACADEMIC_YEAR_KEY, year.trim());
    window.dispatchEvent(new CustomEvent('eduplay_academic_year_updated', { detail: { academicYear: year.trim() } }));
  } catch {}
}

export function setSelectedSemester(semester: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EDUPLAY_CURRENT_SEMESTER_KEY, semester.trim());
    window.dispatchEvent(new CustomEvent('eduplay_semester_updated', { detail: { semester: semester.trim() } }));
    window.dispatchEvent(new CustomEvent('eduplay_period_updated', { detail: { semester: semester.trim() } }));
  } catch {}
}

export function setAcademicPeriod(year: string, semester: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EDUPLAY_CURRENT_ACADEMIC_YEAR_KEY, year.trim());
    localStorage.setItem(EDUPLAY_CURRENT_SEMESTER_KEY, semester.trim());
    window.dispatchEvent(new CustomEvent('eduplay_academic_year_updated', { detail: { academicYear: year.trim() } }));
    window.dispatchEvent(new CustomEvent('eduplay_semester_updated', { detail: { semester: semester.trim() } }));
    window.dispatchEvent(new CustomEvent('eduplay_period_updated', { detail: { academicYear: year.trim(), semester: semester.trim() } }));
  } catch {}
}

export function getAllStudentEnrollments(): StudentEnrollmentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EDUPLAY_STUDENT_ENROLLMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStudentEnrollments(enrollments: StudentEnrollmentRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EDUPLAY_STUDENT_ENROLLMENTS_KEY, JSON.stringify(enrollments));
    window.dispatchEvent(new CustomEvent('eduplay_enrollments_updated'));
  } catch {}
}

/**
 * Utility to extract normalized classId (e.g. "5D") without "Lớp" prefix
 */
export function extractClassId(classNameOrId: string): string {
  if (!classNameOrId) return '1A';
  const clean = classNameOrId.trim();
  const stripped = clean.replace(/^(lớp|Lớp|LỚP)\s+/i, '').trim();
  return stripped.toUpperCase() || '1A';
}

export function upsertStudentEnrollment(
  record: StudentEnrollmentRecord,
  options?: { writeToFirestore?: boolean; isUserInitiated?: boolean }
): void {
  if (!record || !record.sddcn || !record.academicYear) return;

  const normalizedClassId = extractClassId(record.classId || record.className || '1A');
  const normalizedClassName = record.className && record.className.toLowerCase().includes('lớp')
    ? record.className
    : getStandardClassName(normalizedClassId);

  const cleanRecord: StudentEnrollmentRecord = {
    ...record,
    classId: normalizedClassId,
    className: normalizedClassName
  };

  const all = getAllStudentEnrollments();
  const existingIdx = all.findIndex(e => e.sddcn === cleanRecord.sddcn && e.academicYear === cleanRecord.academicYear);

  let isDifferent = true;
  if (existingIdx >= 0) {
    const prev = all[existingIdx];
    if (
      prev.classId === cleanRecord.classId &&
      prev.className === cleanRecord.className &&
      prev.displayCode === cleanRecord.displayCode
    ) {
      isDifferent = false;
    }
    all[existingIdx] = cleanRecord;
  } else {
    all.push(cleanRecord);
  }

  saveStudentEnrollments(all);

  // Only write to Firestore when explicitly requested (e.g. user/admin action) AND data changed
  if (options?.writeToFirestore && isDifferent && db) {
    const docId = `${cleanRecord.sddcn}_${cleanRecord.academicYear}`;
    trackedSetDoc(
      doc(db, 'student_enrollments', docId),
      cleanRecord,
      { merge: true },
      { isUserInitiated: options?.isUserInitiated ?? true, actionType: 'admin_batch' }
    ).catch(() => {});
  }
}

export function getStudentClassInfo(sddcn: string, academicYear?: string): { className: string; displayCode: string; classId: string; academicYear: string } | null {
  if (!sddcn) return null;
  const targetYear = academicYear || getCurrentActiveAcademicYear();
  const all = getAllStudentEnrollments();
  const found = all.find(e => e.sddcn === sddcn && e.academicYear === targetYear);
  if (found) {
    const classId = extractClassId(found.classId || found.className || '3C');
    const className = found.className || getStandardClassName(classId);
    return {
      className,
      displayCode: found.displayCode || '',
      classId,
      academicYear: found.academicYear
    };
  }
  return null;
}

export function promoteStudentToNextYear(
  sddcn: string,
  newClassId: string,
  newAcademicYear: string,
  newDisplayCode?: string
): void {
  if (!sddcn || !newClassId || !newAcademicYear) return;
  const normalizedClassId = extractClassId(newClassId);
  const record: StudentEnrollmentRecord = {
    sddcn,
    academicYear: newAcademicYear,
    classId: normalizedClassId,
    className: getStandardClassName(normalizedClassId),
    displayCode: newDisplayCode || '01'
  };
  upsertStudentEnrollment(record, { writeToFirestore: true, isUserInitiated: true });
}

/**
 * Admin action: Initialize or sync student enrollments for an academic year using writeBatch (max 500 ops)
 */
export async function initializeStudentEnrollmentsForYear(
  academicYear: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; totalProcessed: number; errors: string[] }> {
  if (!db) return { success: false, totalProcessed: 0, errors: ['Firestore chưa khởi tạo'] };

  try {
    const flagRef = doc(db, 'system_settings', `enrollment_init_${academicYear}`);
    const flagSnap = await getDoc(flagRef);
    if (flagSnap.exists() && flagSnap.data()?.isInitialized) {
      console.log(`ℹ️ Năm học ${academicYear} đã được khởi tạo hồ sơ student_enrollments trước đó.`);
    }

    const allRosters = await fetchAllStudentsFromFirestore();
    const recordsToInsert: StudentEnrollmentRecord[] = [];

    Object.entries(allRosters).forEach(([className, stList]) => {
      const classId = extractClassId(className);
      const stdClassName = getStandardClassName(classId);

      stList.forEach((st) => {
        if (st.sddcn) {
          recordsToInsert.push({
            sddcn: st.sddcn,
            academicYear: st.academicYear || academicYear,
            classId,
            className: stdClassName,
            displayCode: st.code || st.id || '01'
          });
        }
      });
    });

    if (recordsToInsert.length === 0) {
      return { success: true, totalProcessed: 0, errors: [] };
    }

    const BATCH_SIZE = 450;
    let processed = 0;
    const errors: string[] = [];

    for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
      const chunk = recordsToInsert.slice(i, i + BATCH_SIZE);
      const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });

      chunk.forEach((rec) => {
        upsertStudentEnrollment(rec, { writeToFirestore: false });
        const docId = `${rec.sddcn}_${rec.academicYear}`;
        const ref = doc(db, 'student_enrollments', docId);
        batch.set(ref, rec, { merge: true });
      });

      try {
        await batch.commit();
        processed += chunk.length;
        if (onProgress) onProgress(processed, recordsToInsert.length);
      } catch (err: any) {
        errors.push(`Lỗi ghi batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err?.message || String(err)}`);
      }
    }

    await trackedSetDoc(
      flagRef,
      {
        isInitialized: true,
        academicYear,
        totalStudents: recordsToInsert.length,
        updatedAt: new Date().toISOString()
      },
      { merge: true },
      { isUserInitiated: true, actionType: 'admin_batch' }
    );

    return { success: errors.length === 0, totalProcessed: processed, errors };
  } catch (err: any) {
    return { success: false, totalProcessed: 0, errors: [err?.message || String(err)] };
  }
}

/**
 * Admin proposal utility: Scan student_enrollments for unnormalized classId (e.g. "Lớp 5D" -> "5D")
 */
export function previewAndProposeClassIdNormalization(): {
  needsUpdate: boolean;
  totalRecords: number;
  recordsNeedingFix: number;
  sampleFixes: Array<{ sddcn: string; oldClassId: string; newClassId: string; className: string }>;
} {
  const enrollments = getAllStudentEnrollments();
  const needingFix: Array<{ sddcn: string; oldClassId: string; newClassId: string; className: string }> = [];

  for (const e of enrollments) {
    const extracted = extractClassId(e.classId || e.className || '');
    if (e.classId !== extracted) {
      needingFix.push({
        sddcn: e.sddcn,
        oldClassId: e.classId || '',
        newClassId: extracted,
        className: e.className || getStandardClassName(extracted)
      });
    }
  }

  return {
    needsUpdate: needingFix.length > 0,
    totalRecords: enrollments.length,
    recordsNeedingFix: needingFix.length,
    sampleFixes: needingFix.slice(0, 5)
  };
}

/**
 * Kiểm tra xem năm học đã có dữ liệu phân lớp (student_enrollments) chưa
 */
export function hasStudentEnrollmentsForYear(year: string): boolean {
  if (!year) return false;
  const currentActive = getCurrentActiveAcademicYear();
  // Năm học mặc định 2026-2027 có sẵn dữ liệu học sinh trong các bảng lớp cơ bản
  if (year === '2026-2027' && (year === currentActive || currentActive === '2026-2027')) {
    return true;
  }
  const enrollments = getAllStudentEnrollments();
  return enrollments.some(e => e.academicYear === year);
}

/**
 * Lấy danh sách hồ sơ phân lớp của một năm học
 */
export function getStudentEnrollmentsForYear(year: string): StudentEnrollmentRecord[] {
  if (!year) return [];
  const enrollments = getAllStudentEnrollments();
  return enrollments.filter(e => e.academicYear === year);
}

/**
 * Lấy danh mục các năm học khả dụng trong hệ thống
 */
export function getAvailableAcademicYears(): string[] {
  const currentActive = getCurrentActiveAcademicYear();
  const set = new Set<string>();
  set.add('2026-2027');
  set.add('2027-2028');
  if (currentActive) set.add(currentActive);
  const enrollments = getAllStudentEnrollments();
  enrollments.forEach(e => {
    if (e.academicYear) set.add(e.academicYear);
  });
  return Array.from(set).sort();
}

/**
 * Lấy thông tin trạng thái của một năm học: Đang hoạt động, Đang chuẩn bị, hoặc Lưu trữ
 */
export function getAcademicYearStatus(year: string): {
  isActive: boolean;
  hasData: boolean;
  label: string;
  badgeClass: string;
  dotColor: string;
  statusType: 'active' | 'preparing' | 'archived';
} {
  const currentActive = getCurrentActiveAcademicYear();
  const isActive = year === currentActive;
  const hasData = hasStudentEnrollmentsForYear(year);

  if (isActive) {
    return {
      isActive: true,
      hasData: true,
      label: 'Năm học đang hoạt động',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotColor: 'bg-emerald-500',
      statusType: 'active'
    };
  }

  if (!hasData) {
    return {
      isActive: false,
      hasData: false,
      label: 'Năm học đang chuẩn bị',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      dotColor: 'bg-amber-500',
      statusType: 'preparing'
    };
  }

  return {
    isActive: false,
    hasData: true,
    label: 'Năm học lưu trữ',
    badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
    dotColor: 'bg-slate-400',
    statusType: 'archived'
  };
}

/**
 * Điều hướng trực tiếp tới quy trình Lên Lớp Cuối Năm (Quản lý người dùng -> Tab promotion)
 */
export function navigateToPromotionTab(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('eduplay_open_user_tab', 'promotion');
    window.dispatchEvent(new CustomEvent('eduplay_open_promotion_tab'));
    window.dispatchEvent(new CustomEvent('eduplay_navigate_module', { detail: { module: 'user_management' } }));
  } catch {}
}

/**
 * ============================================================================
 * LƯU TRỮ VÀ ĐỒNG BỘ TRẠNG THÁI "KẾT QUẢ CUỐI NĂM" / LÊN LỚP CUỐI NĂM
 * ============================================================================
 */
export type YearEndPromotionStatus = 'promoted' | 'review_needed' | 'retained';

export interface YearEndResultRecord {
  sddcn: string;
  academicYear: string;
  status: YearEndPromotionStatus; // 'promoted' (Lên lớp) | 'review_needed' (Cần xem xét) | 'retained' (Ở lại lớp)
  note?: string;
  autoRating?: string; // Ví dụ: "Hoàn thành Xuất sắc", "Hoàn thành Tốt", "Hoàn thành", "Chưa hoàn thành"
  isManualConfirmed?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const EDUPLAY_YEAR_END_RESULTS_KEY = 'eduplay_year_end_results';

export function getAllYearEndResults(): Record<string, YearEndResultRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(EDUPLAY_YEAR_END_RESULTS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

export function getYearEndResult(sddcn: string, academicYear: string): YearEndResultRecord | null {
  if (!sddcn || !academicYear) return null;
  const all = getAllYearEndResults();
  const key = `${sddcn}_${academicYear}`;
  return all[key] || null;
}

export function saveYearEndResult(record: YearEndResultRecord): void {
  if (!record || !record.sddcn || !record.academicYear) return;
  const all = getAllYearEndResults();
  const key = `${record.sddcn}_${record.academicYear}`;
  all[key] = {
    ...record,
    updatedAt: new Date().toISOString()
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(EDUPLAY_YEAR_END_RESULTS_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent('eduplay_year_end_results_updated', { detail: { record } }));
    } catch {}
  }

  if (db) {
    trackedSetDoc(doc(db, 'student_year_end_results', key), record, { merge: true }).catch(() => {});
  }
}


