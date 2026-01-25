import './assets/main.css'

import { createApp } from 'vue'
import { createHead } from '@vueuse/head'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './window.ts'

import * as Sentry from "@sentry/vue";

const app = createApp(App)

if (import.meta.env.SENTRY_DSN) {
  Sentry.init({
    app,
    dsn: import.meta.env.SENTRY_DSN,
    // Setting this option to true will send default PII data to Sentry.
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
    integrations: [
      Sentry.browserTracingIntegration({ router })
    ],
    // Tracing
    tracesSampleRate: 1.0, // Capture 100% of the transactions
    // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: [import.meta.env.VITE_API_URL],
    // Logs
    enableLogs: true
  });
}

app.use(router)
app.use(createHead())
app.use(i18n)

app.mount('#app')
