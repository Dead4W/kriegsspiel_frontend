<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHead } from '@vueuse/head'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

useHead(() => ({
  title: `404 — ${t('notFound.title')}`,
  meta: [
    {
      name: 'description',
      content: t('notFound.text'),
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
  <section class="not-found">
    <div class="card">
      <div class="code">404</div>
      <h1>{{ t('notFound.title') }}</h1>
      <p class="text">
        {{ t('notFound.text') }}
      </p>

      <p class="path">
        <span class="muted">URL:</span>
        <code>{{ route.fullPath }}</code>
      </p>

      <div class="actions">
        <button class="primary" @click="goHome">
          {{ t('notFound.action') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.not-found {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.card {
  max-width: 720px;
  width: 100%;
  padding: 3rem;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  text-align: center;
  box-shadow:
    var(--shadow-lg),
    var(--shadow-inset);
}

.code {
  font-size: 4rem;
  letter-spacing: 0.1em;
  color: var(--text-soft);
  margin-bottom: 0.25rem;
}

h1 {
  margin: 0;
}

.text {
  margin-top: 1rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.path {
  margin-top: 1.25rem;
  color: var(--text-muted);
  word-break: break-word;
}

.muted {
  margin-right: 0.5rem;
}

.actions {
  margin-top: 1.75rem;
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
