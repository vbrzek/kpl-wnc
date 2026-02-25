# Game Logic Design — MVP

**Datum:** 2026-02-25
**Rozsah:** MVP — kompletní game loop (více kol, bez win condition a časovačů)

---

## Rozhodnutí

| Otázka | Rozhodnutí |
|---|---|
| Rozsah | MVP — jeden kompletní game loop, více kol |
| Architektura game logiky | Separátní třída `GameEngine.ts` |
| Načítání karet | Při startu hry (vše najednou do paměti) |
| Frontend UI | 3 oddělené komponenty (SelectionPhase, JudgingPhase, ResultsPhase) |
| Rotace Card Czara | Round-robin (skip AFK hráčů) |

---

## Backend — GameEngine

**Nový soubor:** `packages/backend/src/game/GameEngine.ts`

### Stav (in-memory)

```typescript
class GameEngine {
  private blackDeck: BlackCard[]
  private whiteDeck: WhiteCard[]
  private playerHands: Map<string, WhiteCard[]>   // playerId → ruka (10 karet)
  private submissions: Map<string, WhiteCard[]>    // playerId → odevzdané karty
  private czarIndex: number                        // pro round-robin
  private currentBlackCard: BlackCard
  private roundNumber: number
}
```

### Metody

- `startRound()` → vylosuje černou kartu, doplní ruce hráčů na 10, nastaví czara (round-robin, skip AFK)
- `submitCards(playerId, cardIds)` → uloží výběr; pokud všichni aktivní non-czar hráči odevzdali → vrátí `true`
- `selectWinner(czarId, submissionId)` → přičte bod vítězi, vrátí `RoundResult`
- `getAnonymousSubmissions()` → zamíchané submise bez `playerId` (pro JUDGING broadcast)
- `getPlayerHand(playerId)` → vrátí karty konkrétního hráče (pro per-socket emit)

### Inicializace

`RoomManager.startGame()` načte z DB všechny `black_cards` a `white_cards` pro `selectedSetIds`, pak vytvoří `new GameEngine(players, blackCards, whiteCards)` a uloží do `Map<code, GameEngine>`.

---

## Backend — Socket handlery

**Nový soubor:** `packages/backend/src/socket/gameHandlers.ts`

### Flow kola

```
startGame (lobby handler)
  → načte karty z DB
  → new GameEngine(...)
  → engine.startRound()
  → per-socket emit game:roundStart { blackCard, hand, czarId, roundNumber }

game:playCards (od hráče)
  → validace (fáze, není czar, nehrál dvakrát, počet karet, karty z ruky)
  → engine.submitCards(playerId, cardIds)
  → pokud všichni odevzdali:
      → broadcast game:judging { submissions: AnonymousSubmission[] }

game:judgeSelect (od Card Czara)
  → validace (je czar, fáze JUDGING, submissionId existuje)
  → engine.selectWinner(czarId, submissionId)
  → broadcast game:roundEnd { winnerId, winnerNickname, winningCards, scores }
  → po 5s: engine.startRound() → per-socket emit game:roundStart (nové kolo)
```

### Validace a error handling

- Všechny chyby → `emit game:error { message }` jen odesílateli
- `game:playCards` — hráč v SELECTION, není czar, nehrál dvakrát, správný počet karet, karty z ruky
- `game:judgeSelect` — hráč je czar, fáze JUDGING, submissionId existuje

### Edge cases

- **Hráč offline v SELECTION** → označen AFK, nečeká se na něj (submise se přeskočí)
- **Czar offline v JUDGING** → host dostane možnost vybrat náhradního czara, nebo auto-skip kola
- **Reconnect** → hráč dostane aktuální stav fáze (hand, blackCard, submissions podle fáze)

---

## Sdílené typy (shared/index.ts) — přidat

```typescript
interface BlackCard {
  id: number
  text: string
  pick: number
}

interface WhiteCard {
  id: number
  text: string
}

interface GameRoundStart {
  blackCard: BlackCard
  hand: WhiteCard[]       // jen pro příjemce (per-socket)
  czarId: string
  roundNumber: number
}

interface AnonymousSubmission {
  submissionId: string    // UUID pro identifikaci při hlasování
  cards: WhiteCard[]
}

interface RoundResult {
  winnerId: string
  winnerNickname: string
  winningCards: WhiteCard[]
  scores: Record<string, number>  // playerId → score
}
```

**Nové Socket eventy:**

```typescript
// ServerToClientEvents — přidat:
'game:roundStart': (data: GameRoundStart) => void
'game:judging': (data: { submissions: AnonymousSubmission[] }) => void
'game:roundEnd': (data: RoundResult) => void

// ClientToServerEvents — přidat:
'game:playCards': (cardIds: number[]) => void
'game:judgeSelect': (submissionId: string) => void
```

---

## Frontend — komponenty a store

### roomStore.ts — přidat game state

```typescript
hand: WhiteCard[]
currentBlackCard: BlackCard | null
czarId: string | null
submissions: AnonymousSubmission[]
roundResult: RoundResult | null
selectedCards: WhiteCard[]
```

Socket listenery pro `game:roundStart`, `game:judging`, `game:roundEnd` přidány analogicky ke stávajícím lobby listenerům.

### Nové komponenty

**`SelectionPhase.vue`**
- Zobrazí černou kartu + hráčovu ruku
- Umožní vybrat N karet (podle `black_card.pick`)
- Tlačítko "Odeslat" → `game:playCards`
- Card Czar vidí: "Čekám na ostatní hráče"

**`JudgingPhase.vue`**
- Zobrazí anonymní submise jako skupiny karet
- Card Czar klikne na vítěznou skupinu → `game:judgeSelect`
- Ostatní hráči vidí: "Card Czar vybírá..."

**`ResultsPhase.vue`**
- Vítěz a vítězné karty
- Aktuální skóre všech hráčů
- Countdown do dalšího kola (5s)

### RoomView.vue — přepínání fází

```html
<LobbyPanel v-if="room.status === 'LOBBY'" />
<SelectionPhase v-else-if="room.status === 'SELECTION'" />
<JudgingPhase v-else-if="room.status === 'JUDGING'" />
<ResultsPhase v-else-if="room.status === 'RESULTS'" />
```

---

## Testy (Vitest)

**Nový soubor:** `packages/backend/src/game/GameEngine.test.ts`

Cílových ~15 unit testů:
- `startRound()` — správné rozdání karet, doplnění ruky, nastavení czara
- `submitCards()` — partial submit (vrátí false), complete submit (vrátí true)
- `submitCards()` — validace (dvakrát, špatné karty)
- `selectWinner()` — přičtení bodu, správný výsledek
- `getAnonymousSubmissions()` — zamíchání, bez playerId
- Round-robin czar rotace — správné pořadí, skip AFK

---

## Pořadí implementace

1. Sdílené typy (`shared/index.ts`)
2. `GameEngine.ts` + unit testy
3. `RoomManager` — integrace GameEngine, načtení karet z DB
4. `gameHandlers.ts` — Socket handlery
5. `roomStore.ts` — game state + listenery
6. `SelectionPhase.vue`
7. `JudgingPhase.vue`
8. `ResultsPhase.vue`
9. `RoomView.vue` — přepínání komponent
