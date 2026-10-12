import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOutlineFromMarkdown } from '../src/utils/outline'

// PRD REQ-P0-05: outline must capture H1–H6, nest correctly, and ignore
// headings that live inside fenced code blocks.

test('captures H1–H6 with correct level and text', () => {
  const md = ['# h1', '## h2', '### h3', '#### h4', '##### h5', '###### h6'].join('\n')
  const out = buildOutlineFromMarkdown(md)
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'h1')
  assert.equal(out[0].level, 1)
  let cur = out[0]
  for (let lvl = 2; lvl <= 6; lvl++) {
    assert.equal(cur.children.length, 1)
    cur = cur.children[0]
    assert.equal(cur.level, lvl)
    assert.equal(cur.text, `h${lvl}`)
  }
})

test('nests headings according to their level', () => {
  const md = '# A\n## B\n# C'
  const out = buildOutlineFromMarkdown(md)
  assert.equal(out.length, 2)
  assert.equal(out[0].text, 'A')
  assert.equal(out[0].children.length, 1)
  assert.equal(out[0].children[0].text, 'B')
  assert.equal(out[0].children[0].level, 2)
  assert.equal(out[1].text, 'C')
  assert.equal(out[1].children.length, 0)
})

test('ignores headings inside fenced code blocks', () => {
  const md = '# Real\n\n```\n# Fake heading\n```\n\n## Also real'
  const out = buildOutlineFromMarkdown(md)
  // 'Real' (H1) is top-level; 'Also real' (H2) correctly nests under it.
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'Real')
  assert.equal(out[0].level, 1)
  assert.equal(out[0].children.length, 1)
  assert.equal(out[0].children[0].text, 'Also real')
  // the heading that lives inside the fence must never appear
  assert.doesNotMatch(JSON.stringify(out), /Fake heading/)
})

test('assigns unique sequential ids and marks pos as -1 for markdown source', () => {
  const md = '# A\n# B\n# C'
  const out = buildOutlineFromMarkdown(md)
  assert.deepEqual(out.map((n) => n.id), ['heading-0', 'heading-1', 'heading-2'])
  for (const n of out) assert.equal(n.pos, -1)
})

test('handles headings with trailing spaces and empty documents', () => {
  const out = buildOutlineFromMarkdown('#   Trimmed   \n\nno headings here')
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'Trimmed')
  assert.deepEqual(buildOutlineFromMarkdown(''), [])
})
