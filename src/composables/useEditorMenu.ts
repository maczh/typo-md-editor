import type { BlockKind } from '@/commands/prose'
import { makeReactive, refLike, useStoreSubscription } from '@/composables/useStoreSafe'

/**
 * Shared state for the editor's floating menu. A single module-level singleton so
 * both entry points — the per-line block handle and the right-click context menu —
 * drive the exact same component.
 *
 * `kind` records what the caret was on when the menu opened, which lets the menu
 * show a different set of actions for a table vs. a plain paragraph.
 */
export type MenuKind = BlockKind

/** The document range the menu's actions should apply to. */
export interface MenuRange {
  from: number
  to: number
}

/** Submenu ids recognised by `EditorContextMenu`. */
export type MenuSub = 'insert' | 'style' | 'table' | null

interface MenuState {
  open: boolean
  x: number
  y: number
  kind: MenuKind
  range: MenuRange | null
  sub: MenuSub
  beforeRun: (() => void) | null
}

const menuObs = makeReactive<MenuState>({
  open: false,
  x: 0,
  y: 0,
  kind: 'paragraph',
  range: null,
  sub: null,
  beforeRun: null,
})

export interface EditorMenuApi {
  open: { value: boolean }
  x: { value: number }
  y: { value: number }
  kind: { value: MenuKind }
  range: { value: MenuRange | null }
  sub: { value: MenuSub }
  beforeRun: { value: (() => void) | null }
  show: (
    px: number,
    py: number,
    k?: MenuKind,
    r?: MenuRange | null,
    s?: MenuSub,
    before?: (() => void) | null,
  ) => void
  hide: () => void
}

export const menuApi: EditorMenuApi = {
  open: refLike(menuObs, 'open'),
  x: refLike(menuObs, 'x'),
  y: refLike(menuObs, 'y'),
  kind: refLike(menuObs, 'kind'),
  range: refLike(menuObs, 'range'),
  sub: refLike(menuObs, 'sub'),
  beforeRun: refLike(menuObs, 'beforeRun'),

  show(px, py, k = 'paragraph', r = null, s = null, before = null) {
    menuObs.set({
      x: px,
      y: py,
      kind: k,
      range: r,
      sub: s,
      beforeRun: before ?? null,
      open: true,
    })
  },

  hide() {
    menuObs.set({ open: false, sub: null, beforeRun: null })
  },
}

export function useEditorMenu(): EditorMenuApi {
  useStoreSubscription(menuObs)
  return menuApi
}
