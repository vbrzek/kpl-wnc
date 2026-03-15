# Pohárky (Trophy System) — Design

## Přehled

OAuth hráči sbírají pohárky za umístění v ukončených hrách, podobně jako v Brawl Stars. Pohárky se kumulují v databázi.

## Podmínky udělení

- Hra musí mít **≥ 10 odehraných kol**
- Hráč musí být **přihlášen přes OAuth** (propojení přes `user_player_tokens`)

## Distribuce pohárků

| Hráči | 1. místo | 2. místo | 3. místo |
|-------|----------|----------|----------|
| 3     | 5        | 1        | 0        |
| 4+    | 5        | 3        | 1        |

**Remíza:** Hráči sdílející pořadí dostanou průměr dostupných pohárků zaokrouhlený dolů (`Math.floor`).
Příklad: remíza na 2.–3. místě (4+ hráčů) → `floor((3+1)/2) = 2` pohárky každý.

## Databáze

Nová tabulka `user_trophies` — kumulativní součet:

```sql
CREATE TABLE user_trophies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    trophies INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Zápis: `INSERT ... ON DUPLICATE KEY UPDATE trophies = trophies + ?`

## Backend

### `RoomManager.finishGame()`

Rozšíří `FinishGameResult` o:
- `roundNumber: number` — zachycen před resetem na 0
- `playerTokenMap: Map<string, string>` — mapa `playerId → playerToken`

### `trophyService.ts` (nový soubor)

`awardTrophies(payload: GameOverPayload, roundNumber: number, playerTokenMap: Map<string, string>): Promise<Record<string, number>>`

1. Ověří `roundNumber >= 10` — jinak vrátí prázdný objekt
2. Pro každého hráče v `finalScores` vyhledá `user_id` přes `user_player_tokens`
3. Vypočítá pohárky s logikou remízy
4. Zapíše do DB (`INSERT ... ON DUPLICATE KEY UPDATE`)
5. Vrátí `trophiesAwarded: Record<playerId, number>`

### `gameHandlers.ts`

Na všech 3 místech kde se volá `finishGame()`, přidá fire-and-forget:

```ts
awardTrophies(finishResult.payload, finishResult.roundNumber, finishResult.playerTokenMap)
  .then(trophiesAwarded => {
    io.to(`room:${room.code}`).emit('game:trophiesAwarded', trophiesAwarded);
  })
  .catch(() => {}); // non-critical
```

### `GameOverPayload` (shared types)

Přidá volitelné pole:
```ts
trophiesAwarded?: Record<string, number>; // playerId → pohárky získané v této hře
```

## REST API

`GET /api/me` — rozšíří response o `trophies: number` (LEFT JOIN na `user_trophies`).

## Frontend

### `profileStore.ts`

Přidá `trophies: number` do `oauthUser` objektu.

### `AppHeader.vue`

Zobrazí ikonu pohárku + celkový počet vedle avataru pro OAuth hráče.

### Game Over obrazovka

U každého hráče v `finalScores` listu:
- Delta pohárků získaných v této hře (`trophiesAwarded[playerId]`)
- Jen pro OAuth hráče (ostatní vidí `undefined`)
