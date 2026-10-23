import {
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  SetOptions,
  DocumentReference,
  CollectionReference,
  WriteBatch,
  Firestore
} from 'firebase/firestore';

export type ActionCategory = 'admin_batch' | 'user_action' | 'background_sync';

export type TrackedWriteOptions = SetOptions & {
  isUserInitiated?: boolean;
  actionType?: ActionCategory;
  customThreshold?: number;
  customCaller?: string;
};

export interface WriteMetricItem {
  id: string;
  collection: string;
  caller: string;
  opType: 'setDoc' | 'addDoc' | 'updateDoc' | 'deleteDoc' | 'writeBatch';
  count: number;
  timestamp: number;
  isUserInitiated: boolean;
  actionType: ActionCategory;
}

export interface BlockedMetricItem {
  id: string;
  caller: string;
  collection: string;
  rate: number;
  opType: string;
  timestamp: number;
  isUserInitiated: boolean;
  actionType: ActionCategory;
  blocked: boolean; // true = hard blocked (background), false = warning only (user/admin)
}

export interface FirestoreWriteStatsSummary {
  totalWrites: number;
  byCollection: Record<string, number>;
  byCaller: Record<string, number>;
  blockedWritesCount: number;
  adminWarningsCount: number;
  blockedDetails: BlockedMetricItem[];
  recentHistory: WriteMetricItem[];
}

// In-memory store for stats
let writeHistory: WriteMetricItem[] = [];
let blockedHistory: BlockedMetricItem[] = [];
const callerTimestampsMap = new Map<string, number[]>();

// Configurable threshold defaults (writes per minute)
export const DEFAULT_THRESHOLDS: Record<ActionCategory, number> = {
  background_sync: 200,
  user_action: 500,
  admin_batch: 2000
};

/**
 * Utility to parse short stack trace caller location
 * e.g. "AssignmentModule.tsx:484" or "studentStorageService.ts:683"
 */
export function getCallerLocation(): string {
  try {
    const err = new Error();
    const stack = err.stack || '';
    const lines = stack.split('\n');

    for (const line of lines) {
      if (
        line.includes('firestoreWriteTracker') ||
        line.includes('getCallerLocation') ||
        line.includes('Error')
      ) {
        continue;
      }

      // Match pattern like "at functionName (http://.../src/components/modules/AssignmentModule.tsx?t=123:484:15)"
      const match = line.match(/([a-zA-Z0-9_\-\.]+\.(?:tsx?|jsx?))(?:\?[^:]*)?:(\d+)/);
      if (match) {
        return `${match[1]}:${match[2]}`;
      }
    }
  } catch {}
  return 'unknown_caller.ts:1';
}

/**
 * Extract collection name from DocumentReference or CollectionReference or path
 */
export function extractCollectionName(refOrPath: DocumentReference | CollectionReference | string): string {
  if (typeof refOrPath === 'string') {
    return refOrPath.split('/')[0] || 'unknown';
  }
  if (refOrPath && (refOrPath as any).path) {
    const pathStr = (refOrPath as any).path as string;
    return pathStr.split('/')[0] || 'unknown';
  }
  return 'unknown';
}

/**
 * Group similar error strings into single items with counters to prevent error spam
 */
export function groupAndCountErrors(errors: string[]): { message: string; count: number }[] {
  if (!Array.isArray(errors) || errors.length === 0) return [];

  const map = new Map<string, number>();

  for (const err of errors) {
    if (!err) continue;
    let template = err;

    if (err.includes('chưa có lớp đích hợp lệ')) {
      template = 'Học sinh chưa có lớp đích hợp lệ trong sơ đồ chuyển lớp';
    } else if (err.includes('rate-limit-exceeded')) {
      template = 'Lỗi vượt ngưỡng tần suất ghi Firestore (>200 lượt/phút)';
    } else if (err.includes('resource-exhausted')) {
      template = 'Lỗi vượt quá hạn mức Firestore (resource-exhausted / quota)';
    }

    map.set(template, (map.get(template) || 0) + 1);
  }

  return Array.from(map.entries()).map(([message, count]) => ({ message, count }));
}

/**
 * Rate Limiter check with active admin/user action distinction
 */
function checkRateLimitAndRecord(
  caller: string,
  collectionName: string,
  opType: string,
  count: number,
  opts?: TrackedWriteOptions
): { allowed: boolean; currentRate: number } {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  const isUserInitiated = opts?.isUserInitiated ?? false;
  const actionType: ActionCategory = opts?.actionType || (isUserInitiated ? 'admin_batch' : 'background_sync');
  const threshold = opts?.customThreshold || DEFAULT_THRESHOLDS[actionType] || 200;

  let timestamps = callerTimestampsMap.get(caller) || [];
  timestamps = timestamps.filter(t => t > oneMinuteAgo);

  const newRate = timestamps.length + count;

  // Background syncs are strictly blocked if over threshold
  if (!isUserInitiated && actionType === 'background_sync' && newRate > threshold) {
    const blockedItem: BlockedMetricItem = {
      id: `${now}_${Math.random().toString(36).substring(2, 7)}`,
      caller,
      collection: collectionName,
      rate: newRate,
      opType,
      timestamp: now,
      isUserInitiated: false,
      actionType: 'background_sync',
      blocked: true
    };
    blockedHistory.unshift(blockedItem);
    if (blockedHistory.length > 50) blockedHistory.pop();

    console.error(
      `🚨 [FIRESTORE PROTECTION LAYER] CHẶN GHI NỀN! ` +
      `Nơi gọi: "${caller}" ghi ${newRate} lượt/phút (Ngưỡng nền: ${threshold}/phút, collection "${collectionName}").`
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eduplay_firestore_rate_limit_triggered', {
        detail: blockedItem
      }));
      window.dispatchEvent(new Event('eduplay_firestore_writes_updated'));
    }

    return { allowed: false, currentRate: newRate };
  }

  // Active Admin / User actions: Warning only, do NOT block execution!
  if (isUserInitiated || actionType === 'admin_batch' || actionType === 'user_action') {
    if (newRate > threshold) {
      const warnItem: BlockedMetricItem = {
        id: `${now}_${Math.random().toString(36).substring(2, 7)}`,
        caller,
        collection: collectionName,
        rate: newRate,
        opType,
        timestamp: now,
        isUserInitiated: true,
        actionType,
        blocked: false
      };
      blockedHistory.unshift(warnItem);
      if (blockedHistory.length > 50) blockedHistory.pop();

      console.warn(
        `⚠️ [FIRESTORE ADMIN WARNING] CẢNH BÁO THAO TÁC CHỦ ĐỘNG! ` +
        `Nơi gọi: "${caller}" đang ghi ${newRate} lượt/phút vào collection "${collectionName}". Vẫn cho phép thực thi.`
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('eduplay_firestore_rate_limit_triggered', {
          detail: warnItem
        }));
      }
    }
  }

  for (let i = 0; i < count; i++) {
    timestamps.push(now);
  }
  callerTimestampsMap.set(caller, timestamps);

  // Record write metric
  const item: WriteMetricItem = {
    id: `${now}_${Math.random().toString(36).substring(2, 7)}`,
    collection: collectionName,
    caller,
    opType: opType as any,
    count,
    timestamp: now,
    isUserInitiated,
    actionType
  };
  writeHistory.unshift(item);
  if (writeHistory.length > 500) writeHistory.pop();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_firestore_writes_updated'));
  }

  return { allowed: true, currentRate: newRate };
}

/**
 * Extract real Firestore error code and user-friendly message
 */
export function extractFirestoreErrorDetails(err: any): { code: string; message: string; rawMessage: string } {
  if (!err) return { code: 'unknown', message: 'Lỗi không xác định', rawMessage: '' };

  const code = err.code || err.name || 'unknown_error';
  const rawMessage = err.message || String(err);

  let message = rawMessage;

  if (code === 'resource-exhausted' || rawMessage.includes('resource-exhausted') || rawMessage.includes('quota')) {
    message = 'Mã lỗi [resource-exhausted]: Đã vượt quá hạn mức ghi dữ liệu của Firestore trong ngày (Free Tier ~20.000 writes/ngày).';
  } else if (code === 'permission-denied' || rawMessage.includes('permission-denied')) {
    message = 'Mã lỗi [permission-denied]: Bị từ chối quyền truy cập hoặc ghi dữ liệu Firestore (kiểm tra Rules).';
  } else if (code === 'unavailable' || rawMessage.includes('unavailable')) {
    message = 'Mã lỗi [unavailable]: Dịch vụ Firestore tạm thời không phản hồi hoặc gián đoạn mạng.';
  } else if (rawMessage.includes('timeout') || code === 'deadline-exceeded') {
    message = `Mã lỗi [${code}]: Quá thời gian chờ phản hồi kết nối từ máy chủ Firestore (${rawMessage})`;
  } else {
    message = `Mã lỗi [${code}]: ${rawMessage}`;
  }

  return { code, message, rawMessage };
}

/**
 * Tracked wrapper for setDoc
 */
export async function trackedSetDoc(
  docRef: DocumentReference,
  data: any,
  options?: SetOptions,
  writeOpts?: TrackedWriteOptions
): Promise<void> {
  const caller = writeOpts?.customCaller || getCallerLocation();
  const collectionName = extractCollectionName(docRef);

  const { allowed, currentRate } = checkRateLimitAndRecord(caller, collectionName, 'setDoc', 1, writeOpts);

  if (!allowed) {
    const err = new Error(
      `[rate-limit-exceeded] Dừng ghi nền từ ${caller}: Vượt quá ngưỡng bảo vệ 200 lượt ghi/phút (${currentRate} lượt).`
    );
    (err as any).code = 'rate-limit-exceeded';
    throw err;
  }

  try {
    if (options) {
      await setDoc(docRef, data, options);
    } else {
      await setDoc(docRef, data);
    }
  } catch (err: any) {
    const details = extractFirestoreErrorDetails(err);
    console.error(`❌ [trackedSetDoc Error] ${caller} -> collection "${collectionName}":`, details.message);
    throw err;
  }
}

/**
 * Tracked wrapper for addDoc
 */
export async function trackedAddDoc(
  collRef: CollectionReference,
  data: any,
  writeOpts?: TrackedWriteOptions
): Promise<DocumentReference> {
  const caller = writeOpts?.customCaller || getCallerLocation();
  const collectionName = extractCollectionName(collRef);

  const { allowed, currentRate } = checkRateLimitAndRecord(caller, collectionName, 'addDoc', 1, writeOpts);

  if (!allowed) {
    const err = new Error(
      `[rate-limit-exceeded] Dừng ghi nền từ ${caller}: Vượt quá ngưỡng bảo vệ 200 lượt ghi/phút (${currentRate} lượt).`
    );
    (err as any).code = 'rate-limit-exceeded';
    throw err;
  }

  try {
    return await addDoc(collRef, data);
  } catch (err: any) {
    const details = extractFirestoreErrorDetails(err);
    console.error(`❌ [trackedAddDoc Error] ${caller} -> collection "${collectionName}":`, details.message);
    throw err;
  }
}

/**
 * Tracked wrapper for updateDoc
 */
export async function trackedUpdateDoc(
  docRef: DocumentReference,
  data: any,
  writeOpts?: TrackedWriteOptions
): Promise<void> {
  const caller = writeOpts?.customCaller || getCallerLocation();
  const collectionName = extractCollectionName(docRef);

  const { allowed, currentRate } = checkRateLimitAndRecord(caller, collectionName, 'updateDoc', 1, writeOpts);

  if (!allowed) {
    const err = new Error(
      `[rate-limit-exceeded] Dừng ghi nền từ ${caller}: Vượt quá ngưỡng bảo vệ 200 lượt ghi/phút (${currentRate} lượt).`
    );
    (err as any).code = 'rate-limit-exceeded';
    throw err;
  }

  try {
    await updateDoc(docRef, data);
  } catch (err: any) {
    const details = extractFirestoreErrorDetails(err);
    console.error(`❌ [trackedUpdateDoc Error] ${caller} -> collection "${collectionName}":`, details.message);
    throw err;
  }
}

/**
 * Tracked wrapper for deleteDoc
 */
export async function trackedDeleteDoc(
  docRef: DocumentReference,
  writeOpts?: TrackedWriteOptions
): Promise<void> {
  const caller = writeOpts?.customCaller || getCallerLocation();
  const collectionName = extractCollectionName(docRef);

  const { allowed, currentRate } = checkRateLimitAndRecord(caller, collectionName, 'deleteDoc', 1, writeOpts);

  if (!allowed) {
    const err = new Error(
      `[rate-limit-exceeded] Dừng ghi nền từ ${caller}: Vượt quá ngưỡng bảo vệ 200 lượt ghi/phút (${currentRate} lượt).`
    );
    (err as any).code = 'rate-limit-exceeded';
    throw err;
  }

  try {
    await deleteDoc(docRef);
  } catch (err: any) {
    const details = extractFirestoreErrorDetails(err);
    console.error(`❌ [trackedDeleteDoc Error] ${caller} -> collection "${collectionName}":`, details.message);
    throw err;
  }
}

/**
 * Tracked wrapper for writeBatch
 */
export function trackedWriteBatch(db: Firestore, writeOpts?: TrackedWriteOptions): WriteBatch {
  const caller = writeOpts?.customCaller || getCallerLocation();
  const realBatch = writeBatch(db);

  let opCount = 0;
  let sampleCollection = 'unknown';

  const trackedBatch: WriteBatch = {
    set: (docRef: any, data: any, options?: any) => {
      opCount++;
      sampleCollection = extractCollectionName(docRef);
      return options ? realBatch.set(docRef, data, options) : realBatch.set(docRef, data);
    },
    update: (docRef: any, data: any) => {
      opCount++;
      sampleCollection = extractCollectionName(docRef);
      return realBatch.update(docRef, data);
    },
    delete: (docRef: any) => {
      opCount++;
      sampleCollection = extractCollectionName(docRef);
      return realBatch.delete(docRef);
    },
    commit: async () => {
      if (opCount === 0) return realBatch.commit();

      const { allowed, currentRate } = checkRateLimitAndRecord(caller, sampleCollection, 'writeBatch', opCount, writeOpts);

      if (!allowed) {
        const err = new Error(
          `[rate-limit-exceeded] Dừng ghi batch từ ${caller}: Vượt quá ngưỡng bảo vệ 200 lượt ghi/phút (${currentRate} lượt).`
        );
        (err as any).code = 'rate-limit-exceeded';
        throw err;
      }

      try {
        await realBatch.commit();
      } catch (err: any) {
        const details = extractFirestoreErrorDetails(err);
        console.error(`❌ [trackedWriteBatch Commit Error] ${caller} (${opCount} ops) -> collection "${sampleCollection}":`, details.message);
        throw err;
      }
    }
  };

  return trackedBatch;
}

/**
 * Get aggregated summary stats for debug view
 */
export function getFirestoreWriteStats(): FirestoreWriteStatsSummary {
  const byCollection: Record<string, number> = {};
  const byCaller: Record<string, number> = {};
  let totalWrites = 0;

  for (const item of writeHistory) {
    totalWrites += item.count;
    byCollection[item.collection] = (byCollection[item.collection] || 0) + item.count;
    byCaller[item.caller] = (byCaller[item.caller] || 0) + item.count;
  }

  const blockedCount = blockedHistory.filter(b => b.blocked).length;
  const adminWarnCount = blockedHistory.filter(b => !b.blocked).length;

  return {
    totalWrites,
    byCollection,
    byCaller,
    blockedWritesCount: blockedCount,
    adminWarningsCount: adminWarnCount,
    blockedDetails: [...blockedHistory],
    recentHistory: [...writeHistory]
  };
}

/**
 * Reset all counters and history
 */
export function resetFirestoreWriteStats(): void {
  writeHistory = [];
  blockedHistory = [];
  callerTimestampsMap.clear();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_firestore_writes_updated'));
  }
}
