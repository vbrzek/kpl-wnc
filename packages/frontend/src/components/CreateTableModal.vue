<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  close: [];
  create: [settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    nickname: string;
  }];
}>();

const name = ref('');
const isPublic = ref(true);
const maxPlayers = ref(8);
const nickname = ref('');

function submit() {
  if (!name.value.trim() || !nickname.value.trim()) return;
  emit('create', {
    name: name.value.trim(),
    isPublic: isPublic.value,
    selectedSetIds: [],
    maxPlayers: maxPlayers.value,
    nickname: nickname.value.trim(),
  });
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-md space-y-4">
      <h2 class="text-xl font-bold">Vytvořit nový stůl</h2>

      <label class="block">
        <span class="text-sm text-gray-300">Název stolu</span>
        <input
          v-model="name"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
          placeholder="Můj stůl"
        />
      </label>

      <label class="block">
        <span class="text-sm text-gray-300">Tvoje přezdívka</span>
        <input
          v-model="nickname"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
          placeholder="Přezdívka"
        />
      </label>

      <label class="block">
        <span class="text-sm text-gray-300">Max. hráčů</span>
        <input
          v-model.number="maxPlayers"
          type="number"
          min="3"
          max="20"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
        />
      </label>

      <label class="flex items-center gap-2">
        <input v-model="isPublic" type="checkbox" class="w-4 h-4" />
        <span class="text-sm text-gray-300">Veřejný stůl (zobrazí se v seznamu)</span>
      </label>

      <p class="text-xs text-gray-400">
        Výběr sad karet bude dostupný po implementaci REST API.
      </p>

      <div class="flex gap-3 pt-2">
        <button
          @click="submit"
          class="bg-green-600 hover:bg-green-500 px-5 py-2 rounded font-semibold flex-1"
        >
          Vytvořit
        </button>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white px-4 py-2">
          Zrušit
        </button>
      </div>
    </div>
  </div>
</template>
