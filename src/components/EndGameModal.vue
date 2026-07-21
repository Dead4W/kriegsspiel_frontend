<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Team } from '@/enums/teamKeys'

const props = defineProps<{
  team: Team.RED | Team.BLUE
  results: {
    blueWin?: number
    redWin?: number
    blueResult?: Record<string, string>
    redResult?: Record<string, string>
  }
}>()

defineEmits<{
  (e: 'close'): void
}>()

const { t, locale } = useI18n()

const result = computed(() => {
  const blue = props.team === Team.BLUE
  const ownWinKey = blue ? 'blueWin' : 'redWin'
  const opponentWinKey = blue ? 'redWin' : 'blueWin'
  const resultKey = blue ? 'blueResult' : 'redResult'
  const win = Number(props.results[ownWinKey])
  const opponentWin = Number(props.results[opponentWinKey])
  const descriptions = props.results[resultKey]
  const text = descriptions?.[locale.value] ?? descriptions?.en
  return {
    win: Number.isFinite(win) ? win : 0.5,
    opponentWin: Number.isFinite(opponentWin) ? opponentWin : 0.5,
    text: typeof text === 'string' && text.trim() ? text : t('endGameModal.noResult'),
  }
})

type ResultTier = 'grandVictory' | 'goodVictory' | 'victory' | 'draw' | 'defeat' | 'goodDefeat' | 'grandDefeat'

function strategicTier(win: number): ResultTier {
  if (win > 0.9) return 'grandVictory'
  if (win > 0.8) return 'goodVictory'
  if (win > 0.7) return 'victory'
  if (win > 0.5) return 'draw'
  if (win > 0.3) return 'defeat'
  if (win > 0.2) return 'goodDefeat'
  return 'grandDefeat'
}

function tacticalTier(difference: number): ResultTier {
  if (difference > 0.7) return 'grandVictory'
  if (difference > 0.5) return 'goodVictory'
  if (difference > 0.3) return 'victory'
  if (difference >= -0.3) return 'draw'
  if (difference >= -0.5) return 'defeat'
  if (difference >= -0.7) return 'goodDefeat'
  return 'grandDefeat'
}

const strategicResult = computed(() => strategicTier(result.value.win))
const tacticalResult = computed(() => tacticalTier(result.value.win - result.value.opponentWin))

const strategicTitle = computed(() => t(`endGameModal.strategic.${strategicResult.value}`))
const tacticalTitle = computed(() => t(`endGameModal.tactical.${tacticalResult.value}`))

function titleClass(tier: ResultTier): string {
  if (tier === 'draw') return 'end-game-modal__title--draw'
  return tier === 'grandVictory' || tier === 'goodVictory' || tier === 'victory'
    ? 'end-game-modal__title--victory'
    : 'end-game-modal__title--defeat'
}

const strategicTitleClass = computed(() => titleClass(strategicResult.value))
const tacticalTitleClass = computed(() => titleClass(tacticalResult.value))

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }) as string)
}
</script>

<template>
  <div class="end-game-modal-overlay">
    <div class="end-game-modal">
      <h2 class="end-game-modal__title" :class="strategicTitleClass">{{ strategicTitle }}</h2>
      <h3 class="end-game-modal__title" :class="tacticalTitleClass">{{ tacticalTitle }}</h3>
      <div class="end-game-modal__result markdown" v-html="renderMarkdown(result.text)" />
      <button type="button" @click="$emit('close')">
        {{ t('endGameModal.close') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.end-game-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  pointer-events: auto;
}

.end-game-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 20px;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #020617f2;
  color: #fff;
  text-align: center;
}

.end-game-modal h2 {
  margin: 0;
  font-size: 24px;
}

.end-game-modal h3 {
  margin: 4px 0 16px;
  font-size: 18px;
}

.end-game-modal__title--victory {
  color: #4ade80;
}

.end-game-modal__title--defeat {
  color: #f87171;
}

.end-game-modal__title--draw {
  color: #facc15;
}

.end-game-modal__result {
  max-height: 50vh;
  margin-bottom: 16px;
  overflow-y: auto;
  text-align: left;
  color: #cbd5e1;
  line-height: 1.5;
}

.end-game-modal button {
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 16px;
  background: #0f172a;
  color: #fff;
  cursor: pointer;
}

.markdown :deep(p) {
  margin: 4px 0;
}
</style>
