// typo-md-editor 公共 API 总出口（对应设计文档 §2.1 公开 API 表）。

// ── 组件 ──────────────────────────────────────────────────────────
export { default as MdEditor } from './components/MdEditor.vue'
export type { EditorApi } from './components/MdEditor.vue'
export { default as OutlinePanel } from './components/sidebar/OutlinePanel.vue'
export { default as SettingsDialog } from './components/dialogs/SettingsDialog.vue'
export { default as FindDialog } from './components/dialogs/FindDialog.vue'

// ── 组合式 ────────────────────────────────────────────────────────
export { useMilkdown } from './composables/useMilkdown'
export { useFind } from './composables/useFind'
export { useHotkeys } from './composables/useHotkeys'
export { useEditorMenu } from './composables/useEditorMenu'

// ── 状态 ──────────────────────────────────────────────────────────
export { useEditorStore } from './stores/editor'
export { useSettingsStore } from './stores/settings'

// ── 动作层（命名空间导出） ─────────────────────────────────────────
export * as editorActions from './commands/actions'

// ── 主题 / 安装插件 / i18n ────────────────────────────────────────
export { THEMES, isDarkThemeId } from './themes'
export { typoPlugin, ensurePinia } from './install'

// ── 宿主挂载桥梁（React / 原生 DOM 集成用）────────────────────────────
// 必须与库内打包的同一份 Vue 实例一起导出，否则宿主另引一份 vue 会出现
// 「两个 Vue 副本」导致 app 无法挂载。typo-md-editor 是 lib 构建（不 externalize vue），
// 这里 re-export 的 createApp 即库内那份。
export { createApp, h, type App, type Component } from 'vue'
export { i18n as typoI18n, SUPPORTED_LANGS } from './i18n'

// ── 导出工具 ──────────────────────────────────────────────────────
export { toHtml, toMarkdown, toPdf, exportDocument, downloadBlob } from './utils/exporter'

// ── 纯函数 ────────────────────────────────────────────────────────
export { fileToDataUrl, rewriteImageSrcs } from './utils/images'
export { buildOutlineFromMarkdown } from './utils/outline'

// ── 类型 ──────────────────────────────────────────────────────────
export type { EditorInstance } from './milkdown/setup'
export type { ImageUploader } from './utils/images'
export type {
  Settings,
  ThemeDef,
  Lang,
  EditorMode,
  OutlineNode,
  HotkeySpec,
  ExportFormat,
  ThemeKind,
} from './types'
