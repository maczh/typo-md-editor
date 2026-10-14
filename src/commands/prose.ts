import type { Editor } from '@milkdown/core'
import { commandsCtx, editorViewCtx, serializerCtx } from '@milkdown/core'
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
import { NodeSelection, TextSelection } from '@milkdown/prose/state'
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

/**
 * Lift the caret's line out of any enclosing list item (Typora-style).
 *
 * Markdown cannot nest headings, blockquotes, etc. inside list items, so
 * block-level conversions on a list line would silently no-op. Block commands
 * call this first — the line leaves the list and the conversion then applies
 * to it, which is what Typora does.
 */
function liftFromList(view: EditorView): boolean {
  const { state, dispatch } = view
  const $from = state.selection.$from
  let itemType: NodeType | null = null
  for (let d = $from.depth; d > 0; d -= 1) {
    const name = $from.node(d).type.name
    if (name.includes('list_item')) {
      itemType = $from.node(d).type
      break
    }
  }
  if (!itemType) return false
  return liftListItem(itemType)(state, dispatch)
}

export function setHeading(editor: Editor, level: number): void {
  runWithView(editor, (view) => {
    const h = nodeType(view.state.schema, 'heading')
    if (!h) return
    liftFromList(view)
    setBlockType(h, { level })(view.state, view.dispatch)
  })
}

export function setParagraph(editor: Editor): void {
  runWithView(editor, (view) => {
    const p = nodeType(view.state.schema, 'paragraph')
    if (!p) return
    liftFromList(view)
    setBlockType(p)(view.state, view.dispatch)
  })
}

/**
 * Promote (delta < 0) / demote (delta > 0) the caret's heading — i.e. move it
 * *towards* H1 / towards H6, which is what the 提升/降低标题级别 labels and the
 * Ctrl+= / Ctrl+- shortcuts promise (zoom-button intuition: "=" makes the
 * heading bigger).
 *
 * On a plain paragraph there is no level to bump, so the fallback mirrors the
 * shortcut: promoting yields the biggest heading (H1), demoting the smallest
 * (H6). (The fallback used to be keyed the other way round, which made Ctrl+=
 * produce H6 and Ctrl+- produce H1 on a paragraph — exactly backwards.)
 *
 * Like every other block command this lifts the line out of a list first:
 * Markdown cannot nest a heading inside a list item, so without the lift the
 * command silently no-ops on a list line.
 */
export function bumpHeading(editor: Editor, delta: number): void {
  runWithView(editor, (view) => {
    const h = nodeType(view.state.schema, 'heading')
    if (!h) return
    liftFromList(view)
    const parent = view.state.selection.$from.parent
    const level =
      parent.type.name === 'heading'
        ? Math.min(6, Math.max(1, Number((parent.attrs as { level?: number }).level ?? 1) + delta))
        : delta < 0
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
    if (!t) return
    liftFromList(view)
    wrapIn(t)(view.state, view.dispatch)
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
 *
 * The item test must check the *value* of `checked`, not its presence: the GFM
 * preset extends every `list_item` with a `checked` attr (null for ordinary
 * items), so `'checked' in attrs` would match plain bullets too.
 */
export function setTaskStatus(editor: Editor, status: TaskStatus): void {
  runWithView(editor, (view) => {
    const { state, dispatch } = view
    const $from = state.selection.$from
    for (let d = $from.depth; d > 0; d -= 1) {
      const node = $from.node(d)
      const current = (node.attrs as { checked?: boolean | null }).checked
      if (node.type.name === 'list_item' && current !== null && current !== undefined) {
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
    // Resolve through `blockRangeAt` rather than scanning the doc's children: a
    // caret that sits exactly on a block boundary used to match the *previous*
    // block first, deleting the line above the one the user aimed at.
    const range = blockRangeAt(editor, state.selection.from)
    if (!range) return
    const start = range.start
    const end = range.end
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
 * Delete the **line** containing `pos` (the caret when `pos` is omitted).
 *
 * Unlike {@link deleteBlock} this is what the per-line "::" handle uses: inside
 * a list only the list item under the caret goes away, and containers left
 * empty by the delete (a `bullet_list` with no items is invalid content and
 * renders as a stray marker) are pruned as well.
 */
export function deleteLineAt(editor: Editor, pos?: number): boolean {
  let ok = false
  runWithView(editor, (view) => {
    const range = lineRangeAt(editor, pos ?? view.state.selection.from)
    if (!range) return
    const { state } = view
    let tr = state.tr.delete(range.start, range.end)
    let cursor = range.start
    // Prune ancestors that the delete emptied out, innermost first.
    //
    // Removing the last item of a list cannot actually leave it childless:
    // `bullet_list` content is `list_item+`, so ProseMirror's replace step fills
    // the hole with a fresh empty item. Such a list is empty for all practical
    // purposes (and renders as a lone dangling marker), so it is pruned too.
    for (;;) {
      const $p = tr.doc.resolve(Math.max(0, Math.min(cursor, tr.doc.content.size)))
      let pruned = false
      for (let d = $p.depth; d >= 1; d -= 1) {
        const node = $p.node(d)
        if (!/list|blockquote/.test(node.type.name)) break
        const empty =
          node.childCount === 0 ||
          (node.childCount === 1 && node.child(0).textContent.trim() === '')
        if (!empty) break
        const from = $p.before(d)
        tr = tr.delete(from, from + node.nodeSize)
        cursor = from
        pruned = true
        break
      }
      if (!pruned) break
    }
    if (tr.doc.childCount === 0) {
      const p = nodeType(state.schema, 'paragraph')
      if (p) tr.insert(0, p.create())
    }
    view.dispatch(tr.scrollIntoView())
    ok = true
  })
  return ok
}

/**
 * The position just inside the block Crepe's block service has selected with a
 * `NodeSelection` — i.e. the block its handle is currently anchored to — or null
 * when the selection is a caret/range instead.
 *
 * Crepe dispatches that `NodeSelection` from its own `mousedown` on the handle,
 * so it is the most reliable fallback for "which block was the handle on" when
 * our own coordinate probe came up empty (the mousedown triggers a reflow that
 * makes a fresh `posAtCoords` land on a different line).
 */
export function nodeSelectionPos(editor: Editor | null): number | null {
  if (!editor) return null
  let pos: number | null = null
  runWithView(editor, (view) => {
    const sel = view.state.selection
    if (sel instanceof NodeSelection) pos = sel.from + 1
  })
  return pos
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

/**
 * Whether the caret sits inside a **task-list item**.
 *
 * Milkdown 7's GFM preset has no separate `task_list` node: it *extends*
 * `list_item` with a `checked` attribute, so every list item carries `checked`
 * — `null` for ordinary items, `true`/`false` for task items. Probing for a
 * `task_list` node therefore never matches (and a bare `'checked' in attrs`
 * test matches every bullet), which is how the toolbar's task button ended up
 * permanently inert — and, via its old `|| bullet_list` fallback, lit on every
 * plain bullet list.
 */
export function isTaskItemActive(editor: Editor | null): boolean {
  if (!editor) return false
  let active = false
  runWithView(editor, (view) => {
    const $from = view.state.selection.$from
    for (let d = $from.depth; d > 0; d -= 1) {
      const node = $from.node(d)
      const checked = (node.attrs as { checked?: boolean | null }).checked
      if (node.type.name === 'list_item' && checked !== null && checked !== undefined) {
        active = true
        return
      }
    }
  })
  return active
}

/**
 * Serialize the current **selection** to Markdown (null when the caret is
 * collapsed or the editor is unavailable).
 *
 * This is what "复制为 Markdown" must copy — the previous implementation
 * serialized the whole document, so the button silently ignored the selection.
 * The implementation mirrors Milkdown's own clipboard plugin
 * (`clipboardTextSerializer`): wrap the selection slice in a throwaway doc via
 * `topNodeType.createAndFill` and run the editor's serializer over it. When the
 * slice cannot form a valid doc (e.g. a partial table row) it degrades to the
 * selection's plain text instead of throwing.
 */
export function selectionMarkdown(editor: Editor | null): string | null {
  if (!editor) return null
  let out: string | null = null
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as EditorView
    const { selection } = view.state
    if (selection.empty) return
    const slice = selection.content()
    if (slice.content.size === 0) return
    const serializer = ctx.get(serializerCtx) as unknown as ((node: PMNode) => string) | undefined
    const fallback = (): string =>
      view.state.doc.textBetween(selection.from, selection.to, '\n\n')
    if (typeof serializer !== 'function') {
      out = fallback()
      return
    }
    const doc = view.state.schema.topNodeType.createAndFill(null, slice.content)
    out = doc ? serializer(doc) : fallback()
  })
  return out
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

/**
 * Viewport rect of the ProseMirror content box — the anchor for floaters that
 * must land *inside* the editable (block-handle menus probe here instead of
 * relative to the handle, which floating-ui may have moved or clipped).
 */
export function viewDomRect(editor: Editor | null): DOMRect | null {
  if (!editor) return null
  let rect: DOMRect | null = null
  runWithView(editor, (view) => {
    rect = view.dom.getBoundingClientRect()
  })
  return rect
}

/** A top-level block, in document positions. */
export interface BlockRange {
  /** Content range — inside the node's open/close tokens. */
  from: number
  to: number
  /** Node range — including its open/close tokens. */
  start: number
  end: number
}

/** Resolved (non-boundary) `$pos` for `raw`, or null when that is impossible. */
function resolveInsideDoc(
  doc: PMNode,
  raw: number,
): ReturnType<PMNode['resolve']> | null {
  const max = doc.content.size
  let $pos = doc.resolve(Math.max(0, Math.min(raw, max)))
  if ($pos.depth === 0) $pos = doc.resolve(Math.min(max, Math.max(0, Math.min(raw, max)) + 1))
  return $pos.depth < 1 ? null : $pos
}

/** Node range (open/close tokens included) for the node at `depth` above `$pos`. */
function nodeRangeAt(
  $pos: ReturnType<PMNode['resolve']>,
  depth: number,
): BlockRange {
  const start = $pos.before(depth)
  const node = $pos.node(depth)
  return {
    from: start + 1,
    to: start + 1 + node.content.size,
    start,
    end: start + node.nodeSize,
  }
}

/**
 * The top-level block containing `pos` (the caret when `pos` is omitted).
 *
 * A position sitting exactly *between* two blocks resolves at depth 0; it is
 * nudged forward so callers always get a real block. That boundary case is what
 * made block actions ("cut", "copy", "delete") hit the block *above* the one the
 * user aimed at: a `pos >= start && pos <= end` scan matches the previous block
 * first, because it is visited earlier.
 */
export function blockRangeAt(editor: Editor | null, pos?: number): BlockRange | null {
  if (!editor) return null
  let out: BlockRange | null = null
  runWithView(editor, (view) => {
    const doc = view.state.doc
    const $pos = resolveInsideDoc(doc, pos ?? view.state.selection.from)
    if (!$pos) return
    out = nodeRangeAt($pos, 1)
  })
  return out
}

/** Node types that hold a single *line* inside a list. */
const LIST_ITEM_NAMES = ['list_item', 'task_list_item']

/**
 * The **line** containing `pos` (the caret when `pos` is omitted) — the range
 * the block handle's cut / copy / delete act on.
 *
 * The handle is per-line, so a line inside a list is the *list item*, not the
 * whole list: deleting one item of a three-item bullet list must remove that
 * item and leave the other two alone. Outside a list the line is simply the
 * top-level block ({@link blockRangeAt}).
 */
export function lineRangeAt(editor: Editor | null, pos?: number): BlockRange | null {
  if (!editor) return null
  let out: BlockRange | null = null
  runWithView(editor, (view) => {
    const doc = view.state.doc
    const raw = pos ?? view.state.selection.from
    const $pos = resolveInsideDoc(doc, raw)
    if (!$pos) return
    // Innermost list item wins: on nested lists the handle targets the item the
    // caret is on, not the outer one.
    for (let d = $pos.depth; d >= 1; d -= 1) {
      if (LIST_ITEM_NAMES.includes($pos.node(d).type.name)) {
        out = nodeRangeAt($pos, d)
        return
      }
    }
    out = nodeRangeAt($pos, 1)
  })
  return out
}

/** Plain text between two document positions (block separators become `\n`). */
export function getRangeText(editor: Editor | null, from: number, to: number): string {
  if (!editor) return ''
  let text = ''
  runWithView(editor, (view) => {
    const max = view.state.doc.content.size
    const a = Math.max(0, Math.min(from, max))
    const b = Math.max(0, Math.min(to, max))
    text = view.state.doc.textBetween(a, b, '\n', '\n')
  })
  return text
}

/**
 * Insert an empty paragraph right after the top-level block containing `pos`
 * and leave the caret in it — the "先新建空行" half of the "+" handle's job.
 * Returns the new caret position, or null when it could not be inserted.
 */
export function insertBlockAfter(editor: Editor | null, pos: number): number | null {
  if (!editor) return null
  let caret: number | null = null
  runWithView(editor, (view) => {
    const range = blockRangeAt(editor, pos)
    if (!range) return
    const p = nodeType(view.state.schema, 'paragraph')
    if (!p) return
    const at = Math.min(range.end, view.state.doc.content.size)
    const tr = view.state.tr.insert(at, p.create())
    const sel = TextSelection.near(tr.doc.resolve(at))
    view.dispatch(tr.setSelection(sel).scrollIntoView())
    caret = sel.from
  })
  return caret
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
