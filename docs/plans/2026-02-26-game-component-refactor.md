# Game Component Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactorovat herní fáze do dvouvrstvé architektury — atomické prezentační komponenty + layout komponenty, s herní logikou výhradně v phase kontejnerech.

**Architecture:** Phase kontejnery (SelectionPhase, JudgingPhase, ResultsPhase, FinishedPhase) drží veškerou herní logiku (countdowny, socket eventy, store akce) a předávají data dolů přes props. Layout komponenty skládají atomické komponenty dohromady pro konkrétní kombinaci stavu hry a role hráče. Atomické komponenty jsou čistě prezentační — žádný přístup ke store, žádné side effects.

**Tech Stack:** Vue 3 (Composition API), TypeScript, Tailwind v4, `@kpl/shared` typy (Player, BlackCard, WhiteCard, AnonymousSubmission, RoundResult)

**Struktura nových souborů:**
```
packages/frontend/src/components/game/
  atoms/
    Countdown.vue
    BlackCard.vue
    RoundSkippedNotice.vue
    SubmissionStatus.vue
    CardHand.vue
    SubmissionGrid.vue
    Scoreboard.vue
    Podium.vue
  layouts/
    PlayerSelectingLayout.vue
    PlayerSubmittedLayout.vue
    CzarWaitingSelectionLayout.vue
    CzarJudgingLayout.vue
    WaitingForCzarLayout.vue
```

---

## Fáze 1: Atomické komponenty

### Task 1: Countdown atom

**Files:**
- Create: `packages/frontend/src/components/game/atoms/Countdown.vue`

**Step 1: Vytvoř komponentu**

```vue
<script setup lang="ts">
defineProps<{
  secondsLeft: number
  totalSeconds: number
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex-1 bg-gray-700 rounded-full h-2">
      <div
        class="h-2 rounded-full transition-all"
        :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-yellow-400'"
        :style="{ width: `${(secondsLeft / totalSeconds) * 100}%` }"
      />
    </div>
    <span class="text-sm font-mono" :class="secondsLeft <= 10 ? 'text-red-400' : 'text-gray-300'">
      {{ secondsLeft }}s
    </span>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/Countdown.vue
git commit -m "feat(frontend): add Countdown atom component"
```

---

### Task 2: BlackCard atom

**Files:**
- Create: `packages/frontend/src/components/game/atoms/BlackCard.vue`

**Step 1: Vytvoř komponentu**

```vue
<script setup lang="ts">
defineProps<{
  text: string
  pick?: number
}>()
</script>

<template>
  <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
    {{ text }}
    <div v-if="pick" class="text-sm font-normal mt-2 text-gray-400">
      Vyber {{ pick }} {{ pick === 1 ? 'kartu' : 'karty' }}
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/BlackCard.vue
git commit -m "feat(frontend): add BlackCard atom component"
```

---

### Task 3: RoundSkippedNotice atom

**Files:**
- Create: `packages/frontend/src/components/game/atoms/RoundSkippedNotice.vue`

**Step 1: Vytvoř komponentu**

```vue
<template>
  <div class="bg-orange-900 border border-orange-500 text-orange-200 rounded-lg px-4 py-3 text-sm">
    Kolo bylo přeskočeno — časový limit vypršel.
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/RoundSkippedNotice.vue
git commit -m "feat(frontend): add RoundSkippedNotice atom component"
```

---

### Task 4: SubmissionStatus atom

Tato komponenta dostane pole hráčů a interně si je rozřadí do skupin — to je zobrazovací logika.

**Files:**
- Create: `packages/frontend/src/components/game/atoms/SubmissionStatus.vue`

**Step 1: Vytvoř komponentu**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Player } from '@kpl/shared'

const props = defineProps<{
  players: Player[]
}>()

const czar = computed(() => props.players.find(p => p.isCardCzar))
const submitted = computed(() => props.players.filter(p => !p.isCardCzar && p.hasPlayed))
const waitingFor = computed(() => props.players.filter(p => !p.isCardCzar && !p.isAfk && !p.hasPlayed))
const afkPlayers = computed(() => props.players.filter(p => !p.isCardCzar && p.isAfk && !p.hasPlayed))
</script>

<template>
  <div class="text-sm space-y-1 bg-gray-800 rounded-lg px-4 py-3">
    <div v-if="czar" class="text-yellow-400">
      🎴 {{ czar.nickname }} — karetní král
    </div>
    <div v-for="p in submitted" :key="p.id" class="text-green-400">
      ✓ {{ p.nickname }}
    </div>
    <div v-for="p in waitingFor" :key="p.id" class="text-gray-400">
      ⏳ {{ p.nickname }}
    </div>
    <div v-for="p in afkPlayers" :key="p.id" class="text-gray-600">
      💤 {{ p.nickname }} (AFK)
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/SubmissionStatus.vue
git commit -m "feat(frontend): add SubmissionStatus atom component"
```

---

### Task 5: CardHand atom

**Files:**
- Create: `packages/frontend/src/components/game/atoms/CardHand.vue`

**Step 1: Vytvoř komponentu**

```vue
<script setup lang="ts">
import type { WhiteCard } from '@kpl/shared'

defineProps<{
  cards: WhiteCard[]
  selectedCards: WhiteCard[]
  pick: number
}>()

const emit = defineEmits<{
  toggle: [card: WhiteCard]
}>()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <button
      v-for="card in cards"
      :key="card.id"
      @click="emit('toggle', card)"
      :class="[
        'bg-white text-black rounded-lg p-4 text-sm font-medium text-left transition-all border-4',
        selectedCards.some(c => c.id === card.id)
          ? 'border-yellow-400 ring-2 ring-yellow-400'
          : 'border-transparent hover:border-gray-300',
      ]"
    >
      {{ card.text }}
    </button>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/CardHand.vue
git commit -m "feat(frontend): add CardHand atom component"
```

---

### Task 6: SubmissionGrid atom

Zobrazuje anonymní submise. `selectable` prop určuje zda je kliknutelná (pouze pro czara).

**Files:**
- Create: `packages/frontend/src/components/game/atoms/SubmissionGrid.vue`

**Step 1: Vytvoř komponentu**

```vue
<script setup lang="ts">
import type { AnonymousSubmission } from '@kpl/shared'

defineProps<{
  submissions: AnonymousSubmission[]
  selectable: boolean
}>()

const emit = defineEmits<{
  pick: [submissionId: string]
}>()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
    <button
      v-for="submission in submissions"
      :key="submission.submissionId"
      @click="selectable && emit('pick', submission.submissionId)"
      :disabled="!selectable"
      class="bg-white text-black rounded-xl p-5 text-left space-y-2 border-4 border-transparent transition-all"
      :class="selectable ? 'hover:border-yellow-400 cursor-pointer' : 'cursor-default'"
    >
      <p v-for="card in submission.cards" :key="card.id" class="font-medium">
        {{ card.text }}
      </p>
    </button>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/SubmissionGrid.vue
git commit -m "feat(frontend): add SubmissionGrid atom component"
```

---

### Task 7: Scoreboard atom

Sdílená tabulka skóre pro ResultsPhase i FinishedPhase. Prop `showRank` přidá sloupec s pořadím.

**Files:**
- Create: `packages/frontend/src/components/game/atoms/Scoreboard.vue`

**Step 1: Vytvoř komponentu**

```vue
<script setup lang="ts">
defineProps<{
  entries: { id: string; rank?: number; nickname: string; score: number }[]
  showRank?: boolean
}>()
</script>

<template>
  <div>
    <div
      v-for="entry in entries"
      :key="entry.id"
      class="flex justify-between items-center py-2 border-b border-gray-700"
    >
      <span v-if="showRank && entry.rank" class="text-gray-400 w-6">{{ entry.rank }}.</span>
      <span :class="showRank ? 'flex-1 ml-2' : 'flex-1'">{{ entry.nickname }}</span>
      <span class="font-bold text-yellow-400">{{ entry.score }}</span>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/Scoreboard.vue
git commit -m "feat(frontend): add Scoreboard atom component"
```

---

### Task 8: Podium atom

Top 3 hráči ve vizuálním podiu — zobrazuje se na konci hry.

**Files:**
- Create: `packages/frontend/src/components/game/atoms/Podium.vue`

**Step 1: Vytvoř komponentu**

Podium očekává entries seřazené od nejlepšího (index 0 = 1. místo). Vizuálně zobrazí: 2. vlevo, 1. uprostřed a nejvýše, 3. vpravo.

```vue
<script setup lang="ts">
defineProps<{
  entries: { id: string; nickname: string; score: number }[]
}>()
</script>

<template>
  <div class="flex items-end justify-center gap-4">
    <div v-if="entries[1]" class="text-center">
      <div class="bg-gray-600 rounded-t-lg px-4 py-6 w-24">
        <p class="font-bold truncate">{{ entries[1].nickname }}</p>
        <p class="text-2xl font-bold text-gray-300">{{ entries[1].score }}</p>
      </div>
      <div class="bg-gray-500 text-center py-1 rounded-b-sm text-sm">2.</div>
    </div>
    <div v-if="entries[0]" class="text-center">
      <div class="bg-yellow-700 rounded-t-lg px-4 py-8 w-28">
        <p class="text-2xl">🏆</p>
        <p class="font-bold truncate">{{ entries[0].nickname }}</p>
        <p class="text-2xl font-bold text-yellow-300">{{ entries[0].score }}</p>
      </div>
      <div class="bg-yellow-600 text-center py-1 rounded-b-sm text-sm font-bold">1.</div>
    </div>
    <div v-if="entries[2]" class="text-center">
      <div class="bg-gray-700 rounded-t-lg px-4 py-4 w-24">
        <p class="font-bold truncate">{{ entries[2].nickname }}</p>
        <p class="text-2xl font-bold text-gray-400">{{ entries[2].score }}</p>
      </div>
      <div class="bg-gray-600 text-center py-1 rounded-b-sm text-sm">3.</div>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/Podium.vue
git commit -m "feat(frontend): add Podium atom component"
```

---

## Fáze 2: Layout komponenty pro SelectionPhase

### Task 9: Tři layouty pro SelectionPhase

Každý layout odpovídá jedné kombinaci stavu (fáze SELECTION) a role hráče.

**Files:**
- Create: `packages/frontend/src/components/game/layouts/PlayerSelectingLayout.vue`
- Create: `packages/frontend/src/components/game/layouts/PlayerSubmittedLayout.vue`
- Create: `packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue`

**Step 1: PlayerSelectingLayout.vue** — hráč vybírá karty z ruky

```vue
<script setup lang="ts">
import type { BlackCard, WhiteCard, Player } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionStatus from '../atoms/SubmissionStatus.vue'
import CardHand from '../atoms/CardHand.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

const props = defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  hand: WhiteCard[]
  selectedCards: WhiteCard[]
  canSubmit: boolean
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  toggleCard: [card: WhiteCard]
  submit: []
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
    <SubmissionStatus :players="players" />
    <CardHand
      :cards="hand"
      :selectedCards="selectedCards"
      :pick="blackCard.pick"
      @toggle="emit('toggleCard', $event)"
    />
    <button
      @click="emit('submit')"
      :disabled="!canSubmit"
      class="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Odeslat {{ selectedCards.length }}/{{ blackCard.pick }} karet
    </button>
  </div>
</template>
```

**Step 2: PlayerSubmittedLayout.vue** — hráč odeslal, čeká na ostatní

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
  retracting: boolean
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  retract: []
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
    <SubmissionStatus :players="players" />
    <div class="space-y-3">
      <p class="text-green-400 font-semibold text-lg">Karty odeslány — čekáme na ostatní...</p>
      <button
        @click="emit('retract')"
        :disabled="retracting"
        class="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Změnit výběr
      </button>
    </div>
  </div>
</template>
```

**Step 3: CzarWaitingSelectionLayout.vue** — czar čeká, ostatní vybírají

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
  </div>
</template>
```

**Step 4: Commit**

```bash
git add packages/frontend/src/components/game/layouts/PlayerSelectingLayout.vue
git add packages/frontend/src/components/game/layouts/PlayerSubmittedLayout.vue
git add packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue
git commit -m "feat(frontend): add SelectionPhase layout components"
```

---

## Fáze 3: Layout komponenty pro JudgingPhase

### Task 10: Dva layouty pro JudgingPhase

**Files:**
- Create: `packages/frontend/src/components/game/layouts/CzarJudgingLayout.vue`
- Create: `packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue`

**Step 1: CzarJudgingLayout.vue** — czar vybírá vítěze

```vue
<script setup lang="ts">
import type { BlackCard, AnonymousSubmission } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionGrid from '../atoms/SubmissionGrid.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  submissions: AnonymousSubmission[]
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  pick: [submissionId: string]
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" />
    <p class="text-yellow-400 font-semibold text-lg">Jsi karetní král — vyber nejlepší odpověď!</p>
    <SubmissionGrid :submissions="submissions" :selectable="true" @pick="emit('pick', $event)" />
  </div>
</template>
```

**Step 2: WaitingForCzarLayout.vue** — ostatní čekají na výběr czara

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
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/game/layouts/CzarJudgingLayout.vue
git add packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue
git commit -m "feat(frontend): add JudgingPhase layout components"
```

---

## Fáze 4: Refaktor phase kontejnerů

### Task 11: Refaktor SelectionPhase.vue

Nahraď inline HTML importy layout komponent. Herní logika (countdown interval, submit, retract) zůstane.

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: Přepiš soubor**

```vue
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';
import type { WhiteCard } from '@kpl/shared';
import PlayerSelectingLayout from './game/layouts/PlayerSelectingLayout.vue';
import PlayerSubmittedLayout from './game/layouts/PlayerSubmittedLayout.vue';
import CzarWaitingSelectionLayout from './game/layouts/CzarWaitingSelectionLayout.vue';

const roomStore = useRoomStore();
const pick = computed(() => roomStore.currentBlackCard?.pick ?? 1);
const canSubmit = computed(() => roomStore.selectedCards.length === pick.value);
const retracting = ref(false);

// --- Countdown ---
const secondsLeft = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

watch(
  () => roomStore.room?.roundDeadline,
  (deadline) => {
    if (countdownInterval) clearInterval(countdownInterval);
    if (!deadline) { secondsLeft.value = 0; return; }
    const update = () => {
      secondsLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    };
    update();
    countdownInterval = setInterval(update, 1000);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

// --- Submit / retract ---
function submit() {
  if (!canSubmit.value) return;
  roomStore.playCards(roomStore.selectedCards.map(c => c.id));
}

function retract() {
  retracting.value = true;
  roomStore.retractCards();
}

watch(() => roomStore.hand, () => { retracting.value = false; });

function onGameError() { retracting.value = false; }
socket.on('game:error', onGameError);
onUnmounted(() => { socket.off('game:error', onGameError); });

const players = computed(() => roomStore.room?.players ?? []);
</script>

<template>
  <CzarWaitingSelectionLayout
    v-if="roomStore.isCardCzar"
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :roundSkipped="roomStore.roundSkipped"
  />
  <PlayerSubmittedLayout
    v-else-if="roomStore.me?.hasPlayed"
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :retracting="retracting"
    :roundSkipped="roomStore.roundSkipped"
    @retract="retract"
  />
  <PlayerSelectingLayout
    v-else
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :hand="roomStore.hand"
    :selectedCards="roomStore.selectedCards"
    :canSubmit="canSubmit"
    :roundSkipped="roomStore.roundSkipped"
    @toggleCard="roomStore.toggleCardSelection"
    @submit="submit"
  />
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue
git commit -m "refactor(frontend): SelectionPhase uses layout components"
```

---

### Task 12: Refaktor JudgingPhase.vue

Odstraní duplicitní countdown kód a inline HTML — nahrazuje layout komponentami.

**Files:**
- Modify: `packages/frontend/src/components/JudgingPhase.vue`

**Step 1: Přepiš soubor**

```vue
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import CzarJudgingLayout from './game/layouts/CzarJudgingLayout.vue';
import WaitingForCzarLayout from './game/layouts/WaitingForCzarLayout.vue';

const roomStore = useRoomStore();

// --- Countdown ---
const secondsLeft = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

watch(
  () => roomStore.room?.roundDeadline,
  (deadline) => {
    if (countdownInterval) clearInterval(countdownInterval);
    if (!deadline) { secondsLeft.value = 0; return; }
    const update = () => {
      secondsLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    };
    update();
    countdownInterval = setInterval(update, 1000);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

function pickWinner(submissionId: string) {
  roomStore.judgeSelect(submissionId);
}
</script>

<template>
  <CzarJudgingLayout
    v-if="roomStore.isCardCzar"
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="60"
    :submissions="roomStore.submissions"
    :roundSkipped="roomStore.roundSkipped"
    @pick="pickWinner"
  />
  <WaitingForCzarLayout
    v-else
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :submissions="roomStore.submissions"
    :roundSkipped="roomStore.roundSkipped"
  />
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/JudgingPhase.vue
git commit -m "refactor(frontend): JudgingPhase uses layout components"
```

---

### Task 13: Refaktor ResultsPhase.vue

Nahraď inline tabulku skóre atomem `Scoreboard`.

**Files:**
- Modify: `packages/frontend/src/components/ResultsPhase.vue`

**Step 1: Přepiš soubor**

Scoreboard entries musí mít `id` pro key — přidej `id: p.id` do map().

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import Scoreboard from './game/atoms/Scoreboard.vue';

const roomStore = useRoomStore();
const endingGame = ref(false);
const endGameError = ref('');

const scoreboard = computed(() => {
  const result = roomStore.roundResult;
  const players = roomStore.room?.players ?? [];
  if (!result) return [];
  return players
    .map(p => ({ id: p.id, nickname: p.nickname, score: result.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
});

async function onEndGame() {
  endingGame.value = true;
  const err = await roomStore.endGame();
  if (err) {
    endGameError.value = err.error;
    endingGame.value = false;
  }
}
</script>

<template>
  <div class="space-y-8 text-center">
    <!-- Vítěz kola -->
    <div>
      <p class="text-gray-400 text-lg mb-2">Vítěz kola</p>
      <h2 class="text-4xl font-bold text-yellow-400">
        {{ roomStore.roundResult?.winnerNickname ?? '...' }}
      </h2>
    </div>

    <!-- Vítězné karty -->
    <div class="flex flex-wrap gap-3 justify-center">
      <div
        v-for="card in roomStore.roundResult?.winningCards ?? []"
        :key="card.id"
        class="bg-white text-black rounded-lg p-4 text-sm font-medium max-w-xs text-left"
      >
        {{ card.text }}
      </div>
    </div>

    <!-- Skóre -->
    <div class="max-w-sm mx-auto text-left">
      <h3 class="text-xl font-semibold mb-3">Skóre</h3>
      <Scoreboard :entries="scoreboard" />
    </div>

    <p class="text-gray-500 text-sm">Nové kolo začíná za 5 sekund...</p>

    <!-- Host: ukončit hru -->
    <div v-if="roomStore.isHost" class="pt-4 border-t border-gray-700">
      <p v-if="endGameError" class="text-red-400 text-sm mb-2">{{ endGameError }}</p>
      <button
        @click="onEndGame"
        :disabled="endingGame"
        class="bg-red-700 hover:bg-red-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Ukončit hru
      </button>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/ResultsPhase.vue
git commit -m "refactor(frontend): ResultsPhase uses Scoreboard atom"
```

---

### Task 14: Refaktor FinishedPhase.vue

Nahraď inline podium a tabulku atomy `Podium` a `Scoreboard`.

**Files:**
- Modify: `packages/frontend/src/components/FinishedPhase.vue`

**Step 1: Přepiš soubor**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import Podium from './game/atoms/Podium.vue';
import Scoreboard from './game/atoms/Scoreboard.vue';

const roomStore = useRoomStore();
const returning = ref(false);
const returnError = ref('');

const scoreboard = computed(() => {
  const players = roomStore.room?.players ?? [];
  return [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, id: p.id, nickname: p.nickname, score: p.score }));
});

async function onReturnToLobby() {
  returning.value = true;
  const err = await roomStore.returnToLobby();
  if (err) {
    returnError.value = err.error;
    returning.value = false;
  }
}
</script>

<template>
  <div class="space-y-8 text-center max-w-md mx-auto">
    <div>
      <h2 class="text-4xl font-bold text-yellow-400 mb-1">Hra skončila!</h2>
      <p class="text-gray-400">Finální výsledky</p>
    </div>

    <Podium v-if="scoreboard.length > 0" :entries="scoreboard" />

    <div class="text-left">
      <Scoreboard :entries="scoreboard" :showRank="true" />
    </div>

    <div class="pt-2">
      <p v-if="returnError" class="text-red-400 text-sm mb-2">{{ returnError }}</p>
      <button
        v-if="roomStore.isHost"
        @click="onReturnToLobby"
        :disabled="returning"
        class="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Návrat do lobby
      </button>
      <p v-else class="text-gray-500 text-sm">
        Čekáme na hostitele...
      </p>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/FinishedPhase.vue
git commit -m "refactor(frontend): FinishedPhase uses Podium and Scoreboard atoms"
```

---

## Fáze 5: Vizuální ověření

### Task 15: Spusť dev server a ověř všechny fáze

**Step 1: Spusť frontend**

```bash
npm run dev:frontend
```

Zkontroluj TypeScript chyby při startu — Vite je zobrazí v konzoli.

**Step 2: Ověř každou herní fázi**

- SELECTION: Hráč vybírá karty → vidí CardHand + BlackCard + Countdown + SubmissionStatus
- SELECTION: Hráč odeslal → vidí "Karty odeslány" + tlačítko "Změnit výběr"
- SELECTION: Czar čeká → vidí "Jsi karetní král — čekej..."
- JUDGING: Czar → vidí SubmissionGrid s klikatelnými kartami + Countdown
- JUDGING: Hráč → vidí SubmissionGrid bez interakce + časovač v textu
- RESULTS: Vítěz kola + Scoreboard
- FINISHED: Podium + Scoreboard se sloupcem pořadí

**Step 3: Ověř TypeScript**

```bash
npx tsc --noEmit --project packages/frontend/tsconfig.json
```

Pokud jsou chyby, oprav je a commitni jako `fix(frontend): TS errors in component refactor`.
