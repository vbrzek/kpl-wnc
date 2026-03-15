# Friends Feature — Design

**Date:** 2026-03-14
**Status:** Approved, ready for implementation

---

## Overview

Správa přátel pro OAuth uživatele. Funkce: seznam přátel, žádosti o přátelství (oboustranné potvrzení), sdílitelný odkaz/QR kód pro přidání, pozvání přítele do hry (real-time notifikace + zkopírování odkazu).

---

## 1. Databáze

Nová migrace: tabulka `friendships`.

```sql
CREATE TABLE friendships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT UNSIGNED NOT NULL,  -- kdo poslal žádost
  addressee_id INT UNSIGNED NOT NULL,  -- komu byla poslána
  status ENUM('pending', 'accepted') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (requester_id, addressee_id),
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 2. Backend API

Všechny endpointy kromě `/api/users/:id/public` vyžadují auth (`verifyJwt`).

| Method | Endpoint | Popis |
|--------|----------|-------|
| GET | `/api/friends` | Seznam přijatých přátel (status = accepted) |
| GET | `/api/friends/requests` | Příchozí žádosti (status = pending, addressee = já) |
| POST | `/api/friends/request` | Pošli žádost `{ addresseeId: number }` |
| POST | `/api/friends/accept/:id` | Přijmi žádost (id = friendship.id) |
| DELETE | `/api/friends/:id` | Odmítni žádost nebo odeber přítele |
| GET | `/api/users/:id/public` | Veřejný profil uživatele (nickname, avatarUrl) — bez auth |

Nový soubor: `packages/backend/src/routes/friends.ts`

---

## 3. Socket.io — Real-time notifikace

### User rooms
Při `connection` se přečte JWT cookie (stejně jako `linkPlayerToken`). Pokud je uživatel přihlášen, socket se připojí do room `user:<userId>`. To umožňuje cílit notifikace na konkrétního uživatele.

```ts
// packages/backend/src/socket/friendHandlers.ts
socket.join(`user:${userId}`)
```

### Eventy server → klient

| Event | Payload | Kdy |
|-------|---------|-----|
| `friend:request_received` | `{ friendshipId, fromNick, fromAvatarUrl }` | Někdo poslal žádost |
| `friend:request_accepted` | `{ friendshipId, byNick, byAvatarUrl }` | Tvá žádost přijata |
| `friend:invite_received` | `{ roomCode, roomName, fromNick }` | Přítel tě zve do hry |

### Eventy klient → server

| Event | Payload | Akce |
|-------|---------|------|
| `friend:invite` | `{ friendUserId, roomCode }` | Server doručí `friend:invite_received` do `user:<friendUserId>` |

Pokud přítel není online (socket room prázdná), notifikace se tiše zahodí — persistence není potřeba.

Nový soubor: `packages/backend/src/socket/friendHandlers.ts`

---

## 4. Frontend

### Nové soubory

| Soubor | Popis |
|--------|-------|
| `src/views/FriendsView.vue` | Hlavní stránka `/friends` (přepis placeholder) |
| `src/views/AddFriendView.vue` | Veřejná stránka `/add-friend/:userId` |
| `src/stores/friendsStore.ts` | Pinia store pro přátele |
| `src/components/FriendCard.vue` | Karta přítele (avatar, nick, akce) |
| `src/components/FriendRequestCard.vue` | Karta příchozí žádosti |

### Router

```ts
{
  path: '/add-friend/:userId',
  component: () => import('../views/AddFriendView.vue'),
  // veřejná — bez requiresAuth
},
```

### FriendsView.vue — layout

3 sekce:

1. **Příchozí žádosti** — zobrazena jen pokud `pendingRequests.length > 0`; grid karet s "Přijmout" + "Odmítnout"
2. **Moji přátelé** — grid `FriendCard`; každá karta má "Pozvat do hry" (viditelné jen pokud `roomStore.room !== null && room.status === 'LOBBY'`) + "Odebrat přítele"
3. **Přidat přítele** — tlačítko "Kopírovat odkaz" + zobrazení QR kódu (knihovna `qrcode` nebo inline SVG)

### AddFriendView.vue — layout

- Zobrazí avatar + nick uživatele z `/api/users/:id/public`
- Pokud `profileStore.isAuthenticated` → tlačítko "Poslat žádost o přátelství"
- Pokud není přihlášen → výzva "Přihlas se přes Google/Discord pro přidání přítele"
- Pokud už jsou přátelé nebo žádost čeká → zobrazí status

### friendsStore.ts

```ts
interface Friend {
  friendshipId: number
  userId: number
  nickname: string
  avatarUrl: string
}

interface FriendRequest {
  friendshipId: number
  fromUserId: number
  fromNick: string
  fromAvatarUrl: string
}

// Akce
fetchFriends()
fetchRequests()
sendRequest(addresseeId: number)
acceptRequest(friendshipId: number)
rejectOrRemove(friendshipId: number)
inviteToGame(friendUserId: number, roomCode: string)
```

### Globální notifikace (App.vue)

V `App.vue` (nebo `GameLayout.vue`) poslouchat socket eventy:
- `friend:request_received` → toast "X tě chce přidat mezi přátele" [Přijmout] [Odmítnout]
- `friend:request_accepted` → toast "X přijal tvou žádost o přátelství"
- `friend:invite_received` → toast "X tě zve ke stolu: {roomName}" [Připojit se]

Existující toast systém nebo jednoduchý vlastní (fixed overlay, auto-dismiss po 8s).

---

## 5. i18n

Nové klíče do všech lokalizací (`cs`, `en`, `ru`, `uk`, `es`):

```json
"friends": {
  "title": "Přátelé",
  "noFriends": "Zatím žádní přátelé.",
  "pendingRequests": "Žádosti o přátelství",
  "addFriend": "Přidat přítele",
  "copyProfileLink": "Kopírovat odkaz na profil",
  "showQR": "Zobrazit QR kód",
  "invite": "Pozvat do hry",
  "remove": "Odebrat přítele",
  "accept": "Přijmout",
  "reject": "Odmítnout",
  "sendRequest": "Poslat žádost o přátelství",
  "requestSent": "Žádost odeslána",
  "alreadyFriends": "Už jste přátelé",
  "requestPending": "Žádost čeká na přijetí"
}
```

---

## 6. Pořadí implementace

1. DB migrace (`friendships` tabulka)
2. Backend routes (`/api/friends/*`, `/api/users/:id/public`)
3. Socket.io handler (`friendHandlers.ts`) + user rooms
4. `friendsStore.ts`
5. `FriendsView.vue` + `FriendCard.vue` + `FriendRequestCard.vue`
6. `AddFriendView.vue` + router záznam
7. Globální socket notifikace v `App.vue`
8. i18n klíče
9. Testy (Vitest pro backend routes + store)
