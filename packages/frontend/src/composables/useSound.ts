// packages/frontend/src/composables/useSound.ts
import { computed } from 'vue'
import { useProfileStore } from '../stores/profileStore'

type SoundName = 'card-pick' | 'card-submit' | 'round-win' | 'fanfare'

// Sound files to load — add both OGG and MP3 for each sound.
// Browser picks the first supported format.
// If neither file loads, falls back to generated (Web Audio API) sound.
const SOUND_FILES: Partial<Record<SoundName, string[]>> = {
  'card-pick':   ['/sounds/card-pick.ogg',   '/sounds/card-pick.mp3'],
  'card-submit': ['/sounds/card-submit.ogg', '/sounds/card-submit.mp3'],
  'round-win':   ['/sounds/round-win.ogg',   '/sounds/round-win.mp3'],
  'fanfare':     ['/sounds/fanfare.ogg',     '/sounds/fanfare.mp3'],
}

// --- AudioContext singleton ---

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// --- File loading with format detection ---

const bufferCache = new Map<SoundName, AudioBuffer | false>()

function canPlayOgg(): boolean {
  const a = document.createElement('audio')
  return a.canPlayType('audio/ogg; codecs="vorbis"') !== ''
}

async function tryFetch(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.arrayBuffer()
  } catch {
    return null
  }
}

async function loadBuffer(name: SoundName, ctx: AudioContext): Promise<AudioBuffer | false> {
  if (bufferCache.has(name)) return bufferCache.get(name)!

  const candidates = SOUND_FILES[name]
  if (!candidates) {
    bufferCache.set(name, false)
    return false
  }

  // Prefer OGG if supported, otherwise MP3
  const ordered = canPlayOgg()
    ? candidates
    : [...candidates].reverse()

  for (const url of ordered) {
    const data = await tryFetch(url)
    if (!data) continue
    try {
      const buf = await ctx.decodeAudioData(data)
      bufferCache.set(name, buf)
      return buf
    } catch {
      continue
    }
  }

  // All files failed — remember so we don't retry on every play
  bufferCache.set(name, false)
  return false
}

// --- Generated (Web Audio API) fallback sounds ---

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

const generatedFns: Record<SoundName, (ctx: AudioContext) => void> = {
  'card-pick':   playCardPick,
  'card-submit': playCardSubmit,
  'round-win':   playRoundWin,
  'fanfare':     playFanfare,
}

// --- Public composable ---

export function useSound() {
  const profileStore = useProfileStore()
  const muted = computed(() => profileStore.soundMuted)

  async function play(name: SoundName) {
    if (muted.value) return
    try {
      const ctx = getCtx()
      const buf = await loadBuffer(name, ctx)
      if (buf) {
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        src.start()
      } else {
        generatedFns[name](ctx)
      }
    } catch {
      // silently ignore AudioContext errors
    }
  }

  return { play, muted, toggleMute: () => profileStore.toggleSoundMuted() }
}
