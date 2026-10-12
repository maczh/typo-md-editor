import { Crepe } from '@milkdown/crepe'
import type { Editor } from '@milkdown/core'
import { editorViewCtx } from '@milkdown/core'
import type { EditorView } from '@milkdown/prose/view'
import { insert, getHTML as getHTMLCommand } from '@milkdown/utils'
import { oneDark } from '@codemirror/theme-one-dark'
import { i18n } from '@/i18n'
import { isDarkThemeId } from '@/themes'
import { mermaidDiagramPlugin } from './plugins/mermaid'
import { markdownMarkerPlugin } from './plugins/markdownMarker'
import { underline, underlineRemark } from './plugins/underline'
import { htmlToMarkdown } from '@/utils/import'
import { getImageUploader, type ImageUploader } from '@/utils/images'

/** A thin, stable wrapper around a Crepe editor instance. */
export interface EditorInstance {
  getMarkdown: () => Promise<string> | string
  getHTML: () => Promise<string> | string
  loadMarkdown: (markdown: string) => void
  destroy: () => void
  insert: (markdown: string) => void
  getEditor: () => Editor | null
  focus: () => void
  setReadonly: (value: boolean) => void
}

export interface CreateOptions {
  onChange?: (markdown: string) => void
  /** 图片上传器（image-block 用）；缺省走 `getImageUploader()` 注入点。 */
  onUpload?: ImageUploader
}

/** Access the underlying Milkdown `Editor` (Crepe exposes it as `editor`). */
function getCoreEditor(crepe: Crepe | null): Editor | null {
  if (!crepe) return null
  return (crepe as unknown as { editor?: Editor }).editor ?? null
}

/**
 * Whether the active theme is a dark theme. The `data-theme` attribute holds a
 * stable theme id; kind lookup goes through `src/themes.ts` (the single source
 * of truth shared with the settings store), so code-block highlighting
 * (oneDark) stays in sync with the chosen theme.
 */
function isDarkTheme(): boolean {
  const id = document.documentElement.getAttribute('data-theme') || ''
  return isDarkThemeId(id)
}

/**
 * Crepe's code block defaults to the **oneDark** CodeMirror theme, which is wrong
 * for a light page (washed-out syntax colors, a dark active-line gutter on a light
 * surface). Pick the CodeMirror theme that matches the app theme instead, and
 * localise the widgets Crepe injects into every code block.
 */
function crepeConfig(root: HTMLElement, defaultValue: string, options: CreateOptions) {
  const t = (key: string): string => i18n.global.t(key)
  return {
    root,
    defaultValue,
    featureConfigs: {
      'code-mirror': {
        theme: isDarkTheme() ? oneDark : [],
        copyText: t('editor.codeCopy'),
        searchPlaceholder: t('editor.codeSearchLanguage'),
        noResultText: t('editor.codeNoResult'),
        previewToggleText: (previewOnlyMode: boolean) =>
          previewOnlyMode ? t('editor.codePreviewEdit') : t('editor.codePreviewHide'),
      },
      'image-block': {
        // 图片上传统一走注入点：MdEditor 据 `onUpload` prop 调用
        // `setImageUploader`，默认回退 data:URL 上传器（与 ImageHandler 粘贴/
        // 拖拽、actions.pickAndInsertImage 同一入口，见 sequenceDiagram）。
        onUpload: options.onUpload ?? getImageUploader(),
      },
    },
  }
}

/**
 * Create a WYSIWYG editor backed by `@milkdown/crepe` (which bundles KaTeX math,
 * highlight.js, GFM tables and images with full markdown round-trip), plus a
 * custom Mermaid diagram plugin (Crepe ships no Mermaid feature of its own).
 *
 * `loadMarkdown` recreates the instance so the new content is loaded cleanly
 * without fighting the existing ProseMirror history.
 */
export async function createEditor(
  root: HTMLElement,
  defaultValue: string,
  options: CreateOptions = {},
): Promise<EditorInstance> {
  let crepe: Crepe | null = null
  let loading = false

  const attach = (instance: Crepe) => {
    instance.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        if (loading) return
        options.onChange?.(markdown)
      })
    })
  }

  const spawn = (initial: string): Crepe => {
    const instance = new Crepe(crepeConfig(root, initial, options))
    // Registered after Crepe's own features so the diagram decorations win.
    instance.addFeature<void>((editor) => {
      editor.use(mermaidDiagramPlugin)
      editor.use(markdownMarkerPlugin)
      // Real `underline` mark + its `<u>…</u>` markdown round-trip.
      editor.use(underline)
      editor.use(underlineRemark)
    })
    attach(instance)
    return instance
  }

  crepe = spawn(defaultValue)
  loading = true
  await (crepe as unknown as { create: () => Promise<void> }).create()
  loading = false

  // Paste with HTML flavour → Markdown. Captured on the container (ancestor of
  // the editable) in the *capture* phase so it runs before ProseMirror's own
  // paste handler, letting us replace the default rich-HTML insertion with a
  // Markdown round-trip. Plain-text paste is left untouched.
  root.addEventListener(
    'paste',
    (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return
      const html = dt.getData('text/html')
      if (!html || !html.trim()) return // plain text — let the default happen
      const editor = getCoreEditor(crepe)
      if (!editor) return
      // Inside a code block the user wants literal text, not Markdown — bail.
      let inCode = false
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as EditorView
        const parent = view.state.selection.$from.parent
        inCode = parent.type.name === 'code_block' || parent.type.name === 'fence'
      })
      if (inCode) return
      e.preventDefault()
      // Stop the event before it reaches the editable element so ProseMirror's
      // own paste handler (which would insert the raw HTML) never runs — without
      // this the converted Markdown would be inserted *and* the original HTML.
      e.stopPropagation()
      const md = htmlToMarkdown(html)
      if (!md) {
        // Conversion produced nothing useful — fall back to plain text.
        const text = dt.getData('text/plain')
        if (text) editor.action(insert(text))
        return
      }
      editor.action(insert(md))
    },
    true,
  )

  const getMarkdown = (): Promise<string> | string =>
    crepe ? (crepe as unknown as { getMarkdown: () => Promise<string> }).getMarkdown() : ''
  const getHTML = (): Promise<string> | string =>
    crepe ? (crepe.editor.action(getHTMLCommand()) as string) : ''
  const insertMarkdown = (markdown: string) => {
    const editor = getCoreEditor(crepe)
    if (!editor) return
    editor.action(insert(markdown))
  }
  const loadMarkdown = (markdown: string) => {
    if (!crepe) return
    void (crepe as unknown as { destroy: () => void }).destroy()
    crepe = spawn(markdown)
    loading = true
    void (crepe as unknown as { create: () => Promise<void> })
      .create()
      .then(() => {
        loading = false
      })
  }
  const destroy = () => {
    ;(crepe as unknown as { destroy: () => void } | null)?.destroy()
    crepe = null
  }
  const focus = () => {
    root.focus()
  }
  const getEditor = (): Editor | null => getCoreEditor(crepe)
  const setReadonly = (value: boolean) => {
    if (!crepe) return
    ;(crepe as unknown as { setReadonly: (v: boolean) => Crepe }).setReadonly(value)
  }

  return {
    getMarkdown,
    getHTML,
    loadMarkdown,
    destroy,
    insert: insertMarkdown,
    getEditor,
    focus,
    setReadonly,
  }
}
