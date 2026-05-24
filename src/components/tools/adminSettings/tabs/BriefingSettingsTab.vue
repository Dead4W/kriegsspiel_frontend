<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Team } from '@/enums/teamKeys'

type TeamSettingsMap = Record<string, { briefing?: string }>

const { t } = useI18n()

const perTeamSettings = computed<TeamSettingsMap>(() => {
  const source = (window.ROOM_SETTINGS as Record<string, unknown>)?.perTeamSettings
  if (!source || typeof source !== 'object') {
    return {}
  }
  return source as TeamSettingsMap
})

const redBriefing = ref('')
const blueBriefing = ref('')
const isPreviewVisible = ref(false)

function syncLocalStateFromRoomSettings() {
  redBriefing.value = perTeamSettings.value[Team.RED]?.briefing ?? ''
  blueBriefing.value = perTeamSettings.value[Team.BLUE]?.briefing ?? ''
}

watch(perTeamSettings, syncLocalStateFromRoomSettings, { immediate: true, deep: true })

function saveBriefing() {
  const payload = {
    [Team.RED]: { briefing: redBriefing.value },
    [Team.BLUE]: { briefing: blueBriefing.value },
  }

  window.ROOM_WORLD.events.emit('api', {
    type: 'room_per_team_settings_update',
    data: payload,
  })

  window.ROOM_SETTINGS.perTeamSettings = {
    ...(window.ROOM_SETTINGS.perTeamSettings || {}),
    ...payload,
  }
}

function togglePreview() {
  isPreviewVisible.value = !isPreviewVisible.value
}

function renderMarkdown(text: string): string {
  if (!text.trim()) return ''
  const html = marked.parse(text, {
    breaks: true,
    gfm: true,
  }) as string
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'referrerpolicy'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:https?|mailto|tel|blob):|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,)|[^a-z]|[a-z+.\-.]+(?:[^a-z+.\-:]|$))/i,
  })
}
</script>

<template>
  <section class="briefing-tab">
    <div class="settings-group">
      <h3>{{ t('tools.admin.settings_modal.briefing.group_title') }}</h3>
      <p class="hint">{{ t('tools.admin.settings_modal.briefing.group_hint') }}</p>

      <div class="fields">
        <label class="field">
          <span class="field-label">{{ t('tools.admin.settings_modal.briefing.red_label') }}</span>
          <textarea
            v-model="redBriefing"
            rows="7"
            :placeholder="t('tools.admin.settings_modal.briefing.placeholder')"
          />
          <div
            v-if="isPreviewVisible"
            class="preview markdown"
            v-html="renderMarkdown(redBriefing) || t('tools.admin.settings_modal.briefing.preview_empty')"
          />
        </label>

        <label class="field">
          <span class="field-label">{{ t('tools.admin.settings_modal.briefing.blue_label') }}</span>
          <textarea
            v-model="blueBriefing"
            rows="7"
            :placeholder="t('tools.admin.settings_modal.briefing.placeholder')"
          />
          <div
            v-if="isPreviewVisible"
            class="preview markdown"
            v-html="renderMarkdown(blueBriefing) || t('tools.admin.settings_modal.briefing.preview_empty')"
          />
        </label>
      </div>

      <div class="actions">
        <button type="button" class="preview-button" @click="togglePreview">
          {{
            isPreviewVisible
              ? t('tools.admin.settings_modal.briefing.hide_preview')
              : t('tools.admin.settings_modal.briefing.show_preview')
          }}
        </button>
        <button type="button" class="save-button" @click="saveBriefing">
          {{ t('tools.admin.settings_modal.briefing.save') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.briefing-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-group {
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-group h3 {
  margin: 0;
  font-size: 13px;
  color: #93c5fd;
}

.hint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}

.field textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 132px;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px;
  color: #f8fafc;
  background: rgba(2, 6, 23, 0.78);
  font-family: inherit;
  line-height: 1.4;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.field textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  background: rgba(2, 6, 23, 0.92);
}

.preview {
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px;
  color: #e2e8f0;
  background: rgba(2, 6, 23, 0.52);
  line-height: 1.4;
}

.actions {
  display: flex;
  gap: 8px;
}

.preview-button {
  align-self: flex-start;
  border: 1px solid #475569;
  background: #0f172a;
  color: #cbd5e1;
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
}

.preview-button:hover {
  border-color: #64748b;
  background: #1e293b;
}

.save-button {
  align-self: flex-start;
  border: 1px solid #2563eb;
  background: #1d4ed8;
  color: white;
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
}

.save-button:hover {
  background: #1e40af;
}

.markdown :deep(p) {
  margin: 4px 0;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 4px 0;
  padding-left: 18px;
}

.markdown :deep(a) {
  color: #38bdf8;
  text-decoration: underline;
}
</style>
