# Versioning + About Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Zavést verzování přes `package.json` + Vite define a zobrazit verzi + datum buildu v modalu "O aplikaci".

**Architecture:** Root `package.json` je jediný zdroj pravdy pro verzi. Vite injektuje `__APP_VERSION__` a `__BUILD_DATE__` jako compile-time konstanty. AboutModal sleduje stejný vzor jako RulesModal (mount v AppHeader, emit z AppMenuDropdown).

**Tech Stack:** Vite `define`, Vue 3 Composition API, vue-i18n, Teleport, TypeScript global declarations, Node.js ESM script

---

### Task 1: Vite define — injekce verze a data buildu

**Files:**
- Modify: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/src/vite-env.d.ts`

**Step 1: Přidej import a define do vite.config.ts**

Na začátek souboru přidej importy, před `defineConfig` načti root `package.json`:

```ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
```

Uvnitř `defineConfig({...})` přidej `define` sekci (na stejnou úroveň jako `plugins`, `envDir`, `server`):

```ts
define: {
  __APP_VERSION__: JSON.stringify(
    JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')).version
  ),
  __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
},
```

**Step 2: Vytvoř `packages/frontend/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string
```

**Step 3: Ověř TypeScript — žádné chyby kompilace**

```bash
cd packages/frontend && npx tsc --noEmit
```

Očekáváno: žádné chyby týkající se `__APP_VERSION__` nebo `__BUILD_DATE__`.

**Step 4: Commit**

```bash
git add packages/frontend/vite.config.ts packages/frontend/src/vite-env.d.ts
git commit -m "feat: inject APP_VERSION and BUILD_DATE via Vite define"
```

---

### Task 2: AboutModal komponenta

**Files:**
- Create: `packages/frontend/src/components/AboutModal.vue`

**Step 1: Vytvoř komponentu**

Vzor: identický s `RulesModal.vue` — Teleport, backdrop, close button, `defineEmits<{ close: [] }>`.

```vue
<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()

const version = __APP_VERSION__
const buildDate = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date(__BUILD_DATE__))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="emit('close')"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-sm">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
            O aplikaci
          </h2>
          <button @click="emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="px-6 pb-6 space-y-4">
          <div>
            <p class="text-2xl font-black tracking-tighter text-white uppercase italic">Karty Proti Lidskosti</p>
          </div>
          <div class="text-sm text-gray-400 space-y-1">
            <p>Verze <span class="text-white font-bold">{{ version }}</span></p>
            <p>Sestaveno <span class="text-white font-bold">{{ buildDate }}</span></p>
          </div>
          <div class="border-t border-white/10 pt-4">
            <p class="text-xs text-gray-500 leading-relaxed">
              Inspirováno hrou <span class="text-gray-300">Cards Against Humanity</span>,
              která je dostupná pod licencí Creative Commons BY-NC-SA 2.0.
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

**Step 2: Ověř vizuálně — viz Task 3 (modal se zapojí tam)**

---

### Task 3: Zapojení AboutModal do AppHeader

**Files:**
- Modify: `packages/frontend/src/components/AppHeader.vue`
- Modify: `packages/frontend/src/components/AppMenuDropdown.vue`

**Step 1: Přidej `open-about` emit do AppMenuDropdown**

V `<script setup>` v `AppMenuDropdown.vue` přidej `openAbout` do `defineEmits`:

```ts
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'editProfile'): void;
  (e: 'openRules'): void;
  (e: 'openAbout'): void;
}>()
```

Tlačítko "O aplikaci" (řádek 63) — změň z `@click="navigate('/about')"` na:

```html
<button @click="emit('openAbout'); emit('close')"
  class="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
  {{ t('nav.about') }}
</button>
```

**Step 2: Zapoj modal v AppHeader**

Import (za import RulesModal):
```ts
import AboutModal from './AboutModal.vue'
```

Za `const showRulesModal = ref(false)` přidej:
```ts
const showAboutModal = ref(false)
```

V template — za `@open-rules="showRulesModal = true"` přidej:
```html
@open-about="showAboutModal = true"
```

Za `<RulesModal v-if="showRulesModal" @close="showRulesModal = false" />` přidej:
```html
<AboutModal v-if="showAboutModal" @close="showAboutModal = false" />
```

**Step 3: Ověř v prohlížeči**

- Spusť `npm run dev:frontend`
- Klikni na avatar → "O aplikaci"
- Modal se zobrazí s verzí a datem buildu
- Klik mimo nebo X zavře modal

**Step 4: Commit**

```bash
git add packages/frontend/src/components/AboutModal.vue \
        packages/frontend/src/components/AppHeader.vue \
        packages/frontend/src/components/AppMenuDropdown.vue
git commit -m "feat: add AboutModal with version and build date"
```

---

### Task 4: Release skript

**Files:**
- Create: `scripts/release.mjs`
- Modify: `package.json` (root)

**Step 1: Vytvoř `scripts/release.mjs`**

```js
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))

const current = JSON.parse(readFileSync('package.json', 'utf-8')).version
console.log(`\nAktuální verze: ${current}\n`)

const type = (await ask('Typ releasu [patch / minor / major]: ')).trim()
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Neplatný typ. Zadej patch, minor nebo major.')
  process.exit(1)
}

// npm version bumpe package.json, vytvoří commit a git tag
execSync(`npm version ${type} --no-workspaces-update`, { stdio: 'inherit' })

const push = (await ask('\nPushnout na remote? [y/n]: ')).trim()
if (push === 'y') {
  execSync('git push && git push --tags', { stdio: 'inherit' })
  console.log('\nHotovo! Tag i commits jsou na remote.')
} else {
  console.log('\nHotovo! Nezapomeň pushnout: git push && git push --tags')
}

rl.close()
```

**Step 2: Přidej script do root `package.json`**

Aktuální `scripts` blok:
```json
"scripts": {
  "dev:backend": "...",
  "dev:frontend": "...",
  "build": "..."
}
```

Přidej `"release"`:
```json
"release": "node scripts/release.mjs"
```

**Step 3: Ověř skript**

```bash
node scripts/release.mjs
```

Zadej `patch` a **odmítni push** (`n`). Ověř:
- `package.json` má novou verzi (např. `1.0.1`)
- `git log --oneline -2` zobrazí commit `v1.0.1`
- `git tag` zobrazí tag `v1.0.1`

Poté vrať verzi zpět pro teď (nebo nechej — záleží na tobě).

**Step 4: Commit**

```bash
git add scripts/release.mjs package.json
git commit -m "feat: add release script (patch/minor/major bump + git tag)"
```
