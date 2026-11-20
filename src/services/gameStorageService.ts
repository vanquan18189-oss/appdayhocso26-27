import {
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { GameItem, QuizziGameItem } from '../types';
import {
  attachOwnershipOnCreate,
  getCurrentAccessContext,
  getContentPermissions,
  invalidateQueryCache,
  queryAccessibleCollection
} from '../utils/permissions';

const GAME_ROOMS_COLLECTION = 'game_rooms';
export const QUIZZI_GAMES_COLLECTION = 'quizzi_games';
export const QUIZZI_COLLECTION = QUIZZI_GAMES_COLLECTION;

const LOCAL_GAME_ROOMS_KEY = 'eduplay_games_v2';
const LOCAL_QUIZZI_GAMES_KEY = 'eduplay_custom_quizzi_games';
const LOCAL_DELETED_QUIZZI_KEY = 'eduplay_deleted_quizzi_cards';

/**
 * Loại bỏ các trường có giá trị undefined để tránh lỗi khi ghi lên Firestore
 */
function sanitizeFirestorePayload<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => (value === undefined ? null : value))
  );
}

// ============================================================================
// 1. QUẢN LÝ PHÒNG THI ĐẤU TRÒ CHƠI (GAME ROOMS)
// ============================================================================

export function getLocalCachedGameRooms(fallback: GameItem[] = []): GameItem[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(LOCAL_GAME_ROOMS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading cached game rooms from localStorage:', e);
  }
  return fallback;
}

export function setLocalCachedGameRooms(rooms: GameItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_GAME_ROOMS_KEY, JSON.stringify(rooms));
  } catch (e) {
    console.warn('Could not cache game rooms to localStorage:', e);
  }
}

/**
 * Tải danh sách Phòng thi đấu từ Firestore theo phân quyền RBAC
 * (Admin xem toàn bộ dữ liệu; Giáo viên xem phòng tự tạo, phòng chia sẻ hoặc lớp phụ trách)
 */
export async function fetchGameRoomsFromFirestore(): Promise<GameItem[]> {
  if (!db) {
    return getLocalCachedGameRooms();
  }
  try {
    const rooms = await queryAccessibleCollection<GameItem>(GAME_ROOMS_COLLECTION, {
      forceRefresh: true,
      maxPerSource: 40,
      adminLimit: 80
    });
    if (rooms.length > 0) {
      setLocalCachedGameRooms(rooms);
    }
    return rooms;
  } catch (error) {
    console.error('Error fetching game rooms from Firestore:', error);
    return getLocalCachedGameRooms();
  }
}

/**
 * Tải danh sách phòng thi đấu có bộ đệm 5 phút (tránh sử dụng onSnapshot gây tốn quota)
 */
export function subscribeToGameRoomsFromFirestore(
  onUpdate: (rooms: GameItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let active = true;

  const loadRooms = async (forceRefresh = false) => {
    try {
      if (!db) {
        if (active) onUpdate(getLocalCachedGameRooms());
        return;
      }
      const rooms = await queryAccessibleCollection<GameItem>(GAME_ROOMS_COLLECTION, {
        forceRefresh,
        maxPerSource: 40,
        adminLimit: 80
      });
      if (!active) return;
      if (rooms.length > 0) {
        setLocalCachedGameRooms(rooms);
        onUpdate(rooms);
      } else {
        onUpdate(getLocalCachedGameRooms());
      }
    } catch (error) {
      console.error('Error loading game rooms from Firestore:', error);
      if (active) {
        onUpdate(getLocalCachedGameRooms());
        if (onError && error instanceof Error) onError(error);
      }
    }
  };

  loadRooms(false);

  const handleRefresh = () => {
    loadRooms(true);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('eduplay_game_rooms_updated', handleRefresh);
  }

  return () => {
    active = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('eduplay_game_rooms_updated', handleRefresh);
    }
  };
}

/**
 * Lưu 1 Phòng thi đấu lên Firestore & cập nhật cache cục bộ
 */
export async function saveGameRoomToFirestore(room: GameItem): Promise<void> {
  if (!room || !room.id) return;

  const currentCached = getLocalCachedGameRooms();
  const existing = currentCached.find((r) => String(r.id) === String(room.id));
  const ctx = getCurrentAccessContext();

  if (existing) {
    const perms = getContentPermissions(existing, ctx);
    if (!perms.canEdit) {
      console.warn('Permission denied: Cannot edit game room owned by another teacher.');
      return;
    }
  }

  const enrichedRoom = attachOwnershipOnCreate(room, existing);

  // Cập nhật cache local trước để UI phản hồi tức thì
  const exists = currentCached.some((r) => String(r.id) === String(enrichedRoom.id));
  const updatedLocal = exists
    ? currentCached.map((r) => (String(r.id) === String(enrichedRoom.id) ? enrichedRoom : r))
    : [enrichedRoom, ...currentCached];
  setLocalCachedGameRooms(updatedLocal);

  if (!db) return;

  try {
    const cleanData = sanitizeFirestorePayload({
      ...enrichedRoom,
      updatedAt: new Date().toISOString()
    });
    const docRef = doc(db, GAME_ROOMS_COLLECTION, String(enrichedRoom.id));
    await setDoc(docRef, cleanData, { merge: true });
    invalidateQueryCache(GAME_ROOMS_COLLECTION);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_game_rooms_updated'));
    }
  } catch (error) {
    console.error(`Error saving game room ${enrichedRoom.id} to Firestore:`, error);
    throw error;
  }
}

/**
 * Lưu hàng loạt Phòng thi đấu lên Firestore (dùng khi giao cho nhiều lớp hoặc khởi tạo dữ liệu mẫu)
 */
export async function saveMultipleGameRoomsToFirestore(rooms: GameItem[]): Promise<void> {
  if (!rooms || rooms.length === 0) return;

  const currentCached = getLocalCachedGameRooms();
  const ctx = getCurrentAccessContext();
  const roomMap = new Map<string, GameItem>();
  currentCached.forEach((r) => roomMap.set(String(r.id), r));

  const allowedRoomsToWrite: GameItem[] = [];
  rooms.forEach((r) => {
    const existing = roomMap.get(String(r.id));
    if (existing) {
      const perms = getContentPermissions(existing, ctx);
      if (!perms.canEdit) return;
    }
    const enriched = attachOwnershipOnCreate(r, existing);
    roomMap.set(String(enriched.id), enriched);
    allowedRoomsToWrite.push(enriched);
  });

  setLocalCachedGameRooms(Array.from(roomMap.values()));

  if (!db || allowedRoomsToWrite.length === 0) return;

  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    allowedRoomsToWrite.forEach((room) => {
      if (!room || !room.id) return;
      const docRef = doc(db, GAME_ROOMS_COLLECTION, String(room.id));
      const cleanData = sanitizeFirestorePayload({
        ...room,
        updatedAt: nowIso
      });
      batch.set(docRef, cleanData, { merge: true });
    });
    await batch.commit();
    invalidateQueryCache(GAME_ROOMS_COLLECTION);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_game_rooms_updated'));
    }
  } catch (error) {
    console.error('Error batch saving game rooms to Firestore:', error);
    throw error;
  }
}

/**
 * Xóa vĩnh viễn 1 Phòng thi đấu khỏi Firestore & cache cục bộ
 */
export async function deleteGameRoomFromFirestore(roomId: string): Promise<void> {
  if (!roomId) return;

  const currentCached = getLocalCachedGameRooms();
  const existing = currentCached.find((r) => String(r.id) === String(roomId));
  if (existing) {
    const ctx = getCurrentAccessContext();
    const perms = getContentPermissions(existing, ctx);
    if (!perms.canDelete) {
      console.warn('Permission denied: Only owner or admin can delete this game room.');
      return;
    }
  }

  const updatedLocal = currentCached.filter((r) => String(r.id) !== String(roomId));
  setLocalCachedGameRooms(updatedLocal);

  if (!db) return;

  try {
    await deleteDoc(doc(db, GAME_ROOMS_COLLECTION, String(roomId)));
    invalidateQueryCache(GAME_ROOMS_COLLECTION);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_game_rooms_updated'));
    }
  } catch (error) {
    console.error(`Error deleting game room ${roomId} from Firestore:`, error);
    throw error;
  }
}

// ============================================================================
// 2. QUẢN LÝ TRÒ CHƠI QUIZZI NHÚNG LIÊN KẾT (QUIZZI GAMES)
// ============================================================================

export function getLocalCachedQuizziGames(fallback: QuizziGameItem[] = []): QuizziGameItem[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(LOCAL_QUIZZI_GAMES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading cached Quizzi games from localStorage:', e);
  }
  return fallback;
}

export function setLocalCachedQuizziGames(games: QuizziGameItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_QUIZZI_GAMES_KEY, JSON.stringify(games));
  } catch (e) {
    console.warn('Could not cache Quizzi games to localStorage:', e);
  }
}

/**
 * Tải danh sách trò chơi Quizzi có bộ đệm 5 phút (tránh dùng onSnapshot gây tốn quota)
 */
export function subscribeToQuizziGamesFromFirestore(
  onUpdate: (games: QuizziGameItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let active = true;

  const loadQuizziGames = async (forceRefresh = false) => {
    try {
      if (!db) {
        if (active) onUpdate(getLocalCachedQuizziGames());
        return;
      }
      const games = await queryAccessibleCollection<QuizziGameItem>(QUIZZI_GAMES_COLLECTION, {
        forceRefresh,
        maxPerSource: 40,
        adminLimit: 80
      });
      if (!active) return;
      setLocalCachedQuizziGames(games);
      onUpdate(games);
    } catch (error) {
      console.error('Error loading Quizzi games from Firestore:', error);
      if (active) {
        onUpdate(getLocalCachedQuizziGames());
        if (onError && error instanceof Error) onError(error);
      }
    }
  };

  loadQuizziGames(false);

  const handleRefresh = () => {
    loadQuizziGames(true);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('eduplay_quizzi_games_updated', handleRefresh);
  }

  return () => {
    active = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('eduplay_quizzi_games_updated', handleRefresh);
    }
  };
}

/**
 * Lưu 1 hoặc nhiều trò chơi Quizzi lên Firestore (mô hình 1 trò chơi gốc - N lớp độc lập)
 */
export async function saveMultipleQuizziGamesToFirestore(games: QuizziGameItem[]): Promise<void> {
  if (!games || games.length === 0) return;

  const currentCached = getLocalCachedQuizziGames();
  const ctx = getCurrentAccessContext();
  const gameMap = new Map<string, QuizziGameItem>();
  currentCached.forEach((g) => gameMap.set(String(g.id), g));

  const allowedGamesToWrite: QuizziGameItem[] = [];
  games.forEach((g) => {
    const existing = gameMap.get(String(g.id));
    if (existing) {
      const perms = getContentPermissions(existing, ctx);
      if (!perms.canEdit) return;
    }
    const enriched = attachOwnershipOnCreate(g, existing);
    gameMap.set(String(enriched.id), enriched);
    allowedGamesToWrite.push(enriched);
  });

  setLocalCachedQuizziGames(Array.from(gameMap.values()));

  if (!db || allowedGamesToWrite.length === 0) return;

  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    allowedGamesToWrite.forEach((game) => {
      if (!game || !game.id) return;
      const docRef = doc(db, QUIZZI_GAMES_COLLECTION, String(game.id));
      const cleanData = sanitizeFirestorePayload({
        ...game,
        updatedAt: nowIso
      });
      batch.set(docRef, cleanData, { merge: true });
    });
    await batch.commit();
    invalidateQueryCache(QUIZZI_GAMES_COLLECTION);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_quizzi_games_updated'));
    }
  } catch (error) {
    console.error('Error batch saving Quizzi games to Firestore:', error);
    throw error;
  }
}

/**
 * Xóa vĩnh viễn 1 trò chơi Quizzi khỏi Firestore & lưu vết xóa cho thẻ mặc định nếu cần
 */
export async function deleteQuizziGameFromFirestore(gameId: string): Promise<void> {
  if (!gameId) return;

  const currentCached = getLocalCachedQuizziGames();
  const existing = currentCached.find((g) => String(g.id) === String(gameId));
  if (existing) {
    const ctx = getCurrentAccessContext();
    const perms = getContentPermissions(existing, ctx);
    if (!perms.canDelete) {
      console.warn('Permission denied: Only owner or admin can delete this Quizzi game.');
      return;
    }
  }

  const updatedLocal = currentCached.filter((g) => String(g.id) !== String(gameId));
  setLocalCachedQuizziGames(updatedLocal);

  if (typeof window !== 'undefined') {
    try {
      const savedDeleted = localStorage.getItem(LOCAL_DELETED_QUIZZI_KEY);
      const deletedList: string[] = savedDeleted ? JSON.parse(savedDeleted) : [];
      if (!deletedList.includes(gameId)) {
        const nextDeleted = [...deletedList, gameId];
        localStorage.setItem(LOCAL_DELETED_QUIZZI_KEY, JSON.stringify(nextDeleted));
      }
    } catch (e) {
      console.warn('Error updating deleted quizzi list in localStorage:', e);
    }
  }

  if (!db) return;

  try {
    await deleteDoc(doc(db, QUIZZI_GAMES_COLLECTION, String(gameId)));
    invalidateQueryCache(QUIZZI_GAMES_COLLECTION);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_quizzi_games_updated'));
    }
  } catch (error) {
    console.error(`Error deleting Quizzi game ${gameId} from Firestore:`, error);
    throw error;
  }
}

// ============================================================================
// 3. BACKWARDS-COMPATIBLE ALIASES & PUBLIC ROUTE HELPERS
// ============================================================================

export const getLocalCachedGames = getLocalCachedGameRooms;
export const setLocalCachedGames = setLocalCachedGameRooms;
export const fetchGamesFromFirestore = fetchGameRoomsFromFirestore;
export const subscribeToGamesFromFirestore = subscribeToGameRoomsFromFirestore;
export const saveGameToFirestore = saveGameRoomToFirestore;
export const saveMultipleGamesToFirestore = saveMultipleGameRoomsToFirestore;
export const deleteGameFromFirestore = deleteGameRoomFromFirestore;

/**
 * Trích xuất ID trò chơi từ đường dẫn URL công khai (ví dụ: /game/[id] hoặc ?gameId=[id])
 */
export function extractGameIdFromPath(pathname?: string, search?: string): string | null {
  if (typeof window === 'undefined' && !pathname) return null;
  try {
    const currentPath = pathname ?? window.location.pathname;
    const currentSearch = search ?? window.location.search;

    const match = currentPath.match(/\/game\/([^/?#]+)/i);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }

    if (currentSearch) {
      const params = new URLSearchParams(currentSearch);
      const idParam = params.get('gameId') || params.get('game_id');
      if (idParam && idParam.trim()) {
        return idParam.trim();
      }
    }
  } catch (err) {
    console.warn('Error extracting gameId from path:', err);
  }
  return null;
}

