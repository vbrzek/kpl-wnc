<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import { useLobbyStore } from '../stores/lobbyStore';
import type { EditorCard } from '@kpl/shared';

const router = useRouter();
const editorStore = useEditorStore();
const lobbyStore = useLobbyStore();

const type = ref<'black' | 'white'>('black');
const search = ref('');
const filterSetId = ref<number | null>(null);
const untranslated = ref(false);
const unassigned = ref(false);
let searchTimeout: ReturnType<typeof setTimeout>;

// Modal state
const modalCard = ref<any | null>(null);
const modalText = ref('');
const modalPick = ref(1);
const modalTranslations = ref<Record<string, string>>({});
const modalSaving = ref(false);
const confirmDelete = ref(false);

onMounted(() => {
  if (lobbyStore.cardSets.length === 0) lobbyStore.fetchCardSets();
  load();
});

async function load() {
  await editorStore.fetchCards({
    type: type.value, search: search.value, setId: filterSetId.value ?? undefined,
    untranslated: untranslated.value || undefined, unassigned: unassigned.value || undefined,
    page: editorStore.cardsPage,
  });
}

watch([type, filterSetId, untranslated, unassigned], () => { editorStore.cardsPage = 1; load(); });

function onSearch(e: Event) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { search.value = (e.target as HTMLInputElement).value; editorStore.cardsPage = 1; load(); }, 300);
}

function changePage(p: number) {
  editorStore.cardsPage = p;
  load();
}

async function openCard(card: EditorCard) {
  confirmDelete.value = false;
  const detail = await editorStore.fetchCardDetail(card.type, card.id);
  if (!detail) return;
  modalCard.value = detail;
  modalText.value = detail.text;
  modalPick.value = detail.pick ?? 1;
  modalTranslations.value = { en: '', ru: '', uk: '', es: '', ...detail.translations };
}

async function saveCard() {
  if (!modalCard.value) return;
  modalSaving.value = true;
  const translations: Record<string, string> = {};
  for (const lang of ['en', 'ru', 'uk', 'es']) {
    const val = modalTranslations.value[lang]?.trim() ?? '';
    const orig = modalCard.value.translations[lang] ?? '';
    if (val !== orig) translations[lang] = val;
  }
  const data: Record<string, unknown> = {};
  if (modalText.value.trim() !== modalCard.value.text) data.text = modalText.value.trim();
  if (modalCard.value.type === 'black' && modalPick.value !== modalCard.value.pick) data.pick = modalPick.value;
  if (Object.keys(translations).length > 0) data.translations = translations;
  if (Object.keys(data).length > 0) {
    await editorStore.updateCard(modalCard.value.type, modalCard.value.id, data as any);
    await load();
  }
  modalCard.value = null;
  modalSaving.value = false;
}

async function handleDelete() {
  if (!confirmDelete.value) { confirmDelete.value = true; return; }
  if (!modalCard.value) return;
  modalSaving.value = true;
  await editorStore.deleteCard(modalCard.value.type, modalCard.value.id);
  modalCard.value = null;
  modalSaving.value = false;
  confirmDelete.value = false;
  await load();
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <button @click="router.push('/editor')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-1">&larr; Zpět</button>
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">Správa karet</h1>
        </div>
      </div>

      <!-- Filtry -->
      <div class="flex flex-wrap gap-2 mb-4">
        <div class="flex rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-600">
          <button @click="type = 'black'" :class="type === 'black' ? 'bg-zinc-900 text-yellow-400 font-bold' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'" class="px-4 py-2 text-sm transition">
            Černé
          </button>
          <button @click="type = 'white'" :class="type === 'white' ? 'bg-white text-zinc-900 font-bold' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'" class="px-4 py-2 text-sm transition border-l border-zinc-300 dark:border-zinc-600">
            Bílé
          </button>
        </div>
        <input
          :value="search"
          @input="onSearch"
          type="search"
          placeholder="Hledat kartu..."
          class="flex-1 min-w-[160px] rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          :value="filterSetId ?? ''"
          @change="filterSetId = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null"
          class="rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Všechny sady</option>
          <option v-for="s in lobbyStore.cardSets" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        <button @click="untranslated = !untranslated"
          :class="untranslated ? 'bg-amber-600 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'"
          class="px-3 py-1.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-600 transition">
          Nepřeložené
        </button>
        <button @click="unassigned = !unassigned"
          :class="unassigned ? 'bg-amber-600 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'"
          class="px-3 py-1.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-600 transition">
          Nezařazené
        </button>
      </div>

      <div class="text-xs text-zinc-400 mb-2">
        {{ editorStore.cardsTotal }} karet celkem &middot; strana {{ editorStore.cardsPage }}
      </div>

      <!-- Seznam karet -->
      <div class="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5">
        <div class="flex flex-col gap-1">
          <button
            v-for="card in editorStore.cards"
            :key="card.id"
            @click="openCard(card)"
            class="flex items-start gap-3 p-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700/50 cursor-pointer text-left w-full"
          >
            <span class="text-xs text-zinc-400 shrink-0 mt-0.5">#{{ card.id }}</span>
            <span class="text-sm text-zinc-800 dark:text-zinc-200">
              {{ card.text }}
              <span v-if="card.type === 'black' && card.pick && card.pick > 1" class="ml-1 text-xs text-zinc-400">(pick {{ card.pick }})</span>
            </span>
          </button>
        </div>
        <div v-if="editorStore.cards.length === 0" class="text-center py-8 text-zinc-400">
          Žádné karty odpovídající filtru.
        </div>
        <div v-if="editorStore.cardsTotal > 15" class="flex justify-between items-center mt-3">
          <button @click="changePage(editorStore.cardsPage - 1)" :disabled="editorStore.cardsPage <= 1" class="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-30 disabled:hover:bg-indigo-600 transition">&larr; Předchozí</button>
          <span class="text-xs text-zinc-400">{{ editorStore.cardsPage }} / {{ Math.ceil(editorStore.cardsTotal / 15) }}</span>
          <button @click="changePage(editorStore.cardsPage + 1)" :disabled="editorStore.cardsPage >= Math.ceil(editorStore.cardsTotal / 15)" class="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-30 disabled:hover:bg-indigo-600 transition">Další &rarr;</button>
        </div>
      </div>

      <!-- Modal detail karty -->
      <div v-if="modalCard" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-lg w-full flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ modalCard.type === 'black' ? 'Černá' : 'Bílá' }} karta #{{ modalCard.id }}
          </h2>

          <!-- Text -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Text (cs)</label>
            <textarea v-model="modalText" rows="2" maxlength="500" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          <!-- Pick (jen pro černé) -->
          <div v-if="modalCard.type === 'black'">
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Počet karet k výběru</label>
            <div class="flex gap-2">
              <button v-for="n in 4" :key="n" @click="modalPick = n"
                :class="modalPick === n ? 'bg-indigo-600 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'"
                class="w-10 h-10 rounded-lg text-sm transition">{{ n }}</button>
            </div>
          </div>

          <!-- Překlady -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Překlady</label>
            <div class="flex flex-col gap-2">
              <div v-for="lang in ['en', 'ru', 'uk', 'es']" :key="lang" class="flex gap-2 items-center">
                <span class="text-xs text-zinc-400 w-6 shrink-0 uppercase">{{ lang }}</span>
                <input v-model="modalTranslations[lang]" maxlength="500" class="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" :placeholder="`Překlad (${lang})`" />
              </div>
            </div>
          </div>

          <!-- Sady -->
          <div v-if="modalCard.sets && modalCard.sets.length > 0">
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">V sadách</label>
            <div class="flex flex-wrap gap-1">
              <span v-for="s in modalCard.sets" :key="s.id" class="text-xs bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-2 py-1 rounded-lg">{{ s.name }}</span>
            </div>
          </div>
          <div v-else>
            <p class="text-xs text-zinc-400">Karta není v žádné sadě.</p>
          </div>

          <div class="flex gap-3">
            <button @click="modalCard = null" class="flex-1 bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-500 transition">Zrušit</button>
            <button v-if="modalCard.sets && modalCard.sets.length === 0" @click="handleDelete" :disabled="modalSaving"
              class="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50">
              {{ confirmDelete ? 'Opravdu smazat?' : 'Smazat' }}
            </button>
            <button @click="saveCard" :disabled="modalSaving" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50">Uložit</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
