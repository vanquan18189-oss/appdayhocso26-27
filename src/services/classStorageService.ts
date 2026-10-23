import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useState, useEffect, useMemo } from 'react';

export interface ClassSubjectConfig {
  isVisible: boolean;
  subjectName: string;
}

export interface SchoolClassItem {
  id: string;
  name: string;      // e.g. "Lớp 1C", "Lớp 5D"
  grade: string;     // e.g. "Khối 1", "Khối 5"
  room?: string;     // e.g. "Phòng 101"
  homeroomTeacher?: string;
  subjects?: ClassSubjectConfig[];
}

/**
 * Danh sách môn học tiêu chuẩn theo từng Khối lớp Tiểu học (Chương trình GDPT 2018)
 */
export const STANDARD_GRADE_SUBJECTS: Record<string, string[]> = {
  'Khối 1': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tự nhiên và Xã hội', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 2': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tự nhiên và Xã hội', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 3': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tin học', 'Công nghệ', 'Tự nhiên và Xã hội', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 4': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tin học', 'Công nghệ', 'Khoa học', 'Lịch sử và Địa lí', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 5': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tin học', 'Công nghệ', 'Khoa học', 'Lịch sử và Địa lí', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm']
};

// Default 10 real primary school classes (TH Quang Hưng)
export const REAL_SCHOOL_CLASSES_FALLBACK: SchoolClassItem[] = [
  { id: '1C', name: 'Lớp 1C', grade: 'Khối 1', room: 'Phòng 101', subjects: STANDARD_GRADE_SUBJECTS['Khối 1'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '1D', name: 'Lớp 1D', grade: 'Khối 1', room: 'Phòng 102', subjects: STANDARD_GRADE_SUBJECTS['Khối 1'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '2C', name: 'Lớp 2C', grade: 'Khối 2', room: 'Phòng 201', subjects: STANDARD_GRADE_SUBJECTS['Khối 2'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '2D', name: 'Lớp 2D', grade: 'Khối 2', room: 'Phòng 202', subjects: STANDARD_GRADE_SUBJECTS['Khối 2'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '3C', name: 'Lớp 3C', grade: 'Khối 3', room: 'Phòng 301', subjects: STANDARD_GRADE_SUBJECTS['Khối 3'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '3D', name: 'Lớp 3D', grade: 'Khối 3', room: 'Phòng 302', subjects: STANDARD_GRADE_SUBJECTS['Khối 3'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '4C', name: 'Lớp 4C', grade: 'Khối 4', room: 'Phòng 401', subjects: STANDARD_GRADE_SUBJECTS['Khối 4'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '4D', name: 'Lớp 4D', grade: 'Khối 4', room: 'Phòng 402', subjects: STANDARD_GRADE_SUBJECTS['Khối 4'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '5C', name: 'Lớp 5C', grade: 'Khối 5', room: 'Phòng 501', subjects: STANDARD_GRADE_SUBJECTS['Khối 5'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '5D', name: 'Lớp 5D', grade: 'Khối 5', room: 'Phòng 502', subjects: STANDARD_GRADE_SUBJECTS['Khối 5'].map(s => ({ isVisible: true, subjectName: s })) }
];

/**
 * Format class name string to "Lớp X"
 */
export function formatClassName(rawName?: string): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  if (trimmed.startsWith('Lớp ')) return trimmed;
  return `Lớp ${trimmed}`;
}

/**
 * Extract grade digit (e.g. "Khối 5" -> "5", "5C" -> "5")
 */
export function extractGradeDigit(str?: string): string {
  if (!str) return '';
  const match = str.match(/\d+/);
  return match ? match[0] : '';
}

/**
 * Subscribe to real-time classes from Firestore 'classes' collection
 */
export function subscribeRealtimeClasses(callback: (classes: SchoolClassItem[]) => void): () => void {
  if (!db) {
    callback(REAL_SCHOOL_CLASSES_FALLBACK);
    return () => {};
  }

  try {
    const unsub = onSnapshot(collection(db, 'classes'), (snapshot) => {
      if (!snapshot.empty) {
        const classMap = new Map<string, SchoolClassItem>();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const rawId = (docSnap.id || data.id || data.classId || '').trim();
          const rawName = (data.name || data.className || rawId || '').trim();
          const name = formatClassName(rawName);
          const rawGrade = (data.grade || '').trim();
          const digit = extractGradeDigit(rawGrade) || extractGradeDigit(name);
          const grade = rawGrade || (digit ? `Khối ${digit}` : 'Khối 1');
          
          // Normalized key for deduplication (e.g. "3C", "5D")
          const cleanSuffix = name.replace(/^Lớp\s*/i, '').trim().toUpperCase();
          const normalizedKey = cleanSuffix || rawId.toUpperCase();
          const standardId = normalizedKey;

          const newItem: SchoolClassItem = {
            id: standardId,
            name,
            grade,
            room: data.room || '',
            homeroomTeacher: data.homeroomTeacher || '',
            subjects: Array.isArray(data.subjects) && data.subjects.length > 0
              ? data.subjects
              : (STANDARD_GRADE_SUBJECTS[grade] || STANDARD_GRADE_SUBJECTS['Khối 5']).map(s => ({ isVisible: true, subjectName: s }))
          };

          // If item already exists, merge fields favoring non-empty ones
          if (classMap.has(normalizedKey)) {
            const existing = classMap.get(normalizedKey)!;
            classMap.set(normalizedKey, {
              ...existing,
              name: existing.name || newItem.name,
              grade: existing.grade || newItem.grade,
              room: existing.room || newItem.room,
              homeroomTeacher: existing.homeroomTeacher || newItem.homeroomTeacher,
              subjects: (existing.subjects && existing.subjects.length > 0) ? existing.subjects : newItem.subjects
            });
          } else {
            classMap.set(normalizedKey, newItem);
          }
        });

        const list = Array.from(classMap.values());
        if (list.length > 0) {
          list.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
          callback(list);
          return;
        }
      }
      callback(REAL_SCHOOL_CLASSES_FALLBACK);
    }, (err) => {
      console.warn('Firestore classes subscription warning:', err);
      callback(REAL_SCHOOL_CLASSES_FALLBACK);
    });
    return unsub;
  } catch (err) {
    console.warn('Error subscribing to Firestore classes:', err);
    callback(REAL_SCHOOL_CLASSES_FALLBACK);
    return () => {};
  }
}

/**
 * Lấy danh sách môn học cấu hình thực tế cho một Lớp/Khối (Truy vấn từ Firestore, LocalStorage hoặc chuẩn GDPT 2018)
 */
export function getSubjectsForClassOrGrade(
  classNameOrGrade?: string,
  classesList?: SchoolClassItem[]
): string[] {
  const cleanName = (classNameOrGrade || '').trim();
  const digit = extractGradeDigit(cleanName) || '3';
  const gradeKey = `Khối ${digit}`;

  // 1. Kiểm tra cấu hình cụ thể của lớp từ danh sách classes (Firestore)
  if (classesList && classesList.length > 0) {
    // Tìm theo tên lớp chính xác trước
    let matchedClass = classesList.find(c => {
      const cNameClean = c.name.replace(/^Lớp\s+/i, '').trim().toLowerCase();
      const targetClean = cleanName.replace(/^Lớp\s+/i, '').trim().toLowerCase();
      return (
        c.id.toLowerCase() === targetClean ||
        cNameClean === targetClean ||
        c.name.toLowerCase() === cleanName.toLowerCase()
      );
    });

    // Nếu không khớp tên lớp cụ thể, tìm theo khối (grade)
    if (!matchedClass) {
      matchedClass = classesList.find(c => {
        const cDigit = extractGradeDigit(c.grade) || extractGradeDigit(c.name);
        return cDigit === digit || (c.grade || '').toLowerCase() === gradeKey.toLowerCase();
      });
    }

    if (matchedClass && Array.isArray(matchedClass.subjects) && matchedClass.subjects.length > 0) {
      const activeSubjects = matchedClass.subjects
        .filter(s => s.isVisible !== false)
        .map(s => s.subjectName.trim())
        .filter(Boolean);
      return activeSubjects;
    }
  }

  // 2. Thử lấy từ localStorage 'eduplay_classes_config'
  try {
    const localConfigStr = typeof window !== 'undefined' ? localStorage.getItem('eduplay_classes_config') : null;
    if (localConfigStr) {
      const localClasses = JSON.parse(localConfigStr);
      if (Array.isArray(localClasses)) {
        let matchedLocal = localClasses.find((c: any) => {
          const cNameClean = (c.name || '').replace(/^Lớp\s+/i, '').trim().toLowerCase();
          const targetClean = cleanName.replace(/^Lớp\s+/i, '').trim().toLowerCase();
          return (c.id || '').toLowerCase() === targetClean || cNameClean === targetClean;
        });

        if (!matchedLocal) {
          matchedLocal = localClasses.find((c: any) => {
            const cDigit = extractGradeDigit(c.grade) || extractGradeDigit(c.name);
            return cDigit === digit || (c.grade || '').toLowerCase() === gradeKey.toLowerCase();
          });
        }

        if (matchedLocal && Array.isArray(matchedLocal.subjects) && matchedLocal.subjects.length > 0) {
          const activeSubjects = matchedLocal.subjects
            .filter((s: any) => s.isVisible !== false)
            .map((s: any) => (s.subjectName || '').trim())
            .filter(Boolean);
          return activeSubjects;
        }
      }
    }
  } catch {}

  // 3. Chuẩn hóa theo Khối học GDPT 2018 tương ứng
  return STANDARD_GRADE_SUBJECTS[gradeKey] || STANDARD_GRADE_SUBJECTS['Khối 3'];
}

import { getSubjectColorStyles, SubjectColorStyle, SUBJECT_COLOR_MAP } from '../utils/subjectColors';
export { getSubjectColorStyles, SUBJECT_COLOR_MAP };
export type { SubjectColorStyle };

/**
 * Cung cấp metadata hiển thị (chủ đề mặc định, màu gradient, styles) cho từng môn học
 */
export function getSubjectDisplayConfig(subjectName: string) {
  const styles = getSubjectColorStyles(subjectName);
  return {
    name: styles.name,
    defaultTopic: styles.defaultTopic,
    gradient: styles.gradient,
    styles
  };
}

/**
 * Custom React Hook: SINGLE SOURCE OF TRUTH for class list
 */
export function useClassesList() {
  const [classes, setClasses] = useState<SchoolClassItem[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('eduplay_classes_config');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch {}
    return REAL_SCHOOL_CLASSES_FALLBACK;
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const handleLocalUpdate = () => {
      try {
        const cached = localStorage.getItem('eduplay_classes_config');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setClasses(parsed);
          }
        }
      } catch {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('eduplay_classes_updated', handleLocalUpdate);
      window.addEventListener('storage', handleLocalUpdate);
    }

    const unsub = subscribeRealtimeClasses((fetched) => {
      setClasses(fetched);
      setLoading(false);
    });

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('eduplay_classes_updated', handleLocalUpdate);
        window.removeEventListener('storage', handleLocalUpdate);
      }
      unsub();
    };
  }, []);

  /**
   * Filter class list by a specific grade (e.g. "Khối 5", "5", "Lớp 5")
   * If grade is null/undefined/empty or "Tất cả các khối", returns all classes.
   */
  const getClassesForGrade = useMemo(() => {
    return (gradeFilter?: string): SchoolClassItem[] => {
      if (!gradeFilter || gradeFilter === 'Tất cả' || gradeFilter === 'Tất cả các khối' || gradeFilter === 'Tất cả Lớp') {
        return classes;
      }

      const targetDigit = extractGradeDigit(gradeFilter);
      if (!targetDigit) return [];

      const filtered = classes.filter(c => {
        const classDigit = extractGradeDigit(c.grade) || extractGradeDigit(c.name);
        return classDigit === targetDigit;
      });

      return filtered;
    };
  }, [classes]);

  return {
    classes,
    loading,
    getClassesForGrade
  };
}
