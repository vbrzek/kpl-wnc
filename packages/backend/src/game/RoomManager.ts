import { randomBytes, randomUUID } from 'crypto';
import type { GameRoom, GameOverPayload, Player, PublicRoomSummary } from '@kpl/shared';
import { GameEngine } from './GameEngine.js';

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
    const code = randomBytes(3).toString('hex');
    const playerId = randomUUID();
    const playerToken = randomUUID();

    const host: Player = {
      id: playerId,
      socketId: null,
      nickname: settings.nickname,
      score: 0,
      isCardCzar: false,
      hasPlayed: false,
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
      nickname,
      score: 0,
      isCardCzar: false,
      hasPlayed: false,
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

  // ------------------------------------------------------------------ returnToLobby

  returnToLobby(hostToken: string): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const hostPlayerId = this.tokenToPlayerId.get(hostToken);
    if (hostPlayerId !== room.hostId) {
      return { error: 'Pouze hostitel může vrátit hru do lobby.' };
    }

    if (room.status !== 'FINISHED') {
      return { error: 'Hru lze vrátit do lobby pouze ze stavu FINISHED.' };
    }

    room.status = 'LOBBY';
    room.roundDeadline = null;
    room.currentBlackCard = null;
    room.roundNumber = 0;

    for (const player of room.players) {
      player.score = 0;
      player.isCardCzar = false;
      player.hasPlayed = false;
      // Zachováme isAfk pro odpojené hráče, resetujeme pro připojené
      if (player.socketId !== null) {
        player.isAfk = false;
      }
    }

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
