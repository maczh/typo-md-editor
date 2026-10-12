import type { Editor } from '@milkdown/core'
import { commandsCtx, editorViewCtx } from '@milkdown/core'
import { toggleInlineCodeCommand } from '@milkdown/preset-commonmark'
import type { EditorView } from '@milkdown/prose/view'
import type { Node as PMNode, NodeType, MarkType } from '@milkdown/prose/model'
import { Fragment, Slice } from '@milkdown/prose/model'
import type { EditorState, Transaction } from '@milkdown/prose/state'
import {
  setBlockType,
  toggleMark,
  wrapIn,
  selectAll as pmSelectAll,
  deleteSelection as pmDeleteSelection,
} from '@milkdown/prose/commands'
import { wrapInList, sinkListItem, liftListItem } from '@milkdown/prose/schema-list'
import { undo as pmUndo, redo as pmRedo } from '@milkdown/prose/history'
import { TextSelection } from '@milkdown/prose/state'
import { insert } from '@milkdown/utils'

/**
 * Thin ProseMirror command helpers over the Milkdown editor instance.
 * Node/mark names are looked up defensively (with fallbacks) so these helpers
 * survive minor preset renames across versions.
 */

type PMCommand = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean

function runWithView(editor: Editor, fn: (view: EditorView) => void): void {
  editor.action((ctx) => {
    fn(ctx.get(editorViewCtx) as EditorView)
  })
}

function runCmd(editor: Editor, cmd: PMCommand): boolean {
  let ok = false
  runWithView(editor, (view) => {
    ok = cmd(view.state, view.dispatch)
  })
  return ok
}

function nodeType(schema: EditorState['schema'], ...names: string[]): NodeType | null {
  for (const n of names) {
    const t = schema.nodes[n]
    if (t) return t
  }
  return null
}

function markType(schema: EditorState['schema'], ...names: string[]): MarkType | null {
  for (const n of names) {
    const t = schema.marks[n]
    if (t) return t
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Block commands                                                      */
/* ------------------------------------------------------------------ */

export function setHeading(editor: Editor, level: number): void {
  runWithView(editor, (view) => {
    const h = nodeType(view.state.schema, 'heading')
    if (!h) return
    setBlockType(h, { level })(view.state, view.dispatch)
  })
}

export function setParagraph(editor: Editor): void {
  runWithView(editor, (view) => {
    const p = nodeType(view.state.schema, 'paragraph')
    if (!p) return
    setBlockType(p)(view.state, view.dispatch)
  })
}

/** Increase (delta > 0) / decrease (delta < 0) the current heading level. */
export function bumpHeading(editor: Editor, delta: number): void {
  runWithView(editor, (view) => {
    const h = nodeType(view.state.schema, 'heading')
    if (!h) return
    const parent = view.state.selection.$from.parent
    const level =
      parent.type.name === 'heading'
        ? Math.min(6, Math.max(1, Number((parent.attrs as { level?: number }).level ?? 1) + delta))
        : delta > 0
          ? 1
          : 6
    setBlockType(h, { level })(view.state, view.dispatch)
  })
}

export function toggleBulletList(editor: Editor): void {
  runWithView(editor, (view) => {
    const t = nodeType(view.state.schema, 'bullet_list')
    if (t) wrapInList(t)(view.state, view.dispatch)
  })
}

export function toggleOrderedList(editor: Editor): void {
  runWithView(editor, (view) => {
    const t = nodeType(view.state.schema, 'ordered_list')
    if (t) wrapInList(t)(view.state, view.dispatch)
  })
}

export function toggleTaskList(editor: Editor): void {
  // GFM task list — inserting the marker text at the caret is the most
  // predictable path (the input rule builds the task_list_item node).
  editor.action(insert('- [ ] '))
}

export function toggleBlockquote(editor: Editor): void {
  runWithView(editor, (view) => {
    const t = nodeType(view.state.schema, 'blockquote')
    if (t) wrapIn(t)(view.state, view.dispatch)
  })
}

export function setCodeBlock(editor: Editor): void {
  runWithView(editor, (view) => {
    const t = nodeType(view.state.schema, 'code_block', 'fence')
    if (!t) return
    const { state, dispatch } = view
    // Apply the block change first; `view.dispatch` updates `view.state` in place.
    if (!setBlockType(t)(state, dispatch)) return
    // Collapse the caret at the end of the new (empty) code block instead of
    // letting ProseMirror / CodeMirror select the first line on creation.
    const sel = view.state.selection
    const $from = sel.$from
    for (let d = $from.depth; d > 0; d -= 1) {
      const node = $from.node(d)
      if (node.type.name === 'code_block' || node.type.name === 'fence') {
        const start = $from.before(d)
        const end = start + node.nodeSize
        const collapsed = TextSelection.near(view.state.doc.resolve(Math.max(start + 1, end - 1)))
        try {
          view.dispatch(view.state.tr.setSelection(collapsed))
        } catch {
          /* the position adjusted out of range between the two dispatches */
        }
        break
      }
    }
  })
}

/** Find the code-block node (and the doc position just inside it) at the caret. */
function enclosingCodeBlock(
  view: EditorView,
): { node: PMNode; contentStart: number } | null {
  const { $from } = view.state.selection
  for (let d = $from.depth; d > 0; d -= 1) {
    const node = $from.node(d)
    if (node.type.name === 'code_block' || node.type.name === 'fence') {
      // `before(d)` is the position of the node's opening token; +1 is the first
      // character of its text content.
      return { node, contentStart: $from.before(d) + 1 }
    }
  }
  return null
}

/** The plain-text content of the code block at the caret (null when not in one). */
export function getCodeBlockText(editor: Editor | null): string | null {
  if (!editor) return null
  let text: string | null = null
  runWithView(editor, (view) => {
    const found = enclosingCodeBlock(view)
    if (found) text = found.node.textContent
  })
  return text
}

/**
 * Indent the lines of the code block at the caret. With `mode === 'all'` every
 * line is indented by two spaces; with `mode === 'selection'` only the lines
 * intersecting the current selection are (a collapsed caret indents its line).
 */
export function indentCodeLines(editor: Editor, mode: 'all' | 'selection'): void {
  runWithView(editor, (view) => {
    const found = enclosingCodeBlock(view)
    if (!found) return
    const { node, contentStart } = found
    const text = node.textContent
    if (!text) return
    const { state, dispatch } = view
    const sel = state.selection
    const fromOff = Math.max(0, sel.from - contentStart)
    const toOff = Math.max(0, sel.to - contentStart)

    const lineStartOf = (offset: number): number => {
      const idx = text.lastIndexOf('\n', offset - 1)
      return idx < 0 ? 0 : idx + 1
    }
    const firstLine = text.slice(0, fromOff).split('\n').length - 1
    const lastLine = text.slice(0, toOff).split('\n').length - 1

    const lines = text.split('\n')
    const newLines = lines.map((line, i) => {
      if (mode === 'all') return `  ${line}`
      if (i >= firstLine && i <= lastLine) return `  ${line}`
      return line
    })
    const newText = newLines.join('\n')

    const textNode = state.schema.text(newText)
    const tr = state.tr.replaceWith(contentStart, contentStart + text.length, textNode)
    tr.setSelection(TextSelection.near(tr.doc.resolve(contentStart + newText.length)))
    dispatch(tr)
  })
}

export type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

/** Insert a GitHub-style alert (blockquote with `[!TYPE]`) at the caret. */
export function insertAlert(editor: Editor, type: AlertType): void {
  const template = `> [!${type}]\n> 内容\n\n`
  editor.action(insert(template))
}

export type TaskStatus = 'selected' | 'unselected' | 'ignored'

/**
 * Set the checkbox state of the task-list item containing the caret.
 *  - `selected`   → `[x]`
 *  - `unselected` → `[ ]`
 *  - `ignored`    → `[-]` (stored as a null `checked` attr; the schema only
 *    distinguishes boolean|null, so this is the closest representation).
 */
export function setTaskStatus(editor: Editor, status: TaskStatus): void {
  runWithView(editor, (view) => {
    const { state, dispatch } = view
    const $from = state.selection.$from
    for (let d = $from.depth; d > 0; d -= 1) {
      const node = $from.node(d)
      if (node.type.name === 'list_item' && 'checked' in node.attrs) {
        const pos = $from.before(d)
        const checked = status === 'selected' ? true : status === 'unselected' ? false : null
        const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked })
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)))
        dispatch(tr)
        return
      }
    }
  })
}

export function sinkIndent(editor: Editor): void {
  runWithView(editor, (view) => {
    const item = nodeType(view.state.schema, 'list_item', 'task_list_item')
    if (item) sinkListItem(item)(view.state, view.dispatch)
  })
}

export function liftIndent(editor: Editor): void {
  runWithView(editor, (view) => {
    const item = nodeType(view.state.schema, 'list_item', 'task_list_item')
    if (item) liftListItem(item)(view.state, view.dispatch)
  })
}

function insertEmptyParagraph(editor: Editor, at: (sel: EditorState['selection']) => number): void {
  runWithView(editor, (view) => {
    const { state, dispatch } = view
    const p = nodeType(state.schema, 'paragraph')
    if (!p) return
    const pos = at(state.selection)
    const tr = state.tr.insert(pos, p.create() as PMNode)
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos), 1)))
  })
}

export function insertParagraphAbove(editor: Editor): void {
  insertEmptyParagraph(editor, (sel) => sel.$from.before(1))
}

export function insertParagraphBelow(editor: Editor): void {
  insertEmptyParagraph(editor, (sel) => sel.$to.after(1))
}

export function insertHardBreak(editor: Editor): void {
  runWithView(editor, (view) => {
    const hb = nodeType(view.state.schema, 'hardbreak', 'hard_break', 'br')
    if (hb) {
      const tr = view.state.tr.replaceSelectionWith(hb.create() as PMNode)
      view.dispatch(tr)
    }
  })
}

/* ------------------------------------------------------------------ */
/* Mark (inline style) commands                                        */
/* ------------------------------------------------------------------ */

export function toggleMarkBy(editor: Editor, ...names: string[]): boolean {
  let ok = false
  runWithView(editor, (view) => {
    const mt = markType(view.state.schema, ...names)
    if (!mt) return
    toggleMark(mt)(view.state, view.dispatch)
    ok = true
  })
  return ok
}

export function toggleBold(editor: Editor): boolean {
  return toggleMarkBy(editor, 'strong', 'bold')
}

export function toggleItalic(editor: Editor): boolean {
  return toggleMarkBy(editor, 'emphasis', 'em', 'italic')
}

/**
 * Toggle inline code via Milkdown's own `toggleInlineCodeCommand` — the exact
 * same command Crepe's floating toolbar uses. (The inline-code mark is named
 * `inlineCode` in the schema; guessing `code_inline` here used to make every
 * custom surface — toolbar, format menu, context menu, hotkey — silently no-op
 * while the Crepe bubble kept working.)
 */
export function toggleInlineCode(editor: Editor): boolean {
  let ok = false
  editor.action((ctx) => {
    ok = ctx.get(commandsCtx).call(toggleInlineCodeCommand.key)
  })
  return ok
}

export function toggleStrike(editor: Editor): boolean {
  return toggleMarkBy(editor, 'strike_through', 'strikethrough', 'strike')
}

/** Toggle the real `underline` mark (registered by the underline plugin). */
export function toggleUnderline(editor: Editor): boolean {
  return toggleMarkBy(editor, 'underline')
}

/* ------------------------------------------------------------------ */
/* Link operations (format menu)                                       */
/* ------------------------------------------------------------------ */

/** The `href` of the link mark at the caret / over the selection, if any. */
export function getLinkHref(editor: Editor | null): string | null {
  if (!editor) return null
  let href: string | null = null
  runWithView(editor, (view) => {
    const mt = markType(view.state.schema, 'link')
    if (!mt) return
    const { state } = view
    const marks = state.selection.$from.marks()
    const onMark =
      marks.find((m) => m.type === mt) ?? (state.storedMarks ?? []).find((m) => m.type === mt)
    href = onMark ? ((onMark.attrs as { href?: string }).href ?? null) : null
  })
  return href
}

/** The document range fully covered by the link mark at the caret, if any. */
export function getLinkRange(editor: Editor | null): { from: number; to: number } | null {
  if (!editor) return null
  let range: { from: number; to: number } | null = null
  runWithView(editor, (view) => {
    const mt = markType(view.state.schema, 'link')
    if (!mt) return
    const { state } = view
    const { from, to, empty } = state.selection
    // Resolve the link mark that applies at the caret (or within the selection).
    const $from = state.selection.$from
    let mark = $from.marks().find((m) => m.type === mt)
    if (!mark && !empty) {
      state.doc.nodesBetween(from, to, (node) => {
        if (mark) return false
        const m = node.marks.find((mm) => mm.type === mt)
        if (m) mark = m
        return true
      })
    }
    if (!mark) return
    // Expand left/right across the parent text block to the contiguous run of
    // the same link mark. (Reimplements prosemirror's getMarkRange, which is
    // not re-exported by @milkdown/prose/state.)
    const parentStart = $from.start()
    const parentEnd = parentStart + $from.parent.content.size
    let start = from
    let end = empty ? from : to
    while (start > parentStart && state.doc.rangeHasMark(start - 1, start, mt)) start -= 1
    while (end < parentEnd && state.doc.rangeHasMark(end, end + 1, mt)) end += 1
    if (end > start) range = { from: start, to: end }
  })
  return range
}

/** Replace the link mark over `[from, to]` with a new `href`. */
export function setLinkHref(editor: Editor, from: number, to: number, href: string): void {
  runWithView(editor, (view) => {
    const mt = markType(view.state.schema, 'link')
    if (!mt) return
    const { state, dispatch } = view
    dispatch(state.tr.removeMark(from, to, mt).addMark(from, to, mt.create({ href })))
  })
}

/** Remove every link mark in the selection. */
export function removeLink(editor: Editor): void {
  runWithView(editor, (view) => {
    const mt = markType(view.state.schema, 'link')
    if (!mt) return
    const { state, dispatch } = view
    const { from, to } = state.selection
    dispatch(state.tr.removeMark(from, to, mt))
  })
}

/**
 * Clear inline formatting (and the block's own styling) for the selection.
 *
 * With a selection, every mark is stripped from the range and the block is turned
 * back into a paragraph.
 *
 * With a *collapsed* caret there is nothing to strip, so we only reset the pending
 * marks — clearing the entire document is both destructive and guaranteed to
 * throw (`Transaction.setBlockType` over a range spanning more than one block
 * raises `RangeError`, which used to abort the whole transaction and make the
 * "clear format" button look dead).
 */
export function clearFormatting(editor: Editor): void {
  runWithView(editor, (view) => {
    const { state, dispatch } = view
    const { from, to, empty } = state.selection
    const paragraph = nodeType(state.schema, 'paragraph')
    const tr = state.tr

    if (empty) {
      tr.setStoredMarks([])
      if (paragraph && state.selection.$from.parent.type.name !== 'paragraph') {
        try {
          tr.setBlockType(from, from, paragraph)
        } catch {
          /* the caret sits somewhere setBlockType cannot reach (e.g. a table cell) */
        }
      }
      dispatch(tr)
      return
    }

    for (const m of Object.values(state.schema.marks)) {
      tr.removeMark(from, to, m)
    }
    if (paragraph) {
      try {
        tr.setBlockType(from, to, paragraph)
      } catch {
        /* non-flat range (e.g. across list items) — the marks are still cleared */
      }
    }
    dispatch(tr)
  })
}

/* ------------------------------------------------------------------ */
/* Insert helpers (markdown-based)                                     */
/* ------------------------------------------------------------------ */

export function insertHorizontalRule(editor: Editor): void {
  editor.action(insert('\n---\n\n'))
}

/**
 * Insert / apply a hyperlink.
 *
 * - With a non-empty selection: keep the selected text and just add the link
 *   mark to it (the previous behaviour replaced the selection with a placeholder,
 *   discarding the user's text).
 * - With a collapsed caret: insert a `链接文本` link placeholder so the user can
 *   edit it inline.
 */
export function insertLink(editor: Editor, text = '链接文本', url = 'https://'): void {
  runWithView(editor, (view) => {
    const linkType = markType(view.state.schema, 'link')
    if (!linkType) return
    const { state, dispatch } = view
    const { from, to, empty } = state.selection
    if (empty) {
      const node = state.schema.text(text, [linkType.create({ href: url })])
      dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView())
      return
    }
    dispatch(state.tr.addMark(from, to, linkType.create({ href: url })).scrollIntoView())
  })
}

export function insertFootnote(editor: Editor): void {
  editor.action(insert('[^1]'))
}

export function insertLinkReference(editor: Editor): void {
  editor.action(insert('\n[ref]: https://\n'))
}

export function insertComment(editor: Editor): void {
  editor.action(insert('\n<!-- 注释内容 -->\n'))
}

export function insertToc(editor: Editor): void {
  editor.action(insert('\n[toc]\n\n'))
}

export function insertYamlFrontMatter(editor: Editor): void {
  editor.action(insert('---\ntitle: Untitled\ndate: \n---\n\n'))
}

/* ------------------------------------------------------------------ */
/* History / selection                                                 */
/* ------------------------------------------------------------------ */

export function undo(editor: Editor): boolean {
  return runCmd(editor, pmUndo as PMCommand)
}

export function redo(editor: Editor): boolean {
  return runCmd(editor, pmRedo as PMCommand)
}

export function selectAll(editor: Editor): boolean {
  return runCmd(editor, pmSelectAll as PMCommand)
}

export function deleteSelection(editor: Editor): boolean {
  return runCmd(editor, pmDeleteSelection as PMCommand)
}

/**
 * Remove the whole top-level block the selection sits in (the block handle's
 * "delete"). Never leaves an empty document behind.
 */
export function deleteBlock(editor: Editor): boolean {
  let ok = false
  runWithView(editor, (view) => {
    const { state, dispatch } = view
    const doc = state.doc
    const pos = state.selection.from
    let start = -1
    let end = -1
    // `forEach` walks the doc's direct children with their offsets; the first one
    // containing the selection is the block we want.
    doc.forEach((node, offset) => {
      if (start >= 0) return
      const nodeEnd = offset + node.nodeSize
      if (pos >= offset && pos <= nodeEnd) {
        start = offset
        end = nodeEnd
      }
    })
    if (start < 0) return
    const tr = state.tr.delete(start, end)
    if (tr.doc.childCount === 0) {
      const p = nodeType(state.schema, 'paragraph')
      if (p) tr.insert(0, p.create())
    }
    dispatch(tr.scrollIntoView())
    ok = true
  })
  return ok
}

/**
 * The selected text as plain text (`''` for a collapsed caret).
 *
 * This is what the cut/copy buttons put on the clipboard: the visible text, not
 * the Markdown source, which matches what every other editor does for Ctrl+C.
 */
export function getSelectionText(editor: Editor | null): string {
  if (!editor) return ''
  let text = ''
  runWithView(editor, (view) => {
    const { from, to, empty } = view.state.selection
    if (empty) return
    // '\n' between blocks keeps paragraphs on separate lines, and for leaf nodes
    // (images, hard breaks) so copied text does not run together.
    text = view.state.doc.textBetween(from, to, '\n', '\n')
  })
  return text
}

/**
 * Insert literal text at the selection — Markdown syntax in it is **not**
 * interpreted (this backs "paste as plain text").
 */
export function insertPlainText(editor: Editor, text: string): void {
  if (!text) return
  runWithView(editor, (view) => {
    const { state, dispatch } = view
    const { from, to } = state.selection
    const normalized = text.replace(/\r\n?/g, '\n')
    try {
      if (!normalized.includes('\n')) {
        dispatch(state.tr.insertText(normalized, from, to).scrollIntoView())
        return
      }
      const paragraph = nodeType(state.schema, 'paragraph')
      if (!paragraph) throw new Error('no paragraph node in schema')
      const blocks = normalized
        .split('\n')
        .map((line) => paragraph.create(null, line ? state.schema.text(line) : undefined))
      const slice = new Slice(Fragment.fromArray(blocks), 0, 0)
      dispatch(state.tr.replaceRange(from, to, slice).scrollIntoView())
    } catch {
      // Multi-line paste into a context that cannot hold paragraphs (a heading,
      // a table cell, a code block) — keep the words, drop the line structure.
      dispatch(state.tr.insertText(normalized.replace(/\n+/g, ' '), from, to).scrollIntoView())
    }
  })
}

/* ------------------------------------------------------------------ */
/* Introspection (menu checkmarks)                                     */
/* ------------------------------------------------------------------ */

export interface BlockInfo {
  type: string
  level?: number
}

export function getBlockInfo(editor: Editor | null): BlockInfo | null {
  if (!editor) return null
  let info: BlockInfo | null = null
  runWithView(editor, (view) => {
    const parent = view.state.selection.$from.parent
    const attrs = parent.attrs as { level?: number }
    info = { type: parent.type.name, level: attrs.level }
  })
  return info
}

export function isMarkActive(editor: Editor | null, ...names: string[]): boolean {
  if (!editor) return false
  let active = false
  runWithView(editor, (view) => {
    const mt = markType(view.state.schema, ...names)
    if (!mt) return
    const state = view.state
    if (state.selection.empty) {
      active = (state.storedMarks ?? []).some((m) => m.type === mt)
    } else {
      active = state.doc.rangeHasMark(state.selection.from, state.selection.to, mt)
    }
  })
  return active
}

export function isNodeActive(
  editor: Editor | null,
  name: string,
  attrs?: Record<string, unknown>,
): boolean {
  if (!editor) return false
  let active = false
  runWithView(editor, (view) => {
    const $from = view.state.selection.$from
    let depth = $from.depth
    while (depth > 0) {
      const node = $from.node(depth)
      if (node.type.name === name) {
        active = attrs
          ? Object.entries(attrs).every(([k, v]) => (node.attrs as Record<string, unknown>)[k] === v)
          : true
        return
      }
      depth--
    }
  })
  return active
}

/* ------------------------------------------------------------------ */
/* Position helpers (context menu)                                     */
/* ------------------------------------------------------------------ */

/** The kind of block under a document position — drives the context menu. */
export type BlockKind = 'paragraph' | 'heading' | 'list' | 'quote' | 'code' | 'table' | 'image'

const LIST_ANCESTORS = ['list_item', 'bullet_list', 'ordered_list', 'task_list_item']

export function blockKindAt(editor: Editor, pos: number): BlockKind {
  let kind: BlockKind = 'paragraph'
  runWithView(editor, (view) => {
    const max = view.state.doc.content.size
    const $pos = view.state.doc.resolve(Math.max(0, Math.min(pos, max)))
    let sawQuote = false
    let sawList = false
    for (let d = $pos.depth; d > 0; d -= 1) {
      const name = $pos.node(d).type.name
      if (name === 'table') {
        kind = 'table'
        return
      }
      if (name === 'code_block' || name === 'fence') {
        kind = 'code'
        return
      }
      if (name === 'image' || name === 'image_block') {
        kind = 'image'
        return
      }
      if (name === 'blockquote') sawQuote = true
      if (LIST_ANCESTORS.includes(name)) sawList = true
    }
    const parentName = $pos.parent.type.name
    if (parentName === 'heading') kind = 'heading'
    else if (sawList) kind = 'list'
    else if (sawQuote) kind = 'quote'
    else kind = 'paragraph'
  })
  return kind
}

/** Map viewport coordinates to a document position (null when outside). */
export function posAtCoords(
  editor: Editor,
  coords: { left: number; top: number },
): number | null {
  let pos: number | null = null
  runWithView(editor, (view) => {
    const res = view.posAtCoords(coords)
    if (res) pos = res.pos
  })
  return pos
}

/** Place the caret at `pos` so subsequent commands apply to that block. */
export function setCaret(editor: Editor, pos: number): void {
  runWithView(editor, (view) => {
    try {
      const clamped = Math.max(0, Math.min(pos, view.state.doc.content.size))
      const sel = TextSelection.near(view.state.doc.resolve(clamped))
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
    } catch {
      /* the position moved out of range between click and dispatch */
    }
  })
}

export interface SelectionRange {
  from: number
  to: number
  empty: boolean
}

/** The editor's current selection — used to decide whether a right-click should
 *  preserve an existing text selection instead of collapsing it. */
export function getSelectionRange(editor: Editor | null): SelectionRange | null {
  if (!editor) return null
  let range: SelectionRange | null = null
  runWithView(editor, (view) => {
    const { from, to, empty } = view.state.selection
    range = { from, to, empty }
  })
  return range
}

/**
 * Re-apply a document range **and hand focus back to the editor**.
 *
 * This is what makes floating-menu items actually work. A menu rendered via
 * `Teleport` lives outside the editor DOM, so by the time an item is clicked
 * ProseMirror no longer owns the DOM selection: `view.state.selection` and the
 * real selection have drifted apart, commands silently apply to the wrong place
 * (or nowhere), and `document.execCommand('cut'/'copy')` — which operates on the
 * live DOM selection — does nothing at all.
 *
 * Restoring the range and calling `view.focus()` re-syncs the two before the
 * command runs.
 */
export function setSelectionRange(editor: Editor | null, from: number, to: number): void {
  if (!editor) return
  runWithView(editor, (view) => {
    const max = view.state.doc.content.size
    const a = Math.max(0, Math.min(from, max))
    const b = Math.max(0, Math.min(to, max))
    try {
      const sel = TextSelection.between(view.state.doc.resolve(a), view.state.doc.resolve(b))
      view.dispatch(view.state.tr.setSelection(sel))
    } catch {
      /* the range moved out of bounds between opening the menu and the click */
    }
    view.focus()
  })
}

/** Give the editor keyboard focus back (DOM selection follows the last state). */
export function focus(editor: Editor | null): void {
  if (!editor) return
  runWithView(editor, (view) => {
    view.focus()
  })
}

/**
 * Replace the `src` of every image node that currently uses `oldSrc` with
 * `newSrc`. Used when the host rewrites image references (e.g. after an upload
 * round-trip): the document keeps one form of the reference while the live
 * editor switches to the form that actually renders.
 */
export function replaceImageSrc(editor: Editor | null, oldSrc: string, newSrc: string): void {
  if (!editor || oldSrc === newSrc) return
  runWithView(editor, (view) => {
    const { state, dispatch } = view
    const imgType = nodeType(state.schema, 'image', 'image_inline', 'img')
    if (!imgType) return
    let tr = state.tr
    state.doc.descendants((node, pos) => {
      if (node.type === imgType) {
        const cur = (node.attrs as { src?: string }).src
        if (cur === oldSrc) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: newSrc })
        }
      }
    })
    if (tr.docChanged) dispatch(tr)
  })
}
