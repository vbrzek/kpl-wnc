<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GameRoom, SpecialRule, WinCondition } from '@kpl/shared';
import { useLobbyStore } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import SpecialRulesPanel from './SpecialRulesPanel.vue';

const props = defineProps<{ room: GameRoom }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();

// Pre-fill from current room
const name = ref(props.room.name);
const selectedSetId = ref<number | null>(props.room.selectedSetIds[0] ?? null);
const maxPlayers = ref(props.room.maxPlayers);
const winCondition = ref<WinCondition>(props.room.winCondition ?? 'score');
const targetScore = ref(props.room.targetScore ?? 10);
const targetRounds = ref(props.room.targetRounds ?? 20);
const gameTimeLimit = ref(props.room.gameTimeLimit ?? 15);
const selectedRules = ref<SpecialRule[]>([...props.room.specialRules]);
const step = ref<'main' | 'rules'>('main');
const saving = ref(false);
const errorMsg = ref('');
const fetchError = ref('');

const TARGET_SCORE_OPTIONS = [8, 10, 15, 20, 30] as const;

const isDesktop = () => window.innerWidth >= 768;

async function save() {
  if (!name.value.trim() || selectedSetId.value === null) return;
  saving.value = true;
  errorMsg.value = '';

  const err = await roomStore.updateSettings({
    name: name.value.trim(),
    selectedSetIds: [selectedSetId.value],
    maxPlayers: maxPlayers.value,
    specialRules: selectedRules.value,
    winCondition: winCondition.value,
    targetScore: targetScore.value,
    targetRounds: targetRounds.value,
    gameTimeLimit: gameTimeLimit.value,
  });

  saving.value = false;
  if (err) {
    errorMsg.value = err.error;
  } else {
    emit('close');
  }
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
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="$emit('close')"
    >
      <div :class="[
        'bg-[#0d1117] border border-white/10 rounded-2xl w-full max-h-[90vh] overflow-hidden',
        'flex flex-col md:flex-row md:max-w-4xl max-w-md',
      ]">

        <!-- Left column / step 1: main settings -->
        <div v-show="step === 'main' || isDesktop()" class="overflow-y-auto flex-1 min-h-0 md:border-r md:border-white/5">
          <div class="p-6 space-y-5">

            <!-- Header -->
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
                {{ t('roomSettings.title') }}
              </h2>
              <button @click="$emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p v-if="errorMsg" class="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">{{ errorMsg }}</p>

            <!-- Table name -->
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.tableName') }}
              </label>
              <input
                v-model="name"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-white/30 transition-colors"
                :placeholder="t('createTable.tableNamePlaceholder')"
              />
            </div>

            <!-- Card sets -->
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.cardSets') }}
              </p>
              <p v-if="fetchError" class="text-sm text-red-400">{{ fetchError }}</p>
              <div v-else-if="!lobbyStore.cardSetsLoaded" class="text-sm text-slate-600">{{ t('createTable.loadingSets') }}</div>
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
            </div>

            <!-- Max players -->
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.maxPlayers') }}
              </label>
              <input
                v-model.number="maxPlayers"
                type="number" min="3" max="20"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <!-- Win condition -->
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.winCondition') }}
              </label>
              <div class="flex gap-1 mb-3">
                <button
                  v-for="cond in (['score', 'time', 'rounds'] as WinCondition[])"
                  :key="cond"
                  type="button"
                  @click="winCondition = cond"
                  :class="[
                    'flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all border',
                    winCondition === cond
                      ? 'bg-white text-black border-white'
                      : 'bg-slate-900/60 text-slate-400 border-white/10 hover:border-white/20',
                  ]"
                >
                  {{ t(`createTable.win${cond.charAt(0).toUpperCase() + cond.slice(1)}`) }}
                </button>
              </div>
              <select
                v-if="winCondition === 'score'"
                v-model.number="targetScore"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              >
                <option v-for="n in TARGET_SCORE_OPTIONS" :key="n" :value="n">{{ n }} {{ t('createTable.points') }}</option>
              </select>
              <div v-else-if="winCondition === 'time'" class="space-y-2">
                <input v-model.number="gameTimeLimit" type="range" min="5" max="60" step="5" class="w-full accent-white" />
                <div class="flex justify-between text-xs text-slate-500">
                  <span>5 {{ t('createTable.minutes') }}</span>
                  <span class="text-white font-bold">{{ gameTimeLimit }} {{ t('createTable.minutes') }}</span>
                  <span>60 {{ t('createTable.minutes') }}</span>
                </div>
              </div>
              <input
                v-else-if="winCondition === 'rounds'"
                v-model.number="targetRounds"
                type="number" min="5" max="100"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <!-- House Rules button (mobile only) -->
            <button
              type="button"
              class="md:hidden w-full text-left px-4 py-3 bg-slate-900/40 border border-white/10 rounded-xl text-slate-300 text-sm font-bold flex items-center justify-between hover:border-white/20 transition-colors"
              @click="step = 'rules'"
            >
              <span>{{ t('specialRules.button') }}</span>
              <div class="flex items-center gap-2">
                <span v-if="selectedRules.length > 0" class="bg-yellow-400 text-black text-xs font-black px-2 py-0.5 rounded-full">
                  {{ selectedRules.length }}
                </span>
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <!-- Actions -->
            <div class="flex gap-3 pt-1">
              <button
                @click="$emit('close')"
                class="flex-1 py-3.5 bg-slate-800 border border-white/10 text-slate-300 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                @click="save"
                :disabled="saving || !name.trim() || selectedSetId === null"
                class="flex-1 py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(60,60,60)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {{ saving ? t('common.loading') : t('roomSettings.save') }}
              </button>
            </div>

          </div>
        </div>

        <!-- Right column / step 2: House Rules -->
        <div v-show="step === 'rules' || isDesktop()" class="overflow-y-auto flex-1 min-h-0">
          <div class="p-6">
            <div class="flex items-center gap-3 mb-4 md:hidden">
              <button @click="step = 'main'" class="text-slate-500 hover:text-white transition-colors p-1">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 class="text-sm font-black uppercase tracking-[0.15em] text-slate-400">{{ t('specialRules.button') }}</h3>
            </div>
            <h3 class="hidden md:block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">{{ t('specialRules.button') }}</h3>
            <SpecialRulesPanel v-model="selectedRules" />
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>
