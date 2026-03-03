# Special Rules (House Rules Packages) — Design

## Přehled

Volitelné balíčky pravidel, které hostitel aktivuje při vytváření stolu. Pravidla se neaplikují automaticky — jsou podmíněna výběrem.

## Balíčky

| ID | Název | Popis |
|---|---|---|
| `rando_cardrissian` | Rando Cardrissian | Bot přidává náhodnou bílou kartu do každého kola. Pokud vyhraje, všichni hráči prohráli. |
| `god_mode` | God Mode | Hostitel zůstává Czarem po celou hru. Ostatní ho baví. |
| `wheatons_law` | Wheaton's Law | Czar dostane 2 černé karty a vybírá, se kterou se hraje. |
| `rebooting_universe` | Rebooting the Universe | Hráč může zahodit ruku a dobrat 10 nových karet za cenu 1 bodu. |
| `meritocracy` | Meritocracy | Czarem se stává vítěz minulého kola. Pokud vyhraje Rando, czar zůstane stejný. |
| `high_stakes` | High Stakes | Před výběrem karty může hráč vsadit body. Výhra násobí zisk, prohra ubírá sázku. |

## Datový model

### Shared types (`packages/shared/src/index.ts`)

```ts
export type SpecialRule =
  | 'rando_cardrissian'
  | 'god_mode'
  | 'wheatons_law'
  | 'rebooting_universe'
  | 'meritocracy'
  | 'high_stakes';
```

`GameRoom` dostane nová pole:
```ts
specialRules: SpecialRule[];           // [] = žádná pravidla
blackCardCandidates: BlackCard[] | null; // Wheaton's Law: czar vybírá
```

### Nové Socket eventy

**Client → Server:**
- `game:chooseBlackCard(cardId: number)` — czar vybírá černou kartu (Wheaton's Law)
- `game:placeBet(amount: number)` — hráč sází před odevzdáním (High Stakes)

**Server → Client:**
- `game:blackCardCandidates(cards: BlackCard[])` — server pošle 2 kandidáty czarovi

### Úpravy existujících eventů

- `lobby:create` + `lobby:updateSettings` — přibyde `specialRules?: SpecialRule[]`
- `game:roundEnd` — `winnerId` může být `'rando'` (Rando Cardrissian vyhrál)

## UI — CreateTableModal

### Mobil (2 kroky)

**Krok 1:** Stávající formulář + tlačítko "Rozšířená pravidla [N]" (N = počet aktivních).
**Krok 2:** Zpět šipka ← + scrollovatelný seznam balíčků s popisem a togglem.

### Desktop (2 sloupce)

Modal se rozšíří z `max-w-md` → `max-w-2xl`. Levý sloupec = stávající nastavení, pravý sloupec = scrollovatelný seznam balíčků.

## Backend — GameEngine změny

| Pravidlo | Místo změny | Logika |
|---|---|---|
| `rebooting_universe` | `tradeHand()` | Guard: vrátí error pokud pravidlo není aktivní |
| `god_mode` | `pickNextCzar()` | Vždy vrátí hosta |
| `meritocracy` | `pickNextCzar()` | Vybere vítěze minulého kola; fallback = rotace (1. kolo nebo Rando vyhrál) |
| `wheatons_law` | `startRound()` | Vytáhne 2 černé karty, uloží do `blackCardCandidates`, počká na czarovu volbu přes `game:chooseBlackCard` |
| `rando_cardrissian` | `startRound()` + `getAnonymousSubmissions()` + `selectWinner()` | Interní simulace — virtuální submise, detekce výhry `winnerId: 'rando'` |
| `high_stakes` | nová `placeBet()` + `selectWinner()` | Mapa sázek; po výběru vítěze přepočítá skóre |

### Rando Cardrissian — detaily

- Není reálný `Player` v `room.players` — GameEngine ho simuluje interně
- `startRound()`: vytáhne 1 náhodnou bílou kartu, uloží jako Randovu submisi
- `getAnonymousSubmissions()`: přidá Randovu kartu do anonymního mixu
- `selectWinner()`: při výhře Randa vrátí `winnerId: 'rando'`; ostatní hráči nedostanou bod (nebo ztratí — dle rozhodnutí)

### High Stakes — detaily

```ts
private bets = new Map<string, number>(); // playerId → vsazené body

placeBet(playerId: string, amount: number): { ok: true } | { error: string }
// Podmínky: amount >= 0, amount <= player.score, hráč ještě nesázil toto kolo
```

Po `selectWinner()`: vítěz dostane `+bet` navíc, ostatní `-bet`.
Bety se resetují na začátku každého kola.

## Frontend — herní fáze

### SelectionPhase.vue
- **High Stakes**: volitelný input pro sázku (0 až aktuální skóre) před odevzdáním karet
- **Wheaton's Law — čekání**: pokud `blackCardCandidates !== null` a hráč není Czar → zobrazit "Czar vybírá černou kartu..."

### JudgingPhase.vue
- **Wheaton's Law**: czar dostane 2 černé karty na výběr před zahájením hodnocení

### PlayerList.vue
- **Rando Cardrissian**: virtuální hráč "Rando Cardrissian" se zobrazí v seznamu s ikonou 🎲 a badge "BOT"

### LobbyPanel.vue
- Aktivní pravidla zobrazena jako row chipů pod názvem stolu (s tooltipem)

### RoomPreviewModal.vue
- Zobrazení aktivních balíčků při prohlížení místnosti před připojením

### Nová komponenta: SpecialRulesPanel.vue
- Sdílená komponenta pro `CreateTableModal` (s togglem) i `LobbyPanel` (readonly)
- Každý balíček: ikona, název, popis, toggle

## Poznámky k implementaci

- `tradeHand()` existuje — stačí podmínit pravidlem `rebooting_universe`
- `blackCardCandidates` se nastavuje jen dočasně na začátku kola; po výběru czara se resetuje na `null` a nastaví `currentBlackCard`
- Snapshot serializace (`toSnapshot`/`fromSnapshot`) musí zahrnout: `bets`, `randoCard`, `blackCardCandidates`, `lastRoundWinnerId`
- `PublicRoomSummary` — zvážit přidání `specialRules` pro zobrazení v seznamu veřejných stolů
