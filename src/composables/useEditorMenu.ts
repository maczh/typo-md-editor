import { ref } from 'vue'
import type { BlockKind } from '@/commands/prose'

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

const open = ref(false)
const x = ref(0)
const y = ref(0)
const kind = ref<MenuKind>('paragraph')
const range = ref<MenuRange | null>(null)
/**
 * When the menu is opened from a block handle we may want a submenu expanded
 * right away (e.g. the "+" handle opens the insert submenu). `null` means "no
 * submenu pre-expanded" — used by the right-click context menu.
 */
const sub = ref<string | null>(null)
/**
 * A hook the opener may leave behind, run *instead of* restoring the captured
 * range when an item is picked. The "+" handle uses it to create the new empty
 * line at that point — the line must not exist until the user actually picks
 * something, but the action then needs it to exist already.
 */
const beforeRun = ref<(() => void) | null>(null)

/** Submenu ids recognised by `EditorContextMenu`. */
export type MenuSub = 'insert' | 'style' | 'table' | null

export function useEditorMenu() {
  return {
    open,
    x,
    y,
    kind,
    range,
    sub,
    beforeRun,
    show(
      px: number,
      py: number,
      k: MenuKind = 'paragraph',
      r: MenuRange | null = null,
      s: MenuSub = null,
      before?: (() => void) | null,
    ): void {
      x.value = px
      y.value = py
      kind.value = k
      range.value = r
      sub.value = s
      beforeRun.value = before ?? null
      open.value = true
    },
    hide(): void {
      open.value = false
      sub.value = null
      beforeRun.value = null
    },
  }
}
