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
│   ├── shared/src/index.ts     # Sdílené typy: GameStatus, Player, GameRoom, ServerToClientEvents, ClientToServerEvents
│   ├── backend/src/
│   │   ├── index.ts            # Fastify server + Socket.io
│   │   ├── routes/             # REST API (CRUD karet a sad)
│   │   ├── game/               # Stavový stroj hry
│   │   ├── socket/             # Socket.io handlery
│   │   └── db/                 # Knex config + migrace
│   └── frontend/src/
│       ├── views/              # Stránky (Lobby, Hra, Správa karet)
│       ├── components/
│       ├── stores/             # Pinia stores
│       └── socket/             # Socket.io client wrapper
├── package.json                # npm workspaces root
├── tsconfig.json               # Base TS config (NodeNext, strict)
└── .env.example
```

## 🛠️ Příkazy

```bash
npm run dev:backend     # Fastify dev server (tsx watch)
npm run dev:frontend    # Vite dev server
npm run build           # Build všech balíčků
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

## 🎮 Herní logika (server-side state)

Server drží stav her v paměti (`rooms` objekt) — bez latence DB.

| Stav | Popis |
|---|---|
| `LOBBY` | Čekání na hráče, výběr sad karet |
| `SELECTION` | Hráči vybírají bílé karty z ruky |
| `JUDGING` | Card Czar anonymně vybírá vítěze kola |
| `RESULTS` | Zobrazení vítěze, přičtení bodů, přechod na nové kolo |

## 🚀 Roadmap

- [x] Monorepo setup — npm workspaces, TypeScript, Fastify server, Vue 3 + Tailwind v4
- [ ] REST API — CRUD pro sady a karty
- [ ] Lobby — Socket.io místnosti, správa hráčů
- [ ] Hra — stavový stroj (rozdávání, hraní, vyhodnocení)
- [ ] VPS deploy — Apache proxy + PM2
