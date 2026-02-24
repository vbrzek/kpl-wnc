import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { socket } from '../socket';
import type { GameRoom } from '@kpl/shared';

export const useRoomStore = defineStore('room', () => {
  const room = ref<GameRoom | null>(null);
  const myPlayerId = ref<string | null>(null);

  const isHost = computed(() =>
    room.value !== null && myPlayerId.value !== null
      ? room.value.hostId === myPlayerId.value
      : false
  );

  const me = computed(() =>
    room.value && myPlayerId.value
      ? room.value.players.find(p => p.id === myPlayerId.value) ?? null
      : null
  );

  function init(roomCode: string) {
    socket.on('lobby:stateUpdate', (updatedRoom) => {
      room.value = updatedRoom;
    });

    socket.on('lobby:kicked', () => {
      room.value = null;
      myPlayerId.value = null;
    });
  }

  function setRoom(joinedRoom: GameRoom) {
    room.value = joinedRoom;
  }

  function setMyPlayerId(id: string) {
    myPlayerId.value = id;
  }

  async function leave() {
    return new Promise<void>((resolve) => {
      socket.emit('lobby:leave');
      room.value = null;
      myPlayerId.value = null;
      resolve();
    });
  }

  async function updateSettings(settings: {
    name?: string;
    isPublic?: boolean;
    selectedSetIds?: number[];
    maxPlayers?: number;
  }): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:updateSettings', settings, (result) => {
        resolve('error' in result ? result : null);
      });
    });
  }

  async function kickPlayer(playerId: string): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:kickPlayer', playerId, (result) => {
        resolve('error' in result ? result : null);
      });
    });
  }

  async function startGame(): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:startGame', (result) => {
        resolve('error' in result ? result : null);
      });
    });
  }

  function cleanup() {
    socket.off('lobby:stateUpdate');
    socket.off('lobby:kicked');
    room.value = null;
    myPlayerId.value = null;
  }

  return {
    room, myPlayerId, isHost, me,
    init, setRoom, setMyPlayerId, leave,
    updateSettings, kickPlayer, startGame, cleanup,
  };
});
