# Versioning + About Modal — Design

**Datum:** 2026-03-14
**Stav:** Schváleno, připraveno k implementaci

## Cíl

Zavést verzování aplikace a zobrazit verzi + datum buildu v modalu "O aplikaci".

## Přístup: package.json + Vite define (Přístup A)

Jediný zdroj pravdy: `version` v root `package.json`.
Build date a verze jsou injektovány v době buildu — žádný HTTP request, žádná závislost na gitu za běhu.

---

## Sekce 1: Vite injekce

Soubor: `packages/frontend/vite.config.ts`

```ts
import { readFileSync } from 'fs'
import { resolve } from 'path'

const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
})
```

Soubor: `packages/frontend/src/env.d.ts` — přidat deklarace:

```ts
declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string
```

Použití ve Vue:
```ts
const version = __APP_VERSION__   // '1.0.1'
const buildDate = new Intl.DateTimeFormat('cs-CZ').format(new Date(__BUILD_DATE__))
```

---

## Sekce 2: Release skript

Soubor: `scripts/release.mjs` (kořen monorepa)

```js
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))

const current = JSON.parse(readFileSync('package.json', 'utf-8')).version
console.log(`Aktuální verze: ${current}`)

const type = await ask('Typ: patch / minor / major? ')
if (!['patch', 'minor', 'major'].includes(type.trim())) {
  console.error('Neplatný typ.')
  process.exit(1)
}

execSync(`npm version ${type.trim()} --no-workspaces-update`, { stdio: 'inherit' })

const push = await ask('Pushnout na remote? (y/n) ')
if (push.trim() === 'y') {
  execSync('git push && git push --tags', { stdio: 'inherit' })
}

rl.close()
```

Root `package.json` — přidat script:
```json
"release": "node scripts/release.mjs"
```

Workflow: `npm run release` → patch/minor/major → commit + tag (přes `npm version`) → optional push.

---

## Sekce 3: About modal

**Komponenta:** `packages/frontend/src/components/AboutModal.vue`
- Props: `v-model:open` (boolean)
- Zobrazuje: název hry, verze, datum buildu, atribuce Cards Against Humanity

**Mount:** `App.vue` — globálně jako ostatní modaly

**Trigger:** Položka "O aplikaci" v avatar dropdownu (`AppMenuDropdown.vue`) — nahrazuje stávající router-link na `/about`

**Obsah:**
```
Karty Proti Lidskosti
Verze 1.0.1
Sestaveno 14. 3. 2026
Inspirováno hrou Cards Against Humanity
[Zavřít]
```

---

## Soubory ke změně

| Soubor | Akce |
|--------|------|
| `packages/frontend/vite.config.ts` | Přidat `define` blok |
| `packages/frontend/src/env.d.ts` | Deklarovat `__APP_VERSION__`, `__BUILD_DATE__` |
| `packages/frontend/src/components/AboutModal.vue` | Nová komponenta |
| `packages/frontend/src/App.vue` | Mountovat AboutModal, přidat state |
| `packages/frontend/src/components/AppMenuDropdown.vue` | Trigger pro modal místo route |
| `package.json` (root) | Přidat script `release` |
| `scripts/release.mjs` | Nový release skript |
