# Herní logika & Player Profile

## Stavový stroj

Server drží stav her v paměti (`RoomManager`) — bez latence DB.

| Stav | Popis |
|---|---|
| `LOBBY` | Čekání na hráče, výběr sad karet |
| `SELECTION` | Hráči vybírají bílé karty z ruky |
| `JUDGING` | Card Czar anonymně vybírá vítěze kola |
| `RESULTS` | Zobrazení vítěze, přičtení bodů, přechod na nové kolo |
| `FINISHED` | Konec hry — host ukončil nebo dosažen `targetScore` |

`startGame` validuje: ≥3 aktivní hráči AND `selectedSetIds.length > 0`.

**Klíčové třídy:**
- `RoomManager.ts` — in-memory správa místností (create/join/leave/kick/AFK/reconnect)
- `GameEngine.ts` — logika kola (rozdávání karet, submissions, výsledky)
- `GarbageCollector.ts` — mazání idle místností (5min interval, 2h/15min prahy) + mrtvých instancí (offline > 10 min v LOBBY, `removeStalePlayers`)
- `roundUtils.ts` — sdílené utility (startNextRound, finishGame…)

**Identita hráče a reconnect:**
- Klient posílá při `lobby:join`/`lobby:create` trvalé `guestId` (`localStorage['kpl_guestId']`, nikdy se nemaže) + volitelný per-room `playerToken`
- Server reconnectuje nejdřív přes `playerToken`, pak přes guest index `(kód místnosti, guestId) → token` — ztráta per-room tokenu tak nevytvoří duplicitní instanci hráče ani nezablokuje přezdívku
- Guest index se čistí při leave/kick/finishGame/deleteRoom a přežívá SIGTERM snapshot (`guestKeyToToken`)
- `lobby:leave` přijímá volitelný `{ playerToken }` fallback pro případ, že po auto-reconnectu socketu ještě chybí mapování `socket.id → token`
- Změna přezdívky v profilu se propisuje eventem `profile:updateNickname` (guestId) do všech místností, kde hráč sedí — atomicky s kontrolou kolizí (`syncProfileByGuestId`); offline změny dorovná reconnect (`joinRoom` při reconnectu aplikuje novou přezdívku, kolidující tiše ponechá starou)

**Implementační poznámky:**
- `CreateTableModal` podporuje výběr právě 1 sady karet (backend podporuje `selectedSetIds: number[]`)
- `socketId` je součástí sdíleného `Player` interfacu — `toPublicRoom()` ho nulluje před broadcastem, ale správné řešení je přesunout ho do server-only mapy (TODO: refactor)
- `useSound.ts` přehrává efekty při herních událostech

## Player Profile

Globální profil hráče uložený v `localStorage['playerProfile']` (JSON: `{nickname, locale}`). Volitelně propojený s OAuth účtem (Google/Discord).

**`profileStore.ts`** (Pinia): `nickname`, `locale`, computed `avatarUrl` (DiceBear bottts CDN), `hasProfile`, `isAuthenticated`, `oauthUser`, `init()`, `save()`, `saveAvatar()`, `logout()`.

**Inicializace:** `App.vue` volá `profileStore.init()` — nejprve `GET /api/me` (OAuth session), pak fallback na `localStorage`. Pokud `!hasProfile`, zobrazí `PlayerProfileModal` (setup mode) a blokuje `RouterView`.

**OAuth flow:** `PlayerProfileModal` → tlačítka Google/Discord → `VITE_BACKEND_URL/auth/{provider}` → callback → redirect na `?auth=new|success|error` → `App.vue` zpracuje query param.

**Validace:** Nickname max 24 znaků — frontend (`maxlength="24"`), Socket.io validace, REST API (Zod schema).

## Perzistence stavu her (SIGTERM snapshot)

Na `SIGTERM` (PM2 deploy) se stav `RoomManager` + `GameEngine` serializuje do JSON (`SNAPSHOT_PATH`). Při dalším startu server soubor načte, smaže a obnoví stav před `app.listen()`.

- Timery kol se neobnovují (callbacky jsou no-op, `roundDeadline` klientům postačí)
- `server:hello` Socket event s `STARTUP_ID = Date.now()` → klienti porovnají s `localStorage['kpl-startup-id']` → reload pokud se liší
- `ecosystem.config.js` má `kill_timeout: 5000`
