# PWA podpora — Design

**Datum:** 2026-03-01
**Cíl:** Instalovatelnost + caching statických assetů + offline stránka

---

## Nástroje

- `vite-plugin-pwa` (devDependency) — generuje manifest + Service Worker přes Workbox
- `@vite-pwa/assets-generator` (devDependency) — generuje PNG ikony z `card.svg`

## Web App Manifest

```json
{
  "name": "Karty proti lidskosti",
  "short_name": "KPL",
  "theme_color": "#0f0f0f",
  "background_color": "#0f0f0f",
  "display": "standalone",
  "start_url": "/"
}
```

Ikony: 192×192, 512×512 + maskable varianty, generované z `public/card.svg`.

## Service Worker strategie (Workbox generateSW)

| Typ requestu | Strategie | Poznámka |
|---|---|---|
| Statické assety (JS, CSS, obrázky, zvuky) | `CacheFirst` | Hashované názvy, bezpečné cachovat |
| HTML navigace | `NetworkFirst` | Fallback na `/offline.html` |
| `/api/*` | Bez caching | Vždy na server |
| Socket.io | Bez caching | Vždy na server |

## Offline stránka

Statická `/offline.html` (bez závislosti na Vue bundlu):
- Černé pozadí (`#0f0f0f`), bílý text
- Inline `card.svg` ikona
- Zpráva: "Jsi offline — Karty proti lidskosti vyžadují připojení."
- Tlačítko "Zkusit znovu" → `location.reload()`

## Soubory ke změně / vytvoření

1. `packages/frontend/package.json` — přidat devDependencies
2. `packages/frontend/vite.config.ts` — přidat VitePWA plugin
3. `packages/frontend/pwa-assets.config.ts` — konfigurace generátoru ikon
4. `packages/frontend/public/offline.html` — offline stránka
5. Vygenerované ikony v `packages/frontend/public/`
