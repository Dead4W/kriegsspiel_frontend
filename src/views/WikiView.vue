<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@vueuse/head'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

type WikiTab = {
  id: string
  titleKey: string
}

type WikiSection = {
  id: string
  titleKey: string
  tabs: WikiTab[]
}

const wikiSections: WikiSection[] = [
  {
    id: 'getting-started',
    titleKey: 'wikiPage.sections.gettingStarted',
    tabs: [
      { id: 'overview', titleKey: 'wikiPage.tabs.overview' },
      { id: 'fog-of-war', titleKey: 'wikiPage.tabs.fogOfWar' },
      { id: 'first-room', titleKey: 'wikiPage.tabs.firstRoom' },
    ],
  },
  {
    id: 'gameplay',
    titleKey: 'wikiPage.sections.gameplay',
    tabs: [
      { id: 'controls', titleKey: 'wikiPage.tabs.controls' },
      { id: 'short', titleKey: 'wikiPage.tabs.short' },
      { id: 'roles', titleKey: 'wikiPage.tabs.roles' },
      { id: 'orders', titleKey: 'wikiPage.tabs.orders' },
      { id: 'umpire-notifications', titleKey: 'wikiPage.tabs.umpireNotifications' },
    ],
  },
  {
    id: 'resourcepack',
    titleKey: 'wikiPage.sections.resourcepack',
    tabs: [
      { id: 'overview', titleKey: 'wikiPage.tabs.resourcepackOverview' },
      { id: 'time-of-day', titleKey: 'wikiPage.tabs.timeOfDay' },
      { id: 'weather', titleKey: 'wikiPage.tabs.weather' },
      { id: 'inaccuracy', titleKey: 'wikiPage.tabs.inaccuracy' },
      { id: 'morale-check', titleKey: 'wikiPage.tabs.moraleCheck' },
      { id: 'environment', titleKey: 'wikiPage.tabs.environment' },
      { id: 'formations', titleKey: 'wikiPage.tabs.formations' },
      { id: 'abilities', titleKey: 'wikiPage.tabs.abilities' },
      { id: 'unit', titleKey: 'wikiPage.tabs.units' },
      { id: 'angle-modifiers', titleKey: 'wikiPage.tabs.angleModifiers' },
      { id: 'distance-modifiers', titleKey: 'wikiPage.tabs.distanceModifiers' },
    ],
  },
]

const defaultSection: WikiSection = wikiSections[0]!
const defaultTab: WikiTab = defaultSection.tabs[0]!

const markdownModules = import.meta.glob('/wiki/**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const activeSectionId = ref(defaultSection.id)
const activeTabId = ref(defaultTab.id)
const markdownRaw = ref('')
const markdownLoading = ref(false)
const markdownError = ref('')

const activeSection = computed<WikiSection>(() => {
  return wikiSections.find((section) => section.id === activeSectionId.value) ?? defaultSection
})

const renderedMarkdown = computed(() => {
  if (!markdownRaw.value) return ''

  const html = marked.parse(markdownRaw.value, {
    breaks: true,
    gfm: true,
  }) as string

  return DOMPurify.sanitize(html)
})

function hasSection(sectionId: string): boolean {
  return wikiSections.some((section) => section.id === sectionId)
}

function hasTab(sectionId: string, tabId: string): boolean {
  const section = wikiSections.find((item) => item.id === sectionId)
  if (!section) return false
  return section.tabs.some((tab) => tab.id === tabId)
}

function firstTabOrDefault(section: WikiSection): WikiTab {
  return section.tabs[0] ?? defaultTab
}

function applyQueryState() {
  const sectionFromQuery = typeof route.query.section === 'string' ? route.query.section : ''
  const tabFromQuery = typeof route.query.tab === 'string' ? route.query.tab : ''

  const nextSection = hasSection(sectionFromQuery)
    ? (wikiSections.find((section) => section.id === sectionFromQuery) ?? defaultSection)
    : defaultSection

  const nextSectionId = nextSection.id
  const nextTabId = hasTab(nextSectionId, tabFromQuery) ? tabFromQuery : firstTabOrDefault(nextSection).id

  if (activeSectionId.value !== nextSectionId) activeSectionId.value = nextSectionId
  if (activeTabId.value !== nextTabId) activeTabId.value = nextTabId
}

async function syncQueryState() {
  const currentSection = typeof route.query.section === 'string' ? route.query.section : ''
  const currentTab = typeof route.query.tab === 'string' ? route.query.tab : ''

  if (currentSection === activeSectionId.value && currentTab === activeTabId.value) return

  await router.replace({
    name: 'wiki',
    params: route.params,
    query: {
      ...route.query,
      section: activeSectionId.value,
      tab: activeTabId.value,
    },
  })
}

async function loadActivePage() {
  markdownLoading.value = true
  markdownError.value = ''
  markdownRaw.value = ''

  const localeCode = locale.value
  const candidates = [
    `/wiki/${localeCode}/${activeSectionId.value}/${activeTabId.value}.md`,
    `/wiki/en/${activeSectionId.value}/${activeTabId.value}.md`,
  ]

  try {
    for (const candidate of candidates) {
      const loader = markdownModules[candidate]
      if (!loader) continue

      markdownRaw.value = await loader()
      markdownLoading.value = false
      return
    }

    markdownError.value = t('wikiPage.pageNotFound')
  } catch {
    markdownError.value = t('wikiPage.pageLoadError')
  } finally {
    markdownLoading.value = false
  }
}

function selectSection(sectionId: string) {
  const section = wikiSections.find((item) => item.id === sectionId)
  if (!section) return
  activeSectionId.value = section.id
  activeTabId.value = firstTabOrDefault(section).id
}

function selectSectionTab(sectionId: string, tabId: string) {
  if (!hasTab(sectionId, tabId)) return
  activeSectionId.value = sectionId
  activeTabId.value = tabId
}

watch(
  () => route.query,
  () => {
    applyQueryState()
  },
  { immediate: true },
)

watch(
  activeSectionId,
  (newSectionId) => {
    const section = wikiSections.find((item) => item.id === newSectionId)
    if (!section) return

    if (!section.tabs.some((tab) => tab.id === activeTabId.value)) {
      activeTabId.value = firstTabOrDefault(section).id
    }
  },
  { immediate: true },
)

watch(
  [activeSectionId, activeTabId, () => locale.value],
  () => {
    void syncQueryState()
    void loadActivePage()
  },
  { immediate: true },
)

useHead(() => ({
  title: t('wikiSeo.title'),
  meta: [
    {
      name: 'description',
      content: t('wikiSeo.description'),
    },
  ],
  htmlAttrs: {
    lang: locale.value,
  },
}))
</script>

<template>
  <section class="wiki-page">
    <div class="wiki-card">
      <div class="card-header">
        <router-link class="brand-link" :to="{ name: 'home', params: { locale: route.params.locale } }">
          {{ t('title') }}
        </router-link>
      </div>
      <div class="wiki-layout">
        <aside class="wiki-sidebar">
          <h1>{{ t('wiki') }}</h1>

          <nav class="wiki-tree" aria-label="Wiki navigation tree">
            <section
              v-for="section in wikiSections"
              :key="section.id"
              class="tree-section"
              :class="{ active: section.id === activeSectionId }"
            >
              <button
                class="tab-btn tree-section-btn"
                :class="{ active: section.id === activeSectionId }"
                @click="selectSection(section.id)"
              >
                <span class="tree-dot" aria-hidden="true" />
                {{ t(section.titleKey) }}
              </button>

              <div class="tree-children" :class="{ expanded: section.id === activeSectionId }">
                <div class="tree-children-inner">
                  <button
                    v-for="tab in section.tabs"
                    :key="`${section.id}-${tab.id}`"
                    class="tab-btn tab-btn--small tree-tab-btn"
                    :class="{ active: section.id === activeSectionId && tab.id === activeTabId }"
                    @click="selectSectionTab(section.id, tab.id)"
                  >
                    <span class="tree-branch" aria-hidden="true" />
                    {{ t(tab.titleKey) }}
                  </button>
                </div>
              </div>
            </section>
          </nav>
        </aside>

        <div class="wiki-main">
          <div v-if="markdownLoading" class="wiki-state">
            {{ t('wikiPage.loading') }}
          </div>

          <div v-else-if="markdownError" class="wiki-state wiki-state--error">
            {{ markdownError }}
          </div>

          <article v-else class="wiki-content" v-html="renderedMarkdown" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wiki-page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.wiki-card {
  width: min(960px, 100%);
  min-height: 70vh;
  padding: 2rem;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  box-shadow:
    var(--shadow-lg),
    var(--shadow-inset);
}

.card-header {
  display: flex;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.brand-link {
  display: block;
  margin: 0;
  color: var(--text);
  text-decoration: none;
  font-size: 3rem;
  letter-spacing: 0.2em;
  font-weight: 700;
  line-height: 1;
}

.brand-link:hover {
  color: var(--accent);
}

h1 {
  margin: 0 0 1rem;
}

.wiki-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 1.2rem;
  align-items: start;
}

.wiki-sidebar {
  border-right: 1px solid color-mix(in oklab, var(--panel-border) 75%, transparent);
  padding-right: 1rem;
}

.wiki-main {
  min-width: 0;
}

.wiki-tree {
  display: grid;
  gap: 0.35rem;
  padding: 0.2rem 0.25rem 0.15rem 0;
}

.tree-section {
  position: relative;
}

.tree-section::before {
  content: '';
  position: absolute;
  left: 0.8rem;
  top: 2.25rem;
  bottom: 0.3rem;
  width: 1px;
  background: color-mix(in oklab, var(--panel-border) 85%, transparent);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.tree-section.active::before {
  opacity: 1;
}

.tree-section-btn {
  width: 100%;
  justify-content: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.tree-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  border: 1px solid var(--panel-border);
  background: color-mix(in oklab, var(--panel) 75%, var(--accent));
}

.tree-section-btn.active .tree-dot {
  border-color: var(--accent);
  background: var(--accent);
}

.tree-children {
  display: grid;
  grid-template-rows: 0fr;
  margin-left: 1.6rem;
  transition:
    grid-template-rows 0.22s ease,
    margin 0.22s ease;
}

.tree-children-inner {
  overflow: hidden;
  display: grid;
  gap: 0.35rem;
}

.tree-children.expanded {
  grid-template-rows: 1fr;
  margin-top: 0.35rem;
  margin-bottom: 0.15rem;
}

.tree-tab-btn {
  width: 100%;
  justify-content: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.tree-branch {
  width: 0.8rem;
  height: 0.65rem;
  border-left: 1px solid color-mix(in oklab, var(--panel-border) 90%, transparent);
  border-bottom: 1px solid color-mix(in oklab, var(--panel-border) 90%, transparent);
  border-bottom-left-radius: 0.35rem;
  transform: translateY(-0.05rem);
}

.tab-btn {
  border: 1px solid var(--panel-border);
  background: transparent;
  color: var(--text);
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  font-size: 0.95rem;
}

.tab-btn--small {
  font-size: 0.88rem;
  padding: 0.45rem 0.8rem;
}

.tab-btn:hover {
  border-color: var(--accent);
}

.tab-btn.active {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 20%, transparent);
  color: var(--text);
}

.wiki-state {
  color: var(--text-muted);
  padding: 1rem 0.25rem;
}

.wiki-state--error {
  color: var(--danger);
}

.wiki-content {
  color: var(--text);
  line-height: 1.65;
}

.wiki-content :deep(h1),
.wiki-content :deep(h2),
.wiki-content :deep(h3) {
  margin-top: 1.35rem;
  margin-bottom: 0.6rem;
}

.wiki-content :deep(p),
.wiki-content :deep(ul),
.wiki-content :deep(ol) {
  color: var(--text-muted);
}

.wiki-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}

.wiki-content :deep(pre) {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  padding: 0.8rem;
  overflow: auto;
}

.wiki-content :deep(a) {
  color: var(--accent);
}

@media (max-width: 860px) {
  .wiki-card {
    padding: 1.35rem;
  }

  .wiki-layout {
    grid-template-columns: 1fr;
    gap: 0.9rem;
  }

  .wiki-sidebar {
    border-right: 0;
    border-bottom: 1px solid color-mix(in oklab, var(--panel-border) 75%, transparent);
    padding-right: 0;
    padding-bottom: 0.9rem;
  }
}
</style>
