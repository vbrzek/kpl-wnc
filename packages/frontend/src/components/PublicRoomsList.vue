<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PublicRoomSummary } from '@kpl/shared';

defineProps<{ rooms: PublicRoomSummary[] }>();
const emit = defineEmits<{ join: [code: string] }>();

const { t } = useI18n();
</script>

<template>
  <section>
    <h2 class="text-xl font-semibold mb-4">{{ t('publicRooms.title') }}</h2>
    <p v-if="rooms.length === 0" class="text-gray-400">{{ t('publicRooms.noRooms') }}</p>
    <ul class="space-y-2">
      <li
        v-for="room in rooms"
        :key="room.code"
        class="flex items-center justify-between bg-gray-800 px-4 py-3 rounded-lg"
      >
        <span>
          {{ room.name }}
          <span class="text-gray-400 text-sm ml-1">({{ room.playerCount }}/{{ room.maxPlayers }})</span>
        </span>
        <button
          @click="emit('join', room.code)"
          class="bg-indigo-600 hover:bg-indigo-500 px-4 py-1 rounded"
        >
          {{ t('publicRooms.joinTable') }}
        </button>
      </li>
    </ul>
  </section>
</template>
