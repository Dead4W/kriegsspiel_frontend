<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHead } from '@vueuse/head'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

useHead(() => ({
  title: `${t('privacyPolicy.title')} — KRIEGSSPIEL`,
  meta: [
    {
      name: 'description',
      content: t('privacyPolicy.description'),
    },
  ],
  htmlAttrs: {
    lang: locale.value,
  },
}))

function goHome() {
  router.push({ name: 'home', params: { locale: route.params.locale } })
}
</script>

<template>
  <section class="policy">
    <div class="card">
      <h1>{{ t('privacyPolicy.title') }}</h1>
      <p class="text">
        {{ t('privacyPolicy.intro') }}
      </p>

      <div class="nav">
        <router-link
          class="nav-link"
          :to="{ name: 'cookies', params: { locale: route.params.locale } }"
        >
          {{ t('cookieBanner.cookiesLink') }}
        </router-link>
        <span class="nav-sep">•</span>
        <router-link
          class="nav-link"
          :to="{ name: 'home', params: { locale: route.params.locale } }"
        >
          {{ t('to_home') }}
        </router-link>
      </div>

      <section class="block">
        <h2>{{ t('privacyPolicy.sections.dataWeCollect.title') }}</h2>
        <p class="text">
          {{ t('privacyPolicy.sections.dataWeCollect.text') }}
        </p>
      </section>

      <section class="block">
        <h2>{{ t('privacyPolicy.sections.howWeUse.title') }}</h2>
        <p class="text">
          {{ t('privacyPolicy.sections.howWeUse.text') }}
        </p>
      </section>

      <section class="block">
        <h2>{{ t('privacyPolicy.sections.storage.title') }}</h2>
        <p class="text">
          {{ t('privacyPolicy.sections.storage.text') }}
        </p>
      </section>

      <div class="actions">
        <button class="primary" @click="goHome">
          {{ t('to_home') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.policy {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.card {
  max-width: 820px;
  width: 100%;
  padding: 3rem;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  box-shadow:
    var(--shadow-lg),
    var(--shadow-inset);
}

h1 {
  margin: 0;
  text-align: center;
}

.text {
  margin-top: 1rem;
  color: var(--text-muted);
  line-height: 1.65;
}

.nav {
  margin-top: 0.75rem;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.nav-link {
  color: var(--accent);
  text-decoration: underline;
}

.nav-link:hover {
  color: var(--accent-hover);
}

.nav-sep {
  color: rgba(148, 163, 184, 0.7);
}

.block {
  margin-top: 1.75rem;
}

.block h2 {
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: var(--text);
}

.actions {
  margin-top: 2rem;
  display: flex;
  justify-content: center;
}

.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  padding: 0.9rem 1.5rem;
  min-width: 220px;
}

.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  transform: translateY(-1px);
  filter: none;
}
</style>
