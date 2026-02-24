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

// Sada karet
export interface CardSet {
  id: number;
  name: string;
  description: string | null;
  slug: string;
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
  'game:stateUpdate': (room: GameRoom) => void;
  'game:error': (message: string) => void;
  'game:roundStart': (blackCard: BlackCard) => void;
  'game:judging': (submissions: Array<{ playerId: string; cards: WhiteCard[] }>) => void;
  'game:roundEnd': (winnerId: string, winnerCards: WhiteCard[]) => void;
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
  'game:join': (code: string, nickname: string, callback: (success: boolean, error?: string) => void) => void;
  'game:leave': () => void;
  'game:startGame': (selectedSetIds: number[]) => void;
  'game:playCards': (cardIds: number[]) => void;
  'game:judgeSelect': (playerId: string) => void;
}
