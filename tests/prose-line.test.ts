import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@milkdown/prose/model'
import { EditorState, type Transaction } from '@milkdown/prose/state'
import { editorViewCtx } from '@milkdown/core'
import type { Editor } from '@milkdown/core'
import { lineRangeAt, deleteLineAt } from '../src/commands/prose'

// The "::" block handle acts on the LINE under the pointer: one list item, not
// the whole list. These tests pin that contract — the regression the user hit
// ("deleting one bullet removed the entire list") lived exactly here.

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
    blockquote: { group: 'block', content: 'block+', toDOM: () => ['blockquote', 0] },
    bullet_list: { group: 'block', content: 'list_item+', toDOM: () => ['ul', 0] },
    ordered_list: { group: 'block', content: 'list_item+', toDOM: () => ['ol', 0] },
    list_item: { content: 'paragraph block*', toDOM: () => ['li', 0] },
    text: { group: 'inline' },
  },
  marks: {},
})

const p = (text: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
const h = (text: string) => schema.nodes.heading.create({ level: 1 }, schema.text(text))
const li = (text: string) => schema.nodes.list_item.create(null, p(text))
const ul = (...texts: string[]) => schema.nodes.bullet_list.create(null, texts.map(li))
const quote = (...blocks: ReturnType<typeof p>[]) => schema.nodes.blockquote.create(null, blocks)

/** A stand-in Milkdown `Editor` that runs callbacks against a fixed view. */
function fakeEditor(doc: ReturnType<Schema['node']>): {
  editor: Editor
  state: () => EditorState
} {
  // A real ProseMirror view applies each dispatched transaction to its state;
  // the stand-in has to do the same, otherwise `deleteLineAt` looks like a
  // no-op even when it worked.
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
    action: (cb: (ctx: { get: (k: unknown) => unknown }) => void) => cb({ get: () => view }),
  } as unknown as Editor
  return { editor, state: () => editor.action((ctx) => ctx.get(editorViewCtx).state) }
}

/** Build a doc and resolve `pos` against it, returning the line range. */
function lineRange(doc: ReturnType<Schema['node']>, pos?: number) {
  const { editor } = fakeEditor(doc)
  return lineRangeAt(editor, pos)
}

test('a list item is the line — not the whole list', () => {
  // doc: p("above"), ul("a","b","c")
  const doc = schema.node('doc', null, [p('above'), ul('a', 'b', 'c')])
  // ul starts after p: p occupies [0, 7) ("above" = 5 chars + 2 tokens).
  // Walk to the second item's text: find it via the doc instead of hardcoding.
  let itemBStart = -1
  doc.descendants((node, pos) => {
    if (itemBStart < 0 && node.type.name === 'list_item' && node.textContent === 'b') {
      itemBStart = pos + 1
      return false
    }
    return true
  })
  assert.ok(itemBStart > 0, 'second item located')
  const range = lineRange(doc, itemBStart)
  assert.ok(range, 'range resolved')
  assert.equal(doc.textBetween(range!.from, range!.to, '\n', '\n'), 'b')
})

test('outside a list the line is the top-level block', () => {
  const doc = schema.node('doc', null, [h('title'), p('body')])
  let bodyPos = -1
  doc.descendants((node, pos) => {
    if (bodyPos < 0 && node.type.name === 'paragraph' && node.textContent === 'body') {
      bodyPos = pos + 1
      return false
    }
    return true
  })
  const range = lineRange(doc, bodyPos)
  assert.ok(range, 'range resolved')
  assert.equal(doc.textBetween(range!.from, range!.to, '\n', '\n'), 'body')
})

test('a caret on a block boundary is nudged forward, not into the block above', () => {
  // Position 0 sits exactly before the first block; resolving it raw would
  // give depth 0 — the boundary case that made handle actions hit the wrong
  // block. The line must be the FIRST block.
  const doc = schema.node('doc', null, [p('first'), p('second')])
  const range = lineRange(doc, 0)
  assert.ok(range, 'range resolved')
  assert.equal(doc.textBetween(range!.from, range!.to, '\n', '\n'), 'first')
})

test('deleteLineAt removes one item and keeps the rest of the list', () => {
  const doc = schema.node('doc', null, [p('above'), ul('a', 'b', 'c'), p('below')])
  const { editor, state } = fakeEditor(doc)
  let itemBStart = -1
  doc.descendants((node, pos) => {
    if (itemBStart < 0 && node.type.name === 'list_item' && node.textContent === 'b') {
      itemBStart = pos + 1
      return false
    }
    return true
  })
  assert.equal(deleteLineAt(editor, itemBStart), true)
  const after = state()
  assert.equal(after.doc.childCount, 3, 'p + ul + p survive')
  const list = after.doc.child(1)
  assert.equal(list.type.name, 'bullet_list')
  assert.deepEqual(
    list.content.content.map((n) => n.textContent),
    ['a', 'c'],
    'only item "b" is gone',
  )
})

test('deleteLineAt prunes a list emptied by the delete', () => {
  // ProseMirror refills a `bullet_list` whose last item is removed with a fresh
  // empty item; that lone empty list must disappear too (it renders as a stray
  // dangling marker).
  const doc = schema.node('doc', null, [p('above'), ul('only'), p('below')])
  const { editor, state } = fakeEditor(doc)
  let onlyPos = -1
  doc.descendants((node, pos) => {
    if (onlyPos < 0 && node.type.name === 'list_item') {
      onlyPos = pos + 1
      return false
    }
    return true
  })
  assert.equal(deleteLineAt(editor, onlyPos), true)
  const after = state()
  assert.equal(after.doc.childCount, 2, 'the emptied list is pruned')
  assert.deepEqual(
    Array.from({ length: after.doc.childCount }, (_, i) => after.doc.child(i).type.name),
    ['paragraph', 'paragraph'],
  )
})

test('deleteLineAt prunes an emptied blockquote', () => {
  const doc = schema.node('doc', null, [p('above'), quote(p('quoted')), p('below')])
  const { editor, state } = fakeEditor(doc)
  let qPos = -1
  doc.descendants((node, pos) => {
    if (qPos < 0 && node.type.name === 'paragraph' && node.textContent === 'quoted') {
      qPos = pos + 1
      return false
    }
    return true
  })
  assert.equal(deleteLineAt(editor, qPos), true)
  const after = state()
  assert.equal(after.doc.childCount, 2, 'the emptied blockquote is pruned')
  assert.ok(
    after.doc.textContent.includes('above') && after.doc.textContent.includes('below'),
    'surrounding blocks untouched',
  )
  assert.ok(!after.doc.textContent.includes('quoted'), 'the quoted line is gone')
})

test('deleteLineAt never leaves the document empty', () => {
  const doc = schema.node('doc', null, [p('only line')])
  const { editor, state } = fakeEditor(doc)
  assert.equal(deleteLineAt(editor, 1), true)
  assert.equal(state().doc.childCount, 1, 'a blank paragraph keeps the doc valid')
})
