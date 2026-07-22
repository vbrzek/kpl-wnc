import { randomBytes, randomUUID } from 'crypto';
import type { GameRoom, GameOverPayload, Player, PublicRoomSummary, SpecialRule, WinCondition, CzarMode } from '@kpl/shared';
import { GameEngine, type EngineSnapshot } from './GameEngine.js';

export interface ManagerSnapshot {
  savedAt: number;
  rooms: Array<{ room: GameRoom; engine: EngineSnapshot | null }>;
  playerRooms: Record<string, string>;
  tokenToPlayerId: Record<string, string>;
  // `${code}:${guestId}` → playerToken; optional kvůli starším snapshotům
  guestKeyToToken?: Record<string, string>;
}

// --- Room code generator ---

const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars: A-Z + 2-9, no 0/O/1/I/L

function generateRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, b => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
}

function guestKey(code: string, guestId: string): string {
  return `${code}:${guestId}`;
}

// --- Result types ---

export interface JoinSuccess {
  room: GameRoom;
  playerToken: string;
  wasReconnect: boolean;
}

export interface ErrorResult {
  error: string;
}

export type JoinResult = JoinSuccess | ErrorResult;

export interface KickSuccess {
  room: GameRoom;
  kickedPlayerToken: string;
}

export type KickResult = KickSuccess | ErrorResult;

export interface ActionSuccess {
  room: GameRoom;
}

export type ActionResult = ActionSuccess | ErrorResult;

// --- Settings types ---

export interface CreateRoomSettings {
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
}

export interface FinishGameResult {
  room: GameRoom;
  payload: GameOverPayload;
  kickedTokens: string[];
  roundNumber: number;
  playerTokenMap: Map<string, string>;
}

export interface UpdateSettingsData {
  name?: string;
  isPublic?: boolean;
  selectedSetIds?: number[];
  maxPlayers?: number;
  specialRules?: SpecialRule[];
  czarMode?: CzarMode;
  winCondition?: WinCondition;
  targetScore?: number;
  targetRounds?: number;
  gameTimeLimit?: number;
}

// --- RoomManager ---

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  // playerToken → roomCode
  private playerRooms: Map<string, string> = new Map();
  // playerToken → player.id
  private tokenToPlayerId: Map<string, string> = new Map();
  // playerToken → AFK timer handle
  private afkTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // Trvalá identita klienta: `${code}:${guestId}` → playerToken (a inverz pro úklid)
  private guestKeyToToken: Map<string, string> = new Map();
  private tokenToGuestKey: Map<string, string> = new Map();
  // playerToken → timestamp odpojení (pro GC mrtvých instancí v LOBBY)
  private offlineSince: Map<string, number> = new Map();
  private readonly _playerSocketIds = new Map<string, string>(); // playerId → socket.id
  private engines = new Map<string, GameEngine>();
  private roundTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private judgingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // ------------------------------------------------------------------ createRoom

  createRoom(settings: CreateRoomSettings): { room: GameRoom; playerToken: string } {
    const code = generateRoomCode();
    const playerId = randomUUID();
    const playerToken = randomUUID();

    const host: Player = {
      id: playerId,
      isOnline: true,
      nickname: settings.nickname,
      avatarUrl: settings.avatarUrl ?? null,
      score: 0,
      isCardCzar: false,
      hasPlayed: false,
      tradedThisRound: false,
      isAfk: false,
    };

    const room: GameRoom = {
      code,
      status: 'LOBBY',
      hostId: playerId,
      name: settings.name,
      isPublic: settings.isPublic,
      selectedSetIds: settings.selectedSetIds,
      maxPlayers: settings.maxPlayers,
      players: [host],
      currentBlackCard: null,
      blackCardCandidates: null,
      roundNumber: 0,
      roundDeadline: null,
      targetScore: settings.targetScore,
      winCondition: settings.winCondition ?? 'score',
      targetRounds: settings.targetRounds ?? 20,
      gameTimeLimit: settings.gameTimeLimit ?? 15,
      gameStartedAt: null,
      czarMode: settings.czarMode ?? 'classic',
      specialRules: settings.specialRules,
      lastActivityAt: Date.now(),
    };

    this.rooms.set(code, room);
    this.playerRooms.set(playerToken, code);
    this.tokenToPlayerId.set(playerToken, playerId);
    if (settings.guestId) this.registerGuestId(code, settings.guestId, playerToken);

    return { room, playerToken };
  }

  // ------------------------------------------------------------------ joinRoom

  joinRoom(code: string, nickname: string, playerToken?: string, avatarUrl?: string | null, guestId?: string): JoinResult {
    const room = this.rooms.get(code);
    if (!room) {
      return { error: 'Místnost nebyla nalezena.' };
    }

    // Reconnect path 1: legacy playerToken mapovaný na tuto místnost
    if (playerToken && this.playerRooms.get(playerToken) === code) {
      const result = this.reconnectWithAvatar(playerToken, avatarUrl);
      if (result) {
        // Migrace: klient už posílá guestId → zaregistruj ho k existující instanci
        if (guestId && !this.guestKeyToToken.has(guestKey(code, guestId))) {
          this.registerGuestId(code, guestId, playerToken);
        }
        return result;
      }
    }

    // Reconnect path 2: trvalá identita klienta (guestId) — přežije ztrátu tokenu
    if (guestId) {
      const knownToken = this.guestKeyToToken.get(guestKey(code, guestId));
      if (knownToken) {
        const result = this.reconnectWithAvatar(knownToken, avatarUrl);
        if (result) return result;
      }
    }

    // Reject empty nickname for new player (only reconnects may pass empty nickname)
    if (!nickname.trim()) {
      return { error: 'Přezdívka nesmí být prázdná.' };
    }

    if (room.status !== 'LOBBY') {
      return { error: 'Hra již začala.' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { error: 'Místnost je plná.' };
    }

    const duplicate = room.players.some(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (duplicate) {
      return { error: 'Přezdívka je již obsazena.' };
    }

    const playerId = randomUUID();
    const newToken = randomUUID();

    const player: Player = {
      id: playerId,
      isOnline: true,
      nickname,
      avatarUrl: avatarUrl ?? null,
      score: 0,
      isCardCzar: false,
      hasPlayed: false,
      tradedThisRound: false,
      isAfk: false,
    };

    room.players.push(player);
    this.playerRooms.set(newToken, code);
    this.tokenToPlayerId.set(newToken, playerId);
    if (guestId) this.registerGuestId(code, guestId, newToken);

    return { room, playerToken: newToken, wasReconnect: false };
  }

  /** Reconnect + aktualizace avataru; vrátí null, když token nelze připojit. */
  private reconnectWithAvatar(playerToken: string, avatarUrl: string | null | undefined): JoinSuccess | null {
    const reconnected = this.reconnect(playerToken);
    if (!reconnected) return null;
    if (avatarUrl !== undefined) {
      const pid = this.tokenToPlayerId.get(playerToken);
      const p = reconnected.players.find(pl => pl.id === pid);
      if (p) p.avatarUrl = avatarUrl;
    }
    return { room: reconnected, playerToken, wasReconnect: true };
  }

  private registerGuestId(code: string, guestId: string, playerToken: string): void {
    const key = guestKey(code, guestId);
    this.guestKeyToToken.set(key, playerToken);
    this.tokenToGuestKey.set(playerToken, key);
  }

  private clearGuestMapping(playerToken: string): void {
    const key = this.tokenToGuestKey.get(playerToken);
    if (key !== undefined) {
      this.guestKeyToToken.delete(key);
      this.tokenToGuestKey.delete(playerToken);
    }
  }

  // ------------------------------------------------------------------ reconnect

  reconnect(playerToken: string): GameRoom | null {
    const code = this.playerRooms.get(playerToken);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    const playerId = this.tokenToPlayerId.get(playerToken);
    if (!playerId) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    // Clear AFK timer
    const timer = this.afkTimers.get(playerToken);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.afkTimers.delete(playerToken);
    }

    player.isOnline = true;
    player.isAfk = false;
    this.offlineSince.delete(playerToken);

    return room;
  }

  // ------------------------------------------------------------------ handleDisconnect

  handleDisconnect(playerToken: string): void {
    const code = this.playerRooms.get(playerToken);
    if (!code) return;

    const room = this.rooms.get(code);
    if (!room) return;

    const playerId = this.tokenToPlayerId.get(playerToken);
    if (!playerId) return;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    this.clearSocketIdByToken(playerToken);
    player.isOnline = false;
    this.offlineSince.set(playerToken, Date.now());

    // Clear any existing timer first
    const existing = this.afkTimers.get(playerToken);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      player.isAfk = true;
      this.afkTimers.delete(playerToken);
    }, 30_000);

    this.afkTimers.set(playerToken, timer);
  }

  // ------------------------------------------------------------------ leaveRoom

  leaveRoom(playerToken: string): { room: GameRoom | null } {
    const code = this.playerRooms.get(playerToken);
    if (!code) return { room: null };

    const room = this.rooms.get(code);
    if (!room) return { room: null };

    this.removePlayer(playerToken, room);

    // After removal, fetch potentially-deleted room
    const remaining = this.rooms.get(code) ?? null;
    return { room: remaining };
  }

  // ------------------------------------------------------------------ kickPlayer

  kickPlayer(hostToken: string, targetPlayerId: string): KickResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const hostPlayerId = this.tokenToPlayerId.get(hostToken);
    if (hostPlayerId !== room.hostId) {
      return { error: 'Pouze hostitel může vykopnout hráče.' };
    }

    // Find the target player's token
    let kickedPlayerToken: string | undefined;
    for (const [token, pid] of this.tokenToPlayerId.entries()) {
      if (pid === targetPlayerId && this.playerRooms.get(token) === code) {
        kickedPlayerToken = token;
        break;
      }
    }

    if (!kickedPlayerToken) {
      return { error: 'Hráč nebyl nalezen.' };
    }

    this.removePlayer(kickedPlayerToken, room);

    return { room, kickedPlayerToken };
  }

  // ------------------------------------------------------------------ updateSettings

  updateSettings(hostToken: string, settings: UpdateSettingsData): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const hostPlayerId = this.tokenToPlayerId.get(hostToken);
    if (hostPlayerId !== room.hostId) {
      return { error: 'Pouze hostitel může měnit nastavení.' };
    }

    if (
      settings.maxPlayers !== undefined &&
      settings.maxPlayers < room.players.length
    ) {
      return { error: 'Počet hráčů nesmí být nižší než aktuální počet hráčů.' };
    }

    if (settings.name !== undefined) room.name = settings.name;
    if (settings.isPublic !== undefined) room.isPublic = settings.isPublic;
    if (settings.selectedSetIds !== undefined) room.selectedSetIds = settings.selectedSetIds;
    if (settings.maxPlayers !== undefined) room.maxPlayers = settings.maxPlayers;
    if (settings.specialRules !== undefined) room.specialRules = settings.specialRules;
    if (settings.czarMode !== undefined) room.czarMode = settings.czarMode;
    if (settings.winCondition !== undefined) room.winCondition = settings.winCondition;
    if (settings.targetScore !== undefined) room.targetScore = settings.targetScore;
    if (settings.targetRounds !== undefined) room.targetRounds = settings.targetRounds;
    if (settings.gameTimeLimit !== undefined) room.gameTimeLimit = settings.gameTimeLimit;

    return { room };
  }

  // ------------------------------------------------------------------ updateNickname

  updateNickname(playerToken: string, newNickname: string): ActionResult {
    const code = this.playerRooms.get(playerToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const playerId = this.tokenToPlayerId.get(playerToken);
    if (!playerId) return { error: 'Hráč nenalezen.' };

    const player = room.players.find(p => p.id === playerId);
    if (!player) return { error: 'Hráč nenalezen.' };

    const trimmed = newNickname.trim();
    if (trimmed === player.nickname) return { room }; // no change

    const duplicate = room.players.some(
      p => p.id !== playerId && p.nickname.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) return { error: 'Přezdívka je již obsazena.' };

    player.nickname = trimmed;
    return { room };
  }

  // ------------------------------------------------------------------ updateAvatar

  updateAvatar(playerToken: string, avatarUrl: string | null): ActionResult {
    const code = this.playerRooms.get(playerToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const playerId = this.tokenToPlayerId.get(playerToken);
    if (!playerId) return { error: 'Hráč nenalezen.' };

    const player = room.players.find(p => p.id === playerId);
    if (!player) return { error: 'Hráč nenalezen.' };

    player.avatarUrl = avatarUrl;
    return { room };
  }

  // ------------------------------------------------------------------ setPlayerOAuthUserId

  setPlayerOAuthUserId(playerToken: string, userId: number): void {
    const code = this.playerRooms.get(playerToken);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const playerId = this.tokenToPlayerId.get(playerToken);
    if (!playerId) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.oauthUserId = userId;
  }

  // ------------------------------------------------------------------ startGame

  startGame(hostToken: string): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const hostPlayerId = this.tokenToPlayerId.get(hostToken);
    if (hostPlayerId !== room.hostId) {
      return { error: 'Pouze hostitel může spustit hru.' };
    }

    const activePlayers = room.players.filter((p) => !p.isAfk);
    if (activePlayers.length < 3) {
      return { error: 'Pro spuštění hry jsou potřeba alespoň 3 hráči.' };
    }

    if (room.selectedSetIds.length === 0) {
      return { error: 'Musí být vybrána alespoň jedna sada karet.' };
    }

    room.status = 'SELECTION';
    room.gameStartedAt = Date.now();
    return { room };
  }

  // ------------------------------------------------------------------ getPublicRooms

  getPublicRooms(): PublicRoomSummary[] {
    const result: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.status === 'LOBBY') {
        result.push({
          code: room.code,
          name: room.name,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
          selectedSetIds: room.selectedSetIds,
          specialRules: room.specialRules,
        });
      }
    }
    return result;
  }

  // ------------------------------------------------------------------ getRoom

  getRoom(code: string): GameRoom | null {
    return this.rooms.get(code) ?? null;
  }

  // ------------------------------------------------------------------ getRoomByPlayerToken

  getRoomByPlayerToken(playerToken: string): GameRoom | null {
    const code = this.playerRooms.get(playerToken);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  // ------------------------------------------------------------------ getPlayerIdByToken

  getPlayerIdByToken(playerToken: string): string | null {
    return this.tokenToPlayerId.get(playerToken) ?? null;
  }

  getSocketId(playerId: string): string | undefined {
    return this._playerSocketIds.get(playerId);
  }

  setSocketId(playerId: string, socketId: string): void {
    this._playerSocketIds.set(playerId, socketId);
  }

  clearSocketId(playerId: string): void {
    this._playerSocketIds.delete(playerId);
  }

  clearSocketIdByToken(playerToken: string): void {
    const playerId = this.tokenToPlayerId.get(playerToken);
    if (playerId) this._playerSocketIds.delete(playerId);
  }

  // ------------------------------------------------------------------ setGameEngine / getGameEngine

  setGameEngine(code: string, engine: GameEngine): void {
    this.engines.set(code, engine);
  }

  getGameEngine(code: string): GameEngine | null {
    return this.engines.get(code) ?? null;
  }

  // ------------------------------------------------------------------ round timer

  setRoundTimer(code: string, callback: () => void, ms: number): void {
    this.clearRoundTimer(code);
    const timer = setTimeout(callback, ms);
    this.roundTimers.set(code, timer);
  }

  clearRoundTimer(code: string): void {
    const t = this.roundTimers.get(code);
    if (t !== undefined) {
      clearTimeout(t);
      this.roundTimers.delete(code);
    }
  }

  // ------------------------------------------------------------------ judging timer

  setJudgingTimer(code: string, callback: () => void, ms: number): void {
    this.clearJudgingTimer(code);
    const timer = setTimeout(callback, ms);
    this.judgingTimers.set(code, timer);
  }

  clearJudgingTimer(code: string): void {
    const t = this.judgingTimers.get(code);
    if (t !== undefined) {
      clearTimeout(t);
      this.judgingTimers.delete(code);
    }
  }

  clearAllGameTimers(code: string): void {
    this.clearRoundTimer(code);
    this.clearJudgingTimer(code);
  }

  // ------------------------------------------------------------------ endGame

  endGame(hostToken: string): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const hostPlayerId = this.tokenToPlayerId.get(hostToken);
    if (hostPlayerId !== room.hostId) {
      return { error: 'Pouze hostitel může ukončit hru.' };
    }

    if (room.status === 'LOBBY' || room.status === 'FINISHED') {
      return { error: 'Hra právě neprobíhá.' };
    }

    this.clearAllGameTimers(code);
    this.engines.delete(code);
    room.status = 'FINISHED';
    room.roundDeadline = null;

    return { room };
  }

  // ------------------------------------------------------------------ finishGame

  finishGame(code: string): FinishGameResult | ErrorResult {
    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    this.clearAllGameTimers(code);
    this.engines.delete(code);

    // Zachyť roundNumber a playerTokenMap PŘED resetem
    const roundNumber = room.roundNumber;
    const playerTokenMap = new Map<string, string>();
    for (const [token, pid] of this.tokenToPlayerId.entries()) {
      if (this.playerRooms.get(token) === code) {
        playerTokenMap.set(pid, token);
      }
    }

    // Sestav payload PŘED resetem skóre
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const payload: GameOverPayload = {
      roomCode: code,
      finalScores: sorted.map((p, i) => ({
        playerId: p.id,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        score: p.score,
        rank: i + 1,
      })),
    };

    // Najdi tokeny nehóstovských hráčů
    const kickedTokens: string[] = [];
    for (const [token, pid] of this.tokenToPlayerId.entries()) {
      if (this.playerRooms.get(token) === code && pid !== room.hostId) {
        kickedTokens.push(token);
      }
    }

    // Vyhod nehóstovské hráče
    for (const token of kickedTokens) {
      const timer = this.afkTimers.get(token);
      if (timer !== undefined) {
        clearTimeout(timer);
        this.afkTimers.delete(token);
      }
      this.playerRooms.delete(token);
      this.tokenToPlayerId.delete(token);
      this.clearGuestMapping(token);
      this.offlineSince.delete(token);
    }
    room.players = room.players.filter(p => p.id === room.hostId);

    // Reset místnosti do LOBBY
    room.status = 'LOBBY';
    room.roundDeadline = null;
    room.currentBlackCard = null;
    room.blackCardCandidates = null;
    room.roundNumber = 0;
    room.lastActivityAt = Date.now();
    for (const p of room.players) {
      p.score = 0;
      p.isCardCzar = false;
      p.hasPlayed = false;
      p.tradedThisRound = false;
      if (this._playerSocketIds.has(p.id)) p.isAfk = false;
    }

    return { room, payload, kickedTokens, roundNumber, playerTokenMap };
  }

  // ------------------------------------------------------------------ removeStalePlayers

  /**
   * Odstraní z LOBBY místností hráče offline déle než maxOfflineMs (mrtvé
   * instance po ztrátě localStorage apod.). Rozehrané hry nechává být —
   * tam se hráč může vrátit reconnectem. Vrací dotčené místnosti.
   */
  removeStalePlayers(maxOfflineMs: number): GameRoom[] {
    const now = Date.now();
    const affected = new Map<string, GameRoom>();

    for (const [token, since] of [...this.offlineSince.entries()]) {
      if (now - since < maxOfflineMs) continue;
      const code = this.playerRooms.get(token);
      if (!code) { this.offlineSince.delete(token); continue; }
      const room = this.rooms.get(code);
      if (!room || room.status !== 'LOBBY') continue;
      this.removePlayer(token, room);
      affected.set(code, room);
    }

    return [...affected.values()];
  }

  // ------------------------------------------------------------------ updateActivity

  updateActivity(code: string): void {
    const room = this.rooms.get(code);
    if (room) room.lastActivityAt = Date.now();
  }

  // ------------------------------------------------------------------ getAllRooms

  getAllRooms(): IterableIterator<GameRoom> {
    return this.rooms.values();
  }

  // ------------------------------------------------------------------ deleteRoom

  deleteRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    // Vyčisti tokeny všech hráčů
    for (const [token, roomCode] of this.playerRooms.entries()) {
      if (roomCode === code) {
        const timer = this.afkTimers.get(token);
        if (timer !== undefined) {
          clearTimeout(timer);
          this.afkTimers.delete(token);
        }
        this.playerRooms.delete(token);
        this.tokenToPlayerId.delete(token);
        this.clearGuestMapping(token);
        this.offlineSince.delete(token);
      }
    }
    this.clearAllGameTimers(code);
    this.engines.delete(code);
    this.rooms.delete(code);
  }

  // ------------------------------------------------------------------ serialize / restore

  serialize(): ManagerSnapshot {
    const rooms: ManagerSnapshot['rooms'] = [];
    for (const room of this.rooms.values()) {
      const engine = this.engines.get(room.code);
      rooms.push({
        room: { ...room, players: room.players.map(p => ({ ...p })) },
        engine: engine ? engine.toSnapshot() : null,
      });
    }
    return {
      savedAt: Date.now(),
      rooms,
      playerRooms: Object.fromEntries(this.playerRooms),
      tokenToPlayerId: Object.fromEntries(this.tokenToPlayerId),
      guestKeyToToken: Object.fromEntries(this.guestKeyToToken),
    };
  }

  restore(snapshot: ManagerSnapshot): void {
    this.rooms.clear();
    this.engines.clear();
    this.playerRooms.clear();
    this.tokenToPlayerId.clear();

    for (const { room, engine: engineSnap } of snapshot.rooms) {
      // Sockety nepřežijí restart — všichni offline.
      // isAfk se záměrně zachovává: reconnect() ho vymaže při návratu hráče.
      // roundDeadline se záměrně zachovává: hodnota v minulosti je přijatelná,
      // klienti zobrazí nulu a hra pokračuje přes standardní flow (czarForceAdvance apod.).
      for (const player of room.players) {
        player.isOnline = false;
      }
      this.rooms.set(room.code, room);

      if (engineSnap) {
        const engine = GameEngine.fromSnapshot(engineSnap, room.players);
        this.engines.set(room.code, engine);
      }
    }

    this.playerRooms = new Map(Object.entries(snapshot.playerRooms));
    this.tokenToPlayerId = new Map(Object.entries(snapshot.tokenToPlayerId));
    this.guestKeyToToken = new Map(Object.entries(snapshot.guestKeyToToken ?? {}));
    this.tokenToGuestKey = new Map(
      [...this.guestKeyToToken.entries()].map(([key, token]) => [token, key]),
    );
  }

  // ------------------------------------------------------------------ private helpers

  private removePlayer(playerToken: string, room: GameRoom): void {
    // Clear AFK timer
    const timer = this.afkTimers.get(playerToken);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.afkTimers.delete(playerToken);
    }

    const playerId = this.tokenToPlayerId.get(playerToken);

    // Remove from room players
    if (playerId) {
      room.players = room.players.filter((p) => p.id !== playerId);
    }

    // Clean up maps
    this.playerRooms.delete(playerToken);
    this.tokenToPlayerId.delete(playerToken);
    this.clearGuestMapping(playerToken);
    this.offlineSince.delete(playerToken);

    // If room is now empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      this.engines.delete(room.code);
      this.clearAllGameTimers(room.code);
      return;
    }

    // Transfer host if needed
    if (room.hostId === playerId) {
      const nextHost = room.players.find((p) => !p.isAfk) ?? room.players[0];
      room.hostId = nextHost.id;
    }
  }
}

// Singleton for use by socket handlers
export const roomManager = new RoomManager();
