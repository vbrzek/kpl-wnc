<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import { useProfileStore } from '../stores/profileStore';
import SetCard from '../components/editor/SetCard.vue';
import ToggleSwitch from '../components/ui/ToggleSwitch.vue';

const router = useRouter();
const editorStore = useEditorStore();
const profileStore = useProfileStore();
const confirmDeleteId = ref<number | null>(null);
const showAll = ref(false);
const isCardMaster = computed(() => profileStore.oauthUser?.role === 'card-master');

onMounted(() => editorStore.fetchMySets());

watch(showAll, (val) => {
  editorStore.fetchMySets(val ? 'all' : 'mine');
});

async function handleDelete(id: number) {
  if (confirmDeleteId.value !== id) { confirmDeleteId.value = id; return; }
  await editorStore.deleteSet(id);
  confirmDeleteId.value = null;
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div>
      <div class="flex items-center justify-between mb-6">
        <button @click="router.push('/')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">&larr; Zpět</button>
        <button v-if="isCardMaster" @click="router.push('/editor/cards')" class="bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 font-semibold rounded-xl px-4 py-2 hover:bg-zinc-300 dark:hover:bg-zinc-500 transition">
          Správa karet
        </button>
        <button @click="router.push('/editor/new')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-2 transition">
          + Nová sada
        </button>
      </div>

      <div v-if="editorStore.loading" class="text-center py-12 text-zinc-400">Načítám...</div>

      <template v-else>
        <!-- 1) Moje sady karet -->
        <section class="mb-10">
          <h2 class="text-xl font-bold text-zinc-900 dark:text-white mb-4">Moje sady karet</h2>
          <div v-if="editorStore.ownSets.length === 0" class="text-center py-8 text-zinc-400 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <p class="mb-3">Zatím nemáš žádné vlastní sady karet.</p>
            <button @click="router.push('/editor/new')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 transition">
              Vytvořit první sadu
            </button>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SetCard
              v-for="set in editorStore.ownSets"
              :key="set.id"
              :set="set"
              :is-card-master="isCardMaster"
              @edit="router.push(`/editor/${$event}`)"
              @delete="handleDelete"
            />
          </div>
        </section>

        <!-- 2) Další sady karet -->
        <section>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-zinc-900 dark:text-white">Další sady karet</h2>
            <label v-if="isCardMaster" class="flex items-center gap-2 cursor-pointer">
              <ToggleSwitch v-model="showAll" />
              <span class="text-xs text-zinc-500 dark:text-zinc-400">Všichni hráči</span>
            </label>
          </div>
          <div v-if="editorStore.otherSets.length === 0" class="text-center py-8 text-zinc-400 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <p>Žádné další sady k zobrazení.</p>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SetCard
              v-for="set in editorStore.otherSets"
              :key="set.id"
              :set="set"
              :is-card-master="isCardMaster"
              @edit="router.push(`/editor/${$event}`)"
              @delete="handleDelete"
            />
          </div>
        </section>
      </template>

      <div v-if="confirmDeleteId !== null" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-sm w-full">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Smazat sadu?</h2>
          <p class="text-zinc-500 dark:text-zinc-400 text-sm mb-4">Tato akce je nevratná. Karty přidané do sady zůstanou v databázi.</p>
          <div class="flex gap-3">
            <button @click="confirmDeleteId = null" class="flex-1 bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-500 transition">Zrušit</button>
            <button @click="handleDelete(confirmDeleteId!)" class="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition">Smazat</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
