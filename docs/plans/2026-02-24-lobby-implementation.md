# Lobby Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full lobby system — create/join/leave tables, public listing, private token join, AFK detection, reconnection via player token.

**Architecture:** Server-side in-memory `RoomManager` handles all room state. Socket.io rooms isolate events per table (`room:<code>`) and for public listing (`lobby`). Frontend uses Vue Router + Pinia; player token persisted in `localStorage` per room.

**Tech Stack:** Node.js + Fastify + Socket.io 4, Vue 3 Composition API, Pinia 2, Vue Router 4, Tailwind v4, TypeScript, vitest (backend unit tests).

---

## Task 1: Extend shared types

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Replace existing types**

Replace the entire file with:

```typescript
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
    callback: (result: { room: GameRoom; playerToken: string } | { error: string }) => void
  ) => void;
  'lobby:join': (
    data: { code: string; nickname: string; playerToken?: string },
    callback: (result: { room: GameRoom; playerToken: string } | { error: string }) => void
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
```

**Step 2: Build shared package**

```bash
npm run build --workspace=packages/shared
```

Expected: exits 0, no errors.

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): extend types for lobby — Player AFK/socketId, GameRoom settings, lobby socket events"
```

---

## Task 2: Backend — vitest setup

**Files:**
- Modify: `packages/backend/package.json`

**Step 1: Install vitest**

```bash
npm install --save-dev vitest --workspace=packages/backend
```

**Step 2: Add test script to `packages/backend/package.json`**

In the `"scripts"` object add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Verify vitest works**

```bash
npm test --workspace=packages/backend
```

Expected: "No test files found" (exits 0 or 1 depending on vitest version — both OK).

**Step 4: Commit**

```bash
git add packages/backend/package.json package-lock.json
git commit -m "chore(backend): add vitest for unit testing"
```

---

## Task 3: Backend — RoomManager tests (write first, fail)

**Files:**
- Create: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Create the test file**

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RoomManager } from './RoomManager.js';

describe('RoomManager', () => {
  let rm: RoomManager;

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RoomManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- createRoom ---

  it('creates a room with a 6-char hex code', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    expect(room.code).toMatch(/^[a-f0-9]{6}$/);
  });

  it('creates a room with the host as first player', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    expect(room.players).toHaveLength(1);
    expect(room.players[0].nickname).toBe('Alice');
    expect(room.hostId).toBe(room.players[0].id);
    expect(typeof playerToken).toBe('string');
  });

  // --- joinRoom ---

  it('joins an existing room and returns playerToken', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.joinRoom(room.code, 'Bob');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.players).toHaveLength(2);
      expect(result.playerToken).toBeTruthy();
    }
  });

  it('returns error when room not found', () => {
    const result = rm.joinRoom('000000', 'Bob');
    expect('error' in result).toBe(true);
  });

  it('returns error when room is full', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 2, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    const result = rm.joinRoom(room.code, 'Charlie');
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain('plný');
  });

  it('returns error on duplicate nickname', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.joinRoom(room.code, 'Alice');
    expect('error' in result).toBe(true);
  });

  it('returns error when game already started', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    // Manually force status (simulate started game)
    const r = rm.getRoom(room.code)!;
    r.status = 'SELECTION';
    const result = rm.joinRoom(room.code, 'Bob');
    expect('error' in result).toBe(true);
  });

  it('reconnects player by playerToken, restores socketId', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.handleDisconnect(playerToken);
    const reconnected = rm.reconnect(playerToken, 'socket-new-123');
    expect(reconnected).not.toBeNull();
    expect(reconnected!.players[0].socketId).toBe('socket-new-123');
    expect(reconnected!.players[0].isAfk).toBe(false);
  });

  // --- AFK ---

  it('marks player AFK after 30s of disconnect', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.handleDisconnect(playerToken);
    expect(room.players[0].isAfk).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(room.players[0].isAfk).toBe(true);
  });

  it('does not mark AFK if player reconnects before 30s', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.handleDisconnect(playerToken);
    vi.advanceTimersByTime(10_000);
    rm.reconnect(playerToken, 'new-socket');
    vi.advanceTimersByTime(25_000);
    expect(room.players[0].isAfk).toBe(false);
  });

  // --- kickPlayer ---

  it('host can kick another player', () => {
    const { room, playerToken: hostToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const { playerToken: bobToken } = rm.joinRoom(room.code, 'Bob') as { room: any; playerToken: string };
    const bobId = rm.getRoom(room.code)!.players.find(p => p.nickname === 'Bob')!.id;
    const result = rm.kickPlayer(hostToken, bobId);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.players).toHaveLength(1);
      expect(result.kickedPlayerToken).toBe(bobToken);
    }
  });

  it('non-host cannot kick', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const { playerToken: bobToken } = rm.joinRoom(room.code, 'Bob') as { room: any; playerToken: string };
    const aliceId = room.players[0].id;
    const result = rm.kickPlayer(bobToken, aliceId);
    expect('error' in result).toBe(true);
  });

  // --- host transfer ---

  it('transfers host to next non-AFK player when host leaves', () => {
    const { room, playerToken: hostToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.leaveRoom(hostToken);
    const updated = rm.getRoom(room.code)!;
    expect(updated.players).toHaveLength(1);
    expect(updated.players[0].nickname).toBe('Bob');
    expect(updated.hostId).toBe(updated.players[0].id);
  });

  it('deletes room when last player leaves', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.leaveRoom(playerToken);
    expect(rm.getRoom(room.code)).toBeNull();
  });

  // --- updateSettings ---

  it('host can update settings', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.updateSettings(playerToken, { name: 'Nova', maxPlayers: 8 });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.name).toBe('Nova');
      expect(result.room.maxPlayers).toBe(8);
    }
  });

  it('rejects maxPlayers below current player count', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    const result = rm.updateSettings(playerToken, { maxPlayers: 2 });
    expect('error' in result).toBe(true);
  });

  // --- startGame ---

  it('rejects startGame with fewer than 3 players', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    const result = rm.startGame(playerToken);
    expect('error' in result).toBe(true);
  });

  it('starts game with 3+ players', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    const result = rm.startGame(playerToken);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.status).toBe('SELECTION');
    }
  });

  // --- getPublicRooms ---

  it('lists only public rooms with status LOBBY', () => {
    rm.createRoom({ name: 'Public', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'A' });
    rm.createRoom({ name: 'Private', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'B' });
    const list = rm.getPublicRooms();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Public');
  });
});
```

**Step 2: Run tests — verify they all fail**

```bash
npm test --workspace=packages/backend
```

Expected: Multiple FAIL errors like "Cannot find module './RoomManager.js'".

**Step 3: Commit**

```bash
git add packages/backend/src/game/RoomManager.test.ts
git commit -m "test(backend): add RoomManager unit tests (failing)"
```

---

## Task 4: Backend — RoomManager implementation

**Files:**
- Create: `packages/backend/src/game/RoomManager.ts`

**Step 1: Create the file**

```typescript
import { randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import type { GameRoom, Player, PublicRoomSummary } from '@kpl/shared';

const AFK_TIMEOUT_MS = 30_000;

type CreateSettings = {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  nickname: string;
};

type UpdateSettings = {
  name?: string;
  isPublic?: boolean;
  selectedSetIds?: number[];
  maxPlayers?: number;
};

export type JoinResult =
  | { room: GameRoom; playerToken: string }
  | { error: string };

export type ActionResult =
  | { room: GameRoom }
  | { error: string };

export type KickResult =
  | { room: GameRoom; kickedPlayerToken: string }
  | { error: string };

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  // playerToken → roomCode
  private playerRooms = new Map<string, string>();
  // playerToken → playerToken (identity map, for kick lookup)
  private tokenToPlayerId = new Map<string, string>(); // playerToken → player.id
  private afkTimers = new Map<string, ReturnType<typeof setTimeout>>();

  createRoom(settings: CreateSettings): { room: GameRoom; playerToken: string } {
    const code = this.generateCode();
    const playerToken = randomUUID();
    const playerId = randomUUID();

    const player: Player = {
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
      players: [player],
      currentBlackCard: null,
      roundNumber: 0,
    };

    this.rooms.set(code, room);
    this.playerRooms.set(playerToken, code);
    this.tokenToPlayerId.set(playerToken, playerId);

    return { room, playerToken };
  }

  joinRoom(code: string, nickname: string, playerToken?: string): JoinResult {
    const room = this.rooms.get(code);
    if (!room) return { error: 'Stůl nenalezen' };

    // Reconnect path
    if (playerToken && this.playerRooms.get(playerToken) === code) {
      return this.reconnect(playerToken, null) ? { room, playerToken } : { error: 'Chyba reconnectu' };
    }

    if (room.status !== 'LOBBY') return { error: 'Hra již probíhá' };
    if (room.players.length >= room.maxPlayers) return { error: 'Stůl je plný' };
    if (room.players.some(p => p.nickname === nickname)) return { error: 'Přezdívka je již obsazena' };

    const newPlayerToken = randomUUID();
    const playerId = randomUUID();

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
    this.playerRooms.set(newPlayerToken, code);
    this.tokenToPlayerId.set(newPlayerToken, playerId);

    return { room, playerToken: newPlayerToken };
  }

  reconnect(playerToken: string, socketId: string | null): GameRoom | null {
    const code = this.playerRooms.get(playerToken);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;
    const playerId = this.tokenToPlayerId.get(playerToken);
    const player = room.players.find(p => p.id === playerId);
    if (!player) return null;

    // Clear AFK timer
    const timer = this.afkTimers.get(playerToken);
    if (timer) {
      clearTimeout(timer);
      this.afkTimers.delete(playerToken);
    }

    player.socketId = socketId;
    player.isAfk = false;
    return room;
  }

  handleDisconnect(playerToken: string): void {
    const code = this.playerRooms.get(playerToken);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const playerId = this.tokenToPlayerId.get(playerToken);
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    player.socketId = null;

    const timer = setTimeout(() => {
      player.isAfk = true;
      this.afkTimers.delete(playerToken);
    }, AFK_TIMEOUT_MS);

    this.afkTimers.set(playerToken, timer);
  }

  leaveRoom(playerToken: string): { room: GameRoom | null; wasKicked: false } {
    const code = this.playerRooms.get(playerToken);
    if (!code) return { room: null, wasKicked: false };
    const room = this.rooms.get(code);
    if (!room) return { room: null, wasKicked: false };

    this.removePlayer(playerToken, room);
    return { room: this.rooms.get(code) ?? null, wasKicked: false };
  }

  kickPlayer(hostToken: string, targetPlayerId: string): KickResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádném stole' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'Stůl nenalezen' };

    const hostId = this.tokenToPlayerId.get(hostToken);
    if (room.hostId !== hostId) return { error: 'Nejsi host' };

    const targetToken = this.findTokenByPlayerId(targetPlayerId);
    if (!targetToken) return { error: 'Hráč nenalezen' };

    this.removePlayer(targetToken, room);
    return { room, kickedPlayerToken: targetToken };
  }

  updateSettings(hostToken: string, settings: UpdateSettings): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádném stole' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'Stůl nenalezen' };

    const hostId = this.tokenToPlayerId.get(hostToken);
    if (room.hostId !== hostId) return { error: 'Nejsi host' };

    if (settings.maxPlayers !== undefined && settings.maxPlayers < room.players.length) {
      return { error: 'Nový limit je nižší než aktuální počet hráčů' };
    }

    if (settings.name !== undefined) room.name = settings.name;
    if (settings.isPublic !== undefined) room.isPublic = settings.isPublic;
    if (settings.selectedSetIds !== undefined) room.selectedSetIds = settings.selectedSetIds;
    if (settings.maxPlayers !== undefined) room.maxPlayers = settings.maxPlayers;

    return { room };
  }

  startGame(hostToken: string): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádném stole' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'Stůl nenalezen' };

    const hostId = this.tokenToPlayerId.get(hostToken);
    if (room.hostId !== hostId) return { error: 'Nejsi host' };

    const activePlayers = room.players.filter(p => !p.isAfk);
    if (activePlayers.length < 3) return { error: 'Potřeba alespoň 3 aktivní hráči' };
    if (room.selectedSetIds.length === 0) return { error: 'Vyber alespoň jednu sadu karet' };

    room.status = 'SELECTION';
    return { room };
  }

  getPublicRooms(): PublicRoomSummary[] {
    const result: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.status === 'LOBBY') {
        result.push({
          code: room.code,
          name: room.name,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
        });
      }
    }
    return result;
  }

  getRoom(code: string): GameRoom | null {
    return this.rooms.get(code) ?? null;
  }

  getRoomByPlayerToken(playerToken: string): GameRoom | null {
    const code = this.playerRooms.get(playerToken);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  getPlayerIdByToken(playerToken: string): string | null {
    return this.tokenToPlayerId.get(playerToken) ?? null;
  }

  // --- private helpers ---

  private generateCode(): string {
    return randomBytes(3).toString('hex'); // 6 hex chars
  }

  private removePlayer(playerToken: string, room: GameRoom): void {
    const playerId = this.tokenToPlayerId.get(playerToken);
    if (!playerId) return;

    // Clear AFK timer if any
    const timer = this.afkTimers.get(playerToken);
    if (timer) {
      clearTimeout(timer);
      this.afkTimers.delete(playerToken);
    }

    room.players = room.players.filter(p => p.id !== playerId);
    this.playerRooms.delete(playerToken);
    this.tokenToPlayerId.delete(playerToken);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return;
    }

    // Transfer host if needed
    if (room.hostId === playerId) {
      const nextHost = room.players.find(p => !p.isAfk) ?? room.players[0];
      room.hostId = nextHost.id;
    }
  }

  private findTokenByPlayerId(playerId: string): string | null {
    for (const [token, id] of this.tokenToPlayerId.entries()) {
      if (id === playerId) return token;
    }
    return null;
  }
}

export const roomManager = new RoomManager();
```

**Step 2: Run tests — all should pass**

```bash
npm test --workspace=packages/backend
```

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts
git commit -m "feat(backend): implement RoomManager — room lifecycle, AFK, host transfer"
```

---

## Task 5: Backend — Socket.io lobby handlers

**Files:**
- Create: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Create `lobbyHandlers.ts`**

```typescript
import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Maps socket.id → playerToken (for disconnect handling)
const socketToToken = new Map<string, string>();

function broadcastPublicRooms(io: IO) {
  io.to('lobby').emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
}

export function registerLobbyHandlers(io: IO, socket: AppSocket) {
  // --- Subscribe to public rooms list ---
  socket.on('lobby:subscribePublic', () => {
    socket.join('lobby');
    socket.emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
  });

  socket.on('lobby:unsubscribePublic', () => {
    socket.leave('lobby');
  });

  // --- Create room ---
  socket.on('lobby:create', (settings, callback) => {
    const { room, playerToken } = roomManager.createRoom(settings);

    // Attach socket to player
    const player = room.players[0];
    player.socketId = socket.id;

    socketToToken.set(socket.id, playerToken);
    socket.join(`room:${room.code}`);
    socket.leave('lobby');

    broadcastPublicRooms(io);
    callback({ room, playerToken });
  });

  // --- Join room ---
  socket.on('lobby:join', (data, callback) => {
    const result = roomManager.joinRoom(data.code, data.nickname, data.playerToken);

    if ('error' in result) {
      callback(result);
      return;
    }

    const { room, playerToken } = result;

    // Attach socket to player
    const playerId = roomManager.getPlayerIdByToken(playerToken);
    const player = room.players.find(p => p.id === playerId);
    if (player) player.socketId = socket.id;

    socketToToken.set(socket.id, playerToken);
    socket.join(`room:${room.code}`);
    socket.leave('lobby');

    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    broadcastPublicRooms(io);
    callback({ room, playerToken });
  });

  // --- Leave room ---
  socket.on('lobby:leave', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const { room } = roomManager.leaveRoom(playerToken);
    socketToToken.delete(socket.id);
    socket.leave(`room:${room?.code ?? ''}`);

    if (room) {
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
      broadcastPublicRooms(io);
    }
  });

  // --- Update settings (host only) ---
  socket.on('lobby:updateSettings', (settings, callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.updateSettings(playerToken, settings);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    broadcastPublicRooms(io);
    callback(result);
  });

  // --- Kick player (host only) ---
  socket.on('lobby:kickPlayer', (targetPlayerId, callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.kickPlayer(playerToken, targetPlayerId);
    if ('error' in result) { callback(result); return; }

    // Notify kicked player
    const kickedPlayer = result.room.players; // already removed — find their socket
    // Find kicked player's socket via socketToToken reverse lookup
    for (const [sid, token] of socketToToken.entries()) {
      if (token === result.kickedPlayerToken) {
        io.to(sid).emit('lobby:kicked');
        socketToToken.delete(sid);
        break;
      }
    }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    broadcastPublicRooms(io);
    callback({ ok: true });
  });

  // --- Start game (host only) ---
  socket.on('lobby:startGame', (callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.startGame(playerToken);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    callback({ ok: true });
  });

  // --- Disconnect handling ---
  socket.on('disconnect', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    socketToToken.delete(socket.id);
    roomManager.handleDisconnect(playerToken);

    // Notify room of AFK after timer (handled inside RoomManager)
    // We need to emit state after AFK fires — use a small wrapper
    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (room) {
      // Emit immediately (socketId is now null)
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);

      // After AFK timeout, emit again with isAfk=true
      setTimeout(() => {
        const updatedRoom = roomManager.getRoomByPlayerToken(playerToken);
        if (updatedRoom) {
          io.to(`room:${updatedRoom.code}`).emit('lobby:stateUpdate', updatedRoom);
        }
      }, 31_000); // 1s after AFK fires
    }

    broadcastPublicRooms(io);
  });
}
```

**Step 2: Modify `packages/backend/src/index.ts`**

Replace the `io.on('connection', ...)` block with:

```typescript
import { registerLobbyHandlers } from './socket/lobbyHandlers.js';

// ...existing code above stays...

io.on('connection', (socket) => {
  app.log.info(`Client connected: ${socket.id}`);
  io.emit('server:clientCount', io.engine.clientsCount);

  registerLobbyHandlers(io, socket);

  socket.on('disconnect', () => {
    app.log.info(`Client disconnected: ${socket.id}`);
    io.emit('server:clientCount', io.engine.clientsCount);
  });
});
```

**Step 3: Verify TypeScript compilation**

```bash
npm run build --workspace=packages/backend
```

Expected: exits 0, no errors.

**Step 4: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts packages/backend/src/index.ts
git commit -m "feat(backend): implement Socket.io lobby handlers — create/join/leave/kick/settings/startGame"
```

---

## Task 6: Frontend — Vue Router + Pinia setup

**Files:**
- Modify: `packages/frontend/src/main.ts`
- Modify: `packages/frontend/src/App.vue`
- Create: `packages/frontend/src/router/index.ts`

**Step 1: Verify dependencies are installed**

```bash
ls packages/frontend/node_modules/vue-router && ls packages/frontend/node_modules/pinia
```

If either is missing, run: `npm install --workspace=packages/frontend`

**Step 2: Create `packages/frontend/src/router/index.ts`**

```typescript
import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    {
      path: '/room/:token',
      component: () => import('../views/RoomView.vue'),
    },
  ],
});

export default router;
```

**Step 3: Replace `packages/frontend/src/main.ts`**

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';
import router from './router/index.js';

createApp(App).use(createPinia()).use(router).mount('#app');
```

**Step 4: Replace `packages/frontend/src/App.vue`**

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { socket } from './socket';

onMounted(() => socket.connect());
onUnmounted(() => socket.disconnect());
</script>

<template>
  <RouterView />
</template>
```

**Step 5: Verify TypeScript build**

```bash
npm run build --workspace=packages/frontend
```

Expected: exits 0. (May warn about missing view files — ignore for now, they'll be created next.)

**Step 6: Commit**

```bash
git add packages/frontend/src/main.ts packages/frontend/src/App.vue packages/frontend/src/router/index.ts
git commit -m "feat(frontend): set up Vue Router + Pinia, add HomeView and RoomView routes"
```

---

## Task 7: Frontend — Pinia stores

**Files:**
- Create: `packages/frontend/src/stores/lobbyStore.ts`
- Create: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Create `packages/frontend/src/stores/lobbyStore.ts`**

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { socket } from '../socket';
import type { PublicRoomSummary } from '@kpl/shared';

export const useLobbyStore = defineStore('lobby', () => {
  const publicRooms = ref<PublicRoomSummary[]>([]);
  const isSubscribed = ref(false);

  function subscribe() {
    if (isSubscribed.value) return;
    socket.emit('lobby:subscribePublic');
    socket.on('lobby:publicRoomsUpdate', (rooms) => {
      publicRooms.value = rooms;
    });
    isSubscribed.value = true;
  }

  function unsubscribe() {
    if (!isSubscribed.value) return;
    socket.emit('lobby:unsubscribePublic');
    socket.off('lobby:publicRoomsUpdate');
    isSubscribed.value = false;
  }

  async function createRoom(settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    nickname: string;
  }): Promise<{ code: string; playerToken: string } | { error: string }> {
    return new Promise((resolve) => {
      socket.emit('lobby:create', settings, (result) => {
        if ('error' in result) {
          resolve(result);
        } else {
          savePlayerToken(result.room.code, result.playerToken);
          resolve({ code: result.room.code, playerToken: result.playerToken });
        }
      });
    });
  }

  async function joinRoom(
    code: string,
    nickname: string
  ): Promise<{ code: string; playerToken: string } | { error: string }> {
    const playerToken = loadPlayerToken(code);
    return new Promise((resolve) => {
      socket.emit('lobby:join', { code, nickname, playerToken: playerToken ?? undefined }, (result) => {
        if ('error' in result) {
          resolve(result);
        } else {
          savePlayerToken(result.room.code, result.playerToken);
          resolve({ code: result.room.code, playerToken: result.playerToken });
        }
      });
    });
  }

  return { publicRooms, subscribe, unsubscribe, createRoom, joinRoom };
});

export function savePlayerToken(roomCode: string, token: string) {
  localStorage.setItem(`playerToken_${roomCode}`, token);
}

export function loadPlayerToken(roomCode: string): string | null {
  return localStorage.getItem(`playerToken_${roomCode}`);
}
```

**Step 2: Create `packages/frontend/src/stores/roomStore.ts`**

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { socket } from '../socket';
import type { GameRoom } from '@kpl/shared';
import { loadPlayerToken } from './lobbyStore';

export const useRoomStore = defineStore('room', () => {
  const room = ref<GameRoom | null>(null);
  const playerToken = ref<string | null>(null);

  const me = computed(() => {
    if (!room.value || !playerToken.value) return null;
    // Find my player by token — server sends player.id, we map via store
    return myPlayerId.value
      ? room.value.players.find(p => p.id === myPlayerId.value) ?? null
      : null;
  });

  // We store our player.id locally after first join
  const myPlayerId = ref<string | null>(null);

  const isHost = computed(() =>
    room.value && myPlayerId.value ? room.value.hostId === myPlayerId.value : false
  );

  function init(roomCode: string) {
    playerToken.value = loadPlayerToken(roomCode);

    socket.on('lobby:stateUpdate', (updatedRoom) => {
      room.value = updatedRoom;
    });

    socket.on('lobby:kicked', () => {
      room.value = null;
      playerToken.value = null;
      myPlayerId.value = null;
    });
  }

  function setJoinResult(joinedRoom: GameRoom, token: string) {
    room.value = joinedRoom;
    playerToken.value = token;
    // Find our player in the room — our player is the one with this token
    // Server sent us the playerToken; we need to find our player.id.
    // The simplest approach: the server adds us last, so find by nickname is fragile.
    // Better: after join, call a helper to find player whose socketId matches — but we
    // don't know socketId on client. Instead, store playerId explicitly.
    // We'll resolve this by having the server return playerId in the join result.
    // For now, use nickname match (reliable since duplicates are rejected by server).
  }

  function setMyPlayerId(id: string) {
    myPlayerId.value = id;
  }

  async function leave() {
    socket.emit('lobby:leave');
    room.value = null;
    playerToken.value = null;
    myPlayerId.value = null;
  }

  async function updateSettings(settings: {
    name?: string;
    isPublic?: boolean;
    selectedSetIds?: number[];
    maxPlayers?: number;
  }): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:updateSettings', settings, (result) => {
        if ('error' in result) resolve(result);
        else resolve(null);
      });
    });
  }

  async function kickPlayer(playerId: string): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:kickPlayer', playerId, (result) => {
        if ('error' in result) resolve(result);
        else resolve(null);
      });
    });
  }

  async function startGame(): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:startGame', (result) => {
        if ('error' in result) resolve(result);
        else resolve(null);
      });
    });
  }

  function cleanup() {
    socket.off('lobby:stateUpdate');
    socket.off('lobby:kicked');
    room.value = null;
    playerToken.value = null;
    myPlayerId.value = null;
  }

  return {
    room, playerToken, me, myPlayerId, isHost,
    init, setJoinResult, setMyPlayerId, leave,
    updateSettings, kickPlayer, startGame, cleanup,
  };
});
```

> **Note:** The `myPlayerId` problem: after join, the server returns `GameRoom` but the client needs to know which player.id is "me". Solution in Task 8 — extend the join callback to also return `playerId`.

**Step 3: Extend shared types to include `playerId` in join result**

In `packages/shared/src/index.ts`, update the `lobby:join` and `lobby:create` callback types:

```typescript
'lobby:create': (
  settings: { ... },
  callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
) => void;
'lobby:join': (
  data: { code: string; nickname: string; playerToken?: string },
  callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
) => void;
```

Also update `lobbyHandlers.ts` to return `playerId` in the callback.

Also update `lobbyStore.ts` — `createRoom` and `joinRoom` return type includes `playerId`.

**Step 4: Verify build**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/frontend
```

Expected: exits 0.

**Step 5: Commit**

```bash
git add packages/frontend/src/stores/ packages/shared/src/index.ts packages/backend/src/socket/lobbyHandlers.ts
git commit -m "feat(frontend): add lobbyStore and roomStore; extend join result with playerId"
```

---

## Task 8: Frontend — HomeView

**Files:**
- Create: `packages/frontend/src/views/HomeView.vue`
- Create: `packages/frontend/src/components/PublicRoomsList.vue`
- Create: `packages/frontend/src/components/CreateTableModal.vue`
- Create: `packages/frontend/src/components/JoinPrivateModal.vue`

**Step 1: Create `HomeView.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLobbyStore } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import PublicRoomsList from '../components/PublicRoomsList.vue';
import CreateTableModal from '../components/CreateTableModal.vue';
import JoinPrivateModal from '../components/JoinPrivateModal.vue';

const router = useRouter();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();

const showCreate = ref(false);
const showJoinPrivate = ref(false);
const errorMsg = ref('');

onMounted(() => lobbyStore.subscribe());
onUnmounted(() => lobbyStore.unsubscribe());

async function onCreateRoom(settings: {
  name: string; isPublic: boolean; selectedSetIds: number[]; maxPlayers: number; nickname: string;
}) {
  const result = await lobbyStore.createRoom(settings);
  if ('error' in result) { errorMsg.value = result.error; return; }
  roomStore.setMyPlayerId(result.playerId);
  router.push(`/room/${result.code}`);
}

async function onJoinPublic(code: string, nickname: string) {
  const result = await lobbyStore.joinRoom(code, nickname);
  if ('error' in result) { errorMsg.value = result.error; return; }
  roomStore.setMyPlayerId(result.playerId);
  router.push(`/room/${result.code}`);
}

function onJoinPrivate(code: string) {
  router.push(`/room/${code}`);
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-6">
    <h1 class="text-4xl font-bold mb-8">Karty proti lidskosti</h1>

    <p v-if="errorMsg" class="text-red-400 mb-4">{{ errorMsg }}</p>

    <div class="flex gap-4 mb-8">
      <button
        @click="showCreate = true"
        class="bg-green-600 hover:bg-green-500 px-6 py-3 rounded-lg font-semibold"
      >
        Vytvořit stůl
      </button>
      <button
        @click="showJoinPrivate = true"
        class="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold"
      >
        Připojit se (kód)
      </button>
    </div>

    <PublicRoomsList
      :rooms="lobbyStore.publicRooms"
      @join="onJoinPublic"
    />

    <CreateTableModal
      v-if="showCreate"
      @close="showCreate = false"
      @create="onCreateRoom"
    />

    <JoinPrivateModal
      v-if="showJoinPrivate"
      @close="showJoinPrivate = false"
      @join="onJoinPrivate"
    />
  </div>
</template>
```

**Step 2: Create `PublicRoomsList.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { PublicRoomSummary } from '@kpl/shared';

const props = defineProps<{ rooms: PublicRoomSummary[] }>();
const emit = defineEmits<{ join: [code: string, nickname: string] }>();

const nickname = ref('');
const joiningCode = ref<string | null>(null);

function startJoin(code: string) {
  joiningCode.value = code;
  nickname.value = '';
}

function confirmJoin() {
  if (!joiningCode.value || !nickname.value.trim()) return;
  emit('join', joiningCode.value, nickname.value.trim());
  joiningCode.value = null;
}
</script>

<template>
  <section>
    <h2 class="text-xl font-semibold mb-4">Veřejné stoly</h2>
    <p v-if="rooms.length === 0" class="text-gray-400">Žádné volné stoly.</p>
    <ul class="space-y-2">
      <li
        v-for="room in rooms"
        :key="room.code"
        class="flex items-center justify-between bg-gray-800 px-4 py-3 rounded-lg"
      >
        <span>{{ room.name }} <span class="text-gray-400 text-sm">({{ room.playerCount }}/{{ room.maxPlayers }})</span></span>
        <button
          @click="startJoin(room.code)"
          class="bg-indigo-600 hover:bg-indigo-500 px-4 py-1 rounded"
        >
          Sednout si
        </button>
      </li>
    </ul>

    <!-- Inline nickname prompt -->
    <div v-if="joiningCode" class="mt-4 flex gap-2">
      <input
        v-model="nickname"
        placeholder="Tvoje přezdívka"
        class="bg-gray-700 px-3 py-2 rounded flex-1"
        @keyup.enter="confirmJoin"
      />
      <button @click="confirmJoin" class="bg-indigo-600 px-4 py-2 rounded">Připojit</button>
      <button @click="joiningCode = null" class="text-gray-400 px-2">Zrušit</button>
    </div>
  </section>
</template>
```

**Step 3: Create `CreateTableModal.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  close: [];
  create: [settings: {
    name: string; isPublic: boolean; selectedSetIds: number[]; maxPlayers: number; nickname: string;
  }];
}>();

const name = ref('');
const isPublic = ref(true);
const maxPlayers = ref(8);
const nickname = ref('');
// selectedSetIds: will be populated once REST API for card sets is ready
const selectedSetIds = ref<number[]>([]);

function submit() {
  if (!name.value.trim() || !nickname.value.trim()) return;
  emit('create', {
    name: name.value.trim(),
    isPublic: isPublic.value,
    selectedSetIds: selectedSetIds.value,
    maxPlayers: maxPlayers.value,
    nickname: nickname.value.trim(),
  });
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-md space-y-4">
      <h2 class="text-xl font-bold">Vytvořit nový stůl</h2>

      <label class="block">
        <span class="text-sm text-gray-300">Název stolu</span>
        <input v-model="name" class="mt-1 w-full bg-gray-700 px-3 py-2 rounded" placeholder="Můj stůl" />
      </label>

      <label class="block">
        <span class="text-sm text-gray-300">Tvoje přezdívka</span>
        <input v-model="nickname" class="mt-1 w-full bg-gray-700 px-3 py-2 rounded" placeholder="Přezdívka" />
      </label>

      <label class="block">
        <span class="text-sm text-gray-300">Max. hráčů</span>
        <input v-model.number="maxPlayers" type="number" min="3" max="20" class="mt-1 w-full bg-gray-700 px-3 py-2 rounded" />
      </label>

      <label class="flex items-center gap-2">
        <input v-model="isPublic" type="checkbox" class="w-4 h-4" />
        <span class="text-sm text-gray-300">Veřejný stůl (zobrazí se v seznamu)</span>
      </label>

      <p class="text-xs text-gray-400">Výběr sad karet bude dostupný po implementaci REST API.</p>

      <div class="flex gap-3 pt-2">
        <button @click="submit" class="bg-green-600 hover:bg-green-500 px-5 py-2 rounded font-semibold flex-1">
          Vytvořit
        </button>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white px-4 py-2">
          Zrušit
        </button>
      </div>
    </div>
  </div>
</template>
```

**Step 4: Create `JoinPrivateModal.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{ close: []; join: [code: string] }>();
const code = ref('');

function submit() {
  const trimmed = code.value.trim().toLowerCase();
  if (!/^[a-f0-9]{6}$/.test(trimmed)) return;
  emit('join', trimmed);
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-sm space-y-4">
      <h2 class="text-xl font-bold">Připojit se ke stolu</h2>
      <label class="block">
        <span class="text-sm text-gray-300">Kód stolu (6 znaků)</span>
        <input
          v-model="code"
          maxlength="6"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded font-mono tracking-widest text-center text-lg uppercase"
          placeholder="a3f9c1"
          @keyup.enter="submit"
        />
      </label>
      <div class="flex gap-3">
        <button @click="submit" class="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded flex-1 font-semibold">
          Připojit
        </button>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white px-4 py-2">Zrušit</button>
      </div>
    </div>
  </div>
</template>
```

**Step 5: Verify build**

```bash
npm run build --workspace=packages/frontend
```

Expected: exits 0.

**Step 6: Commit**

```bash
git add packages/frontend/src/views/HomeView.vue packages/frontend/src/components/
git commit -m "feat(frontend): implement HomeView — public rooms list, create table modal, join by code modal"
```

---

## Task 9: Frontend — RoomView + LobbyPanel

**Files:**
- Create: `packages/frontend/src/views/RoomView.vue`
- Create: `packages/frontend/src/components/NicknameModal.vue`
- Create: `packages/frontend/src/components/LobbyPanel.vue`
- Create: `packages/frontend/src/components/PlayerList.vue`
- Create: `packages/frontend/src/components/InviteLink.vue`

**Step 1: Create `NicknameModal.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{ join: [nickname: string] }>();
const nickname = ref('');

function submit() {
  if (!nickname.value.trim()) return;
  emit('join', nickname.value.trim());
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-sm space-y-4">
      <h2 class="text-xl font-bold">Zadej svou přezdívku</h2>
      <input
        v-model="nickname"
        autofocus
        class="w-full bg-gray-700 px-3 py-2 rounded"
        placeholder="Přezdívka"
        @keyup.enter="submit"
      />
      <button @click="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded font-semibold">
        Sednout si ke stolu
      </button>
    </div>
  </div>
</template>
```

**Step 2: Create `PlayerList.vue`**

```vue
<script setup lang="ts">
import type { Player } from '@kpl/shared';

defineProps<{
  players: Player[];
  hostId: string;
  myPlayerId: string | null;
  isHost: boolean;
}>();

const emit = defineEmits<{ kick: [playerId: string] }>();
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="player in players"
      :key="player.id"
      class="flex items-center justify-between bg-gray-700 px-4 py-2 rounded"
    >
      <span class="flex items-center gap-2">
        {{ player.nickname }}
        <span v-if="player.id === hostId" class="text-xs text-yellow-400">(host)</span>
        <span v-if="player.id === myPlayerId" class="text-xs text-green-400">(ty)</span>
        <span v-if="player.isAfk" class="text-xs text-gray-400 bg-gray-600 px-1 rounded">AFK</span>
        <span v-if="!player.socketId && !player.isAfk" class="text-xs text-orange-400">offline</span>
      </span>
      <button
        v-if="isHost && player.id !== myPlayerId"
        @click="emit('kick', player.id)"
        class="text-xs text-red-400 hover:text-red-300"
      >
        Vyhodit
      </button>
    </li>
  </ul>
</template>
```

**Step 3: Create `InviteLink.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ roomCode: string }>();
const copied = ref(false);

function copy(code: string) {
  const url = `${window.location.origin}/room/${code}`;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  });
}
</script>

<template>
  <div class="flex items-center gap-2">
    <code class="bg-gray-700 px-3 py-1 rounded font-mono text-sm tracking-widest">{{ roomCode }}</code>
    <button
      @click="copy(roomCode)"
      class="text-sm text-indigo-400 hover:text-indigo-300"
    >
      {{ copied ? 'Zkopírováno!' : 'Kopírovat odkaz' }}
    </button>
  </div>
</template>
```

**Step 4: Create `LobbyPanel.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { GameRoom } from '@kpl/shared';
import { useRoomStore } from '../stores/roomStore';
import PlayerList from './PlayerList.vue';
import InviteLink from './InviteLink.vue';

defineProps<{ room: GameRoom }>();

const roomStore = useRoomStore();
const errorMsg = ref('');

async function kick(playerId: string) {
  const err = await roomStore.kickPlayer(playerId);
  if (err) errorMsg.value = err.error;
}

async function startGame() {
  const err = await roomStore.startGame();
  if (err) errorMsg.value = err.error;
}

const activeCount = (room: GameRoom) => room.players.filter(p => !p.isAfk).length;
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold">{{ room.name }}</h1>
      <InviteLink :room-code="room.code" />
    </div>

    <p v-if="errorMsg" class="text-red-400">{{ errorMsg }}</p>

    <section>
      <h2 class="text-lg font-semibold mb-2">Hráči ({{ room.players.length }}/{{ room.maxPlayers }})</h2>
      <PlayerList
        :players="room.players"
        :host-id="room.hostId"
        :my-player-id="roomStore.myPlayerId"
        :is-host="roomStore.isHost"
        @kick="kick"
      />
    </section>

    <button
      v-if="roomStore.isHost"
      :disabled="activeCount(room) < 3"
      @click="startGame"
      class="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-bold text-lg"
    >
      Spustit hru
      <span class="text-sm font-normal ml-1">({{ activeCount(room) }}/3 min.)</span>
    </button>
    <p v-else class="text-gray-400">Čekáme, až host spustí hru...</p>
  </div>
</template>
```

**Step 5: Create `RoomView.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLobbyStore, loadPlayerToken } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import NicknameModal from '../components/NicknameModal.vue';
import LobbyPanel from '../components/LobbyPanel.vue';

const route = useRoute();
const router = useRouter();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();

const roomCode = route.params.token as string;
const needsNickname = ref(false);
const errorMsg = ref('');

onMounted(async () => {
  roomStore.init(roomCode);

  const existingToken = loadPlayerToken(roomCode);

  if (existingToken) {
    // Try to reconnect
    const result = await lobbyStore.joinRoom(roomCode, '', /* playerToken handled internally */ );
    // joinRoom with empty nickname + token will reconnect via server
    if ('error' in result) {
      errorMsg.value = result.error;
      setTimeout(() => router.push('/'), 2000);
      return;
    }
    roomStore.setMyPlayerId(result.playerId);
  } else {
    needsNickname.value = true;
  }
});

async function onNicknameSubmit(nickname: string) {
  const result = await lobbyStore.joinRoom(roomCode, nickname);
  if ('error' in result) {
    errorMsg.value = result.error;
    return;
  }
  roomStore.setMyPlayerId(result.playerId);
  needsNickname.value = false;
}

onUnmounted(() => {
  roomStore.cleanup();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-6">

    <NicknameModal
      v-if="needsNickname"
      @join="onNicknameSubmit"
    />

    <p v-if="errorMsg" class="text-red-400 mb-4">{{ errorMsg }}</p>

    <template v-if="roomStore.room">
      <LobbyPanel
        v-if="roomStore.room.status === 'LOBBY'"
        :room="roomStore.room"
      />
      <div v-else class="text-center text-2xl mt-20">
        Hra probíhá... (herní UI brzy)
      </div>
    </template>

    <div v-else-if="!errorMsg" class="text-gray-400">
      Připojování...
    </div>
  </div>
</template>
```

> **Note on reconnect flow:** The `lobbyStore.joinRoom` sends `playerToken` if found in localStorage. The server's `lobby:join` handler recognizes the token and reconnects the player. No separate reconnect event is needed.

**Step 6: Final build check**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/backend && npm run build --workspace=packages/frontend
```

Expected: All three exit 0.

**Step 7: Run all backend tests**

```bash
npm test --workspace=packages/backend
```

Expected: All tests PASS.

**Step 8: Commit**

```bash
git add packages/frontend/src/views/RoomView.vue packages/frontend/src/components/NicknameModal.vue packages/frontend/src/components/LobbyPanel.vue packages/frontend/src/components/PlayerList.vue packages/frontend/src/components/InviteLink.vue
git commit -m "feat(frontend): implement RoomView — lobby panel, player list, invite link, start game"
```

---

## Manuální smoke test

Po implementaci všech tasků:

1. `npm run dev:backend` + `npm run dev:frontend`
2. Otevři `http://localhost:5173` — HomeView s prázdným seznamem
3. Klikni "Vytvořit stůl" → vyplň formulář → stůl vytvořen, přesměrování na `/room/<code>`
4. Otevři druhé okno → zadej kód nebo URL → zadej přezdívku → připoj se
5. V prvním okně se zobrazí druhý hráč
6. Otevři třetí okno a připoj se
7. V prvním okně (host) se aktivuje "Spustit hru"
8. Klikni "Spustit hru" → všechna okna zobrazí "Hra probíhá..."
9. Zavři druhé okno → po 30s se označí AFK
10. Znovu otevři druhé okno se stejnou URL → automatický reconnect, AFK zrušen
