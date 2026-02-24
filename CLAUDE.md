# 🃏 Project: Cards Against Humanity Clone

Vlastní online verze hry Karty proti lidskosti.

## 🏗️ Architektura

**Monorepo** (npm workspaces) se třemi balíčky:

| Balíček | Tech | Port |
|---|---|---|
| `@kpl/shared` | TypeScript typy (game state, Socket events) | — |
| `@kpl/backend` | Node.js + Fastify + Socket.io + Knex + MySQL2 + Zod | 3000 |
| `@kpl/frontend` | Vue 3 (Composition API) + Vite + Tailwind v4 + Pinia + Vue Router | 5173 |

**Infrastruktura:** Linux VPS + Apache (reverse proxy + WebSocket tunel na `/socket.io/`) + PM2.
**Migrace:** Knex.js CLI (`npm run migrate --workspace=packages/backend`).
**Env:** databázové údaje v `.env` (viz `.env.example`).
**Mobilní export (budoucnost):** Capacitor.js nad hotovým Vue SPA.

## 📁 Struktura projektu

```
kpl-wnc/
├── packages/
│   ├── shared/src/index.ts         # Sdílené typy: GameStatus, Player, GameRoom, CardSubmission,
│   │                               #   PublicRoomSummary, ServerToClientEvents, ClientToServerEvents
│   ├── backend/src/
│   │   ├── index.ts                # Fastify server + Socket.io
│   │   ├── game/
│   │   │   └── RoomManager.ts      # In-memory správa místností (create/join/leave/kick/AFK/reconnect)
│   │   ├── socket/
│   │   │   └── lobbyHandlers.ts    # Socket.io lobby handlery (create/join/leave/kick/settings/startGame)
│   │   ├── routes/                 # REST API (CRUD karet a sad) — zatím prázdné
│   │   └── db/                     # Knex config + migrace
│   └── frontend/src/
│       ├── router/index.ts         # Vue Router: / a /room/:token
│       ├── views/
│       │   ├── HomeView.vue        # Seznam stolů, vytvoř/připoj se
│       │   └── RoomView.vue        # Lobby nebo hra (podle room.status)
│       ├── components/
│       │   ├── LobbyPanel.vue      # Hlavní panel lobby (seznam hráčů, spuštění hry)
│       │   ├── PlayerList.vue      # Seznam hráčů s AFK/offline/host/self badges
│       │   ├── InviteLink.vue      # Kopírování URL stolu
│       │   ├── NicknameModal.vue   # Zadání přezdívky při prvním vstupu
│       │   ├── CreateTableModal.vue # Formulář pro vytvoření stolu
│       │   ├── JoinPrivateModal.vue # Vstup přes 6-znakový kód
│       │   └── PublicRoomsList.vue # Živý seznam veřejných stolů
│       ├── stores/
│       │   ├── lobbyStore.ts       # Veřejné stoly, create/join, localStorage token
│       │   └── roomStore.ts        # Stav aktuálního stolu, isHost, kick, startGame
│       └── socket/index.ts         # Socket.io client wrapper
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
npm test --workspace=packages/backend   # Vitest unit testy (RoomManager)
```

## 🗄️ Databázové schéma

Každá karta patří právě jedné sadě (přístup duplikace přiřazení).

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
```

## 🔌 Lobby — Socket.io architektura

Server používá Socket.io **rooms** pro izolaci:
- `socket.join('lobby')` — klient browsuje seznam veřejných stolů (HomeView)
- `socket.join('room:<code>')` — klient sedí u stolu

**Player token** (UUID) vydán serverem při prvním sezení, uložen v `localStorage[playerToken_<code>]`. Slouží pro automatický reconnect — server obnoví slot hráče bez ztráty stavu.

**AFK:** po 30s od odpojení se hráč označí `isAfk = true`. Hra na něj nečeká, ale může se kdykoliv vrátit.

**Host:** zakládá stůl, může vyhazovat hráče a měnit nastavení. Při odchodu hosta přechází role na dalšího non-AFK hráče.

## 🎮 Herní logika (server-side state)

Server drží stav her v paměti (`RoomManager`) — bez latence DB.

| Stav | Popis |
|---|---|
| `LOBBY` | Čekání na hráče, výběr sad karet |
| `SELECTION` | Hráči vybírají bílé karty z ruky |
| `JUDGING` | Card Czar anonymně vybírá vítěze kola |
| `RESULTS` | Zobrazení vítěze, přičtení bodů, přechod na nové kolo |

## 🚀 Roadmap

- [x] Monorepo setup — npm workspaces, TypeScript, Fastify server, Vue 3 + Tailwind v4
- [ ] REST API — CRUD pro sady a karty
- [x] Lobby — Socket.io místnosti, správa hráčů, AFK, reconnect, host přenos
- [ ] Výběr sad karet v lobby (závisí na REST API)
- [ ] Hra — stavový stroj (rozdávání, hraní, vyhodnocení)
- [ ] VPS deploy — Apache proxy + PM2
