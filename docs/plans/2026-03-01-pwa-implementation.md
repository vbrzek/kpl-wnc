# PWA podpora — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Přidat PWA podporu — instalovatelnost, caching statických assetů a offline stránku.

**Architecture:** `vite-plugin-pwa` generuje Web App Manifest + Workbox Service Worker automaticky z konfigurace ve `vite.config.ts`. `@vite-pwa/assets-generator` vytvoří PNG ikony z existujícího `card.svg`. Offline stránka je čistá statická HTML bez závislosti na Vue bundlu.

**Tech Stack:** vite-plugin-pwa 0.21+, @vite-pwa/assets-generator, Workbox (generateSW mode)

---

### Task 1: Instalace závislostí

**Files:**
- Modify: `packages/frontend/package.json`

**Step 1: Nainstaluj devDependencies**

```bash
npm install -D vite-plugin-pwa @vite-pwa/assets-generator --workspace=packages/frontend
```

Expected output: přidány záznamy do `packages/frontend/package.json` devDependencies, `package-lock.json` aktualizován.

**Step 2: Ověř instalaci**

```bash
ls node_modules/vite-plugin-pwa node_modules/@vite-pwa/assets-generator
```

Expected: oba adresáře existují.

**Step 3: Commit**

```bash
git add packages/frontend/package.json package-lock.json
git commit -m "chore: install vite-plugin-pwa and assets-generator"
```

---

### Task 2: Konfigurace generátoru ikon

**Files:**
- Create: `packages/frontend/pwa-assets.config.ts`

**Step 1: Vytvoř konfigurační soubor**

```typescript
// packages/frontend/pwa-assets.config.ts
import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: 'minimal-2023',
  images: ['public/card.svg'],
})
```

`minimal-2023` preset generuje: favicon.ico, favicon.svg, apple-touch-icon-180x180.png, pwa-192x192.png, pwa-512x512.png, maskable-icon-512x512.png.

**Step 2: Spusť generátor ikon**

```bash
cd packages/frontend && npx pwa-assets-generator --config pwa-assets.config.ts
```

Expected: v `packages/frontend/public/` přibyly soubory:
- `favicon.ico`
- `favicon.svg`
- `apple-touch-icon-180x180.png`
- `pwa-192x192.png`
- `pwa-512x512.png`
- `maskable-icon-512x512.png`

**Step 3: Ověř vygenerované soubory**

```bash
ls -lh packages/frontend/public/*.png packages/frontend/public/favicon.*
```

Expected: všechny soubory existují a mají nenulovou velikost.

**Step 4: Commit**

```bash
git add packages/frontend/pwa-assets.config.ts packages/frontend/public/
git commit -m "feat: add PWA icon assets generated from card.svg"
```

---

### Task 3: Vytvoření offline stránky

**Files:**
- Create: `packages/frontend/public/offline.html`

**Step 1: Vytvoř offline.html**

```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Offline — Karty proti lidskosti</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: #0f0f0f;
        color: #ffffff;
        font-family: system-ui, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100dvh;
        gap: 1.5rem;
        text-align: center;
        padding: 2rem;
      }
      svg { width: 80px; height: 80px; }
      h1 { font-size: 1.5rem; font-weight: 700; }
      p { color: #9ca3af; font-size: 1rem; max-width: 280px; line-height: 1.5; }
      button {
        margin-top: 0.5rem;
        padding: 0.75rem 2rem;
        background: #ffffff;
        color: #0f0f0f;
        border: none;
        border-radius: 0.5rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover { background: #e5e7eb; }
    </style>
  </head>
  <body>
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="5" fill="#0f0f0f" stroke="#ffffff" stroke-width="1.5"/>
      <text x="16" y="23" text-anchor="middle" fill="white" font-size="20" font-family="serif">♠</text>
    </svg>
    <h1>Jsi offline</h1>
    <p>Karty proti lidskosti vyžadují připojení k internetu.</p>
    <button onclick="location.reload()">Zkusit znovu</button>
  </body>
</html>
```

**Step 2: Commit**

```bash
git add packages/frontend/public/offline.html
git commit -m "feat: add PWA offline fallback page"
```

---

### Task 4: Konfigurace VitePWA pluginu

**Files:**
- Modify: `packages/frontend/vite.config.ts`

**Step 1: Aktualizuj vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Karty proti lidskosti',
        short_name: 'KPL',
        description: 'Online karetní party hra.',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cachuj statické assety (JS, CSS, obrázky, zvuky)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,ogg,woff,woff2}'],
        // Navigační requesty: NetworkFirst s fallbackem na offline.html
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [
          /^\/api\//,       // REST API — vždy na server
          /^\/socket\.io/,  // Socket.io — vždy na server
          /^\/health/,      // Health check
        ],
        runtimeCaching: [
          {
            // Statické assety z CDN (DiceBear avatary)
            urlPattern: /^https:\/\/api\.dicebear\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dicebear-avatars',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dní
              },
            },
          },
        ],
      },
    }),
  ],
  envDir: '../../',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
```

**Step 2: Ověř build**

```bash
npm run build --workspace=packages/frontend
```

Expected: build proběhne bez chyb. Ve výstupu by měly být zmínky o `sw.js` a `manifest.webmanifest`.

**Step 3: Ověř vygenerované soubory**

```bash
ls packages/frontend/dist/
```

Expected: soubory `sw.js`, `workbox-*.js`, `manifest.webmanifest` existují v `dist/`.

**Step 4: Commit**

```bash
git add packages/frontend/vite.config.ts
git commit -m "feat: configure VitePWA plugin with Workbox caching and offline fallback"
```

---

### Task 5: Aktualizace index.html

**Files:**
- Modify: `packages/frontend/index.html`

`vite-plugin-pwa` automaticky injektuje do `index.html` odkaz na manifest a Service Worker registraci při buildu. Potřebujeme ale aktualizovat existující manuální Apple meta tagy a přidat apple-touch-icon.

**Step 1: Uprav index.html**

Nahraď sekci v `<head>`:

```html
<!-- starý obsah: -->
<link rel="icon" type="image/svg+xml" href="/card.svg" />
<meta name="theme-color" content="#101828" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
<meta name="apple-mobile-web-app-title" content="KPL" />
```

```html
<!-- nový obsah: -->
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
<meta name="theme-color" content="#0f0f0f" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="KPL" />
```

**Step 2: Ověř build**

```bash
npm run build --workspace=packages/frontend
```

Expected: build bez chyb.

**Step 3: Commit**

```bash
git add packages/frontend/index.html
git commit -m "feat: update index.html with PWA icons and apple meta tags"
```

---

### Task 6: Ruční ověření v prohlížeči

**Step 1: Spusť preview build**

```bash
npm run preview --workspace=packages/frontend
```

Otevři `http://localhost:4173` v Chrome.

**Step 2: Zkontroluj Chrome DevTools**

- DevTools → Application → Manifest → manifest se načte bez chyb, ikony jsou viditelné
- DevTools → Application → Service Workers → SW je `activated and running`
- DevTools → Application → Storage → Cache Storage → soubory jsou v cache

**Step 3: Ověř offline fallback**

- DevTools → Network → zaškrtni "Offline"
- Reload stránky → měla by se zobrazit `/offline.html` stránka (ne browser chybová stránka)

**Step 4: Ověř Lighthouse PWA audit (volitelné)**

- DevTools → Lighthouse → zaškrtni "Progressive Web App" → Generate report
- Expected: "PWA" badge zelený

---
