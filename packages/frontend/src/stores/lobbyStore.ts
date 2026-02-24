import { defineStore } from 'pinia';
import { ref } from 'vue';
import { socket } from '../socket';
import type { PublicRoomSummary, GameRoom } from '@kpl/shared';

export interface CardSetSummary {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  isPublic: boolean;
  blackCardCount: number;
  whiteCardCount: number;
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
    const res = await fetch(`${backendUrl}/api/card-sets`);
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
  }): Promise<{ room: GameRoom; code: string; playerToken: string; playerId: string } | { error: string }> {
    return new Promise((resolve) => {
      socket.emit('lobby:create', settings, (result) => {
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
    const playerToken = loadPlayerToken(code) ?? undefined;
    return new Promise((resolve) => {
      socket.emit(
        'lobby:join',
        { code, nickname, playerToken },
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

  return { publicRooms, cardSets, subscribe, unsubscribe, createRoom, joinRoom, fetchCardSets };
});

export function savePlayerToken(roomCode: string, token: string) {
  localStorage.setItem(`playerToken_${roomCode}`, token);
}

export function loadPlayerToken(roomCode: string): string | null {
  return localStorage.getItem(`playerToken_${roomCode}`);
}
