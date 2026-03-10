<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { BlackCard, AnonymousSubmission } from '@kpl/shared';
import BlackCardAtom from '../atoms/BlackCard.vue';

const props = defineProps<{
  blackCard: BlackCard;
  submissions: AnonymousSubmission[];
  mySubmissionId: string | null;
  myVotedId: string | null;
  votedCount: number;
  totalVoters: number;
  secondsLeft: number;
  revealedCount: number;
}>();

const emit = defineEmits<{
  vote: [submissionId: string];
  skipVoting: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col h-full min-h-0 pt-4">
    <div class="flex-none space-y-4 mb-6">
      <BlackCardAtom :text="blackCard.text" />
      <div class="flex items-center gap-3 px-1">
        <div class="h-[1px] flex-1 bg-yellow-500/20"></div>
        <p class="text-yellow-500 font-black uppercase text-[11px] tracking-widest italic">
          {{ t('specialRules.voting.title') }}
        </p>
        <div class="h-[1px] flex-1 bg-yellow-500/20"></div>
      </div>
      <p class="text-xs text-slate-500 text-center">
        {{ t('specialRules.voteProgress', { voted: votedCount, total: totalVoters }) }}
      </p>
    </div>

    <div class="flex-1 overflow-y-auto pb-12 custom-scrollbar">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-1">
        <div
          v-for="(sub, i) in submissions"
          :key="sub.submissionId"
          class="card-flip-scene"
        >
          <div
            class="card-flip-wrapper"
            :class="{ 'face-down': revealedCount <= i }"
          >
            <!-- Back face -->
            <div class="card-face card-back">
              <span class="text-3xl font-black text-white/10 tracking-widest">KPL</span>
            </div>

            <!-- Front face -->
            <div
              :class="[
                'card-face card-front flex flex-col gap-2 p-4 rounded-2xl text-left shadow-xl border-2 w-full',
                myVotedId === sub.submissionId
                  ? 'bg-white border-yellow-400'
                  : 'bg-white border-transparent',
              ]"
            >
              <div
                v-for="(card, cardIndex) in sub.cards"
                :key="card.id"
                :class="['relative pr-6', cardIndex > 0 ? 'mt-2 pt-2 border-t border-gray-100' : '']"
              >
                <span v-if="sub.cards.length > 1" class="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">
                  {{ cardIndex + 1 }}
                </span>
                <p class="text-gray-900 font-bold leading-snug">{{ card.text }}</p>
              </div>

              <!-- Vote button / status -->
              <div class="mt-2">
                <button
                  v-if="myVotedId === null && mySubmissionId !== sub.submissionId"
                  @click="emit('vote', sub.submissionId)"
                  class="w-full py-2 bg-yellow-400 text-black font-black text-xs uppercase tracking-widest rounded-lg hover:bg-yellow-300 transition-colors"
                >
                  {{ t('specialRules.voting.vote') }}
                </button>
                <p
                  v-else-if="myVotedId === sub.submissionId"
                  class="text-xs text-yellow-600 font-bold text-center py-2"
                >
                  {{ t('specialRules.yourVoteCast') }}
                </p>
                <p
                  v-else-if="mySubmissionId === sub.submissionId"
                  class="text-xs text-gray-400 text-center py-2"
                >
                  {{ t('specialRules.voting.yourCards') }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Skip voting button (after deadline) -->
    <div v-if="secondsLeft === 0 && myVotedId !== null" class="flex-none pt-4 px-1">
      <button
        @click="emit('skipVoting')"
        class="w-full py-3 bg-slate-700 text-white font-black text-sm uppercase tracking-widest rounded-xl hover:bg-slate-600 transition-colors"
      >
        {{ t('specialRules.skipVoting') }}
      </button>
    </div>
  </div>
</template>
