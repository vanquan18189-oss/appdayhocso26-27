import { db } from './firebase';
import { doc, getDoc, getDocFromServer, setDoc, deleteDoc } from 'firebase/firestore';
import { GameItem, QuizziGameItem } from '../types';
import { removeUndefined } from './teacherStorageService';
import { ensureAnonymousGuestAuth } from './lessonStorageService';
import {
  attachOwnershipOnCreate,
  getCurrentAccessContext,
  getContentPermissions,
  queryAccessibleCollection,
  invalidateQueryCache
} from './permissionService';

const GAMES_CACHE_KEY = 'eduplay_cached_games';
export const QUIZZI_CACHE_KEY = 'eduplay_quizzi_games';
export const QUIZZI_COLLECTION = 'quizzi_games';

export const DEFAULT_QUIZZI_GAMES: QuizziGameItem[] = [];

export type PublicGameFetchResult =
  | { status: 'ok'; game: QuizziGameItem }
  | { status: 'disabled' }
  | { status: 'not_found' }
  | { status: 'error'; message?: string };

/**
 * Extract game ID when URL matches /game/[gameId]
 */
export function extractGameIdFromPath(pathname?: string): string | null {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const match = path.match(/^\/game\/([^/?#]+)\/?$/i);
  if (!match || !match[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return match[1].trim() || null;
  }
}

export function isFreeAiGameItem(game?: Partial<QuizziGameItem> | null): boolean {
  if (!game) return false;
  return Boolean(game.isFreeAiGame || game.type === 'Trò chơi tự do');
}

export async function fetchPublicFreeAiGameById(gameId: string): Promise<PublicGameFetchResult> {
  const cleanId = (gameId || '').trim();
  if (!cleanId) return { status: 'not_found' };

  await ensureAnonymousGuestAuth();

  if (db) {
    try {
      const ref = doc(db, QUIZZI_COLLECTION, cleanId);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch (serverErr: any) {
        const serverCode = serverErr?.code || '';
        const serverMsg = String(serverErr?.message || '');
        if (serverCode === 'permission-denied' || serverMsg.includes('Missing or insufficient permissions')) {
          return { status: 'disabled' };
        }
        snap = await getDoc(ref);
      }

      if (!snap.exists()) {
        return { status: 'not_found' };
      }

      const game = { id: snap.id, ...snap.data() } as QuizziGameItem;
      if (!isFreeAiGameItem(game) || !game.htmlContent) {
        return { status: 'not_found' };
      }
      if (game.isPublicShareEnabled === false) {
        return { status: 'disabled' };
      }

      return { status: 'ok', game };
    } catch (err: any) {
      const code = err?.code || '';
      const message = String(err?.message || '');
      if (code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
        return { status: 'disabled' };
      }

      const cached = getRawCachedQuizziGames().find(item => String(item.id) === cleanId);
      if (cached && isFreeAiGameItem(cached) && cached.htmlContent) {
        if (cached.isPublicShareEnabled === false) return { status: 'disabled' };
        return { status: 'ok', game: cached };
      }
      return { status: 'error', message: 'Không thể kết nối máy chủ trò chơi. Vui lòng thử lại sau.' };
    }
  }

  const cached = getRawCachedQuizziGames().find(item => String(item.id) === cleanId);
  if (!cached || !isFreeAiGameItem(cached) || !cached.htmlContent) {
    return { status: 'not_found' };
  }
  if (cached.isPublicShareEnabled === false) {
    return { status: 'disabled' };
  }
  return { status: 'ok', game: cached };
}

function getRawCachedGames(): GameItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(GAMES_CACHE_KEY);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc cache trò chơi từ LocalStorage:', e);
  }
  return [];
}

/**
 * Lấy danh sách Trò chơi từ LocalStorage Cache (có lọc RBAC cho giáo viên thường)
 */
export function getLocalCachedGames(): GameItem[] {
  const all = getRawCachedGames();
  const access = getCurrentAccessContext();
  if (access.isAdmin || access.isStudent) return all;
  return all.filter(item => getContentPermissions(item, access).canView);
}

/**
 * Lưu danh sách Trò chơi vào LocalStorage Cache
 */
export function saveGamesToLocalStorage(games: GameItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GAMES_CACHE_KEY, JSON.stringify(games));
  } catch (e) {
    console.warn('Lỗi lưu cache trò chơi vào LocalStorage:', e);
  }
}

/**
 * Lưu một GameItem lên Firestore (kèm metadata sở hữu & chia sẻ RBAC)
 */
export async function saveGameToFirestore(gameInput: GameItem): Promise<void> {
  try {
    const current = getRawCachedGames();
    const existsIdx = current.findIndex(g => g.id === gameInput.id);
    const existingGame = existsIdx >= 0 ? current[existsIdx] : null;
    const game = attachOwnershipOnCreate({ ...gameInput }, existingGame);

    let updated: GameItem[];
    if (existsIdx >= 0) {
      updated = [...current];
      updated[existsIdx] = game;
    } else {
      updated = [game, ...current];
    }
    saveGamesToLocalStorage(updated);

    if (!db) {
      console.warn('Firestore chưa sẵn sàng, lưu cache cục bộ trò chơi');
      return;
    }

    const gameRef = doc(db, 'games', game.id);
    const cleanedPayload = removeUndefined({
      ...game,
      updatedAt: new Date().toISOString()
    });

    await setDoc(gameRef, cleanedPayload, { merge: true });
    invalidateQueryCache('games');
  } catch (error) {
    console.error("Lỗi khi lưu trò chơi lên Firestore:", error);
  }
}

/**
 * Lấy danh sách Trò chơi từ Firestore theo phân quyền RBAC (cache 5 phút, tối đa 20 doc/nguồn, không dùng onSnapshot)
 */
export async function getGamesFromFirestore(forceRefresh = false): Promise<GameItem[]> {
  try {
    if (!db) return getLocalCachedGames();

    const items = await queryAccessibleCollection<GameItem>('games', {
      forceRefresh,
      maxPerSource: 20,
      adminLimit: 50
    });
    if (items.length > 0) {
      saveGamesToLocalStorage(items);
      return items;
    }
    return getLocalCachedGames();
  } catch (error) {
    console.warn("Lỗi đọc danh sách trò chơi từ Firestore:", error);
    return getLocalCachedGames();
  }
}

/**
 * Tải danh sách Trò chơi từ Firestore theo phân quyền RBAC (không dùng onSnapshot)
 */
export function subscribeToGamesFromFirestore(
  onUpdate: (games: GameItem[]) => void,
  onError?: (err: any) => void
) {
  if (!db) {
    onUpdate(getLocalCachedGames());
    return () => {};
  }

  let isMounted = true;

  getGamesFromFirestore(false)
    .then(loaded => {
      if (!isMounted) return;
      loaded.sort((a, b) => (b.id > a.id ? 1 : -1));
      onUpdate(loaded);
    })
    .catch(err => {
      if (onError) onError(err);
      if (isMounted) onUpdate(getLocalCachedGames());
    });

  return () => {
    isMounted = false;
  };
}

/**
 * Xóa một Trò chơi khỏi Firestore
 */
export async function deleteGameFromFirestore(gameId: string): Promise<void> {
  try {
    const current = getRawCachedGames();
    const updated = current.filter(g => g.id !== gameId);
    saveGamesToLocalStorage(updated);

    if (db) {
      const ref = doc(db, 'games', gameId);
      await deleteDoc(ref);
      invalidateQueryCache('games');
    }
  } catch (error) {
    console.error("Lỗi khi xóa trò chơi khỏi Firestore:", error);
  }
}

// ==========================================
// QUIZZI GAMES STORAGE & RBAC SYNC
// ==========================================

function getRawCachedQuizziGames(): QuizziGameItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(QUIZZI_CACHE_KEY);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc cache Quizzi từ LocalStorage:', e);
  }
  return [];
}

/**
 * Lấy danh sách Trò chơi Quizzi từ LocalStorage Cache (có lọc RBAC cho giáo viên thường)
 */
export function getLocalCachedQuizziGames(): QuizziGameItem[] {
  const all = getRawCachedQuizziGames();
  const access = getCurrentAccessContext();
  if (access.isAdmin || access.isStudent) return all;
  return all.filter(item => getContentPermissions(item, access).canView);
}

/**
 * Lưu danh sách Trò chơi Quizzi vào LocalStorage Cache
 */
export function saveQuizziGamesToLocalStorage(games: QuizziGameItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUIZZI_CACHE_KEY, JSON.stringify(games));
  } catch (e) {
    console.warn('Lỗi lưu cache Quizzi vào LocalStorage:', e);
  }
}

/**
 * Lưu một QuizziGameItem lên Firestore (kèm metadata sở hữu & chia sẻ RBAC)
 */
export async function saveQuizziGameToFirestore(gameInput: QuizziGameItem): Promise<void> {
  try {
    const current = getRawCachedQuizziGames();
    const existsIdx = current.findIndex(g => String(g.id) === String(gameInput.id));
    const existingGame = existsIdx >= 0 ? current[existsIdx] : null;
    const game = attachOwnershipOnCreate({ ...gameInput }, existingGame);

    let updated: QuizziGameItem[];
    if (existsIdx >= 0) {
      updated = [...current];
      updated[existsIdx] = game;
    } else {
      updated = [game, ...current];
    }
    saveQuizziGamesToLocalStorage(updated);

    if (!db) {
      console.warn('Firestore chưa sẵn sàng, lưu cache cục bộ Quizzi');
      return;
    }

    const docId = String(game.id);
    const gameRef = doc(db, QUIZZI_COLLECTION, docId);
    const cleanedPayload = removeUndefined({
      ...game,
      id: docId,
      updatedAt: new Date().toISOString()
    });

    await setDoc(gameRef, cleanedPayload, { merge: true });
    invalidateQueryCache(QUIZZI_COLLECTION);
  } catch (error) {
    console.error(`❌ [Firestore] Lỗi khi lưu trò chơi Quizzi "${gameInput.title}" lên Firestore:`, error);
    throw error;
  }
}

/**
 * Lưu nhiều QuizziGameItem lên Firestore (hỗ trợ lưu nhiều lớp cùng lúc)
 */
export async function saveMultipleQuizziGamesToFirestore(games: QuizziGameItem[]): Promise<void> {
  for (const game of games) {
    await saveQuizziGameToFirestore(game);
  }
}

/**
 * Lấy danh sách Trò chơi Quizzi từ Firestore theo phân quyền RBAC (cache 5 phút, tối đa 20 doc/nguồn, không dùng onSnapshot)
 */
export async function getQuizziGamesFromFirestore(forceRefresh = false): Promise<QuizziGameItem[]> {
  try {
    if (!db) return getLocalCachedQuizziGames();

    const items = await queryAccessibleCollection<QuizziGameItem>(QUIZZI_COLLECTION, {
      forceRefresh,
      maxPerSource: 20,
      adminLimit: 50
    });
    if (items.length > 0) {
      saveQuizziGamesToLocalStorage(items);
      return items;
    }
    return getLocalCachedQuizziGames();
  } catch (error) {
    console.warn("Lỗi đọc danh sách Quizzi từ Firestore:", error);
    return getLocalCachedQuizziGames();
  }
}

/**
 * Tải danh sách Trò chơi Quizzi từ Firestore theo phân quyền RBAC (không dùng onSnapshot)
 */
export function subscribeToQuizziGamesFromFirestore(
  onUpdate: (games: QuizziGameItem[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!db) {
    onUpdate(getLocalCachedQuizziGames());
    return () => {};
  }

  let isMounted = true;

  getQuizziGamesFromFirestore(false)
    .then(loaded => {
      if (!isMounted) return;
      loaded.sort((a, b) => {
        const timeA = a.updatedAt || a.createdAt || '';
        const timeB = b.updatedAt || b.createdAt || '';
        if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA);
        return String(b.id).localeCompare(String(a.id));
      });
      onUpdate(loaded);
    })
    .catch(err => {
      if (onError) onError(err);
      if (isMounted) onUpdate(getLocalCachedQuizziGames());
    });

  return () => {
    isMounted = false;
  };
}

/**
 * Xóa một Trò chơi Quizzi khỏi Firestore
 */
export async function deleteQuizziGameFromFirestore(gameId: string | number): Promise<void> {
  try {
    const docId = String(gameId);
    const current = getRawCachedQuizziGames();
    const updated = current.filter(g => String(g.id) !== docId);
    saveQuizziGamesToLocalStorage(updated);

    if (db) {
      const ref = doc(db, QUIZZI_COLLECTION, docId);
      await deleteDoc(ref);
      invalidateQueryCache(QUIZZI_COLLECTION);
    }
  } catch (error) {
    console.error(`❌ [Firestore] Lỗi khi xóa trò chơi Quizzi ID ${gameId} khỏi Firestore:`, error);
    throw error;
  }
}


