// Herní stavy
export type GameStatus = 'LOBBY' | 'SELECTION' | 'JUDGING' | 'RESULTS' | 'FINISHED';

// Speciální pravidla (House Rules)
export type SpecialRule =
  | 'rando_cardrissian'
  | 'wheatons_law'
  | 'rebooting_universe'
  | 'high_stakes'
  | 'carte_blanche';

// Czar Mode — nahrazuje god_mode a meritocracy ze SpecialRule
export type CzarMode = 'classic' | 'meritocracy' | 'god_mode' | 'czar_is_dead';

export type WinCondition = 'score' | 'time' | 'rounds';

// Hráč
export interface Player {
  id: string;
  isOnline: boolean;
  nickname: string;
  avatarUrl: string | null;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
  tradedThisRound: boolean;
  isAfk: boolean;
  oauthUserId?: number | null;
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
  isBlank?: true;
}

export const BLANK_CARD_ID = 0;

export interface GameRoundStart {
  blackCard: BlackCard;
  hand: WhiteCard[];
  czarId: string;
  roundNumber: number;
  czarMode: CzarMode;
}

export interface AnonymousSubmission {
  submissionId: string;
  cards: WhiteCard[];
}

export interface VoteResultEntry {
  submissionId: string;
  playerId: string;
  nickname: string;
  cards: WhiteCard[];
  voteCount: number;
}

export interface RoundResult {
  winnerId: string | null;        // null = kolo přeskočeno
  winnerNickname: string | null;
  winningCards: WhiteCard[];
  scores: Record<string, number>;
  winnerIds?: string[];           // czar_is_dead: více vítězů (remíza)
  voteResults?: VoteResultEntry[]; // czar_is_dead: výsledky hlasování
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
    avatarUrl: string | null;
    score: number;
    rank: number;      // 1 = vítěz
  }>;
  roomCode: string;
  trophiesAwarded?: Record<string, number>; // playerId → pohárky získané v této hře
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
  winCondition: WinCondition;      // výchozí: 'score'
  targetRounds: number;             // výchozí: 20 (pro 'rounds')
  gameTimeLimit: number;            // minuty, výchozí: 15 (pro 'time')
  gameStartedAt: number | null;     // ms timestamp, nastaven při startGame
  czarMode: CzarMode;                       // výchozí: 'classic'
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
  'game:trophiesAwarded': (trophiesAwarded: Record<string, number>) => void;
  'game:blackCardCandidates': (cards: BlackCard[]) => void;
  'game:voteUpdate': (data: { votedCount: number; totalVoters: number }) => void;
  'game:mySubmissionId': (submissionId: string) => void;
  'room:deleted': () => void;
  'friend:request_received': (data: { friendshipId: number; fromNick: string; fromAvatarUrl: string | null }) => void;
  'friend:request_accepted': (data: { friendshipId: number; byNick: string; byAvatarUrl: string | null }) => void;
  'friend:invite_received': (data: { roomCode: string; roomName: string; fromNick: string }) => void;
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
      avatarUrl?: string | null;
      targetScore: number;
      specialRules: SpecialRule[];
      czarMode?: CzarMode;
      winCondition?: WinCondition;
      targetRounds?: number;
      gameTimeLimit?: number;
      guestId?: string;
    },
    callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
  ) => void;
  'lobby:join': (
    data: { code: string; nickname: string; avatarUrl?: string | null; playerToken?: string; guestId?: string },
    callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
  ) => void;
  'lobby:updateAvatar': (avatarUrl: string | null) => void;
  // Propíše novou přezdívku do všech místností, kde má klient (guestId)
  // instanci hráče — funguje i mimo pohled na místnost
  'profile:updateNickname': (
    data: { guestId: string; nickname: string },
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:subscribePublic': () => void;
  'lobby:unsubscribePublic': () => void;
  // playerToken slouží jako fallback identifikace, když socket ještě nemá
  // obnovené mapování (např. leave hned po auto-reconnectu)
  'lobby:leave': (data?: { playerToken?: string }) => void;
  'lobby:updateSettings': (
    settings: { name?: string; isPublic?: boolean; selectedSetIds?: number[]; maxPlayers?: number; specialRules?: SpecialRule[]; czarMode?: CzarMode; winCondition?: WinCondition; targetScore?: number; targetRounds?: number; gameTimeLimit?: number },
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
  'game:playCards': (data: { cardIds: number[]; blankCardText?: string }) => void;
  'game:judgeSelect': (submissionId: string) => void;
  'game:retractCards': () => void;
  'game:tradeCards': () => void;
  'game:czarForceAdvance': () => void;
  'game:skipCzarJudging': () => void;
  'game:chooseBlackCard': (cardId: number) => void;
  'game:placeBet': (amount: number, callback: (result: { ok: true } | { error: string }) => void) => void;
  'game:vote': (submissionId: string) => void;
  'game:skipVoting': () => void;
  'friend:invite': (data: { friendUserId: number; roomCode: string }) => void;
}

// ── Editor types ──────────────────────────────────────────────────────────────

export interface UserCardSet {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  isOwn: boolean;
  ownerNickname: string | null;
  blackCount: number;
  whiteCount: number;
}

export interface EditorCard {
  id: number;
  type: 'black' | 'white';
  text: string;
  pick?: number; // only for black cards
}

export interface EditorCardsPage {
  cards: EditorCard[];
  total: number;
  page: number;
}

// ── Friends ───────────────────────────────────────────────────────────────────

export interface FriendEntry {
  friendshipId: number;
  userId: number;
  nickname: string;
  avatarUrl: string | null;
  trophies: number;
}

export interface FriendRequest {
  friendshipId: number;
  fromUserId: number;
  fromNick: string;
  fromAvatarUrl: string | null;
}

// ── Avatars ───────────────────────────────────────────────────────────────────

/** Single source of truth for DiceBear avatar URLs (frontend i backend). */
export function buildDiceBearUrl(style: string | null | undefined, seed: string | null | undefined): string {
  return `https://api.dicebear.com/9.x/${style || 'bottts'}/svg?seed=${encodeURIComponent(seed || 'default')}`;
}
