import { db } from './firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export interface ActivityLog {
  id: string;
  user: string;
  role?: string;
  action: string;
  module: string;
  timestamp: string; // Formatted display string
  timeMs: number;    // Normalized milliseconds for sorting
  schoolYear?: string;
  type?: string;
  className?: string;
  targetTitle?: string;
}

const ACTIVITY_CACHE_KEY = 'eduplay_activity_logs_cache_v3';
const ACTIVITY_CACHE_TIME_KEY = 'eduplay_activity_logs_cache_time_v3';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Standardize any timestamp format (ISO string, number ms, Firestore Timestamp, Date object)
 * into milliseconds and a human-readable display string using Vietnam time (UTC+7).
 * Requirement 3 & 7: Put items with missing timestamps at the end (timeMs = 0).
 */
export function normalizeTimestamp(raw: any): { timeMs: number; formatted: string } {
  if (!raw) {
    return { timeMs: 0, formatted: 'Chưa rõ thời gian' };
  }

  let date: Date | null = null;

  if (typeof raw === 'number' && !isNaN(raw)) {
    date = new Date(raw);
  } else if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) {
      date = new Date(parsed);
    } else {
      date = new Date(raw);
    }
  } else if (raw && typeof raw === 'object') {
    if (typeof raw.toMillis === 'function') {
      date = new Date(raw.toMillis());
    } else if (typeof raw.seconds === 'number') {
      date = new Date(raw.seconds * 1000);
    } else if (raw instanceof Date) {
      date = raw;
    }
  }

  if (!date || isNaN(date.getTime()) || date.getTime() <= 0) {
    return { timeMs: 0, formatted: String(raw || 'Chưa rõ thời gian') };
  }

  const timeMs = date.getTime();

  // Format in Vietnam timezone (UTC+7)
  try {
    const now = new Date();
    const formatterDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const targetDateStr = formatterDate.format(date);
    const nowDateStr = formatterDate.format(now);

    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayDateStr = formatterDate.format(yesterdayDate);

    const formatterTime = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const timeStr = formatterTime.format(date);

    let formatted = '';
    if (targetDateStr === nowDateStr) {
      formatted = `Hôm nay ${timeStr}`;
    } else if (targetDateStr === yesterdayDateStr) {
      formatted = `Hôm qua ${timeStr}`;
    } else {
      const [y, m, d] = targetDateStr.split('-');
      formatted = `${d}/${m}/${y} ${timeStr}`;
    }

    return { timeMs, formatted };
  } catch {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return { timeMs, formatted: `${hours}:${minutes}` };
  }
}

/**
 * Log a system activity record with deterministic ID to prevent duplicates at source.
 * Requirement 2: Deterministic ID `${type}_${targetId}_${className}_${timestamp rounded to minute}`.
 */
export async function logSystemActivity(activity: {
  type?: string;
  actorName?: string;
  user?: string;
  className?: string;
  targetTitle?: string;
  targetId?: string;
  module?: string;
  action: string;
  schoolYear?: string;
}): Promise<void> {
  try {
    const schoolYear = activity.schoolYear || '2026-2027';
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const actor = activity.actorName || activity.user || 'Giáo viên';
    const moduleName = activity.module || 'Hệ thống';
    const actionText = activity.action;
    const type = activity.type || 'general';
    const targetTitle = activity.targetTitle || 'chung';
    const className = activity.className || 'chung';

    // Deterministic ID rounded to minute (prevents duplicate logs within the same minute)
    const minuteBucket = Math.floor(nowMs / 60000);
    const sanitizedTitle = targetTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const sanitizedClass = className.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);
    const docId = `act_${type}_${sanitizedTitle}_${sanitizedClass}_${minuteBucket}`;

    const logData = {
      id: docId,
      user: actor,
      role: 'teacher',
      action: actionText,
      module: moduleName,
      timestamp: nowIso,
      schoolYear,
      type,
      className,
      targetTitle
    };

    const logRef = doc(db, 'activityLogs', docId);
    await setDoc(logRef, logData, { merge: true }).catch(() => {});

    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(ACTIVITY_CACHE_KEY);
        const list = cached ? JSON.parse(cached) : [];
        // Remove existing item with same id if any
        const filtered = list.filter((l: any) => l.id !== docId);
        filtered.unshift(logData);
        localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify(filtered.slice(0, 50)));
        localStorage.setItem(ACTIVITY_CACHE_TIME_KEY, String(Date.now()));
      } catch {}
    }
  } catch (err) {
    console.warn('Could not log system activity:', err);
  }
}

/**
 * Fetch and synthesize activity logs with 30-day window, deduplication within 5 minutes, and retroactive fallback.
 */
export async function fetchAndSynthesizeActivityLogs(
  schoolYear: string = '2026-2027',
  forceRefresh: boolean = false
): Promise<ActivityLog[]> {
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const cachedTime = Number(localStorage.getItem(ACTIVITY_CACHE_TIME_KEY) || 0);
      const cachedData = localStorage.getItem(ACTIVITY_CACHE_KEY);
      if (cachedData && Date.now() - cachedTime < CACHE_TTL_MS) {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => {
            const norm = normalizeTimestamp(item.timestamp || item.time);
            return {
              ...item,
              timeMs: norm.timeMs,
              timestamp: norm.formatted
            };
          }).filter(item => item.timeMs === 0 || item.timeMs >= thirtyDaysAgoMs).slice(0, 20);
        }
      }
    } catch {}
  }

  const allCollected: ActivityLog[] = [];
  const seenSignatures = new Set<string>();

  const addUniqueActivity = (item: ActivityLog) => {
    // Deduplication key based on type + targetTitle + className + roughly 5-minute bucket
    const timeBucket5Min = Math.floor(item.timeMs / (5 * 60 * 1000));
    const sig = `${item.type || 'gen'}_${(item.targetTitle || '').trim().toLowerCase()}_${(item.className || '').trim().toLowerCase()}_${timeBucket5Min}`;
    if (!seenSignatures.has(sig) || item.timeMs === 0) {
      seenSignatures.add(sig);
      allCollected.push(item);
    }
  };

  // 1. Fetch from Firestore activityLogs (limit 20)
  try {
    const logsRef = collection(db, 'activityLogs');
    const snap = await getDocs(logsRef);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const norm = normalizeTimestamp(data.timestamp || data.time);
      if (norm.timeMs === 0 || norm.timeMs >= thirtyDaysAgoMs) {
        addUniqueActivity({
          id: docSnap.id,
          user: data.user || data.actorName || 'Giáo viên',
          role: data.role || 'teacher',
          action: data.action || '',
          module: data.module || 'Hệ thống',
          timestamp: norm.formatted,
          timeMs: norm.timeMs,
          schoolYear: data.schoolYear || schoolYear,
          type: data.type || 'general',
          className: data.className || '',
          targetTitle: data.targetTitle || ''
        });
      }
    });
  } catch (err) {
    console.warn('Could not fetch activityLogs from Firestore:', err);
  }

  // 2. Retroactive compilation: Fetch exams from Firestore (safely without requiring index)
  try {
    const examsRef = collection(db, 'exams');
    const snapExams = await getDocs(examsRef);
    snapExams.forEach(docSnap => {
      const ex = docSnap.data();
      const rawTime = ex.assignedAt || ex.updatedAt || ex.startTime || ex.createdAt || ex.date;
      const norm = normalizeTimestamp(rawTime);
      if (norm.timeMs === 0 || norm.timeMs >= thirtyDaysAgoMs) {
        const title = ex.title || 'Đề kiểm tra';
        const targetClass = ex.targetClass || ex.grade || 'Lớp học';
        const actionText = `Cô Nguyễn Thị Thu giao ${title} cho ${targetClass}`;
        addUniqueActivity({
          id: `retro-exam-${docSnap.id}`,
          user: 'Giáo viên',
          role: 'teacher',
          action: actionText,
          module: 'Quản Lý Đề Kiểm Tra',
          timestamp: norm.formatted,
          timeMs: norm.timeMs,
          schoolYear,
          type: 'exam_assigned',
          className: targetClass,
          targetTitle: title
        });
      }
    });
  } catch (err) {
    console.warn('Could not fetch exams for retroactive activity:', err);
  }

  // 3. Retroactive compilation: Fetch assignments from Firestore (safely)
  try {
    const assignRef = collection(db, 'assignments');
    const snapAssign = await getDocs(assignRef);
    snapAssign.forEach(docSnap => {
      const asg = docSnap.data();
      const rawTime = asg.assignedAt || asg.updatedAt || asg.createdAt;
      const norm = normalizeTimestamp(rawTime);
      if (norm.timeMs === 0 || norm.timeMs >= thirtyDaysAgoMs) {
        const title = asg.title || 'Bài tập';
        const targetClass = asg.targetClass || asg.grade || 'Lớp học';
        const actor = asg.teacherName || 'Cô Nguyễn Thị Thu';
        const actionText = `${actor} giao bài tập ${title} cho ${targetClass}`;
        addUniqueActivity({
          id: `retro-assign-${docSnap.id}`,
          user: actor,
          role: 'teacher',
          action: actionText,
          module: 'Quản Lý Bài Tập',
          timestamp: norm.formatted,
          timeMs: norm.timeMs,
          schoolYear,
          type: 'assignment_assigned',
          className: targetClass,
          targetTitle: title
        });
      }
    });
  } catch (err) {
    console.warn('Could not fetch assignments for retroactive activity:', err);
  }

  // Sort descending by timeMs, missing timestamps go last
  allCollected.sort((a, b) => {
    if (a.timeMs === 0 && b.timeMs === 0) return 0;
    if (a.timeMs === 0) return 1;
    if (b.timeMs === 0) return -1;
    return b.timeMs - a.timeMs;
  });

  const finalLogs = allCollected.slice(0, 20);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify(finalLogs));
      localStorage.setItem(ACTIVITY_CACHE_TIME_KEY, String(Date.now()));
    } catch {}
  }

  return finalLogs;
}
