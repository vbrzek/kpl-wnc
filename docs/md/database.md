# Databázové schéma

Karty jsou deduplikované — jedna karta může patřit do více sad (M:N přes junction tabulky). Každá karta může mít překlad do libovolného počtu jazyků. Výchozí jazyk: čeština.

**Statistiky:** 140 černých karet, 565 bílých karet (deduplikováno ze 2 sad).

```sql
CREATE TABLE card_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    slug VARCHAR(50) UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE black_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text TEXT NOT NULL,       -- Obsahuje placeholder "____"
    pick TINYINT DEFAULT 1    -- Počet bílých karet k doložení
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE white_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- M:N přiřazení karet k sadám
CREATE TABLE card_set_black_cards (
    card_set_id   INT UNSIGNED NOT NULL,
    black_card_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (card_set_id, black_card_id),
    FOREIGN KEY (card_set_id)   REFERENCES card_sets(id)  ON DELETE CASCADE,
    FOREIGN KEY (black_card_id) REFERENCES black_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE card_set_white_cards (
    card_set_id   INT UNSIGNED NOT NULL,
    white_card_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (card_set_id, white_card_id),
    FOREIGN KEY (card_set_id)   REFERENCES card_sets(id)  ON DELETE CASCADE,
    FOREIGN KEY (white_card_id) REFERENCES white_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Překlady karet (fallback na originál přes COALESCE v dotazu)
CREATE TABLE black_card_translations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    black_card_id INT UNSIGNED NOT NULL,
    language_code VARCHAR(5) NOT NULL,
    text TEXT NOT NULL,
    UNIQUE (black_card_id, language_code),
    FOREIGN KEY (black_card_id) REFERENCES black_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE white_card_translations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    white_card_id INT UNSIGNED NOT NULL,
    language_code VARCHAR(5) NOT NULL,
    text TEXT NOT NULL,
    UNIQUE (white_card_id, language_code),
    FOREIGN KEY (white_card_id) REFERENCES white_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- OAuth uživatelé
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(20) NOT NULL,          -- 'google' | 'discord'
    provider_id VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    nickname VARCHAR(50),                   -- app limituje na 24 znaků
    locale VARCHAR(5) DEFAULT 'cs',
    avatar_type ENUM('oauth', 'dicebear') DEFAULT 'oauth',
    avatar_url TEXT,
    dicebear_style VARCHAR(50),
    dicebear_seed VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_id),
    UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vazba OAuth user → player token (propojení se Socket.io session)
-- PK je kompozitní (player_token, room_code) — žádný surrogate id
CREATE TABLE user_player_tokens (
    user_id INT UNSIGNED NOT NULL,
    player_token VARCHAR(36) NOT NULL,
    room_code VARCHAR(6) NOT NULL,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_token, room_code),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
