<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import SetCard from '../components/editor/SetCard.vue';

const router = useRouter();
const editorStore = useEditorStore();
const confirmDeleteId = ref<number | null>(null);

onMounted(() => editorStore.fetchMySets());

async function handleDelete(id: number) {
  if (confirmDeleteId.value !== id) { confirmDeleteId.value = id; return; }
  await editorStore.deleteSet(id);
  confirmDeleteId.value = null;
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <button @click="router.push('/')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-1">&larr; Zpět</button>
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">Moje sady karet</h1>
        </div>
        <button @click="router.push('/editor/new')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-2 transition">
          + Nová sada
        </button>
      </div>

      <div v-if="editorStore.loading" class="text-center py-12 text-zinc-400">Načítám...</div>
      <div v-else-if="editorStore.mySets.length === 0" class="text-center py-12 text-zinc-400">
        <p class="text-lg mb-4">Zatím nemáš žádné vlastní sady karet.</p>
        <button @click="router.push('/editor/new')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 transition">
          Vytvořit první sadu
        </button>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SetCard
          v-for="set in editorStore.mySets"
          :key="set.id"
          :set="set"
          @edit="router.push(`/editor/${$event}`)"
          @delete="handleDelete"
        />
      </div>

      <div v-if="confirmDeleteId !== null" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-sm w-full">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Smazat sadu?</h2>
          <p class="text-zinc-500 dark:text-zinc-400 text-sm mb-4">Tato akce je nevratná. Karty přidané do sady zůstanou v databázi.</p>
          <div class="flex gap-3">
            <button @click="confirmDeleteId = null" class="flex-1 bg-zinc-100 dark:bg-zinc-700 rounded-xl px-4 py-2 text-sm font-medium">Zrušit</button>
            <button @click="handleDelete(confirmDeleteId!)" class="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition">Smazat</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
