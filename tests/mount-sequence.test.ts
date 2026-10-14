import test from 'node:test'
import assert from 'node:assert/strict'
import { createMountSequence } from '@/composables/mountSequence'

/**
 * Regression tests for the mount race that produced the "two identical
 * documents, first copy's handles dead" bug.
 *
 * `createEditor` is async, so React 18 StrictMode's mount → cleanup → mount
 * cycle starts a second mount before the first resolves; the cleanup's
 * `destroy()` cannot stop it because the shared store is still empty. The
 * sequence guard makes the superseded editor discard itself.
 */

/** A fake editor whose async creation resolves on demand. */
function fakeEditor(id: number) {
  let finish: (() => void) | null = null
  const created = new Promise<void>((res) => {
    finish = res
  })
  return {
    id,
    created,
    finishCreate: () => finish?.(),
    destroyed: false,
    destroy(): void {
      this.destroyed = true
    },
  }
}

/** Mirrors `milkApi.mount`: publish on resolve, self-discard when stale. */
function mountWithGuard(
  seq: ReturnType<typeof createMountSequence>,
  editor: ReturnType<typeof fakeEditor>,
  published: number[],
): Promise<void> {
  const token = seq.next()
  return (async () => {
    await editor.created // createEditor resolves here
    if (!seq.isCurrent(token)) {
      editor.destroy() // superseded by a newer mount / destroy
      return
    }
    published.push(editor.id)
  })()
}

test('a lone mount publishes its editor', async () => {
  const seq = createMountSequence()
  const published: number[] = []
  const editor = fakeEditor(1)

  const mount = mountWithGuard(seq, editor, published)
  editor.finishCreate()
  await mount

  assert.deepEqual(published, [1])
  assert.equal(editor.destroyed, false)
})

test('StrictMode remount: only the newest editor survives', async () => {
  const seq = createMountSequence()
  const published: number[] = []
  const first = fakeEditor(1)
  const second = fakeEditor(2)

  // effect #1 — mount starts, createEditor still in flight
  const m1 = mountWithGuard(seq, first, published)
  // cleanup #1 — destroy() runs while the store is still empty
  seq.invalidate()
  // effect #2 — a second mount starts before the first one resolved
  const m2 = mountWithGuard(seq, second, published)

  first.finishCreate()
  second.finishCreate()
  await Promise.all([m1, m2])

  assert.deepEqual(published, [2], 'the superseded editor must never publish')
  assert.equal(first.destroyed, true, 'the superseded editor must self-destroy')
  assert.equal(second.destroyed, false)
})

test('destroy() retires an in-flight mount', async () => {
  const seq = createMountSequence()
  const published: number[] = []
  const editor = fakeEditor(1)

  const mount = mountWithGuard(seq, editor, published)
  seq.invalidate() // unmount before createEditor resolved
  editor.finishCreate()
  await mount

  assert.deepEqual(published, [])
  assert.equal(editor.destroyed, true)
})

test('unmount then remount publishes each editor in turn', async () => {
  const seq = createMountSequence()
  const published: number[] = []
  const a = fakeEditor(1)
  const b = fakeEditor(2)

  const ma = mountWithGuard(seq, a, published)
  a.finishCreate()
  await ma
  seq.invalidate() // unmount

  const mb = mountWithGuard(seq, b, published)
  b.finishCreate()
  await mb

  assert.deepEqual(published, [1, 2])
  assert.equal(a.destroyed, false)
  assert.equal(b.destroyed, false)
})
