# 🃏 Project: Cards Against Humanity Clone

Vlastní online verze hry Karty proti lidskosti.

## 🏗️ Architektura

**Monorepo** (npm workspaces) se třemi balíčky:

| Balíček | Tech | Port |
|---|---|---|
| `@kpl/shared` | TypeScript typy (game state, Socket events) | — |
| `@kpl/backend` | Node.js + Fastify + Socket.io + Knex + MySQL2 | 3000 |
| `@kpl/frontend` | Vue 3 (Composition API) + Vite + Tailwind v4 + Pinia + Vue Router | 5173 |

**Infrastruktura:** Linux VPS + Apache (reverse proxy + WebSocket tunel na `/socket.io/`) + PM2.
**Migrace:** Knex.js CLI (`npm run migrate --workspace=packages/backend`).
**Seed dat:** `npm run seed --workspace=packages/backend` — načte českou sadu karet (destruktivní, jen pro dev).
**Env:** databázové údaje a URL v `.env` (viz `.env.example`). Vite čte `.env` z kořene monorepa (`envDir: '../../'` v `vite.config.ts`).
**Mobilní export (budoucnost):** Capacitor.js nad hotovým Vue SPA.

## 📁 Struktura projektu

```
kpl-wnc/
├── packages/
│   ├── shared/src/index.ts         # Sdílené typy: GameStatus, Player, GameRoom, CardSubmission,
│   │                               #   PublicRoomSummary, ServerToClientEvents, ClientToServerEvents
│   ├── backend/src/
│   │   ├── index.ts                # Fastify server + Socket.io + registrace routes
│   │   ├── game/
│   │   │   ├── RoomManager.ts      # In-memory správa místností (create/join/leave/kick/AFK/reconnect)
│   │   │   ├── GameEngine.ts       # Herní logika kola: rozdávání karet, submissions, výsledky
│   │   │   └── GarbageCollector.ts # Mazání idle místností (5min interval, 2h/15min prahy)
│   │   ├── socket/
│   │   │   ├── lobbyHandlers.ts    # Socket.io lobby handlery (create/join/leave/kick/settings/startGame)
│   │   │   ├── gameHandlers.ts     # Socket.io herní handlery (playCards/judgeSelect/czarAdvance/…)
│   │   │   ├── roundUtils.ts       # Sdílené utility pro přechody kol (startNextRound, finishGame…)
│   │   │   └── socketState.ts      # Sdílený roomManager singleton pro socket handlery
│   │   ├── routes/
│   │   │   ├── cardSets.ts         # GET /api/card-sets — seznam sad s počty karet
│   │   │   ├── cardTranslations.ts # GET /api/cards/translations — překlad karet (COALESCE fallback na cs)
│   │   │   └── rooms.ts            # GET /api/rooms/:code/preview — náhled místnosti (bez autentizace)
│   │   └── db/
│   │       ├── db.ts               # Knex singleton (sdílený napříč routami)
│   │       ├── knexfile.ts         # Knex config (migrations + seeds)
│   │       ├── migrate.ts          # CLI runner pro migrace
│   │       ├── seed.ts             # CLI runner pro seed data
│   │       ├── migrations/         # Knex migrace
│   │       └── seeds/
│   │           ├── 01_czech_set.ts       # Základní česká sada
│   │           └── 02_liberecaci_2026.ts # Liberecká banda 2026
│   └── frontend/src/
│       ├── router/index.ts         # Vue Router: / a /room/:token
│       ├── layouts/
│       │   └── GameLayout.vue      # Wrapper layoutu hry (AppHeader + slot pro obsah)
│       ├── views/
│       │   ├── HomeView.vue        # Seznam stolů, vytvoř/připoj se
│       │   └── RoomView.vue        # Lobby nebo hra (podle room.status)
│       ├── components/
│       │   ├── AppHeader.vue       # Horní lišta: PlayerAvatar (edit profilu), přechod na HomeView
│       │   ├── Avatar.vue          # Základní avatar komponenta (DiceBear URL → img)
│       │   ├── LobbyPanel.vue      # Hlavní panel lobby (seznam hráčů, spuštění hry)
│       │   ├── PlayerList.vue      # Seznam hráčů s AFK/offline/host/self badges
│       │   ├── PlayerAvatar.vue    # Kulatý avatar s DiceBear, klik otevře edit profilu v AppHeader
│       │   ├── PlayerProfileModal.vue # Setup/edit profilu — přezdívka, jazyk, live DiceBear náhled
│       │   ├── InviteLink.vue      # Kopírování URL stolu
│       │   ├── CreateTableModal.vue # Formulář pro vytvoření stolu + výběr 1 sady karet
│       │   ├── JoinPrivateModal.vue # Vstup přes 6-znakový kód
│       │   ├── RoomPreviewModal.vue # Náhled místnosti před připojením (playerlist, status)
│       │   ├── PublicRoomsList.vue # Živý seznam veřejných stolů (join emituje jen kód)
│       │   ├── SelectionPhase.vue  # Fáze výběru karet hráčem (SELECTION)
│       │   ├── JudgingPhase.vue    # Fáze hodnocení Card Czarem (JUDGING)
│       │   ├── ResultsPhase.vue    # Výsledky kola (RESULTS)
│       │   ├── FinishedPhase.vue   # Konec hry — pódium, závěrečné skóre (FINISHED)
│       │   ├── game/atoms/         # Malé znovupoužitelné herní komponenty
│       │   │   ├── BlackCard.vue, CardHand.vue, Scoreboard.vue, Podium.vue
│       │   │   ├── SubmissionGrid.vue, SubmissionStatus.vue, CzarBadge.vue
│       │   │   ├── Countdown.vue, RoundSkippedNotice.vue
│       │   └── game/layouts/       # Layout kompozice pro různé stavy hráče
│       │       ├── PlayerSelectingLayout.vue, PlayerSubmittedLayout.vue
│       │       ├── CzarWaitingSelectionLayout.vue, CzarJudgingLayout.vue
│       │       └── WaitingForCzarLayout.vue
│       ├── composables/
│       │   ├── useCardTranslations.ts # Fetch + module-level cache překladu karet; reaktivní cacheVersion
│       │   └── useSound.ts            # Přehrávání zvukových efektů (win, card select, …)
│       ├── stores/
│       │   ├── lobbyStore.ts       # Veřejné stoly, create/join, fetchCardSets, localStorage token
│       │   ├── roomStore.ts        # Stav aktuálního stolu, isHost, kick, startGame
│       │   └── profileStore.ts     # Globální profil hráče: nickname, locale, avatarUrl (DiceBear)
│       ├── i18n/
│       │   ├── index.ts            # vue-i18n setup, detectLocale(), 5 supported locales
│       │   └── locales/            # cs.json, en.json, ru.json, uk.json, es.json
│       └── socket/index.ts         # Socket.io client wrapper (URL z VITE_BACKEND_URL)
├── docs/plans/                     # Design a implementační plány
├── package.json                    # npm workspaces root
├── tsconfig.json                   # Base TS config (NodeNext, strict)
└── .env.example
```

## 🛠️ Příkazy

```bash
npm run dev:backend     # Fastify dev server (tsx watch)
npm run dev:frontend    # Vite dev server
npm run build           # Build všech balíčků
npm run migrate --workspace=packages/backend   # Spustí DB migrace
npm run seed --workspace=packages/backend      # Naplní DB seed daty (destruktivní!)
npm test --workspace=packages/backend          # Vitest unit testy — 66 testů
```

## 🗄️ Databázové schéma

Každá karta patří právě jedné sadě (přístup duplikace přiřazení). Každá karta může mít překlad do libovolného počtu jazyků. 
Výchozím jazykem je čeština

```sql
CREATE TABLE card_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    slug VARCHAR(50) UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE black_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    card_set_id INT NOT NULL,
    text TEXT NOT NULL,       -- Obsahuje placeholder "____"
    pick TINYINT DEFAULT 1,   -- Počet bílých karet k doložení
    FOREIGN KEY (card_set_id) REFERENCES card_sets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE white_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    card_set_id INT NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (card_set_id) REFERENCES card_sets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Překlady karet (fallback na originál přes COALESCE v dotazu)
CREATE TABLE black_card_translations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    black_card_id INT UNSIGNED NOT NULL,
    language_code VARCHAR(5) NOT NULL,
    text TEXT NOT NULL,
    UNIQUE (black_card_id, language_code),
    FOREIGN KEY (black_card_id) REFERENCES black_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE white_card_translations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    white_card_id INT UNSIGNED NOT NULL,
    language_code VARCHAR(5) NOT NULL,
    text TEXT NOT NULL,
    UNIQUE (white_card_id, language_code),
    FOREIGN KEY (white_card_id) REFERENCES white_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 🔌 Lobby — Socket.io architektura

Server používá Socket.io **rooms** pro izolaci:
- `socket.join('lobby')` — klient browsuje seznam veřejných stolů (HomeView)
- `socket.join('room:<code>')` — klient sedí u stolu

**Player token** (UUID) vydán serverem při prvním sezení, uložen v `localStorage[playerToken_<code>]`. Slouží pro automatický reconnect — server obnoví slot hráče bez ztráty stavu.

**AFK:** po 30s od odpojení se hráč označí `isAfk = true`. Hra na něj nečeká, ale může se kdykoliv vrátit.

**Host:** zakládá stůl, může vyhazovat hráče a měnit nastavení. Při odchodu hosta přechází role na dalšího non-AFK hráče.

## 👤 Player Profile

Globální profil hráče uložený v `localStorage['playerProfile']` (JSON: `{nickname, locale}`).

**`profileStore.ts`** (Pinia): `nickname`, `locale`, computed `avatarUrl` (DiceBear bottts CDN), `hasProfile`, `init()`, `save()`.

**Inicializace:** `App.vue` volá `profileStore.init()` při mountu. Pokud `!hasProfile`, zobrazí `PlayerProfileModal` (setup mode) a blokuje `RouterView` dokud profil není vyplněn.

**Editace:** `AppHeader.vue` (uvnitř `GameLayout.vue`) zobrazuje `PlayerAvatar` v pravém rohu — kliknutím otevře `PlayerProfileModal` (edit mode). Backdrop + tlačítko ✕ zavřou modal.

**Přihlášení do místnosti:** `RoomView` a `HomeView` čtou `profileStore.nickname` — žádný inline formulář pro přezdívku. Při reconnectu (existující `playerToken`) se předá prázdný nickname (server použije token).

**Lokalizace:** `save()` okamžitě přepne `i18n.global.locale` + uloží do `localStorage['locale']`. Podporované: `cs`, `en`, `ru`, `uk`, `es`.

## 🌐 REST API

| Metoda | Endpoint | Popis |
|---|---|---|
| GET | `/api/card-sets` | Seznam sad s počty karet (`blackCardCount`, `whiteCardCount`) |
| GET | `/api/cards/translations` | Překlad karet: `?lang=ru&blackIds=1,2&whiteIds=3,4` → `{black:{}, white:{}}` |
| GET | `/api/rooms/:code/preview` | Náhled místnosti: status, hráči (nickname+isAfk), kapacita |
| GET | `/health` | Health check |

`CardSetSummary` typ je definován v `lobbyStore.ts` (frontend) — obsahuje `id, name, description, slug, isPublic, blackCardCount, whiteCardCount`.

## ⚙️ Env proměnné

| Proměnná | Kde se používá | Příklad |
|---|---|---|
| `DB_HOST/PORT/USER/PASSWORD/NAME` | Backend (Knex) | `localhost` / `3306` / … |
| `PORT` | Backend (Fastify) | `3000` |
| `FRONTEND_URL` | Backend CORS + Socket.io CORS | `http://10.5.10.150:5173` |
| `VITE_BACKEND_URL` | Frontend (socket + fetch) | `http://10.5.10.150:3000` |

> **Pozor:** Vite načítá `.env` z kořene monorepa díky `envDir: '../../'` v `vite.config.ts`. Pro LAN/mobilní dev nastav obě URL na IP adresy (ne localhost).

## 🎮 Herní logika (server-side state)

Server drží stav her v paměti (`RoomManager`) — bez latence DB.

| Stav | Popis |
|---|---|
| `LOBBY` | Čekání na hráče, výběr sad karet |
| `SELECTION` | Hráči vybírají bílé karty z ruky |
| `JUDGING` | Card Czar anonymně vybírá vítěze kola |
| `RESULTS` | Zobrazení vítěze, přičtení bodů, přechod na nové kolo |
| `FINISHED` | Konec hry — host ukončil hru nebo dosažen `targetScore` |

`startGame` validuje: ≥3 aktivní hráči AND `selectedSetIds.length > 0`.

**Poznámky k implementaci:**
- `CreateTableModal` aktuálně podporuje výběr právě 1 sady karet (přestože backend a typy podporují `selectedSetIds: number[]`)
- `socketId` je součástí `Player` a je broadcastován všem hráčům v místnosti — informace nutná jen pro server
- Zvuky: `useSound.ts` přehrává efekty při herních událostech (výhra kola, výběr karty, …)

## 🚀 Roadmap

- [x] Monorepo setup — npm workspaces, TypeScript, Fastify server, Vue 3 + Tailwind v4
- [x] Lobby — Socket.io místnosti, správa hráčů, AFK, reconnect, host přenos
- [x] REST API — GET /api/card-sets + seed data (česká sada)
- [x] Výběr sad karet při vytváření stolu (CreateTableModal)
- [x] Hra — stavový stroj (rozdávání, hraní, vyhodnocení)
- [x] VPS deploy — Apache proxy + PM2
- [x] Správa místnosti hostem (vyhodnocení hry, změna režimu a pod.)
- [x] Globální profil hráče — nickname + DiceBear avatar + locale (localStorage, bez OAuth)
- [x] Vícejazyčná verze — 5 jazyků (cs, en, ru, uk, es), překlad karet přes REST
- [x] Finální vzhled (layout, design)
- [ ] Profily hráčů — OAuth (Google, Facebook)
- [ ] REST API — CRUD pro správu sad a karet (admin)
