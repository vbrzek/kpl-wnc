# Trade Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Umožnit hráči vyměnit celou ruku karet za cenu 1 bodu (jednou za kolo, jen ve fázi SELECTION, jen non-czar hráčům).

**Architecture:** Nová metoda `tradeHand()` v `GameEngine` sleduje kdo v kole už vyměnil (`tradedThisRound: Set<string>`). Nový socket event `game:tradeCards` v backendu odečte bod, vyhodí ruku do `usedWhiteCards`, rozdá novou a pošle `game:handUpdate`. Frontend přidá tlačítko do `PlayerSelectingLayout` (s propem `canTrade`) + inline confirm modal v `SelectionPhase`.

**Tech Stack:** TypeScript, Node.js + Socket.io, Vue 3 Composition API, vue-i18n, Zod (validation), Vitest (tests)

---

### Task 1: GameEngine — metoda `tradeHand` + testy

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Test: `packages/backend/src/game/GameEngine.test.ts`

**Step 1: Napiš failing testy**

Na konec bloku `describe('GameEngine', ...)` v `GameEngine.test.ts` přidej:

```typescript
// --- tradeHand ---

describe('tradeHand', () => {
  it('returns error if player not found', () => {
    engine.startRound();
    const result = engine.tradeHand('nonexistent');
    expect(result).toHaveProperty('error');
  });

  it('returns error if player is card czar', () => {
    engine.startRound();
    const czar = players.find(p => p.isCardCzar)!;
    const result = engine.tradeHand(czar.id);
    expect(result).toHaveProperty('error');
  });

  it('returns error if player has already played', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const cardId = engine.getPlayerHand(nonCzar.id)[0].id;
    engine.submitCards(nonCzar.id, [cardId]);
    const result = engine.tradeHand(nonCzar.id);
    expect(result).toHaveProperty('error');
  });

  it('returns error if player score is 0', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 0;
    const result = engine.tradeHand(nonCzar.id);
    expect(result).toHaveProperty('error');
  });

  it('returns error if player already traded this round', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 2;
    engine.tradeHand(nonCzar.id); // první výměna OK
    const result = engine.tradeHand(nonCzar.id); // druhá — chyba
    expect(result).toHaveProperty('error');
  });

  it('deducts 1 point from player on successful trade', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 3;
    engine.tradeHand(nonCzar.id);
    expect(nonCzar.score).toBe(2);
  });

  it('returns new hand of 10 cards', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 1;
    const result = engine.tradeHand(nonCzar.id);
    expect('newHand' in result && result.newHand).toHaveLength(10);
  });

  it('new hand cards are different from old hand', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 1;
    const oldHand = engine.getPlayerHand(nonCzar.id).map(c => c.id);
    const result = engine.tradeHand(nonCzar.id) as { newHand: WhiteCard[] };
    const newIds = result.newHand.map(c => c.id);
    // žádná karta ze staré ruky není v nové (min. liší se)
    expect(newIds.some(id => !oldHand.includes(id))).toBe(true);
  });

  it('resets traded flag at start of new round', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 2;
    engine.tradeHand(nonCzar.id); // kolo 1 — vyměněno
    engine.startRound(); // kolo 2 — reset
    nonCzar.score = 1;
    const result = engine.tradeHand(nonCzar.id);
    expect(result).not.toHaveProperty('error');
  });
});
```

**Step 2: Spusť testy — ověř, že failují**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | tail -30
```

Očekáváno: FAIL — `engine.tradeHand is not a function`

**Step 3: Implementuj `tradeHand` v `GameEngine.ts`**

Přidej privátní field za `usedWhiteCards`:
```typescript
private tradedThisRound = new Set<string>();
```

Na začátek `startRound()`, hned za `this.submissions.clear()`:
```typescript
this.tradedThisRound.clear();
```

Přidej metodu za `retractCards()`:
```typescript
tradeHand(playerId: string): { newHand: WhiteCard[] } | { error: string } {
  const player = this.players.find(p => p.id === playerId);
  if (!player) return { error: 'Hráč nenalezen.' };
  if (player.isCardCzar) return { error: 'Card Czar nemůže vyměňovat karty.' };
  if (player.hasPlayed) return { error: 'Nelze vyměnit karty po odevzdání.' };
  if (player.score < 1) return { error: 'Nemáš dostatek bodů pro výměnu karet.' };
  if (this.tradedThisRound.has(playerId)) return { error: 'V tomto kole jsi již karty vyměnil.' };

  // Odhoď starou ruku do odhazovacího balíčku
  const oldHand = this.playerHands.get(playerId) ?? [];
  this.usedWhiteCards.push(...oldHand);
  this.playerHands.set(playerId, []);

  // Lízni novou ruku
  const newHand: WhiteCard[] = [];
  while (newHand.length < HAND_SIZE) {
    if (this.whiteDeck.length === 0 && this.usedWhiteCards.length > 0) {
      this.whiteDeck = shuffle(this.usedWhiteCards);
      this.usedWhiteCards = [];
    }
    const card = this.whiteDeck.pop();
    if (!card) break;
    newHand.push(card);
  }
  this.playerHands.set(playerId, newHand);

  player.score--;
  this.tradedThisRound.add(playerId);

  return { newHand };
}
```

**Step 4: Spusť testy — ověř, že projdou**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | tail -30
```

Očekáváno: všechny testy PASS

**Step 5: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat(engine): add tradeHand method — trade 1 point for a new hand of cards

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

### Task 2: Shared types — nový socket event

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Přidej event do `ClientToServerEvents`**

Za `'game:retractCards': () => void;` přidej:
```typescript
'game:tradeCards': () => void;
```

**Step 2: Ověř TypeScript kompilaci**

```bash
npm run build --workspace=packages/shared 2>&1
```

Očekáváno: no errors

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add game:tradeCards client event type

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

### Task 3: Backend handler — `game:tradeCards`

**Files:**
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Přidej handler na konec `registerGameHandlers` (před uzavírací `}` funkce)**

```typescript
// Player trades entire hand for 1 point (once per round, SELECTION only)
socket.on('game:tradeCards', () => {
  const playerToken = socketToToken.get(socket.id);
  if (!playerToken) return;

  const room = roomManager.getRoomByPlayerToken(playerToken);
  if (!room || room.status !== 'SELECTION') {
    socket.emit('game:error', 'Karty lze vyměnit pouze ve fázi výběru.');
    return;
  }

  const engine = roomManager.getGameEngine(room.code);
  if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

  const playerId = roomManager.getPlayerIdByToken(playerToken)!;
  const result = engine.tradeHand(playerId);

  if ('error' in result) {
    socket.emit('game:error', result.error);
    return;
  }

  roomManager.updateActivity(room.code);
  socket.emit('game:handUpdate', result.newHand);
  io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
});
```

**Step 2: Ověř TypeScript kompilaci backendu**

```bash
npm run build --workspace=packages/backend 2>&1
```

Očekáváno: no errors

**Step 3: Commit**

```bash
git add packages/backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): handle game:tradeCards socket event

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

### Task 4: Frontend store + i18n

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Přidej `tradeCards()` do `roomStore.ts`**

Za funkci `retractCards()`:
```typescript
function tradeCards() {
  socket.emit('game:tradeCards');
  selectedCards.value = [];
}
```

Do `return` objektu přidej `tradeCards` vedle `retractCards`:
```typescript
playCards, judgeSelect, toggleCardSelection, retractCards, tradeCards, czarForceAdvance, skipCzarJudging,
```

**Step 2: Přidej překlady do i18n souborů**

Do sekce `"game"."selection"` v každém souboru:

`cs.json`:
```json
"trade": "Vyměnit karty (1 bod)",
"tradeConfirmTitle": "Vyměnit karty?",
"tradeConfirmText": "Odhodíš svou ruku do odhazovacího balíčku a líznešs i 10 nových karet. Stojí to 1 bod.",
"tradeConfirm": "Vyměnit",
"tradeCancel": "Zrušit"
```

`en.json`:
```json
"trade": "Trade hand (1 point)",
"tradeConfirmTitle": "Trade your hand?",
"tradeConfirmText": "Your hand will be discarded and you will draw 10 new cards. This costs 1 point.",
"tradeConfirm": "Trade",
"tradeCancel": "Cancel"
```

`ru.json`:
```json
"trade": "Обменять карты (1 очко)",
"tradeConfirmTitle": "Обменять карты?",
"tradeConfirmText": "Твои карты будут сброшены, и ты возьмёшь 10 новых. Это стоит 1 очко.",
"tradeConfirm": "Обменять",
"tradeCancel": "Отмена"
```

`uk.json`:
```json
"trade": "Замінити карти (1 очко)",
"tradeConfirmTitle": "Замінити карти?",
"tradeConfirmText": "Твої карти будуть скинуті, і ти візьмеш 10 нових. Це коштує 1 очко.",
"tradeConfirm": "Замінити",
"tradeCancel": "Скасувати"
```

`es.json`:
```json
"trade": "Cambiar cartas (1 punto)",
"tradeConfirmTitle": "¿Cambiar tus cartas?",
"tradeConfirmText": "Tus cartas serán descartadas y robarás 10 nuevas. Cuesta 1 punto.",
"tradeConfirm": "Cambiar",
"tradeCancel": "Cancelar"
```

**Step 3: Ověř TypeScript**

```bash
npm run build --workspace=packages/frontend 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts packages/frontend/src/i18n/
git commit -m "feat(frontend): add tradeCards store action and i18n translations

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

### Task 5: Frontend UI — tlačítko + confirm modal

**Files:**
- Modify: `packages/frontend/src/components/game/layouts/PlayerSelectingLayout.vue`
- Modify: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: Uprav `PlayerSelectingLayout.vue`**

Přidej `canTrade` do props a `trade` do emits:

```typescript
const props = defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  hand: WhiteCard[]
  selectedCards: WhiteCard[]
  canSubmit: boolean
  canTrade: boolean        // ← přidej
  roundSkipped: boolean
  czarNickname: string
}>()

const emit = defineEmits<{
  toggleCard: [card: WhiteCard]
  submit: []
  trade: []               // ← přidej
}>()
```

Za `CardHand` (před fixed bottom div) přidej tlačítko výměny. Vlož ho do `<div class="flex-1 ...">` za `<CardHand>`:

```html
<div v-if="canTrade" class="px-1 mt-3 text-center">
  <button
    @click="emit('trade')"
    class="text-sm text-gray-400 underline underline-offset-2 hover:text-yellow-400 transition-colors"
  >
    {{ t('game.selection.trade') }}
  </button>
</div>
```

**Step 2: Uprav `SelectionPhase.vue`**

Přidej `showTradeConfirm` ref a funkce:

```typescript
const showTradeConfirm = ref(false);

function onTradeRequest() {
  showTradeConfirm.value = true;
}

function confirmTrade() {
  showTradeConfirm.value = false;
  roomStore.tradeCards();
}

function cancelTrade() {
  showTradeConfirm.value = false;
}
```

Computed `canTrade`:
```typescript
const canTrade = computed(
  () => (roomStore.me?.score ?? 0) >= 1 && !roomStore.me?.hasPlayed
);
```

V `<template>` přidej `canTrade` a `@trade` do `<PlayerSelectingLayout>`:
```html
<PlayerSelectingLayout
  v-else
  :blackCard="translatedBlackCard!"
  :secondsLeft="secondsLeft"
  :totalSeconds="45"
  :players="players"
  :hand="translatedHand"
  :selectedCards="roomStore.selectedCards"
  :canSubmit="canSubmit"
  :canTrade="canTrade"
  :roundSkipped="roomStore.roundSkipped"
  @toggleCard="roomStore.toggleCardSelection"
  :czarNickname="czarNickname"
  @submit="submit"
  @trade="onTradeRequest"
/>
```

Přidej confirm modal za `<PlayerSelectingLayout>` (ale před host end-game button):
```html
<!-- Trade confirm modal -->
<Teleport to="body">
  <div
    v-if="showTradeConfirm"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
    @click.self="cancelTrade"
  >
    <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
      <h2 class="text-lg font-bold text-white mb-2">{{ t('game.selection.tradeConfirmTitle') }}</h2>
      <p class="text-gray-400 text-sm mb-6">{{ t('game.selection.tradeConfirmText') }}</p>
      <div class="flex gap-3">
        <button
          @click="cancelTrade"
          class="flex-1 py-3 rounded-xl font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          {{ t('game.selection.tradeCancel') }}
        </button>
        <button
          @click="confirmTrade"
          class="flex-1 py-3 rounded-xl font-black text-black bg-yellow-500 hover:bg-yellow-400 transition-colors shadow-[0_4px_0_rgb(161,98,7)] active:shadow-none active:translate-y-0.5"
        >
          {{ t('game.selection.tradeConfirm') }}
        </button>
      </div>
    </div>
  </div>
</Teleport>
```

**Step 3: Ověř build**

```bash
npm run build --workspace=packages/frontend 2>&1 | head -30
```

Očekáváno: no errors

**Step 4: Commit**

```bash
git add packages/frontend/src/components/
git commit -m "feat(frontend): add trade hand button and confirmation modal in selection phase

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Manuální ověření

Po implementaci všech tasků:

1. Spusť backend + frontend: `npm run dev:backend` + `npm run dev:frontend`
2. Vytvoř stůl se 3 hráči, spusť hru
3. Hráč s 0 body — tlačítko "Vyměnit karty" **se nezobrazí**
4. Hráč s ≥1 bodem — tlačítko **se zobrazí** pod kartami
5. Kliknutí otevře modal — Cancel zavře bez akce, skóre beze změny
6. Confirm → skóre -1, nová ruka 10 karet, tlačítko zmizí (hasTraded)
7. Card Czar tlačítko **nikdy nevidí**
8. Po odevzdání karet (`hasPlayed = true`) tlačítko **zmizí**
9. V novém kole se tlačítko znovu zobrazí (pokud má bod)
