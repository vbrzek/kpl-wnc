# KPL — Cards Against Humanity Clone

Vlastní online verze hry Karty proti lidskosti. Monorepo (npm workspaces): `@kpl/shared` (typy) + `@kpl/backend` (Fastify + Socket.io + Knex, port 3000) + `@kpl/frontend` (Vue 3 + Vite + Tailwind v4 + Pinia, port 5173). Deploy: VPS + Apache + PM2.

## Detailní dokumentace

- [Architektura & struktura souborů](docs/md/architecture.md)
- [Databázové schéma](docs/md/database.md)
- [REST API & env proměnné](docs/md/api.md)
- [Herní logika, Player Profile, SIGTERM snapshot](docs/md/game-logic.md)
- [Roadmap](docs/md/roadmap.md)

## Příkazy

```bash
npm run dev:backend                               # Fastify dev (tsx watch, port 3000)
npm run dev:frontend                              # Vite dev (port 5173)
npm run build                                     # Build všech balíčků
npm run migrate --workspace=packages/backend      # DB migrace
npm run seed --workspace=packages/backend         # Seed dat (destruktivní!)
npm test --workspace=packages/backend             # Vitest — 119 testů
npx tsx packages/backend/scripts/generate-seeds.ts  # Regeneruje seed z DB
```

## Klíčové konvence

- **Herní stav:** `LOBBY` → `SELECTION` → `JUDGING` → `RESULTS` → `FINISHED` (in-memory, `RoomManager`)
- **Player token:** UUID v `localStorage[playerToken_<code>]`, slouží pro reconnect bez ztráty stavu
- **Profil:** `profileStore.ts` — init() zkusí `/api/me` (OAuth), pak fallback na `localStorage`
- **Karty:** M:N schéma (junction tabulky), COALESCE fallback na češtinu pro překlady
- **Vite .env:** čte z kořene monorepa (`envDir: '../../'`) — pro LAN/mobil použij IP místo localhost
- **Nickname validace:** max 24 znaků všude (frontend `maxlength`, Socket.io, Zod v REST API)
- **OAuth:** Google + Discord, podmíněná registrace podle env vars; JWT `kpl_token` httpOnly cookie

## Doporučení pro práci s AI (úspor tokenů)

- **Čti soubory až když je to potřeba** — nečíst zbytečně celé soubory pro každý dotaz
- **Odkazuj na konkrétní řádky** — při hlášení chyby uveď soubor + číslo řádku
- **Použij detailní docs** — architekturu nebo schéma hledej v `docs/md/`, ne v CLAUDE.md
- **Jeden úkol najednou** — neukládej kontext příliš mnoha souborů najednou
- **Piš testy před implementací** — TDD snižuje počet iterací a debug cyklů
- **Spusť testy před odesláním** — `npm test --workspace=packages/backend` ověří změny
- **Použij worktree pro větší featury** — izoluje změny od `main`, bezpečnější pro experimenty
- **Klíčové soubory pro které koncepty:**
  - Herní logika → `packages/backend/src/game/`
  - Socket eventy → `packages/backend/src/socket/` + `packages/shared/src/index.ts`
  - Frontend stav → `packages/frontend/src/stores/`
  - DB dotazy → `packages/backend/src/routes/` + `packages/backend/src/db/`
