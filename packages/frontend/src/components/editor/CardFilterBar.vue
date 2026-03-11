<script setup lang="ts">
import { ref, watch } from 'vue';
import { useLobbyStore } from '../../stores/lobbyStore';

const props = defineProps<{
  type: 'black' | 'white';
  search: string;
  filterSetId: number | null;
}>();

const emit = defineEmits<{
  'update:type': [v: 'black' | 'white'];
  'update:search': [v: string];
  'update:filterSetId': [v: number | null];
}>();

const lobbyStore = useLobbyStore();
if (lobbyStore.cardSets.length === 0) lobbyStore.fetchCardSets();

let searchTimeout: ReturnType<typeof setTimeout>;
function onSearch(e: Event) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => emit('update:search', (e.target as HTMLInputElement).value), 300);
}
</script>

<template>
  <div class="flex flex-wrap gap-2 mb-4">
    <div class="flex rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-600">
      <button @click="emit('update:type', 'black')" :class="type === 'black' ? 'bg-zinc-900 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'" class="px-4 py-2 text-sm font-medium transition">
        Černé
      </button>
      <button @click="emit('update:type', 'white')" :class="type === 'white' ? 'bg-white text-zinc-900 border-l' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'" class="px-4 py-2 text-sm font-medium transition border-l border-zinc-300 dark:border-zinc-600">
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
      @change="emit('update:filterSetId', ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
      class="rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">Všechny sady</option>
      <option v-for="s in lobbyStore.cardSets" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
  </div>
</template>
