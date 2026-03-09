# Win Conditions & Room Settings — Design

**Datum:** 2026-03-08

## Přehled

1. Opravit ukončení hry při přesažení cíle (sázky) — fakticky už funguje (`>=`), jen ověřit
2. Nová kritéria ukončení: čas (5–60 min) a počet kol (5–100), skóre zůstává výchozí
3. Host může měnit nastavení místnosti v lobby (mezi hrami i před první hrou)

---

## Datový model

### `WinCondition` (nový typ v `@kpl/shared`)

```typescript
export type WinCondition = 'score' | 'time' | 'rounds';
```

### Rozšíření `GameRoom`

```typescript
winCondition: WinCondition;   // výchozí: 'score'
targetRounds: number;          // výchozí: 20 (pro 'rounds' mód)
gameTimeLimit: number;         // minuty, výchozí: 15 (pro 'time' mód)
gameStartedAt?: number;        // timestamp ms — nastaven při lobby:startGame
```

`targetScore` zůstává beze změny (default 10, možnosti 8|10|15|20|30).

---

## Backend

### `RoomManager.ts`

**`CreateRoomSettings`** — přidáno:
```typescript
winCondition: WinCondition;
targetRounds: number;
gameTimeLimit: number;
```

**`UpdateSettingsData`** — přidáno:
```typescript
winCondition?: WinCondition;
targetScore?: number;
targetRounds?: number;
gameTimeLimit?: number;
```

**`createRoom()`** — nová pole s defaults při absenci:
- `winCondition: settings.winCondition ?? 'score'`
- `targetRounds: settings.targetRounds ?? 20`
- `gameTimeLimit: settings.gameTimeLimit ?? 15`

**`updateSettings()`** — aplikuje nová pole (pouze v LOBBY stavu).

**`startGame()`** — nastaví `room.gameStartedAt = Date.now()`.

### `gameHandlers.ts`

Pomocná funkce (lokální, ne export):

```typescript
function isWinConditionMet(room: GameRoom, engine: GameEngine, result: RoundResult): boolean {
  switch (room.winCondition) {
    case 'score':
      return !!(result.winnerId && result.scores[result.winnerId] >= room.targetScore);
    case 'rounds':
      return engine.roundNumber >= room.targetRounds;
    case 'time':
      return !!(room.gameStartedAt && Date.now() - room.gameStartedAt >= room.gameTimeLimit * 60_000);
  }
}
```

Použití:
- Po `game:judgeSelect` (nahradí stávající score check)
- Po `game:skipCzarJudging` (přidáno — dosud chybělo)

### `validation.ts` (nebo kde jsou Zod schemata)

Aktualizovat schema pro `lobby:create` a `lobby:updateSettings` — přidat validaci nových polí.

---

## Frontend

### `@kpl/shared/src/index.ts`

Přidat `WinCondition` typ + rozšířit `GameRoom` interface.

### `CreateTableModal.vue`

Sekce "Kritérium vítězství":
- Radio/tabs: Skóre | Čas | Kola (výchozí: Skóre)
- Skóre: stávající dropdown (8|10|15|20|30)
- Čas: slider 5–60 min, krok 5, default 15
- Kola: `<input type="number">` 5–100, default 20

### `LobbyPanel.vue`

- Pro všechny hráče: zobrazit aktuální kritérium (ikona + text): "🏆 10 bodů" / "⏱ 15 min" / "🔄 20 kol"
- Pro hosta: tlačítko "⚙ Nastavení" → otevře `RoomSettingsModal`

### Nová komponenta `RoomSettingsModal.vue`

Otevírá se v LOBBY stavu, pouze pro hosta. Obsahuje:
- Název místnosti (text input)
- Výběr sady karet (single select, stejné jako CreateTableModal)
- Kritérium vítězství (stejné radio/slider/input jako CreateTableModal)
- Speciální pravidla (SpecialRulesPanel — reuse stávající komponenty)

Emituje `updateSettings` přes `roomStore.updateSettings()`.

### `roomStore.ts`

Rozšíření `updateSettings()` o nová pole:
```typescript
async function updateSettings(settings: {
  name?: string;
  isPublic?: boolean;
  selectedSetIds?: number[];
  maxPlayers?: number;
  specialRules?: SpecialRule[];
  winCondition?: WinCondition;
  targetScore?: number;
  targetRounds?: number;
  gameTimeLimit?: number;
}): Promise<{ error: string } | null>
```

### `lobbyStore.ts`

Rozšíření `createRoom()` o `winCondition`, `targetRounds`, `gameTimeLimit`.

---

## Poznámky

- Snapshot serialization: `GameRoom` se serializuje celý object — nová pole budou automaticky zahrnuta
- `finishGame()` nevyžaduje změny — výsledky jsou scores-based, nezávisí na win condition
- Skóre check `>=` na gameHandlers:152 již správně zachycuje přesažení cíle sázkami
- `gameStartedAt` se resetuje při každém volání `startGame()` — správné chování pro opakované hry
