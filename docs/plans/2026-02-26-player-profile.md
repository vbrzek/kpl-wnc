# Player Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Globální hráčský profil (přezdívka + jazyk + DiceBear avatar) uložený v localStorage — zadává se jednou při prvním spuštění, platí pro všechny herní místnosti.

**Architecture:** Nový Pinia store `profileStore` drží nickname + locale + computed avatarUrl. `App.vue` inicializuje store a blokuje UI dokud profil není vyplněn. `GameLayout.vue` nahradí `LanguageSwitcher` za `PlayerAvatar`, kliknutí otevře edit modal.

**Tech Stack:** Vue 3 Composition API, Pinia, vue-i18n, DiceBear CDN (`https://api.dicebear.com/9.x/bottts/svg`), Tailwind v4

---

### Task 1: Vytvoř `profileStore.ts`

**Files:**
- Create: `packages/frontend/src/stores/profileStore.ts`

**Step 1: Vytvoř soubor s tímto přesným obsahem**

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../i18n';

const SUPPORTED_LOCALES = ['cs', 'en', 'ru', 'uk', 'es'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

interface PlayerProfile {
  nickname: string;
  locale: SupportedLocale;
}

export const useProfileStore = defineStore('profile', () => {
  const nickname = ref('');
  const locale = ref<SupportedLocale>('cs');

  const avatarUrl = computed(() =>
    `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nickname.value || 'default')}`
  );

  const hasProfile = computed(() => nickname.value.trim().length > 0);

  function init() {
    const raw = localStorage.getItem('playerProfile');
    if (!raw) return;
    try {
      const profile = JSON.parse(raw) as PlayerProfile;
      if (profile.nickname) nickname.value = profile.nickname;
      if (profile.locale && (SUPPORTED_LOCALES as readonly string[]).includes(profile.locale)) {
        locale.value = profile.locale;
      }
    } catch {
      // ignore malformed data
    }
  }

  function save(newNickname: string, newLocale: SupportedLocale) {
    nickname.value = newNickname.trim();
    locale.value = newLocale;
    const profile: PlayerProfile = { nickname: nickname.value, locale: newLocale };
    localStorage.setItem('playerProfile', JSON.stringify(profile));
    localStorage.setItem('locale', newLocale);
    // Okamžitě přepne i18n locale v aktuální session
    (i18n.global.locale as { value: string }).value = newLocale;
  }

  return { nickname, locale, avatarUrl, hasProfile, init, save };
});
```

**Step 2: Ověř TypeScript kompilaci**

```bash
npm run build --workspace=packages/frontend 2>&1 | head -30
```
Očekáváno: žádné chyby týkající se profileStore.

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/profileStore.ts
git commit -m "feat(frontend): add profileStore with nickname, locale, DiceBear avatarUrl"
```

---

### Task 2: Přidej překlady pro profil do všech 5 locale souborů

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Přidej do `cs.json`** (za blok `"nickname"`, před `"joinPrivate"`)

```json
  "profile": {
    "setupTitle": "Nastav svůj profil",
    "editTitle": "Upravit profil",
    "nickname": "Přezdívka",
    "nicknamePlaceholder": "Tvoje přezdívka",
    "language": "Jazyk",
    "save": "Uložit"
  },
```

**Step 2: Přidej do `en.json`**

```json
  "profile": {
    "setupTitle": "Set up your profile",
    "editTitle": "Edit profile",
    "nickname": "Nickname",
    "nicknamePlaceholder": "Your nickname",
    "language": "Language",
    "save": "Save"
  },
```

**Step 3: Přidej do `ru.json`**

```json
  "profile": {
    "setupTitle": "Настрой свой профиль",
    "editTitle": "Редактировать профиль",
    "nickname": "Псевдоним",
    "nicknamePlaceholder": "Твой псевдоним",
    "language": "Язык",
    "save": "Сохранить"
  },
```

**Step 4: Přidej do `uk.json`**

```json
  "profile": {
    "setupTitle": "Налаштуй свій профіль",
    "editTitle": "Редагувати профіль",
    "nickname": "Псевдонім",
    "nicknamePlaceholder": "Твій псевдонім",
    "language": "Мова",
    "save": "Зберегти"
  },
```

**Step 5: Přidej do `es.json`**

```json
  "profile": {
    "setupTitle": "Configura tu perfil",
    "editTitle": "Editar perfil",
    "nickname": "Apodo",
    "nicknamePlaceholder": "Tu apodo",
    "language": "Idioma",
    "save": "Guardar"
  },
```

**Step 6: Commit**

```bash
git add packages/frontend/src/i18n/locales/
git commit -m "feat(frontend): add profile translation keys to all 5 locales"
```

---

### Task 3: Vytvoř `PlayerAvatar.vue`

**Files:**
- Create: `packages/frontend/src/components/PlayerAvatar.vue`

**Step 1: Vytvoř soubor**

```vue
<script setup lang="ts">
import { useProfileStore } from '../stores/profileStore';

withDefaults(defineProps<{ size?: number }>(), { size: 40 });
const emit = defineEmits<{ click: [] }>();
const profileStore = useProfileStore();
</script>

<template>
  <button
    @click="emit('click')"
    class="rounded-full overflow-hidden bg-gray-700 hover:ring-2 hover:ring-indigo-400 transition-all flex-shrink-0 cursor-pointer"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :title="profileStore.nickname"
  >
    <img
      :src="profileStore.avatarUrl"
      :alt="profileStore.nickname"
      class="w-full h-full object-cover"
    />
  </button>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/PlayerAvatar.vue
git commit -m "feat(frontend): add PlayerAvatar component"
```

---

### Task 4: Vytvoř `PlayerProfileModal.vue`

**Files:**
- Create: `packages/frontend/src/components/PlayerProfileModal.vue`

**Step 1: Vytvoř soubor**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProfileStore } from '../stores/profileStore';
import type { SupportedLocale } from '../stores/profileStore';

const props = withDefaults(defineProps<{ isEdit?: boolean }>(), { isEdit: false });
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const profileStore = useProfileStore();

const nicknameInput = ref(profileStore.nickname);
const selectedLocale = ref<SupportedLocale>(profileStore.locale);

const previewAvatarUrl = computed(() =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nicknameInput.value || 'default')}`
);

const canSave = computed(() => nicknameInput.value.trim().length > 0);

const languages: { code: SupportedLocale; label: string; flag: string }[] = [
  { code: 'cs', label: 'Čeština', flag: '🇨🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

function submit() {
  if (!canSave.value) return;
  profileStore.save(nicknameInput.value.trim(), selectedLocale.value);
  emit('close');
}

function onBackdropClick() {
  if (props.isEdit) emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 text-white"
      @click.self="onBackdropClick"
    >
      <div class="bg-gray-800 p-6 rounded-xl w-full max-w-sm space-y-5">

        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold">
            {{ isEdit ? t('profile.editTitle') : t('profile.setupTitle') }}
          </h2>
          <button
            v-if="isEdit"
            @click="emit('close')"
            class="text-gray-400 hover:text-white text-lg leading-none"
          >✕</button>
        </div>

        <!-- Live avatar náhled -->
        <div class="flex justify-center">
          <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-700">
            <img :src="previewAvatarUrl" alt="avatar" class="w-full h-full object-cover" />
          </div>
        </div>

        <!-- Přezdívka -->
        <label class="block">
          <span class="text-sm text-gray-300">{{ t('profile.nickname') }}</span>
          <input
            v-model="nicknameInput"
            maxlength="24"
            autofocus
            class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
            :placeholder="t('profile.nicknamePlaceholder')"
            @keyup.enter="submit"
          />
        </label>

        <!-- Výběr jazyka -->
        <div>
          <span class="text-sm text-gray-300">{{ t('profile.language') }}</span>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="lang in languages"
              :key="lang.code"
              @click="selectedLocale = lang.code"
              :class="[
                'px-3 py-1.5 rounded text-sm transition-colors',
                selectedLocale === lang.code
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]"
            >
              {{ lang.flag }} {{ lang.label }}
            </button>
          </div>
        </div>

        <button
          @click="submit"
          :disabled="!canSave"
          class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed py-2 rounded font-semibold"
        >
          {{ t('profile.save') }}
        </button>

      </div>
    </div>
  </Teleport>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/PlayerProfileModal.vue
git commit -m "feat(frontend): add PlayerProfileModal with live avatar, nickname input, language picker"
```

---

### Task 5: Aktualizuj `App.vue`

**Files:**
- Modify: `packages/frontend/src/App.vue`

**Step 1: Nahraď celý obsah souboru**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { socket } from './socket';
import GameLayout from './layouts/GameLayout.vue';
import { useProfileStore } from './stores/profileStore';
import PlayerProfileModal from './components/PlayerProfileModal.vue';

const profileStore = useProfileStore();
const showProfileModal = ref(false);

onMounted(() => {
  socket.connect();
  profileStore.init();
  if (!profileStore.hasProfile) showProfileModal.value = true;
});
onUnmounted(() => socket.disconnect());
</script>

<template>
  <GameLayout>
    <!-- RouterView se renderuje jen pokud profil existuje -->
    <RouterView v-if="profileStore.hasProfile" />
  </GameLayout>

  <PlayerProfileModal
    v-if="showProfileModal"
    @close="showProfileModal = false"
  />
</template>
```

**Proč `v-if="profileStore.hasProfile"` na RouterView:** Zabraňuje tomu, aby `RoomView` zkusil přistoupit ke stolu s prázdnou přezdívkou dřív, než hráč vyplní profil.

**Step 2: Commit**

```bash
git add packages/frontend/src/App.vue
git commit -m "feat(frontend): init profileStore in App.vue, block RouterView until profile is set"
```

---

### Task 6: Aktualizuj `GameLayout.vue` — nahraď LanguageSwitcher za PlayerAvatar

**Files:**
- Modify: `packages/frontend/src/layouts/GameLayout.vue`

**Step 1: Nahraď celý obsah souboru**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import PlayerAvatar from '../components/PlayerAvatar.vue';
import PlayerProfileModal from '../components/PlayerProfileModal.vue';

const showEditProfile = ref(false);
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <div class="flex justify-end px-6 pt-4">
      <PlayerAvatar :size="40" @click="showEditProfile = true" />
    </div>
    <div class="max-w-6xl mx-auto px-6 py-6">
      <slot></slot>
    </div>

    <PlayerProfileModal
      v-if="showEditProfile"
      :is-edit="true"
      @close="showEditProfile = false"
    />
  </div>
</template>
```

**Step 2: Smaž `LanguageSwitcher.vue`** (je plně nahrazen profilovým modalem)

```bash
rm packages/frontend/src/components/LanguageSwitcher.vue
```

**Step 3: Commit**

```bash
git add packages/frontend/src/layouts/GameLayout.vue
git add -u packages/frontend/src/components/LanguageSwitcher.vue
git commit -m "feat(frontend): replace LanguageSwitcher with PlayerAvatar in GameLayout"
```

---

### Task 7: Aktualizuj `RoomView.vue` — odstraň NicknameModal, použij profil

**Files:**
- Modify: `packages/frontend/src/views/RoomView.vue`

**Step 1: Nahraď celý obsah souboru**

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useLobbyStore, loadPlayerToken } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import { useProfileStore } from '../stores/profileStore';
import LobbyPanel from '../components/LobbyPanel.vue';
import SelectionPhase from '../components/SelectionPhase.vue';
import JudgingPhase from '../components/JudgingPhase.vue';
import ResultsPhase from '../components/ResultsPhase.vue';
import FinishedPhase from '../components/FinishedPhase.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();
const profileStore = useProfileStore();

const roomCode = route.params.token as string;

const stopKickedWatch = watch(
  () => roomStore.room,
  (newRoom, oldRoom) => {
    if (oldRoom !== null && newRoom === null) {
      router.push('/');
    }
  }
);

onMounted(async () => {
  roomStore.init();

  const existingToken = loadPlayerToken(roomCode);
  // Pokud má hráč token: reconnect s prázdnou přezdívkou (server použije token)
  // Pokud ne: připoj se s přezdívkou z globálního profilu
  const nickname = existingToken ? '' : profileStore.nickname;

  const result = await lobbyStore.joinRoom(roomCode, nickname);
  if ('error' in result) {
    router.push({ path: '/', query: { error: result.error } });
    return;
  }
  roomStore.setRoom(result.room);
  roomStore.setMyPlayerId(result.playerId);
});

onUnmounted(() => {
  stopKickedWatch();
  roomStore.cleanup();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-6">

    <template v-if="roomStore.room">
      <LobbyPanel
        v-if="roomStore.room.status === 'LOBBY'"
        :room="roomStore.room"
      />
      <SelectionPhase v-else-if="roomStore.room.status === 'SELECTION'" />
      <JudgingPhase v-else-if="roomStore.room.status === 'JUDGING'" />
      <ResultsPhase v-else-if="roomStore.room.status === 'RESULTS'" />
      <FinishedPhase v-else-if="roomStore.room.status === 'FINISHED'" />
    </template>

    <div v-else class="text-gray-400 mt-20 text-center">
      {{ t('room.connecting') }}
    </div>

  </div>
</template>
```

**Step 2: Smaž `NicknameModal.vue`** (nahrazen globálním `PlayerProfileModal`)

```bash
rm packages/frontend/src/components/NicknameModal.vue
```

**Step 3: Commit**

```bash
git add packages/frontend/src/views/RoomView.vue
git add -u packages/frontend/src/components/NicknameModal.vue
git commit -m "feat(frontend): RoomView uses profile nickname, remove NicknameModal"
```

---

### Task 8: Aktualizuj `CreateTableModal.vue` — odstraň pole pro přezdívku

**Files:**
- Modify: `packages/frontend/src/components/CreateTableModal.vue`

**Step 1: Odstraň `nickname` ref a jeho validaci ze `<script setup>`**

Řádky 23 (`const nickname = ref('');`) a 29 (`nickname.value.trim() !== '' &&`) — smaž je:

```typescript
// Před:
const nickname = ref('');
const selectedSetIds = ref<number[]>([]);

const canSubmit = computed(() =>
  name.value.trim() !== '' &&
  nickname.value.trim() !== '' &&
  selectedSetIds.value.length > 0
);

// Po:
const selectedSetIds = ref<number[]>([]);

const canSubmit = computed(() =>
  name.value.trim() !== '' &&
  selectedSetIds.value.length > 0
);
```

**Step 2: Odstraň `nickname` z emit typu a z `submit()`**

```typescript
// Před:
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

// Po:
const emit = defineEmits<{
  close: [];
  create: [settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
  }];
}>();

function submit() {
  if (!canSubmit.value) return;
  emit('create', {
    name: name.value.trim(),
    isPublic: isPublic.value,
    selectedSetIds: selectedSetIds.value,
    maxPlayers: maxPlayers.value,
  });
}
```

**Step 3: Odstraň z šablony celý blok `<label>` pro přezdívku** (řádky 77–84 v originálním souboru):

```html
<!-- Smazat celý tento blok: -->
<label class="block">
  <span class="text-sm text-gray-300">{{ t('createTable.yourNickname') }}</span>
  <input
    v-model="nickname"
    class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
    :placeholder="t('createTable.nicknamePlaceholder')"
  />
</label>
```

**Step 4: Commit**

```bash
git add packages/frontend/src/components/CreateTableModal.vue
git commit -m "feat(frontend): remove nickname field from CreateTableModal (uses global profile)"
```

---

### Task 9: Aktualizuj `HomeView.vue` — použij profileStore.nickname

**Files:**
- Modify: `packages/frontend/src/views/HomeView.vue`

**Step 1: Přidej import profileStore**

Za existující import `useRoomStore` přidej:
```typescript
import { useProfileStore } from '../stores/profileStore';
```

A za `const roomStore = useRoomStore();` přidej:
```typescript
const profileStore = useProfileStore();
```

**Step 2: Aktualizuj typ `onCreateRoom` a předání nickname**

```typescript
// Před:
async function onCreateRoom(settings: {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  nickname: string;
}) {
  const result = await lobbyStore.createRoom(settings);

// Po:
async function onCreateRoom(settings: {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
}) {
  const result = await lobbyStore.createRoom({ ...settings, nickname: profileStore.nickname });
```

**Step 3: Aktualizuj `onJoinPublic` — odstraň `nickname` parametr**

```typescript
// Před:
async function onJoinPublic(code: string, nickname: string) {
  const result = await lobbyStore.joinRoom(code, nickname);

// Po:
async function onJoinPublic(code: string) {
  const result = await lobbyStore.joinRoom(code, profileStore.nickname);
```

**Step 4: Commit**

```bash
git add packages/frontend/src/views/HomeView.vue
git commit -m "feat(frontend): HomeView uses profileStore.nickname for create/join"
```

---

### Task 10: Aktualizuj `PublicRoomsList.vue` — odstraň inline formulář pro přezdívku

**Files:**
- Modify: `packages/frontend/src/components/PublicRoomsList.vue`

**Step 1: Nahraď celý obsah souboru**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PublicRoomSummary } from '@kpl/shared';

defineProps<{ rooms: PublicRoomSummary[] }>();
const emit = defineEmits<{ join: [code: string] }>();

const { t } = useI18n();
</script>

<template>
  <section>
    <h2 class="text-xl font-semibold mb-4">{{ t('publicRooms.title') }}</h2>
    <p v-if="rooms.length === 0" class="text-gray-400">{{ t('publicRooms.noRooms') }}</p>
    <ul class="space-y-2">
      <li
        v-for="room in rooms"
        :key="room.code"
        class="flex items-center justify-between bg-gray-800 px-4 py-3 rounded-lg"
      >
        <span>
          {{ room.name }}
          <span class="text-gray-400 text-sm ml-1">({{ room.playerCount }}/{{ room.maxPlayers }})</span>
        </span>
        <button
          @click="emit('join', room.code)"
          class="bg-indigo-600 hover:bg-indigo-500 px-4 py-1 rounded"
        >
          {{ t('publicRooms.joinTable') }}
        </button>
      </li>
    </ul>
  </section>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/PublicRoomsList.vue
git commit -m "feat(frontend): PublicRoomsList emits only code, removes inline nickname form"
```

---

### Task 11: Ověř celý build a funkčnost

**Step 1: Spusť build**

```bash
npm run build --workspace=packages/frontend 2>&1 | tail -20
```
Očekáváno: `✓ built in` bez chyb.

**Step 2: Spusť dev server a otevři aplikaci**

```bash
npm run dev:frontend
```

Otevři `http://localhost:5173` v prohlížeči.

**Step 3: Manuální test — první spuštění**

1. Otevři v anonymním okně (prázdný localStorage)
2. Ověř: zobrazí se `PlayerProfileModal` s titulkem "Nastav svůj profil"
3. Robot (bottts avatar) je viditelný v náhledu
4. Zadej přezdívku — robot se změní (live preview)
5. Vyber jazyk — tlačítko se zvýrazní
6. Klikni "Uložit" — modal zmizí, v pravém horním rohu se zobrazí avatar
7. Ověř v DevTools → Application → localStorage: klíč `playerProfile` obsahuje `{"nickname":"...","locale":"..."}`

**Step 4: Manuální test — editace profilu**

1. Klikni na avatar v pravém rohu
2. Modal se otevře s titulkem "Upravit profil" — pole předvyplněná
3. Je viditelné tlačítko ✕ pro zavření bez uložení
4. Kliknutí na backdrop zavře modal
5. Změň jazyk → klikni Uložit → UI se okamžitě přeloží

**Step 5: Manuální test — vytvoření stolu**

1. Klikni "Vytvořit stůl" — `CreateTableModal` nemá pole pro přezdívku
2. Vytvoř stůl — připojení proběhne s přezdívkou z profilu

**Step 6: Manuální test — přísednutí ke stolu**

1. Otevři URL stolu přímo (`/room/abc123`)
2. Připojení proběhne automaticky bez dotazu na přezdívku

**Step 7: Final commit**

```bash
git add -A
git commit -m "feat(frontend): player profile complete — global nickname, locale, DiceBear avatar"
```
