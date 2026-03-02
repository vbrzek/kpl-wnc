import { randomBytes, randomUUID } from 'crypto';
import type { GameRoom, GameOverPayload, Player, PublicRoomSummary } from '@kpl/shared';
import { GameEngine, type EngineSnapshot } from './GameEngine.js';

export interface ManagerSnapshot {
  savedAt: number;
  rooms: Array<{ room: GameRoom; engine: EngineSnapshot | null }>;
  playerRooms: Record<string, string>;
  tokenToPlayerId: Record<string, string>;
}

// --- Room code generator ---

const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars: A-Z + 2-9, no 0/O/1/I/L

function generateRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, b => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
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
  targetScore: number;
}

export interface FinishGameResult {
  room: GameRoom;
  payload: GameOverPayload;
  kickedTokens: string[];
}

export interface UpdateSettingsData {
  name?: string;
  isPublic?: boolean;
  selectedSetIds?: number[];
  maxPlayers?: number;
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
      socketId: null,
      isOnline: true,
      nickname: settings.nickname,
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
      roundNumber: 0,
      roundDeadline: null,
      targetScore: settings.targetScore,
      lastActivityAt: Date.now(),
    };

    this.rooms.set(code, room);
    this.playerRooms.set(playerToken, code);
    this.tokenToPlayerId.set(playerToken, playerId);

    return { room, playerToken };
  }

  // ------------------------------------------------------------------ joinRoom

  joinRoom(code: string, nickname: string, playerToken?: string): JoinResult {
    const room = this.rooms.get(code);
    if (!room) {
      return { error: 'Místnost nebyla nalezena.' };
    }

    // Reconnect path: if playerToken provided and maps to this room
    if (playerToken) {
      const existingRoomCode = this.playerRooms.get(playerToken);
      if (existingRoomCode === code) {
        const reconnected = this.reconnect(playerToken, null);
        if (reconnected) {
          return { room: reconnected, playerToken, wasReconnect: true };
        }
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
      socketId: null,
      isOnline: true,
      nickname,
      score: 0,
      isCardCzar: false,
      hasPlayed: false,
      tradedThisRound: false,
      isAfk: false,
    };

    room.players.push(player);
    this.playerRooms.set(newToken, code);
    this.tokenToPlayerId.set(newToken, playerId);

    return { room, playerToken: newToken, wasReconnect: false };
  }

  // ------------------------------------------------------------------ reconnect

  reconnect(playerToken: string, socketId: string | null): GameRoom | null {
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

    player.socketId = socketId;
    player.isOnline = true;
    player.isAfk = false;

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

    player.socketId = null;
    player.isOnline = false;

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

    // Sestav payload PŘED resetem skóre
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const payload: GameOverPayload = {
      roomCode: code,
      finalScores: sorted.map((p, i) => ({
        playerId: p.id,
        nickname: p.nickname,
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
    }
    room.players = room.players.filter(p => p.id === room.hostId);

    // Reset místnosti do LOBBY
    room.status = 'LOBBY';
    room.roundDeadline = null;
    room.currentBlackCard = null;
    room.roundNumber = 0;
    room.lastActivityAt = Date.now();
    for (const p of room.players) {
      p.score = 0;
      p.isCardCzar = false;
      p.hasPlayed = false;
      if (p.socketId !== null) p.isAfk = false;
    }

    return { room, payload, kickedTokens };
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
        player.socketId = null;
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
