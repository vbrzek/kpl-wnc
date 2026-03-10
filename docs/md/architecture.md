# Architektura projektu

## Balíčky

| Balíček | Tech | Port |
|---|---|---|
| `@kpl/shared` | TypeScript typy (GameStatus, Player, GameRoom, CardSubmission, Socket events) | — |
| `@kpl/backend` | Node.js + Fastify + Socket.io + Knex + MySQL2 | 3000 |
| `@kpl/frontend` | Vue 3 (Composition API) + Vite + Tailwind v4 + Pinia + Vue Router | 5173 |

**Infrastruktura:** Linux VPS + Apache (reverse proxy + WebSocket tunel na `/socket.io/`) + PM2.
**OAuth:** `@fastify/oauth2` (Google + Discord, podmíněná registrace podle env vars) + `@fastify/cookie` + JWT (`kpl_token` httpOnly cookie). CORS a Socket.io mají `credentials: true`.
**Env:** Vite čte `.env` z kořene monorepa (`envDir: '../../'` v `vite.config.ts`). Pro LAN/mobilní dev nastav obě URL na IP adresy (ne localhost).

## Struktura projektu

```
kpl-wnc/
├── packages/
│   ├── shared/src/index.ts         # Sdílené typy
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
│   │   ├── auth/
│   │   │   └── jwt.ts              # signToken, verifyToken, extractUserIdFromCookieHeader
│   │   ├── routes/
│   │   │   ├── auth.ts             # OAuth routes: GET/PATCH /api/me, POST /auth/logout, Google/Discord callbacks
│   │   │   ├── cardSets.ts         # GET /api/card-sets
│   │   │   ├── cardTranslations.ts # GET /api/cards/translations (COALESCE fallback na cs)
│   │   │   └── rooms.ts            # GET /api/rooms/:code/preview
│   │   └── db/
│   │       ├── db.ts               # Knex singleton
│   │       ├── knexfile.ts         # Knex config (migrations + seeds)
│   │       ├── migrations/
│   │       └── seeds/
│   │           └── 01_all_cards.ts # Auto-generated seed (all cards + sets)
│   └── frontend/src/
│       ├── router/index.ts         # Vue Router: / a /room/:token
│       ├── layouts/GameLayout.vue  # Wrapper layoutu hry (AppHeader + slot)
│       ├── views/
│       │   ├── HomeView.vue        # Seznam stolů, vytvoř/připoj se
│       │   └── RoomView.vue        # Lobby nebo hra (podle room.status)
│       ├── components/
│       │   ├── AppHeader.vue       # Horní lišta + PlayerAvatar (edit profilu)
│       │   ├── LobbyPanel.vue, PlayerList.vue, PlayerAvatar.vue, Avatar.vue
│       │   ├── PlayerProfileModal.vue  # Setup/edit profilu — přezdívka, jazyk, DiceBear
│       │   ├── CreateTableModal.vue, JoinPrivateModal.vue, RoomPreviewModal.vue
│       │   ├── InviteLink.vue, PublicRoomsList.vue
│       │   ├── SelectionPhase.vue, JudgingPhase.vue, ResultsPhase.vue, FinishedPhase.vue
│       │   ├── game/atoms/         # BlackCard, CardHand, Scoreboard, Podium, SubmissionGrid…
│       │   └── game/layouts/       # PlayerSelectingLayout, CzarJudgingLayout, …
│       ├── composables/
│       │   ├── useCardTranslations.ts # Fetch + module-level cache; reaktivní cacheVersion
│       │   └── useSound.ts
│       ├── stores/
│       │   ├── lobbyStore.ts       # Veřejné stoly, create/join, fetchCardSets, localStorage token
│       │   ├── roomStore.ts        # Stav aktuálního stolu, isHost, kick, startGame
│       │   └── profileStore.ts     # nickname, locale, avatarUrl (DiceBear), OAuth
│       ├── i18n/locales/           # cs.json, en.json, ru.json, uk.json, es.json
│       └── socket/index.ts         # Socket.io client (URL z VITE_BACKEND_URL, withCredentials: true)
├── docs/plans/                     # Implementační plány
└── docs/md/                        # Detailní dokumentace
```

## Socket.io architektura (Lobby)

Server používá Socket.io **rooms** pro izolaci:
- `socket.join('lobby')` — klient browsuje seznam veřejných stolů (HomeView)
- `socket.join('room:<code>')` — klient sedí u stolu

**Player token** (UUID) vydán serverem při prvním sezení, uložen v `localStorage[playerToken_<code>]`. Slouží pro automatický reconnect.

**AFK:** po 30s od odpojení `isAfk = true`. Hra na něj nečeká.

**Host:** zakládá stůl, může vyhazovat hráče. Při odchodu přechází role na dalšího non-AFK hráče.
