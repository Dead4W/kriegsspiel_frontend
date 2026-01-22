<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useHead } from '@vueuse/head'

const { t, locale } = useI18n()

useHead(() => ({
  title: t('aboutSeo.title'),
  meta: [
    {
      name: 'description',
      content: t('aboutSeo.description')
    }
  ],
  htmlAttrs: {
    lang: locale.value
  }
}))
</script>

<template>
  <section class="about">
    <div class="card">
      <h1>{{ t('about') }}</h1>

      <section class="block">
        <h2>{{ t('aboutSections.whatIs.title') }}</h2>
        <p class="text">
          {{ t('aboutSections.whatIs.text') }}
<!--          <br />-->
<!--          <a-->
<!--            href="https://example.org"-->
<!--            target="_blank"-->
<!--            rel="noopener noreferrer"-->
<!--          >-->
<!--            {{ t('aboutSections.whatIs.bookLink') }}-->
<!--          </a>-->
        </p>
      </section>

      <section class="block">
        <h2>{{ t('aboutSections.story.title') }}</h2>
        <p class="text">
          {{ t('aboutSections.story.text') }}
        </p>
      </section>

      <section class="block">
        <h2>{{ t('aboutSections.github.title') }}</h2>
        <ul class="links">
          <li>
            <a
              href="https://github.com/Dead4W/kriegsspiel_frontend/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Frontend (Vue)
            </a>
          </li>
          <li>
            <a
              href="https://github.com/Dead4W/kriegsspiel_backend/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Backend (PHP Laravel)
            </a>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.about {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  max-width: 700px;
  padding: 3rem;
  background: linear-gradient(180deg, #020617, #020617cc);
  border: 1px solid #1e293b;
  border-radius: 16px;
  text-align: center;
}

.text {
  margin-top: 1.5rem;
  color: #94a3b8;
  line-height: 1.6;
}

.block {
  margin-top: 2rem;
  text-align: left;
}

.block h2 {
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
  color: #e5e7eb;
}

.text {
  color: #94a3b8;
  line-height: 1.6;
}

.text a {
  color: var(--accent);
  text-decoration: underline;
}

.links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.links li {
  margin: 0.4rem 0;
}

.links a {
  color: var(--accent);
  text-decoration: none;
}

.links a:hover {
  text-decoration: underline;
}

</style>
