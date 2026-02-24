import { defineStore } from 'pinia';
import { ref } from 'vue';
import { socket } from '../socket';
import type { PublicRoomSummary } from '@kpl/shared';

export const useLobbyStore = defineStore('lobby', () => {
  const publicRooms = ref<PublicRoomSummary[]>([]);
  const isSubscribed = ref(false);

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

  async function createRoom(settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    nickname: string;
  }): Promise<{ code: string; playerToken: string; playerId: string } | { error: string }> {
    return new Promise((resolve) => {
      socket.emit('lobby:create', settings, (result) => {
        if ('error' in result) {
          resolve(result);
        } else {
          savePlayerToken(result.room.code, result.playerToken);
          resolve({ code: result.room.code, playerToken: result.playerToken, playerId: result.playerId });
        }
      });
    });
  }

  async function joinRoom(
    code: string,
    nickname: string
  ): Promise<{ code: string; playerToken: string; playerId: string } | { error: string }> {
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
            resolve({ code: result.room.code, playerToken: result.playerToken, playerId: result.playerId });
          }
        }
      );
    });
  }

  return { publicRooms, subscribe, unsubscribe, createRoom, joinRoom };
});

export function savePlayerToken(roomCode: string, token: string) {
  localStorage.setItem(`playerToken_${roomCode}`, token);
}

export function loadPlayerToken(roomCode: string): string | null {
  return localStorage.getItem(`playerToken_${roomCode}`);
}
