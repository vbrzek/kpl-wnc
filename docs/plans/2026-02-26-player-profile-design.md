# Player Profile Design

**Datum:** 2026-02-26

## Přehled

Globální hráčský profil uložený v localStorage. Hráč nastaví přezdívku a jazyk jednou při prvním otevření aplikace. Profil platí napříč všemi herními místnostmi — při přisednutí ke stolu se na jméno znovu neptáme. Avatar se generuje automaticky přes DiceBear (styl `bottts`) ze seedu přezdívky.

---

## 1. Datový model a localStorage

### Nové klíče v localStorage

```
playerProfile = { "nickname": "Karel", "locale": "cs" }
locale = "cs"   ← stávající klíč, udržován v sync
playerToken_<roomCode> = "uuid..."  ← beze změny
```

`playerProfile` je jeden JSON objekt. Při každém uložení profilu se zapíše i stávající `locale` klíč, takže `detectLocale()` v `i18n/index.ts` funguje beze změny.

### Avatar URL

```
https://api.dicebear.com/9.x/bottts/svg?seed={nickname}
```

Čistý CDN URL, žádný npm balíček. Avatar je deterministický — stejná přezdívka = vždy stejný robot.

---

## 2. Pinia store — `profileStore.ts`

| Položka | Typ | Popis |
|---|---|---|
| `nickname` | `ref<string>` | Přezdívka hráče |
| `locale` | `ref<SupportedLocale>` | Vybraný jazyk |
| `avatarUrl` | `computed` | DiceBear URL se seedem z přezdívky |
| `hasProfile` | `computed` | `nickname.length > 0` |
| `save(nickname, locale)` | funkce | Zapíše do localStorage + aktualizuje i18n runtime locale |
| `init()` | funkce | Čte z localStorage při startu aplikace |

---

## 3. Komponenty

### `PlayerProfileModal.vue`

- Plnoobrazovkový modal (stejný styl jako `NicknameModal`)
- Vstup pro přezdívku (max 24 znaků) s **live náhledem** DiceBear avataru (robot se aktualizuje při psaní)
- Výběr jazyka — 5 tlačítek s vlajkou emoji + názvem:
  - 🇨🇿 Čeština (`cs`)
  - 🇬🇧 English (`en`)
  - 🇷🇺 Русский (`ru`)
  - 🇺🇦 Українська (`uk`)
  - 🇪🇸 Español (`es`)
- Tlačítko "Uložit" aktivní jen pokud přezdívka není prázdná
- Po uložení: `profileStore.save()` + zavření modalu + okamžité přepnutí i18n locale
- **Modal nelze zavřít bez vyplnění** (při prvním zobrazení) — klik na backdrop nic nedělá
- V "edit mode" (otevřený kliknutím na avatar) lze zavřít bez změn

### `PlayerAvatar.vue`

- Znovupoužitelná komponenta — kruhový výřez s `<img>` tagem (DiceBear SVG)
- Velikosti: 40×40px v headeru, 96×96px v profilovém modalu
- Kliknutelný → otevírá `PlayerProfileModal` v edit mode

### `App.vue` změny

- `profileStore.init()` při mountu
- `v-if="!profileStore.hasProfile"` → zobrazí `PlayerProfileModal` (blokuje celou UI)
- `PlayerAvatar` v pravém horním rohu (absolutně pozicionovaný)

### `NicknameModal.vue`

Odstraní se ze všech míst kde se aktuálně používá. Celá funkčnost nahrazena `PlayerProfileModal`.

---

## 4. Integrace lobby akcí

`lobbyStore.createRoom` a `joinRoom` přestanou přijímat `nickname` jako parametr od volajícího. Volající (HomeView, RoomView) předají vždy `profileStore.nickname` — nebo store si ho vezme interně.

---

## 5. Edge cases

| Situace | Chování |
|---|---|
| Hráč smaže localStorage | Modal se znovu zobrazí při dalším načtení |
| Přezdívka se změní v editaci | Nový DiceBear seed → nový avatar; per-room token zůstane nezměněn |
| Velmi dlouhá přezdívka | Max 24 znaků, validace v modalu |
| Locale sync při startu | `profileStore.init()` načte `playerProfile.locale` a nastaví i18n; `detectLocale()` čte `locale` klíč, který profile store udržuje v sync |
