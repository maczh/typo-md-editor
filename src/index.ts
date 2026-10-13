// typo-md-editor 公共 API 总出口（React 端口，对应设计文档 §2.1 公开 API 表）。

// ── 组件 ──────────────────────────────────────────────────────────
export { default as MdEditor, type EditorApi, type MdEditorProps } from './components/MdEditor'
export { default as OutlinePanel } from './components/sidebar/OutlinePanel'
export { default as SettingsDialog } from './components/dialogs/SettingsDialog'
export { default as FindDialog } from './components/dialogs/FindDialog'

// ── 组合式（React Hooks）──────────────────────────────────────────
export { useMilkdown } from './composables/useMilkdown'
export { useFind } from './composables/useFind'
export { useHotkeys } from './composables/useHotkeys'
export { useEditorMenu } from './composables/useEditorMenu'
export { useUI } from './composables/useUI'
export { useSourceMode } from './composables/useSourceMode'

// ── 状态 ──────────────────────────────────────────────────────────
export { useEditorStore } from './stores/editor'
export { useSettingsStore, defaultSettings } from './stores/settings'

// ── 动作层（命名空间导出） ─────────────────────────────────────────
export * as editorActions from './commands/actions'

// ── 主题 / 安装插件 / i18n ────────────────────────────────────────
export { THEMES, isDarkThemeId } from './themes'
export { typoPlugin, ensureStore, TypoProvider } from './install'

// ── 宿主挂载桥梁（React 等价物；Vue 端口曾导出 createApp / h / Component）──
export { createElement as h, Fragment, type ReactNode, type FC } from 'react'

// ── i18n ─────────────────────────────────────────────────────────
export {
  i18n,
  typoI18n,
  SUPPORTED_LANGS,
  useTranslation,
  TypoI18nProvider,
} from './i18n'

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

// ── 组件样式（原 SFC <style scoped> 块；随库打包进 dist/style.css）────
import './styles/components.css'
