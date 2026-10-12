// Core TypeScript types shared across the editor package.
// These are the single source of truth for the Vue / Pinia layer.

export type Lang = 'zh-CN' | 'en' | 'zh-TW'

export type EditorMode = 'normal' | 'focus' | 'typewriter' | 'source'

export type ThemeKind = 'light' | 'dark'

/** The currently open document — Markdown source is the single source of truth. */
export interface EditorDoc {
  name: string
  /** Markdown source (source of truth). */
  content: string
  dirty: boolean
  savedAt: number | null
}

/** A node in the document outline (H1–H6). */
export interface OutlineNode {
  id: string
  level: number // 1-6
  text: string
  pos: number // ProseMirror position, used for scroll-to
  children: OutlineNode[]
}

/** A single hotkey binding (layout-independent; `code` preferred for keys whose
 *  `key` changes with Shift, e.g. Backquote `→ ~`). */
export interface HotkeySpec {
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  /** Normalized key, lowercased (e.g. 'b', '1', 'enter', 'f8', 'backquote'). */
  key?: string
  /** Physical key code (e.g. 'Backquote') for layout-independent matching. */
  code?: string
}

/** Editor / appearance settings (persisted via localStorage). */
export interface Settings {
  theme: string
  language: Lang
  fontSize: number
  lineHeight: number
  fontFamily: string
  mode: EditorMode
  /** WYSIWYG content column width, as a percentage of the editor pane. */
  contentWidth: number
  customCss: string
  /** Per-command hotkey overrides, keyed by command id. Missing ids fall back
   *  to the built-in defaults. */
  hotkeys?: Record<string, HotkeySpec>
}

/** A selectable theme definition. */
export interface ThemeDef {
  id: string
  name: string
  kind: ThemeKind
  cssPath?: string
}

/** Supported export formats. */
export type ExportFormat = 'markdown' | 'html' | 'pdf'
