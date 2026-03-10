# Roadmap

- [x] Monorepo setup — npm workspaces, TypeScript, Fastify server, Vue 3 + Tailwind v4
- [x] Lobby — Socket.io místnosti, správa hráčů, AFK, reconnect, host přenos
- [x] REST API — GET /api/card-sets + seed data (česká sada)
- [x] Výběr sad karet při vytváření stolu (CreateTableModal)
- [x] Hra — stavový stroj (rozdávání, hraní, vyhodnocení)
- [x] VPS deploy — Apache proxy + PM2
- [x] Správa místnosti hostem (vyhodnocení hry, změna režimu a pod.)
- [x] Globální profil hráče — nickname + DiceBear avatar + locale (localStorage, bez OAuth)
- [x] Vícejazyčná verze — 5 jazyků (cs, en, ru, uk, es), překlad karet přes REST
- [x] Finální vzhled (layout, design)
- [x] Perzistence stavu her — rozehrané hry přežijí restart serveru (SIGTERM snapshot + client reload)
- [x] Možnost aktivace rozšířených pravidel
- [x] Volba cíle hry (počet bodů, počet kol, čas)
- [x] Profily hráčů — OAuth (Google, Discord) + JWT cookie + propojení účtů
- [ ] CRUD pro správu sad a karet (admin) a sdílení sad karet s ostatními hráči
- [ ] Friendship management
- [ ] Dlouhodobé statistiky a achievementy
