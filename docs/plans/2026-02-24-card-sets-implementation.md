# Card Sets REST API + Lobby Selection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** GET /api/card-sets endpoint se seed daty + výběr sad karet v CreateTableModal.

**Architecture:** DB singleton (Knex) sdílený Fastify routami; jeden GET endpoint vrací sady s počty karet; frontend fetchuje při otevření modalu a posílá `selectedSetIds` přes existující `lobby:create` socket event.

**Tech Stack:** Fastify 5, Knex 3, MySQL2, Vue 3 Composition API, Pinia, Vitest

**Worktree:** `.worktrees/card-sets` — branch `feature/card-sets`

---

### Task 1: DB singleton

**Files:**
- Modify: `packages/backend/src/db/knexfile.ts`
- Create: `packages/backend/src/db/db.ts`

**Step 1: Přidej seeds config do knexfile.ts**

Stávající obsah `knexfile.ts` rozšiř o `seeds`:

```ts
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env') });

const config: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  migrations: {
    directory: './src/db/migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  seeds: {
    directory: './src/db/seeds',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};

export default config;
```

**Step 2: Vytvoř DB singleton `packages/backend/src/db/db.ts`**

```ts
import knex from 'knex';
import knexConfig from './knexfile.js';

const db = knex(knexConfig);

export default db;
```

**Step 3: Commit**

```bash
git add packages/backend/src/db/knexfile.ts packages/backend/src/db/db.ts
git commit -m "feat(backend): add Knex db singleton and seeds config"
```

---

### Task 2: GET /api/card-sets route

**Files:**
- Create: `packages/backend/src/routes/cardSets.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Vytvoř route plugin `packages/backend/src/routes/cardSets.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import db from '../db/db.js';

interface CardSetRow {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  isPublic: number;
  blackCardCount: string;
  whiteCardCount: string;
}

const cardSetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/card-sets', async () => {
    const rows = await db('card_sets').select<CardSetRow[]>(
      'id',
      'name',
      'description',
      'slug',
      db.raw('is_public as isPublic'),
      db.raw('(SELECT COUNT(*) FROM black_cards WHERE card_set_id = card_sets.id) as blackCardCount'),
      db.raw('(SELECT COUNT(*) FROM white_cards WHERE card_set_id = card_sets.id) as whiteCardCount'),
    ).orderBy('name');

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      slug: r.slug,
      isPublic: Boolean(r.isPublic),
      blackCardCount: Number(r.blackCardCount),
      whiteCardCount: Number(r.whiteCardCount),
    }));
  });
};

export default cardSetsRoutes;
```

**Step 2: Zaregistruj route v `packages/backend/src/index.ts`**

Za řádek `import { registerLobbyHandlers }...` přidej import:
```ts
import cardSetsRoutes from './routes/cardSets.js';
```

Za `app.get('/health', ...)` přidej:
```ts
await app.register(cardSetsRoutes, { prefix: '/api' });
```

**Step 3: Manuální ověření** (po spuštění seed dat v Task 3)

```bash
curl http://localhost:3000/api/card-sets
# Očekávaný výstup: JSON pole se sadou "Základní česká sada"
```

**Step 4: Commit**

```bash
git add packages/backend/src/routes/cardSets.ts packages/backend/src/index.ts
git commit -m "feat(backend): add GET /api/card-sets endpoint"
```

---

### Task 3: Seed data + seed script

**Files:**
- Create: `packages/backend/src/db/seed.ts`
- Create: `packages/backend/src/db/seeds/01_czech_set.ts`
- Modify: `packages/backend/package.json`

**Step 1: Vytvoř seed runner `packages/backend/src/db/seed.ts`**

```ts
import knex from 'knex';
import knexConfig from './knexfile.js';

const db = knex(knexConfig);

const [log] = await db.seed.run();
if ((log as string[]).length === 0) {
  console.log('No seeds to run');
} else {
  console.log(`Seeds run: ${(log as string[]).join(', ')}`);
}
await db.destroy();
```

**Step 2: Vytvoř seed soubor `packages/backend/src/db/seeds/01_czech_set.ts`**

```ts
import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('white_cards').del();
  await knex('black_cards').del();
  await knex('card_sets').del();

  const [setId] = await knex('card_sets').insert({
    name: 'Základní česká sada',
    description: 'Standardní sada pro českou verzi hry.',
    is_public: true,
    slug: 'zakladni-ceska-sada',
  });

  await knex('black_cards').insert([
    { card_set_id: setId, text: 'Proč jsem přišel o práci? ____.', pick: 1 },
    { card_set_id: setId, text: 'Moje babička si přála k Vánocům ____.', pick: 1 },
    { card_set_id: setId, text: 'Co dělá život smysluplným? ____.', pick: 1 },
    { card_set_id: setId, text: 'Doktor říká, že mám jen 3 měsíce na to, abych stihl ____.', pick: 1 },
    { card_set_id: setId, text: 'Tajemství mého úspěchu: ____.', pick: 1 },
    { card_set_id: setId, text: 'V příštím životě chci být ____.', pick: 1 },
    { card_set_id: setId, text: 'Co jsem našel pod postelí? ____.', pick: 1 },
    { card_set_id: setId, text: 'Proč jsem se přestal stýkat s přáteli? ____.', pick: 1 },
    { card_set_id: setId, text: 'Prezident oznámil, že od příštího roku bude povinné ____.', pick: 1 },
    { card_set_id: setId, text: 'Moji rodiče se mě ptají, kdy si konečně pořídím ____.', pick: 1 },
    { card_set_id: setId, text: 'Vědci objevili, že ____ způsobuje rakovinu.', pick: 1 },
    { card_set_id: setId, text: 'Na prvním rande jsem se zmínil o ____.', pick: 1 },
    { card_set_id: setId, text: 'Co dělám, když mám volnou chvilku? ____.', pick: 1 },
    { card_set_id: setId, text: 'Nový trend na sociálních sítích: ____.', pick: 1 },
    { card_set_id: setId, text: 'Proč jsem skončil s terapií? ____.', pick: 1 },
  ]);

  await knex('white_cards').insert([
    { card_set_id: setId, text: 'Spontánní pláč v metru' },
    { card_set_id: setId, text: 'Šéf v pyžamu na Zoomu' },
    { card_set_id: setId, text: 'Táta, který nerozumí memes' },
    { card_set_id: setId, text: 'Existenční krize ve 2 v noci' },
    { card_set_id: setId, text: 'Prokrastinace na smrtelné posteli' },
    { card_set_id: setId, text: 'Bezlepková pizza bez chuti' },
    { card_set_id: setId, text: 'Komentáře pod zpravodajskými články' },
    { card_set_id: setId, text: 'Přátelé, kteří pošlou "ok" na hodinu textu' },
    { card_set_id: setId, text: 'Věčně nabitý telefon, který je vždy vybitý' },
    { card_set_id: setId, text: 'Soused, který cvičí ve 3 ráno' },
    { card_set_id: setId, text: 'Rodiče na Facebooku lajkující každý příspěvek' },
    { card_set_id: setId, text: 'Kolega, co přináší rybu do mikrovlnky' },
    { card_set_id: setId, text: 'Nezodpovězené zprávy z roku 2019' },
    { card_set_id: setId, text: 'Ponocování s pocitem produktivity' },
    { card_set_id: setId, text: 'Druhý jídlíček v kině' },
    { card_set_id: setId, text: 'Nervózní smích v nevhodnou chvíli' },
    { card_set_id: setId, text: 'Sen, ve kterém padáš' },
    { card_set_id: setId, text: 'Zapomenutá písnička, co se vrátí v noci' },
    { card_set_id: setId, text: 'Pracovní oběd, kde nikdo neví, co říct' },
    { card_set_id: setId, text: 'Člověk, co mluví v kině' },
    { card_set_id: setId, text: 'Příbuzný s kontroverzními názory' },
    { card_set_id: setId, text: 'Děti v restauraci' },
    { card_set_id: setId, text: 'Pes, co olizuje vše' },
    { card_set_id: setId, text: 'Noční nákupy na internetu' },
    { card_set_id: setId, text: 'Sebevzdělávání přes Netflix' },
    { card_set_id: setId, text: 'Příslib "jen pět minut"' },
    { card_set_id: setId, text: 'Influencer z malého města' },
    { card_set_id: setId, text: 'Anonymní komentátor na Redditu' },
    { card_set_id: setId, text: 'Párty, kde je jen jedna Becherovka' },
    { card_set_id: setId, text: 'Terapeut, který potřebuje terapeuta' },
    { card_set_id: setId, text: 'Selfie na pohřbu' },
    { card_set_id: setId, text: 'Výmluva "mám špatný signál"' },
    { card_set_id: setId, text: 'Narychlo koupený dárek na benzínce' },
    { card_set_id: setId, text: 'Nerealistické novoroční předsevzetí' },
    { card_set_id: setId, text: 'Muž středního věku s e-scootem' },
  ]);
}
```

**Step 3: Přidej seed script do `packages/backend/package.json`**

Do `"scripts"` přidej:
```json
"seed": "tsx src/db/seed.ts"
```

**Step 4: Spusť seed (vyžaduje běžící MySQL)**

```bash
npm run seed --workspace=packages/backend
# Očekávaný výstup: Seeds run: 01_czech_set.ts
```

**Step 5: Commit**

```bash
git add packages/backend/src/db/seed.ts packages/backend/src/db/seeds/01_czech_set.ts packages/backend/package.json
git commit -m "feat(backend): add Czech card set seed data (15 black + 35 white cards)"
```

---

### Task 4: RoomManager — validace startGame (TDD)

**Files:**
- Modify: `packages/backend/src/game/RoomManager.test.ts`
- Modify: `packages/backend/src/game/RoomManager.ts`

**Step 1: Napiš failing test**

Do `RoomManager.test.ts`, do sekce `// --- startGame ---`, přidej nový test:

```ts
it('rejects startGame when no card sets selected', () => {
  const { room, playerToken } = rm.createRoom(
    { name: 'Test', isPublic: true, selectedSetIds: [], maxPlayers: 6, nickname: 'Alice' }
  );
  rm.joinRoom(room.code, 'Bob');
  rm.joinRoom(room.code, 'Charlie');
  const result = rm.startGame(playerToken);
  expect('error' in result).toBe(true);
  if ('error' in result) expect(result.error).toContain('sada');
});
```

**Step 2: Spusť test — ověř FAIL**

```bash
npm test --workspace=packages/backend
# Očekávaný výstup: FAIL — test "rejects startGame when no card sets selected"
```

**Step 3: Implementuj validaci v `RoomManager.ts`**

V metodě `startGame`, za kontrolu počtu hráčů, přidej:

```ts
if (room.selectedSetIds.length === 0) {
  return { error: 'Musí být vybrána alespoň jedna sada karet.' };
}
```

Přidej PŘED `room.status = 'SELECTION';`.

**Step 4: Spusť testy — ověř PASS**

```bash
npm test --workspace=packages/backend
# Očekávaný výstup: 20 passed
```

**Step 5: Commit**

```bash
git add packages/backend/src/game/RoomManager.test.ts packages/backend/src/game/RoomManager.ts
git commit -m "feat(backend): validate selectedSetIds in startGame"
```

---

### Task 5: lobbyStore — fetchCardSets

**Files:**
- Modify: `packages/frontend/src/stores/lobbyStore.ts`

**Step 1: Přidej CardSetSummary typ a state**

Na začátek souboru, za existující importy, přidej:

```ts
export interface CardSetSummary {
  id: number;
  name: string;
  description: string | null;
  blackCardCount: number;
  whiteCardCount: number;
}
```

Do `defineStore` callback, za `const isSubscribed = ref(false);`, přidej:

```ts
const cardSets = ref<CardSetSummary[]>([]);
const cardSetsLoaded = ref(false);
```

**Step 2: Přidej fetchCardSets funkci**

Za funkci `unsubscribe`, přidej:

```ts
async function fetchCardSets(): Promise<void> {
  if (cardSetsLoaded.value) return;
  const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
  const res = await fetch(`${backendUrl}/api/card-sets`);
  cardSets.value = await res.json() as CardSetSummary[];
  cardSetsLoaded.value = true;
}
```

**Step 3: Exportuj z return**

Stávající `return { publicRooms, subscribe, unsubscribe, createRoom, joinRoom };` změň na:

```ts
return { publicRooms, cardSets, subscribe, unsubscribe, createRoom, joinRoom, fetchCardSets };
```

**Step 4: Commit**

```bash
git add packages/frontend/src/stores/lobbyStore.ts
git commit -m "feat(frontend): add fetchCardSets to lobbyStore"
```

---

### Task 6: CreateTableModal — checkboxy pro výběr sad

**Files:**
- Modify: `packages/frontend/src/components/CreateTableModal.vue`

**Step 1: Nahraď celý obsah souboru**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLobbyStore } from '../stores/lobbyStore';

const emit = defineEmits<{
  close: [];
  create: [settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    nickname: string;
  }];
}>();

const lobbyStore = useLobbyStore();

const name = ref('');
const isPublic = ref(true);
const maxPlayers = ref(8);
const nickname = ref('');
const selectedSetIds = ref<number[]>([]);

const canSubmit = computed(() =>
  name.value.trim() !== '' &&
  nickname.value.trim() !== '' &&
  selectedSetIds.value.length > 0
);

function toggleSet(id: number) {
  const idx = selectedSetIds.value.indexOf(id);
  if (idx === -1) {
    selectedSetIds.value.push(id);
  } else {
    selectedSetIds.value.splice(idx, 1);
  }
}

function submit() {
  if (!canSubmit.value) return;
  emit('create', {
    name: name.value.trim(),
    isPublic: isPublic.value,
    selectedSetIds: selectedSetIds.value,
    maxPlayers: maxPlayers.value,
    nickname: nickname.value.trim(),
  });
}

onMounted(() => {
  lobbyStore.fetchCardSets();
});
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-md space-y-4">
      <h2 class="text-xl font-bold">Vytvořit nový stůl</h2>

      <label class="block">
        <span class="text-sm text-gray-300">Název stolu</span>
        <input
          v-model="name"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
          placeholder="Můj stůl"
        />
      </label>

      <label class="block">
        <span class="text-sm text-gray-300">Tvoje přezdívka</span>
        <input
          v-model="nickname"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
          placeholder="Přezdívka"
        />
      </label>

      <label class="block">
        <span class="text-sm text-gray-300">Max. hráčů</span>
        <input
          v-model.number="maxPlayers"
          type="number"
          min="3"
          max="20"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
        />
      </label>

      <div>
        <span class="text-sm text-gray-300">Sady karet</span>
        <div
          v-if="lobbyStore.cardSets.length === 0"
          class="mt-1 text-sm text-gray-500"
        >
          Načítání sad...
        </div>
        <div v-else class="mt-1 space-y-2">
          <label
            v-for="set in lobbyStore.cardSets"
            :key="set.id"
            class="flex items-start gap-3 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="selectedSetIds.includes(set.id)"
              @change="toggleSet(set.id)"
              class="w-4 h-4 mt-0.5 shrink-0"
            />
            <div>
              <span class="text-sm font-medium">{{ set.name }}</span>
              <span class="text-xs text-gray-400 ml-2">
                {{ set.blackCardCount }} ♠ / {{ set.whiteCardCount }} ♡
              </span>
              <p v-if="set.description" class="text-xs text-gray-500">{{ set.description }}</p>
            </div>
          </label>
        </div>
        <p v-if="lobbyStore.cardSets.length > 0 && selectedSetIds.length === 0" class="text-xs text-yellow-500 mt-1">
          Vyber alespoň jednu sadu.
        </p>
      </div>

      <label class="flex items-center gap-2">
        <input v-model="isPublic" type="checkbox" class="w-4 h-4" />
        <span class="text-sm text-gray-300">Veřejný stůl (zobrazí se v seznamu)</span>
      </label>

      <div class="flex gap-3 pt-2">
        <button
          @click="submit"
          :disabled="!canSubmit"
          class="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded font-semibold flex-1"
        >
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

**Step 2: Manuální ověření**

1. Spusť backend + frontend
2. Otevři HomeView, klikni "Vytvořit stůl"
3. Modal by měl načíst sady (pokud byl spuštěn seed)
4. Tlačítko "Vytvořit" je disabled dokud není vybrána sada
5. Po zaškrtnutí sady a vyplnění polí → "Vytvořit" se aktivuje

**Step 3: Commit**

```bash
git add packages/frontend/src/components/CreateTableModal.vue
git commit -m "feat(frontend): card set selection checkboxes in CreateTableModal"
```

---

## Ověření celku

Po dokončení všech tasků:

```bash
# Backend testy
npm test --workspace=packages/backend
# Očekáváno: 20 passed

# TypeScript build
npm run build
# Očekáváno: 0 errors
```

Manuální E2E test:
1. Seed DB (`npm run seed --workspace=packages/backend`)
2. `npm run dev:backend` + `npm run dev:frontend`
3. Otevři http://localhost:5173
4. Vytvoř stůl — vyber sadu, vyplň jméno + přezdívku → Vytvořit
5. Připoj 2 další hráče
6. Host klikne "Spustit hru" → musí projít (má vybrané sady)
7. Test bez sady: vytvoř stůl bez výběru sady (není možné — tlačítko disabled)
