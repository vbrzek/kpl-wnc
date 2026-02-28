// packages/frontend/src/composables/useSound.ts
import { computed } from 'vue'
import { useProfileStore } from '../stores/profileStore'

type SoundName = 'card-pick' | 'card-submit' | 'round-win' | 'fanfare'

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playCardPick(ctx: AudioContext) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain); gain.connect(ctx.destination)
  osc.frequency.value = 900
  gain.gain.setValueAtTime(0.08, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08)
}

function playCardSubmit(ctx: AudioContext) {
  ;[440, 660].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = ctx.currentTime + i * 0.12
    gain.gain.setValueAtTime(0.1, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    osc.start(t); osc.stop(t + 0.18)
  })
}

function playRoundWin(ctx: AudioContext) {
  // C5 E5 G5 — triumphant chord arpeggio
  ;[523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'triangle'
    osc.frequency.value = freq
    const t = ctx.currentTime + i * 0.1
    gain.gain.setValueAtTime(0.12, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4)
    osc.start(t); osc.stop(t + 1.4)
  })
}

function playFanfare(ctx: AudioContext) {
  // C5 E5 G5 C6 — classic fanfare
  ;[523, 659, 784, 1047].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'triangle'
    osc.frequency.value = freq
    const t = ctx.currentTime + i * 0.22
    gain.gain.setValueAtTime(0.14, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    osc.start(t); osc.stop(t + 0.6)
  })
}

const soundFns: Record<SoundName, (ctx: AudioContext) => void> = {
  'card-pick': playCardPick,
  'card-submit': playCardSubmit,
  'round-win': playRoundWin,
  'fanfare': playFanfare,
}

export function useSound() {
  const profileStore = useProfileStore()
  const muted = computed(() => profileStore.soundMuted)

  function play(name: SoundName) {
    if (muted.value) return
    try {
      soundFns[name](getCtx())
    } catch {
      // silently ignore AudioContext errors
    }
  }

  return { play, muted, toggleMute: () => profileStore.toggleSoundMuted() }
}
