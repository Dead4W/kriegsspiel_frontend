<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useHead } from '@vueuse/head'

const route = useRoute()
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
      <div class="card-header">
        <router-link class="brand-link" :to="{ name: 'home', params: { locale: route.params.locale } }">
          {{ t('title') }}
        </router-link>
      </div>
      <h1>{{ t('about') }}</h1>
      <div class="tags" aria-label="Project technologies">
        <span class="tag">GitHub Pages</span>
      </div>

      <section class="block">
        <h2>{{ t('aboutSections.whatIs.title') }}</h2>
        <p class="text">
          {{ t('aboutSections.whatIs.text') }}
          <br />
          <a
            href="https://archive.org/details/americankriegssp00live/page/14/mode/1up"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('aboutSections.whatIs.bookLink') }}
          </a>
          <br />
          <a
            href="https://www.youtube.com/watch?v=HkH2t-Nyt04"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('aboutSections.whatIs.tutorialLink') }}
          </a>
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
  padding: 2rem 1rem;
}

.card {
  max-width: 700px;
  padding: 3rem;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  text-align: center;
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

.tags {
  margin-top: 0.75rem;
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: color-mix(in oklab, var(--panel) 70%, var(--accent) 30%);
  color: var(--text);
  font-size: 0.85rem;
  line-height: 1;
}

.text {
  margin-top: 1.5rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.block {
  margin-top: 2rem;
  text-align: left;
}

.block h2 {
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
  color: var(--text);
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
