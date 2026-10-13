import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Settings, ThemeDef, Lang } from '@/types'
import { THEMES, DEFAULT_THEME } from '@/themes'
import { i18n } from '@/i18n'
import { useStoreSafe } from '@/composables/useStoreSafe'

const SETTINGS_KEY = 'typo-md-editor:settings'
const LANG_KEY = 'typo-md-editor:lang'

const defaultSettings: Settings = {
  theme: DEFAULT_THEME,
  language: 'zh-CN',
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mode: 'normal',
  contentWidth: 80,
  customCss: '',
  hotkeys: {},
}

/** 默认设置（MdEditor 的 props 默认值也从这里取，避免两处字面量漂移）。 */
export { defaultSettings }

export interface SettingsState {
  settings: Settings
  themeList: ThemeDef[]
  load: () => Promise<void>
  persist: () => Promise<void>
  applyTheme: (id: string) => void
  applyTypography: () => void
  applyLayout: () => void
  applyCustomCss: (css: string) => void
  setLanguage: (lang: Lang) => void
  update: (partial: Partial<Settings>) => void
}

/** Settings store — theme, language and editor preferences (persisted to localStorage). */
export const settingsStore: StoreApi<SettingsState> = createStore<SettingsState>((set, get) => {
  function loadThemeCss(id: string): void {
    switch (id) {
      case 'gothic':
        void import('@/styles/themes/gothic.css')
        break
      case 'newsprint':
        void import('@/styles/themes/newsprint.css')
        break
      case 'night':
        void import('@/styles/themes/night.css')
        break
      case 'pixyll':
        void import('@/styles/themes/pixyll.css')
        break
      case 'whitey':
        void import('@/styles/themes/whitey.css')
        break
      default:
        void import('@/styles/themes/github.css')
    }
  }

  async function load(): Promise<void> {
    try {
      const raw =
        typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null
      if (raw) {
        const s = JSON.parse(raw) as Partial<Settings>
        set((state) => ({ settings: { ...state.settings, ...s } }))
      }
    } catch {
      /* keep defaults */
    }
    // Migrate legacy theme ids so old configs don't lose their theme.
    if (get().settings.theme === 'github-light') {
      set((state) => ({ settings: { ...state.settings, theme: 'github' } }))
    }
    if (get().settings.theme === 'nord-dark') {
      set((state) => ({ settings: { ...state.settings, theme: 'night' } }))
    }
    get().applyTheme(get().settings.theme)
    get().setLanguage(get().settings.language)
    get().applyTypography()
    get().applyLayout()
    get().applyCustomCss(get().settings.customCss)
  }

  async function persist(): Promise<void> {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(get().settings))
    } catch {
      /* non-fatal (e.g. storage disabled) */
    }
  }

  function applyTheme(id: string): void {
    set((state) => ({ settings: { ...state.settings, theme: id } }))
    const el = document.documentElement
    el.setAttribute('data-theme', id)
    loadThemeCss(id)
  }

  /** Push font size / line height / family into CSS variables. */
  function applyTypography(): void {
    const el = document.documentElement
    const s = get().settings
    el.style.setProperty('--font-size', `${s.fontSize}px`)
    el.style.setProperty('--line-height', String(s.lineHeight))
    el.style.setProperty('--font-family', s.fontFamily)
  }

  /** Push the WYSIWYG column width into its CSS variable. */
  function applyLayout(): void {
    const width = Number(get().settings.contentWidth)
    const safe = Number.isFinite(width) ? Math.min(100, Math.max(30, width)) : 80
    if (safe !== get().settings.contentWidth) {
      set((state) => ({ settings: { ...state.settings, contentWidth: safe } }))
    }
    document.documentElement.style.setProperty('--content-width', `${safe}%`)
  }

  /** Inject (or clear) user custom CSS into a dedicated <style> tag. */
  function applyCustomCss(css: string): void {
    set((state) => ({ settings: { ...state.settings, customCss: css } }))
    let el = document.getElementById('typo-custom-css') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'typo-custom-css'
      document.head.appendChild(el)
    }
    el.textContent = css
  }

  function setLanguage(lang: Lang): void {
    set((state) => ({ settings: { ...state.settings, language: lang } }))
    // Drives the shared i18n (and notifies React subscribers).
    i18n.global.locale.value = lang
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* ignore */
    }
  }

  function update(partial: Partial<Settings>): void {
    set((state) => ({ settings: { ...state.settings, ...partial } }))
  }

  return {
    settings: { ...defaultSettings },
    themeList: THEMES,
    load,
    persist,
    applyTheme,
    applyTypography,
    applyLayout,
    applyCustomCss,
    setLanguage,
    update,
  }
})

/**
 * Accessor that doubles as a React hook: subscribes during render, returns a
 * plain snapshot when called outside React (the preserved action layer calls it
 * at runtime). Store id carries a package prefix to avoid colliding with a host.
 */
export function useSettingsStore(): SettingsState {
  return useStoreSafe(settingsStore)
}
