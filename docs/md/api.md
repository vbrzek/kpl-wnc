# REST API & Environment

## REST API

| Metoda | Endpoint | Popis |
|---|---|---|
| GET | `/api/card-sets` | Seznam sad s počty karet (`blackCardCount`, `whiteCardCount`) |
| GET | `/api/cards/translations` | Překlad karet: `?lang=ru&blackIds=1,2&whiteIds=3,4` → `{black:{}, white:{}}` |
| GET | `/api/rooms/:code/preview` | Náhled místnosti: status, hráči (nickname+isAfk), kapacita |
| GET | `/api/me` | Profil přihlášeného uživatele (vyžaduje JWT cookie `kpl_token`) |
| PATCH | `/api/me` | Aktualizace profilu (nickname, locale, avatar) — Zod validace, nickname max 24 znaků |
| POST | `/auth/logout` | Smaže JWT cookie |
| GET | `/auth/google/callback` | OAuth callback pro Google |
| GET | `/auth/discord/callback` | OAuth callback pro Discord |
| GET | `/health` | Health check |

`CardSetSummary` typ je definován v `lobbyStore.ts` (frontend): `id, name, description, slug, isPublic, blackCardCount, whiteCardCount`.

## Environment proměnné

| Proměnná | Popis | Příklad |
|---|---|---|
| `DB_HOST/PORT/USER/PASSWORD/NAME` | Backend (Knex) | `localhost` / `3306` |
| `PORT` | Fastify port | `3000` |
| `FRONTEND_URL` | Backend CORS + Socket.io CORS | `http://10.5.10.150:5173` |
| `VITE_BACKEND_URL` | Frontend (socket + fetch) | `http://10.5.10.150:3000` |
| `SNAPSHOT_PATH` | Cesta k souboru snapshotu stavu her | `/tmp/kpl-snapshot.json` |
| `JWT_SECRET` | Secret pro podepisování JWT tokenů | (random string) |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | `...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | — |
| `DISCORD_CLIENT_ID` | Discord OAuth2 client ID | — |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 client secret | — |
| `PUBLIC_BACKEND_URL` | Veřejná URL pro OAuth callback URI | `https://kpl.example.com` |

> Vite načítá `.env` z kořene monorepa (`envDir: '../../'` v `vite.config.ts`). Pro LAN/mobilní dev nastav obě URL na IP adresy, ne localhost.
