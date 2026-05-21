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
import api from '@/api/client'
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
const pack = ref<ResourcePackDraft | null>(null)
const defaultPackSnapshot = ref<ResourcePackDraft | null>(null)
const templates = ref<Array<{
  id: number
  public_id: string
  public_url: string
  name: string
  data: ResourcePackDraft
  is_public: boolean
  is_default: boolean
  is_editable: boolean
}>>([])
const selectedTemplateId = ref<number | null>(null)
const templateName = ref('')
const templateError = ref('')
const isTemplateSaving = ref(false)
const isTemplateDeleting = ref(false)
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
const isJsonModalOpen = ref(false)
const jsonDraft = ref('')
const jsonDraftError = ref('')

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

const selectedTemplate = computed(() => {
  return templates.value.find(template => template.id === selectedTemplateId.value) || null
})

const canEditSelectedTemplate = computed(() => {
  return Boolean(selectedTemplate.value?.is_editable)
})

const canDeleteSelectedTemplate = computed(() => {
  return Boolean(selectedTemplate.value?.is_editable && !selectedTemplate.value?.is_default)
})

const isReturnToCreateRoom = computed(() => route.query.return_to === 'create-room')
const isEditorReadonly = computed(() => {
  return isLoading.value || !pack.value || !canEditSelectedTemplate.value || isTemplateSaving.value || isTemplateDeleting.value
})
const canSaveCurrentTemplate = computed(() => {
  return !isLoading.value && !!pack.value && canEditSelectedTemplate.value && !isTemplateSaving.value && !isTemplateDeleting.value
})
const canCloneCurrentTemplate = computed(() => {
  return !isLoading.value && !!pack.value && !isTemplateSaving.value && !isTemplateDeleting.value
})
const selectedTemplatePublicId = computed(() => selectedTemplate.value?.public_id || '')
const selectedTemplatePublicUrl = computed(() => selectedTemplate.value?.public_url || '')
const resourcePackWikiOverviewLink = computed(() => ({
  name: 'wiki',
  params: { locale: route.params.locale },
  query: { section: 'resourcepack', tab: 'overview' },
}))

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

function hydratePack(data: ResourcePackDraft, updateDefaultSnapshot = true) {
  pack.value = clonePack(data)
  if (updateDefaultSnapshot) {
    defaultPackSnapshot.value = clonePack(data)
  }

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
}

function resetCurrentTemplate() {
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
  const nameBase = (templateName.value || selectedTemplate.value?.name || 'resource-pack')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  link.download = `${nameBase || 'resource-pack'}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

function openJsonModal() {
  if (!pack.value) return
  jsonDraftError.value = ''
  jsonDraft.value = JSON.stringify(pack.value, null, 2)
  isJsonModalOpen.value = true
}

function formatJsonDraft() {
  try {
    const parsed = JSON.parse(jsonDraft.value || '{}')
    jsonDraft.value = JSON.stringify(parsed, null, 2)
    jsonDraftError.value = ''
  } catch {
    jsonDraftError.value = t('resourcePackCreator.errors.invalidJson')
  }
}

function applyJsonDraft() {
  try {
    const parsed = JSON.parse(jsonDraft.value || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid_json_root')
    }
    hydratePack(parsed as ResourcePackDraft, false)
    jsonDraftError.value = ''
  } catch {
    jsonDraftError.value = t('resourcePackCreator.errors.invalidJson')
  }
}

function closeJsonModal() {
  isJsonModalOpen.value = false
}

function goToCreateRoom() {
  router.push({
    name: 'create-room',
    params: { locale: route.params.locale },
    query: selectedTemplatePublicId.value
      ? { resource_pack_public_id: selectedTemplatePublicId.value }
      : {},
  })
}

async function loadTemplates() {
  isLoading.value = true
  loadError.value = ''
  templateError.value = ''
  try {
    const { data } = await api.get('/resource-pack')
    const nextTemplates = Array.isArray(data) ? data as typeof templates.value : []
    templates.value = nextTemplates

    const requestedTemplatePublicId = String(route.query.resource_pack_public_id || '').trim()
    const fromQuery = requestedTemplatePublicId
      ? nextTemplates.find(template => template.public_id === requestedTemplatePublicId)
      : null
    const fallback = nextTemplates.find(template => template.is_default) || nextTemplates[0] || null
    const selected = fromQuery || fallback

    if (!selected) {
      throw new Error('no_templates')
    }

    selectedTemplateId.value = selected.id
    templateName.value = selected.name
    hydratePack(selected.data)
  } catch (error) {
    console.error('LOAD RESOURCE PACK TEMPLATES ERROR:', error)
    loadError.value = t('resourcePackCreator.errors.loadDefault')
  } finally {
    isLoading.value = false
  }
}

function selectTemplate(templateId: number) {
  const selected = templates.value.find(template => template.id === templateId)
  if (!selected) return
  selectedTemplateId.value = selected.id
  templateName.value = selected.name
  templateError.value = ''
  hydratePack(selected.data)
}

async function saveTemplate(forceClone = false) {
  if (!pack.value || isTemplateSaving.value) return

  const nextName = templateName.value.trim()
  if (!nextName) {
    templateError.value = t('createRoom.customize.errors.nameRequired')
    return
  }

  templateError.value = ''
  isTemplateSaving.value = true
  try {
    const payload = {
      name: nextName,
      data: pack.value,
    }
    const shouldClone = forceClone || !canEditSelectedTemplate.value
    if (shouldClone) {
      await api.post('/resource-pack', payload)
    } else {
      await api.patch(`/resource-pack/${selectedTemplateId.value}`, payload)
    }
    await loadTemplates()
  } catch (error) {
    console.error('SAVE RESOURCE PACK TEMPLATE ERROR:', error)
    templateError.value = t('createRoom.customize.errors.saveFailed')
  } finally {
    isTemplateSaving.value = false
  }
}

async function deleteTemplate() {
  if (!selectedTemplateId.value || !canDeleteSelectedTemplate.value || isTemplateDeleting.value) return
  if (!window.confirm(t('createRoom.customize.confirmDelete'))) return

  templateError.value = ''
  isTemplateDeleting.value = true
  try {
    await api.delete(`/resource-pack/${selectedTemplateId.value}`)
    await loadTemplates()
  } catch (error) {
    console.error('DELETE RESOURCE PACK TEMPLATE ERROR:', error)
    templateError.value = t('createRoom.customize.errors.deleteFailed')
  } finally {
    isTemplateDeleting.value = false
  }
}

function backToCreateRoom() {
  if (!selectedTemplateId.value) return
  router.push({
    name: 'create-room',
    params: { locale: route.params.locale },
    query: {
        resource_pack_public_id: String(selectedTemplate.value?.public_id || ''),
    },
  })
}

onMounted(loadTemplates)
</script>

<template>
  <section class="resource-pack-creator">
    <button
      type="button"
      class="quick-return"
      @click="goToCreateRoom"
    >
      <span aria-hidden="true">&lt;</span>
      {{ t('resourcePackCreator.actions.topLeft') }}
    </button>
    <div class="creator-card">
      <header class="creator-header">
        <div class="header-main">
          <h1>{{ t('resourcePackCreator.title') }}</h1>
          <p class="creator-subtitle">
            {{ t('resourcePackCreator.subtitle') }}
          </p>
          <div class="template-meta" v-if="selectedTemplate">
            <span class="meta-chip">
              {{
                selectedTemplate.is_default
                  ? t('resourcePackCreator.actions.badges.default')
                  : t('resourcePackCreator.actions.badges.custom')
              }}
            </span>
            <span class="meta-chip" :class="{ warning: !selectedTemplate.is_editable }">
              {{
                selectedTemplate.is_editable
                  ? t('resourcePackCreator.actions.badges.editable')
                  : t('resourcePackCreator.actions.badges.readonly')
              }}
            </span>
            <span class="meta-chip" v-if="selectedTemplatePublicId">
              id: {{ selectedTemplatePublicId }}
            </span>
            <a
              v-if="selectedTemplatePublicUrl"
              :href="selectedTemplatePublicUrl"
              class="meta-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t('resourcePackCreator.actions.openPublic') }}
            </a>
          </div>
        </div>

        <div class="header-actions">
          <label class="file-name-input header-file-name-input">
            {{ t('createRoom.customize.template') }}
            <select
              :value="selectedTemplateId ?? ''"
              :disabled="isLoading || !templates.length || isTemplateSaving || isTemplateDeleting"
              @change="selectTemplate(Number(($event.target as HTMLSelectElement).value))"
            >
              <option
                v-for="template in templates"
                :key="template.id"
                :value="template.id"
              >
                {{ template.name }}{{ template.is_default ? ' (Default)' : '' }}
              </option>
            </select>
          </label>
          <label class="file-name-input header-file-name-input">
            {{ t('createRoom.customize.name') }}
            <input v-model.trim="templateName" :disabled="isLoading || !pack || isTemplateSaving || isTemplateDeleting" />
          </label>
          <button type="button" class="secondary" @click="resetCurrentTemplate" :disabled="isLoading || !pack || isTemplateSaving || isTemplateDeleting">
            {{ t('resourcePackCreator.actions.reset') }}
          </button>
        </div>
      </header>
      <small v-if="templateError" class="template-error">
        {{ templateError }}
      </small>
      <small v-if="!canEditSelectedTemplate && pack" class="template-readonly-hint">
        {{ t('resourcePackCreator.actions.readonlyHint') }}
      </small>
      <nav class="editor-wiki-links" aria-label="Resource pack wiki links">
        <span class="editor-wiki-links-title">{{ t('resourcePackCreator.actions.editorDocs') }}</span>
        <router-link class="editor-wiki-link-chip" :to="resourcePackWikiOverviewLink">
          {{ t('resourcePackCreator.actions.resourcePackWiki') }}
        </router-link>
      </nav>

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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <TimeOfDaySegmentEditor :segments="timeOfDaySegments" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <WeatherSegmentEditor :conditions="weatherConditions" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <EnvironmentEditor :states="environmentStates" :unit-type-options="unitTypeOptions" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <FormationsEditor :formations="formationTypes" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <AbilitiesEditor :abilities="abilityTypes" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <UnitsEditor
                :units="unitTypes"
                :ability-options="abilityOptions"
                :formation-options="formationOptions"
                :environment-options="environmentOptions"
              />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <InaccuracyEditor :inaccuracy="inaccuracyConfig" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <MoraleCheckEditor :morale-check="moraleCheckConfig" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <AngleModifiersEditor :modifiers="angleModifiers" />
            </fieldset>
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
            <fieldset class="editor-fieldset" :disabled="isEditorReadonly">
              <DistanceModifiersEditor :tables="distanceModifierTables" />
            </fieldset>
          </div>
        </section>

        <footer class="bottom-actions">
          <button
            type="button"
            class="primary"
            @click="saveTemplate(false)"
            :disabled="!canSaveCurrentTemplate"
          >
            {{ isTemplateSaving ? t('createRoom.customize.actions.saving') : t('createRoom.customize.actions.save') }}
          </button>
          <button
            type="button"
            class="secondary"
            @click="saveTemplate(true)"
            :disabled="!canCloneCurrentTemplate"
          >
            {{ t('resourcePackCreator.actions.clone') }}
          </button>
          <button
            type="button"
            class="secondary danger"
            @click="deleteTemplate"
            :disabled="isLoading || !pack || !canDeleteSelectedTemplate || isTemplateSaving || isTemplateDeleting"
          >
            {{ isTemplateDeleting ? t('createRoom.customize.actions.deleting') : t('createRoom.customize.actions.delete') }}
          </button>
          <button
            v-if="isReturnToCreateRoom"
            type="button"
            class="secondary"
            :disabled="!selectedTemplateId"
            @click="backToCreateRoom"
          >
            {{ t('createRoom.customize.actions.useForRoom') }}
          </button>
          <button
            type="button"
            class="secondary"
            @click="openJsonModal"
            :disabled="isLoading || !pack"
          >
            {{ t('resourcePackCreator.actions.viewJson') }}
          </button>
          <button type="button" class="secondary" @click="downloadPack" :disabled="isLoading || !pack">
            {{ t('resourcePackCreator.actions.download') }}
          </button>
        </footer>
      </template>
    </div>

    <div
      v-if="isJsonModalOpen"
      class="json-modal-backdrop"
      @click.self="closeJsonModal"
    >
      <section class="json-modal">
        <header class="json-modal-header">
          <h2>{{ t('resourcePackCreator.actions.viewJson') }}</h2>
          <button type="button" class="secondary" @click="closeJsonModal">x</button>
        </header>
        <p class="json-modal-subtitle">
          {{ t('resourcePackCreator.actions.jsonHint') }}
        </p>
        <textarea
          v-model="jsonDraft"
          class="json-draft-textarea"
          spellcheck="false"
        />
        <small v-if="jsonDraftError" class="template-error">{{ jsonDraftError }}</small>
        <footer class="json-modal-actions">
          <button type="button" class="secondary" @click="formatJsonDraft">
            {{ t('resourcePackCreator.actions.formatJson') }}
          </button>
          <button type="button" class="primary" @click="applyJsonDraft" :disabled="isEditorReadonly">
            {{ t('resourcePackCreator.actions.applyJson') }}
          </button>
          <button type="button" class="secondary" @click="downloadPack" :disabled="isLoading || !pack">
            {{ t('resourcePackCreator.actions.download') }}
          </button>
        </footer>
      </section>
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
  position: relative;
  --control-bg: rgba(2, 6, 23, 0.82);
  --control-border: rgba(71, 85, 105, 0.8);
  background:
    radial-gradient(circle at 20% 0%, rgba(34, 197, 94, 0.22), transparent 35%),
    radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.2), transparent 40%),
    linear-gradient(rgba(2, 6, 23, 0.86), rgba(2, 6, 23, 0.95)),
    url('/assets/bg.jpg');
  background-size: auto, auto, auto, 3200px auto;
  background-position: center, center, center, center top;
  background-repeat: no-repeat;
  background-attachment: scroll, scroll, scroll, fixed;
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

.quick-return {
  position: fixed;
  left: 1.2rem;
  top: 1.2rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  z-index: 3;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 46%, transparent);
  background: color-mix(in srgb, var(--panel) 80%, #0f172a 20%);
  color: var(--text);
  padding: 0.5rem 0.9rem;
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

.header-main {
  display: grid;
  gap: 0.5rem;
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

.template-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.meta-chip {
  border: 1px solid rgba(100, 116, 139, 0.42);
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  font-size: 0.76rem;
  color: var(--text-soft);
  background: rgba(15, 23, 42, 0.44);
}

.meta-chip.warning {
  border-color: color-mix(in srgb, var(--warning, #f59e0b) 50%, transparent);
  color: #fef3c7;
}

.meta-link {
  font-size: 0.82rem;
  color: var(--accent);
}

.header-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 0.6rem;
  align-items: end;
}

.header-file-name-input {
  width: 100%;
}

.header-file-name-input :global(input),
.header-file-name-input :global(select) {
  min-height: 2rem !important;
  height: 2rem;
  line-height: 1.1;
  padding: 0 0.65rem !important;
}

.template-error {
  color: var(--danger);
}

.template-readonly-hint {
  color: #fbbf24;
}

.editor-wiki-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin-top: 0.5rem;
}

.editor-wiki-links-title {
  color: var(--text-soft);
  font-size: 0.84rem;
  margin-right: 0.1rem;
}

.editor-wiki-link-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(100, 116, 139, 0.42);
  background: rgba(15, 23, 42, 0.5);
  color: var(--text);
  padding: 0.22rem 0.68rem;
  font-size: 0.76rem;
  text-decoration: none;
}

.editor-wiki-link-chip:hover {
  border-color: color-mix(in srgb, var(--accent) 42%, rgba(100, 116, 139, 0.42));
  color: var(--accent);
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

.editor-fieldset {
  border: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.editor-fieldset:disabled {
  opacity: 0.72;
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

.danger {
  border-color: var(--danger);
  color: var(--danger);
}

.bottom-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding-top: 0.7rem;
  margin-top: 0.2rem;
  border-top: 1px solid rgba(100, 116, 139, 0.28);
}

.bottom-actions button {
  flex: 1 1 180px;
}

.json-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.6);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 5;
  padding: 1rem;
}

.json-modal {
  width: min(980px, 100%);
  max-height: min(82vh, 900px);
  overflow: auto;
  background: color-mix(in srgb, var(--panel) 95%, #0b1120 5%);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg), var(--shadow-inset);
  padding: 1rem;
  display: grid;
  gap: 0.7rem;
}

.json-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.json-modal-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.json-modal-subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.json-draft-textarea {
  min-height: 50vh;
  width: 100%;
  resize: vertical;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  line-height: 1.35;
}

.json-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

@media (max-width: 960px) {
  .resource-pack-creator {
    padding: 1rem;
  }

  .quick-return {
    left: 0.8rem;
    top: 0.8rem;
  }

  .creator-card {
    padding: 0.9rem;
  }

  .header-actions {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .bottom-actions button {
    flex: 1 1 100%;
  }
}
</style>
