# OAuth Design — Google & Discord

**Datum:** 2026-03-09

## Cíl

Volitelné přihlášení přes Google nebo Discord. Host režim (localStorage) zůstává jako primární UX — OAuth přidá persistentní server-side profil jako základ pro budoucí featury (vlastní sady karet, friendlist, statistiky, achievements).

## Architektura

### Koexistence OAuth session a player tokenu

```
Guest:       localStorage[playerToken_<code>]  →  RoomManager (beze změny)
OAuth user:  httpOnly cookie (JWT, userId)      →  /api/me, budoucí API
             localStorage[playerToken_<code>]  →  RoomManager (beze změny)
```

Player token zůstane univerzálním herním identifikátorem pro oba typy hráčů. RoomManager se nemění. V DB propojíme player token s userId přes `user_player_tokens` — základ pro statistiky.

### Nové komponenty

| Vrstva | Co přibyde |
|---|---|
| DB | `users`, `user_player_tokens` |
| Backend | `/auth/google`, `/auth/discord` + callbacky, `GET /api/me`, `PATCH /api/me`, `POST /auth/logout` |
| Backend deps | `@fastify/oauth2`, `@fastify/jwt`, `@fastify/cookie` |
| Frontend | Rozšíření `PlayerProfileModal`, úprava `profileStore` |

## Databázové schéma

```sql
CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  provider       ENUM('google', 'discord') NOT NULL,
  provider_id    VARCHAR(255) NOT NULL,
  nickname       VARCHAR(50),           -- null = nový user, čeká na setup
  locale         VARCHAR(5) DEFAULT 'cs',
  avatar_type    ENUM('oauth', 'dicebear') DEFAULT 'oauth',
  avatar_url     TEXT,                  -- URL z OAuth providera
  dicebear_style VARCHAR(50),           -- 'bottts', 'avataaars', atd.
  dicebear_seed  VARCHAR(100),          -- vlastní seed (null = generovat z nicku)
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (provider, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_player_tokens (
  user_id      INT NOT NULL,
  player_token VARCHAR(36) NOT NULL,   -- UUID z localStorage
  room_code    VARCHAR(6) NOT NULL,
  last_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (player_token, room_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Backend — OAuth flow

### Routes

```
GET  /auth/google            → redirect na Google OAuth
GET  /auth/google/callback   → zpracování kódu → JWT cookie → redirect na frontend
GET  /auth/discord           → redirect na Discord OAuth
GET  /auth/discord/callback  → zpracování kódu → JWT cookie → redirect na frontend
GET  /api/me                 → profil přihlášeného uživatele (ověření JWT cookie)
PATCH /api/me                → uloží nickname, locale, avatar do DB
POST /auth/logout            → smaže JWT cookie
```

### Callback logika (stejná pro Google i Discord)

1. Vymění `code` za access token u providera
2. Fetch user info z providera (id, avatar URL)
3. Upsert do `users`: pokud `provider_id` existuje → update `avatar_url`, jinak INSERT (nickname = null)
4. Podepíše JWT `{ userId, provider }` s expirací 30 dní
5. `Set-Cookie: jwt=...; HttpOnly; Secure; SameSite=Lax; Max-Age=30d`
6. Redirect → `FRONTEND_URL/?auth=new` (nový user) nebo `/?auth=success` (existující)

### Nové env proměnné

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
JWT_SECRET
```

## Frontend — UX flow

### Setup modal při prvním spuštění

Rozšíření stávajícího `PlayerProfileModal` (setup mode):

```
┌─────────────────────────────────────┐
│  Vítej v KPL!                       │
│                                     │
│  [G] Přihlásit přes Google          │
│  [D] Přihlásit přes Discord         │
│                                     │
│  ─────────── nebo ───────────       │
│                                     │
│  Přezdívka: [____________]          │
│  Jazyk:     [cs ▼]                  │
│                                     │
│  [Hrát jako host]                   │
└─────────────────────────────────────┘
```

### Profil modal pro hosta

Přidá sekci "Propojit účet" na spodku stávajícího modalu:

```
┌─────────────────────────────────────┐
│  Profil                             │
│  Přezdívka: [____________]          │
│  Jazyk:     [cs ▼]                  │
│  Avatar: 🤖 DiceBear (z nicku)      │
│                                     │
│  ── Propojit účet ──                │
│  [G] Google  [D] Discord            │
└─────────────────────────────────────┘
```

### Profil modal pro OAuth uživatele

Rozšíření sekce avatara o volbu stylu:

```
Avatar:  ● OAuth foto  ○ DiceBear
         Styl: [Bottts ▼]  Seed: [____]
```

Dostupné DiceBear styly: Avataaars, Big Smile, Bottts, Croodles, Dylan, Big Ears, Adventurer.

### Změny v `profileStore`

- Přidá `isAuthenticated: boolean`, `oauthUser: OAuthUser | null`
- `init()` volá `GET /api/me` — pokud vrátí 200, hydratuje OAuth profil do store
- `save()` pokud `isAuthenticated` → `PATCH /api/me` + localStorage, jinak jen localStorage

### Po OAuth redirectu

- `App.vue` detekuje `?auth=success` nebo `?auth=new` → zavolá `GET /api/me` → hydratuje store
- `?auth=new` → zobrazí profile setup modal (výběr nicku a avatara před vstupem do hry)

### Propojení player tokenu s userId

Při vstupu přihlášeného hráče do místnosti pošle frontend JWT cookie + player token v socket handshake. Backend uloží dvojici `(userId, playerToken, roomCode)` do `user_player_tokens`.

## Co tato iterace neřeší

- Admin CRUD pro sady karet
- Friendlist
- Statistiky her
- Achievements
- Merge host účtu s OAuth (host token zůstane nepropojený, dokud hráč nevsoupí do místnosti jako přihlášený)
