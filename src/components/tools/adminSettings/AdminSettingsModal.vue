<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RoomSettingsTab from '@/components/tools/adminSettings/tabs/RoomSettingsTab.vue'
import BriefingSettingsTab from '@/components/tools/adminSettings/tabs/BriefingSettingsTab.vue'
import SpawnSettingsTab from '@/components/tools/adminSettings/tabs/SpawnSettingsTab.vue'

type SettingsTab = 'room' | 'briefing' | 'spawn'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const activeTab = ref<SettingsTab>('room')
const modalRef = ref<HTMLElement | null>(null)
const isCaptureHidden = ref(false)

function close() {
  emit('close')
}

function onCaptureModeChange(hidden: boolean) {
  isCaptureHidden.value = hidden
}

onMounted(async () => {
  await nextTick()
  modalRef.value?.focus()
})

watch(isCaptureHidden, (hidden) => {
  if (hidden) {
    const activeEl = document.activeElement as HTMLElement | null
    if (activeEl && modalRef.value?.contains(activeEl)) {
      activeEl.blur()
    }
    return
  }
  nextTick(() => {
    modalRef.value?.focus()
  })
})
</script>

<template>
  <div
    class="admin-settings-overlay"
    :class="{ 'is-hidden-for-capture': isCaptureHidden }"
    tabindex="-1"
    @click.self="close"
    @keydown.stop
    @keyup.stop
    @keypress.stop
    @pointerdown.stop
    @pointerup.stop
    @contextmenu.stop.prevent
    @wheel.stop.prevent
  >
    <section
      ref="modalRef"
      class="admin-settings-modal"
      tabindex="0"
      @keydown.stop
      @keyup.stop
      @keypress.stop
      @mousedown.stop
      @mouseup.stop
      @pointerdown.stop
      @pointerup.stop
      @click.stop
      @dblclick.stop
      @touchstart.stop
      @touchend.stop
      @contextmenu.stop.prevent
      @wheel.stop.prevent
    >
      <header class="admin-settings-header">
        <h2>{{ t('tools.admin.settings_modal.title') }}</h2>
        <button
          type="button"
          class="close-button"
          @click="close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <nav class="tabs" aria-label="Settings tabs">
        <button
          type="button"
          class="tab-button"
          :class="{ active: activeTab === 'room' }"
          @click="activeTab = 'room'"
        >
          {{ t('tools.admin.settings_modal.tabs.room') }}
        </button>
        <button
          type="button"
          class="tab-button"
          :class="{ active: activeTab === 'spawn' }"
          @click="activeTab = 'spawn'"
        >
          {{ t('tools.admin.settings_modal.tabs.spawn') }}
        </button>
        <button
          type="button"
          class="tab-button"
          :class="{ active: activeTab === 'briefing' }"
          @click="activeTab = 'briefing'"
        >
          {{ t('tools.admin.settings_modal.tabs.briefing') }}
        </button>
      </nav>

      <div class="tab-content">
        <RoomSettingsTab v-if="activeTab === 'room'" />
        <SpawnSettingsTab
          v-if="activeTab === 'spawn'"
          @capture-mode-change="onCaptureModeChange"
        />
        <BriefingSettingsTab v-if="activeTab === 'briefing'" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.62);
  pointer-events: auto;
}

.admin-settings-overlay.is-hidden-for-capture {
  opacity: 0;
  pointer-events: none;
}

.admin-settings-modal {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 36px);
  overflow: auto;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #020617f5;
  color: #fff;
  box-shadow: 0 8px 36px rgba(2, 6, 23, 0.55);
}

.admin-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #334155;
}

.admin-settings-header h2 {
  margin: 0;
  font-size: 16px;
}

.close-button {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: 1px solid #334155;
  background: #0f172a;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
}

.close-button:hover {
  background: #1e293b;
}

.close-button > span {
  display: inline-block;
  transform: translateY(-0.5px);
}

.tabs {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid #334155;
}

.tab-button {
  border: 1px solid #334155;
  border-radius: 8px;
  background: #0b1220;
  color: #cbd5e1;
  padding: 6px 10px;
  cursor: pointer;
}

.tab-button.active {
  color: #fff;
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.28);
}

.tab-content {
  padding: 14px;
}
</style>
