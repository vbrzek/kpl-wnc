# Analytics Events Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Logovat 3 typy herních událostí do DB (room_created, settings_updated, game_started) přes hybridní event log.

**Architecture:** Hlavní tabulka `game_events` + detail tabulka pro každý event typ. Singleton třída `EventLogger` s fire-and-forget metodami integrovaná do `lobbyHandlers.ts`. Chyby DB nikdy neshodí herní logiku.

**Tech Stack:** Knex.js (migrace + queries), Vitest (testy), TypeScript, Node.js

---

### Task 1: DB migrace — nové tabulky

**Files:**
- Create: `packages/backend/src/db/migrations/20260309000000_analytics_events.ts`

**Step 1: Vytvoř migraci**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('game_events', (table) => {
    table.bigIncrements('id').primary();
    table.enu('event_type', ['room_created', 'settings_updated', 'game_started']).notNullable();
    table.string('room_code', 6).notNullable();
    table.timestamp('occurred_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.index(['room_code'], 'idx_room');
    table.index(['event_type', 'occurred_at'], 'idx_type');
  });

  await knex.schema.createTable('game_event_room_created', (table) => {
    table.bigInteger('event_id').primary().unsigned();
    table.string('host_nickname', 100).notNullable();
    table.string('room_name', 100).notNullable();
    table.boolean('is_public').notNullable();
    table.tinyint('max_players').notNullable();
    table.string('win_condition', 20).notNullable();
    table.smallint('target_score').notNullable();
    table.smallint('target_rounds').notNullable();
    table.smallint('game_time_limit').notNullable();
    table.json('set_ids').notNullable();
    table.json('special_rules').notNullable();
    table.foreign('event_id').references('id').inTable('game_events').onDelete('CASCADE');
  });

  await knex.schema.createTable('game_event_settings_updated', (table) => {
    table.bigInteger('event_id').primary().unsigned();
    table.string('changed_by', 100).notNullable();
    table.string('room_name', 100).nullable();
    table.boolean('is_public').nullable();
    table.tinyint('max_players').nullable();
    table.string('win_condition', 20).nullable();
    table.smallint('target_score').nullable();
    table.smallint('target_rounds').nullable();
    table.smallint('game_time_limit').nullable();
    table.json('set_ids').nullable();
    table.json('special_rules').nullable();
    table.foreign('event_id').references('id').inTable('game_events').onDelete('CASCADE');
  });

  await knex.schema.createTable('game_event_game_started', (table) => {
    table.bigInteger('event_id').primary().unsigned();
    table.tinyint('player_count').notNullable();
    table.json('players').notNullable();
    table.foreign('event_id').references('id').inTable('game_events').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('game_event_game_started');
  await knex.schema.dropTableIfExists('game_event_settings_updated');
  await knex.schema.dropTableIfExists('game_event_room_created');
  await knex.schema.dropTableIfExists('game_events');
}
```

**Step 2: Spusť migraci**

```bash
npm run migrate --workspace=packages/backend
```

Očekávaný výstup: `Batch 3 run: 1 migrations`

**Step 3: Commit**

```bash
git add packages/backend/src/db/migrations/20260309000000_analytics_events.ts
git commit -m "feat: add analytics event tables migration"
```

---

### Task 2: EventLogger — testy

**Files:**
- Create: `packages/backend/src/analytics/EventLogger.test.ts`

**Step 1: Vytvoř testovací soubor**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB před importem EventLoggeru
vi.mock('../db/db.js', () => {
  const trx = {
    insert: vi.fn().mockResolvedValue([42]),
  };
  const mockDb = Object.assign(
    vi.fn(() => trx),
    {
      transaction: vi.fn((cb: (trx: typeof trx) => Promise<void>) => cb(trx)),
    }
  );
  return { default: mockDb };
});

import db from '../db/db.js';
import { eventLogger } from './EventLogger.js';
import type { GameRoom } from '@kpl/shared';

const baseRoom: GameRoom = {
  code: 'ABC123',
  name: 'Test stůl',
  status: 'LOBBY',
  hostId: 'host-1',
  isPublic: true,
  maxPlayers: 6,
  selectedSetIds: [1, 2],
  winCondition: 'score',
  targetScore: 8,
  targetRounds: 20,
  gameTimeLimit: 15,
  specialRules: [],
  players: [
    { id: 'p1', nickname: 'Alice', score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: false, isOnline: true, socketId: null },
    { id: 'p2', nickname: 'Bob',   score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: false, isOnline: true, socketId: null },
    { id: 'p3', nickname: 'Carol', score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: false, isOnline: true, socketId: null },
  ],
  currentBlackCard: null,
  roundNumber: 0,
  roundDeadline: null,
  gameStartedAt: null,
  blackCardCandidates: null,
  lastActivityAt: Date.now(),
};

describe('EventLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // reset insert mock
    const trx = (db as ReturnType<typeof vi.fn>)();
    (trx.insert as ReturnType<typeof vi.fn>).mockResolvedValue([42]);
  });

  describe('logRoomCreated', () => {
    it('vloží záznam do game_events s typem room_created', async () => {
      await eventLogger.logRoomCreated(baseRoom, 'Alice');
      const trx = (db as ReturnType<typeof vi.fn>)();
      expect(trx.insert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'room_created', room_code: 'ABC123' })
      );
    });

    it('vloží detail do game_event_room_created', async () => {
      await eventLogger.logRoomCreated(baseRoom, 'Alice');
      const trx = (db as ReturnType<typeof vi.fn>)();
      expect(trx.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 42,
          host_nickname: 'Alice',
          room_name: 'Test stůl',
          is_public: true,
          max_players: 6,
          win_condition: 'score',
          target_score: 8,
        })
      );
    });

    it('neshodí výjimku při chybě DB', async () => {
      (db as ReturnType<typeof vi.fn>).transaction = vi.fn().mockRejectedValue(new Error('DB down'));
      await expect(eventLogger.logRoomCreated(baseRoom, 'Alice')).resolves.not.toThrow();
    });
  });

  describe('logSettingsUpdated', () => {
    it('vloží záznam do game_events s typem settings_updated', async () => {
      await eventLogger.logSettingsUpdated(baseRoom, 'Alice');
      const trx = (db as ReturnType<typeof vi.fn>)();
      expect(trx.insert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'settings_updated', room_code: 'ABC123' })
      );
    });

    it('vloží changed_by do detailu', async () => {
      await eventLogger.logSettingsUpdated(baseRoom, 'Alice');
      const trx = (db as ReturnType<typeof vi.fn>)();
      expect(trx.insert).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: 42, changed_by: 'Alice' })
      );
    });
  });

  describe('logGameStarted', () => {
    it('vloží záznam do game_events s typem game_started', async () => {
      await eventLogger.logGameStarted(baseRoom);
      const trx = (db as ReturnType<typeof vi.fn>)();
      expect(trx.insert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'game_started', room_code: 'ABC123' })
      );
    });

    it('vloží player_count a players do detailu', async () => {
      await eventLogger.logGameStarted(baseRoom);
      const trx = (db as ReturnType<typeof vi.fn>)();
      expect(trx.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 42,
          player_count: 3,
          players: JSON.stringify([{ nickname: 'Alice' }, { nickname: 'Bob' }, { nickname: 'Carol' }]),
        })
      );
    });
  });
});
```

**Step 2: Spusť testy — ověř, že failují**

```bash
npm test --workspace=packages/backend
```

Očekávaný výstup: FAIL — `Cannot find module './EventLogger.js'`

---

### Task 3: EventLogger — implementace

**Files:**
- Create: `packages/backend/src/analytics/EventLogger.ts`

**Step 1: Vytvoř třídu**

```typescript
import db from '../db/db.js';
import type { GameRoom } from '@kpl/shared';

class EventLogger {
  private async insert(
    eventType: 'room_created' | 'settings_updated' | 'game_started',
    roomCode: string,
    detail: Record<string, unknown>
  ): Promise<void> {
    try {
      await db.transaction(async (trx) => {
        const [eventId] = await trx('game_events').insert({
          event_type: eventType,
          room_code: roomCode,
        });
        await trx(`game_event_${eventType}`).insert({ event_id: eventId, ...detail });
      });
    } catch (err) {
      console.error('[Analytics] Failed to log event:', eventType, err);
    }
  }

  async logRoomCreated(room: GameRoom, hostNickname: string): Promise<void> {
    await this.insert('room_created', room.code, {
      host_nickname: hostNickname,
      room_name: room.name,
      is_public: room.isPublic,
      max_players: room.maxPlayers,
      win_condition: room.winCondition,
      target_score: room.targetScore,
      target_rounds: room.targetRounds,
      game_time_limit: room.gameTimeLimit,
      set_ids: JSON.stringify(room.selectedSetIds),
      special_rules: JSON.stringify(room.specialRules),
    });
  }

  async logSettingsUpdated(room: GameRoom, changedByNickname: string): Promise<void> {
    await this.insert('settings_updated', room.code, {
      changed_by: changedByNickname,
      room_name: room.name,
      is_public: room.isPublic,
      max_players: room.maxPlayers,
      win_condition: room.winCondition,
      target_score: room.targetScore,
      target_rounds: room.targetRounds,
      game_time_limit: room.gameTimeLimit,
      set_ids: JSON.stringify(room.selectedSetIds),
      special_rules: JSON.stringify(room.specialRules),
    });
  }

  async logGameStarted(room: GameRoom): Promise<void> {
    const activePlayers = room.players.filter(p => !p.isAfk);
    await this.insert('game_started', room.code, {
      player_count: activePlayers.length,
      players: JSON.stringify(activePlayers.map(p => ({ nickname: p.nickname }))),
    });
  }
}

export const eventLogger = new EventLogger();
```

**Step 2: Spusť testy — ověř, že prochází**

```bash
npm test --workspace=packages/backend
```

Očekávaný výstup: všechny testy PASS (původních 71 + nové)

**Step 3: Commit**

```bash
git add packages/backend/src/analytics/
git commit -m "feat: add EventLogger for analytics events"
```

---

### Task 4: Integrace do lobbyHandlers.ts

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Přidej import na začátek souboru** (za ostatní importy)

```typescript
import { eventLogger } from '../analytics/EventLogger.js';
```

**Step 2: V handleru `lobby:create`** — přidej volání po `broadcastPublicRooms(io);` (řádek ~46):

```typescript
// Fire-and-forget analytics
eventLogger.logRoomCreated(room, data.nickname);
```

Kompletní handler po změně (relevantní část):
```typescript
socket.on('lobby:create', (settings, callback) => {
    // ... stávající kód ...
    broadcastPublicRooms(io);
    eventLogger.logRoomCreated(room, data.nickname);  // ← přidat
    callback({ room, playerToken, playerId });
});
```

**Step 3: V handleru `lobby:updateSettings`** — přidej po `broadcastPublicRooms(io);` (řádek ~136):

```typescript
// Fire-and-forget analytics
const updatingPlayer = result.room.players.find(p => p.id === result.room.hostId);
eventLogger.logSettingsUpdated(result.room, updatingPlayer?.nickname ?? 'unknown');
```

**Step 4: V handleru `lobby:startGame`** — přidej po `startNewRound(room, engine, io);` (dovnitř try bloku, řádek ~213):

```typescript
eventLogger.logGameStarted(room);
```

Kompletní try blok po změně:
```typescript
try {
  startNewRound(room, engine, io);
  eventLogger.logGameStarted(room);  // ← přidat
} catch {
  io.to(`room:${room.code}`).emit('game:error', 'Chyba při inicializaci hry — zkontroluj sady karet.');
}
```

**Step 5: Spusť testy — ověř, že nic nerozbíjíš**

```bash
npm test --workspace=packages/backend
```

Očekávaný výstup: všechny testy PASS

**Step 6: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts
git commit -m "feat: integrate EventLogger into lobby socket handlers"
```

---

### Task 5: Ověření end-to-end

**Step 1: Spusť backend**

```bash
npm run dev:backend
```

**Step 2: V druhém terminálu ověř DB záznamy** po vytvoření stolu a spuštění hry:

```sql
SELECT e.id, e.event_type, e.room_code, e.occurred_at,
       c.host_nickname, c.room_name, c.win_condition, c.target_score
FROM game_events e
JOIN game_event_room_created c ON e.id = c.event_id
ORDER BY e.occurred_at DESC
LIMIT 5;

SELECT e.event_type, e.room_code, s.player_count, s.players
FROM game_events e
JOIN game_event_game_started s ON e.id = s.event_id
ORDER BY e.occurred_at DESC
LIMIT 5;
```

Očekávaný výstup: řádky odpovídající právě odehraným akcím.
