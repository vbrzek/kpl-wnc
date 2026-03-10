import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { socket } from '../socket';
import type { GameRoom, GameOverPayload, BlackCard, WhiteCard, AnonymousSubmission, RoundResult, SpecialRule, WinCondition } from '@kpl/shared';

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
  const roundSkipped = ref(false);
  const finishedState = ref<GameOverPayload | null>(null);

  const myBet = ref<number | null>(null);

  const isHost = computed(() =>
    room.value !== null && myPlayerId.value !== null
      ? room.value.hostId === myPlayerId.value
      : false
  );

  const specialRules = computed(() => room.value?.specialRules ?? []);
  const hasRule = (rule: SpecialRule) => specialRules.value.includes(rule);
  const blackCardCandidates = computed(() => room.value?.blackCardCandidates ?? null);

  const me = computed(() =>
    room.value && myPlayerId.value
      ? room.value.players.find(p => p.id === myPlayerId.value) ?? null
      : null
  );

  const isCardCzar = computed(() =>
    // czarId is set by game:roundStart (deferred in Wheaton's Law); fall back to
    // me.isCardCzar from lobby:stateUpdate which arrives immediately on round start.
    (myPlayerId.value !== null && czarId.value === myPlayerId.value) ||
    !!me.value?.isCardCzar
  );

  let initialised = false;

  function init() {
    if (initialised) return;
    initialised = true;

    socket.on('lobby:stateUpdate', (updatedRoom) => {
      room.value = updatedRoom;
      // During Wheaton's Law waiting phase game:roundStart is deferred, so czarId.value
      // retains the previous round's value. Sync it immediately from player flags to
      // prevent the old czar from passing the czarId.value === myPlayerId check.
      if (updatedRoom.blackCardCandidates) {
        const czar = updatedRoom.players.find(p => p.isCardCzar);
        if (czar) czarId.value = czar.id;
      }
    });

    socket.on('lobby:kicked', () => {
      if (room.value?.code) {
        localStorage.removeItem(`playerToken_${room.value.code}`);
      }
      room.value = null;
      myPlayerId.value = null;
    });

    socket.on('game:roundStart', (data) => {
      roundSkipped.value = false;
      hand.value = data.hand;
      currentBlackCard.value = data.blackCard;
      czarId.value = data.czarId;
      submissions.value = [];
      roundResult.value = null;
      selectedCards.value = [];
      lastPlayedCards.value = [];
      myBet.value = null;
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
      czarId.value = data.czarId;
      hand.value = data.hand;
      selectedCards.value = [];
      roundResult.value = null;
      submissions.value = data.submissions;
    });

    socket.on('game:roundSkipped', () => {
      roundSkipped.value = true;
    });

    socket.on('game:gameOver', (payload) => {
      finishedState.value = payload;
    });

    socket.on('room:deleted', () => {
      finishedState.value = null;
      room.value = null;
      myPlayerId.value = null;
    });

    socket.on('game:blackCardCandidates', (cards) => {
      if (room.value) room.value.blackCardCandidates = cards;
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
    specialRules?: SpecialRule[];
    winCondition?: WinCondition;
    targetScore?: number;
    targetRounds?: number;
    gameTimeLimit?: number;
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

  async function endGame(): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:endGame', (result) => {
        resolve('error' in result ? result : null);
      });
    });
  }

  async function updateNickname(newNickname: string): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:updateNickname', newNickname, (result) => {
        resolve('error' in result ? result : null);
      });
    });
  }

  function updateAvatar(avatarUrl: string | null) {
    if (!room.value) return;
    socket.emit('lobby:updateAvatar', avatarUrl);
  }

  function clearFinishedState() {
    finishedState.value = null;
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

  function tradeCards() {
    socket.emit('game:tradeCards');
    selectedCards.value = [];
  }

  function judgeSelect(submissionId: string) {
    socket.emit('game:judgeSelect', submissionId);
  }

  function czarForceAdvance() {
    socket.emit('game:czarForceAdvance');
  }

  function skipCzarJudging() {
    socket.emit('game:skipCzarJudging');
  }

  function chooseBlackCard(cardId: number) {
    socket.emit('game:chooseBlackCard', cardId);
  }

  function setMyBet(amount: number | null) {
    myBet.value = amount;
  }

  async function placeBet(amount: number): Promise<{ error: string } | null> {
    return new Promise(resolve => {
      socket.emit('game:placeBet', amount, (result) => {
        if ('error' in result) resolve(result);
        else resolve(null);
      });
    });
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
    socket.off('game:roundSkipped');
    socket.off('game:gameOver');
    socket.off('room:deleted');
    socket.off('game:blackCardCandidates');
    finishedState.value = null;
    room.value = null;
    myPlayerId.value = null;
    hand.value = [];
    currentBlackCard.value = null;
    czarId.value = null;
    submissions.value = [];
    roundResult.value = null;
    selectedCards.value = [];
    lastPlayedCards.value = [];
    roundSkipped.value = false;
    initialised = false;
  }

  return {
    room, myPlayerId, isHost, me,
    hand, currentBlackCard, czarId, submissions, roundResult, selectedCards, isCardCzar,
    roundSkipped, finishedState,
    specialRules, hasRule, blackCardCandidates, myBet, setMyBet,
    init, setRoom, setMyPlayerId, leave,
    updateSettings, kickPlayer, startGame, endGame, updateNickname, updateAvatar, clearFinishedState, cleanup,
    playCards, judgeSelect, toggleCardSelection, retractCards, tradeCards, czarForceAdvance, skipCzarJudging,
    chooseBlackCard, placeBet,
  };
});
