import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'
import type { Lang } from '@/types'
import zhCN from './locales/zh-CN'
import en from './locales/en'
import zhTW from './locales/zh-TW'

const LANG_KEY = 'typo-md-editor:lang'
const FALLBACK: Lang = 'en'

type Dict = Record<string, unknown>

const messages: Record<Lang, Dict> = {
  'zh-CN': zhCN as Dict,
  en: en as Dict,
  'zh-TW': zhTW as Dict,
}

/** Languages the editor ships with. Mirrors the Vue-i18n `availableLocales`. */
export const SUPPORTED_LANGS: Lang[] = ['zh-CN', 'en', 'zh-TW']

function readSavedLang(): Lang {
  if (typeof localStorage === 'undefined') return 'zh-CN'
  const saved = localStorage.getItem(LANG_KEY) as Lang | null
  return saved && (SUPPORTED_LANGS as string[]).includes(saved) ? saved : 'zh-CN'
}

// Module-level current language + subscriber set. This is the single source of
// truth shared by the framework-agnostic `setup.ts` (`i18n.global.t`) and the
// React binding (`useTranslation`).
let currentLang: Lang = readSavedLang()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

function resolve(key: string, dict: Dict): string {
  const parts = key.split('.')
  let node: unknown = dict
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Dict)) {
      node = (node as Dict)[p]
    } else {
      return key
    }
  }
  return typeof node === 'string' ? node : key
}

/**
 * Translate a dotted key (e.g. `'editor.codeCopy'`) for the active language.
 * An optional `params` map performs `{name}` style placeholder substitution,
 * mirroring vue-i18n's named interpolation (used by the settings dialog).
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  let str = resolve(key, messages[currentLang])
  if (params) {
    for (const k of Object.keys(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]))
    }
  }
  return str
}

/**
 * The `locale` object mirrors vue-i18n's `i18n.global.locale` ref: a `value`
 * getter/setter. Reading `i18n.global.locale.value` returns the active language;
 * assigning it switches language and notifies React subscribers (plus persists
 * to `localStorage`).
 */
const locale = {
  get value(): Lang {
    return currentLang
  },
  set value(lang: Lang) {
    const next = (SUPPORTED_LANGS as string[]).includes(lang) ? lang : FALLBACK
    if (next === currentLang) return
    currentLang = next
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* storage may be unavailable */
    }
    emit()
  },
}

/**
 * Compatibility object consumed by `src/milkdown/setup.ts` (`i18n.global.t`) and
 * the settings store (`i18n.global.locale.value`). Kept structurally identical to
 * the previous vue-i18n instance so those files need no changes.
 */
export const i18n = {
  global: {
    t: translate,
    locale,
  },
}

/** Public alias (also exported from the package root). */
export const typoI18n = i18n

// ── React binding ──────────────────────────────────────────────────────────

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Lang {
  return currentLang
}

/**
 * Optional provider. The current language is initialised from `localStorage` at
 * module load (matching the original behaviour), so this component is mainly a
 * convenience wrapper for host apps that prefer an explicit provider.
 */
export function TypoI18nProvider({ children }: { children: ReactNode }): ReactNode {
  return createElement(Fragment, null, children)
}

export interface TranslationApi {
  t: (key: string, params?: Record<string, string | number>) => string
  locale: Lang
  setLocale: (lang: Lang) => void
}

/**
 * Subscribe to language changes and return the translation helper. Safe to call
 * from any component (and works without a provider, reading module-level state).
 */
export function useTranslation(): TranslationApi {
  // Subscribe so the component re-renders when the language switches.
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    t: translate,
    locale: currentLang,
    setLocale: (lang: Lang) => {
      locale.value = lang
    },
  }
}
