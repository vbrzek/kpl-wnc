// Herní stavy
export type GameStatus = 'LOBBY' | 'SELECTION' | 'JUDGING' | 'RESULTS';

// Hráč
export interface Player {
  id: string;           // player token (UUID, stable across reconnects)
  socketId: string | null;  // current socket.id, null = offline
  nickname: string;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
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
  winnerId: string;
  winnerNickname: string;
  winningCards: WhiteCard[];
  scores: Record<string, number>;
}

export interface GameStateSync {
  blackCard: BlackCard;
  czarId: string | null;
  roundNumber: number;
  hand: WhiteCard[];               // prázdné pro czara
  submissions: AnonymousSubmission[]; // neprázdné jen pro czara ve fázi JUDGING
}

// Sada karet
export interface CardSet {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;  // Fix 1: nullable — DB column has no NOT NULL constraint
  isPublic: boolean;
}

// Herní místnost
export interface GameRoom {
  code: string;           // 6-char hex token (a-f0-9)
  status: GameStatus;
  hostId: string;         // player.id of the host
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  players: Player[];
  currentBlackCard: BlackCard | null;
  roundNumber: number;
}

// Zkrácený přehled pro seznam veřejných stolů
export interface PublicRoomSummary {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

// Socket.io eventy — server → klient
export interface ServerToClientEvents {
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
    settings: { name?: string; isPublic?: boolean; selectedSetIds?: number[]; maxPlayers?: number },
    callback: (result: { room: GameRoom } | { error: string }) => void
  ) => void;
  'lobby:kickPlayer': (
    playerId: string,
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:startGame': (
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  // Fix 2: removed 'game:join' — duplicates 'lobby:join' with weaker signature and no reconnection support
  // Fix 3: removed 'game:startGame' — duplicates 'lobby:startGame' with no callback and conflicting semantics
  'game:leave': () => void;
  'game:playCards': (cardIds: number[]) => void;
  'game:judgeSelect': (submissionId: string) => void;
  'game:retractCards': () => void;
}
