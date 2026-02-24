// Herní stavy
export type GameStatus = 'LOBBY' | 'SELECTION' | 'JUDGING' | 'RESULTS';

// Hráč
export interface Player {
  id: string;
  nickname: string;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
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
  code: string;
  status: GameStatus;
  players: Player[];
  currentBlackCard: BlackCard | null;
  roundNumber: number;
}

// Socket.io eventy - server → klient
export interface ServerToClientEvents {
  'game:stateUpdate': (room: GameRoom) => void;
  'game:error': (message: string) => void;
  'game:roundStart': (blackCard: BlackCard) => void;
  'game:judging': (submissions: Array<{ playerId: string; cards: WhiteCard[] }>) => void;
  'game:roundEnd': (winnerId: string, winnerCards: WhiteCard[]) => void;
}

// Socket.io eventy - klient → server
export interface ClientToServerEvents {
  'game:join': (code: string, nickname: string, callback: (success: boolean, error?: string) => void) => void;
  'game:leave': () => void;
  'game:startGame': (selectedSetIds: number[]) => void;
  'game:playCards': (cardIds: number[]) => void;
  'game:judgeSelect': (playerId: string) => void;
}
