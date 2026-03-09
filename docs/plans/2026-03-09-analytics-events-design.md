# Analytics Events — Design

**Datum:** 2026-03-09
**Cíl:** Logovat důležité herní události do DB pro budoucí analytiku a přehledy.

## Sledované události (fáze 1)

1. `room_created` — vytvoření stolu (timestamp + kompletní nastavení)
2. `settings_updated` — změna nastavení stolu hostem
3. `game_started` — zahájení hry (počet hráčů + jejich přezdívky)

## Architektura: Hybridní event log (možnost C)

Hlavní tabulka `game_events` pro přehledy + detail tabulka pro každý event typ.
Výhoda: přidávání nových event typů bez změny existujícího schématu.

## Databázové schéma

```sql
-- Hlavní log
CREATE TABLE game_events (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type  ENUM('room_created','settings_updated','game_started') NOT NULL,
  room_code   CHAR(6)      NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_room   (room_code),
  INDEX idx_type   (event_type, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detail: vytvoření stolu
CREATE TABLE game_event_room_created (
  event_id        BIGINT PRIMARY KEY,
  host_nickname   VARCHAR(100)  NOT NULL,
  room_name       VARCHAR(100)  NOT NULL,
  is_public       BOOLEAN       NOT NULL,
  max_players     TINYINT       NOT NULL,
  win_condition   VARCHAR(20)   NOT NULL,
  target_score    SMALLINT      NOT NULL,
  target_rounds   SMALLINT      NOT NULL,
  game_time_limit SMALLINT      NOT NULL,
  set_ids         JSON          NOT NULL,   -- [1, 2]
  special_rules   JSON          NOT NULL,   -- ['rando_cardrissian', ...]
  FOREIGN KEY (event_id) REFERENCES game_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detail: změna nastavení stolu
CREATE TABLE game_event_settings_updated (
  event_id        BIGINT PRIMARY KEY,
  changed_by      VARCHAR(100)  NOT NULL,
  room_name       VARCHAR(100),
  is_public       BOOLEAN,
  max_players     TINYINT,
  win_condition   VARCHAR(20),
  target_score    SMALLINT,
  target_rounds   SMALLINT,
  game_time_limit SMALLINT,
  set_ids         JSON,
  special_rules   JSON,
  FOREIGN KEY (event_id) REFERENCES game_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detail: zahájení hry
CREATE TABLE game_event_game_started (
  event_id     BIGINT  PRIMARY KEY,
  player_count TINYINT NOT NULL,
  players      JSON    NOT NULL,   -- [{nickname:"Alice"}, ...]
  FOREIGN KEY (event_id) REFERENCES game_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Backend architektura

**Nový soubor:** `packages/backend/src/analytics/EventLogger.ts`

- Singleton třída exportovaná jako `eventLogger`
- Metody: `logRoomCreated()`, `logSettingsUpdated()`, `logGameStarted()`
- Fire-and-forget: chyby DB se logují do konzole, nikdy neshodí herní logiku
- Vkládání atomické přes Knex transakci (`game_events` + detail tabulka)

**Integrace** v `packages/backend/src/socket/lobbyHandlers.ts`:

| Socket event      | Metoda                          | Kdy                              |
|-------------------|---------------------------------|----------------------------------|
| `lobby:create`    | `logRoomCreated(room, nickname)`| po úspěšném `createRoom()`      |
| `lobby:updateSettings` | `logSettingsUpdated(room, nickname)` | po úspěšném `updateSettings()` |
| `lobby:startGame` | `logGameStarted(room)`          | po úspěšném `startNewRound()`   |

## Nová Knex migrace

Soubor: `packages/backend/src/db/migrations/20260309000000_analytics_events.ts`

## Příklady SQL dotazů

```sql
-- Kolik stolů bylo vytvořeno za poslední týden?
SELECT DATE(occurred_at) AS den, COUNT(*) AS pocet
FROM game_events WHERE event_type = 'room_created'
  AND occurred_at >= NOW() - INTERVAL 7 DAY
GROUP BY DATE(occurred_at);

-- Která sada karet je nejoblíbenější?
SELECT JSON_ARRAYAGG(set_ids) FROM game_event_room_created;

-- Průměrný počet hráčů při startu hry
SELECT AVG(player_count) FROM game_event_game_started;
```
