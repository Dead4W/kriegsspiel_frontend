<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AbilitiesEditor from '@/components/resourcePack/AbilitiesEditor.vue'
import AngleModifiersEditor from '@/components/resourcePack/AngleModifiersEditor.vue'
import DistanceModifiersEditor from '@/components/resourcePack/DistanceModifiersEditor.vue'
import EnvironmentEditor from '@/components/resourcePack/EnvironmentEditor.vue'
import FormationsEditor from '@/components/resourcePack/FormationsEditor.vue'
import InaccuracyEditor from '@/components/resourcePack/InaccuracyEditor.vue'
import MoraleCheckEditor from '@/components/resourcePack/MoraleCheckEditor.vue'
import TimeOfDaySegmentEditor from '@/components/resourcePack/TimeOfDaySegmentEditor.vue'
import UnitsEditor from '@/components/resourcePack/UnitsEditor.vue'
import WeatherSegmentEditor from '@/components/resourcePack/WeatherSegmentEditor.vue'
import {
  createInitialAngleModifier,
  createInitialAbilityType,
  createInitialCondition,
  createInitialDistanceModifierPoint,
  createInitialEnvironmentState,
  createInitialFormationType,
  createInitialMoraleCheck,
  createInitialTimeSegment,
  createInitialUnitType,
} from '@/components/resourcePack/factories'
import type { MoraleCheckConfig } from '@/engine/resourcePack/moraleCheck'
import type {
  AbilityState,
  EnvironmentState,
  FormationState,
  ResourcePackAngleModifier,
  ResourcePackDistanceModifiers,
  ResourcePackDraft,
  ResourcePackInaccuracy,
  ResourcePackUnitType,
  TimeOfDaySegment,
  WeatherCondition,
} from '@/components/resourcePack/types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const isLoading = ref(true)
const loadError = ref('')
const downloadName = ref('resourcepack.custom.json')
const pack = ref<ResourcePackDraft | null>(null)
const defaultPackSnapshot = ref<ResourcePackDraft | null>(null)
const isTimeOfDayEditorOpen = ref(false)
const isWeatherEditorOpen = ref(false)
const isEnvironmentEditorOpen = ref(false)
const isFormationsEditorOpen = ref(false)
const isAbilitiesEditorOpen = ref(false)
const isUnitsEditorOpen = ref(false)
const isInaccuracyEditorOpen = ref(false)
const isMoraleCheckEditorOpen = ref(false)
const isAngleModifiersEditorOpen = ref(false)
const isDistanceModifiersEditorOpen = ref(false)

const timeOfDaySegments = computed<TimeOfDaySegment[]>(() => {
  if (!pack.value) return []
  if (!pack.value.timeOfDay) pack.value.timeOfDay = {}
  if (!Array.isArray(pack.value.timeOfDay.segments)) pack.value.timeOfDay.segments = []
  return pack.value.timeOfDay.segments
})

const weatherConditions = computed<WeatherCondition[]>(() => {
  if (!pack.value) return []
  if (!pack.value.weather) pack.value.weather = {}
  if (!Array.isArray(pack.value.weather.conditions)) pack.value.weather.conditions = []
  return pack.value.weather.conditions
})

const environmentStates = computed<EnvironmentState[]>(() => {
  if (!pack.value) return []
  if (!pack.value.environment) pack.value.environment = {}
  if (!Array.isArray(pack.value.environment.states)) pack.value.environment.states = []
  return pack.value.environment.states
})

const formationTypes = computed<FormationState[]>(() => {
  if (!pack.value) return []
  if (!pack.value.formations) pack.value.formations = {}
  if (!Array.isArray(pack.value.formations.types)) pack.value.formations.types = []
  return pack.value.formations.types
})

const abilityTypes = computed<AbilityState[]>(() => {
  if (!pack.value) return []
  if (!pack.value.abilities) pack.value.abilities = {}
  if (!Array.isArray(pack.value.abilities.types)) pack.value.abilities.types = []
  return pack.value.abilities.types
})

const unitTypes = computed<ResourcePackUnitType[]>(() => {
  if (!pack.value) return []
  if (!pack.value.units) pack.value.units = {}
  if (!Array.isArray(pack.value.units.types)) pack.value.units.types = []
  return pack.value.units.types
})

const unitTypeOptions = computed(() => {
  return unitTypes.value
    .map((entry) => {
      const id = entry?.id?.trim()
      if (!id) return null
      return {
        id,
        label: entry.title?.trim() || t(`unit.${id}`),
      }
    })
    .filter((entry): entry is { id: string; label: string } => entry != null)
})

const abilityOptions = computed(() => {
  return abilityTypes.value
    .map((entry) => {
      const id = entry?.id?.trim()
      if (!id) return null
      return {
        id,
        label: entry.title?.trim() || t(`ability.${id}`),
      }
    })
    .filter((entry): entry is { id: string; label: string } => entry != null)
})

const formationOptions = computed(() => {
  return formationTypes.value
    .map((entry) => {
      const id = entry?.id?.trim()
      if (!id) return null
      return {
        id,
        label: entry.title?.trim() || t(`formation.${id}`),
      }
    })
    .filter((entry): entry is { id: string; label: string } => entry != null)
})

const environmentOptions = computed(() => {
  return environmentStates.value
    .map((entry) => {
      const id = entry?.id?.trim()
      if (!id) return null
      return {
        id,
        label: entry.title?.trim() || t(`env.${id}`),
      }
    })
    .filter((entry): entry is { id: string; label: string } => entry != null)
})

const inaccuracyConfig = computed<ResourcePackInaccuracy>(() => {
  if (!pack.value) return {}
  if (!pack.value.inaccuracy) {
    pack.value.inaccuracy = {
      heightFactor: 5,
      distanceFactor: 0.1,
    }
  }
  return pack.value.inaccuracy
})

const moraleCheckConfig = computed<MoraleCheckConfig>(() => {
  if (!pack.value) return createInitialMoraleCheck()
  if (!pack.value.moraleCheck) {
    pack.value.moraleCheck = createInitialMoraleCheck()
  }
  return pack.value.moraleCheck
})

const angleModifiers = computed<ResourcePackAngleModifier[]>(() => {
  if (!pack.value) return []
  if (!Array.isArray(pack.value.angleModifiers)) pack.value.angleModifiers = []
  return pack.value.angleModifiers
})

const distanceModifierTables = computed<ResourcePackDistanceModifiers>(() => {
  if (!pack.value) return {}
  const distanceModifiers = pack.value.distanceModifiers
  if (!distanceModifiers || typeof distanceModifiers !== 'object' || Array.isArray(distanceModifiers)) {
    pack.value.distanceModifiers = {}
  }
  return pack.value.distanceModifiers as ResourcePackDistanceModifiers
})

function clonePack(v: ResourcePackDraft): ResourcePackDraft {
  return JSON.parse(JSON.stringify(v))
}

function resetToDefault() {
  if (!defaultPackSnapshot.value) return
  pack.value = clonePack(defaultPackSnapshot.value)
}

function downloadPack() {
  if (!pack.value) return
  const json = JSON.stringify(pack.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = downloadName.value.trim() || 'resourcepack.custom.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

async function loadDefaultPack() {
  isLoading.value = true
  loadError.value = ''
  try {
    const response = await fetch('/assets/default_resourcepack.json')
    if (!response.ok) throw new Error(`http_${response.status}`)
    const data = (await response.json()) as ResourcePackDraft
    defaultPackSnapshot.value = clonePack(data)
    pack.value = clonePack(data)
    if (!timeOfDaySegments.value.length) {
      timeOfDaySegments.value.push(createInitialTimeSegment())
    }
    if (!weatherConditions.value.length) {
      weatherConditions.value.push(createInitialCondition())
    }
    if (!environmentStates.value.length) {
      environmentStates.value.push(createInitialEnvironmentState())
    }
    if (!formationTypes.value.length) {
      formationTypes.value.push(createInitialFormationType())
    }
    if (!abilityTypes.value.length) {
      abilityTypes.value.push(createInitialAbilityType())
    }
    if (!unitTypes.value.length) {
      unitTypes.value.push(createInitialUnitType())
    }
    if (!angleModifiers.value.length) {
      angleModifiers.value.push(createInitialAngleModifier())
    }
    if (!Object.keys(distanceModifierTables.value).length) {
      distanceModifierTables.value.default = [createInitialDistanceModifierPoint()]
    }
  } catch {
    loadError.value = t('resourcePackCreator.errors.loadDefault')
  } finally {
    isLoading.value = false
  }
}

function backToHome() {
  router.push({ name: 'home', params: { locale: route.params.locale } })
}

onMounted(loadDefaultPack)
</script>

<template>
  <section class="resource-pack-creator">
    <div class="creator-card">
      <header class="creator-header">
        <div>
          <h1>{{ t('resourcePackCreator.title') }}</h1>
          <p class="creator-subtitle">
            {{ t('resourcePackCreator.subtitle') }}
          </p>
        </div>

        <div class="header-actions">
          <label class="file-name-input header-file-name-input">
            {{ t('resourcePackCreator.actions.fileName') }}
            <input v-model.trim="downloadName" :disabled="isLoading || !pack" />
          </label>
          <button type="button" class="secondary" @click="backToHome">
            {{ t('resourcePackCreator.actions.backHome') }}
          </button>
          <button type="button" class="secondary" @click="resetToDefault" :disabled="isLoading || !pack">
            {{ t('resourcePackCreator.actions.reset') }}
          </button>
          <button type="button" class="primary" @click="downloadPack" :disabled="isLoading || !pack">
            {{ t('resourcePackCreator.actions.download') }}
          </button>
        </div>
      </header>

      <div v-if="isLoading" class="state-message">
        {{ t('loading') }}
      </div>
      <div v-else-if="loadError" class="state-message error">
        {{ loadError }}
      </div>
      <template v-else-if="pack">
        <section class="editor-shell" :class="{ open: isTimeOfDayEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isTimeOfDayEditorOpen }"
            :aria-expanded="isTimeOfDayEditorOpen"
            @click="isTimeOfDayEditorOpen = !isTimeOfDayEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.timeOfDayEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isTimeOfDayEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isTimeOfDayEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isTimeOfDayEditorOpen" class="editor-body">
            <TimeOfDaySegmentEditor :segments="timeOfDaySegments" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isWeatherEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isWeatherEditorOpen }"
            :aria-expanded="isWeatherEditorOpen"
            @click="isWeatherEditorOpen = !isWeatherEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.weatherEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isWeatherEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isWeatherEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isWeatherEditorOpen" class="editor-body">
            <WeatherSegmentEditor :conditions="weatherConditions" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isEnvironmentEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isEnvironmentEditorOpen }"
            :aria-expanded="isEnvironmentEditorOpen"
            @click="isEnvironmentEditorOpen = !isEnvironmentEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.environmentEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isEnvironmentEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isEnvironmentEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isEnvironmentEditorOpen" class="editor-body">
            <EnvironmentEditor :states="environmentStates" :unit-type-options="unitTypeOptions" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isFormationsEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isFormationsEditorOpen }"
            :aria-expanded="isFormationsEditorOpen"
            @click="isFormationsEditorOpen = !isFormationsEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.formationsEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isFormationsEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isFormationsEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isFormationsEditorOpen" class="editor-body">
            <FormationsEditor :formations="formationTypes" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isAbilitiesEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isAbilitiesEditorOpen }"
            :aria-expanded="isAbilitiesEditorOpen"
            @click="isAbilitiesEditorOpen = !isAbilitiesEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.abilitiesEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isAbilitiesEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isAbilitiesEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isAbilitiesEditorOpen" class="editor-body">
            <AbilitiesEditor :abilities="abilityTypes" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isUnitsEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isUnitsEditorOpen }"
            :aria-expanded="isUnitsEditorOpen"
            @click="isUnitsEditorOpen = !isUnitsEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.unitsEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isUnitsEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isUnitsEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isUnitsEditorOpen" class="editor-body">
            <UnitsEditor
              :units="unitTypes"
              :ability-options="abilityOptions"
              :formation-options="formationOptions"
              :environment-options="environmentOptions"
            />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isInaccuracyEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isInaccuracyEditorOpen }"
            :aria-expanded="isInaccuracyEditorOpen"
            @click="isInaccuracyEditorOpen = !isInaccuracyEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.inaccuracyEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isInaccuracyEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isInaccuracyEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isInaccuracyEditorOpen" class="editor-body">
            <InaccuracyEditor :inaccuracy="inaccuracyConfig" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isMoraleCheckEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isMoraleCheckEditorOpen }"
            :aria-expanded="isMoraleCheckEditorOpen"
            @click="isMoraleCheckEditorOpen = !isMoraleCheckEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.moraleCheckEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isMoraleCheckEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isMoraleCheckEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isMoraleCheckEditorOpen" class="editor-body">
            <MoraleCheckEditor :morale-check="moraleCheckConfig" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isAngleModifiersEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isAngleModifiersEditorOpen }"
            :aria-expanded="isAngleModifiersEditorOpen"
            @click="isAngleModifiersEditorOpen = !isAngleModifiersEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.angleModifiersEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isAngleModifiersEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isAngleModifiersEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isAngleModifiersEditorOpen" class="editor-body">
            <AngleModifiersEditor :modifiers="angleModifiers" />
          </div>
        </section>

        <section class="editor-shell" :class="{ open: isDistanceModifiersEditorOpen }">
          <button
            type="button"
            class="editor-toggle"
            :class="{ open: isDistanceModifiersEditorOpen }"
            :aria-expanded="isDistanceModifiersEditorOpen"
            @click="isDistanceModifiersEditorOpen = !isDistanceModifiersEditorOpen"
          >
            <span class="editor-toggle-copy">
              <span class="editor-toggle-title">{{ t('resourcePackCreator.distanceModifiersEditor.title') }}</span>
              <span class="editor-toggle-help">
                {{
                  t(
                    isDistanceModifiersEditorOpen
                      ? 'resourcePackCreator.actions.closeEditor'
                      : 'resourcePackCreator.actions.openEditor',
                  )
                }}
              </span>
            </span>
            <span class="editor-toggle-chevron" :class="{ open: isDistanceModifiersEditorOpen }" aria-hidden="true">
              v
            </span>
          </button>
          <div v-if="isDistanceModifiersEditorOpen" class="editor-body">
            <DistanceModifiersEditor :tables="distanceModifierTables" />
          </div>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.resource-pack-creator {
  flex: 1;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem;
  --control-bg: rgba(2, 6, 23, 0.82);
  --control-border: rgba(71, 85, 105, 0.8);
  background:
    radial-gradient(circle at 20% 0%, rgba(34, 197, 94, 0.22), transparent 35%),
    radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.2), transparent 40%),
    linear-gradient(rgba(2, 6, 23, 0.86), rgba(2, 6, 23, 0.95)),
    url('/assets/bg.jpg');
  background-size: cover;
  background-position: center;
}

.creator-card {
  width: min(1200px, 100%);
  display: grid;
  gap: 1rem;
  background: color-mix(in srgb, var(--panel) 94%, #0b1120 6%);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  padding: 1.2rem;
  box-shadow: var(--shadow-lg), var(--shadow-inset);
}

.resource-pack-creator input {
  width: 100%;
  min-height: 2.35rem;
  line-height: 1.2;
}

.resource-pack-creator :global(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"])),
.resource-pack-creator :global(textarea),
.resource-pack-creator :global(select) {
  padding: 0 !important;
}

.resource-pack-creator button {
  min-height: 2.35rem;
}

.creator-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.creator-header h1 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: 0.04em;
}

.creator-subtitle {
  margin: 0.3rem 0 0;
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: end;
}

.header-file-name-input {
  width: min(100%, 260px);
}

.state-message {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: var(--radius-md);
  padding: 1rem;
  color: var(--text-soft);
  background: rgba(15, 23, 42, 0.35);
}

.state-message.error {
  border-color: color-mix(in srgb, var(--danger) 50%, transparent);
  color: #fecaca;
}

.editor-shell {
  display: grid;
  overflow: hidden;
  border: 1px solid rgba(100, 116, 139, 0.36);
  border-radius: var(--radius-md);
  background: rgba(15, 23, 42, 0.42);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.editor-shell.open {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(15, 23, 42, 0.58);
  box-shadow:
    0 14px 30px rgba(2, 6, 23, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.editor-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  transition: background 0.18s ease;
}

.resource-pack-creator button.editor-toggle:hover:not(:disabled) {
  border: none;
  filter: none;
  transform: none;
  box-shadow: none;
  background: rgba(148, 163, 184, 0.06);
}

.editor-toggle.open {
  background: rgba(255, 255, 255, 0.02);
}

.editor-toggle-copy {
  display: grid;
  gap: 0.2rem;
}

.editor-toggle-title {
  font-size: 1rem;
  font-weight: 600;
}

.editor-toggle-help {
  color: var(--text-muted);
  font-size: 0.86rem;
}

.editor-toggle-chevron {
  font-size: 1rem;
  color: var(--text-muted);
  transition: transform 0.18s ease;
}

.editor-toggle-chevron.open {
  transform: rotate(180deg);
}

.editor-body {
  display: grid;
  padding: 0 1rem 1rem;
  border-top: 1px solid rgba(100, 116, 139, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 28%),
    rgba(2, 6, 23, 0.14);
}

.panel {
  border: 1px solid rgba(100, 116, 139, 0.36);
  border-radius: var(--radius-md);
  padding: 1rem;
  background: rgba(15, 23, 42, 0.46);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.05rem;
}

.panel-header p {
  margin: 0.2rem 0 0;
  color: var(--text-muted);
  font-size: 0.92rem;
}

.file-name-input {
  min-width: min(100%, 260px);
  display: grid;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: var(--text-soft);
}

.primary {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: var(--accent);
}

.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  filter: none;
}

.secondary {
  background: rgba(15, 23, 42, 0.4);
  color: var(--text);
  border-color: rgba(148, 163, 184, 0.4);
}

@media (max-width: 960px) {
  .resource-pack-creator {
    padding: 1rem;
  }

  .creator-card {
    padding: 0.9rem;
  }
}

@media (max-width: 680px) {
  .header-actions button {
    flex: 1 1 100%;
  }
}
</style>
