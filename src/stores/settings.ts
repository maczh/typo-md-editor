import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { Settings, ThemeDef, Lang } from '@/types'
import { THEMES, DEFAULT_THEME } from '@/themes'
import { i18n } from '@/i18n'

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

/**
 * Settings store — theme, language and editor preferences.
 * Persists to `localStorage` under the `typo-md-editor:settings` key (the
 * package never touches the filesystem; hosts own persistence).
 *
 * Store id 带包名前缀（`typo-settings`），避免与宿主 store 撞名。
 */
export const useSettingsStore = defineStore('typo-settings', () => {
  const settings = reactive<Settings>({ ...defaultSettings })
  const themeList = ref<ThemeDef[]>(THEMES)

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
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const s = JSON.parse(raw) as Partial<Settings>
        Object.assign(settings, s)
      }
    } catch {
      /* keep defaults */
    }
    // Migrate legacy theme ids so old configs don't lose their theme.
    if (settings.theme === 'github-light') settings.theme = 'github'
    if (settings.theme === 'nord-dark') settings.theme = 'night'
    applyTheme(settings.theme)
    setLanguage(settings.language)
    applyTypography()
    applyLayout()
    applyCustomCss(settings.customCss)
  }

  async function persist(): Promise<void> {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* non-fatal (e.g. storage disabled) */
    }
  }

  function applyTheme(id: string): void {
    settings.theme = id
    const el = document.documentElement
    el.setAttribute('data-theme', id)
    loadThemeCss(id)
  }

  /** Push font size / line height / family into CSS variables. */
  function applyTypography(): void {
    const el = document.documentElement
    el.style.setProperty('--font-size', `${settings.fontSize}px`)
    el.style.setProperty('--line-height', String(settings.lineHeight))
    el.style.setProperty('--font-family', settings.fontFamily)
  }

  /** Push the WYSIWYG column width into its CSS variable. */
  function applyLayout(): void {
    const width = Number(settings.contentWidth)
    const safe = Number.isFinite(width) ? Math.min(100, Math.max(30, width)) : 70
    settings.contentWidth = safe
    document.documentElement.style.setProperty('--content-width', `${safe}%`)
  }

  /** Inject (or clear) user custom CSS into a dedicated <style> tag. */
  function applyCustomCss(css: string): void {
    settings.customCss = css
    let el = document.getElementById('typo-custom-css') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'typo-custom-css'
      document.head.appendChild(el)
    }
    el.textContent = css
  }

  function setLanguage(lang: Lang): void {
    settings.language = lang
    i18n.global.locale.value = lang as Lang
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* ignore */
    }
  }

  function update(partial: Partial<Settings>): void {
    Object.assign(settings, partial)
  }

  return {
    settings,
    themeList,
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
