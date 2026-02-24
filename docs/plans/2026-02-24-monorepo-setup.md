# Monorepo Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inicializovat npm workspaces monorepo se třemi balíčky (shared, backend, frontend) včetně všech závislostí a základní konfigurace TypeScript.

**Architecture:** Root monorepo s npm workspaces. `shared` exportuje sdílené TypeScript typy. `backend` je Fastify + Socket.io + Knex server. `frontend` je Vue 3 + Vite + Tailwind v4 SPA.

**Tech Stack:** Node.js, TypeScript, npm workspaces, Fastify, Socket.io, Knex, MySQL2, Zod, Vue 3, Vite, Tailwind CSS v4, Pinia, Vue Router, socket.io-client

---

## Task 1: Root monorepo

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Vytvoř root `package.json`**

```json
{
  "name": "kpl-wnc",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:backend": "npm run dev --workspace=packages/backend",
    "dev:frontend": "npm run dev --workspace=packages/frontend",
    "build": "npm run build --workspace=packages/shared && npm run build --workspace=packages/backend && npm run build --workspace=packages/frontend"
  }
}
```

**Step 2: Vytvoř base `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

**Step 3: Vytvoř `.gitignore`**

```
node_modules/
dist/
.env
*.local
```

**Step 4: Vytvoř `.env.example`**

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=kpl_user
DB_PASSWORD=
DB_NAME=kpl_wnc
PORT=3000
```

**Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example
git commit -m "chore: init monorepo root with npm workspaces"
```

---

## Task 2: Shared balíček (typy)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

**Step 1: Vytvoř `packages/shared/package.json`**

```json
{
  "name": "@kpl/shared",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Vytvoř `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

**Step 3: Vytvoř `packages/shared/src/index.ts` se základními typy**

```typescript
// Herní stavy
export type GameStatus = 'LOBBY' | 'SELECTION' | 'JUDGING' | 'RESULTS';

// Hráč
export interface Player {
  id: string;
  nickname: string;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
}

// Karty
export interface BlackCard {
  id: number;
  text: string;
  pick: number;
}

export interface WhiteCard {
  id: number;
  text: string;
}

// Sada karet
export interface CardSet {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  isPublic: boolean;
}

// Herní místnost
export interface GameRoom {
  code: string;
  status: GameStatus;
  players: Player[];
  currentBlackCard: BlackCard | null;
  roundNumber: number;
}

// Socket.io eventy - server → klient
export interface ServerToClientEvents {
  'game:stateUpdate': (room: GameRoom) => void;
  'game:error': (message: string) => void;
  'game:roundStart': (blackCard: BlackCard) => void;
  'game:judging': (submissions: Array<{ playerId: string; cards: WhiteCard[] }>) => void;
  'game:roundEnd': (winnerId: string, winnerCards: WhiteCard[]) => void;
}

// Socket.io eventy - klient → server
export interface ClientToServerEvents {
  'game:join': (code: string, nickname: string, callback: (success: boolean, error?: string) => void) => void;
  'game:leave': () => void;
  'game:startGame': (selectedSetIds: number[]) => void;
  'game:playCards': (cardIds: number[]) => void;
  'game:judgeSelect': (playerId: string) => void;
}
```

**Step 4: Nainstaluj závislosti a buildni shared**

```bash
npm install --workspace=packages/shared
npm run build --workspace=packages/shared
```

Očekávání: vytvoří se `packages/shared/dist/` s `index.js` a `index.d.ts`.

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared TypeScript types for game state and socket events"
```

---

## Task 3: Backend - inicializace a závislosti

**Files:**
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`

**Step 1: Vytvoř `packages/backend/package.json`**

```json
{
  "name": "@kpl/backend",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "knex migrate:latest --knexfile src/db/knexfile.ts",
    "migrate:make": "knex migrate:make --knexfile src/db/knexfile.ts"
  },
  "dependencies": {
    "@kpl/shared": "*",
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "fastify-plugin": "^5.0.0",
    "socket.io": "^4.8.0",
    "knex": "^3.0.0",
    "mysql2": "^3.0.0",
    "dotenv": "^16.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0",
    "@types/node": "^22.0.0"
  }
}
```

**Step 2: Vytvoř `packages/backend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Nainstaluj závislosti**

```bash
npm install --workspace=packages/backend
```

Očekávání: `packages/backend/node_modules/` vytvořen, symlink na `@kpl/shared` v `node_modules/`.

**Step 4: Commit**

```bash
git add packages/backend/package.json packages/backend/tsconfig.json
git commit -m "chore: add backend package config and dependencies"
```

---

## Task 4: Backend - základní server

**Files:**
- Create: `packages/backend/src/index.ts`
- Create: `packages/backend/src/plugins/socket.ts`

**Step 1: Vytvoř `packages/backend/src/index.ts`**

```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  },
});

app.get('/health', async () => ({ status: 'ok' }));

io.on('connection', (socket) => {
  app.log.info(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    app.log.info(`Client disconnected: ${socket.id}`);
  });
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
```

**Step 2: Spusť dev server a ověř**

```bash
npm run dev --workspace=packages/backend
```

Očekávání: výstup `{"msg":"Server listening at http://0.0.0.0:3000"}`.

**Step 3: Ověř health endpoint**

```bash
curl http://localhost:3000/health
```

Očekávání: `{"status":"ok"}`

**Step 4: Commit**

```bash
git add packages/backend/src/
git commit -m "feat: add Fastify server with Socket.io and health endpoint"
```

---

## Task 5: Frontend - inicializace

**Files:**
- Create: `packages/frontend/` (scaffolded via Vite)

**Step 1: Scaffold Vue 3 + TypeScript projekt**

```bash
npm create vue@latest packages/frontend -- --typescript --router --pinia --no-jsx --no-vitest --no-eslint
```

Odpověz na interaktivní dotazy:
- Project name: `frontend`
- Add TypeScript: Yes
- Add Vue Router: Yes
- Add Pinia: Yes
- Add ESLint: No (přidáme později)

**Step 2: Uprav `packages/frontend/package.json` - přejmenuj a přidej závislosti**

Přidej do `dependencies`:
```json
"@kpl/shared": "*",
"socket.io-client": "^4.8.0"
```

Přidej do `devDependencies`:
```json
"tailwindcss": "^4.0.0",
"@tailwindcss/vite": "^4.0.0"
```

Změň `"name"` na `"@kpl/frontend"`.

**Step 3: Nainstaluj závislosti**

```bash
npm install --workspace=packages/frontend
```

**Step 4: Přidej Tailwind do `packages/frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
})
```

**Step 5: Přidej Tailwind import do `packages/frontend/src/assets/main.css`**

Nahraď obsah souboru:
```css
@import "tailwindcss";
```

**Step 6: Spusť dev server a ověř**

```bash
npm run dev --workspace=packages/frontend
```

Očekávání: `VITE v6.x.x  ready in Xms` na `http://localhost:5173`.
Ověř v prohlížeči - výchozí Vue stránka se načte.

**Step 7: Commit**

```bash
git add packages/frontend/
git commit -m "feat: scaffold Vue 3 frontend with Tailwind v4, Pinia, Vue Router"
```

---

## Task 6: Ověření celého monorepa

**Step 1: Ověř npm workspaces**

```bash
npm ls --workspaces --depth=0
```

Očekávání: vypíše `@kpl/shared`, `@kpl/backend`, `@kpl/frontend`.

**Step 2: Zkontroluj symlink na shared v backend**

```bash
ls node_modules/@kpl/
```

Očekávání: `backend  frontend  shared` - symlinky na packages.

**Step 3: Finální commit**

```bash
git add .
git commit -m "chore: verify monorepo workspace links and finalize setup"
```

---

## Výsledek

Po dokončení plánu máš:
- Funkční npm workspaces monorepo
- `@kpl/shared` s TypeScript typy pro Socket.io eventy a herní stav
- `@kpl/backend` - Fastify server na portu 3000 s Socket.io
- `@kpl/frontend` - Vue 3 SPA s Tailwind v4, Pinia, Vue Router na portu 5173
- Připraveno pro implementaci REST API (CRUD karet) a herní logiky
