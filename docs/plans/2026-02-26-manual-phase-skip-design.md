# Design: Manuální přechod fáze po vypršení timeru

## Kontext

Aktuálně po vypršení časového limitu server automaticky přechází do další fáze nebo skipuje kolo. Tato automatika způsobuje nežádoucí přerušení hry při přirozených prostojích (odchod od počítače, pauza atd.).

## Navrhované řešení

Timer stále běží a slouží jako vizuální odpočet. Po vypršení (secondsLeft === 0) se **nezahájí automatický přechod**, ale zobrazí se tlačítko oprávněnému hráči. Hra čeká donekonečna, dokud hráč tlačítko neklikne.

## Backend změny

### roundUtils.ts
Callbacky timerů se vyprázdní — nebudou provádět žádné přechody:
```typescript
// SELECTION timer callback — dříve přecházel do JUDGING nebo skipoval
roomManager.setRoundTimer(roomCode, () => {
  // timer expired — frontend zobrazí tlačítko, čeká se na game:czarForceAdvance
}, SELECTION_TIMEOUT_MS);

// JUDGING timer callback — dříve skipoval kolo
roomManager.setJudgingTimer(roomCode, () => {
  // timer expired — frontend zobrazí tlačítko, čeká se na game:skipCzarJudging
}, JUDGING_TIMEOUT_MS);
```

### gameHandlers.ts — 2 nové handlery

**`game:czarForceAdvance`**
- Oprávnění: pouze Card Czar
- Fáze: `SELECTION`
- Validace: `Date.now() >= room.roundDeadline`
- Efekt: označí neodvzdané non-AFK hráče jako AFK, pokud existují submise → přejde do JUDGING; pokud ne → emituje `game:roundSkipped` a po 3s spustí nové kolo

**`game:skipCzarJudging`**
- Oprávnění: jakýkoliv non-Czar hráč
- Fáze: `JUDGING`
- Validace: `Date.now() >= room.roundDeadline`
- Efekt: označí Card Czara jako AFK, emituje `game:roundSkipped`, po 3s spustí nové kolo

## Sdílené typy (shared/src/index.ts)

```typescript
// ClientToServerEvents
'game:czarForceAdvance': () => void;
'game:skipCzarJudging': () => void;
```

## Frontend změny

### CzarWaitingSelectionLayout.vue
- Podmínka zobrazení tlačítka: `secondsLeft === 0`
- Tlačítko: **"Dál nečekat"**
- Akce: `socket.emit('game:czarForceAdvance')`

### WaitingForCzarLayout.vue
- Podmínka zobrazení tlačítka: `secondsLeft === 0`
- Tlačítko: **"Přeskočit hodnocení"**
- Akce: `socket.emit('game:skipCzarJudging')`

## Rozsah změn

| Soubor | Typ změny |
|---|---|
| `packages/shared/src/index.ts` | +2 socket event typy |
| `packages/backend/src/socket/roundUtils.ts` | vyprázdnit timer callbacky |
| `packages/backend/src/socket/gameHandlers.ts` | +2 nové handlery |
| `packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue` | +tlačítko |
| `packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue` | +tlačítko |
