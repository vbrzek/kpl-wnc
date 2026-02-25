import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { socket } from '../socket';
import type { GameRoom, BlackCard, WhiteCard, AnonymousSubmission, RoundResult } from '@kpl/shared';

export const useRoomStore = defineStore('room', () => {
  const room = ref<GameRoom | null>(null);
  const myPlayerId = ref<string | null>(null);

  const hand = ref<WhiteCard[]>([]);
  const currentBlackCard = ref<BlackCard | null>(null);
  const czarId = ref<string | null>(null);
  const submissions = ref<AnonymousSubmission[]>([]);
  const roundResult = ref<RoundResult | null>(null);
  const selectedCards = ref<WhiteCard[]>([]);
  const lastPlayedCards = ref<WhiteCard[]>([]);

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

  const isCardCzar = computed(() =>
    myPlayerId.value !== null && czarId.value === myPlayerId.value
  );

  let initialised = false;

  function init() {
    if (initialised) return;
    initialised = true;

    socket.on('lobby:stateUpdate', (updatedRoom) => {
      room.value = updatedRoom;
    });

    socket.on('lobby:kicked', () => {
      room.value = null;
      myPlayerId.value = null;
    });

    socket.on('game:roundStart', (data) => {
      hand.value = data.hand;
      currentBlackCard.value = data.blackCard;
      czarId.value = data.czarId;
      submissions.value = [];
      roundResult.value = null;
      selectedCards.value = [];
      lastPlayedCards.value = [];
    });

    socket.on('game:judging', (subs) => {
      submissions.value = subs;
    });

    socket.on('game:roundEnd', (result) => {
      roundResult.value = result;
    });

    socket.on('game:handUpdate', (newHand) => {
      hand.value = newHand;
      selectedCards.value = lastPlayedCards.value.filter(c => newHand.some(h => h.id === c.id));
      lastPlayedCards.value = [];
    });

    socket.on('game:stateSync', (data) => {
      currentBlackCard.value = data.blackCard;
      czarId.value = data.czarId || null;
      hand.value = data.hand;
      selectedCards.value = [];
      roundResult.value = null;
      if (data.submissions.length > 0) {
        submissions.value = data.submissions;
      }
    });
  }

  function setRoom(joinedRoom: GameRoom) {
    room.value = joinedRoom;
  }

  function setMyPlayerId(id: string) {
    myPlayerId.value = id;
  }

  function leave() {
    socket.emit('lobby:leave');
    cleanup();
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

  function playCards(cardIds: number[]) {
    lastPlayedCards.value = [...selectedCards.value];
    socket.emit('game:playCards', cardIds);
    selectedCards.value = [];
  }

  function retractCards() {
    socket.emit('game:retractCards');
    selectedCards.value = [];
  }

  function judgeSelect(submissionId: string) {
    socket.emit('game:judgeSelect', submissionId);
  }

  function toggleCardSelection(card: WhiteCard) {
    const idx = selectedCards.value.findIndex(c => c.id === card.id);
    if (idx === -1) {
      const limit = currentBlackCard.value?.pick ?? 1;
      if (selectedCards.value.length >= limit) return;
      selectedCards.value.push(card);
    } else {
      selectedCards.value.splice(idx, 1);
    }
  }

  function cleanup() {
    socket.off('lobby:stateUpdate');
    socket.off('lobby:kicked');
    socket.off('game:roundStart');
    socket.off('game:judging');
    socket.off('game:roundEnd');
    socket.off('game:handUpdate');
    socket.off('game:stateSync');
    room.value = null;
    myPlayerId.value = null;
    hand.value = [];
    currentBlackCard.value = null;
    czarId.value = null;
    submissions.value = [];
    roundResult.value = null;
    selectedCards.value = [];
    lastPlayedCards.value = [];
    initialised = false;
  }

  return {
    room, myPlayerId, isHost, me,
    hand, currentBlackCard, czarId, submissions, roundResult, selectedCards, isCardCzar,
    init, setRoom, setMyPlayerId, leave,
    updateSettings, kickPlayer, startGame, cleanup,
    playCards, judgeSelect, toggleCardSelection, retractCards,
  };
});
