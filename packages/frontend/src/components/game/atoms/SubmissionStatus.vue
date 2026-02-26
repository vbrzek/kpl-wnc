<script setup lang="ts">
import { computed } from 'vue'
import type { Player } from '@kpl/shared'

const props = defineProps<{
  players: Player[]
}>()

const czar = computed(() => props.players.find(p => p.isCardCzar))
const submitted = computed(() => props.players.filter(p => !p.isCardCzar && p.hasPlayed))
const waitingFor = computed(() => props.players.filter(p => !p.isCardCzar && !p.isAfk && !p.hasPlayed))
const afkPlayers = computed(() => props.players.filter(p => !p.isCardCzar && p.isAfk && !p.hasPlayed))
</script>

<template>
  <div class="text-sm space-y-1 bg-gray-800 rounded-lg px-4 py-3">
    <div v-if="czar" class="text-yellow-400">
      🎴 {{ czar.nickname }} — karetní král
    </div>
    <div v-for="p in submitted" :key="p.id" class="text-green-400">
      ✓ {{ p.nickname }}
    </div>
    <div v-for="p in waitingFor" :key="p.id" class="text-gray-400">
      ⏳ {{ p.nickname }}
    </div>
    <div v-for="p in afkPlayers" :key="p.id" class="text-gray-600">
      💤 {{ p.nickname }} (AFK)
    </div>
  </div>
</template>
