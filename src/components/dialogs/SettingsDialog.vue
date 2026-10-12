<script setup lang="ts">
import { reactive, ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import {
  REBINDABLE,
  DEFAULT_HOTKEYS,
  formatHotkey,
  specFromEvent,
  sameHotkey,
  getEffectiveHotkeys,
} from '@/composables/useHotkeys'
import type { HotkeySpec, EditorMode, Lang } from '@/types'

/**
 * 设置对话框。可见性由宿主控制（MdEditor 按 useUI().settingsOpen 做 v-if）；
 * 关闭动作经 `close` 事件上交，`modelValue` 供宿主自行布放时绑定。
 */
const props = withDefaults(defineProps<{ modelValue?: boolean }>(), { modelValue: true })
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const settingsStore = useSettingsStore()

// Local form uses string-typed fields so native <select v-model> binds cleanly;
// values are cast to the strict union types on save.
interface SettingsForm {
  theme: string
  language: string
  fontSize: number
  lineHeight: number
  fontFamily: string
  mode: string
  customCss: string
}

const form = reactive<SettingsForm>({
  theme: 'github',
  language: 'zh-CN',
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mode: 'normal',
  customCss: '',
})

const languages: { value: Lang; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
]
const modes: EditorMode[] = ['normal', 'focus', 'typewriter', 'source']

// ── Hotkey management ──────────────────────────────────────────────
const tab = ref<'general' | 'hotkeys'>('general')
const draft = reactive<Record<string, HotkeySpec>>({})
const capturingId = ref<string | null>(null)
const conflict = ref('')

function initDraft(): void {
  const eff = getEffectiveHotkeys()
  for (const def of REBINDABLE) draft[def.id] = eff[def.id] ?? { ...def.default }
}

function startCapture(id: string): void {
  capturingId.value = id
  conflict.value = ''
}

function onCapture(e: KeyboardEvent): void {
  if (!capturingId.value) return
  if (e.key === 'Escape') {
    capturingId.value = null
    return
  }
  e.preventDefault()
  e.stopImmediatePropagation()
  const spec = specFromEvent(e)
  if (!spec) return // lone modifier — keep waiting for the real key
  const id = capturingId.value
  const other = REBINDABLE.find(
    (d) => d.id !== id && draft[d.id] && sameHotkey(draft[d.id], spec),
  )
  conflict.value = other ? t('dialog.settings.conflict', { name: t(other.labelKey) }) : ''
  draft[id] = spec
  capturingId.value = null
}

onMounted(() => {
  Object.assign(form, settingsStore.settings)
  initDraft()
  window.addEventListener('keydown', onCapture, true)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onCapture, true))

const isDefault = (id: string): boolean =>
  !!draft[id] && sameHotkey(draft[id], DEFAULT_HOTKEYS[id])

function resetOne(id: string): void {
  draft[id] = { ...DEFAULT_HOTKEYS[id] }
}
function resetAll(): void {
  initDraft()
  conflict.value = ''
}

const displayKey = (id: string): string =>
  formatHotkey(draft[id]) || t('dialog.settings.noShortcut')

async function save(): Promise<void> {
  // Persist only the overrides that differ from the built-in defaults.
  const overrides: Record<string, HotkeySpec> = {}
  for (const def of REBINDABLE) {
    const d = draft[def.id]
    if (d && !sameHotkey(d, DEFAULT_HOTKEYS[def.id])) overrides[def.id] = d
  }
  settingsStore.update({
    ...form,
    language: form.language as Lang,
    mode: form.mode as EditorMode,
    hotkeys: overrides,
  } as never)
  settingsStore.applyTheme(form.theme)
  settingsStore.setLanguage(form.language as Lang)
  settingsStore.applyTypography()
  settingsStore.applyCustomCss(form.customCss)
  await settingsStore.persist()
  emit('close')
}

function cancel(): void {
  emit('close')
}
</script>

<template>
  <div v-if="modelValue" class="dialog-mask" @click.self="cancel">
    <div class="dialog">
      <h2>{{ t('dialog.settings.title') }}</h2>

      <div class="tabs">
        <button type="button" :class="{ active: tab === 'general' }" @click="tab = 'general'">
          {{ t('dialog.settings.general') }}
        </button>
        <button type="button" :class="{ active: tab === 'hotkeys' }" @click="tab = 'hotkeys'">
          {{ t('dialog.settings.hotkeys') }}
        </button>
      </div>

      <div v-if="tab === 'general'" class="tab-body">
        <div class="field">
          <label>{{ t('dialog.settings.theme') }}</label>
          <select v-model="form.theme">
            <option v-for="th in settingsStore.themeList" :key="th.id" :value="th.id">
              {{ th.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label>{{ t('dialog.settings.language') }}</label>
          <select v-model="form.language">
            <option v-for="l in languages" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </div>

        <div class="field">
          <label>{{ t('dialog.settings.fontSize') }}</label>
          <input type="number" v-model.number="form.fontSize" min="10" max="36" />
        </div>

        <div class="field">
          <label>{{ t('dialog.settings.lineHeight') }}</label>
          <input type="number" step="0.1" v-model.number="form.lineHeight" min="1" max="3" />
        </div>

        <div class="field">
          <label>{{ t('dialog.settings.fontFamily') }}</label>
          <input type="text" v-model="form.fontFamily" />
        </div>

        <div class="field">
          <label>{{ t('dialog.settings.mode') }}</label>
          <select v-model="form.mode">
            <option v-for="m in modes" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div class="field">
          <label>{{ t('dialog.settings.customCss') }}</label>
          <textarea rows="4" v-model="form.customCss" placeholder="body { color: #333; }"></textarea>
        </div>
      </div>

      <div v-else class="tab-body hotkeys">
        <p class="hint">{{ t('dialog.settings.hotkeyHint') }}</p>
        <div class="hk-list">
          <div v-for="def in REBINDABLE" :key="def.id" class="hk-row">
            <span class="hk-label">{{ t(def.labelKey) }}</span>
            <span class="hk-key" :class="{ capturing: capturingId === def.id }">
              {{ capturingId === def.id ? t('dialog.settings.capturing') : displayKey(def.id) }}
            </span>
            <button type="button" class="hk-btn" @click="startCapture(def.id)">
              {{ t('dialog.settings.rebind') }}
            </button>
            <button type="button" class="hk-btn" :disabled="isDefault(def.id)" @click="resetOne(def.id)">
              {{ t('dialog.settings.reset') }}
            </button>
          </div>
        </div>
        <div class="hk-actions">
          <button type="button" class="btn" @click="resetAll">{{ t('dialog.settings.resetAll') }}</button>
        </div>
        <p v-if="conflict" class="hk-conflict">{{ conflict }}</p>
      </div>

      <div class="dialog-actions">
        <button class="btn" @click="cancel">{{ t('dialog.settings.cancel') }}</button>
        <button class="btn btn-primary" @click="save">{{ t('dialog.settings.save') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.dialog {
  width: 440px;
  max-width: 92vw;
  max-height: 86vh;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 22px 22px 18px;
}
.dialog h2 {
  margin: 0 0 14px;
  font-size: 17px;
  color: var(--fg);
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  border: none;
  background: transparent;
  color: var(--fg-muted);
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  font-size: 13px;
}
.tabs button.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.tab-body {
  min-height: 240px;
}
.field {
  margin-bottom: 12px;
}
.hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--fg-muted);
}
.hk-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 46vh;
  overflow: auto;
}
.hk-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border-bottom: 1px solid var(--border);
}
.hk-label {
  font-size: 13px;
  color: var(--fg);
}
.hk-key {
  min-width: 92px;
  text-align: center;
  font-size: 12px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--sidebar-bg);
  color: var(--fg-muted);
}
.hk-key.capturing {
  color: var(--accent);
  border-color: var(--accent);
}
.hk-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  border-radius: 5px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 12px;
}
.hk-btn:hover:not(:disabled) {
  background: var(--accent-soft);
}
.hk-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.hk-actions {
  margin-top: 12px;
}
.hk-conflict {
  margin: 8px 0 0;
  font-size: 12px;
  color: #c0392b;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  border-radius: 6px;
  padding: 6px 18px;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover {
  background: var(--accent-soft);
}
.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.btn-primary:hover {
  filter: brightness(1.05);
}
</style>
