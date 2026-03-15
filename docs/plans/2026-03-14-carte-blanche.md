# Carte Blanche Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the "Carte Blanche" special rule — each player gets one blank white card at game start that they can write custom text on before submitting, usable once per game.

**Architecture:** Blank card is tracked separately from normal hand (NOT added to `playerHands` map). `getPlayerHand()` appends it virtually when rule is active and player hasn't used it. Backend validates `blankCardText` on submit; blank card is never added to the white card deck. `game:playCards` event changes from `cardIds: number[]` to `{ cardIds: number[], blankCardText?: string }`. Blank card has special ID `0` (not a DB id).

**Tech Stack:** TypeScript, Socket.io shared events, GameEngine (backend), Zod (validation), Vue 3 + Pinia (frontend), vue-i18n.

---

### Task 1: Shared types

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Edit the file**

Apply these 4 changes to `packages/shared/src/index.ts`:

1. Add `'carte_blanche'` to `SpecialRule` (after line 9):
```typescript
export type SpecialRule =
  | 'rando_cardrissian'
  | 'wheatons_law'
  | 'rebooting_universe'
  | 'high_stakes'
  | 'carte_blanche';
```

2. Add `isBlank` to `WhiteCard` (after line 38):
```typescript
export interface WhiteCard {
  id: number;
  text: string;
  isBlank?: true;
}
```

3. Add constant after `WhiteCard` (after line 39):
```typescript
export const BLANK_CARD_ID = 0;
```

4. Change `game:playCards` in `ClientToServerEvents` (line 201):
```typescript
// Before:
'game:playCards': (cardIds: number[]) => void;
// After:
'game:playCards': (data: { cardIds: number[]; blankCardText?: string }) => void;
```

**Step 2: Commit**
```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add carte_blanche rule, isBlank to WhiteCard, update game:playCards event"
```

---

### Task 2: Backend — GameEngine core logic

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Modify: `packages/backend/src/game/GameEngine.test.ts`

**Step 1: Write failing tests**

Add this import to test file (top):
```typescript
import { BLANK_CARD_ID } from '@kpl/shared';
```

Append this `describe` block to `packages/backend/src/game/GameEngine.test.ts`:

```typescript
describe('carte_blanche', () => {
  let players: Player[];
  let engine: GameEngine;

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
    engine = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), ['carte_blanche']);
  });

  it('hand includes blank card for all non-czar players after startRound', () => {
    engine.startRound();
    for (const p of players) {
      const hand = engine.getPlayerHand(p.id);
      expect(hand).toHaveLength(11);
      expect(hand.some(c => c.isBlank)).toBe(true);
    }
  });

  it('blank card is not in hand without the rule', () => {
    const e2 = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100));
    e2.startRound();
    expect(e2.getPlayerHand(players[0].id).some(c => c.isBlank)).toBe(false);
    expect(e2.getPlayerHand(players[0].id)).toHaveLength(10);
  });

  it('submitCards succeeds with blank card and text', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const result = engine.submitCards(nonCzar.id, [BLANK_CARD_ID], 'My custom text');
    expect('ok' in result).toBe(true);
    const subs = engine.getAnonymousSubmissions();
    const sub = subs[0];
    expect(sub.cards[0].text).toBe('My custom text');
    expect(sub.cards[0].isBlank).toBe(true);
  });

  it('submitCards fails if blank card used without text', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const result = engine.submitCards(nonCzar.id, [BLANK_CARD_ID]);
    expect('error' in result).toBe(true);
  });

  it('blank card disappears from hand after use (next round too)', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    engine.submitCards(nonCzar.id, [BLANK_CARD_ID], 'test');
    engine.startRound();
    expect(engine.getPlayerHand(nonCzar.id).some(c => c.isBlank)).toBe(false);
  });

  it('blank card is preserved after tradeHand', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 5;
    engine.tradeHand(nonCzar.id);
    const hand = engine.getPlayerHand(nonCzar.id);
    expect(hand.filter(c => !c.isBlank)).toHaveLength(10);
    expect(hand.some(c => c.isBlank)).toBe(true);
  });

  it('blank card returns to hand on retractCards', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    engine.submitCards(nonCzar.id, [BLANK_CARD_ID], 'test');
    expect(engine.getPlayerHand(nonCzar.id).some(c => c.isBlank)).toBe(false);
    engine.retractCards(nonCzar.id);
    expect(engine.getPlayerHand(nonCzar.id).some(c => c.isBlank)).toBe(true);
  });

  it('blank card cannot be used twice (even after new round)', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    engine.submitCards(nonCzar.id, [BLANK_CARD_ID], 'first use');
    engine.startRound();
    const result = engine.submitCards(nonCzar.id, [BLANK_CARD_ID], 'second try');
    expect('error' in result).toBe(true);
  });

  it('snapshot preserves blankCardsUsed', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    engine.submitCards(nonCzar.id, [BLANK_CARD_ID], 'test');
    const snap = engine.toSnapshot();
    const restored = GameEngine.fromSnapshot(snap, players);
    expect(restored.getPlayerHand(nonCzar.id).some(c => c.isBlank)).toBe(false);
  });

  it('blank card not added to white deck used pile after round', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    engine.submitCards(nonCzar.id, [BLANK_CARD_ID], 'test');
    const snapBefore = engine.toSnapshot();
    const usedBefore = snapBefore.usedWhiteCards.length;
    engine.startRound();
    const snapAfter = engine.toSnapshot();
    // usedWhiteCards should NOT have increased by blank card
    expect(snapAfter.usedWhiteCards.every(c => !c.isBlank)).toBe(true);
  });
});
```

**Step 2: Run to confirm failures**
```bash
npm test --workspace=packages/backend 2>&1 | grep -E 'FAIL|PASS|carte_blanche'
```
Expected: carte_blanche tests FAIL

**Step 3: Implement in GameEngine.ts**

3a. Add private field (after `private votes = ...` line ~49):
```typescript
private blankCardsUsed = new Set<string>(); // playerIds who used their Carte Blanche card
```

3b. Add `blankCardsUsed: string[]` to `EngineSnapshot` interface (after `votes` field):
```typescript
blankCardsUsed: string[];
```

3c. Modify `startRound()` — filter blank cards from used pile (lines ~81-83):
```typescript
// Replace:
for (const sub of this.submissions.values()) {
  this.usedWhiteCards.push(...sub.cards);
}
// With:
for (const sub of this.submissions.values()) {
  this.usedWhiteCards.push(...sub.cards.filter(c => !c.isBlank));
}
```

3d. Modify `submitCards()` — change signature and handle blank card.

Replace the full `submitCards` method:
```typescript
submitCards(
  playerId: string,
  cardIds: number[],
  blankCardText?: string,
): { ok: true; allSubmitted: boolean } | { error: string } {
  const player = this.players.find(p => p.id === playerId);
  if (!player) return { error: 'Hráč nenalezen.' };
  if (player.isCardCzar) return { error: 'Card Czar nemůže hrát karty.' };
  if (player.hasPlayed) return { error: 'Již jsi odeslal karty v tomto kole.' };
  if (!this.currentBlackCard) return { error: 'Žádná aktivní černá karta.' };

  const required = this.currentBlackCard.pick;
  if (cardIds.length !== required) {
    return { error: `Musíš vybrat přesně ${required} karet.` };
  }

  const usesBlank = cardIds.includes(0);
  if (usesBlank) {
    if (!this.specialRules.has('carte_blanche')) return { error: 'Carte Blanche není aktivní.' };
    if (this.blankCardsUsed.has(playerId)) return { error: 'Prázdnou kartu jsi již použil.' };
    if (!blankCardText?.trim()) return { error: 'Text prázdné karty nesmí být prázdný.' };
    if (blankCardText.length > 200) return { error: 'Text prázdné karty je příliš dlouhý (max 200 znaků).' };
  }

  const normalIds = cardIds.filter(id => id !== 0);
  const hand = this.playerHands.get(playerId) ?? [];
  const selectedCards: WhiteCard[] = [];

  for (const id of normalIds) {
    const idx = hand.findIndex(c => c.id === id);
    if (idx === -1) return { error: 'Karta není v tvé ruce.' };
    selectedCards.push(hand.splice(idx, 1)[0]);
  }
  this.playerHands.set(playerId, hand);

  if (usesBlank) {
    selectedCards.push({ id: 0, text: blankCardText!.trim(), isBlank: true });
    this.blankCardsUsed.add(playerId);
  }

  this.submissions.set(playerId, { submissionId: randomUUID(), cards: selectedCards });
  player.hasPlayed = true;

  const nonCzarActive = this.czarMode === 'czar_is_dead'
    ? this.players.filter(p => !p.isAfk)
    : this.players.filter(p => !p.isAfk && !p.isCardCzar);
  const allSubmitted = nonCzarActive.every(p => p.hasPlayed);
  return { ok: true, allSubmitted };
}
```

3e. Modify `retractCards()` — preserve blank card on retract.

Replace the `retractCards` method:
```typescript
retractCards(playerId: string): { ok: true } | { error: string } {
  const player = this.players.find(p => p.id === playerId);
  if (!player) return { error: 'Hráč nenalezen.' };
  if (!player.hasPlayed) return { error: 'Dosud jsi žádné karty neodeslal.' };

  const submission = this.submissions.get(playerId);
  if (!submission) return { error: 'Odeslání nebylo nalezeno.' };

  const hand = this.playerHands.get(playerId) ?? [];
  hand.push(...submission.cards.filter(c => !c.isBlank));
  this.playerHands.set(playerId, hand);

  if (submission.cards.some(c => c.isBlank)) {
    this.blankCardsUsed.delete(playerId);
  }

  this.submissions.delete(playerId);
  player.hasPlayed = false;
  return { ok: true };
}
```

3f. Modify `getPlayerHand()` — append blank card virtually:
```typescript
getPlayerHand(playerId: string): WhiteCard[] {
  const hand = [...(this.playerHands.get(playerId) ?? [])];
  if (this.specialRules.has('carte_blanche') && !this.blankCardsUsed.has(playerId)) {
    hand.push({ id: 0, text: '', isBlank: true });
  }
  return hand;
}
```

3g. Add to `toSnapshot()` return object (after `votes`):
```typescript
blankCardsUsed: Array.from(this.blankCardsUsed),
```

3h. Add to `fromSnapshot()` (after `engine.votes = ...`):
```typescript
engine.blankCardsUsed = new Set(snap.blankCardsUsed ?? []);
```

**Step 4: Run tests**
```bash
npm test --workspace=packages/backend 2>&1 | tail -20
```
Expected: all PASS

**Step 5: Commit**
```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat(engine): implement carte_blanche blank card logic with tests"
```

---

### Task 3: Backend — validation + gameHandlers

**Files:**
- Modify: `packages/backend/src/socket/validation.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Update validation.ts**

1a. Add `'carte_blanche'` to `VALID_RULES` array (line 9-12):
```typescript
const VALID_RULES: SpecialRule[] = [
  'rando_cardrissian', 'wheatons_law',
  'rebooting_universe', 'high_stakes', 'carte_blanche',
];
```

1b. Replace `PlayCardsSchema` (line 74):
```typescript
// Before:
export const PlayCardsSchema = z.array(z.number().int().positive()).min(1).max(3);
// After:
export const PlayCardsSchema = z.object({
  cardIds: z.array(z.number().int().min(0)).min(1).max(3),
  blankCardText: z.string().max(200).optional(),
});
```

**Step 2: Update gameHandlers.ts**

Replace the `game:playCards` handler (lines 66-107) — update variable names and engine call:
```typescript
socket.on('game:playCards', (data) => {
  if (!checkRateLimit(socket.id, 'game:playCards')) {
    socket.emit('game:error', 'Příliš mnoho požadavků. Zkus to za chvíli.');
    return;
  }
  const parsed = validate(PlayCardsSchema, data);
  if (!parsed) { socket.emit('game:error', 'Neplatná data karet.'); return; }

  const playerToken = socketToToken.get(socket.id);
  if (!playerToken) return;

  const room = roomManager.getRoomByPlayerToken(playerToken);
  if (!room || room.status !== 'SELECTION') {
    socket.emit('game:error', 'Hra není ve fázi výběru karet.');
    return;
  }

  roomManager.updateActivity(room.code);

  const engine = roomManager.getGameEngine(room.code);
  if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

  const playerId = roomManager.getPlayerIdByToken(playerToken)!;
  const result = engine.submitCards(playerId, parsed.cardIds, parsed.blankCardText);

  if ('error' in result) {
    socket.emit('game:error', result.error);
    return;
  }

  const subId = engine.getSubmissionId(playerId);
  if (subId) socket.emit('game:mySubmissionId', subId);

  if (result.allSubmitted) {
    roomManager.clearRoundTimer(room.code);
    startJudgingPhase(room, engine, io);
  } else {
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
  }
});
```

**Step 3: Run tests**
```bash
npm test --workspace=packages/backend 2>&1 | tail -20
```
Expected: all PASS

**Step 4: Commit**
```bash
git add packages/backend/src/socket/validation.ts packages/backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): update PlayCardsSchema and handler for carte_blanche"
```

---

### Task 4: Frontend — i18n translations

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: cs.json** — add inside `"specialRules"` block, after `"high_stakes"` entry:
```json
"carte_blanche": {
  "name": "Carte Blanche",
  "desc": "Každý hráč dostane jednu prázdnou kartu. Napiš co chceš — ale máš ji jen jednou za celou hru."
},
"carte_blanche_modal": {
  "title": "Napiš svůj text",
  "placeholder": "Napiš text své karty...",
  "hint": "Tuto kartu máš jen jednou za celou hru.",
  "confirm": "Odeslat",
  "cancel": "Zrušit"
}
```

**Step 2: en.json** — same structure, English text:
```json
"carte_blanche": {
  "name": "Carte Blanche",
  "desc": "Each player gets one blank card. Write anything you want — but you only get it once per game."
},
"carte_blanche_modal": {
  "title": "Write your text",
  "placeholder": "Write your card text...",
  "hint": "You only have this card once per game.",
  "confirm": "Submit",
  "cancel": "Cancel"
}
```

**Step 3: ru.json**:
```json
"carte_blanche": {
  "name": "Carte Blanche",
  "desc": "Каждый игрок получает одну пустую карту. Напишите что угодно — но использовать можно только один раз за игру."
},
"carte_blanche_modal": {
  "title": "Напишите текст",
  "placeholder": "Введите текст карты...",
  "hint": "Эту карту можно использовать только один раз за игру.",
  "confirm": "Отправить",
  "cancel": "Отмена"
}
```

**Step 4: uk.json**:
```json
"carte_blanche": {
  "name": "Carte Blanche",
  "desc": "Кожен гравець отримує одну порожню карту. Напишіть що завгодно — але лише один раз за гру."
},
"carte_blanche_modal": {
  "title": "Напишіть текст",
  "placeholder": "Введіть текст картки...",
  "hint": "Цю картку можна використати лише один раз за гру.",
  "confirm": "Надіслати",
  "cancel": "Скасувати"
}
```

**Step 5: es.json**:
```json
"carte_blanche": {
  "name": "Carte Blanche",
  "desc": "Cada jugador recibe una carta en blanco. Escribe lo que quieras — pero solo la tienes una vez por partida."
},
"carte_blanche_modal": {
  "title": "Escribe tu texto",
  "placeholder": "Escribe el texto de tu carta...",
  "hint": "Solo tienes esta carta una vez por partida.",
  "confirm": "Enviar",
  "cancel": "Cancelar"
}
```

**Step 6: Commit**
```bash
git add packages/frontend/src/i18n/
git commit -m "feat(i18n): add carte_blanche translations to all locales"
```

---

### Task 5: Frontend — SpecialRulesPanel

**Files:**
- Modify: `packages/frontend/src/components/SpecialRulesPanel.vue`

**Step 1:** Add `carte_blanche` to `RULES` array (after `high_stakes` entry, line ~23):
```typescript
const RULES: RuleInfo[] = [
  { id: 'rando_cardrissian', icon: '🎲' },
  { id: 'wheatons_law', icon: '🃏' },
  { id: 'rebooting_universe', icon: '♻️' },
  { id: 'high_stakes', icon: '💰' },
  { id: 'carte_blanche', icon: '✏️' },
];
```

**Step 2: Commit**
```bash
git add packages/frontend/src/components/SpecialRulesPanel.vue
git commit -m "feat(ui): add carte_blanche toggle to SpecialRulesPanel"
```

---

### Task 6: Frontend — CardHand blank card visual

**Files:**
- Modify: `packages/frontend/src/components/game/atoms/CardHand.vue`

**Step 1:** Replace the entire template content with blank-card-aware version:

```html
<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <button
      v-for="card in cards"
      :key="card.isBlank ? 'blank' : card.id"
      @click="onToggle(card)"
      :class="[
        'relative min-h-[110px] p-4 rounded-2xl text-left transition-all duration-200 flex flex-col justify-between shadow-sm border-2',
        card.isBlank
          ? selectedCards.some(c => c.isBlank)
            ? 'bg-gradient-to-br from-purple-900/60 to-yellow-900/40 border-yellow-400/60 -translate-y-2 shadow-lg shadow-yellow-400/20'
            : 'bg-gradient-to-br from-purple-900/30 to-yellow-900/10 border-yellow-400/20 hover:border-yellow-400/50'
          : selectedCards.some(c => c.id === card.id)
            ? 'bg-yellow-50 border-transparent border-gray-100 -translate-y-2 shadow-lg'
            : 'bg-white border-transparent hover:border-gray-100'
      ]"
    >
      <!-- Normal card content -->
      <template v-if="!card.isBlank">
        <span :class="[
          'text-[14px] leading-snug tracking-tight transition-colors',
          selectedCards.some(c => c.id === card.id) ? 'text-yellow-900 font-bold' : 'text-gray-800 font-medium'
        ]">
          {{ card.text }}
        </span>
        <div class="flex justify-between items-end mt-2">
          <span class="text-[8px] font-black opacity-10">KPL</span>
          <div
            v-if="selectedCards.some(c => c.id === card.id)"
            class="w-5 h-5 rounded-full bg-yellow-400/30 text-yellow-800 flex items-center justify-center text-[10px] font-black"
          >
            {{ pick > 1 ? selectedCards.findIndex(c => c.id === card.id) + 1 : '✓' }}
          </div>
        </div>
      </template>

      <!-- Blank card (Carte Blanche) -->
      <template v-else>
        <div class="flex flex-col items-center justify-center flex-1 gap-1.5">
          <span class="text-2xl">✏️</span>
          <span class="text-xs font-black text-yellow-400 uppercase tracking-widest">Carte Blanche</span>
          <span class="text-[10px] text-yellow-400/50 text-center leading-tight">Napiš co chceš</span>
        </div>
        <div class="flex justify-between items-end mt-2">
          <span class="text-[8px] font-black text-yellow-400/20">KPL</span>
          <div
            v-if="selectedCards.some(c => c.isBlank)"
            class="w-5 h-5 rounded-full bg-yellow-400/30 text-yellow-400 flex items-center justify-center text-[10px] font-black"
          >
            {{ pick > 1 ? selectedCards.findIndex(c => c.isBlank) + 1 : '✓' }}
          </div>
        </div>
      </template>
    </button>
  </div>
</template>
```

**Step 2: Commit**
```bash
git add packages/frontend/src/components/game/atoms/CardHand.vue
git commit -m "feat(ui): render Carte Blanche blank card distinctly in CardHand"
```

---

### Task 7: Frontend — roomStore + SelectionPhase (submit modal)

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`
- Modify: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: roomStore.ts — update `playCards()` and expose `hasBlankCard`**

1a. Replace `playCards` function (line 212-216):
```typescript
function playCards(cardIds: number[], blankCardText?: string) {
  lastPlayedCards.value = [...selectedCards.value];
  socket.emit('game:playCards', { cardIds, blankCardText });
  selectedCards.value = [];
}
```

1b. Add computed after `specialRules` computed (around line ~25-30 in the store):
```typescript
const hasBlankCard = computed(() => hand.value.some(c => c.isBlank));
```

1c. Add `hasBlankCard` to the return object (line ~308).

**Step 2: SelectionPhase.vue — fix translation fetching to skip blank card**

2a. In the `watch` callback (lines 21-25), filter out blank card:
```typescript
watch(
  [() => roomStore.currentBlackCard, () => roomStore.hand, locale],
  async () => {
    const blackIds = roomStore.currentBlackCard ? [roomStore.currentBlackCard.id] : [];
    const whiteIds = roomStore.hand.filter(c => !c.isBlank).map(c => c.id);
    await cardTranslations.fetchTranslations(blackIds, whiteIds);
  },
  { immediate: true },
);
```

2b. Update `translatedHand` computed (lines 34-36) to pass blank card through:
```typescript
const translatedHand = computed(() =>
  roomStore.hand.map((c) =>
    c.isBlank ? c : { ...c, text: cardTranslations.getWhite(c.id, c.text) }
  ),
);
```

**Step 3: SelectionPhase.vue — add blank card modal**

3a. Add refs after existing refs (after `showTradeConfirm`):
```typescript
const showBlankCardModal = ref(false);
const blankCardText = ref('');
```

3b. Replace `submit()` function:
```typescript
function submit() {
  if (!canSubmit.value) return;
  const hasBlank = roomStore.selectedCards.some(c => c.isBlank);
  if (hasBlank) {
    blankCardText.value = '';
    showBlankCardModal.value = true;
    return;
  }
  roomStore.playCards(roomStore.selectedCards.map(c => c.id));
}

function confirmBlankCard() {
  if (!blankCardText.value.trim()) return;
  showBlankCardModal.value = false;
  roomStore.playCards(
    roomStore.selectedCards.map(c => c.id),
    blankCardText.value.trim(),
  );
}

function cancelBlankCard() {
  showBlankCardModal.value = false;
}
```

3c. Add modal to template — inside `<Teleport to="body">`, after the existing trade modal `</div>`:
```html
<!-- Carte Blanche: blank card text input modal -->
<div
  v-if="showBlankCardModal"
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  @click.self="cancelBlankCard"
>
  <div class="bg-gray-900 border border-yellow-400/20 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xl">✏️</span>
      <h2 class="text-lg font-bold text-white">{{ t('specialRules.carte_blanche_modal.title') }}</h2>
    </div>
    <p class="text-yellow-400/60 text-xs mb-4">{{ t('specialRules.carte_blanche_modal.hint') }}</p>
    <textarea
      v-model="blankCardText"
      :placeholder="t('specialRules.carte_blanche_modal.placeholder')"
      maxlength="200"
      rows="3"
      autofocus
      class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-yellow-400/40 mb-1"
    />
    <div class="text-right text-xs text-gray-500 mb-4">{{ blankCardText.length }}/200</div>
    <div class="flex gap-3">
      <button
        @click="cancelBlankCard"
        class="flex-1 py-3 rounded-xl font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
      >
        {{ t('specialRules.carte_blanche_modal.cancel') }}
      </button>
      <button
        @click="confirmBlankCard"
        :disabled="!blankCardText.trim()"
        class="flex-1 py-3 rounded-xl font-black text-black bg-yellow-500 hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_0_rgb(161,98,7)] active:shadow-none active:translate-y-0.5"
      >
        {{ t('specialRules.carte_blanche_modal.confirm') }}
      </button>
    </div>
  </div>
</div>
```

**Step 4: Run backend tests one final time**
```bash
npm test --workspace=packages/backend 2>&1 | tail -10
```
Expected: all PASS

**Step 5: Commit**
```bash
git add packages/frontend/src/stores/roomStore.ts packages/frontend/src/components/SelectionPhase.vue
git commit -m "feat(frontend): add carte_blanche submit modal and blank card support"
```

---

## Done — Summary of changes

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | SpecialRule, WhiteCard, BLANK_CARD_ID, game:playCards event |
| `packages/backend/src/game/GameEngine.ts` | blankCardsUsed, getPlayerHand, submitCards, retractCards, startRound, snapshot |
| `packages/backend/src/game/GameEngine.test.ts` | 9 new carte_blanche tests |
| `packages/backend/src/socket/validation.ts` | VALID_RULES, PlayCardsSchema |
| `packages/backend/src/socket/gameHandlers.ts` | game:playCards handler |
| `packages/frontend/src/i18n/locales/*.json` | 5 locale files |
| `packages/frontend/src/components/SpecialRulesPanel.vue` | Add carte_blanche toggle |
| `packages/frontend/src/components/game/atoms/CardHand.vue` | Blank card visual |
| `packages/frontend/src/stores/roomStore.ts` | playCards(), hasBlankCard |
| `packages/frontend/src/components/SelectionPhase.vue` | Modal, submit intercept, translation fix |
