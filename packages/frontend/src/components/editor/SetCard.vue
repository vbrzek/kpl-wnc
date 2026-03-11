<script setup lang="ts">
import type { UserCardSet } from '@kpl/shared';

const props = defineProps<{ set: UserCardSet; isCardMaster?: boolean }>();
const emit = defineEmits<{ edit: [id: number]; delete: [id: number] }>();
</script>

<template>
  <div class="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 flex flex-col gap-2">
    <div class="flex items-start justify-between gap-2">
      <h3 class="font-semibold text-zinc-900 dark:text-white truncate">{{ set.name }}</h3>
      <span v-if="set.isPublic" class="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full shrink-0">Veřejná</span>
    </div>
    <p v-if="set.description" class="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">{{ set.description }}</p>
    <div class="text-xs text-zinc-400 dark:text-zinc-500 flex gap-3">
      <span>{{ set.blackCount }} černých</span>
      <span>{{ set.whiteCount }} bílých</span>
    </div>
    <p v-if="!set.isOwn && set.ownerNickname" class="text-xs text-zinc-400 dark:text-zinc-500">od {{ set.ownerNickname }}</p>
    <div v-if="set.isOwn || isCardMaster" class="flex gap-2 mt-1">
      <button @click="emit('edit', set.id)" class="flex-1 text-sm bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 rounded-lg px-3 py-1.5 transition">
        Upravit
      </button>
      <button @click="emit('delete', set.id)" class="text-sm bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg px-3 py-1.5 transition">
        Smazat
      </button>
    </div>
  </div>
</template>
