<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Team } from '@/enums/teamKeys'
import { ROOM_SETTING_KEYS } from '@/enums/roomSettingsKeys'

const props = defineProps<{
  team: Team.RED | Team.BLUE
}>()

defineEmits<{
  (e: 'close'): void
}>()

const { t, te } = useI18n()

const teamLabel = computed(() => {
  if (props.team === Team.RED) {
    return window.ROOM_SETTINGS?.[ROOM_SETTING_KEYS.RED_TEAM_NAME] || Team.RED
  }
  return window.ROOM_SETTINGS?.[ROOM_SETTING_KEYS.BLUE_TEAM_NAME] || Team.BLUE
})

const teamClass = computed(() => (props.team === Team.RED ? 'team-red' : 'team-blue'))

type UnitLimit = {
  type: string
  limit: number | null
}

const briefingText = computed(() => {
  const roomPerTeamSettings =
    (window.ROOM_SETTINGS as Record<string, unknown>)?.perTeamSettings as
      | Record<string, { briefing?: string }>
      | undefined
  const fromOptions = roomPerTeamSettings?.[props.team]?.briefing
  if (typeof fromOptions === 'string' && fromOptions.trim().length > 0) {
    return fromOptions
  }
  const fromParams =
    window.ROOM_PARAMS?.perTeamSettings?.[props.team]?.briefing
  if (typeof fromParams === 'string' && fromParams.trim().length > 0) {
    return fromParams
  }
  const fallbackBriefing =
    (window.ROOM_SETTINGS as Record<string, unknown>)?.teamBriefing
    && ((window.ROOM_SETTINGS as Record<string, unknown>).teamBriefing as Record<string, string>)[props.team]
  if (typeof fallbackBriefing === 'string' && fallbackBriefing.trim().length > 0) {
    return fallbackBriefing
  }
  return ''
})

const unitLimits = computed<UnitLimit[]>(() => {
  const roomSettings = window.ROOM_SETTINGS as Record<string, unknown>
  const source = roomSettings?.teamUnitLimits ?? window.ROOM_PARAMS?.teamUnitLimits
  if (!source || typeof source !== 'object') return []

  const teamLimits = (source as Record<string, unknown>)[props.team]
  if (!teamLimits || typeof teamLimits !== 'object') return []

  return Object.entries(teamLimits as Record<string, unknown>)
    .map(([type, value]) => ({
      type,
      limit: typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null,
    }))
    .sort((a, b) => a.type.localeCompare(b.type))
})

function unitLabel(type: string): string {
  const key = `unit.${type}`
  return te(key) ? t(key) : type
}

function renderMarkdown(text: string): string {
  const html = marked.parse(text, {
    breaks: true,
    gfm: true,
  }) as string
  const sanitized = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'referrerpolicy'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:https?|mailto|tel|blob):|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,)|[^a-z]|[a-z+.\-.]+(?:[^a-z+.\-:]|$))/i,
  })
  const doc = new DOMParser().parseFromString(sanitized, 'text/html')
  doc.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer nofollow')
  })
  doc.querySelectorAll('img').forEach((image) => {
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    image.setAttribute('referrerpolicy', 'no-referrer')
  })
  return doc.body.innerHTML
}
</script>

<template>
  <div class="planning-entry-modal-overlay">
    <div
      class="planning-entry-modal"
      :class="{ 'planning-entry-modal--with-content': briefingText || unitLimits.length }"
    >
      <h2>{{ t('planningEntryModal.title') }}</h2>
      <p>
        {{ t('planningEntryModal.team_info') }}
        <span :class="teamClass">{{ teamLabel }}</span>
      </p>
      <div
        v-if="briefingText"
        class="briefing markdown"
        v-html="renderMarkdown(briefingText)"
      />
      <section v-if="unitLimits.length" class="unit-limits">
        <h3>{{ t('planningEntryModal.unit_limits') }}</h3>
        <ul>
          <li v-for="unitLimit in unitLimits" :key="unitLimit.type">
            <span>{{ unitLabel(unitLimit.type) }}</span>
            <span>{{ unitLimit.limit ?? t('planningEntryModal.not_allowed') }}</span>
          </li>
        </ul>
      </section>
      <button type="button" @click="$emit('close')">
        {{ t('planningEntryModal.close') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.planning-entry-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.planning-entry-modal {
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 20px;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #020617f2;
  color: #fff;
  text-align: center;
}

.planning-entry-modal--with-content {
  width: min(80vw, calc(100vw - 32px));
  max-height: 50vh;
}

.planning-entry-modal h2 {
  margin: 0 0 12px;
  font-size: 20px;
}

.planning-entry-modal p {
  margin: 0 0 16px;
  color: #cbd5e1;
}

.team-red {
  color: #ef4444;
  font-weight: 700;
}

.team-blue {
  color: #60a5fa;
  font-weight: 700;
}

.planning-entry-modal button {
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 16px;
  background: #0f172a;
  color: #fff;
  cursor: pointer;
}

.briefing {
  margin: 0 0 16px;
  text-align: left;
  color: #cbd5e1;
  max-height: calc(50vh - 170px);
  overflow-y: auto;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.45);
}

.unit-limits {
  margin: 0 0 16px;
  padding: 10px;
  text-align: left;
  color: #cbd5e1;
  border: 1px solid #334155;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.45);
}

.unit-limits h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #fff;
}

.unit-limits ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 240px));
  gap: 6px;
}

.unit-limits li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(51, 65, 85, 0.45);
}

.unit-limits li span:last-child {
  min-width: 28px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #1e3a5f;
  color: #bfdbfe;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.markdown {
  line-height: 1.4;
}

.markdown :deep(p) {
  margin: 4px 0;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: 18px;
  margin: 4px 0;
}

.markdown :deep(a) {
  color: #38bdf8;
  text-decoration: underline;
}
</style>
