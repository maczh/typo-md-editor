import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@milkdown/prose/model'
import { EditorState, type Transaction, TextSelection } from '@milkdown/prose/state'
import { editorViewCtx, serializerCtx } from '@milkdown/core'
import type { Editor } from '@milkdown/core'
import { bumpHeading, isTaskItemActive, selectionMarkdown } from '../src/commands/prose'

// Regression tests for the menu / hotkey wiring fixes:
//  - bumpHeading's paragraph fallback used to be keyed backwards (Ctrl+= gave
//    H6, Ctrl+- gave H1) and it never lifted out of a list.
//  - There is no `task_list` node in Milkdown 7 GFM: the preset *extends*
//    `list_item` with a `checked` attr (null for ordinary items, boolean for
//    task items) — probing node names or attr presence both misdetect.
//  - "copy as Markdown" must serialize the selection, not the whole document.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 1 } },
      toDOM: () => ['h1', 0],
    },
    bullet_list: { group: 'block', content: 'list_item+', toDOM: () => ['ul', 0] },
    // Mirrors the real GFM schema: EVERY list_item carries `checked` (null for
    // ordinary items) — that is what makes name/attr-presence probes wrong.
    list_item: {
      content: 'paragraph block*',
      attrs: { checked: { default: null } },
      toDOM: () => ['li', 0],
    },
    text: { group: 'inline' },
  },
  marks: {},
})

const p = (text: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
const h = (level: number, text: string) => schema.nodes.heading.create({ level }, schema.text(text))
const li = (text: string, checked: boolean | null = null) =>
  schema.nodes.list_item.create({ checked }, p(text))
const ul = (...texts: string[]) => schema.nodes.bullet_list.create(null, texts.map((t) => li(t)))

/** A stand-in Milkdown `Editor` that runs callbacks against a fixed view. */
function fakeEditor(
  doc: ReturnType<Schema['node']>,
  serializer?: (node: { textContent: string }) => string,
) {
  // A real ProseMirror view applies each dispatched transaction to its state;
  // the stand-in has to do the same, otherwise commands look like no-ops.
  let current = EditorState.create({ doc })
  const view = {
    get state() {
      return current
    },
    dispatch: (tr: Transaction) => {
      current = current.apply(tr)
    },
  }
  const editor = {
    action: (cb: (ctx: { get: (k: unknown) => unknown }) => void) =>
      cb({ get: (k: unknown) => (serializer && k === serializerCtx ? serializer : view) }),
  } as unknown as Editor
  return { editor, state: () => current }
}

/** Put the caret at the start of the first text node whose content is `text`. */
function caretAt(editor: Editor, doc: ReturnType<Schema['node']>, text: string): void {
  let pos = -1
  doc.descendants((node, offset) => {
    if (pos < 0 && node.isText && node.text === text) {
      pos = offset
      return false
    }
    return true
  })
  assert.ok(pos >= 0, `text "${text}" located`)
  select(editor, pos, pos)
}

/** Select [from, to] on the stand-in editor. */
function select(editor: Editor, from: number, to: number): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as unknown as {
      state: EditorState
      dispatch: (tr: Transaction) => void
    }
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  })
}

/** Offset of the first text node whose content is `text`. */
function offsetOf(doc: ReturnType<Schema['node']>, text: string): number {
  let pos = -1
  doc.descendants((node, offset) => {
    if (pos < 0 && node.isText && node.text === text) {
      pos = offset
      return false
    }
    return true
  })
  assert.ok(pos >= 0, `text "${text}" located`)
  return pos
}

/* ------------------------------ bumpHeading ------------------------------ */

test('promote moves a heading towards H1 (Ctrl+=)', () => {
  const doc = schema.node('doc', null, [p('above'), h(2, 'title')])
  const { editor, state } = fakeEditor(doc)
  caretAt(editor, doc, 'title')
  bumpHeading(editor, -1)
  const after = state()
  assert.equal(after.doc.child(1).type.name, 'heading')
  assert.equal((after.doc.child(1).attrs as { level: number }).level, 1)
})

test('demote moves a heading towards H6 (Ctrl+-)', () => {
  const doc = schema.node('doc', null, [p('above'), h(1, 'title')])
  const { editor, state } = fakeEditor(doc)
  caretAt(editor, doc, 'title')
  bumpHeading(editor, 1)
  const after = state()
  assert.equal((after.doc.child(1).attrs as { level: number }).level, 2)
})

test('promoting a plain paragraph yields H1 — not H6 (the old fallback)', () => {
  const doc = schema.node('doc', null, [p('above'), p('body')])
  const { editor, state } = fakeEditor(doc)
  caretAt(editor, doc, 'body')
  bumpHeading(editor, -1)
  const after = state()
  assert.equal(after.doc.child(1).type.name, 'heading')
  assert.equal((after.doc.child(1).attrs as { level: number }).level, 1)
})

test('demoting a plain paragraph yields H6 — not H1 (the old fallback)', () => {
  const doc = schema.node('doc', null, [p('above'), p('body')])
  const { editor, state } = fakeEditor(doc)
  caretAt(editor, doc, 'body')
  bumpHeading(editor, 1)
  const after = state()
  assert.equal(after.doc.child(1).type.name, 'heading')
  assert.equal((after.doc.child(1).attrs as { level: number }).level, 6)
})

test('bumpHeading clamps at H1 and H6', () => {
  const top = fakeEditor(schema.node('doc', null, [h(1, 'title')]))
  caretAt(top.editor, schema.node('doc', null, [h(1, 'title')]), 'title')
  bumpHeading(top.editor, -1)
  assert.equal((top.state().doc.child(0).attrs as { level: number }).level, 1)

  const bottom = fakeEditor(schema.node('doc', null, [h(6, 'title')]))
  caretAt(bottom.editor, schema.node('doc', null, [h(6, 'title')]), 'title')
  bumpHeading(bottom.editor, 1)
  assert.equal((bottom.state().doc.child(0).attrs as { level: number }).level, 6)
})

test('bumpHeading lifts a list line out of the list first (no silent no-op)', () => {
  // Markdown cannot nest a heading inside a list_item, so without the lift the
  // block change is rejected and Ctrl+= appears dead on a list line.
  const doc = schema.node('doc', null, [p('above'), ul('item')])
  const { editor, state } = fakeEditor(doc)
  caretAt(editor, doc, 'item')
  bumpHeading(editor, -1)
  const after = state()
  assert.equal(after.doc.childCount, 2, 'p + promoted heading, no leftover list')
  assert.equal(after.doc.child(1).type.name, 'heading')
  assert.equal((after.doc.child(1).attrs as { level: number }).level, 1)
  assert.equal(after.doc.child(1).textContent, 'item')
})

/* ---------------------------- isTaskItemActive ---------------------------- */

test('a task item is a list_item whose checked attr is non-null', () => {
  const doc = schema.node('doc', null, [
    p('above'),
    schema.nodes.bullet_list.create(null, [li('todo', true), li('done', false), li('plain')]),
  ])
  const { editor } = fakeEditor(doc)

  caretAt(editor, doc, 'todo')
  assert.equal(isTaskItemActive(editor), true, 'checked=true item is a task item')

  caretAt(editor, doc, 'done')
  assert.equal(isTaskItemActive(editor), true, 'checked=false item is still a task item')

  caretAt(editor, doc, 'plain')
  assert.equal(isTaskItemActive(editor), false, 'ordinary bullet item is not a task')

  const para = fakeEditor(schema.node('doc', null, [p('body')]))
  caretAt(para.editor, para.state().doc, 'body')
  assert.equal(isTaskItemActive(para.editor), false, 'paragraph is not a task item')
})

/* ---------------------------- selectionMarkdown --------------------------- */

test('selectionMarkdown serializes the selection (not the whole document)', () => {
  const doc = schema.node('doc', null, [p('first'), p('second')])
  const serializer = (node: { textContent: string }): string => `MD(${node.textContent})`
  const { editor } = fakeEditor(doc, serializer)
  assert.equal(selectionMarkdown(editor), null, 'collapsed caret has no selection to serialize')

  const from = offsetOf(doc, 'first')
  const to = offsetOf(doc, 'second') + 'second'.length
  select(editor, from, to)
  assert.equal(selectionMarkdown(editor), 'MD(firstsecond)')
})

test('selectionMarkdown wraps an inline-only selection into a doc (createAndFill)', () => {
  // A selection strictly inside one paragraph yields an inline-only slice;
  // ProseMirror's createAndFill wraps it in a paragraph, so the serializer
  // still runs and produces the right Markdown.
  const doc = schema.node('doc', null, [p('first'), p('second')])
  const serializer = (node: { textContent: string }): string => `MD(${node.textContent})`
  const { editor } = fakeEditor(doc, serializer)
  const from = offsetOf(doc, 'first')
  select(editor, from, from + 'first'.length)
  assert.equal(selectionMarkdown(editor), 'MD(first)')
})

test('selectionMarkdown falls back to plain text without a serializer', () => {
  const doc = schema.node('doc', null, [p('first'), p('second')])
  const { editor } = fakeEditor(doc)
  const from = offsetOf(doc, 'first')
  select(editor, from, from + 'first'.length)
  assert.equal(selectionMarkdown(editor), 'first')
})
