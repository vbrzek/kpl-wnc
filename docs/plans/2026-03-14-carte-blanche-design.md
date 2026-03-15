# Carte Blanche — Design

**Datum:** 2026-03-14
**Typ:** Nové speciální pravidlo

## Přehled

Každý hráč dostane na začátku hry jednu speciální "prázdnou" kartu navíc (celkem 11 karet v ruce). Kartu může použít kdykoliv během hry — před odesláním napíše vlastní text. Kartu má jen jednou na celou hru, nelze ji získat znovu. Po použití se na konci kola dolízává normální karta jako obvykle.

## Datový model

### Shared types (`packages/shared/src/index.ts`)
- Přidat `'carte_blanche'` do `SpecialRule`
- Přidat volitelné pole `isBlank?: true` do `WhiteCard`

### Socket event `game:playCards`
Rozšířit data o volitelné pole:
```typescript
{ cardIds: string[], blankCardText?: string }
```

### EngineSnapshot
```typescript
blankCardsUsed: string[]  // pole playerIds, kteří blank kartu použili
```

## Backend (`packages/backend/src/game/GameEngine.ts`)

### Inicializace
- Při prvním `startRound()` (pokud je pravidlo aktivní) přidat každému hráči syntetickou kartu na konec ruky:
  ```typescript
  { id: `blank_${playerId}`, text: '', isBlank: true }
  ```

### `submitCards()` — validace
1. Pokud `cardIds` obsahuje `blank_<playerId>`:
   - Ověřit `blankCardText` (neprázdný, max 200 znaků)
   - Ověřit, že `blankCardsUsed` neobsahuje `playerId`
   - Vytvořit WhiteCard s `text = blankCardText` pro submission
   - Přidat `playerId` do `blankCardsUsed`
2. Blank karta se **nevrací** do balíčku — na konci kola se dolízává normální karta jako obvykle

### `gameHandlers.ts`
```typescript
if (data.cardIds.includes(`blank_${playerId}`)) {
  if (!data.blankCardText?.trim()) return cb({ error: 'Blank card text required' })
}
```

## Frontend

### Karta v ruce
Výrazně odlišný vizuál od normálních bílých karet:
- Tmavý/zlatý gradient
- Ikona ✏️ nebo 🃏
- Text "Carte Blanche" + podtitul "Jednorázová — napiš co chceš"
- Zlatý/fialový rámeček

### Modal pro text (intercept před odesláním)
- Zobrazí se po kliknutí "Odeslat", pokud je vybraná blank karta
- `<textarea>` s placeholderem "Napiš text své karty..."
- Počítadlo znaků (max 200)
- Tlačítka "Zrušit" a "Odeslat"
- Po potvrzení odešle `game:playCards` s `blankCardText`

### `roomStore.ts`
- Computed `hasBlankCard` — true pokud hráč má `blank_<playerId>` v ruce a není v `blankCardsUsed`
- Rozšíření `playCards(cardIds, blankCardText?)` funkce

### Judging fáze
Odevzdaný text se zobrazí jako normální bílá karta — žádné speciální označení.

## i18n

Přidat do všech locale souborů (`cs.json`, `en.json`, `ru.json`, `uk.json`, `es.json`):

```json
"carte_blanche": {
  "name": "Carte Blanche",
  "desc": "Každý hráč dostane jednu speciální prázdnou kartu. Použij ji kdykoliv a napiš na ni co chceš — ale máš ji jen jednou."
}
```

## Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `packages/shared/src/index.ts` | Přidat `'carte_blanche'` do `SpecialRule`, `isBlank?` do `WhiteCard` |
| `packages/backend/src/game/GameEngine.ts` | Inicializace blank karet, logika v `submitCards()`, snapshot |
| `packages/backend/src/socket/gameHandlers.ts` | Validace `blankCardText` v `game:playCards` |
| `packages/frontend/src/components/SpecialRulesPanel.vue` | Toggle pro Carte Blanche |
| `packages/frontend/src/components/game/` | Vizuál blank karty v ruce, modal pro text |
| `packages/frontend/src/stores/roomStore.ts` | `hasBlankCard`, rozšíření `playCards()` |
| `packages/frontend/src/i18n/locales/*.json` | Překlady (5 souborů) |
| `packages/backend/src/game/GameEngine.test.ts` | Testy nové logiky |
