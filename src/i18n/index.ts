import { createI18n } from 'vue-i18n'
import type { Lang } from '@/types'
import zhCN from './locales/zh-CN'
import en from './locales/en'
import zhTW from './locales/zh-TW'

const LANG_KEY = 'typo-md-editor:lang'

const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(LANG_KEY)) || 'zh-CN'

export const SUPPORTED_LANGS: Lang[] = ['zh-CN', 'en', 'zh-TW']

export const i18n = createI18n({
  legacy: false,
  locale: saved as Lang,
  fallbackLocale: 'en',
  messages: {
    'zh-CN': zhCN,
    en: en,
    'zh-TW': zhTW,
  },
})

export default i18n
