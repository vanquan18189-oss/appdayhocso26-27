import { db } from './firebase';
import { collection, doc, getDocs, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
// import { safeStorage } from '../utils/safeStorage';

export const LOW_SCORE_THRESHOLD = 5;

export interface AppNotification {
  id: string;
  teacherId?: string;
  studentId: string;
  studentCode: string;
  studentName?: string;
  assignmentId: string;
  assignmentTitle: string;
  type: 'ai_failed' | 'low_score';
  message: string;
  createdAt: string;
  read: boolean;
  targetClass?: string;
  details?: {
    failedQuestionIndexes?: number[];
    gradeNotes?: string[];
    score?: number;
  };
}

const LOCAL_STORAGE_KEY = 'eduplay_notifications';

// Dispatch custom event when notifications update locally
function notifyListeners() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_notifications_updated'));
  }
}

export function getLocalNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Lỗi đọc notifications từ LocalStorage:', err);
    return [];
  }
}

export function saveLocalNotifications(notifications: AppNotification[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(notifications));
    notifyListeners();
  } catch (err) {
    console.warn('Lỗi lưu notifications vào LocalStorage:', err);
  }
}

export async function createNotificationIfNotExists(notif: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): Promise<AppNotification | null> {
  const existing = getLocalNotifications();
  
  // Deduplication check: studentCode/studentId + assignmentId + type
  const normCode = (notif.studentCode || notif.studentId || '').trim().toLowerCase();
  const alreadyExists = existing.some(n => 
    (n.studentCode.trim().toLowerCase() === normCode || n.studentId.trim().toLowerCase() === normCode) &&
    n.assignmentId === notif.assignmentId &&
    n.type === notif.type
  );

  if (alreadyExists) {
    return null; // Don't duplicate
  }

  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = new Date().toISOString();
  
  const newNotif: AppNotification = {
    ...notif,
    id,
    createdAt,
    read: false
  };

  // 1. Save to LocalStorage
  const updated = [newNotif, ...existing];
  saveLocalNotifications(updated);

  // 2. Save to Firestore if available (async)
  if (db) {
    try {
      const docRef = doc(db, 'notifications', id);
      await setDoc(docRef, newNotif, { merge: true });
    } catch (err) {
      console.warn('Không thể lưu notification lên Firestore:', err);
    }
  }

  return newNotif;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const existing = getLocalNotifications();
  const updated = existing.map(n => n.id === id ? { ...n, read: true } : n);
  saveLocalNotifications(updated);

  if (db) {
    try {
      const docRef = doc(db, 'notifications', id);
      await updateDoc(docRef, { read: true });
    } catch (err) {
      console.warn('Không thể cập nhật notification read trên Firestore:', err);
    }
  }
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const existing = getLocalNotifications();
  const updated = existing.map(n => ({ ...n, read: true }));
  saveLocalNotifications(updated);

  if (db) {
    try {
      const unreadList = existing.filter(n => !n.read);
      for (const n of unreadList) {
        try {
          const docRef = doc(db, 'notifications', n.id);
          await updateDoc(docRef, { read: true });
        } catch {}
      }
    } catch (err) {
      console.warn('Lỗi khi đánh dấu đã đọc tất cả thông báo:', err);
    }
  }
}

export function getUnreadNotificationCount(): number {
  const list = getLocalNotifications();
  return list.filter(n => !n.read).length;
}

export async function syncNotificationsFromFirestore(): Promise<AppNotification[]> {
  if (!db) return getLocalNotifications();
  try {
    const collRef = collection(db, 'notifications');
    const snap = await getDocs(collRef);
    const firestoreNotifs: AppNotification[] = [];
    snap.docs.forEach(d => {
      firestoreNotifs.push({ id: d.id, ...d.data() } as AppNotification);
    });

    if (firestoreNotifs.length > 0) {
      const local = getLocalNotifications();
      const map = new Map<string, AppNotification>();
      local.forEach(n => map.set(n.id, n));
      firestoreNotifs.forEach(n => map.set(n.id, n));
      const merged = Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      saveLocalNotifications(merged);
      return merged;
    }
  } catch (err) {
    console.warn('Không thể sync notifications từ Firestore:', err);
  }
  return getLocalNotifications();
}
