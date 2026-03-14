# Navigation Dropdown & Homepage Footer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add avatar dropdown menu with navigation links + homepage-only footer with license/attribution info.

**Architecture:** Avatar dropdown in `AppHeader.vue` (new `AppMenuDropdown.vue` component); footer added directly to `HomeView.vue`. New placeholder views for `/rules`, `/about`, `/friends` registered in the router.

**Tech Stack:** Vue 3 Composition API, Vue Router, vue-i18n, Tailwind v4

---

## Task 1: i18n keys

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Add `nav` section to cs.json**

Find the closing `}` and add before it:

```json
  "nav": {
    "myProfile": "Můj profil",
    "cardEditor": "Editor karet",
    "friends": "Přátelé",
    "rules": "Pravidla",
    "about": "O aplikaci"
  },
  "footer": {
    "madeBy": "s ❤️ vyrobil",
    "basedOn": "podle původní hry",
    "sourceCode": "Zdrojový kód",
    "license": "Vydáno pod licencí CC BY-NC-SA 4.0 — komerční využití není povoleno.",
    "terms": "Podmínky použití",
    "privacy": "Ochrana soukromí"
  }
```

**Step 2: Add same keys to en.json** (English values):

```json
  "nav": {
    "myProfile": "My Profile",
    "cardEditor": "Card Editor",
    "friends": "Friends",
    "rules": "Rules",
    "about": "About"
  },
  "footer": {
    "madeBy": "made with ❤️ by",
    "basedOn": "based on the original game",
    "sourceCode": "Source Code",
    "license": "Released under CC BY-NC-SA 4.0 — commercial use is not permitted.",
    "terms": "Terms of Service",
    "privacy": "Privacy Policy"
  }
```

**Step 3: Add same keys to ru.json, uk.json, es.json** (copy cs.json values as placeholder — translators can update later).

**Step 4: Commit**

```bash
git add packages/frontend/src/i18n/
git commit -m "feat: add nav and footer i18n keys"
```

---

## Task 2: Placeholder views for /rules, /about, /friends

**Files:**
- Create: `packages/frontend/src/views/RulesView.vue`
- Create: `packages/frontend/src/views/AboutView.vue`
- Create: `packages/frontend/src/views/FriendsView.vue`

**Step 1: Create RulesView.vue** (standalone public page, same pattern as PrivacyView.vue):

```vue
<script setup lang="ts">
// Standalone page — no profile required
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <div class="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <div>
        <a href="/" class="text-slate-400 hover:text-white text-sm transition-colors">← Zpět na hru</a>
      </div>
      <h1 class="text-3xl font-black uppercase tracking-tighter">Pravidla</h1>
      <p class="text-slate-400">Obsah pravidel bude doplněn.</p>
    </div>
  </div>
</template>
```

**Step 2: Create AboutView.vue** (standalone public page):

```vue
<script setup lang="ts">
// Standalone page — no profile required
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <div class="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <div>
        <a href="/" class="text-slate-400 hover:text-white text-sm transition-colors">← Zpět na hru</a>
      </div>
      <h1 class="text-3xl font-black uppercase tracking-tighter">O aplikaci</h1>
      <p class="text-slate-400">Obsah bude doplněn.</p>
    </div>
  </div>
</template>
```

**Step 3: Create FriendsView.vue** (requires auth, inside GameLayout):

```vue
<script setup lang="ts">
// Future: friends list, invitations
</script>

<template>
  <div class="pt-8 pb-12">
    <h1 class="text-2xl font-black uppercase tracking-tighter mb-6">Přátelé</h1>
    <p class="text-slate-400">Sekce přátel bude brzy k dispozici.</p>
  </div>
</template>
```

**Step 4: Register routes in router/index.ts**

Add these routes to the `routes` array (after existing `/terms-of-service`):

```ts
{
  path: '/rules',
  component: () => import('../views/RulesView.vue'),
  meta: { public: true },
},
{
  path: '/about',
  component: () => import('../views/AboutView.vue'),
  meta: { public: true },
},
{
  path: '/friends',
  component: () => import('../views/FriendsView.vue'),
  meta: { requiresAuth: true },
},
```

**Step 5: Commit**

```bash
git add packages/frontend/src/views/RulesView.vue packages/frontend/src/views/AboutView.vue packages/frontend/src/views/FriendsView.vue packages/frontend/src/router/index.ts
git commit -m "feat: add placeholder views for rules, about, friends + routes"
```

---

## Task 3: Avatar dropdown menu component

**Files:**
- Create: `packages/frontend/src/components/AppMenuDropdown.vue`

**Step 1: Create AppMenuDropdown.vue**

This component renders the dropdown panel. Parent controls `open` state.

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useProfileStore } from '../stores/profileStore';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'editProfile'): void;
}>();

const router = useRouter();
const profileStore = useProfileStore();
const { t } = useI18n();

function navigate(path: string) {
  emit('close');
  router.push(path);
}
</script>

<template>
  <div class="absolute right-0 top-full mt-2 w-52 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
    <!-- Player name -->
    <div class="px-4 py-3 border-b border-white/10">
      <p class="text-xs text-gray-500 uppercase tracking-widest font-bold">{{ profileStore.nickname }}</p>
    </div>

    <!-- Primary nav (player-related) -->
    <div class="py-1">
      <button @click="emit('editProfile'); emit('close')"
        class="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors">
        {{ t('nav.myProfile') }}
      </button>
      <button @click="navigate('/editor')"
        class="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors">
        {{ t('nav.cardEditor') }}
      </button>
      <button @click="navigate('/friends')"
        class="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors">
        {{ t('nav.friends') }}
      </button>
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Secondary nav -->
    <div class="py-1">
      <button @click="navigate('/rules')"
        class="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
        {{ t('nav.rules') }}
      </button>
      <button @click="navigate('/about')"
        class="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
        {{ t('nav.about') }}
      </button>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/AppMenuDropdown.vue
git commit -m "feat: add AppMenuDropdown component"
```

---

## Task 4: Wire dropdown into AppHeader.vue

**Files:**
- Modify: `packages/frontend/src/components/AppHeader.vue`

**Step 1: Update AppHeader.vue**

Replace the entire file content:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { useProfileStore } from '../stores/profileStore';
import PlayerAvatar from './PlayerAvatar.vue';
import AppMenuDropdown from './AppMenuDropdown.vue';

const emit = defineEmits<{
  (e: 'editProfile'): void;
}>();

const { t } = useI18n();
const roomStore = useRoomStore();
const profileStore = useProfileStore();

const isInRoom = computed(() => roomStore.room !== null);
const isInGame = computed(() => roomStore.room !== null && roomStore.room.status !== 'LOBBY');
const myScore = computed(() => roomStore.me?.score ?? 0);

const menuOpen = ref(false);

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function onEditProfile() {
  closeMenu();
  emit('editProfile');
}
</script>

<template>
  <header class="fixed top-0 inset-x-0 bg-gray-900/80 backdrop-blur-xl border-b border-white/5 z-50"
          style="padding-top: env(safe-area-inset-top, 0px)">
    <div class="h-16 max-w-6xl mx-auto px-6 flex items-center justify-between">

      <div class="flex flex-col">
        <h1 class="text-lg md:text-xl font-black text-white uppercase tracking-tighter leading-none">
          {{ t('home.title') }}
        </h1>
        <span v-if="isInRoom" class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mt-1">
          {{ t('header.table') }}: {{ roomStore.room!.name }}
        </span>
      </div>

      <div class="flex items-center gap-2 md:gap-4">
        <div v-if="isInGame" class="flex items-center gap-1.5 md:gap-2 bg-white/5 px-2.5 py-1.5 md:px-3 rounded-full border border-white/10">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
          </svg>
          <span class="hidden md:inline text-xs font-bold text-gray-400 uppercase">
            {{ t('header.score') }}:
          </span>
          <span class="text-sm font-black text-yellow-500 leading-none">
            {{ myScore }}
          </span>
        </div>

        <!-- Avatar + dropdown -->
        <div class="relative">
          <button @click="toggleMenu" class="relative group">
            <div class="w-9 h-9 md:w-10 md:h-10 rounded-full bg-yellow-500 border-2 border-white/10 overflow-hidden hover:border-yellow-500 transition-all active:scale-90"
                 :class="{ 'border-yellow-500': menuOpen }">
              <PlayerAvatar :size="40" />
            </div>
            <span class="absolute -top-0.5 -right-0.5 w-3 h-3 md:w-3.5 md:h-3.5 bg-green-500 border-2 border-gray-900 rounded-full"></span>
          </button>

          <AppMenuDropdown
            v-if="menuOpen"
            @close="closeMenu"
            @edit-profile="onEditProfile"
          />

          <!-- Click-outside overlay -->
          <div v-if="menuOpen" class="fixed inset-0 z-40" @click="closeMenu"></div>
        </div>
      </div>
    </div>
  </header>
</template>
```

**Note:** The click-outside overlay (`fixed inset-0 z-40`) must appear BEFORE `AppMenuDropdown` in the DOM so the dropdown (`z-50`) renders above it.

**Step 2: Verify in browser** — click avatar, dropdown should open; click outside, it closes; each menu item navigates correctly.

**Step 3: Commit**

```bash
git add packages/frontend/src/components/AppHeader.vue
git commit -m "feat: wire avatar dropdown menu into AppHeader"
```

---

## Task 5: Homepage footer

**Files:**
- Modify: `packages/frontend/src/views/HomeView.vue`

**Step 1: Add footer at the bottom of the template**

Inside `<template>`, right before the final `</div>` (line 218), add:

```vue
    <!-- Footer -->
    <footer class="mt-12 pt-8 border-t border-white/5 text-center space-y-2">
      <p class="text-xs text-slate-500 leading-relaxed">
        {{ t('home.title') }}
        {{ t('footer.basedOn') }}
        <a href="https://www.cardsagainsthumanity.com/" target="_blank" rel="noopener noreferrer"
           class="text-slate-400 hover:text-white underline underline-offset-2 transition-colors">
          Cards Against Humanity
        </a>
        &nbsp;·&nbsp;
        {{ t('footer.madeBy') }}
        <a href="mailto:kpl@wnc.cz"
           class="text-slate-400 hover:text-white underline underline-offset-2 transition-colors">
          Wanaču
        </a>
      </p>
      <p class="text-xs text-slate-600">
        <RouterLink to="/terms-of-service" class="hover:text-slate-400 transition-colors">
          {{ t('footer.terms') }}
        </RouterLink>
        &nbsp;·&nbsp;
        <RouterLink to="/privacy" class="hover:text-slate-400 transition-colors">
          {{ t('footer.privacy') }}
        </RouterLink>
        &nbsp;·&nbsp;
        <a href="https://github.com/vbrzek/kpl-wnc/" target="_blank" rel="noopener noreferrer"
           class="hover:text-slate-400 transition-colors">
          {{ t('footer.sourceCode') }}
        </a>
      </p>
      <p class="text-xs text-slate-700">
        {{ t('footer.license') }}
      </p>
    </footer>
```

**Step 2: Add RouterLink import** — Vue Router's `RouterLink` is globally registered in Vue Router setups, no import needed.

**Step 3: Commit**

```bash
git add packages/frontend/src/views/HomeView.vue
git commit -m "feat: add footer to homepage with attribution and license"
```

---

## Done

Manual verification checklist:
- [ ] Avatar click opens dropdown
- [ ] Click outside closes dropdown
- [ ] "Můj profil" opens profile modal
- [ ] "Editor karet" navigates to `/editor` (if not authenticated, redirects to `/`)
- [ ] "Přátelé" navigates to `/friends`
- [ ] "Pravidla" navigates to `/rules`
- [ ] "O aplikaci" navigates to `/about`
- [ ] Footer visible on homepage
- [ ] Footer links work (terms, privacy, GitHub)
- [ ] Footer not visible on `/room/:token` or `/editor`
