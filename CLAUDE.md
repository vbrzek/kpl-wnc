# KPL — Cards Against Humanity Clone

Vlastní online verze hry Karty proti lidskosti. Monorepo (npm workspaces): `@kpl/shared` (typy) + `@kpl/backend` (Fastify + Socket.io + Knex, port 3000) + `@kpl/frontend` (Vue 3 + Vite + Tailwind v4 + Pinia, port 5173). Deploy: VPS + Apache + PM2.

## Detailni dokumentace

- [Architektura & struktura souborů](docs/md/architecture.md)
- [Databazove schema](docs/md/database.md)
- [REST API & env promenne](docs/md/api.md)
- [Herni logika, Player Profile, SIGTERM snapshot](docs/md/game-logic.md)
- [Roadmap](docs/md/roadmap.md)

## Prikazy

```bash
npm run dev:backend                               # Fastify dev (tsx watch, port 3000)
npm run dev:frontend                              # Vite dev (port 5173)
npm run build                                     # Build vsech balicku
npm run migrate --workspace=packages/backend      # DB migrace
npm run seed --workspace=packages/backend         # Seed dat (destruktivni!)
npm test --workspace=packages/backend             # Vitest — 119 testu
npx tsx packages/backend/scripts/generate-seeds.ts  # Regeneruje seed z DB
```

## Klic ove konvence

- **Herni stav:** `LOBBY` → `SELECTION` → `JUDGING` → `RESULTS` → `FINISHED` (in-memory, `RoomManager`)
- **Player token:** UUID v `localStorage[playerToken_<code>]`, slouzi pro reconnect bezztracy stavu
- **Profil:** `profileStore.ts` — init() zkusi `/api/me` (OAuth), pak fallback na `localStorage`
- **Karty:** M:N schema (junction tabulky), COALESCE fallback na cestinu pro preklady
- **Vite .env:** cte z korene monorepa (`envDir: '../../'`) — pro LAN/mobil pouzij IP misto localhost
- **Nickname validace:** max 24 znaku vsude (frontend `maxlength`, Socket.io, Zod v REST API)
- **OAuth:** Google + Discord, podmınena registrace podle env vars; JWT `kpl_token` httpOnly cookie

## Doporuceni pro praci s AI (uspor tokenu)

- **Cti soubory az kdyz je to potreba** — nectout zbytecne cele soubory pro kazdy dotaz
- **Odkazuj na konkretni radky** — pri hlaseni chyby uved soubor + cislo radku
- **Pouzij detailni docs** — architekturu nebo schema hledej v `docs/md/`, ne v CLAUDE.md
- **Jeden ukol najednou** — neukladej kontext prilis mnoha souboru najednou
- **Pis testy pred implementaci** — TDD snizuje pocet iteraci a debug cyklu
- **Spust testy pred odeslanim** — `npm test --workspace=packages/backend` overi zmeny
- **Pouzij worktree pro vetsi featury** — izoluje zmeny od `main`, bezpecnejsi pro experimenty
- **Klicove soubory pro ktere koncepty:**
  - Herni logika → `packages/backend/src/game/`
  - Socket eventy → `packages/backend/src/socket/` + `packages/shared/src/index.ts`
  - Frontend stav → `packages/frontend/src/stores/`
  - DB dotazy → `packages/backend/src/routes/` + `packages/backend/src/db/`
