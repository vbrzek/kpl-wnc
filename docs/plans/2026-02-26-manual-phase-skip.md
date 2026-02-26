# Manual Phase Skip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Po vypršení timeru se hra automaticky nepřepne do další fáze — místo toho se zobrazí tlačítko oprávněnému hráči, který přechod spustí ručně.

**Architecture:** Timer callbacky se vyprázdní (no-op). Přechod fáze se přesune do dvou nových socket handlerů (`game:czarForceAdvance`, `game:skipCzarJudging`), které ověří, zda timer skutečně vypršel (`Date.now() >= room.roundDeadline`). Frontend zobrazí tlačítko, jakmile `secondsLeft === 0`.

**Tech Stack:** TypeScript, Node.js, Socket.io, Vue 3 Composition API, Pinia

---

### Task 1: Přidat typy do shared balíčku

**Files:**
- Modify: `packages/shared/src/index.ts:138-141`

**Step 1: Přidat 2 nové eventy do ClientToServerEvents**

Najdi sekci `ClientToServerEvents` na konci souboru a před uzavírající `}` přidej:

```typescript
  'game:czarForceAdvance': () => void;
  'game:skipCzarJudging': () => void;
```

Výsledek (řádky 138–142):
```typescript
  'game:retractCards': () => void;
  'game:czarForceAdvance': () => void;
  'game:skipCzarJudging': () => void;
}
```

**Step 2: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add czarForceAdvance and skipCzarJudging socket events"
```

---

### Task 2: Vyprázdnit timer callbacky v roundUtils.ts

**Files:**
- Modify: `packages/backend/src/socket/roundUtils.ts:20-43` (judging timer)
- Modify: `packages/backend/src/socket/roundUtils.ts:82-115` (selection timer)

Timer callbacky nyní nedělají nic — hra čeká na ruční akci.

**Step 1: Nahradit callback judging timeru (řádky 20–43)**

Starý kód:
```typescript
  roomManager.setJudgingTimer(roomCode, () => {
    const r = roomManager.getRoom(roomCode);
    const e = roomManager.getGameEngine(roomCode);
    if (!r || !e || r.status !== 'JUDGING') return;

    // Označit cara jako AFK
    const czar = r.players.find(p => p.isCardCzar);
    if (czar) czar.isAfk = true;

    r.roundDeadline = null;
    io.to(`room:${roomCode}`).emit('lobby:stateUpdate', r);
    io.to(`room:${roomCode}`).emit('game:roundSkipped');

    setTimeout(() => {
      const cr = roomManager.getRoom(roomCode);
      const ce = roomManager.getGameEngine(roomCode);
      if (!cr || !ce || cr.status !== 'JUDGING') return;
      try {
        startNewRound(cr, ce, io);
      } catch {
        io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
      }
    }, SKIP_DELAY_MS);
  }, JUDGING_TIMEOUT_MS);
```

Nový kód:
```typescript
  roomManager.setJudgingTimer(roomCode, () => {
    // Timer vypršel — čeká se na game:skipCzarJudging od non-Czar hráče
  }, JUDGING_TIMEOUT_MS);
```

**Step 2: Nahradit callback selection timeru (řádky 82–115)**

Starý kód:
```typescript
  roomManager.setRoundTimer(roomCode, () => {
    const r = roomManager.getRoom(roomCode);
    const e = roomManager.getGameEngine(roomCode);
    if (!r || !e || r.status !== 'SELECTION') return;

    // Označit připojené hráče, kteří neodeslali, jako AFK
    for (const player of r.players) {
      if (!player.isAfk && !player.isCardCzar && !player.hasPlayed && player.socketId !== null) {
        player.isAfk = true;
      }
    }

    const submissions = e.getAnonymousSubmissions();
    if (submissions.length > 0) {
      // Alespoň jedna odezva — přejdeme do JUDGING
      startJudgingPhase(r, e, io);
    } else {
      // Žádné odezvy — přeskoč kolo
      r.roundDeadline = null;
      io.to(`room:${roomCode}`).emit('lobby:stateUpdate', r);
      io.to(`room:${roomCode}`).emit('game:roundSkipped');

      setTimeout(() => {
        const cr = roomManager.getRoom(roomCode);
        const ce = roomManager.getGameEngine(roomCode);
        if (!cr || !ce || cr.status !== 'SELECTION') return;
        try {
          startNewRound(cr, ce, io);
        } catch {
          io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
        }
      }, SKIP_DELAY_MS);
    }
  }, SELECTION_TIMEOUT_MS);
```

Nový kód:
```typescript
  roomManager.setRoundTimer(roomCode, () => {
    // Timer vypršel — čeká se na game:czarForceAdvance od Card Czara
  }, SELECTION_TIMEOUT_MS);
```

**Step 3: Spustit testy**

```bash
npm test --workspace=packages/backend
```

Očekávaný výsledek: všechny testy projdou (20 testů).

**Step 4: Commit**

```bash
git add packages/backend/src/socket/roundUtils.ts
git commit -m "feat(backend): empty timer callbacks — transitions now manual"
```

---

### Task 3: Přidat nové handlery do gameHandlers.ts

**Files:**
- Modify: `packages/backend/src/socket/gameHandlers.ts`

Přidej oba nové handlery na konec funkce `registerGameHandlers`, před poslední `}`.

**Step 1: Přidat handler `game:czarForceAdvance`**

Za handler `game:leave` (řádek 131) přidej:

```typescript
  // Card Czar manuálně přeskočí čekání na odevzdání (po vypršení timeru)
  socket.on('game:czarForceAdvance', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') return;

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) return;

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const player = room.players.find(p => p.id === playerId);
    if (!player?.isCardCzar) {
      socket.emit('game:error', 'Jen karetní král může přeskočit čekání.');
      return;
    }

    if (!room.roundDeadline || Date.now() < room.roundDeadline) {
      socket.emit('game:error', 'Časový limit ještě nevypršel.');
      return;
    }

    roomManager.clearRoundTimer(room.code);

    // Označit nepřipravené hráče jako AFK
    for (const p of room.players) {
      if (!p.isAfk && !p.isCardCzar && !p.hasPlayed && p.socketId !== null) {
        p.isAfk = true;
      }
    }

    const submissions = engine.getAnonymousSubmissions();
    if (submissions.length > 0) {
      startJudgingPhase(room, engine, io);
    } else {
      room.roundDeadline = null;
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
      io.to(`room:${room.code}`).emit('game:roundSkipped');
      const roomCode = room.code;
      setTimeout(() => {
        const cr = roomManager.getRoom(roomCode);
        const ce = roomManager.getGameEngine(roomCode);
        if (!cr || !ce || cr.status !== 'SELECTION') return;
        try {
          startNewRound(cr, ce, io);
        } catch {
          io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
        }
      }, SKIP_DELAY_MS);
    }
  });
```

**Step 2: Přidat handler `game:skipCzarJudging`**

Za handler `game:czarForceAdvance` přidej:

```typescript
  // Non-Czar hráč manuálně přeskočí hodnocení (po vypršení timeru)
  socket.on('game:skipCzarJudging', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'JUDGING') return;

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const player = room.players.find(p => p.id === playerId);
    if (player?.isCardCzar) {
      socket.emit('game:error', 'Karetní král nemůže přeskočit vlastní hodnocení.');
      return;
    }

    if (!room.roundDeadline || Date.now() < room.roundDeadline) {
      socket.emit('game:error', 'Časový limit ještě nevypršel.');
      return;
    }

    roomManager.clearJudgingTimer(room.code);

    const czar = room.players.find(p => p.isCardCzar);
    if (czar) czar.isAfk = true;

    room.roundDeadline = null;
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    io.to(`room:${room.code}`).emit('game:roundSkipped');

    const roomCode = room.code;
    setTimeout(() => {
      const cr = roomManager.getRoom(roomCode);
      const ce = roomManager.getGameEngine(roomCode);
      if (!cr || !ce || cr.status !== 'JUDGING') return;
      try {
        startNewRound(cr, ce, io);
      } catch {
        io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
      }
    }, SKIP_DELAY_MS);
  });
```

**Step 3: Spustit testy**

```bash
npm test --workspace=packages/backend
```

Očekávaný výsledek: všechny testy projdou.

**Step 4: Commit**

```bash
git add packages/backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): add czarForceAdvance and skipCzarJudging handlers"
```

---

### Task 4: Přidat metody do roomStore.ts

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Přidat dvě nové funkce za `judgeSelect` (za řádkem 160)**

```typescript
  function czarForceAdvance() {
    socket.emit('game:czarForceAdvance');
  }

  function skipCzarJudging() {
    socket.emit('game:skipCzarJudging');
  }
```

**Step 2: Přidat obě funkce do return objektu storu**

Najdi `return {` na konci storu a přidej `czarForceAdvance` a `skipCzarJudging` do exportu vedle ostatních funkcí.

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): add czarForceAdvance and skipCzarJudging store actions"
```

---

### Task 5: Přidat tlačítko do CzarWaitingSelectionLayout.vue

**Files:**
- Modify: `packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue`

**Step 1: Přidat emit a podmíněné tlačítko**

Nahraď celý soubor:

```vue
<script setup lang="ts">
import type { BlackCard, Player } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionStatus from '../atoms/SubmissionStatus.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  forceAdvance: []
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
    <SubmissionStatus :players="players" />
    <p class="text-yellow-400 font-semibold text-lg">
      Jsi <strong>karetní král</strong> — čekej, až ostatní vyberou karty.
    </p>
    <button
      v-if="secondsLeft === 0"
      @click="emit('forceAdvance')"
      class="w-full py-3 px-6 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-colors"
    >
      Dál nečekat
    </button>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue
git commit -m "feat(frontend): show force-advance button for czar when timer expires"
```

---

### Task 6: Napojit emit v SelectionPhase.vue

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: Přidat handler a předat emit**

Za funkci `retract()` přidej:

```typescript
function czarForceAdvance() {
  roomStore.czarForceAdvance();
}
```

V template najdi `<CzarWaitingSelectionLayout` a přidej `@forceAdvance`:

```vue
  <CzarWaitingSelectionLayout
    v-if="roomStore.isCardCzar"
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :roundSkipped="roomStore.roundSkipped"
    @forceAdvance="czarForceAdvance"
  />
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue
git commit -m "feat(frontend): wire forceAdvance event in SelectionPhase"
```

---

### Task 7: Přidat tlačítko do WaitingForCzarLayout.vue

**Files:**
- Modify: `packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue`

**Step 1: Nahradit celý soubor**

```vue
<script setup lang="ts">
import type { BlackCard, AnonymousSubmission } from '@kpl/shared'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionGrid from '../atoms/SubmissionGrid.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  submissions: AnonymousSubmission[]
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  skipJudging: []
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <BlackCardAtom :text="blackCard.text" />
    <p class="text-gray-400 text-lg">
      Karetní král vybírá vítěze...
      <span v-if="secondsLeft > 0" class="ml-2 text-sm text-gray-500">({{ secondsLeft }}s)</span>
    </p>
    <SubmissionGrid :submissions="submissions" :selectable="false" />
    <button
      v-if="secondsLeft === 0"
      @click="emit('skipJudging')"
      class="w-full py-3 px-6 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
    >
      Přeskočit hodnocení
    </button>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue
git commit -m "feat(frontend): show skip-judging button when czar timer expires"
```

---

### Task 8: Napojit emit v JudgingPhase.vue

**Files:**
- Modify: `packages/frontend/src/components/JudgingPhase.vue`

**Step 1: Přidat handler a předat emit**

Za funkci `pickWinner()` přidej:

```typescript
function skipCzarJudging() {
  roomStore.skipCzarJudging();
}
```

V template najdi `<WaitingForCzarLayout` a přidej `@skipJudging`:

```vue
  <WaitingForCzarLayout
    v-else
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :submissions="roomStore.submissions"
    :roundSkipped="roomStore.roundSkipped"
    @skipJudging="skipCzarJudging"
  />
```

**Step 2: Spustit build pro ověření TypeScript**

```bash
npm run build --workspace=packages/frontend
```

Očekávaný výsledek: build proběhne bez chyb.

**Step 3: Commit**

```bash
git add packages/frontend/src/components/JudgingPhase.vue
git commit -m "feat(frontend): wire skipJudging event in JudgingPhase"
```

---

## Shrnutí změn

| Soubor | Typ |
|---|---|
| `packages/shared/src/index.ts` | +2 socket event typy |
| `packages/backend/src/socket/roundUtils.ts` | timer callbacky → no-op |
| `packages/backend/src/socket/gameHandlers.ts` | +2 nové handlery |
| `packages/frontend/src/stores/roomStore.ts` | +2 store akce |
| `packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue` | +tlačítko "Dál nečekat" |
| `packages/frontend/src/components/SelectionPhase.vue` | +emit handler |
| `packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue` | +tlačítko "Přeskočit hodnocení" |
| `packages/frontend/src/components/JudgingPhase.vue` | +emit handler |
