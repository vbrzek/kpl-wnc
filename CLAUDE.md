# 🃏 Project: Cards Against Humanity Clone (Technical Blueprint)

Tento dokument slouží jako hlavní specifikace pro vývoj vlastní online verze hry Karty proti lidskosti.

## 🏗️ 1. Architektura systému

Projekt je postaven na odděleném Frontendu a Backend u s důrazem na real-time komunikaci a snadný budoucí export do mobilní aplikace.

* **Frontend:** Vue.js 3 (Composition API) + Tailwind CSS + Pinia.
* **Backend:** Node.js (Express nebo Fastify) + Socket.io.
* **Databáze:** MySQL (MariaDB).
* **Infrastruktura:** Linux VPS + Apache (Reverse Proxy s WebSocket tunelováním) + PM2 (správa procesů).

---

## 🛠️ 2. Databázové Schéma (SQL)

Využíváme přístup "duplikace přiřazení", kde každá karta patří právě jedné sadě pro maximální jednoduchost správy a nezávislost uživatelských setů.



```sql
-- Tabulka sad (balíčků)
CREATE TABLE card_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    slug VARCHAR(50) UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Černé karty (Otázky / Zadání)
CREATE TABLE black_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    card_set_id INT NOT NULL,
    text TEXT NOT NULL, -- Obsahuje placeholder "____"
    pick TINYINT DEFAULT 1, -- Počet bílých karet k doložení
    FOREIGN KEY (card_set_id) REFERENCES card_sets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bílé karty (Odpovědi)
CREATE TABLE white_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    card_set_id INT NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (card_set_id) REFERENCES card_sets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 🔄 3. Synchronizace dat (Migrations)
Pro udržení shodné struktury mezi vývojem a produkcí se používá Knex.js nebo db-migrate.

 1. Změna v DB: Vytvoříš migrační soubor přes CLI.
 2. Aplikace: Spustíš migraci na VPS po každém git pull.
 3. Environment: Databázové údaje uloženy v .env (mimo Git).

## 🌐 4. Infrastruktura & Proxy (Apache)
Node.js aplikace běží interně na portu 3000. Apache zajišťuje veřejný přístup a SSL.

**Konfigurační požadavek pro Apache:**
Musí být povoleny moduly proxy, proxy_http, proxy_wstunnel a rewrite. WebSocket provoz na /socket.io/ musí být směrován na ws://localhost:3000/.

## 🎮 5. Herní Logika (Server-side State)
Server si drží stav běžících her v operační paměti (objekt rooms). To umožňuje real-time interakci bez latence databáze.

Herní stavy (Statusy):
 * LOBBY: Čekání na hráče, výběr balíčků karet.
 * SELECTION: Hráči vybírají bílé karty z ruky.
 * JUDGING: Card Czar (car) anonymně vybírá vítěze kola.
 * RESULTS: Zobrazení vítěze, přičtení bodů, automatický přechod na nové kolo.

## 📱 6. Mobilní Appka (Budoucnost)
Export do mobilní aplikace bude realizován pomocí Capacitor.js.
 * Frontend se sestaví jako SPA (Single Page Application).
 * Capacitor vytvoří nativní bridge pro Android a iOS.
 * Komunikace se serverem zůstává přes WebSockets.

## 🚀 7. První kroky (Roadmap)
Infrastruktura: Nastavení Apache Proxy a PM2 na VPS.

 1. Karty: Implementace REST API pro CRUD operace nad balíčky (vkládání/editace karet).
 2. Lobby: Socket.io místnosti a správa připojených uživatelů.
 3. Hra: Implementace stavového stroje (rozdávání, hraní, vyhodnocení).