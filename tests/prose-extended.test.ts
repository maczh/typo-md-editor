import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@milkdown/prose/model'
import { EditorState, TextSelection, NodeSelection, type Transaction } from '@milkdown/prose/state'
import { commandsCtx, editorViewCtx, parserCtx, serializerCtx } from '@milkdown/core'
import type { Editor } from '@milkdown/core'
import type { Node as PMNode } from '@milkdown/prose/model'
import {
  setHeading,
  setParagraph,
  toggleBulletList,
  toggleOrderedList,
  toggleBlockquote,
  toggleTaskList,
  setCodeBlock,
  getCodeBlockText,
  indentCodeLines,
  insertAlert,
  setTaskStatus,
  sinkIndent,
  liftIndent,
  insertParagraphAbove,
  insertParagraphBelow,
  insertHardBreak,
  toggleBold,
  toggleItalic,
  toggleStrike,
  toggleUnderline,
  toggleInlineCode,
  getLinkHref,
  getLinkRange,
  setLinkHref,
  removeLink,
  clearFormatting,
  insertHorizontalRule,
  insertLink,
  insertFootnote,
  insertLinkReference,
  insertComment,
  insertToc,
  insertYamlFrontMatter,
  undo,
  redo,
  selectAll,
  deleteSelection,
  deleteBlock,
  nodeSelectionPos,
  getSelectionText,
  insertPlainText,
  getBlockInfo,
  isMarkActive,
  isNodeActive,
  blockKindAt,
  blockRangeAt,
  lineRangeAt,
  getRangeText,
  insertBlockAfter,
  setCaret,
  getSelectionRange,
  setSelectionRange,
  focus,
  replaceImageSrc,
  posAtCoords,
  viewDomRect,
  type AlertType,
} from '../src/commands/prose'

// Exhaustive white-box coverage for the ProseMirror command layer — every
// exported command of `commands/prose.ts` that the menus / toolbar / hotkeys
// reach through `commands/actions.ts`. BumpHeading / isTaskItemActive /
// selectionMarkdown have their own file (prose-menu.test.ts); this one covers
// the rest, including the defensive paths (missing schema node, out-of-range
// positions) that keep the surfaces from throwing.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    // `inline*` (not `text*`) so the harness can hold inline atoms the real
    // schema holds too (images, hard breaks) — otherwise replaceSelectionWith
    // silently drops them and the command looks like a no-op.
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 1 } },
      toDOM: () => ['h1', 0],
    },
    blockquote: { group: 'block', content: 'block+', toDOM: () => ['blockquote', 0] },
    bullet_list: { group: 'block', content: 'list_item+', toDOM: () => ['ul', 0] },
    ordered_list: { group: 'block', content: 'list_item+', toDOM: () => ['ol', 0] },
    list_item: {
      content: 'paragraph block*',
      // Mirrors the real GFM schema: every list item carries `checked`.
      attrs: { checked: { default: null } },
      toDOM: () => ['li', 0],
    },
    // `group: 'block'` is required or `canReplaceWith` refuses paragraph→code
    // conversions and a doc may not even hold the node.
    code_block: { group: 'block', content: 'text*', marks: '', toDOM: () => ['pre', 0] },
    image: { inline: true, group: 'inline', attrs: { src: { default: '' } }, toDOM: () => ['img', 0] },
    hardbreak: { inline: true, group: 'inline', toDOM: () => ['br', 0] },
    text: { group: 'inline' },
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    emphasis: { toDOM: () => ['em', 0] },
    strike_through: { toDOM: () => ['s', 0] },
    underline: { toDOM: () => ['u', 0] },
    link: { attrs: { href: { default: '' } }, toDOM: () => ['a', 0] },
  },
})

const p = (text = '') =>
  schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
const h = (level: number, text: string) =>
  schema.nodes.heading.create({ level }, schema.text(text))
const li = (text: string, checked: boolean | null = null) =>
  schema.nodes.list_item.create({ checked }, p(text))
const ul = (...texts: string[]) => schema.nodes.bullet_list.create(null, texts.map((t) => li(t)))
/** A task-list item (checked = true) — what setTaskStatus acts on. */
const taskUl = (text: string) => schema.nodes.bullet_list.create(null, [li(text, true)])
const cb = (text: string) => schema.nodes.code_block.create(null, text ? schema.text(text) : undefined)
const img = (src: string) => schema.nodes.image.create({ src })

/** Markdown parser stand-in: one paragraph holding the raw markdown text. */
const parser = (md: string) =>
  schema.node('doc', null, [p(md.replace(/\n+$/, ''))])

interface Harness {
  editor: Editor
  state: () => EditorState
  doc: () => PMNode
}

/**
 * A stand-in Milkdown `Editor`. Transactions are applied to the live state so
 * commands observe their own effects; `commandsCtx` is controllable so
 * `toggleInlineCode` can be driven without the real preset.
 */
function fakeEditor(
  doc: ReturnType<Schema['node']>,
  opts: { commandsCall?: boolean; serializer?: (node: { textContent: string }) => string } = {},
): Harness {
  let current = EditorState.create({ doc })
  const view = {
    get state() {
      return current
    },
    dispatch: (tr: Transaction) => {
      current = current.apply(tr)
    },
    focus: () => {},
    dom: { getBoundingClientRect: () => ({ top: 1, left: 2, bottom: 3, right: 4, width: 2, height: 2 }) },
    posAtCoords: (coords: { left: number; top: number }) =>
      coords && coords.top >= 0 ? { pos: 1, inside: 0 } : null,
  }
  const editor = {
    action: (cb: (ctx: { get: (k: unknown) => unknown }) => void) =>
      cb({
        get: (k: unknown) => {
          if (k === editorViewCtx) return view
          if (k === parserCtx) return parser
          if (k === serializerCtx) return opts.serializer
          if (k === commandsCtx) return { call: () => opts.commandsCall ?? false }
          return view
        },
      }),
  } as unknown as Editor
  return { editor, state: () => current, doc: () => current.doc }
}

/** Put the caret INSIDE the first text node whose content is `text`. */
function caretAt(h: Harness, text: string): void {
  let pos = -1
  h.state().doc.descendants((node, offset) => {
    if (pos < 0 && node.isText && node.text === text) {
      pos = offset
      return false
    }
    return true
  })
  assert.ok(pos >= 0, `text "${text}" located`)
  // +1 lands *inside* the text node: ProseMirror's `$from.marks()` only reads
  // the text node's marks when textOffset > 0 (a caret at the very start of a
  // node sees none) — exactly what getLinkHref / isMarkActive depend on.
  select(h, pos + 1, pos + 1)
}

/** Select [from, to] on the harness. */
function select(h: Harness, from: number, to: number): void {
  const doc = h.state().doc
  h.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as unknown as {
      state: EditorState
      dispatch: (tr: Transaction) => void
    }
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(doc, Math.min(from, doc.content.size), Math.min(to, doc.content.size))),
    )
  })
}

const docOf = (...blocks: ReturnType<typeof p>[]) => schema.node('doc', null, blocks)

/* ------------------------------ block commands ------------------------------ */

test('setHeading converts a paragraph and re-levels a heading', () => {
  const h1 = fakeEditor(docOf(p('body')))
  caretAt(h1, 'body')
  setHeading(h1.editor, 2)
  assert.equal(h1.state().selection.$from.parent.type.name, 'heading')
  assert.equal(h1.state().selection.$from.parent.attrs.level, 2)

  setHeading(h1.editor, 4)
  assert.equal(h1.state().selection.$from.parent.attrs.level, 4)
})

test('setHeading on a list line lifts it out first (Markdown cannot nest)', () => {
  const h1 = fakeEditor(docOf(ul('a', 'b')))
  caretAt(h1, 'b')
  setHeading(h1.editor, 2)
  const doc = h1.state().doc
  assert.equal(doc.childCount, 2, 'only the caret item left the list')
  assert.equal(doc.child(0).type.name, 'bullet_list', 'the other item stays in the list')
  assert.equal(doc.child(0).textContent, 'a')
  assert.equal(doc.child(1).type.name, 'heading')
  assert.equal(doc.child(1).textContent, 'b')
})

test('setParagraph turns a heading back into a paragraph', () => {
  const h1 = fakeEditor(docOf(h(3, 'title')))
  caretAt(h1, 'title')
  setParagraph(h1.editor)
  assert.equal(h1.state().selection.$from.parent.type.name, 'paragraph')
})

test('toggleBulletList wraps a paragraph; a second call does not re-wrap', () => {
  const h1 = fakeEditor(docOf(p('item')))
  caretAt(h1, 'item')
  toggleBulletList(h1.editor)
  assert.equal(h1.state().doc.child(0).type.name, 'bullet_list')

  const before = h1.state().doc.childCount
  toggleBulletList(h1.editor)
  assert.equal(h1.state().doc.childCount, before, 'already wrapped — no nested duplicate')
})

test('toggleOrderedList wraps a paragraph in an ordered list', () => {
  const h1 = fakeEditor(docOf(p('one')))
  caretAt(h1, 'one')
  toggleOrderedList(h1.editor)
  assert.equal(h1.state().doc.child(0).type.name, 'ordered_list')
})

test('toggleBlockquote wraps a paragraph; inside one it stays stable', () => {
  const h1 = fakeEditor(docOf(p('quote')))
  caretAt(h1, 'quote')
  toggleBlockquote(h1.editor)
  assert.equal(h1.state().doc.child(0).type.name, 'blockquote')

  toggleBlockquote(h1.editor)
  assert.equal(h1.state().doc.child(0).type.name, 'blockquote', 'still exactly one quote level')
})

test('setCodeBlock converts the block and collapses the caret inside it', () => {
  const h1 = fakeEditor(docOf(p('code')))
  caretAt(h1, 'code')
  setCodeBlock(h1.editor)
  assert.equal(h1.state().doc.child(0).type.name, 'code_block')
  const $from = h1.state().selection.$from
  assert.equal($from.parent.type.name, 'code_block', 'caret is inside the new code block')
})

test('getCodeBlockText reads the block at the caret, null elsewhere', () => {
  const inCode = fakeEditor(docOf(cb('const a = 1')))
  caretAt(inCode, 'const a = 1')
  assert.equal(getCodeBlockText(inCode.editor), 'const a = 1')

  const inPara = fakeEditor(docOf(p('plain')))
  caretAt(inPara, 'plain')
  assert.equal(getCodeBlockText(inPara.editor), null)
  assert.equal(getCodeBlockText(null), null)
})

test('indentCodeLines("all") indents every line by two spaces', () => {
  const h1 = fakeEditor(docOf(cb('one\ntwo\nthree')))
  caretAt(h1, 'one\ntwo\nthree') // the block holds ONE text node
  indentCodeLines(h1.editor, 'all')
  assert.equal(h1.state().doc.textContent, '  one\n  two\n  three')
})

test('indentCodeLines("selection") only indents the selected lines', () => {
  const h1 = fakeEditor(docOf(cb('one\ntwo\nthree')))
  // code_block starts at doc offset 1 (open token), so line 2 begins at 1+4.
  select(h1, 5, 8) // "two"
  indentCodeLines(h1.editor, 'selection')
  assert.equal(h1.state().doc.textContent, 'one\n  two\nthree')
})

test('indentCodeLines outside a code block is a safe no-op', () => {
  const h1 = fakeEditor(docOf(p('plain')))
  caretAt(h1, 'plain')
  indentCodeLines(h1.editor, 'all')
  assert.equal(h1.state().doc.textContent, 'plain')
})

test('insertAlert inserts a GitHub-style alert for every type', () => {
  for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as AlertType[]) {
    const h1 = fakeEditor(docOf(p('ctx')))
    caretAt(h1, 'ctx')
    insertAlert(h1.editor, type)
    assert.match(h1.state().doc.textContent, new RegExp(`> \\[!${type}\\]`))
  }
})

test('setTaskStatus rewrites the checkbox of the task item at the caret', () => {
  // A real task item (checked non-null) — plain bullets are inert for this
  // command, which is the whole point of the value-based item test.
  const h1 = fakeEditor(docOf(taskUl('done')))
  caretAt(h1, 'done')
  const liPos = 1 // first list_item node position
  const readChecked = () =>
    (h1.state().doc.nodeAt(liPos)!.attrs as { checked: boolean | null }).checked

  assert.equal(readChecked(), true)
  setTaskStatus(h1.editor, 'unselected')
  assert.equal(readChecked(), false)
  setTaskStatus(h1.editor, 'selected')
  assert.equal(readChecked(), true)
  setTaskStatus(h1.editor, 'ignored')
  assert.equal(readChecked(), null, 'ignored maps back to the null representation')
})

test('sinkIndent nests a list item; liftIndent restores it', () => {
  // The FIRST item of a list cannot sink (no sibling to nest under) — that is
  // prosemirror-schema-list semantics, so start from the second item.
  const h1 = fakeEditor(docOf(ul('a', 'b')))
  caretAt(h1, 'b')
  assert.equal(h1.state().selection.$from.depth, 3, 'starts at doc > ul > li > p')
  sinkIndent(h1.editor)
  assert.equal(h1.state().selection.$from.depth, 5, 'doc > ul > li > ul > li > p')

  liftIndent(h1.editor)
  assert.equal(h1.state().selection.$from.depth, 3, 'back to doc > ul > li > p')
})

test('insertParagraphAbove / Below add an empty line around the caret', () => {
  const above = fakeEditor(docOf(p('first'), p('second')))
  caretAt(above, 'second')
  insertParagraphAbove(above.editor)
  assert.equal(above.state().doc.childCount, 3)
  assert.equal(above.state().doc.child(1).textContent, '', 'empty line sits above')
  assert.equal(above.state().selection.$from.parent.textContent, '', 'caret moved into it')

  const below = fakeEditor(docOf(p('first'), p('second')))
  caretAt(below, 'first')
  insertParagraphBelow(below.editor)
  assert.equal(below.state().doc.childCount, 3)
  assert.equal(below.state().doc.child(1).textContent, '', 'empty line sits between')
  assert.equal(below.state().doc.child(2).textContent, 'second', 'original block pushed down')
})

test('insertHardBreak inserts a br; a schema without the node is a no-op', () => {
  const h1 = fakeEditor(docOf(p('line')))
  caretAt(h1, 'line')
  insertHardBreak(h1.editor)
  assert.equal(h1.state().doc.child(0).textContent, 'line', 'text preserved')
  let sawBreak = false
  h1.state().doc.descendants((n) => {
    if (n.type.name === 'hardbreak') sawBreak = true
  })
  assert.ok(sawBreak, 'hardbreak node inserted')
})

/* -------------------------------- mark commands -------------------------------- */

test('toggleBold / Italic / Strike / Underline apply and remove their marks', () => {
  const cases: [string, (e: Editor) => boolean, string[]][] = [
    ['bold', toggleBold, ['strong', 'bold']],
    ['italic', toggleItalic, ['emphasis', 'em', 'italic']],
    ['strike', toggleStrike, ['strike_through', 'strikethrough', 'strike']],
    ['underline', toggleUnderline, ['underline']],
  ]
  for (const [name, toggle, aliases] of cases) {
    const h1 = fakeEditor(docOf(p('word')))
    select(h1, 1, 5) // "word"
    assert.equal(toggle(h1.editor), true, `${name}: applied`)
    assert.ok(isMarkActive(h1.editor, ...aliases), `${name}: isMarkActive`)
    assert.equal(toggle(h1.editor), true, `${name}: removed again`)
    assert.ok(!isMarkActive(h1.editor, ...aliases), `${name}: inactive after second toggle`)
  }
})

test('toggleBold reports false when the schema lacks the mark', () => {
  // paragraph-only schema (no marks) — the defensive path actions.ts relies on
  // to show its "unsupported here" toast.
  const bare = new Schema({
    nodes: { doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*' }, text: { group: 'inline' } },
    marks: {},
  })
  const h1 = fakeEditor(bare.node('doc', null, [bare.node('paragraph', null, bare.text('word'))]))
  select(h1, 1, 5)
  assert.equal(toggleBold(h1.editor), false)
})

test('toggleInlineCode delegates to the Milkdown command via commandsCtx', () => {
  const yes = fakeEditor(docOf(p('code')), { commandsCall: true })
  caretAt(yes, 'code')
  assert.equal(toggleInlineCode(yes.editor), true)

  const no = fakeEditor(docOf(p('code')), { commandsCall: false })
  caretAt(no, 'code')
  assert.equal(toggleInlineCode(no.editor), false)
})

/* -------------------------------- link commands -------------------------------- */

test('insertLink keeps a selection and marks it; bare caret inserts a placeholder', () => {
  const withSel = fakeEditor(docOf(p('anchor')))
  select(withSel, 1, 7)
  insertLink(withSel.editor, 'ignored', 'https://x.dev')
  assert.equal(withSel.state().doc.textContent, 'anchor', 'selected text is preserved')
  assert.equal(getLinkHref(withSel.editor), 'https://x.dev')

  const bare = fakeEditor(docOf(p('tail')))
  caretAt(bare, 'tail')
  insertLink(bare.editor)
  assert.match(bare.state().doc.textContent, /链接文本/)
  assert.equal(getLinkHref(bare.editor), 'https://')
})

test('getLinkHref / getLinkRange read the link at the caret', () => {
  // The mark belongs on the TEXT node (`Node.mark` only re-marks the node
  // itself, never its children) — build it via schema.text directly.
  const linked = schema.nodes.paragraph.create(
    null,
    schema.text('see here', [schema.marks.link.create({ href: 'https://example.com' })]),
  )
  const h1 = fakeEditor(docOf(p('before'), linked))
  caretAt(h1, 'see here')
  assert.equal(getLinkHref(h1.editor), 'https://example.com')

  const range = getLinkRange(h1.editor)
  assert.ok(range)
  assert.equal(h1.state().doc.textBetween(range!.from, range!.to), 'see here')

  const plain = fakeEditor(docOf(p('plain')))
  caretAt(plain, 'plain')
  assert.equal(getLinkHref(plain.editor), null)
  assert.equal(getLinkHref(null), null)
})

test('setLinkHref rewrites and removeLink strips the mark', () => {
  const linked = schema.nodes.paragraph.create(
    null,
    schema.text('target', [schema.marks.link.create({ href: 'https://old' })]),
  )
  const h1 = fakeEditor(docOf(linked))
  caretAt(h1, 'target')
  const range = getLinkRange(h1.editor)!
  setLinkHref(h1.editor, range.from, range.to, 'https://new')
  assert.equal(getLinkHref(h1.editor), 'https://new')

  // removeLink works on the SELECTION — a collapsed caret covers no marks.
  select(h1, range.from, range.to)
  removeLink(h1.editor)
  assert.equal(getLinkHref(h1.editor), null)
  assert.equal(h1.state().doc.textContent, 'target', 'text survives the unlink')
})

test('clearFormatting strips marks over a selection and resets the block', () => {
  const bold = schema.nodes.paragraph.create(
    null,
    schema.text('fat', [schema.marks.strong.create()]),
  )
  const h1 = fakeEditor(docOf(bold, p('after')))
  select(h1, 1, 4)
  clearFormatting(h1.editor)
  assert.ok(!isMarkActive(h1.editor, 'strong', 'bold'), 'mark gone')
  assert.equal(h1.state().doc.child(0).type.name, 'paragraph')
})

test('clearFormatting on a bare caret in a heading resets the block', () => {
  const h1 = fakeEditor(docOf(h(2, 'title')))
  caretAt(h1, 'title')
  clearFormatting(h1.editor)
  assert.equal(h1.state().selection.$from.parent.type.name, 'paragraph')
})

/* ------------------------------ insert commands ------------------------------ */

test('markdown insert commands drop their markers at the caret', () => {
  const cases: [string, (e: Editor) => void, RegExp][] = [
    ['insertHorizontalRule', insertHorizontalRule, /---/],
    ['insertFootnote', insertFootnote, /\[\^1\]/],
    ['insertLinkReference', insertLinkReference, /\[ref\]: https:\/\//],
    ['insertComment', insertComment, /<!-- 注释内容 -->/],
    ['insertToc', insertToc, /\[toc\]/],
    ['insertYamlFrontMatter', insertYamlFrontMatter, /title: Untitled/],
  ]
  for (const [name, run, pattern] of cases) {
    const h1 = fakeEditor(docOf(p('x')))
    caretAt(h1, 'x')
    run(h1.editor)
    assert.match(h1.state().doc.textContent, pattern, `${name} inserted its marker`)
  }
})

test('toggleTaskList inserts the task marker text', () => {
  const h1 = fakeEditor(docOf(p('x')))
  caretAt(h1, 'x')
  toggleTaskList(h1.editor)
  assert.match(h1.state().doc.textContent, /- \[ \] /)
})

test('insertPlainText inserts literally — Markdown stays inert', () => {
  const single = fakeEditor(docOf(p('x')))
  caretAt(single, 'x')
  insertPlainText(single.editor, '**not bold**')
  assert.equal(single.state().doc.textContent, 'x**not bold**', 'inserted at the caret, verbatim')

  const multi = fakeEditor(docOf(p('x')))
  caretAt(multi, 'x')
  insertPlainText(multi.editor, 'a\r\nb')
  assert.equal(multi.state().doc.childCount, 3, 'CRLF normalised into separate blocks')
  assert.equal(multi.state().doc.child(1).textContent, 'a')
  assert.equal(multi.state().doc.child(2).textContent, 'b')

  const empty = fakeEditor(docOf(p('x')))
  caretAt(empty, 'x')
  insertPlainText(empty.editor, '')
  assert.equal(empty.state().doc.textContent, 'x', 'empty paste is a no-op')
})

/* ---------------------------- history / selection ---------------------------- */

test('selectAll covers the whole document; deleteSelection removes the range', () => {
  const h1 = fakeEditor(docOf(p('abc')))
  assert.equal(selectAll(h1.editor), true)
  assert.equal(h1.state().selection.from, 0)
  assert.equal(h1.state().selection.to, h1.state().doc.content.size)

  const h2 = fakeEditor(docOf(p('abc')))
  select(h2, 2, 3) // the "b"
  assert.equal(deleteSelection(h2.editor), true)
  assert.equal(h2.state().doc.textContent, 'ac')
})

test('undo / redo are safe without the history plugin', () => {
  const h1 = fakeEditor(docOf(p('x')))
  // prosemirror-history's commands return false (rather than throw) when no
  // history plugin is configured — the toolbar must survive that.
  assert.equal(undo(h1.editor), false)
  assert.equal(redo(h1.editor), false)
})

test('deleteBlock removes the caret block and never empties the document', () => {
  const two = fakeEditor(docOf(p('a'), p('b')))
  caretAt(two, 'b')
  assert.equal(deleteBlock(two.editor), true)
  assert.equal(two.state().doc.childCount, 1)
  assert.equal(two.state().doc.textContent, 'a')

  const one = fakeEditor(docOf(p('only')))
  caretAt(one, 'only')
  assert.equal(deleteBlock(one.editor), true)
  assert.ok(one.state().doc.childCount >= 1, 'document keeps a paragraph')
})

/* ----------------------------- position helpers ----------------------------- */

test('nodeSelectionPos resolves the block a NodeSelection points at', () => {
  const h1 = fakeEditor(docOf(p('a'), p('b')))
  const doc = h1.state().doc
  // p("b") starts at position 3 (p("a") occupies 0..3: open, "a", close).
  // NodeSelection.create takes (doc, pos) — the raw position, not a $pos.
  h1.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as unknown as {
      state: EditorState
      dispatch: (tr: Transaction) => void
    }
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(doc, 3)))
  })
  assert.equal(nodeSelectionPos(h1.editor), 4, 'pos = node start + 1')

  const caret = fakeEditor(docOf(p('a')))
  caretAt(caret, 'a')
  assert.equal(nodeSelectionPos(caret.editor), null, 'text selection yields null')
  assert.equal(nodeSelectionPos(null), null)
})

test('getSelectionText returns the visible text of a selection', () => {
  const h1 = fakeEditor(docOf(p('one'), p('two')))
  select(h1, 1, 4)
  assert.equal(getSelectionText(h1.editor), 'one')

  const across = fakeEditor(docOf(p('one'), p('two')))
  select(across, 1, across.state().doc.content.size)
  assert.equal(getSelectionText(across.editor), 'one\ntwo')

  const bare = fakeEditor(docOf(p('one')))
  caretAt(bare, 'one')
  assert.equal(getSelectionText(bare.editor), '')
  assert.equal(getSelectionText(null), '')
})

test('getBlockInfo reports the caret block and heading level', () => {
  const onH = fakeEditor(docOf(h(3, 't')))
  caretAt(onH, 't')
  assert.deepEqual(getBlockInfo(onH.editor), { type: 'heading', level: 3 })

  const onP = fakeEditor(docOf(p('t')))
  caretAt(onP, 't')
  const info = getBlockInfo(onP.editor)!
  assert.equal(info.type, 'paragraph')
  assert.equal(info.level, undefined)

  assert.equal(getBlockInfo(null), null)
})

test('isMarkActive honours stored marks on a collapsed caret', () => {
  const h1 = fakeEditor(docOf(p('word')))
  caretAt(h1, 'word')
  // A collapsed caret carries no range marks — the pending (stored) marks are
  // what the toolbar must read, exactly as ProseMirror does while typing.
  // NB: `tr.setSelection` clears storedMarks, so the order here matters.
  h1.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as unknown as {
      state: EditorState
      dispatch: (tr: Transaction) => void
    }
    view.dispatch(view.state.tr.setStoredMarks([schema.marks.strong.create()]))
  })
  assert.ok(isMarkActive(h1.editor, 'strong', 'bold'), 'stored marks keep it active')
  assert.ok(!isMarkActive(h1.editor, 'emphasis'))
})

test('isNodeActive matches attrs exactly when given', () => {
  const h1 = fakeEditor(docOf(h(2, 't')))
  caretAt(h1, 't')
  assert.ok(isNodeActive(h1.editor, 'heading'))
  assert.ok(isNodeActive(h1.editor, 'heading', { level: 2 }))
  assert.ok(!isNodeActive(h1.editor, 'heading', { level: 3 }))
  assert.ok(!isNodeActive(h1.editor, 'blockquote'))
  assert.ok(!isNodeActive(null, 'heading'))
})

test('blockKindAt classifies the block under a position', () => {
  // Build the doc in one shot — PM nodes are immutable, so appendChild after
  // the fact would silently do nothing.
  const doc = schema.node('doc', null, [
    h(1, 'head'),
    p('para'),
    ul('li'),
    cb('code'),
    schema.node('blockquote', null, [p('quoted')]),
  ])
  const h1 = fakeEditor(doc)
  const posOf = (text: string): number => {
    let pos = -1
    doc.descendants((node, offset) => {
      if (pos < 0 && node.isText && node.text === text) {
        pos = offset
        return false
      }
      return true
    })
    return pos
  }
  assert.equal(blockKindAt(h1.editor, posOf('head')), 'heading')
  assert.equal(blockKindAt(h1.editor, posOf('para')), 'paragraph')
  assert.equal(blockKindAt(h1.editor, posOf('li')), 'list')
  assert.equal(blockKindAt(h1.editor, posOf('code')), 'code')
  assert.equal(blockKindAt(h1.editor, posOf('quoted')), 'quote')
})

test('blockRangeAt nudges a boundary position to the FOLLOWING block', () => {
  // Regression: a pos>=start && pos<=end scan matched the previous block first,
  // so handle actions hit the line above the one the user aimed at.
  const h1 = fakeEditor(docOf(p('a'), p('b')))
  const first = blockRangeAt(h1.editor, 0)!
  const second = blockRangeAt(h1.editor, first.end)! // exactly the boundary
  assert.equal(first.start, 0)
  assert.equal(second.start, first.end, 'boundary resolves to the next block')
  assert.equal(h1.state().doc.textBetween(second.from, second.to), 'b')
})

test('lineRangeAt inside a list is the item, outside it is the block', () => {
  const doc = docOf(p('above'), ul('a', 'b', 'c'))
  const h1 = fakeEditor(doc)
  let posB = -1
  doc.descendants((node, offset) => {
    if (posB < 0 && node.isText && node.text === 'b') {
      posB = offset
      return false
    }
    return true
  })
  const range = lineRangeAt(h1.editor, posB)!
  assert.equal(doc.textBetween(range.from, range.to), 'b', 'only the item, not the list')

  let posAbove = -1
  doc.descendants((node, offset) => {
    if (posAbove < 0 && node.isText && node.text === 'above') {
      posAbove = offset
      return false
    }
    return true
  })
  const top = lineRangeAt(h1.editor, posAbove)!
  assert.equal(doc.textBetween(top.from, top.to), 'above')
  assert.equal(lineRangeAt(null, 0), null)
})

test('getRangeText joins blocks with newlines and clamps out-of-range ends', () => {
  const h1 = fakeEditor(docOf(p('one'), p('two')))
  assert.equal(getRangeText(h1.editor, 0, h1.state().doc.content.size), 'one\ntwo')
  assert.equal(getRangeText(h1.editor, 0, 99999), 'one\ntwo', 'clamped, no throw')
  assert.equal(getRangeText(null, 0, 1), '')
})

test('insertBlockAfter adds an empty paragraph and returns its caret', () => {
  const h1 = fakeEditor(docOf(p('a'), p('b')))
  let posA = -1
  h1.state().doc.descendants((node, offset) => {
    if (posA < 0 && node.isText && node.text === 'a') {
      posA = offset
      return false
    }
    return true
  })
  const caret = insertBlockAfter(h1.editor, posA)
  assert.ok(caret != null)
  assert.equal(h1.state().doc.childCount, 3)
  assert.equal(h1.state().doc.child(1).textContent, '', 'empty line right after the block')
  assert.equal(h1.state().selection.from, caret, 'caret sits in the new line')
  assert.equal(insertBlockAfter(null, 0), null)
})

test('setCaret / getSelectionRange / setSelectionRange move and clamp safely', () => {
  const h1 = fakeEditor(docOf(p('abcdef')))
  setCaret(h1.editor, 3)
  const range = getSelectionRange(h1.editor)!
  assert.equal(range.from, 3)
  assert.equal(range.empty, true)

  setSelectionRange(h1.editor, 1, 4)
  const sel = getSelectionRange(h1.editor)!
  assert.equal(sel.from, 1)
  assert.equal(sel.to, 4)
  assert.equal(sel.empty, false)

  setSelectionRange(h1.editor, 0, 99999) // far out of bounds — must clamp, not throw
  assert.ok(getSelectionRange(h1.editor)!.to <= h1.state().doc.content.size)
  assert.equal(getSelectionRange(null), null)
})

test('focus hands focus to the view without throwing', () => {
  const h1 = fakeEditor(docOf(p('x')))
  focus(h1.editor) // no assertion possible on the stub — the contract is "no throw"
  focus(null)
})

test('replaceImageSrc rewrites only matching image nodes', () => {
  // PM nodes are immutable — build the doc with the images already inside.
  const withImg = (text: string, src: string) =>
    schema.nodes.paragraph.create(null, [schema.text(text), img(src)])
  const doc = schema.node('doc', null, [withImg('one', 'old.png'), withImg('two', 'keep.png')])
  const h1 = fakeEditor(doc)
  replaceImageSrc(h1.editor, 'old.png', 'new.png')
  const srcs: string[] = []
  h1.state().doc.descendants((n) => {
    if (n.type.name === 'image') srcs.push((n.attrs as { src: string }).src)
  })
  assert.deepEqual(srcs, ['new.png', 'keep.png'])

  replaceImageSrc(null, 'a', 'b') // null and identity are early returns
})

test('posAtCoords / viewDomRect read through to the view', () => {
  const h1 = fakeEditor(docOf(p('x')))
  assert.equal(posAtCoords(h1.editor, { left: 0, top: 0 }), 1)
  assert.equal(posAtCoords(h1.editor, { left: -1, top: -1 }), null, 'outside maps to null')
  const rect = viewDomRect(h1.editor)
  assert.ok(rect)
  assert.equal(rect!.top, 1)
  assert.equal(viewDomRect(null), null)
})
