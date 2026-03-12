<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import { useProfileStore } from '../stores/profileStore';
import CardBrowser from '../components/editor/CardBrowser.vue';
import WizardStep3 from '../components/editor/WizardStep3.vue';
import type { EditorCard } from '@kpl/shared';

const route = useRoute();
const router = useRouter();
const editorStore = useEditorStore();
const profileStore = useProfileStore();
const setId = Number(route.params.id);
const isCardMaster = computed(() => profileStore.oauthUser?.role === 'card-master');
const selectedBlack = ref<Set<number>>(new Set());
const selectedWhite = ref<Set<number>>(new Set());
const editing = ref(false);
const nameInput = ref('');
const descInput = ref('');
const publicInput = ref(false);
const activeTab = ref<'cards' | 'add'>('cards');

onMounted(async () => {
  await editorStore.fetchSet(setId);
  if (editorStore.currentSet) {
    nameInput.value = editorStore.currentSet.name;
    descInput.value = editorStore.currentSet.description ?? '';
    publicInput.value = editorStore.currentSet.isPublic;
  }
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
  // Načti aktuální membership pro black
  let page = 1;
  while (true) {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=black&setId=${setId}&page=${page}`, { credentials: 'include' });
    if (!res.ok) break;
    const data = await res.json();
    data.cards.forEach((c: EditorCard) => selectedBlack.value.add(c.id));
    if (data.cards.length < 15) break;
    page++;
  }
  page = 1;
  while (true) {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=white&setId=${setId}&page=${page}`, { credentials: 'include' });
    if (!res.ok) break;
    const data = await res.json();
    data.cards.forEach((c: EditorCard) => selectedWhite.value.add(c.id));
    if (data.cards.length < 15) break;
    page++;
  }
});

function openEdit() {
  if (!editorStore.currentSet) return;
  nameInput.value = editorStore.currentSet.name;
  descInput.value = editorStore.currentSet.description ?? '';
  publicInput.value = editorStore.currentSet.isPublic;
  editing.value = true;
}

async function saveEdit() {
  const updates: Record<string, unknown> = {};
  const trimmedName = nameInput.value.trim();
  const trimmedDesc = descInput.value.trim();
  if (trimmedName && trimmedName !== editorStore.currentSet?.name) updates.name = trimmedName;
  if (trimmedDesc !== (editorStore.currentSet?.description ?? '')) updates.description = trimmedDesc || null;
  if (isCardMaster.value && publicInput.value !== editorStore.currentSet?.isPublic) updates.isPublic = publicInput.value;
  if (Object.keys(updates).length > 0) await editorStore.updateSet(setId, updates);
  editing.value = false;
}

async function toggle(card: EditorCard, selected: boolean) {
  const set = card.type === 'black' ? selectedBlack : selectedWhite;
  if (selected) { set.value.add(card.id); await editorStore.addCardToSet(setId, card.type, card.id); }
  else { set.value.delete(card.id); await editorStore.removeCardFromSet(setId, card.type, card.id); }
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div>
      <button @click="router.push('/editor')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4">&larr; Moje sady</button>

      <div v-if="editorStore.currentSet" class="mb-6">
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">{{ editorStore.currentSet.name }}</h1>
          <span v-if="editorStore.currentSet.isPublic" class="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full">Veřejná</span>
          <button @click="openEdit" class="text-zinc-400 hover:text-zinc-600 text-sm">Upravit</button>
        </div>
        <p v-if="editorStore.currentSet.description" class="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{{ editorStore.currentSet.description }}</p>
        <p class="text-sm text-zinc-400 mt-1">{{ editorStore.currentSet.blackCount }} černých · {{ editorStore.currentSet.whiteCount }} bílých</p>
      </div>

      <div class="flex gap-1 mb-4 bg-zinc-200 dark:bg-zinc-900 rounded-xl p-1 w-fit">
        <button @click="activeTab = 'cards'" :class="activeTab === 'cards' ? 'bg-indigo-600 text-white shadow font-bold' : 'text-zinc-500 dark:text-zinc-400'" class="px-4 py-1.5 rounded-lg text-sm transition">Vybrat karty</button>
        <button @click="activeTab = 'add'" :class="activeTab === 'add' ? 'bg-indigo-600 text-white shadow font-bold' : 'text-zinc-500 dark:text-zinc-400'" class="px-4 py-1.5 rounded-lg text-sm transition">Přidat nové</button>
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
      <div v-if="editing" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-md w-full flex flex-col gap-4">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Upravit sadu</h2>
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Název</label>
            <input v-model="nameInput" maxlength="64" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Popis</label>
            <textarea v-model="descInput" maxlength="255" rows="2" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Volitelný popis sady" />
          </div>
          <div v-if="isCardMaster" class="flex items-center gap-3">
            <button @click="publicInput = !publicInput" :class="publicInput ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600'" class="relative w-10 h-6 rounded-full transition-colors">
              <span :class="publicInput ? 'translate-x-[18px]' : 'translate-x-0.5'" class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
            </button>
            <span class="text-sm text-zinc-700 dark:text-zinc-300">{{ publicInput ? 'Veřejná sada' : 'Soukromá sada' }}</span>
          </div>
          <div class="flex gap-3">
            <button @click="editing = false" class="flex-1 bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-500 transition">Zrušit</button>
            <button @click="saveEdit" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition">Uložit</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
