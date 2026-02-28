<script setup lang="ts">
import type { AnonymousSubmission } from '@kpl/shared'

defineProps<{
  submissions: AnonymousSubmission[]
  selectable: boolean
  revealedCount?: number   // how many submissions are face-up; defaults to all
}>()

const emit = defineEmits<{
  pick: [submissionId: string]
}>()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-1">
    <div
      v-for="(submission, index) in submissions"
      :key="submission.submissionId"
      class="card-flip-scene"
    >
      <div
        class="card-flip-wrapper"
        :class="{ 'face-down': (revealedCount ?? submissions.length) <= index }"
      >
        <!-- Back face -->
        <div class="card-face card-back">
          <span class="text-3xl font-black text-white/10 tracking-widest">KPL</span>
        </div>

        <!-- Front face -->
        <button
          @click="selectable && emit('pick', submission.submissionId)"
          :disabled="!selectable"
          :class="[
            'card-face card-front flex flex-col gap-2 p-4 rounded-2xl text-left transition-colors duration-200 shadow-xl border-2 w-full',
            selectable
              ? 'bg-white border-transparent hover:border-yellow-400 active:scale-[0.98] cursor-pointer'
              : 'bg-white/90 border-transparent cursor-default'
          ]"
        >
          <div
            v-for="(card, cardIndex) in submission.cards"
            :key="card.id"
            :class="['relative pr-6', cardIndex > 0 ? 'mt-2 pt-2 border-t border-gray-100' : '']"
          >
            <span v-if="submission.cards.length > 1" class="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">
              {{ cardIndex + 1 }}
            </span>
            <p class="text-gray-900 font-bold leading-snug">{{ card.text }}</p>
          </div>

          <div class="flex justify-between items-end mt-4 pt-2">
            <span class="text-[8px] font-black opacity-10 uppercase tracking-widest">KPL Combo</span>
            <div v-if="selectable" class="w-6 h-6 rounded-full border-2 border-yellow-400/20 flex items-center justify-center">
              <div class="w-1.5 h-1.5 bg-yellow-400 rounded-full opacity-0 hover:opacity-100 transition-opacity"></div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-flip-scene {
  perspective: 800px;
}

.card-flip-wrapper {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.55s ease-in-out;
  min-height: 120px;
}

.face-down {
  transform: rotateY(180deg);
}

.card-face {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 1rem;
}

.card-front {
  position: relative;
}

.card-back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
  background: #1f2937; /* gray-800 */
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
