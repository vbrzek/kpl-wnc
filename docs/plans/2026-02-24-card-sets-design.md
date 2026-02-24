# Card Sets REST API + Lobby Selection — Design

**Datum:** 2026-02-24
**Scope:** GET /api/card-sets endpoint + seed data + výběr sad v CreateTableModal

---

## Architektura

### Backend

**1. DB singleton** — `packages/backend/src/db/db.ts`
- Knex instance sdílená napříč routami
- Oddělená od `knexfile.ts` (ten slouží jen CLI migraci)

**2. REST endpoint** — `packages/backend/src/routes/cardSets.ts`
```
GET /api/card-sets
→ CardSetSummary[]
```
Vrací: `{ id, name, description, slug, isPublic, blackCardCount, whiteCardCount }`
Počty karet se spočítají JOIN dotazem, ne lazy načítáním.

**3. Registrace** — `packages/backend/src/index.ts`
```ts
app.register(cardSetsRoutes, { prefix: '/api' });
```

**4. Seed data** — `packages/backend/src/db/seeds/01_czech_set.ts`
- 1 česká sada: "Základní česká sada"
- 15 černých karet (pick: 1)
- 35 bílých karet
- Spouštění: `npm run seed --workspace=packages/backend`

**5. Validace startGame** — `packages/backend/src/game/RoomManager.ts`
- Přidat kontrolu: `room.selectedSetIds.length === 0` → error

**6. package.json seed script** — přidat do `packages/backend/package.json`

### Frontend

**7. lobbyStore.ts** — přidat `fetchCardSets()`
```ts
interface CardSetSummary {
  id: number; name: string; description: string | null;
  blackCardCount: number; whiteCardCount: number;
}
cardSets: CardSetSummary[]   // state
fetchCardSets(): Promise<void>
```

**8. CreateTableModal.vue** — přidat výběr sad
- Volá `lobbyStore.fetchCardSets()` při `onMounted`
- Checkboxy pro každou sadu s počtem karet
- Tlačítko "Vytvořit" disabled dokud není vybrána ≥ 1 sada
- `selectedSetIds` se pošle přes existující `lobby:create` socket event

---

## Datový tok

```
CreateTableModal mounts
  → lobbyStore.fetchCardSets()
  → GET /api/card-sets
  → Fastify → Knex → MySQL
  → vrátí CardSetSummary[]

Host zaškrtne sady + klikne "Vytvořit"
  → emit lobby:create { selectedSetIds: [1, ...] }
  → RoomManager.createRoom() — uloží do room.selectedSetIds

Host klikne "Spustit hru"
  → RoomManager.startGame()
  → kontrola: selectedSetIds.length > 0
  → kontrola: activePlayers >= 3
```

---

## Česká seed data (přehled)

**Černé karty (15):** situační karty s "____" placeholderem
**Bílé karty (35):** vtipné české odpovědi

---

## Co se NEMĚNÍ

- Socket.io eventy (žádná změna v shared/index.ts)
- RoomManager logika kromě startGame validace
- LobbyPanel (výběr sad jen při vytváření, ne v lobby)
- Žádný admin UI

---

## Implementační pořadí

1. `db.ts` — DB singleton
2. `cardSets.ts` route + registrace v index.ts
3. seed soubor + npm script
4. `RoomManager.startGame` validace
5. `lobbyStore.ts` — fetchCardSets
6. `CreateTableModal.vue` — checkboxy
