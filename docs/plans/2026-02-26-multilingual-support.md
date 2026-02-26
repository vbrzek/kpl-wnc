# Multilingual Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full multilingual support for 5 languages (cs, en, ru, uk, es): UI strings via vue-i18n, card content via DB translation tables + REST API.

**Architecture:** Frontend uses vue-i18n v10 with JSON locale files; language is auto-detected from browser (`navigator.language`) and persisted to `localStorage`. Each game card has a separate DB translation table; a new REST endpoint serves translated card text by card IDs + locale, with Czech fallback. Game phase components fetch card translations via a `useCardTranslations` composable that caches results in memory for the session.

**Tech Stack:** vue-i18n@10, Knex migrations (MySQL), Fastify route, Vitest (backend TDD), Vue 3 Composition API.

---

## Context

- Frontend: `packages/frontend/src/`
- Backend: `packages/backend/src/`
- Existing migration: `packages/backend/src/db/migrations/20260224000000_initial_schema.ts`
- Backend tests use Vitest, run with `npm test --workspace=packages/backend`
- Dev servers: `npm run dev:backend` and `npm run dev:frontend`
- The backend test pattern: import a pure class/function, mock nothing unless needed, use `vi.fn()` for external deps

---

## Task 1: Install vue-i18n and configure i18n module

**Files:**
- Modify: `packages/frontend/package.json`
- Create: `packages/frontend/src/i18n/index.ts`
- Modify: `packages/frontend/src/main.ts`

**Step 1: Install vue-i18n**

```bash
npm install vue-i18n@10 --workspace=packages/frontend
```

Expected: vue-i18n added to `packages/frontend/package.json` dependencies.

**Step 2: Create `packages/frontend/src/i18n/index.ts`**

```typescript
import { createI18n } from 'vue-i18n';
import cs from './locales/cs.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import es from './locales/es.json';

const SUPPORTED_LOCALES = ['cs', 'en', 'ru', 'uk', 'es'] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];

function detectLocale(): SupportedLocale {
  const stored = localStorage.getItem('locale') as SupportedLocale | null;
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  const browserLang = navigator.language.slice(0, 2) as SupportedLocale;
  if (SUPPORTED_LOCALES.includes(browserLang)) return browserLang;
  return 'cs';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'cs',
  messages: { cs, en, ru, uk, es },
  pluralRules: {
    cs: (count: number) => {
      if (count === 1) return 0;
      if (count >= 2 && count <= 4) return 1;
      return 2;
    },
    ru: (count: number) => {
      const m10 = count % 10;
      const m100 = count % 100;
      if (m10 === 1 && m100 !== 11) return 0;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 1;
      return 2;
    },
    uk: (count: number) => {
      const m10 = count % 10;
      const m100 = count % 100;
      if (m10 === 1 && m100 !== 11) return 0;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 1;
      return 2;
    },
  },
});
```

**Step 3: Update `packages/frontend/src/main.ts`**

Replace current content:
```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';
import router from './router/index.js';
import { i18n } from './i18n/index.js';

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app');
```

**Step 4: Verify TypeScript compiles**

```bash
npm run build --workspace=packages/frontend
```

Expected: Build succeeds (locale JSON files don't exist yet — they'll be created in Tasks 2–6, so this will fail until Task 6 is done. Run the full check after Task 6.)

**Step 5: Commit**

```bash
git add packages/frontend/package.json packages/frontend/package-lock.json \
  packages/frontend/src/i18n/index.ts packages/frontend/src/main.ts
git commit -m "feat(frontend): install vue-i18n and configure i18n with 5-locale support"
```

---

## Task 2: Create Czech translation file

**Files:**
- Create: `packages/frontend/src/i18n/locales/cs.json`

**Step 1: Create `cs.json` with all UI strings**

```json
{
  "common": {
    "cancel": "Zrušit",
    "create": "Vytvořit",
    "join": "Připojit",
    "loading": "Načítání...",
    "copied": "Zkopírováno!",
    "copyLink": "Kopírovat odkaz"
  },
  "home": {
    "title": "Karty proti lidskosti",
    "createTable": "Vytvořit stůl",
    "joinWithCode": "Připojit se (kód)"
  },
  "createTable": {
    "title": "Vytvořit nový stůl",
    "tableName": "Název stolu",
    "tableNamePlaceholder": "Můj stůl",
    "yourNickname": "Tvoje přezdívka",
    "nicknamePlaceholder": "Přezdívka",
    "maxPlayers": "Max. hráčů",
    "cardSets": "Sady karet",
    "fetchError": "Nepodařilo se načíst sady karet.",
    "loadingSets": "Načítání sad...",
    "noSets": "Žádné sady nejsou k dispozici.",
    "selectAtLeastOne": "Vyber alespoň jednu sadu.",
    "publicTable": "Veřejný stůl (zobrazí se v seznamu)"
  },
  "nickname": {
    "title": "Zadej svou přezdívku",
    "placeholder": "Přezdívka",
    "join": "Sednout si ke stolu"
  },
  "joinPrivate": {
    "title": "Připojit se ke stolu",
    "codeLabel": "Kód stolu (6 znaků)",
    "codePlaceholder": "a3f9c1",
    "codeError": "Kód musí být 6 znaků (a-f, 0-9)"
  },
  "room": {
    "connecting": "Připojování..."
  },
  "lobby": {
    "players": "Hráči ({current}/{max})",
    "startGame": "Spustit hru",
    "minPlayers": "({current}/3 min.)",
    "waitingForHost": "Čekáme, až host spustí hru..."
  },
  "player": {
    "host": "host",
    "you": "ty",
    "afk": "AFK",
    "offline": "offline",
    "kick": "Vyhodit"
  },
  "publicRooms": {
    "title": "Veřejné stoly",
    "noRooms": "Žádné volné stoly.",
    "joinTable": "Sednout si",
    "yourNickname": "Tvoje přezdívka",
    "confirm": "Připojit"
  },
  "game": {
    "selection": {
      "submit": "Odeslat {current}/{total} karet"
    },
    "czar": {
      "judging": "Jsi karetní král — vyber nejlepší odpověď!",
      "waiting": "Jsi karetní král — čekej, až ostatní vyberou karty.",
      "forceAdvance": "Dál nečekat",
      "label": "karetní král"
    },
    "waiting": {
      "czarPicking": "Karetní král vybírá vítěze...",
      "skipJudging": "Přeskočit hodnocení"
    },
    "blackCard": {
      "pick": "Vyber {n} kartu | Vyber {n} karty | Vyber {n} karet"
    },
    "roundSkipped": "Kolo bylo přeskočeno — časový limit vypršel.",
    "results": {
      "roundWinner": "Vítěz kola",
      "winningCards": "Vítězné karty",
      "score": "Skóre",
      "nextRound": "Nové kolo začíná za 5 sekund...",
      "endGame": "Ukončit hru"
    },
    "finished": {
      "title": "Hra skončila!",
      "finalResults": "Finální výsledky",
      "returnToLobby": "Návrat do lobby",
      "waitingForHost": "Čekáme na hostitele..."
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/i18n/locales/cs.json
git commit -m "feat(frontend/i18n): add Czech translation file"
```

---

## Task 3: Create English translation file

**Files:**
- Create: `packages/frontend/src/i18n/locales/en.json`

**Step 1: Create `en.json`**

```json
{
  "common": {
    "cancel": "Cancel",
    "create": "Create",
    "join": "Join",
    "loading": "Loading...",
    "copied": "Copied!",
    "copyLink": "Copy link"
  },
  "home": {
    "title": "Cards Against Humanity",
    "createTable": "Create table",
    "joinWithCode": "Join with code"
  },
  "createTable": {
    "title": "Create new table",
    "tableName": "Table name",
    "tableNamePlaceholder": "My table",
    "yourNickname": "Your nickname",
    "nicknamePlaceholder": "Nickname",
    "maxPlayers": "Max players",
    "cardSets": "Card sets",
    "fetchError": "Failed to load card sets.",
    "loadingSets": "Loading sets...",
    "noSets": "No sets available.",
    "selectAtLeastOne": "Select at least one set.",
    "publicTable": "Public table (visible in the list)"
  },
  "nickname": {
    "title": "Enter your nickname",
    "placeholder": "Nickname",
    "join": "Take a seat"
  },
  "joinPrivate": {
    "title": "Join a table",
    "codeLabel": "Table code (6 chars)",
    "codePlaceholder": "a3f9c1",
    "codeError": "Code must be 6 chars (a-f, 0-9)"
  },
  "room": {
    "connecting": "Connecting..."
  },
  "lobby": {
    "players": "Players ({current}/{max})",
    "startGame": "Start game",
    "minPlayers": "({current}/3 min.)",
    "waitingForHost": "Waiting for the host to start the game..."
  },
  "player": {
    "host": "host",
    "you": "you",
    "afk": "AFK",
    "offline": "offline",
    "kick": "Kick"
  },
  "publicRooms": {
    "title": "Public tables",
    "noRooms": "No open tables.",
    "joinTable": "Take a seat",
    "yourNickname": "Your nickname",
    "confirm": "Join"
  },
  "game": {
    "selection": {
      "submit": "Submit {current}/{total} cards"
    },
    "czar": {
      "judging": "You are the Card Czar — pick the best answer!",
      "waiting": "You are the Card Czar — wait for others to pick their cards.",
      "forceAdvance": "Don't wait",
      "label": "card czar"
    },
    "waiting": {
      "czarPicking": "The Card Czar is picking a winner...",
      "skipJudging": "Skip judging"
    },
    "blackCard": {
      "pick": "Pick {n} card | Pick {n} cards"
    },
    "roundSkipped": "Round was skipped — time limit expired.",
    "results": {
      "roundWinner": "Round winner",
      "winningCards": "Winning cards",
      "score": "Score",
      "nextRound": "New round starts in 5 seconds...",
      "endGame": "End game"
    },
    "finished": {
      "title": "Game over!",
      "finalResults": "Final results",
      "returnToLobby": "Return to lobby",
      "waitingForHost": "Waiting for the host..."
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/i18n/locales/en.json
git commit -m "feat(frontend/i18n): add English translation file"
```

---

## Task 4: Create Russian translation file

**Files:**
- Create: `packages/frontend/src/i18n/locales/ru.json`

**Step 1: Create `ru.json`**

```json
{
  "common": {
    "cancel": "Отмена",
    "create": "Создать",
    "join": "Войти",
    "loading": "Загрузка...",
    "copied": "Скопировано!",
    "copyLink": "Копировать ссылку"
  },
  "home": {
    "title": "Карты против человечества",
    "createTable": "Создать стол",
    "joinWithCode": "Войти по коду"
  },
  "createTable": {
    "title": "Создать новый стол",
    "tableName": "Название стола",
    "tableNamePlaceholder": "Мой стол",
    "yourNickname": "Ваш никнейм",
    "nicknamePlaceholder": "Никнейм",
    "maxPlayers": "Макс. игроков",
    "cardSets": "Наборы карт",
    "fetchError": "Не удалось загрузить наборы карт.",
    "loadingSets": "Загрузка наборов...",
    "noSets": "Наборы недоступны.",
    "selectAtLeastOne": "Выберите хотя бы один набор.",
    "publicTable": "Публичный стол (виден в списке)"
  },
  "nickname": {
    "title": "Введите никнейм",
    "placeholder": "Никнейм",
    "join": "Сесть за стол"
  },
  "joinPrivate": {
    "title": "Войти в стол",
    "codeLabel": "Код стола (6 символов)",
    "codePlaceholder": "a3f9c1",
    "codeError": "Код должен быть 6 символов (a-f, 0-9)"
  },
  "room": {
    "connecting": "Подключение..."
  },
  "lobby": {
    "players": "Игроки ({current}/{max})",
    "startGame": "Начать игру",
    "minPlayers": "({current}/3 мин.)",
    "waitingForHost": "Ждём, пока хост начнёт игру..."
  },
  "player": {
    "host": "хост",
    "you": "ты",
    "afk": "AFK",
    "offline": "оффлайн",
    "kick": "Выгнать"
  },
  "publicRooms": {
    "title": "Публичные столы",
    "noRooms": "Нет свободных столов.",
    "joinTable": "Сесть",
    "yourNickname": "Ваш никнейм",
    "confirm": "Войти"
  },
  "game": {
    "selection": {
      "submit": "Отправить {current}/{total} карт"
    },
    "czar": {
      "judging": "Ты Card Czar — выбери лучший ответ!",
      "waiting": "Ты Card Czar — жди, пока остальные выберут карты.",
      "forceAdvance": "Не ждать",
      "label": "Card Czar"
    },
    "waiting": {
      "czarPicking": "Card Czar выбирает победителя...",
      "skipJudging": "Пропустить оценку"
    },
    "blackCard": {
      "pick": "Выбери {n} карту | Выбери {n} карты | Выбери {n} карт"
    },
    "roundSkipped": "Раунд пропущен — время истекло.",
    "results": {
      "roundWinner": "Победитель раунда",
      "winningCards": "Выигрышные карты",
      "score": "Счёт",
      "nextRound": "Новый раунд начнётся через 5 секунд...",
      "endGame": "Завершить игру"
    },
    "finished": {
      "title": "Игра окончена!",
      "finalResults": "Финальные результаты",
      "returnToLobby": "Вернуться в лобби",
      "waitingForHost": "Ждём хоста..."
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/i18n/locales/ru.json
git commit -m "feat(frontend/i18n): add Russian translation file"
```

---

## Task 5: Create Ukrainian translation file

**Files:**
- Create: `packages/frontend/src/i18n/locales/uk.json`

**Step 1: Create `uk.json`**

```json
{
  "common": {
    "cancel": "Скасувати",
    "create": "Створити",
    "join": "Увійти",
    "loading": "Завантаження...",
    "copied": "Скопійовано!",
    "copyLink": "Копіювати посилання"
  },
  "home": {
    "title": "Карти проти людства",
    "createTable": "Створити стіл",
    "joinWithCode": "Увійти за кодом"
  },
  "createTable": {
    "title": "Створити новий стіл",
    "tableName": "Назва столу",
    "tableNamePlaceholder": "Мій стіл",
    "yourNickname": "Ваш нікнейм",
    "nicknamePlaceholder": "Нікнейм",
    "maxPlayers": "Макс. гравців",
    "cardSets": "Набори карт",
    "fetchError": "Не вдалося завантажити набори карт.",
    "loadingSets": "Завантаження наборів...",
    "noSets": "Набори недоступні.",
    "selectAtLeastOne": "Виберіть хоча б один набір.",
    "publicTable": "Публічний стіл (видно у списку)"
  },
  "nickname": {
    "title": "Введіть нікнейм",
    "placeholder": "Нікнейм",
    "join": "Сісти за стіл"
  },
  "joinPrivate": {
    "title": "Увійти до столу",
    "codeLabel": "Код столу (6 символів)",
    "codePlaceholder": "a3f9c1",
    "codeError": "Код має бути 6 символів (a-f, 0-9)"
  },
  "room": {
    "connecting": "Підключення..."
  },
  "lobby": {
    "players": "Гравці ({current}/{max})",
    "startGame": "Почати гру",
    "minPlayers": "({current}/3 хв.)",
    "waitingForHost": "Чекаємо, поки хост почне гру..."
  },
  "player": {
    "host": "хост",
    "you": "ти",
    "afk": "AFK",
    "offline": "офлайн",
    "kick": "Вигнати"
  },
  "publicRooms": {
    "title": "Публічні столи",
    "noRooms": "Немає вільних столів.",
    "joinTable": "Сісти",
    "yourNickname": "Ваш нікнейм",
    "confirm": "Увійти"
  },
  "game": {
    "selection": {
      "submit": "Надіслати {current}/{total} карт"
    },
    "czar": {
      "judging": "Ти Card Czar — вибери найкращу відповідь!",
      "waiting": "Ти Card Czar — чекай, поки інші виберуть карти.",
      "forceAdvance": "Не чекати",
      "label": "Card Czar"
    },
    "waiting": {
      "czarPicking": "Card Czar вибирає переможця...",
      "skipJudging": "Пропустити оцінку"
    },
    "blackCard": {
      "pick": "Вибери {n} картку | Вибери {n} картки | Вибери {n} карток"
    },
    "roundSkipped": "Раунд пропущено — час вичерпано.",
    "results": {
      "roundWinner": "Переможець раунду",
      "winningCards": "Виграшні карти",
      "score": "Рахунок",
      "nextRound": "Новий раунд починається за 5 секунд...",
      "endGame": "Завершити гру"
    },
    "finished": {
      "title": "Гра закінчена!",
      "finalResults": "Фінальні результати",
      "returnToLobby": "Повернутися до лобі",
      "waitingForHost": "Чекаємо хоста..."
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/i18n/locales/uk.json
git commit -m "feat(frontend/i18n): add Ukrainian translation file"
```

---

## Task 6: Create Spanish translation file

**Files:**
- Create: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Create `es.json`**

```json
{
  "common": {
    "cancel": "Cancelar",
    "create": "Crear",
    "join": "Unirse",
    "loading": "Cargando...",
    "copied": "¡Copiado!",
    "copyLink": "Copiar enlace"
  },
  "home": {
    "title": "Cartas contra la humanidad",
    "createTable": "Crear mesa",
    "joinWithCode": "Unirse con código"
  },
  "createTable": {
    "title": "Crear nueva mesa",
    "tableName": "Nombre de la mesa",
    "tableNamePlaceholder": "Mi mesa",
    "yourNickname": "Tu apodo",
    "nicknamePlaceholder": "Apodo",
    "maxPlayers": "Máx. jugadores",
    "cardSets": "Mazos de cartas",
    "fetchError": "No se pudieron cargar los mazos.",
    "loadingSets": "Cargando mazos...",
    "noSets": "No hay mazos disponibles.",
    "selectAtLeastOne": "Selecciona al menos un mazo.",
    "publicTable": "Mesa pública (visible en la lista)"
  },
  "nickname": {
    "title": "Introduce tu apodo",
    "placeholder": "Apodo",
    "join": "Sentarse a la mesa"
  },
  "joinPrivate": {
    "title": "Unirse a una mesa",
    "codeLabel": "Código de mesa (6 caracteres)",
    "codePlaceholder": "a3f9c1",
    "codeError": "El código debe tener 6 caracteres (a-f, 0-9)"
  },
  "room": {
    "connecting": "Conectando..."
  },
  "lobby": {
    "players": "Jugadores ({current}/{max})",
    "startGame": "Iniciar juego",
    "minPlayers": "({current}/3 mín.)",
    "waitingForHost": "Esperando a que el anfitrión inicie el juego..."
  },
  "player": {
    "host": "anfitrión",
    "you": "tú",
    "afk": "AFK",
    "offline": "desconectado",
    "kick": "Expulsar"
  },
  "publicRooms": {
    "title": "Mesas públicas",
    "noRooms": "No hay mesas disponibles.",
    "joinTable": "Sentarse",
    "yourNickname": "Tu apodo",
    "confirm": "Unirse"
  },
  "game": {
    "selection": {
      "submit": "Enviar {current}/{total} cartas"
    },
    "czar": {
      "judging": "¡Eres el Zar de Cartas — elige la mejor respuesta!",
      "waiting": "Eres el Zar de Cartas — espera a que los demás elijan sus cartas.",
      "forceAdvance": "No esperar",
      "label": "Zar de Cartas"
    },
    "waiting": {
      "czarPicking": "El Zar de Cartas está eligiendo al ganador...",
      "skipJudging": "Omitir juicio"
    },
    "blackCard": {
      "pick": "Elige {n} carta | Elige {n} cartas"
    },
    "roundSkipped": "Ronda saltada — tiempo agotado.",
    "results": {
      "roundWinner": "Ganador de la ronda",
      "winningCards": "Cartas ganadoras",
      "score": "Puntuación",
      "nextRound": "La nueva ronda comienza en 5 segundos...",
      "endGame": "Terminar juego"
    },
    "finished": {
      "title": "¡Juego terminado!",
      "finalResults": "Resultados finales",
      "returnToLobby": "Volver al lobby",
      "waitingForHost": "Esperando al anfitrión..."
    }
  }
}
```

**Step 2: Verify build compiles**

```bash
npm run build --workspace=packages/frontend
```

Expected: Build succeeds (all locale files now exist).

**Step 3: Commit**

```bash
git add packages/frontend/src/i18n/locales/es.json
git commit -m "feat(frontend/i18n): add Spanish translation file"
```

---

## Task 7: LanguageSwitcher component + integrate into GameLayout

**Files:**
- Create: `packages/frontend/src/components/LanguageSwitcher.vue`
- Modify: `packages/frontend/src/layouts/GameLayout.vue`

**Step 1: Create `LanguageSwitcher.vue`**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { locale } = useI18n();

const languages = [
  { code: 'cs', label: 'CS' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'uk', label: 'UK' },
  { code: 'es', label: 'ES' },
];

function setLocale(code: string) {
  locale.value = code;
  localStorage.setItem('locale', code);
}
</script>

<template>
  <div class="flex gap-1">
    <button
      v-for="lang in languages"
      :key="lang.code"
      @click="setLocale(lang.code)"
      :class="[
        'px-2 py-1 text-xs rounded font-mono transition-colors',
        locale === lang.code
          ? 'bg-white text-gray-900 font-bold'
          : 'text-gray-400 hover:text-white',
      ]"
    >
      {{ lang.label }}
    </button>
  </div>
</template>
```

**Step 2: Update `GameLayout.vue`**

Replace the current content entirely:
```vue
<script setup lang="ts">
import LanguageSwitcher from '../components/LanguageSwitcher.vue';
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <div class="flex justify-end px-6 pt-4">
      <LanguageSwitcher />
    </div>
    <div class="max-w-6xl mx-auto px-6 py-6">
      <slot></slot>
    </div>
  </div>
</template>
```

**Step 3: Start dev server and verify switcher appears in top-right corner**

```bash
npm run dev:frontend
```

Open http://localhost:5173 — you should see CS / EN / RU / UK / ES buttons top-right. Clicking them should change `localStorage.locale` (check DevTools).

**Step 4: Commit**

```bash
git add packages/frontend/src/components/LanguageSwitcher.vue \
  packages/frontend/src/layouts/GameLayout.vue
git commit -m "feat(frontend): add LanguageSwitcher component and integrate into GameLayout"
```

---

## Task 8: Wire HomeView.vue strings

**Files:**
- Modify: `packages/frontend/src/views/HomeView.vue`

**Step 1: Add `useI18n` import and wire strings**

In `<script setup>`, add after existing imports:
```typescript
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
```

In `<template>`, replace hardcoded Czech strings:
- `Karty proti lidskosti` → `{{ t('home.title') }}`
- `Vytvořit stůl` → `{{ t('home.createTable') }}`
- `Připojit se (kód)` → `{{ t('home.joinWithCode') }}`

**Step 2: Verify in browser — switch to EN, text should change**

**Step 3: Commit**

```bash
git add packages/frontend/src/views/HomeView.vue
git commit -m "feat(frontend): wire HomeView UI strings via i18n"
```

---

## Task 9: Wire CreateTableModal.vue strings

**Files:**
- Modify: `packages/frontend/src/components/CreateTableModal.vue`

**Step 1: Add `useI18n` and wire all strings**

Add to `<script setup>`:
```typescript
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
```

Replace in `<template>` (use the key names from `createTable.*` and `common.*`):

| Old text | New |
|---|---|
| `Vytvořit nový stůl` | `{{ t('createTable.title') }}` |
| `Název stolu` | `{{ t('createTable.tableName') }}` |
| `placeholder="Můj stůl"` | `:placeholder="t('createTable.tableNamePlaceholder')"` |
| `Tvoje přezdívka` (label) | `{{ t('createTable.yourNickname') }}` |
| `placeholder="Přezdívka"` | `:placeholder="t('createTable.nicknamePlaceholder')"` |
| `Max. hráčů` | `{{ t('createTable.maxPlayers') }}` |
| `Sady karet` | `{{ t('createTable.cardSets') }}` |
| `fetchError.value = 'Nepodařilo...'` in JS | `fetchError.value = t('createTable.fetchError')` |
| `Načítání sad...` | `{{ t('createTable.loadingSets') }}` |
| `Žádné sady nejsou k dispozici.` | `{{ t('createTable.noSets') }}` |
| `Vyber alespoň jednu sadu.` | `{{ t('createTable.selectAtLeastOne') }}` |
| `Veřejný stůl (zobrazí se v seznamu)` | `{{ t('createTable.publicTable') }}` |
| `Vytvořit` (button) | `{{ t('common.create') }}` |
| `Zrušit` | `{{ t('common.cancel') }}` |

Note: `fetchError.value` is set in script — use `t()` there too.

**Step 2: Verify in browser — switch language, all modal text updates**

**Step 3: Commit**

```bash
git add packages/frontend/src/components/CreateTableModal.vue
git commit -m "feat(frontend): wire CreateTableModal strings via i18n"
```

---

## Task 10: Wire NicknameModal, JoinPrivateModal, RoomView

**Files:**
- Modify: `packages/frontend/src/components/NicknameModal.vue`
- Modify: `packages/frontend/src/components/JoinPrivateModal.vue`
- Modify: `packages/frontend/src/views/RoomView.vue`

**Step 1: NicknameModal.vue**

Add `const { t } = useI18n()` (with import). Replace:
- `Zadej svou přezdívku` → `{{ t('nickname.title') }}`
- `placeholder="Přezdívka"` → `:placeholder="t('nickname.placeholder')"`
- `Sednout si ke stolu` → `{{ t('nickname.join') }}`

**Step 2: JoinPrivateModal.vue**

Add `const { t } = useI18n()` (with import). Replace:
- `Připojit se ke stolu` → `{{ t('joinPrivate.title') }}`
- `Kód stolu (6 znaků)` → `{{ t('joinPrivate.codeLabel') }}`
- `placeholder="a3f9c1"` → `:placeholder="t('joinPrivate.codePlaceholder')"` (keep as-is — it's an example, leave it hardcoded if preferred)
- `errorMsg.value = 'Kód musí být 6 znaků...'` in JS → `errorMsg.value = t('joinPrivate.codeError')`
- `Připojit` (submit button) → `{{ t('common.join') }}`
- `Zrušit` → `{{ t('common.cancel') }}`

**Step 3: RoomView.vue**

Check current RoomView for "Připojování..." — add `const { t } = useI18n()` and replace with `{{ t('room.connecting') }}`.

**Step 4: Verify in browser**

**Step 5: Commit**

```bash
git add packages/frontend/src/components/NicknameModal.vue \
  packages/frontend/src/components/JoinPrivateModal.vue \
  packages/frontend/src/views/RoomView.vue
git commit -m "feat(frontend): wire NicknameModal, JoinPrivateModal, RoomView strings via i18n"
```

---

## Task 11: Wire lobby components

**Files:**
- Modify: `packages/frontend/src/components/LobbyPanel.vue`
- Modify: `packages/frontend/src/components/PlayerList.vue`
- Modify: `packages/frontend/src/components/PublicRoomsList.vue`
- Modify: `packages/frontend/src/components/InviteLink.vue`

**Step 1: LobbyPanel.vue**

Add `const { t } = useI18n()`. Replace:
- `Hráči ({{ room.players.length }}/{{ room.maxPlayers }})` → `{{ t('lobby.players', { current: room.players.length, max: room.maxPlayers }) }}`
- `Spustit hru` → `{{ t('lobby.startGame') }}`
- `({{ activePlayers }}/3 min.)` → `{{ t('lobby.minPlayers', { current: activePlayers }) }}`
- `Čekáme, až host spustí hru...` → `{{ t('lobby.waitingForHost') }}`

**Step 2: PlayerList.vue**

Add `const { t } = useI18n()`. Replace:
- `(host)` → `({{ t('player.host') }})`
- `(ty)` → `({{ t('player.you') }})`
- `AFK` → `{{ t('player.afk') }}`
- `offline` → `{{ t('player.offline') }}`
- `Vyhodit` → `{{ t('player.kick') }}`

**Step 3: PublicRoomsList.vue**

Add `const { t } = useI18n()`. Replace:
- `Veřejné stoly` → `{{ t('publicRooms.title') }}`
- `Žádné volné stoly.` → `{{ t('publicRooms.noRooms') }}`
- `Sednout si` → `{{ t('publicRooms.joinTable') }}`
- `placeholder="Tvoje přezdívka"` → `:placeholder="t('publicRooms.yourNickname')"`
- `Připojit` (confirm button) → `{{ t('publicRooms.confirm') }}`
- `Zrušit` → `{{ t('common.cancel') }}`

**Step 4: InviteLink.vue**

Add `const { t } = useI18n()`. Replace:
- `copied ? 'Zkopírováno!' : 'Kopírovat odkaz'` → `copied ? t('common.copied') : t('common.copyLink')`

**Step 5: Verify in browser — lobby UI fully translates on language switch**

**Step 6: Commit**

```bash
git add packages/frontend/src/components/LobbyPanel.vue \
  packages/frontend/src/components/PlayerList.vue \
  packages/frontend/src/components/PublicRoomsList.vue \
  packages/frontend/src/components/InviteLink.vue
git commit -m "feat(frontend): wire lobby components via i18n"
```

---

## Task 12: Wire game UI components

**Files:**
- Modify: `packages/frontend/src/components/game/atoms/BlackCard.vue`
- Modify: `packages/frontend/src/components/game/atoms/RoundSkippedNotice.vue`
- Modify: `packages/frontend/src/components/game/atoms/SubmissionStatus.vue`
- Modify: `packages/frontend/src/components/game/layouts/PlayerSelectingLayout.vue`
- Modify: `packages/frontend/src/components/game/layouts/CzarJudgingLayout.vue`
- Modify: `packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue`
- Modify: `packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue`
- Modify: `packages/frontend/src/components/ResultsPhase.vue`
- Modify: `packages/frontend/src/components/FinishedPhase.vue`

**Step 1: BlackCard.vue**

Add `<script setup lang="ts">` section (it currently has no script) with:
```typescript
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
```

Replace the pick hint:
```html
<!-- Before -->
Vyber {{ pick }} {{ pick === 1 ? 'kartu' : 'karty' }}

<!-- After -->
{{ t('game.blackCard.pick', pick, { n: pick }) }}
```

Note: vue-i18n `t(key, count, namedArgs)` — `count` selects plural form via the `pluralRules`, `{ n: pick }` fills the `{n}` placeholder.

**Step 2: RoundSkippedNotice.vue**

Add script setup:
```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>
```

Replace: `Kolo bylo přeskočeno — časový limit vypršel.` → `{{ t('game.roundSkipped') }}`

**Step 3: SubmissionStatus.vue**

Add `const { t } = useI18n()`. Replace:
- `— karetní král` → `— {{ t('game.czar.label') }}`

**Step 4: PlayerSelectingLayout.vue**

Add `const { t } = useI18n()`. Replace:
- `Odeslat {{ selectedCards.length }}/{{ blackCard.pick }} karet` → `{{ t('game.selection.submit', { current: selectedCards.length, total: blackCard.pick }) }}`

**Step 5: CzarJudgingLayout.vue**

Add `const { t } = useI18n()`. Replace:
- `Jsi karetní král — vyber nejlepší odpověď!` → `{{ t('game.czar.judging') }}`

**Step 6: CzarWaitingSelectionLayout.vue**

Add `const { t } = useI18n()`. Replace:
- `Jsi <strong>karetní král</strong> — čekej, až ostatní vyberou karty.` → `{{ t('game.czar.waiting') }}`
- `Dál nečekat` → `{{ t('game.czar.forceAdvance') }}`

**Step 7: WaitingForCzarLayout.vue**

Add `const { t } = useI18n()`. Replace:
- `Karetní král vybírá vítěze...` → `{{ t('game.waiting.czarPicking') }}`
- `Přeskočit hodnocení` → `{{ t('game.waiting.skipJudging') }}`

**Step 8: ResultsPhase.vue**

Add `const { t } = useI18n()`. Replace:
- `Vítěz kola` → `{{ t('game.results.roundWinner') }}`
- `Vítězné karty` heading comment → wrap the section heading with `{{ t('game.results.winningCards') }}` if there's a visible label (check template — there's a comment but no visible heading; skip if no visible text)
- `Skóre` → `{{ t('game.results.score') }}`
- `Nové kolo začíná za 5 sekund...` → `{{ t('game.results.nextRound') }}`
- `Ukončit hru` → `{{ t('game.results.endGame') }}`

**Step 9: FinishedPhase.vue**

Add `const { t } = useI18n()`. Replace:
- `Hra skončila!` → `{{ t('game.finished.title') }}`
- `Finální výsledky` → `{{ t('game.finished.finalResults') }}`
- `Návrat do lobby` → `{{ t('game.finished.returnToLobby') }}`
- `Čekáme na hostitele...` → `{{ t('game.finished.waitingForHost') }}`

**Step 10: Verify in browser** — start a game, switch languages during play, all UI text should update.

**Step 11: Commit**

```bash
git add \
  packages/frontend/src/components/game/atoms/BlackCard.vue \
  packages/frontend/src/components/game/atoms/RoundSkippedNotice.vue \
  packages/frontend/src/components/game/atoms/SubmissionStatus.vue \
  packages/frontend/src/components/game/layouts/PlayerSelectingLayout.vue \
  packages/frontend/src/components/game/layouts/CzarJudgingLayout.vue \
  packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue \
  packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue \
  packages/frontend/src/components/ResultsPhase.vue \
  packages/frontend/src/components/FinishedPhase.vue
git commit -m "feat(frontend): wire all game phase UI strings via i18n"
```

---

## Task 13: DB migration — card translation tables

**Files:**
- Create: `packages/backend/src/db/migrations/20260226000000_card_translations.ts`

**Step 1: Create migration file**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('black_card_translations', (table) => {
    table.increments('id').primary();
    table.integer('black_card_id').unsigned().notNullable();
    table.string('language_code', 5).notNullable();
    table.text('text').notNullable();
    table.unique(['black_card_id', 'language_code']);
    table.foreign('black_card_id').references('id').inTable('black_cards').onDelete('CASCADE');
  });

  await knex.schema.createTable('white_card_translations', (table) => {
    table.increments('id').primary();
    table.integer('white_card_id').unsigned().notNullable();
    table.string('language_code', 5).notNullable();
    table.text('text').notNullable();
    table.unique(['white_card_id', 'language_code']);
    table.foreign('white_card_id').references('id').inTable('white_cards').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('white_card_translations');
  await knex.schema.dropTableIfExists('black_card_translations');
}
```

**Step 2: Run migration**

```bash
npm run migrate --workspace=packages/backend
```

Expected output: Migration `20260226000000_card_translations` ran successfully.

**Step 3: Commit**

```bash
git add packages/backend/src/db/migrations/20260226000000_card_translations.ts
git commit -m "feat(backend/db): add card translation tables migration"
```

---

## Task 14: Backend REST endpoint for card translations (TDD)

**Files:**
- Create: `packages/backend/src/routes/cardTranslations.test.ts`
- Create: `packages/backend/src/routes/cardTranslations.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Write the failing test**

Create `packages/backend/src/routes/cardTranslations.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchCardTranslations } from './cardTranslations.js';

function makeChain(rows: { id: number; text: string }[]) {
  return {
    select: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockResolvedValue(rows),
  };
}

describe('fetchCardTranslations', () => {
  it('returns empty objects when no IDs provided, making no DB calls', async () => {
    const mockKnex = vi.fn() as any;
    const result = await fetchCardTranslations(mockKnex, 'ru', [], []);
    expect(result).toEqual({ black: {}, white: {} });
    expect(mockKnex).not.toHaveBeenCalled();
  });

  it('returns translated black card text', async () => {
    const chain = makeChain([{ id: 1, text: 'Почему ____?' }]);
    const mockKnex = Object.assign(vi.fn(() => chain), {
      raw: vi.fn((s: string) => s),
    }) as any;

    const result = await fetchCardTranslations(mockKnex, 'ru', [1], []);
    expect(result.black['1']).toBe('Почему ____?');
    expect(result.white).toEqual({});
  });

  it('returns translated white card text', async () => {
    const chain = makeChain([{ id: 7, text: 'Путин' }]);
    const mockKnex = Object.assign(vi.fn(() => chain), {
      raw: vi.fn((s: string) => s),
    }) as any;

    const result = await fetchCardTranslations(mockKnex, 'ru', [], [7]);
    expect(result.white['7']).toBe('Путин');
    expect(result.black).toEqual({});
  });

  it('handles both black and white card IDs in one call', async () => {
    let callIdx = 0;
    const mockKnex = Object.assign(
      vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        whereIn: vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) return Promise.resolve([{ id: 3, text: 'Čierny text' }]);
          return Promise.resolve([{ id: 9, text: 'Bílý text' }]);
        }),
      })),
      { raw: vi.fn((s: string) => s) }
    ) as any;

    const result = await fetchCardTranslations(mockKnex, 'cs', [3], [9]);
    expect(result.black['3']).toBe('Čierny text');
    expect(result.white['9']).toBe('Bílý text');
  });
});
```

**Step 2: Run test — expect failure**

```bash
npm test --workspace=packages/backend
```

Expected: FAIL — `Cannot find module './cardTranslations.js'`

**Step 3: Create `cardTranslations.ts`**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import type { Knex } from 'knex';
import db from '../db/db.js';

const SUPPORTED_LANGS = ['cs', 'en', 'ru', 'uk', 'es'] as const;
type SupportedLang = typeof SUPPORTED_LANGS[number];

export async function fetchCardTranslations(
  knex: Knex,
  lang: string,
  blackIds: number[],
  whiteIds: number[],
): Promise<{ black: Record<string, string>; white: Record<string, string> }> {
  const black: Record<string, string> = {};
  const white: Record<string, string> = {};

  if (blackIds.length > 0) {
    const rows = await knex('black_cards as b')
      .select<{ id: number; text: string }[]>(
        'b.id',
        knex.raw('COALESCE(t.text, b.text) as text'),
      )
      .leftJoin('black_card_translations as t', function () {
        this.on('t.black_card_id', '=', 'b.id').andOnVal('t.language_code', lang);
      })
      .whereIn('b.id', blackIds);
    for (const row of rows) black[String(row.id)] = row.text;
  }

  if (whiteIds.length > 0) {
    const rows = await knex('white_cards as w')
      .select<{ id: number; text: string }[]>(
        'w.id',
        knex.raw('COALESCE(t.text, w.text) as text'),
      )
      .leftJoin('white_card_translations as t', function () {
        this.on('t.white_card_id', '=', 'w.id').andOnVal('t.language_code', lang);
      })
      .whereIn('w.id', whiteIds);
    for (const row of rows) white[String(row.id)] = row.text;
  }

  return { black, white };
}

function parseIds(raw: string): number[] {
  return raw
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

const cardTranslationsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { lang?: string; blackIds?: string; whiteIds?: string };
  }>('/cards/translations', async (request, reply) => {
    const { lang = 'cs', blackIds = '', whiteIds = '' } = request.query;
    const safeLang = SUPPORTED_LANGS.includes(lang as SupportedLang) ? lang : 'cs';

    try {
      return await fetchCardTranslations(
        db,
        safeLang,
        parseIds(blackIds),
        parseIds(whiteIds),
      );
    } catch (err) {
      fastify.log.error(err, 'card translations query failed');
      return reply.status(500).send({ error: 'Failed to fetch translations' });
    }
  });
};

export default cardTranslationsRoute;
```

**Step 4: Run tests — expect pass**

```bash
npm test --workspace=packages/backend
```

Expected: All tests pass (20 existing + 4 new = 24 tests).

**Step 5: Register route in `index.ts`**

After the existing `cardSetsRoutes` registration, add:
```typescript
import cardTranslationsRoute from './routes/cardTranslations.js';
// ...
await app.register(cardTranslationsRoute, { prefix: '/api' });
```

**Step 6: Manual test**

```bash
curl "http://localhost:3000/api/cards/translations?lang=en&blackIds=1&whiteIds=1,2,3"
```

Expected: JSON with `black` and `white` objects. Czech text falls back when no EN translation exists.

**Step 7: Commit**

```bash
git add packages/backend/src/routes/cardTranslations.ts \
  packages/backend/src/routes/cardTranslations.test.ts \
  packages/backend/src/index.ts
git commit -m "feat(backend): add card translations REST endpoint with Czech fallback (TDD)"
```

---

## Task 15: Frontend `useCardTranslations` composable

**Files:**
- Create: `packages/frontend/src/composables/useCardTranslations.ts`

**Step 1: Create the composable**

```typescript
import { useI18n } from 'vue-i18n';

// Module-level cache: survives component remounts, cleared on hard reload
const cache = new Map<string, string>();

function key(lang: string, type: 'b' | 'w', id: number): string {
  return `${lang}:${type}:${id}`;
}

export function useCardTranslations() {
  const { locale } = useI18n();
  const backendUrl = import.meta.env.VITE_BACKEND_URL as string;

  async function fetchTranslations(blackIds: number[], whiteIds: number[]): Promise<void> {
    const lang = locale.value;
    const uncachedBlack = blackIds.filter((id) => !cache.has(key(lang, 'b', id)));
    const uncachedWhite = whiteIds.filter((id) => !cache.has(key(lang, 'w', id)));
    if (uncachedBlack.length === 0 && uncachedWhite.length === 0) return;

    const params = new URLSearchParams({ lang });
    if (uncachedBlack.length) params.set('blackIds', uncachedBlack.join(','));
    if (uncachedWhite.length) params.set('whiteIds', uncachedWhite.join(','));

    try {
      const res = await fetch(`${backendUrl}/api/cards/translations?${params}`);
      if (!res.ok) return;
      const data = await res.json() as {
        black: Record<string, string>;
        white: Record<string, string>;
      };
      for (const [id, text] of Object.entries(data.black)) {
        cache.set(key(lang, 'b', Number(id)), text);
      }
      for (const [id, text] of Object.entries(data.white)) {
        cache.set(key(lang, 'w', Number(id)), text);
      }
    } catch {
      // Silently fail — components fall back to original text
    }
  }

  function getBlack(id: number, fallback: string): string {
    return cache.get(key(locale.value, 'b', id)) ?? fallback;
  }

  function getWhite(id: number, fallback: string): string {
    return cache.get(key(locale.value, 'w', id)) ?? fallback;
  }

  return { fetchTranslations, getBlack, getWhite };
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/composables/useCardTranslations.ts
git commit -m "feat(frontend): add useCardTranslations composable with session cache"
```

---

## Task 16: Wire card translations into game phases

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`
- Modify: `packages/frontend/src/components/JudgingPhase.vue`
- Modify: `packages/frontend/src/components/ResultsPhase.vue`

**Background:** The layout components receive `blackCard` and `hand` (white cards) as props and display `.text` directly. We intercept in the phase components by providing translated card objects.

**Step 1: Update `SelectionPhase.vue`**

Add imports and composable usage in `<script setup>`:
```typescript
import { watch, computed } from 'vue'; // already imported, add watch if missing
import { useI18n } from 'vue-i18n';
import { useCardTranslations } from '../composables/useCardTranslations.js';

const { locale } = useI18n();
const cardTranslations = useCardTranslations();

// Fetch whenever black card, hand, or locale changes
watch(
  [() => roomStore.currentBlackCard, () => roomStore.hand, locale],
  async () => {
    const blackIds = roomStore.currentBlackCard ? [roomStore.currentBlackCard.id] : [];
    const whiteIds = roomStore.hand.map((c) => c.id);
    await cardTranslations.fetchTranslations(blackIds, whiteIds);
  },
  { immediate: true }
);

const translatedBlackCard = computed(() => {
  const bc = roomStore.currentBlackCard;
  if (!bc) return bc;
  return { ...bc, text: cardTranslations.getBlack(bc.id, bc.text) };
});

const translatedHand = computed(() =>
  roomStore.hand.map((c) => ({ ...c, text: cardTranslations.getWhite(c.id, c.text) }))
);
```

In `<template>`, replace every `:blackCard="roomStore.currentBlackCard!"` with `:blackCard="translatedBlackCard!"` and every `:hand="roomStore.hand"` with `:hand="translatedHand"`.

**Step 2: Update `JudgingPhase.vue`**

Same pattern — add `useCardTranslations`, watch `currentBlackCard` and `locale`, create `translatedBlackCard` computed. Replace `:blackCard="roomStore.currentBlackCard!"` in both `CzarJudgingLayout` and `WaitingForCzarLayout`.

Note: Submissions show anonymous white cards (text is already in each submission object). Wire white card translation for those too:
```typescript
watch(
  [() => roomStore.currentBlackCard, () => roomStore.submissions, locale],
  async () => {
    const blackIds = roomStore.currentBlackCard ? [roomStore.currentBlackCard.id] : [];
    const whiteIds = roomStore.submissions.flatMap((s) => s.cards.map((c) => c.id));
    await cardTranslations.fetchTranslations(blackIds, whiteIds);
  },
  { immediate: true }
);

const translatedSubmissions = computed(() =>
  roomStore.submissions.map((s) => ({
    ...s,
    cards: s.cards.map((c) => ({ ...c, text: cardTranslations.getWhite(c.id, c.text) })),
  }))
);
```

Replace `:submissions="roomStore.submissions"` with `:submissions="translatedSubmissions"`.

**Step 3: Update `ResultsPhase.vue`**

The winning cards (`roomStore.roundResult?.winningCards`) are white cards. After round result arrives, fetch their translations:
```typescript
import { watch } from 'vue'; // already imported
import { useI18n } from 'vue-i18n';
import { useCardTranslations } from '../composables/useCardTranslations.js';

const { locale } = useI18n();
const cardTranslations = useCardTranslations();

watch(
  [() => roomStore.roundResult, locale],
  async () => {
    const ids = roomStore.roundResult?.winningCards.map((c) => c.id) ?? [];
    await cardTranslations.fetchTranslations([], ids);
  },
  { immediate: true }
);

const translatedWinningCards = computed(() =>
  roomStore.roundResult?.winningCards.map((c) => ({
    ...c,
    text: cardTranslations.getWhite(c.id, c.text),
  })) ?? []
);
```

In `<template>`, replace `roomStore.roundResult?.winningCards ?? []` with `translatedWinningCards`.

**Step 4: Verify end-to-end**

1. Start both dev servers
2. Open two browser windows, join the same room
3. Set one window to Russian (RU button)
4. Start a game — cards still show Czech (no translations in DB yet, Czech fallback works)
5. Insert a test translation directly in MySQL:
   ```sql
   INSERT INTO black_card_translations (black_card_id, language_code, text)
   VALUES (1, 'ru', 'Тестовая чёрная карта');
   ```
6. Start a new round — the Russian window should show the Russian translation for card ID 1

**Step 5: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue \
  packages/frontend/src/components/JudgingPhase.vue \
  packages/frontend/src/components/ResultsPhase.vue
git commit -m "feat(frontend): wire card translations in game phases via useCardTranslations"
```

---

## Summary

After all tasks are complete:

**What works:**
- UI is fully translated in all 5 languages
- Language is auto-detected from browser, persisted in `localStorage`
- Language can be switched live with the top-right switcher — no reload needed
- Czech is the fallback if a translation is missing
- DB has translation tables for black and white cards
- REST endpoint `GET /api/cards/translations?lang=ru&blackIds=1,2&whiteIds=1,2` serves translations with Czech fallback
- Game cards display in each player's language (independently, per-session)
- Card translations are cached in memory for the session (no repeated fetches)

**What's NOT included (future work):**
- Admin UI for managing card translations
- Seed data for non-Czech translations
- Per-player language stored server-side (currently client-only)
- Locale-based routing (`/ru/room/...`)
