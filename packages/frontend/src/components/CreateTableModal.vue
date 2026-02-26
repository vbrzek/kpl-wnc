<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLobbyStore } from '../stores/lobbyStore';

const emit = defineEmits<{
  close: [];
  create: [settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
  }];
}>();

const { t } = useI18n();
const lobbyStore = useLobbyStore();

const name = ref('');
const isPublic = ref(true);
const maxPlayers = ref(8);
const selectedSetIds = ref<number[]>([]);
const fetchError = ref('');

const canSubmit = computed(() =>
  name.value.trim() !== '' &&
  selectedSetIds.value.length > 0
);

function toggleSet(id: number) {
  const idx = selectedSetIds.value.indexOf(id);
  if (idx === -1) {
    selectedSetIds.value.push(id);
  } else {
    selectedSetIds.value.splice(idx, 1);
  }
}

function submit() {
  if (!canSubmit.value) return;
  emit('create', {
    name: name.value.trim(),
    isPublic: isPublic.value,
    selectedSetIds: selectedSetIds.value,
    maxPlayers: maxPlayers.value,
  });
}

onMounted(async () => {
  try {
    await lobbyStore.fetchCardSets();
  } catch {
    fetchError.value = t('createTable.fetchError');
  }
});
</script>

<template>
  <Teleport to="body">
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 text-white">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
      <h2 class="text-xl font-bold">{{ t('createTable.title') }}</h2>

      <label class="block">
        <span class="text-sm text-gray-300">{{ t('createTable.tableName') }}</span>
        <input
          v-model="name"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
          :placeholder="t('createTable.tableNamePlaceholder')"
        />
      </label>

      <label class="block">
        <span class="text-sm text-gray-300">{{ t('createTable.maxPlayers') }}</span>
        <input
          v-model.number="maxPlayers"
          type="number"
          min="3"
          max="20"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
        />
      </label>

      <div>
        <span class="text-sm text-gray-300">{{ t('createTable.cardSets') }}</span>
        <p v-if="fetchError" class="mt-1 text-sm text-red-400">{{ fetchError }}</p>
        <div
          v-else-if="!lobbyStore.cardSetsLoaded"
          class="mt-1 text-sm text-gray-500"
        >
          {{ t('createTable.loadingSets') }}
        </div>
        <div
          v-else-if="lobbyStore.cardSets.length === 0"
          class="mt-1 text-sm text-gray-500"
        >
          {{ t('createTable.noSets') }}
        </div>
        <div v-else class="mt-1 space-y-2">
          <label
            v-for="set in lobbyStore.cardSets"
            :key="set.id"
            class="flex items-start gap-3 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="selectedSetIds.includes(set.id)"
              @change="toggleSet(set.id)"
              class="w-4 h-4 mt-0.5 shrink-0"
            />
            <div>
              <span class="text-sm font-medium">{{ set.name }}</span>
              <span class="text-xs text-gray-400 ml-2">
                {{ set.blackCardCount }} ♠ / {{ set.whiteCardCount }} ♡
              </span>
              <p v-if="set.description" class="text-xs text-gray-500">{{ set.description }}</p>
            </div>
          </label>
        </div>
        <p v-if="!fetchError && lobbyStore.cardSets.length > 0 && selectedSetIds.length === 0" class="text-xs text-yellow-500 mt-1">
          {{ t('createTable.selectAtLeastOne') }}
        </p>
      </div>

      <label class="flex items-center gap-2">
        <input v-model="isPublic" type="checkbox" class="w-4 h-4" />
        <span class="text-sm text-gray-300">{{ t('createTable.publicTable') }}</span>
      </label>

      <div class="flex gap-3 pt-2">
        <button
          @click="submit"
          :disabled="!canSubmit"
          class="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded font-semibold flex-1"
        >
          {{ t('common.create') }}
        </button>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white px-4 py-2">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
