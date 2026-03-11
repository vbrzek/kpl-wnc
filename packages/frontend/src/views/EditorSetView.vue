<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import CardBrowser from '../components/editor/CardBrowser.vue';
import WizardStep3 from '../components/editor/WizardStep3.vue';
import type { EditorCard } from '@kpl/shared';

const route = useRoute();
const router = useRouter();
const editorStore = useEditorStore();
const setId = Number(route.params.id);
const selectedBlack = ref<Set<number>>(new Set());
const selectedWhite = ref<Set<number>>(new Set());
const editingName = ref(false);
const nameInput = ref('');
const activeTab = ref<'cards' | 'add'>('cards');

onMounted(async () => {
  await editorStore.fetchSet(setId);
  if (editorStore.currentSet) nameInput.value = editorStore.currentSet.name;
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
  // Načti aktuální membership pro black
  let page = 1;
  while (true) {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=black&setId=${setId}&page=${page}`, { credentials: 'include' });
    if (!res.ok) break;
    const data = await res.json();
    data.cards.forEach((c: EditorCard) => selectedBlack.value.add(c.id));
    if (data.cards.length < 50) break;
    page++;
  }
  page = 1;
  while (true) {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=white&setId=${setId}&page=${page}`, { credentials: 'include' });
    if (!res.ok) break;
    const data = await res.json();
    data.cards.forEach((c: EditorCard) => selectedWhite.value.add(c.id));
    if (data.cards.length < 50) break;
    page++;
  }
});

async function saveName() {
  if (nameInput.value.trim()) {
    await editorStore.updateSet(setId, { name: nameInput.value.trim() });
  }
  editingName.value = false;
}

async function toggle(card: EditorCard, selected: boolean) {
  const set = card.type === 'black' ? selectedBlack : selectedWhite;
  if (selected) { set.value.add(card.id); await editorStore.addCardToSet(setId, card.type, card.id); }
  else { set.value.delete(card.id); await editorStore.removeCardFromSet(setId, card.type, card.id); }
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div class="max-w-2xl mx-auto">
      <button @click="router.push('/editor')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4">&larr; Moje sady</button>

      <div v-if="editorStore.currentSet" class="mb-6">
        <div class="flex items-center gap-2" v-if="!editingName">
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">{{ editorStore.currentSet.name }}</h1>
          <button @click="editingName = true; nameInput = editorStore.currentSet!.name" class="text-zinc-400 hover:text-zinc-600 text-sm">Upravit</button>
        </div>
        <div v-else class="flex gap-2">
          <input v-model="nameInput" maxlength="64" class="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" @keyup.enter="saveName" @keyup.escape="editingName = false" />
          <button @click="saveName" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Uložit</button>
        </div>
        <p class="text-sm text-zinc-400 mt-1">{{ editorStore.currentSet.blackCount }} černých · {{ editorStore.currentSet.whiteCount }} bílých</p>
      </div>

      <div class="flex gap-1 mb-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 w-fit">
        <button @click="activeTab = 'cards'" :class="activeTab === 'cards' ? 'bg-white dark:bg-zinc-700 shadow' : ''" class="px-4 py-1.5 rounded-lg text-sm font-medium transition">Vybrat karty</button>
        <button @click="activeTab = 'add'" :class="activeTab === 'add' ? 'bg-white dark:bg-zinc-700 shadow' : ''" class="px-4 py-1.5 rounded-lg text-sm font-medium transition">Přidat nové</button>
      </div>

      <div class="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5">
        <CardBrowser v-if="activeTab === 'cards'"
          :set-id="setId"
          :selected-card-ids="selectedBlack"
          card-type="black"
          @toggle="toggle"
        />
        <WizardStep3 v-else :set-id="setId" @finish="router.push('/editor')" />
      </div>
    </div>
  </div>
</template>
