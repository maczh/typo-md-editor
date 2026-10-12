import type { Editor } from '@milkdown/core'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore } from '@/stores/settings'
import { useUI } from '@/composables/useUI'
import { readClipboardText, writeClipboardText } from '@/composables/useClipboard'
import { requestSave as requestSaveViaBus } from '@/composables/useSaveRequest'
import { showToast } from '@/utils/toast'
import { getImageUploader } from '@/utils/images'
import {
  insertTable as insertTablePlugin,
  addRow as tableAddRow,
  removeRow as tableRemoveRow,
  addColumn as tableAddColumn,
  removeColumn as tableRemoveColumn,
  removeTable as tableRemoveTable,
  moveRow as tableMoveRow,
  moveColumn as tableMoveColumn,
  clearColumnWidths as tableClearWidths,
  tableToMarkdown,
} from '@/milkdown/plugins/table'
import { insertMath } from '@/milkdown/plugins/latex'
import { insertDiagram } from '@/milkdown/plugins/mermaid'
import { findTemplate } from '@/milkdown/plugins/mermaidTemplates'
import { insertImage } from '@/milkdown/plugins/image'
import { insert } from '@milkdown/utils'
import * as prose from './prose'
import type { Lang } from '@/types'

/**
 * Editor command actions — the single implementation every surface
 * (toolbar, floating menu, keymap) calls into. Stores/composables
 * are resolved lazily so this module is safe to import anywhere after Pinia is
 * installed.
 *
 * File / export / window actions of the desktop shell are intentionally absent:
 * saving goes through the `@save` event bus, exporting through the browser
 * (see MdEditor's `exportMarkdown` / `exportHtml` / `print`).
 */

async function getMarkdown(): Promise<string> {
  const milkdown = useMilkdown()
  const editor = useEditorStore()
  try {
    const md = await milkdown.getMarkdown()
    return md || editor.doc.content
  } catch {
    return editor.doc.content
  }
}

function withEditor(fn: (editor: Editor) => void): void {
  const e = useMilkdown().getEditor()
  if (!e) {
    showToast('编辑器尚未就绪', 'error')
    return
  }
  fn(e)
}

/* ---------------------------- save ---------------------------- */

/**
 * Ask the host to persist the document. The package itself never writes files
 * (shared convention); the registered handler emits `save` on MdEditor.
 */
export function requestSave(): void {
  requestSaveViaBus()
}

/* ---------------------------- edit ---------------------------- */

export function undo(): void {
  withEditor((e) => prose.undo(e))
}

export function redo(): void {
  withEditor((e) => prose.redo(e))
}

export function cut(): void {
  const editor = useMilkdown().getEditor()
  const range = prose.getSelectionRange(editor)
  if (!range || range.empty) {
    showToast('请先选中要剪切的内容', 'info')
    return
  }
  const text = prose.getSelectionText(editor)
  void writeClipboardText(text).then((ok) => {
    if (!ok) {
      showToast('剪切失败：无法写入系统剪贴板', 'error')
      return
    }
    withEditor((e) => {
      prose.setSelectionRange(e, range.from, range.to)
      prose.deleteSelection(e)
    })
  })
}

export function copySelection(): void {
  const text = prose.getSelectionText(useMilkdown().getEditor())
  if (!text) {
    showToast('请先选中要复制的内容', 'info')
    return
  }
  void writeClipboardText(text).then((ok) => {
    showToast(ok ? '已复制' : '复制失败：剪贴板不可用', ok ? 'info' : 'error')
  })
}

/** Paste the clipboard, letting Markdown syntax in it take effect. */
export function paste(): void {
  void (async () => {
    const text = await readClipboardText()
    if (!text) {
      showToast('无法读取剪贴板内容（可改用 Ctrl+V）', 'error')
      return
    }
    withEditor((e) => e.action(insert(text)))
  })()
}

export async function copyAsMarkdown(): Promise<void> {
  await copyText(await getMarkdown())
}

export async function pasteAsPlainText(): Promise<void> {
  const text = await readClipboardText()
  if (!text) {
    showToast('无法读取剪贴板内容（可改用 Ctrl+Shift+V）', 'error')
    return
  }
  withEditor((e) => prose.insertPlainText(e, text))
}

async function copyText(text: string): Promise<void> {
  const ok = await writeClipboardText(text)
  showToast(ok ? '已复制' : '复制失败：剪贴板不可用', ok ? 'info' : 'error')
}

export function selectAll(): void {
  withEditor((e) => prose.selectAll(e))
}

/**
 * Re-apply `from`/`to` and give the editor focus back.
 *
 * Floating menus (block handle, right-click) live outside the editor DOM, so the
 * click that triggers an item leaves ProseMirror's `state.selection` and the real
 * DOM selection out of sync. Every menu item must call this first — otherwise the
 * command applies to the wrong place, and clipboard actions (`execCommand`) do
 * nothing at all because they operate on the live DOM selection.
 */
export function restoreSelection(from: number, to: number): void {
  withEditor((e) => prose.setSelectionRange(e, from, to))
}

export function focusEditor(): void {
  withEditor((e) => prose.focus(e))
}

/**
 * The 🗑 button. With a selection it removes just that text; on a bare caret
 * (the block-handle entry point) it removes the whole block, which is what
 * Typora's block menu does.
 */
export function deleteSelection(): void {
  withEditor((e) => {
    const range = prose.getSelectionRange(e)
    if (range && !range.empty) {
      prose.deleteSelection(e)
      return
    }
    if (!prose.deleteBlock(e)) showToast('当前位置没有可删除的内容块', 'info')
  })
}

export function openFind(find = true): void {
  useUI().openFind()
  void find
}

/* ---------------------------- paragraph ---------------------------- */

export function setHeading(level: number): void {
  withEditor((e) => prose.setHeading(e, level))
}

export function setParagraph(): void {
  withEditor((e) => prose.setParagraph(e))
}

export function increaseHeadingLevel(): void {
  withEditor((e) => prose.bumpHeading(e, -1))
}

export function decreaseHeadingLevel(): void {
  withEditor((e) => prose.bumpHeading(e, 1))
}

export function insertTable(): void {
  withEditor((e) => insertTablePlugin(e))
}

/* ---------------------------- table operations (context menu) ---------------------------- */

export function tableRowAbove(): void {
  withEditor((e) => tableAddRow(e, false))
}

export function tableRowBelow(): void {
  withEditor((e) => tableAddRow(e, true))
}

export function tableColLeft(): void {
  withEditor((e) => tableAddColumn(e, false))
}

export function tableColRight(): void {
  withEditor((e) => tableAddColumn(e, true))
}

export function tableDeleteRow(): void {
  withEditor((e) => tableRemoveRow(e))
}

export function tableDeleteCol(): void {
  withEditor((e) => tableRemoveColumn(e))
}

export function tableDelete(): void {
  withEditor((e) => tableRemoveTable(e))
}

export function tableMoveRowUp(): void {
  withEditor((e) => tableMoveRow(e, -1))
}

export function tableMoveRowDown(): void {
  withEditor((e) => tableMoveRow(e, 1))
}

export function tableMoveColLeft(): void {
  withEditor((e) => tableMoveColumn(e, -1))
}

export function tableMoveColRight(): void {
  withEditor((e) => tableMoveColumn(e, 1))
}

export function tableFormat(): void {
  withEditor((e) => tableClearWidths(e))
  showToast('已格式化表格：列宽随内容自适应', 'info')
}

export async function tableCopy(): Promise<void> {
  const e = useMilkdown().getEditor()
  if (!e) return
  const md = tableToMarkdown(e)
  if (!md) return
  const ok = await writeClipboardText(md)
  showToast(ok ? '已复制表格（Markdown）' : '复制失败：剪贴板不可用', ok ? 'info' : 'error')
}

export function insertCodeBlock(): void {
  withEditor((e) => prose.setCodeBlock(e))
}

/* ---------------------------- code tools (paragraph menu) ---------------------------- */

/** Copy the plain text of the code block at the caret to the clipboard. */
export async function copyCodeBlockContent(): Promise<void> {
  const text = prose.getCodeBlockText(useMilkdown().getEditor())
  if (text == null) {
    showToast('光标不在代码块内', 'info')
    return
  }
  const ok = await writeClipboardText(text)
  showToast(ok ? '已复制代码块内容' : '复制失败：剪贴板不可用', ok ? 'info' : 'error')
}

/** Indent the lines intersecting the current selection by two spaces. */
export function indentSelectedLines(): void {
  withEditor((e) => prose.indentCodeLines(e, 'selection'))
}

/** Indent every line of the code block at the caret by two spaces. */
export function indentCodeBlock(): void {
  withEditor((e) => prose.indentCodeLines(e, 'all'))
}

/** Insert a GitHub-style alert block of the given type. */
export function insertAlert(type: prose.AlertType): void {
  withEditor((e) => prose.insertAlert(e, type))
}

/** Set the checkbox state of the task-list item containing the caret. */
export function setTaskStatus(status: prose.TaskStatus): void {
  withEditor((e) => prose.setTaskStatus(e, status))
}

export function insertMathBlock(): void {
  withEditor((e) => insertMath(e, 'E = mc^2', true))
}

export function insertInlineMath(): void {
  withEditor((e) => insertMath(e, 'E = mc^2', false))
}

export function insertBlockquote(): void {
  withEditor((e) => prose.toggleBlockquote(e))
}

export function insertOrderedList(): void {
  withEditor((e) => prose.toggleOrderedList(e))
}

export function insertUnorderedList(): void {
  withEditor((e) => prose.toggleBulletList(e))
}

export function insertTaskList(): void {
  withEditor((e) => prose.toggleTaskList(e))
}

export function indentList(): void {
  withEditor((e) => prose.sinkIndent(e))
}

export function outdentList(): void {
  withEditor((e) => prose.liftIndent(e))
}

export function insertParagraphAbove(): void {
  withEditor((e) => prose.insertParagraphAbove(e))
}

export function insertParagraphBelow(): void {
  withEditor((e) => prose.insertParagraphBelow(e))
}

export function insertLinkReference(): void {
  withEditor((e) => prose.insertLinkReference(e))
}

export function insertFootnote(): void {
  withEditor((e) => prose.insertFootnote(e))
}

export function insertHorizontalRule(): void {
  withEditor((e) => prose.insertHorizontalRule(e))
}

export function insertToc(): void {
  withEditor((e) => prose.insertToc(e))
}

export function insertYamlFrontMatter(): void {
  withEditor((e) => prose.insertYamlFrontMatter(e))
}

export function insertDiagramBlock(): void {
  withEditor((e) => insertDiagram(e, findTemplate('flowchart').code))
}

/** Insert an example ```` ```mermaid ```` block for the chosen diagram type. */
export function insertDiagramTemplate(id: string): void {
  withEditor((e) => insertDiagram(e, findTemplate(id).code))
}

/* ---------------------------- format ---------------------------- */

export function toggleBold(): void {
  withEditor((e) => {
    if (!prose.toggleBold(e)) showToast('当前上下文不支持加粗', 'info')
  })
}

export function toggleItalic(): void {
  withEditor((e) => {
    if (!prose.toggleItalic(e)) showToast('当前上下文不支持斜体', 'info')
  })
}

export function toggleUnderline(): void {
  withEditor((e) => {
    if (!prose.toggleUnderline(e)) showToast('当前上下文不支持下划线', 'info')
  })
}

export function toggleInlineCode(): void {
  withEditor((e) => {
    // A click in the top toolbar / format menu blurs the editor; re-apply the
    // captured selection and hand focus back so the mark toggles on the *selected*
    // text (the floating/context menu already does this via restoreSelection — we
    // mirror it here so every surface behaves identically).
    const range = prose.getSelectionRange(e)
    if (range && !range.empty) prose.setSelectionRange(e, range.from, range.to)
    prose.toggleInlineCode(e)
  })
}

export function toggleStrike(): void {
  withEditor((e) => {
    if (!prose.toggleStrike(e)) showToast('当前上下文不支持删除线', 'info')
  })
}

export function insertComment(): void {
  withEditor((e) => prose.insertComment(e))
}

export function insertHyperlink(): void {
  withEditor((e) => {
    // Preserve the current selection across the click that opened the toolbar /
    // menu (the editor blurs), then add the link to the selected text instead of
    // replacing it with a placeholder.
    const range = prose.getSelectionRange(e)
    if (range && !range.empty) prose.setSelectionRange(e, range.from, range.to)
    prose.insertLink(e)
  })
}

export function insertLocalImage(): void {
  pickAndInsertImage()
}

/**
 * Open a file picker and insert the chosen image. The bytes go through the
 * injected uploader (`getImageUploader()` — the host's `onUpload` prop or the
 * built-in FileReader → data: URL fallback); the package never writes to disk.
 */
export function pickAndInsertImage(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    const e = useMilkdown().getEditor()
    if (!e) return
    try {
      const src = await getImageUploader()(file)
      insertImage(e, src, file.name)
    } catch (err) {
      showToast(`${(err as Error).message || '图片插入失败'}`, 'error')
    }
  }
  input.click()
}

export function clearStyle(): void {
  withEditor((e) => prose.clearFormatting(e))
}

/* ---------------------------- link operations (format menu) ---------------------------- */

/** Open the link under the caret in a new browser tab. */
export async function openLink(): Promise<void> {
  const href = prose.getLinkHref(useMilkdown().getEditor())
  if (!href) {
    showToast('光标不在链接上', 'info')
    return
  }
  window.open(href, '_blank')
}

/** Copy the `href` of the link under the caret to the clipboard. */
export async function copyLinkAddress(): Promise<void> {
  const href = prose.getLinkHref(useMilkdown().getEditor())
  if (!href) {
    showToast('光标不在链接上', 'info')
    return
  }
  const ok = await writeClipboardText(href)
  showToast(ok ? '已复制链接地址' : '复制失败：剪贴板不可用', ok ? 'info' : 'error')
}

/** Prompt for a new URL and rewrite the link mark at the caret. */
export async function editLink(): Promise<void> {
  const editor = useMilkdown().getEditor()
  if (!editor) return
  const current = prose.getLinkHref(editor) ?? 'https://'
  const next = window.prompt('编辑链接地址', current)
  if (next == null || next === '') return
  const range = prose.getLinkRange(editor)
  if (range) prose.setLinkHref(editor, range.from, range.to, next)
  else prose.setLinkHref(editor, 0, 0, next)
}

/** Remove the link mark over the selection. */
export function removeLink(): void {
  withEditor((e) => prose.removeLink(e))
}

/* ---------------------------- image submenu (format menu) ---------------------------- */

/** Insert an image from a URL entered in a prompt. */
export function insertRemoteImage(): void {
  const url = window.prompt('输入图片 URL', 'https://')
  if (!url) return
  const editor = useMilkdown().getEditor()
  if (editor) insertImage(editor, url, '')
}

/** Reload all images — re-focus the editor so decorations/embeds rebuild. */
export function reloadAllImages(): void {
  const editor = useMilkdown().getEditor()
  if (editor) prose.focus(editor)
  showToast('已刷新图片', 'info')
}

/* ---------------------------- view ---------------------------- */

export function toggleSourceMode(): void {
  const ui = useUI()
  const milkdown = useMilkdown()
  const editor = useEditorStore()
  if (!ui.sourceMode.value) {
    void (async () => {
      try {
        const md = await milkdown.getMarkdown()
        if (md) editor.doc.content = md
      } catch {
        /* keep store content */
      }
      ui.sourceMode.value = true
    })()
  } else {
    ui.sourceMode.value = false
  }
}

export function setMode(mode: 'normal' | 'focus' | 'typewriter'): void {
  const settings = useSettingsStore()
  settings.update({ mode })
  void settings.persist()
}

export function toggleFocusMode(): void {
  const settings = useSettingsStore()
  setMode(settings.settings.mode === 'focus' ? 'normal' : 'focus')
}

export function toggleTypewriterMode(): void {
  const settings = useSettingsStore()
  setMode(settings.settings.mode === 'typewriter' ? 'normal' : 'typewriter')
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void document.documentElement.requestFullscreen()
  }
}

export function zoomActualSize(): void {
  const settings = useSettingsStore()
  settings.update({ fontSize: 16 })
  settings.applyTypography()
  void settings.persist()
}

export function zoomIn(): void {
  const settings = useSettingsStore()
  const next = Math.min(32, settings.settings.fontSize + 1)
  settings.update({ fontSize: next })
  settings.applyTypography()
  void settings.persist()
}

export function zoomOut(): void {
  const settings = useSettingsStore()
  const next = Math.max(12, settings.settings.fontSize - 1)
  settings.update({ fontSize: next })
  settings.applyTypography()
  void settings.persist()
}

/* ---------------------------- theme / lang ---------------------------- */

export function applyTheme(id: string): void {
  const settings = useSettingsStore()
  settings.applyTheme(id)
  void settings.persist()
}

export function setLanguage(lang: Lang): void {
  const settings = useSettingsStore()
  settings.setLanguage(lang)
  void settings.persist()
}

/** Open the built-in settings dialog (rendered by MdEditor). */
export function openPreferences(): void {
  useUI().openSettings()
}

/* ---------------------------- introspection for menus ---------------------------- */

export function currentBlockType(): string {
  return prose.getBlockInfo(useMilkdown().getEditor())?.type ?? 'paragraph'
}

export function currentHeadingLevel(): number | null {
  const info = prose.getBlockInfo(useMilkdown().getEditor())
  return info?.type === 'heading' ? (info.level ?? 1) : null
}

export function markActive(...names: string[]): boolean {
  return prose.isMarkActive(useMilkdown().getEditor(), ...names)
}

export function nodeActive(name: string, attrs?: Record<string, unknown>): boolean {
  return prose.isNodeActive(useMilkdown().getEditor(), name, attrs)
}
