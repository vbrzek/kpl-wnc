import { defineStore } from 'pinia';
import { ref } from 'vue';
import { socket } from '../socket';
import type { PublicRoomSummary, GameRoom, SpecialRule, WinCondition, CzarMode } from '@kpl/shared';
import { useProfileStore } from './profileStore';
import { getGuestId, savePlayerToken, loadPlayerToken } from './playerIdentity';

export { savePlayerToken, loadPlayerToken } from './playerIdentity';

export interface CardSetSummary {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  isPublic: boolean;
  blackCardCount: number;
  whiteCardCount: number;
}

export interface RoomPreview {
  code: string;
  name: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  players: { nickname: string; isAfk: boolean }[];
  selectedSetIds: number[];
  specialRules?: SpecialRule[];
}

/**
 * Vrací null jen při 404 (místnost neexistuje); ostatní chyby (výpadek
 * backendu, 5xx…) vyhazují — volající je nesmí zaměnit za „místnost zanikla“.
 */
export async function fetchRoomPreview(code: string): Promise<RoomPreview | null> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
  const res = await fetch(`${backendUrl}/api/rooms/${code}/preview`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Room preview failed: ${res.status}`);
  return res.json() as Promise<RoomPreview>;
}

export const useLobbyStore = defineStore('lobby', () => {
  const publicRooms = ref<PublicRoomSummary[]>([]);
  const isSubscribed = ref(false);
  const cardSets = ref<CardSetSummary[]>([]);
  const cardSetsLoaded = ref(false);

  function subscribe() {
    if (isSubscribed.value) return;
    socket.emit('lobby:subscribePublic');
    socket.on('lobby:publicRoomsUpdate', (rooms) => {
      publicRooms.value = rooms;
    });
    isSubscribed.value = true;
  }

  function unsubscribe() {
    if (!isSubscribed.value) return;
    socket.emit('lobby:unsubscribePublic');
    socket.off('lobby:publicRoomsUpdate');
    isSubscribed.value = false;
  }

  async function fetchCardSets(): Promise<void> {
    if (cardSetsLoaded.value) return;
    const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
    const res = await fetch(`${backendUrl}/api/card-sets`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to fetch card sets: ${res.status}`);
    cardSets.value = await res.json() as CardSetSummary[];
    cardSetsLoaded.value = true;
  }

  async function createRoom(settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    nickname: string;
    targetScore: number;
    specialRules: SpecialRule[];
    czarMode?: CzarMode;
    winCondition?: WinCondition;
    targetRounds?: number;
    gameTimeLimit?: number;
  }): Promise<{ room: GameRoom; code: string; playerToken: string; playerId: string } | { error: string }> {
    const profileStore = useProfileStore();
    return new Promise((resolve) => {
      socket.emit('lobby:create', { ...settings, avatarUrl: profileStore.avatarUrl, guestId: getGuestId() }, (result) => {
        if ('error' in result) {
          resolve(result);
        } else {
          savePlayerToken(result.room.code, result.playerToken);
          resolve({ room: result.room, code: result.room.code, playerToken: result.playerToken, playerId: result.playerId });
        }
      });
    });
  }

  async function joinRoom(
    code: string,
    nickname: string
  ): Promise<{ room: GameRoom; code: string; playerToken: string; playerId: string } | { error: string }> {
    const profileStore = useProfileStore();
    const playerToken = loadPlayerToken(code) ?? undefined;
    return new Promise((resolve) => {
      socket.emit(
        'lobby:join',
        { code, nickname, avatarUrl: profileStore.avatarUrl, playerToken, guestId: getGuestId() },
        (result) => {
          if ('error' in result) {
            resolve(result);
          } else {
            savePlayerToken(result.room.code, result.playerToken);
            resolve({ room: result.room, code: result.room.code, playerToken: result.playerToken, playerId: result.playerId });
          }
        }
      );
    });
  }

  return { publicRooms, cardSets, cardSetsLoaded, subscribe, unsubscribe, createRoom, joinRoom, fetchCardSets };
});
