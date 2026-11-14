import { db } from './firebase';
import { collection, doc, getDocs, getDoc } from 'firebase/firestore';
import { trackedSetDoc, trackedWriteBatch } from './firestoreWriteTracker';
import {
  parseDateTimeVN,
  formatDateTimeVN,
  toISOStringUTC,
  isCanonicalISOString
} from '../utils/dateUtils';
import { invalidateQueryCache } from './permissionService';

export interface DateAnomalyItem {
  id: string;
  collectionName: 'exams' | 'assignments';
  docId: string;
  title: string;
  className: string;
  field: 'startTime' | 'endTime' | 'startDate' | 'assignedDate' | 'dueDate';
  fieldLabel: string;
  currentRawValue: string;
  proposedISOValue: string;
  proposedDisplayVN: string;
  reason: string;
  isRangeError?: boolean;
}

/**
 * Quét toàn bộ đề kiểm tra (exams) và bài tập (assignments) trên Firestore
 * để phát hiện các trường ngày giờ lưu bằng chuỗi cũ (không phải ISO 8601 UTC chuẩn)
 * hoặc có hạn nộp nhỏ hơn ngày mở.
 */
export async function scanDateAnomaliesInFirestore(): Promise<DateAnomalyItem[]> {
  if (!db) return [];

  const anomalies: DateAnomalyItem[] = [];

  // 1. Scan 'exams'
  try {
    const examsSnap = await getDocs(collection(db, 'exams'));
    examsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || data.isDeleted) return;
      const docId = docSnap.id;
      const title = data.title || docId;
      const className = data.targetClass || (Array.isArray(data.targetClasses) ? data.targetClasses.join(', ') : '') || data.grade || 'Chưa rõ lớp';

      const startRaw = data.startTime;
      const endRaw = data.endTime;

      const startParsed = parseDateTimeVN(startRaw);
      const endParsed = parseDateTimeVN(endRaw);

      if (startRaw && typeof startRaw === 'string' && !isCanonicalISOString(startRaw)) {
        const iso = startParsed ? startParsed.toISOString() : '';
        const disp = startParsed ? formatDateTimeVN(startParsed) : 'Không đọc được';
        const hasAmPm = /\b(AM|PM)\b/i.test(startRaw);
        anomalies.push({
          id: `exams__${docId}__startTime`,
          collectionName: 'exams',
          docId,
          title,
          className,
          field: 'startTime',
          fieldLabel: 'Thời điểm mở đề (startTime)',
          currentRawValue: String(startRaw),
          proposedISOValue: iso,
          proposedDisplayVN: disp,
          reason: hasAmPm
            ? 'Đang lưu chuỗi MM/DD/YYYY hh:mm AM/PM kiểu Mỹ (chưa chuẩn ISO 8601 UTC)'
            : 'Đang lưu chuỗi hiển thị thủ công (chưa chuẩn ISO 8601 UTC)'
        });
      }

      if (endRaw && typeof endRaw === 'string' && !isCanonicalISOString(endRaw)) {
        const iso = endParsed ? endParsed.toISOString() : '';
        const disp = endParsed ? formatDateTimeVN(endParsed) : 'Không đọc được';
        const isOverflowRisk = /^1[3-9]|^[23]\d\//.test(String(endRaw).trim());
        anomalies.push({
          id: `exams__${docId}__endTime`,
          collectionName: 'exams',
          docId,
          title,
          className,
          field: 'endTime',
          fieldLabel: 'Hạn làm bài (endTime)',
          currentRawValue: String(endRaw),
          proposedISOValue: iso,
          proposedDisplayVN: disp,
          reason: isOverflowRisk
            ? 'Lưu chuỗi DD/MM/YYYY gây lỗi tràn tháng (đọc nhầm ngày 13 thành tháng 13 -> 12/01/2027)'
            : 'Đang lưu chuỗi hiển thị thủ công (chưa chuẩn ISO 8601 UTC)'
        });
      }

      if (startParsed && endParsed && endParsed.getTime() <= startParsed.getTime()) {
        anomalies.push({
          id: `exams__${docId}__rangeError`,
          collectionName: 'exams',
          docId,
          title,
          className,
          field: 'endTime',
          fieldLabel: 'Cảnh báo khoảng thời gian',
          currentRawValue: `${String(startRaw)} -> ${String(endRaw)}`,
          proposedISOValue: new Date(startParsed.getTime() + 7 * 24 * 3600 * 1000).toISOString(),
          proposedDisplayVN: formatDateTimeVN(new Date(startParsed.getTime() + 7 * 24 * 3600 * 1000)),
          reason: 'Hạn làm bài đang nhỏ hơn hoặc bằng thời điểm mở đề',
          isRangeError: true
        });
      }
    });
  } catch (err) {
    console.warn('Error scanning exams for date anomalies:', err);
  }

  // 2. Scan 'assignments'
  try {
    const assignSnap = await getDocs(collection(db, 'assignments'));
    assignSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || data.isDeleted) return;
      const docId = docSnap.id;
      const title = data.title || docId;
      const className = data.targetClass || (Array.isArray(data.targetClasses) ? data.targetClasses.join(', ') : '') || data.grade || 'Chưa rõ lớp';

      const fieldsToCheck: { field: 'startDate' | 'dueDate'; label: string }[] = [
        { field: 'startDate', label: 'Ngày bắt đầu giao (startDate)' },
        { field: 'dueDate', label: 'Hạn nộp bài (dueDate)' }
      ];

      fieldsToCheck.forEach(({ field, label }) => {
        const rawVal = data[field];
        if (!rawVal || typeof rawVal !== 'string') return;
        if (rawVal.trim().toLowerCase() === 'vô thời hạn') return;
        if (isCanonicalISOString(rawVal)) return;

        const parsed = parseDateTimeVN(rawVal);
        if (!parsed) return;

        const hasAmPm = /\b(AM|PM)\b/i.test(rawVal);
        const isLocalIsoNoTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawVal.trim());

        anomalies.push({
          id: `assignments__${docId}__${field}`,
          collectionName: 'assignments',
          docId,
          title,
          className,
          field,
          fieldLabel: label,
          currentRawValue: rawVal,
          proposedISOValue: parsed.toISOString(),
          proposedDisplayVN: formatDateTimeVN(parsed),
          reason: hasAmPm
            ? 'Lưu chuỗi MM/DD/YYYY hh:mm AM/PM kiểu Mỹ (chưa chuẩn ISO 8601 UTC)'
            : isLocalIsoNoTz
            ? 'Lưu chuỗi YYYY-MM-DDTHH:mm thiếu múi giờ UTC'
            : 'Lưu chuỗi DD/MM/YYYY HH:mm (dễ lỗi khi truyền vào new Date() trực tiếp)'
        });
      });
    });
  } catch (err) {
    console.warn('Error scanning assignments for date anomalies:', err);
  }

  return anomalies;
}

/**
 * Sao lưu tài liệu trước khi chuẩn hóa ngày giờ và áp dụng giá trị ISO 8601 UTC đã chọn.
 * Tuyệt đối chỉ cập nhật trường ngày giờ trên tài liệu gốc, không đụng chạm bài nộp của học sinh.
 */
export async function applyDateMigrationItems(
  selectedItems: DateAnomalyItem[]
): Promise<{ updatedDocsCount: number; backupId: string }> {
  if (!db || selectedItems.length === 0) {
    return { updatedDocsCount: 0, backupId: '' };
  }

  const backupId = `backup_dates_${Date.now()}`;

  // Group updates by collectionName + docId
  const grouped = new Map<string, { collectionName: 'exams' | 'assignments'; docId: string; updates: Record<string, any>; originalFields: Record<string, any>; title: string; className: string }>();

  for (const item of selectedItems) {
    if (!item.proposedISOValue) continue;
    const key = `${item.collectionName}__${item.docId}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        collectionName: item.collectionName,
        docId: item.docId,
        title: item.title,
        className: item.className,
        updates: {},
        originalFields: {}
      });
    }
    const entry = grouped.get(key)!;
    entry.updates[item.field] = item.proposedISOValue;
    entry.originalFields[item.field] = item.currentRawValue;
  }

  // 1. Save backup to 'date_migration_backups' collection
  try {
    const backupRef = doc(db, 'date_migration_backups', backupId);
    await trackedSetDoc(backupRef, {
      id: backupId,
      createdAt: new Date().toISOString(),
      itemsCount: selectedItems.length,
      docsCount: grouped.size,
      records: Array.from(grouped.values())
    });
  } catch (err) {
    console.warn('Warning saving date migration backup:', err);
  }

  // 2. Apply updates in batch (only date fields + updatedAt)
  const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });
  let count = 0;

  for (const entry of grouped.values()) {
    const docRef = doc(db, entry.collectionName, entry.docId);
    batch.set(
      docRef,
      {
        ...entry.updates,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    count++;
  }

  await batch.commit();
  invalidateQueryCache('exams');
  invalidateQueryCache('assignments');

  return { updatedDocsCount: count, backupId };
}

/**
 * Tự động kiểm tra và sửa ngay đề kiểm tra đang bị lỗi hiển thị hạn "12/01/2027 07:55":
 * "Đề kiểm tra - ĐỀ kiểm tra giũa học kì 1 môn Công nghệ lớp 5" (Lớp 5C & Lớp 5D)
 * sao lưu bản ghi cũ vào date_migration_backups trước khi chuẩn hóa sang ISO 8601 UTC:
 * - startTime: 12/11/2026 07:55 -> "2026-11-12T00:55:00.000Z"
 * - endTime:   13/12/2026 07:55 -> "2026-12-13T00:55:00.000Z"
 */
export async function ensureReportedGrade5TechExamFixed(): Promise<void> {
  if (!db) return;
  const targetIds = ['ex-1794444900388-class-lp5c', 'ex-1794444900388-class-lp5d'];

  for (const examId of targetIds) {
    try {
      const examRef = doc(db, 'exams', examId);
      const snap = await getDoc(examRef);
      if (!snap.exists()) continue;

      const data = snap.data();
      const rawStart = data.startTime;
      const rawEnd = data.endTime;

      const needStartFix = typeof rawStart === 'string' && !isCanonicalISOString(rawStart);
      const needEndFix = typeof rawEnd === 'string' && !isCanonicalISOString(rawEnd);

      if (!needStartFix && !needEndFix) continue;

      const newStartISO = toISOStringUTC(rawStart) || '2026-11-12T00:55:00.000Z';
      const newEndISO = toISOStringUTC(rawEnd) || '2026-12-13T00:55:00.000Z';

      // Save backup first
      const backupRef = doc(db, 'date_migration_backups', `auto_fix_${examId}`);
      await trackedSetDoc(backupRef, {
        examId,
        backedUpAt: new Date().toISOString(),
        previousStartTime: rawStart,
        previousEndTime: rawEnd,
        newStartTimeISO: newStartISO,
        newEndTimeISO: newEndISO
      });

      await trackedSetDoc(
        examRef,
        {
          startTime: newStartISO,
          endTime: newEndISO,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      invalidateQueryCache('exams');
    } catch (err) {
      // Non-blocking if current user is student or doesn't have write permission on this doc
      console.debug(`Auto-check exam date format for ${examId}:`, err);
    }
  }
}
