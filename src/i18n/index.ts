import { createI18n } from 'vue-i18n'

import ru from './locales/ru.json'
import en from './locales/en.json'

const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'en',
  messages: {
    ru,
    en
  }
})

export const t = i18n.global.t

export default i18n
