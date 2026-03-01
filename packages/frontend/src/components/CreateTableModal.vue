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
    targetScore: number;
  }];
}>();

const { t } = useI18n();
const lobbyStore = useLobbyStore();

const name = ref('');
const isPublic = ref(true);
const maxPlayers = ref(8);
const targetScore = ref(10);
const TARGET_SCORE_OPTIONS = [8, 10, 15, 20, 30] as const;
const selectedSetId = ref<number | null>(null);
const fetchError = ref('');

const canSubmit = computed(() =>
  name.value.trim() !== '' &&
  selectedSetId.value !== null
);

function submit() {
  if (!canSubmit.value || selectedSetId.value === null) return;
  emit('create', {
    name: name.value.trim(),
    isPublic: isPublic.value,
    selectedSetIds: [selectedSetId.value],
    maxPlayers: maxPlayers.value,
    targetScore: targetScore.value,
  });
}

onMounted(async () => {
  try {
    await lobbyStore.fetchCardSets();
    if (lobbyStore.cardSets.length === 1) {
      selectedSetId.value = lobbyStore.cardSets[0].id;
    }
  } catch {
    fetchError.value = t('createTable.fetchError');
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="p-6 space-y-5">

          <!-- Header -->
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
              {{ t('createTable.title') }}
            </h2>
            <button @click="$emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Table name -->
          <div>
            <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
              {{ t('createTable.tableName') }}
            </label>
            <input
              v-model="name"
              class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-white/30 transition-colors"
              :placeholder="t('createTable.tableNamePlaceholder')"
              @keyup.enter="submit"
            />
          </div>

          <!-- Card sets -->
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
              {{ t('createTable.cardSets') }}
            </p>
            <p v-if="fetchError" class="text-sm text-red-400">{{ fetchError }}</p>
            <div v-else-if="!lobbyStore.cardSetsLoaded" class="text-sm text-slate-600">
              {{ t('createTable.loadingSets') }}
            </div>
            <div v-else-if="lobbyStore.cardSets.length === 0" class="text-sm text-slate-600">
              {{ t('createTable.noSets') }}
            </div>
            <div v-else class="space-y-2">
              <button
                v-for="set in lobbyStore.cardSets"
                :key="set.id"
                type="button"
                @click="selectedSetId = set.id"
                :class="[
                  'w-full text-left px-4 py-3 rounded-xl border transition-all',
                  selectedSetId === set.id
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/15 hover:text-slate-300',
                ]"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-bold">{{ set.name }}</span>
                  <span class="text-xs text-slate-500 shrink-0 ml-2">
                    {{ set.blackCardCount }} ♠ / {{ set.whiteCardCount }} ♡
                  </span>
                </div>
                <p v-if="set.description" class="text-xs text-slate-600 mt-0.5">{{ set.description }}</p>
              </button>
            </div>
            <p
              v-if="!fetchError && lobbyStore.cardSets.length > 0 && selectedSetId === null"
              class="text-xs text-yellow-500/70 mt-2"
            >
              {{ t('createTable.selectAtLeastOne') }}
            </p>
          </div>

          <!-- Max players + target score -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.maxPlayers') }}
              </label>
              <input
                v-model.number="maxPlayers"
                type="number"
                min="3"
                max="20"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.targetScore') }}
              </label>
              <select
                v-model.number="targetScore"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              >
                <option v-for="n in TARGET_SCORE_OPTIONS" :key="n" :value="n">
                  {{ n }} {{ t('createTable.points') }}
                </option>
              </select>
            </div>
          </div>

          <!-- Public toggle -->
          <label class="flex items-center gap-3 cursor-pointer">
            <input v-model="isPublic" type="checkbox" class="w-4 h-4 accent-white" />
            <span class="text-sm text-slate-400">{{ t('createTable.publicTable') }}</span>
          </label>

          <!-- Actions -->
          <div class="flex gap-3 pt-1">
            <button
              @click="$emit('close')"
              class="flex-1 py-3.5 bg-slate-800 border border-white/10 text-slate-300 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              @click="submit"
              :disabled="!canSubmit"
              class="flex-1 py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(60,60,60)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {{ t('common.create') }}
            </button>
          </div>

        </div>
      </div>
    </div>
  </Teleport>
</template>
