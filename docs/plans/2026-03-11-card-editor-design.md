# Card Editor — Design

Datum: 2026-03-11

## Cíl

OAuth uživatelé mohou vytvářet a editovat vlastní sady karet. Průvodce vede uživatele třemi kroky: základ sady → výběr karet → přidání nových karet.

## Datová vrstva

### DB migrace

Jeden nový sloupec:

```sql
ALTER TABLE card_sets ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
```

- `user_id = NULL` → systémová sada (neměnná, jen ke čtení)
- `user_id = <id>` → sada vlastněná uživatelem

Existující junction tabulky (`card_set_black_cards`, `card_set_white_cards`) fungují beze změn.

### Backend API

Dva nové route soubory, vše vyžaduje OAuth autentizaci:

**`packages/backend/src/routes/editorSets.ts`**
```
GET    /api/editor/sets              moje sady
POST   /api/editor/sets              nová sada
GET    /api/editor/sets/:id          detail sady + počty karet
PATCH  /api/editor/sets/:id          update name/desc/is_public
DELETE /api/editor/sets/:id          smazání (jen vlastník)

POST   /api/editor/sets/:id/cards         přidání existující karty do sady
DELETE /api/editor/sets/:id/cards/:type/:cardId  odebrání karty
```

**`packages/backend/src/routes/editorCards.ts`**
```
GET  /api/editor/cards    browse karet (?type=black|white&search=&setId=)
POST /api/editor/cards    nová karta + přidání do sady (?setId=)
```

Autorizace: `PATCH`, `DELETE` ověří `card_sets.user_id === req.user.id`.

## Frontend struktura

### Router

```
/editor          EditorDashboardView.vue   (dashboard "moje sady")
/editor/new      EditorWizardView.vue      (průvodce novou sadou)
/editor/:id      EditorSetView.vue         (editace existující sady)
```

Všechny routes jsou chráněné — redirect na `/` pokud uživatel není přihlášen přes OAuth.

### Nové soubory

```
packages/frontend/src/views/
  EditorDashboardView.vue
  EditorWizardView.vue
  EditorSetView.vue

packages/frontend/src/stores/
  editorStore.ts

packages/frontend/src/components/editor/
  SetCard.vue           karta sady v dashboardu
  WizardStep1.vue       název, popis, zdroj replikace
  WizardStep2.vue       výběr karet (checkbox list s filtry)
  WizardStep3.vue       přidávání nových karet
  CardBrowser.vue       sdílená komponenta pro krok 2 i EditorSetView
  CardFilterBar.vue     search + type toggle + set filter
```

### HomeView změna

Přidá se tlačítko "Moje sady karet" — viditelné jen pokud `profileStore.oauthUser !== null`.
Umístění: v sekci se seznamem karetních sad.

## UX průvodce

### Krok 1 — Základ sady

- Název (required, max 64 znaků)
- Popis (optional, max 255 znaků)
- Viditelnost: toggle Soukromá / Veřejná
- Zdroj: radio "Začít prázdnou" nebo "Replikovat existující sadu" + dropdown sad
- "Pokračovat" → POST /api/editor/sets, přejde na krok 2 s nově vytvořeným `:id`

### Krok 2 — Výběr karet

- Záložky: Černé karty / Bílé karty
- FilterBar: fulltext search + dropdown "filtrovat podle sady"
- Virtualizovaný scroll pro 500+ karet (vue-virtual-scroller nebo vlastní)
- Každá řádka: checkbox + text karty
- Při replikaci jsou checkboxy zdrojové sady předvybrané
- Změny ukládány průběžně s debounce (POST/DELETE na junction tabulky)
- Trvalé počítadlo: "X černých / Y bílých vybráno"

### Krok 3 — Nové karty

- Textarea pro text karty + toggle Černá / Bílá
- Pro černé karty: picker `pick` (1 nebo 2)
- Volitelná sekce "Překlady" — rozbalí 4 textarea (en, ru, uk, es)
- "Přidat kartu" → POST /api/editor/cards → karta se přidá do sady
- Seznam karet přidaných v této session s možností smazání
- "Dokončit" → přesměruje na EditorDashboardView

### EditorSetView (editace existující sady)

Stejné funkce jako kroky 2+3 bez wizard obálky. Používá sdílené CardBrowser a CardFilterBar.

## Budoucí iterace

- LLM automatický překlad karet (připravit endpoint, zatím prázdný)
- Replikace veřejných sad ostatních uživatelů v editoru
- Sdílení sady přes URL

## Technické poznámky

- `is_public = true` → sada se zobrazí v CreateTableModal pro všechny hráče
- Systémové sady (`user_id = NULL`) jsou read-only — nelze editovat ani mazat přes editor API
- Virtualizace seznamu karet je nutná (565+ položek způsobí lag bez ní)
