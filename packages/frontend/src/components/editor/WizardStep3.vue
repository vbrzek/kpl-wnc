<script setup lang="ts">
import { ref } from 'vue';
import { useEditorStore } from '../../stores/editorStore';
import type { EditorCard } from '@kpl/shared';

const props = defineProps<{ setId: number }>();
const emit = defineEmits<{ finish: [] }>();

const editorStore = useEditorStore();
const type = ref<'black' | 'white'>('white');
const text = ref('');
const pick = ref(1);
const showTranslations = ref(false);
const translations = ref({ en: '', ru: '', uk: '', es: '' });
const addedCards = ref<EditorCard[]>([]);
const error = ref('');
const saving = ref(false);

async function addCard() {
  if (!text.value.trim()) { error.value = 'Text karty je povinný.'; return; }
  saving.value = true;
  error.value = '';
  const trans = Object.fromEntries(
    Object.entries(translations.value).filter(([, v]) => v.trim())
  ) as Record<string, string>;
  const card = await editorStore.createCard({
    type: type.value, text: text.value.trim(),
    pick: type.value === 'black' ? pick.value : undefined,
    setId: props.setId,
    translations: Object.keys(trans).length > 0 ? trans : undefined,
  });
  saving.value = false;
  if (!card) { error.value = 'Nepodařilo se přidat kartu.'; return; }
  addedCards.value.unshift(card);
  text.value = '';
  pick.value = 1;
  translations.value = { en: '', ru: '', uk: '', es: '' };
  showTranslations.value = false;
}

async function removeAdded(card: EditorCard) {
  await editorStore.removeCardFromSet(props.setId, card.type, card.id);
  addedCards.value = addedCards.value.filter((c) => c.id !== card.id);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-zinc-500 dark:text-zinc-400">Přidej nové karty do sady. Tuto část můžeš přeskočit &mdash; karty lze přidávat i později.</p>

    <div class="flex rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-600 w-fit">
      <button @click="type = 'white'" :class="type === 'white' ? 'bg-zinc-100 dark:bg-zinc-600 font-semibold' : 'bg-white dark:bg-zinc-800'" class="px-4 py-2 text-sm transition">Bílá</button>
      <button @click="type = 'black'" :class="type === 'black' ? 'bg-zinc-900 text-white font-semibold' : 'bg-white dark:bg-zinc-800 dark:text-zinc-300'" class="px-4 py-2 text-sm transition border-l border-zinc-300 dark:border-zinc-600">Černá</button>
    </div>

    <textarea v-model="text" :placeholder="type === 'black' ? 'Text otázky (použij ____ pro doplnění)' : 'Text karty'" rows="3" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />

    <div v-if="type === 'black'" class="flex items-center gap-3">
      <span class="text-sm text-zinc-600 dark:text-zinc-400">Počet karet k výběru:</span>
      <select v-model="pick" class="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm">
        <option :value="1">1</option>
        <option :value="2">2</option>
      </select>
    </div>

    <div>
      <button @click="showTranslations = !showTranslations" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
        {{ showTranslations ? 'Skrýt překlady' : 'Přidat překlady (volitelné)' }}
      </button>
      <div v-if="showTranslations" class="grid grid-cols-2 gap-3 mt-2">
        <div v-for="lang in ['en', 'ru', 'uk', 'es']" :key="lang">
          <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-1 block">{{ lang }}</label>
          <textarea v-model="translations[lang as keyof typeof translations]" rows="2" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

    <button @click="addCard" :disabled="saving" class="bg-zinc-800 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl px-4 py-2.5 transition disabled:opacity-60">
      {{ saving ? 'Ukládám...' : '+ Přidat kartu' }}
    </button>

    <div v-if="addedCards.length > 0" class="border-t border-zinc-200 dark:border-zinc-700 pt-4">
      <p class="text-xs text-zinc-400 mb-2">Přidáno v této session ({{ addedCards.length }})</p>
      <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
        <div v-for="card in addedCards" :key="card.id" class="flex items-center justify-between gap-2 text-sm bg-zinc-50 dark:bg-zinc-700/50 rounded-xl px-3 py-2">
          <span :class="card.type === 'black' ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'">
            {{ card.text }}
          </span>
          <button @click="removeAdded(card)" class="text-red-400 hover:text-red-600 text-xs shrink-0">Smazat</button>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700 mt-2">
      <span class="text-sm text-zinc-400">Karty lze přidávat i po dokončení průvodce.</span>
      <button @click="emit('finish')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 transition">
        Dokončit
      </button>
    </div>
  </div>
</template>
