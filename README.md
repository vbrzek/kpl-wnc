# 🃏 Karty Proti Lidskosti — Online

> Vlastní online verze hry Karty proti lidskosti — multiplayer v reálném čase pro partu přátel.

[![Verze](https://img.shields.io/badge/verze-1.0.0-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-22+-green)]()
[![Vue](https://img.shields.io/badge/Vue-3-42b883)]()
[![Licence](https://img.shields.io/badge/licence-MIT-yellow)]()
[![Demo](https://img.shields.io/badge/live%20demo-hrát%20online-orange)](https://kpl.wnc.cz/)

Webová hra inspirovaná Cards Against Humanity — hráči doplňují černé karty těmi nejnevkusnějšími bílými kartami.
Card Czar vybírá vítěze každého kola.

**Klíčové funkce:**
- 🎮 Multiplayer v reálném čase (Socket.io)
- 🌐 5 jazyků — cs / en / ru / uk / es
- 👤 Profil hráče s DiceBear avatarem
- 🃏 Více sad karet (česká sada, Liberecká banda 2026)
- 🔗 Veřejné i soukromé stoly, sdílitelný odkaz
- 📱 Responzivní design + PWA (offline fallback, instalovatelné)

---

## 🏗️ Architektura

Monorepo se třemi balíčky (npm workspaces):

| Balíček | Tech | Port |
|---|---|---|
| `@kpl/shared` | TypeScript typy | — |
| `@kpl/backend` | Fastify · Socket.io · Knex · MySQL2 | 3000 |
| `@kpl/frontend` | Vue 3 · Vite · Tailwind v4 · Pinia · Vue Router | 5173 |

**Infrastruktura:** Linux VPS + Apache (reverse proxy + WebSocket tunel) + PM2

```
kpl-wnc/
├── packages/
│   ├── shared/       # Sdílené TypeScript typy (GameStatus, Player, Socket events…)
│   ├── backend/      # API server + herní logika (RoomManager, Socket handlery)
│   └── frontend/     # Vue SPA (views, stores, composables, i18n)
├── .env.example
└── package.json
```

---

## 🚀 Lokální vývoj

### Požadavky

- **Node.js** 22+
- **MySQL** 8+
- **npm** 10+

### Instalace

```bash
git clone https://github.com/vbrzek/kpl-wnc.git
cd kpl-wnc
npm install
```

### Konfigurace prostředí

```bash
cp .env.example .env
```

Vyplň hodnoty v `.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=kpl
DB_PASSWORD=tajne_heslo
DB_NAME=kpl_wnc
PORT=3000

FRONTEND_URL=http://localhost:5173
VITE_BACKEND_URL=http://localhost:3000

# OAuth (Google)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# OAuth (Discord)
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...

# JWT secret (min. 32 znaků)
JWT_SECRET=Flcgkda3A,sS.cmAsH30SFkslda0mskw

# Veřejná URL backendu (pro OAuth callback URI)
PUBLIC_BACKEND_URL=http://localhost:3000

# Cesta pro snapshot stavu her při restartu (výchozí: /tmp/kpl-snapshot.json)
# SNAPSHOT_PATH=/tmp/kpl-snapshot.json
```

> **Pro LAN / mobilní testování:** Nastav obě URL na IP adresu místo `localhost`.

### Migrace a seed dat

```bash
# Spuštění databázových migrací
npm run migrate --workspace=packages/backend

# Naplnění testovacích dat (česká sada karet) — DESTRUKTIVNÍ, jen pro dev!
npm run seed --workspace=packages/backend
```

### Spuštění

```bash
# Backend (port 3000)
npm run dev:backend

# Frontend (port 5173) — v novém terminálu
npm run dev:frontend
```

Aplikace bude dostupná na `http://localhost:5173`.

### Testy

```bash
npm test --workspace=packages/backend   # 71 unit testů (Vitest)
```

---

## ☁️ Nasazení na VPS

### Sestavení projektu

```bash
npm run build
```

### PM2 — správce procesů

Použij připravený `ecosystem.config.js` v kořeni repozitáře:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Konfigurace zahrnuje `kill_timeout: 5000` — PM2 dá procesu 5 sekund na uložení snapshotu před vynuceným ukončením.

### Apache — reverse proxy

Příklad konfigurace (`/etc/apache2/sites-available/kpl.conf`):

```apache
<VirtualHost *:80>
    ServerName kpl.example.cz

    # Frontend — statické soubory
    DocumentRoot /var/www/kpl-wnc/packages/frontend/dist

    # Auth proxy
    ProxyPass /auth http://localhost:3000/auth
    ProxyPassReverse /auth http://localhost:3000/auth

    # API proxy
    ProxyPass /api http://localhost:3000/api
    ProxyPassReverse /api http://localhost:3000/api

    # WebSocket tunel pro Socket.io
    ProxyPass /socket.io/ ws://localhost:3000/socket.io/
    ProxyPassReverse /socket.io/ http://localhost:3000/socket.io/
</VirtualHost>
```

```bash
a2enmod proxy proxy_http proxy_wstunnel
a2ensite kpl.conf
systemctl reload apache2
```

---

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
- [x] Perzistence stavu her — rozehrané hry přežijí restart serveru (SIGTERM snapshot + client reload)
- [x] Možnost aktivace rozšířených pravidel
- [x] Volba cíle hry (počet bodů, počet kol, čas)
- [x] Profily hráčů — OAuth (Google, Discord) + JWT cookie + propojení účtů
- [ ] CRUD pro správu sad a karet (admin) a sdílení sad karet s ostatními hráči
- [ ] Friendship managment
- [ ] Dlouhodobé statistiky a achievmenty


---

## 📄 Licence

MIT © 2026
