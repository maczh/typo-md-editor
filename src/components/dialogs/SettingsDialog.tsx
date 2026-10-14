import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import {
  REBINDABLE,
  DEFAULT_HOTKEYS,
  formatHotkey,
  specFromEvent,
  sameHotkey,
  getEffectiveHotkeys,
} from '@/composables/useHotkeys'
import { useTranslation } from '@/i18n'
import type { HotkeySpec, EditorMode, Lang } from '@/types'

export interface SettingsDialogProps {
  modelValue?: boolean
  onClose: () => void
}

interface SettingsForm {
  theme: string
  language: string
  fontSize: number
  lineHeight: number
  fontFamily: string
  mode: string
  customCss: string
}

const INITIAL_FORM: SettingsForm = {
  theme: 'github',
  language: 'zh-CN',
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mode: 'normal',
  customCss: '',
}

const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
]
// 'source' used to be offered here, but `settings.mode` cannot enter source
// mode — that is toggled by Ctrl+/ (`useUI.sourceMode`), not by this setting.
// Picking it only added a dead CSS class, so the option is gone.
const MODES: { value: EditorMode; labelKey: string }[] = [
  { value: 'normal', labelKey: 'menu.normalMode' },
  { value: 'focus', labelKey: 'menu.focusMode' },
  { value: 'typewriter', labelKey: 'menu.typewriterMode' },
]

export default function SettingsDialog({ modelValue = true, onClose }: SettingsDialogProps) {
  const { t } = useTranslation()
  const settingsStore = useSettingsStore()

  const [form, setForm] = useState<SettingsForm>(INITIAL_FORM)
  const [tab, setTab] = useState<'general' | 'hotkeys'>('general')
  const [draft, setDraft] = useState<Record<string, HotkeySpec>>({})
  const [capturingId, setCapturingId] = useState<string | null>(null)
  const [conflict, setConflict] = useState('')

  function initDraft(): void {
    const eff = getEffectiveHotkeys()
    const next: Record<string, HotkeySpec> = {}
    for (const def of REBINDABLE) next[def.id] = eff[def.id] ?? { ...def.default }
    setDraft(next)
  }

  function startCapture(id: string): void {
    setCapturingId(id)
    setConflict('')
  }

  function onCapture(e: KeyboardEvent): void {
    if (!capturingId) return
    if (e.key === 'Escape') {
      setCapturingId(null)
      return
    }
    e.preventDefault()
    e.stopImmediatePropagation()
    const spec = specFromEvent(e)
    if (!spec) return // lone modifier — keep waiting for the real key
    const id = capturingId
    const other = REBINDABLE.find(
      (d) => d.id !== id && draft[d.id] && sameHotkey(draft[d.id], spec),
    )
    setConflict(other ? t('dialog.settings.conflict', { name: t(other.labelKey) }) : '')
    setDraft((d) => ({ ...d, [id]: spec }))
    setCapturingId(null)
  }

  // Keep a live ref to the latest onCapture so the window-level keydown
  // listener (registered once on mount) always sees the current capture state
  // instead of the stale mount-time closure (which would otherwise keep
  // `capturingId` frozen at its initial null and make rebinding dead).
  const onCaptureRef = useRef(onCapture)
  onCaptureRef.current = onCapture
  useEffect(() => {
    setForm({ ...settingsStore.settings })
    initDraft()
    const handler = (e: KeyboardEvent) => onCaptureRef.current(e)
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDefault = (id: string): boolean =>
    !!draft[id] && sameHotkey(draft[id], DEFAULT_HOTKEYS[id])

  function resetOne(id: string): void {
    setDraft((d) => ({ ...d, [id]: { ...DEFAULT_HOTKEYS[id] } }))
  }
  function resetAll(): void {
    initDraft()
    setConflict('')
  }

  const displayKey = (id: string): string =>
    formatHotkey(draft[id]) || t('dialog.settings.noShortcut')

  async function save(): Promise<void> {
    const overrides: Record<string, HotkeySpec> = {}
    for (const def of REBINDABLE) {
      const d = draft[def.id]
      if (d && !sameHotkey(d, DEFAULT_HOTKEYS[def.id])) overrides[def.id] = d
    }
    settingsStore.update({
      theme: form.theme,
      language: form.language as Lang,
      fontSize: form.fontSize,
      lineHeight: form.lineHeight,
      fontFamily: form.fontFamily,
      mode: form.mode as EditorMode,
      customCss: form.customCss,
      hotkeys: overrides,
    })
    settingsStore.applyTheme(form.theme)
    settingsStore.setLanguage(form.language as Lang)
    settingsStore.applyTypography()
    settingsStore.applyCustomCss(form.customCss)
    await settingsStore.persist()
    onClose()
  }

  function cancel(): void {
    onClose()
  }

  if (!modelValue) return null

  return (
    <div className="dialog-mask" onClick={(e) => e.target === e.currentTarget && cancel()}>
      <div className="dialog">
        <h2>{t('dialog.settings.title')}</h2>

        <div className="tabs">
          <button
            type="button"
            className={tab === 'general' ? 'active' : ''}
            onClick={() => setTab('general')}
          >
            {t('dialog.settings.general')}
          </button>
          <button
            type="button"
            className={tab === 'hotkeys' ? 'active' : ''}
            onClick={() => setTab('hotkeys')}
          >
            {t('dialog.settings.hotkeys')}
          </button>
        </div>

        {tab === 'general' && (
          <div className="tab-body">
            <div className="field">
              <label>{t('dialog.settings.theme')}</label>
              <select
                value={form.theme}
                onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
              >
                {settingsStore.themeList.map((th) => (
                  <option key={th.id} value={th.id}>
                    {th.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>{t('dialog.settings.language')}</label>
              <select
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>{t('dialog.settings.fontSize')}</label>
              <input
                type="number"
                value={form.fontSize}
                min={10}
                max={36}
                onChange={(e) => setForm((f) => ({ ...f, fontSize: Number(e.target.value) }))}
              />
            </div>

            <div className="field">
              <label>{t('dialog.settings.lineHeight')}</label>
              <input
                type="number"
                step={0.1}
                value={form.lineHeight}
                min={1}
                max={3}
                onChange={(e) => setForm((f) => ({ ...f, lineHeight: Number(e.target.value) }))}
              />
            </div>

            <div className="field">
              <label>{t('dialog.settings.fontFamily')}</label>
              <input
                type="text"
                value={form.fontFamily}
                onChange={(e) => setForm((f) => ({ ...f, fontFamily: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>{t('dialog.settings.mode')}</label>
              <select
                value={form.mode}
                onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as EditorMode }))}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>{t('dialog.settings.customCss')}</label>
              <textarea
                rows={4}
                value={form.customCss}
                placeholder="body { color: #333; }"
                onChange={(e) => setForm((f) => ({ ...f, customCss: e.target.value }))}
              />
            </div>
          </div>
        )}

        {tab === 'hotkeys' && (
          <div className="tab-body hotkeys">
            <p className="hint">{t('dialog.settings.hotkeyHint')}</p>
            <div className="hk-list">
              {REBINDABLE.map((def) => (
                <div key={def.id} className="hk-row">
                  <span className="hk-label">{t(def.labelKey)}</span>
                  <span className={`hk-key${capturingId === def.id ? ' capturing' : ''}`}>
                    {capturingId === def.id
                      ? t('dialog.settings.capturing')
                      : displayKey(def.id)}
                  </span>
                  <button
                    type="button"
                    className="hk-btn"
                    onClick={() => startCapture(def.id)}
                  >
                    {t('dialog.settings.rebind')}
                  </button>
                  <button
                    type="button"
                    className="hk-btn"
                    disabled={isDefault(def.id)}
                    onClick={() => resetOne(def.id)}
                  >
                    {t('dialog.settings.reset')}
                  </button>
                </div>
              ))}
            </div>
            <div className="hk-actions">
              <button type="button" className="btn" onClick={resetAll}>
                {t('dialog.settings.resetAll')}
              </button>
            </div>
            {conflict && <p className="hk-conflict">{conflict}</p>}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={cancel}>
            {t('dialog.settings.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            {t('dialog.settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
