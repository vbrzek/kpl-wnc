# Lobby — Design

_Datum: 2026-02-24_

## Přehled

Hráč může: vytvořit vlastní stůl, připojit se k veřejnému stolu ze seznamu, nebo zadat 6-znakový token pro private stůl. Každý stůl má URL `/room/:token` — kdo ji zná, může se připojit přímo.

---

## URL struktura a routy

| Route | View | Popis |
|---|---|---|
| `/` | `HomeView` | Vytvoř / připoj se / seznam public stolů |
| `/room/:token` | `RoomView` | Lobby nebo hra |

**Token stolu:** 6 znaků, `[a-f0-9]`, slouží jako identifikátor i "heslo" pro private stoly.

**Player token:** UUID vydaný serverem při prvním sezení. Uložen v `localStorage` pod klíčem `playerToken_<roomCode>` — oddělený per-room.

---

## Datový model

```typescript
interface Player {
  id: string;           // player token (UUID, trvalý přes reconnecty)
  socketId: string | null;  // aktuální socket, null = offline
  nickname: string;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
  isAfk: boolean;       // označen po 30s bez socketu
}

interface GameRoom {
  code: string;         // 6-char hex token
  status: GameStatus;   // 'LOBBY' | 'SELECTION' | 'JUDGING' | 'RESULTS'
  hostId: string;       // player.id hosta
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  players: Player[];
  currentBlackCard: BlackCard | null;
  roundNumber: number;
}

interface PublicRoomSummary {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}
```

---

## Socket.io architektura

Server používá Socket.io rooms pro isolaci:

- `socket.join('lobby')` — hráč browsuje seznam public stolů
- `socket.join('room:<code>')` — hráč sedí u stolu

Klient je v `'lobby'` při HomeView, přejde do `'room:<code>'` po sezení ke stolu. Může být v obou zároveň při přechodu.

### Události klient → server

```typescript
'lobby:create'(settings: {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  nickname: string;
}, callback: (room: GameRoom, playerToken: string) => void)

'lobby:join'(data: {
  code: string;
  nickname: string;
  playerToken?: string;   // při reconnectu
}, callback: (room: GameRoom, playerToken: string, error?: string) => void)

'lobby:subscribePublic'()   // vstup do 'lobby' room
'lobby:unsubscribePublic'() // odchod z 'lobby' room
'lobby:leave'()
'lobby:updateSettings'(settings: Partial<Pick<GameRoom, 'name' | 'isPublic' | 'selectedSetIds' | 'maxPlayers'>>)
'lobby:kickPlayer'(playerId: string)
'lobby:startGame'()
```

### Události server → klient

```typescript
// Jen hráčům daného stolu (io.to('room:<code>').emit):
'lobby:stateUpdate'(room: GameRoom)
'lobby:kicked'()            // jen vyhozený hráč

// Jen browsujícím na HomeView (io.to('lobby').emit):
'lobby:publicRoomsUpdate'(rooms: PublicRoomSummary[])
```

---

## Frontend komponenty

```
HomeView /
├── PublicRoomsList         — živý seznam přes 'lobby' room
├── CreateTableModal        — název, public/private, sady karet, max hráčů, nick
└── JoinPrivateModal        — pole pro 6-char token → redirect na /room/:token

RoomView /room/:token
├── NicknameModal           — pokud hráč nemá player token pro tento stůl
├── LobbyPanel              — pokud room.status === 'LOBBY'
│   ├── PlayerList          — hráči, AFK badge, kick (jen host)
│   ├── RoomSettings        — nastavení (jen host edituje)
│   ├── InviteLink          — zkopíruj URL
│   └── StartGameButton     — aktivní pokud ≥3 hráči a jsi host
└── GamePanel               — placeholder pro herní fáze
```

### Pinia stores

- `lobbyStore` — public rooms list, akce create/join
- `roomStore` — aktuální stůl, player token, reconnect logika

---

## AFK logika

1. Hráč se odpojí (socket close)
2. Server spustí 30s timer
3. Po vypršení: `player.isAfk = true`, emit `lobby:stateUpdate` do místnosti
4. Při reconnectu s platným player tokenem: timer zrušen, `isAfk = false`
5. V herních fázích se na AFK hráče nečeká (přeskočí se jeho tah)

---

## Edge cases

| Situace | Chování |
|---|---|
| Token neexistuje | Redirect `/` + toast "Stůl nenalezen" |
| Stůl hraje + nový hráč bez player tokenu | Redirect `/` + toast "Hra již probíhá" |
| Reconnect do rozehrané hry | Povoleno, AFK se vymaže |
| Stůl plný | Chyba v callbacku, redirect `/` |
| Duplikátní přezdívka ve stolu | Chyba v callbacku |
| Host odejde | Role → první non-AFK hráč v `players[]` |
| Všichni AFK / odejdou | Stůl smazán po 5 minutách |
| `maxPlayers` snížen pod aktuální počet | Zamítnuto serverem |

---

## Minimální podmínky pro start hry

- Alespoň 3 hráči (non-AFK)
- Alespoň jedna sada karet vybrána
- Pouze host může spustit hru
