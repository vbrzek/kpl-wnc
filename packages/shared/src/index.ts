// Herní stavy
export type GameStatus = 'LOBBY' | 'SELECTION' | 'JUDGING' | 'RESULTS' | 'FINISHED';

// Speciální pravidla (House Rules)
export type SpecialRule =
  | 'rando_cardrissian'
  | 'god_mode'
  | 'wheatons_law'
  | 'rebooting_universe'
  | 'meritocracy'
  | 'high_stakes';

// Hráč
export interface Player {
  id: string;
  socketId: string | null;
  isOnline: boolean;
  nickname: string;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
  tradedThisRound: boolean;
  isAfk: boolean;
}

// Karty
export interface BlackCard {
  id: number;
  text: string;
  pick: number;
}

export interface WhiteCard {
  id: number;
  text: string;
}

export interface GameRoundStart {
  blackCard: BlackCard;
  hand: WhiteCard[];
  czarId: string;
  roundNumber: number;
}

export interface AnonymousSubmission {
  submissionId: string;
  cards: WhiteCard[];
}

export interface RoundResult {
  winnerId: string | null;        // null = kolo přeskočeno
  winnerNickname: string | null;
  winningCards: WhiteCard[];
  scores: Record<string, number>;
}

export interface GameStateSync {
  blackCard: BlackCard;
  czarId: string | null;
  roundNumber: number;
  hand: WhiteCard[];
  submissions: AnonymousSubmission[];
}

// Sada karet
export interface CardSet {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  isPublic: boolean;
}

// Výsledky po konci hry
export interface GameOverPayload {
  finalScores: Array<{
    playerId: string;
    nickname: string;
    score: number;
    rank: number;      // 1 = vítěz
  }>;
  roomCode: string;
}

// Herní místnost
export interface GameRoom {
  code: string;
  status: GameStatus;
  hostId: string;
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  players: Player[];
  currentBlackCard: BlackCard | null;
  roundNumber: number;
  roundDeadline: number | null;   // Unix ms timestamp, null = žádný aktivní timer
  targetScore: number;            // výherní podmínka: 8 | 10 | 15 | 20 | 30
  specialRules: SpecialRule[];              // [] = žádná speciální pravidla
  blackCardCandidates: BlackCard[] | null;  // Wheaton's Law: czar vybírá černou kartu
  lastActivityAt: number;         // Unix ms timestamp poslední akce (pro GC)
}

// Zkrácený přehled pro seznam veřejných stolů
export interface PublicRoomSummary {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  selectedSetIds: number[];
  specialRules: SpecialRule[];
}

// Socket.io eventy — server → klient
export interface ServerToClientEvents {
  'server:hello': (startupId: number) => void;
  'server:clientCount': (count: number) => void;
  'lobby:stateUpdate': (room: GameRoom) => void;
  'lobby:kicked': () => void;
  'lobby:publicRoomsUpdate': (rooms: PublicRoomSummary[]) => void;
  'game:error': (message: string) => void;
  'game:roundStart': (data: GameRoundStart) => void;
  'game:judging': (submissions: AnonymousSubmission[]) => void;
  'game:roundEnd': (result: RoundResult) => void;
  'game:handUpdate': (hand: WhiteCard[]) => void;
  'game:stateSync': (data: GameStateSync) => void;
  'game:roundSkipped': () => void;  // kolo přeskočeno bez bodu (timeout)
  'game:gameOver': (payload: GameOverPayload) => void;
  'game:blackCardCandidates': (cards: BlackCard[]) => void;
  'room:deleted': () => void;
}

// Socket.io eventy — klient → server
export interface ClientToServerEvents {
  'lobby:create': (
    settings: {
      name: string;
      isPublic: boolean;
      selectedSetIds: number[];
      maxPlayers: number;
      nickname: string;
      targetScore: number;
      specialRules: SpecialRule[];
    },
    callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
  ) => void;
  'lobby:join': (
    data: { code: string; nickname: string; playerToken?: string },
    callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
  ) => void;
  'lobby:subscribePublic': () => void;
  'lobby:unsubscribePublic': () => void;
  'lobby:leave': () => void;
  'lobby:updateSettings': (
    settings: { name?: string; isPublic?: boolean; selectedSetIds?: number[]; maxPlayers?: number; specialRules?: SpecialRule[] },
    callback: (result: { room: GameRoom } | { error: string }) => void
  ) => void;
  'lobby:kickPlayer': (
    playerId: string,
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:startGame': (
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:endGame': (
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:updateNickname': (
    nickname: string,
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'game:leave': () => void;
  'game:playCards': (cardIds: number[]) => void;
  'game:judgeSelect': (submissionId: string) => void;
  'game:retractCards': () => void;
  'game:tradeCards': () => void;
  'game:czarForceAdvance': () => void;
  'game:skipCzarJudging': () => void;
  'game:chooseBlackCard': (cardId: number) => void;
  'game:placeBet': (amount: number, callback: (result: { ok: true } | { error: string }) => void) => void;
}
