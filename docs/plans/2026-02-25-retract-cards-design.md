# Design: Oprava výběru karet během čekání (Retract Cards)

## Problém

Po odeslání karet v SELECTION fázi hráč čeká na ostatní, ale nemůže svůj výběr opravit.

## Řešení

Hráč dostane tlačítko **"Změnit výběr"** zobrazené pod stavovou zprávou "Karty odeslány". Po kliknutí:
1. Server vrátí karty zpět do ruky hráče
2. Hráč vybere znovu a odešle

## Změny

### Sdílené typy (`shared/src/index.ts`)

```typescript
// ClientToServerEvents
'game:retractCards': () => void

// ServerToClientEvents
'game:handUpdate': (hand: WhiteCard[]) => void
```

### Backend — `GameEngine.ts`

**Nová metoda `retractCards(playerId: string)`:**
- Ověří `player.hasPlayed === true`
- Vrátí karty z `submissions[playerId].cards` zpět do `playerHands[playerId]`
- Smaže `submissions.delete(playerId)`
- Nastaví `player.hasPlayed = false`
- Vrátí `{ ok: true }` nebo `{ ok: false, error: string }`

**Nová metoda `getHand(playerId: string): WhiteCard[]`:**
- Vrátí kopii `playerHands.get(playerId) ?? []`

### Backend — `gameHandlers.ts`

```typescript
socket.on('game:retractCards', () => {
  // 1. Ověř SELECTION fázi (race condition guard)
  if (room.status !== 'SELECTION') return
  // 2. engine.retractCards(playerId)
  // 3. io.to(roomCode).emit('lobby:stateUpdate', room)  // hasPlayed = false pro ostatní
  // 4. socket.emit('game:handUpdate', engine.getHand(playerId))  // aktualizuj ruku
})
```

### Frontend — `roomStore.ts`

```typescript
// Nová akce
function retractCards() {
  socket.emit('game:retractCards')
  selectedCards.value = []
}

// Nový listener
socket.on('game:handUpdate', (newHand) => {
  hand.value = newHand
})
```

### Frontend — `SelectionPhase.vue`

Stav "already submitted" (`me.hasPlayed === true`):
```
[ Karty odeslány — čekáme na ostatní ]

         [Změnit výběr]
```

- Tlačítko voláním `retractCards()` — dočasně se zakáže po kliknutí (zabránění double-click)
- Po příchodu `lobby:stateUpdate` s `hasPlayed = false` se UI přepne zpět na výběr karet

## Hraniční případy

| Případ | Chování |
|---|---|
| Hráč klikne "Změnit výběr" po přechodu do JUDGING | Server vrátí chybu (status ≠ SELECTION), tlačítko zmizí díky stateUpdate |
| Hráč klikne dvakrát rychle | Tlačítko se zakáže po prvním kliknutí |
| Hráč se reconnectuje po retrakci | `hasPlayed = false`, ruka obnovena normálně |
