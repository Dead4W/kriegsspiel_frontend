import { createI18n } from 'vue-i18n'

import ru from './locales/ru.json'
import en from './locales/en.json'

const defaultLocale = navigator.languages.includes('ru-RU') ? 'ru' : 'en';

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('i18n_locale') ?? defaultLocale,
  fallbackLocale: 'en',
  messages: {
    ru,
    en
  }
})

export const translate = i18n.global.t

export default i18n
