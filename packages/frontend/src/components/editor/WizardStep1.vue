<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useLobbyStore } from '../../stores/lobbyStore';

const emit = defineEmits<{
  submit: [data: { name: string; description: string; isPublic: boolean; replicateSetId: number | null }]
}>();

const lobbyStore = useLobbyStore();
const name = ref('');
const description = ref('');
const isPublic = ref(false);
const source = ref<'blank' | 'replicate'>('blank');
const replicateSetId = ref<number | null>(null);
const error = ref('');

onMounted(() => { if (lobbyStore.cardSets.length === 0) lobbyStore.fetchCardSets(); });

function submit() {
  if (!name.value.trim()) { error.value = 'Název sady je povinný.'; return; }
  emit('submit', { name: name.value.trim(), description: description.value.trim(), isPublic: isPublic.value, replicateSetId: source.value === 'replicate' ? replicateSetId.value : null });
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div>
      <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Název sady *</label>
      <input v-model="name" maxlength="64" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Např. Kancelářský humor" />
    </div>
    <div>
      <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Popis</label>
      <textarea v-model="description" maxlength="255" rows="2" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Volitelný popis sady" />
    </div>
    <div class="flex items-center gap-3">
      <button @click="isPublic = !isPublic" :class="isPublic ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600'" class="relative w-10 h-6 rounded-full transition-colors">
        <span :class="isPublic ? 'translate-x-4' : 'translate-x-0.5'" class="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
      </button>
      <span class="text-sm text-zinc-700 dark:text-zinc-300">{{ isPublic ? 'Veřejná sada (viditelná všem hráčům)' : 'Soukromá sada' }}</span>
    </div>
    <div>
      <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Výchozí karty</label>
      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" v-model="source" value="blank" class="accent-indigo-600" />
          <span class="text-sm text-zinc-700 dark:text-zinc-300">Začít s prázdnou sadou</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" v-model="source" value="replicate" class="accent-indigo-600" />
          <span class="text-sm text-zinc-700 dark:text-zinc-300">Replikovat existující sadu</span>
        </label>
      </div>
      <div v-if="source === 'replicate'" class="mt-2">
        <select v-model="replicateSetId" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option :value="null">&mdash; Vyber sadu &mdash;</option>
          <option v-for="s in lobbyStore.cardSets" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
    </div>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    <button @click="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-3 transition">
      Pokračovat &rarr;
    </button>
  </div>
</template>
