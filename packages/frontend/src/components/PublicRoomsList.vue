<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PublicRoomSummary } from '@kpl/shared';

defineProps<{ rooms: PublicRoomSummary[] }>();
const emit = defineEmits<{ join: [code: string, nickname: string] }>();

const { t } = useI18n();
const nickname = ref('');
const joiningCode = ref<string | null>(null);

function startJoin(code: string) {
  joiningCode.value = code;
  nickname.value = '';
}

function confirmJoin() {
  if (!joiningCode.value || !nickname.value.trim()) return;
  emit('join', joiningCode.value, nickname.value.trim());
  joiningCode.value = null;
}
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
          @click="startJoin(room.code)"
          class="bg-indigo-600 hover:bg-indigo-500 px-4 py-1 rounded"
        >
          {{ t('publicRooms.joinTable') }}
        </button>
      </li>
    </ul>

    <div v-if="joiningCode" class="mt-4 flex gap-2">
      <input
        v-model="nickname"
        :placeholder="t('publicRooms.yourNickname')"
        class="bg-gray-700 px-3 py-2 rounded flex-1"
        @keyup.enter="confirmJoin"
        autofocus
      />
      <button @click="confirmJoin" class="bg-indigo-600 px-4 py-2 rounded">{{ t('publicRooms.confirm') }}</button>
      <button @click="joiningCode = null" class="text-gray-400 px-2">{{ t('common.cancel') }}</button>
    </div>
  </section>
</template>
