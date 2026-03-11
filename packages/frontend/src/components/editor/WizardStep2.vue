<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useEditorStore } from '../../stores/editorStore';
import CardBrowser from './CardBrowser.vue';
import type { EditorCard } from '@kpl/shared';

const props = defineProps<{ setId: number; replicateSetId: number | null }>();
const emit = defineEmits<{ done: [] }>();

const editorStore = useEditorStore();
const selectedBlack = ref<Set<number>>(new Set());
const selectedWhite = ref<Set<number>>(new Set());
const activeType = ref<'black' | 'white'>('black');
const saving = ref(false);

onMounted(async () => {
  // Pokud replikace, načti karty zdrojové sady a předvyber
  if (props.replicateSetId) {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
    // Načti všechny black karty zdrojové sady
    let page = 1, total = Infinity;
    while (selectedBlack.value.size < total) {
      const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=black&setId=${props.replicateSetId}&page=${page}`, { credentials: 'include' });
      if (!res.ok) break;
      const data = await res.json();
      total = data.total;
      data.cards.forEach((c: EditorCard) => selectedBlack.value.add(c.id));
      if (data.cards.length < 50) break;
      page++;
    }
    page = 1; total = Infinity;
    while (selectedWhite.value.size < total) {
      const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=white&setId=${props.replicateSetId}&page=${page}`, { credentials: 'include' });
      if (!res.ok) break;
      const data = await res.json();
      total = data.total;
      data.cards.forEach((c: EditorCard) => selectedWhite.value.add(c.id));
      if (data.cards.length < 50) break;
      page++;
    }
  }
});

async function toggle(card: EditorCard, selected: boolean) {
  const set = card.type === 'black' ? selectedBlack : selectedWhite;
  if (selected) {
    set.value.add(card.id);
    await editorStore.addCardToSet(props.setId, card.type, card.id);
  } else {
    set.value.delete(card.id);
    await editorStore.removeCardFromSet(props.setId, card.type, card.id);
  }
}
</script>

<template>
  <div>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Vyber karty, které budou součástí sady. Změny se ukládají průběžně.</p>
    <div class="text-xs text-zinc-400 mb-3 flex gap-4">
      <span>{{ selectedBlack.size }} černých vybráno</span>
      <span>{{ selectedWhite.size }} bílých vybráno</span>
    </div>
    <CardBrowser
      :set-id="setId"
      :selected-card-ids="activeType === 'black' ? selectedBlack : selectedWhite"
      :card-type="activeType"
      :initial-filter-set-id="replicateSetId"
      @toggle="toggle"
    />
    <div class="flex justify-end mt-6">
      <button @click="emit('done')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 transition">
        Pokračovat &rarr;
      </button>
    </div>
  </div>
</template>
