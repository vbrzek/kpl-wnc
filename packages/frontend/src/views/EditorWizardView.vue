<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import WizardStep1 from '../components/editor/WizardStep1.vue';
import WizardStep2 from '../components/editor/WizardStep2.vue';
import WizardStep3 from '../components/editor/WizardStep3.vue';

const router = useRouter();
const editorStore = useEditorStore();
const step = ref(1);
const setId = ref<number | null>(null);
const replicateSetId = ref<number | null>(null);

async function onStep1(data: { name: string; description: string; isPublic: boolean; replicateSetId: number | null }) {
  const set = await editorStore.createSet({ name: data.name, description: data.description || undefined, isPublic: data.isPublic });
  if (!set) return;
  setId.value = set.id;
  replicateSetId.value = data.replicateSetId;
  step.value = 2;
}

function onStep2Done() { step.value = 3; }
function onFinish() { router.push('/editor'); }
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div>
      <div class="mb-6">
        <button @click="router.push('/editor')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-2">&larr; Zpět</button>
        <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">Nová sada karet</h1>
        <div class="flex gap-2 mt-3">
          <div v-for="n in 3" :key="n" :class="step >= n ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'" class="h-1.5 flex-1 rounded-full transition-colors" />
        </div>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
          Krok {{ step }} ze 3 &mdash;
          <span v-if="step === 1">Základní informace</span>
          <span v-else-if="step === 2">Výběr karet</span>
          <span v-else>Přidání nových karet</span>
        </p>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6">
        <WizardStep1 v-if="step === 1" @submit="onStep1" />
        <WizardStep2 v-else-if="step === 2 && setId" :set-id="setId" :replicate-set-id="replicateSetId" @done="onStep2Done" />
        <WizardStep3 v-else-if="step === 3 && setId" :set-id="setId" @finish="onFinish" />
      </div>
    </div>
  </div>
</template>
