# Card Deduplication & M:N Schema — Design

## Problém

Karty jsou nyní přímo vázané na konkrétní sadu (`card_set_id` FK). Dvě sady (česká + liberecká) sdílejí stovky identických karet — každá je v DB uložena zvlášť, překlady se nesdílejí.

## Nové schéma

### Zrušené sloupce
- `black_cards.card_set_id` — odstraněno (FK + sloupec)
- `white_cards.card_set_id` — odstraněno (FK + sloupec)

### Nové junction tabulky

```sql
CREATE TABLE card_set_black_cards (
  card_set_id    INT UNSIGNED NOT NULL,
  black_card_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (card_set_id, black_card_id),
  FOREIGN KEY (card_set_id)   REFERENCES card_sets(id)  ON DELETE CASCADE,
  FOREIGN KEY (black_card_id) REFERENCES black_cards(id) ON DELETE CASCADE
);

CREATE TABLE card_set_white_cards (
  card_set_id    INT UNSIGNED NOT NULL,
  white_card_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (card_set_id, white_card_id),
  FOREIGN KEY (card_set_id)   REFERENCES card_sets(id)  ON DELETE CASCADE,
  FOREIGN KEY (white_card_id) REFERENCES white_cards(id) ON DELETE CASCADE
);
```

Překlady zůstávají beze změny.

## Deduplikační logika

| Typ | Klíč | Shoda |
|-----|------|-------|
| `black_cards` | `(text.trim(), pick)` | exact match |
| `white_cards` | `text.trim()` | exact match |

Pro každou skupinu duplikátů:
1. Zachová se jeden kanonický záznam (první výskyt / nejnižší ID)
2. Překlady ze všech duplikátů se sloučí — první výskyt daného `language_code` vyhrává
3. Zaznamenají se všechny `card_set_id` hodnot pro junction tabulku

## Migrační postup (`up()`)

1. Načíst vše do paměti (black_cards + card_set_id, white_cards + card_set_id, překlady)
2. Deduplikovat v paměti, sestavit nová data
3. Schéma: DROP FK + sloupec `card_set_id` z obou card tabulek
4. Schéma: CREATE junction tabulky
5. `SET FOREIGN_KEY_CHECKS=0` → TRUNCATE translation + card tabulky → `SET FOREIGN_KEY_CHECKS=1`
6. INSERT deduplikované karty (nová IDs od 1)
7. INSERT sloučené překlady (s novými IDs)
8. INSERT junction table záznamy

`down()`: DROP junction tables, ADD BACK `card_set_id` (nullable, bez obnovy dat).

## Dotčený kód

| Soubor | Změna |
|--------|-------|
| `routes/cardSets.ts` | COUNT přes junction tabulku |
| `socket/lobbyHandlers.ts` | startGame: JOIN přes junction tabulku + DISTINCT |

## Seed generátor

Standalone skript `packages/backend/scripts/generate-seeds.ts` — spustitelný přes `tsx` po migraci. Čte aktuální DB stav a přepíše seed soubory do nové M:N struktury.

## Výsledky implementace (2026-03-10)

- Migrace proběhla: `Batch 4 run: 20260310000000_deduplicate_cards.ts`
- Deduplikovaný stav: **140 black cards**, **565 white cards** (z původně ~219 black + ~990 white řádků s duplikáty)
- Junction tabulky: 219 black assignments, 990 white assignments (celková přiřazení ke 2 sadám)
- Seed soubory: `01_czech_set.ts` + `02_liberecaci_2026.ts` nahrazeny generovaným `01_all_cards.ts`
- `.env` v worktree musí být symlink na kořen monorepa (worktree je 2 úrovně hlouběji než hlavní projekt)
