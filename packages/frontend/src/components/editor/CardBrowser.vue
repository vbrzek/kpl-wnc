<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useEditorStore } from '../../stores/editorStore';
import CardFilterBar from './CardFilterBar.vue';
import type { EditorCard } from '@kpl/shared';

const props = defineProps<{
  setId: number;
  selectedCardIds: Set<number>;
  cardType: 'black' | 'white';
  initialFilterSetId?: number | null;
}>();

const emit = defineEmits<{
  toggle: [card: EditorCard, selected: boolean];
}>();

const editorStore = useEditorStore();
const type = ref<'black' | 'white'>(props.cardType);
const search = ref('');
const filterSetId = ref<number | null>(props.initialFilterSetId ?? null);

async function load() {
  await editorStore.fetchCards({ type: type.value, search: search.value, setId: filterSetId.value ?? undefined, page: editorStore.cardsPage });
}

watch([type, search, filterSetId], () => { editorStore.cardsPage = 1; load(); });
onMounted(load);

function changePage(p: number) {
  editorStore.cardsPage = p;
  load();
}
</script>

<template>
  <div>
    <CardFilterBar
      v-model:type="type"
      v-model:search="search"
      v-model:filterSetId="filterSetId"
    />
    <div class="text-xs text-zinc-400 mb-2">
      {{ editorStore.cardsTotal }} karet celkem · strana {{ editorStore.cardsPage }}
    </div>
    <div class="flex flex-col gap-1 max-h-96 overflow-y-auto pr-1">
      <label
        v-for="card in editorStore.cards"
        :key="card.id"
        class="flex items-start gap-3 p-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700/50 cursor-pointer"
      >
        <input
          type="checkbox"
          :checked="selectedCardIds.has(card.id)"
          @change="emit('toggle', card, ($event.target as HTMLInputElement).checked)"
          class="mt-0.5 accent-indigo-600 shrink-0"
        />
        <span class="text-sm text-zinc-800 dark:text-zinc-200">
          {{ card.text }}
          <span v-if="card.type === 'black' && card.pick === 2" class="ml-1 text-xs text-zinc-400">(pick 2)</span>
        </span>
      </label>
    </div>
    <div v-if="editorStore.cardsTotal > 50" class="flex justify-between items-center mt-3">
      <button @click="changePage(editorStore.cardsPage - 1)" :disabled="editorStore.cardsPage <= 1" class="text-sm px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-700 disabled:opacity-40">&larr; Předchozí</button>
      <span class="text-xs text-zinc-400">{{ editorStore.cardsPage }} / {{ Math.ceil(editorStore.cardsTotal / 50) }}</span>
      <button @click="changePage(editorStore.cardsPage + 1)" :disabled="editorStore.cardsPage >= Math.ceil(editorStore.cardsTotal / 50)" class="text-sm px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-700 disabled:opacity-40">Další &rarr;</button>
    </div>
  </div>
</template>
