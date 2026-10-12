import { onMounted, onBeforeUnmount } from 'vue'
import * as A from '@/commands/actions'
import { useUI } from '@/composables/useUI'
import { useSettingsStore } from '@/stores/settings'
import { requestSave } from '@/composables/useSaveRequest'
import type { HotkeySpec } from '@/types'

/**
 * Central hotkey registry — the single source of truth for every command's
 * shortcut. The toolbar, the floating (right-click / block-handle) menu and the
 * global key handler all read from here, so the *same* shortcut is displayed
 * everywhere and the *same* binding fires, and users can rebind any command from
 * Settings → Hotkey Management.
 *
 * Design notes:
 * - `metaKey` is treated as `ctrlKey` so the same bindings work on macOS.
 * - Commands the ProseMirror editor owns natively (bold/italic/undo/redo/cut/
 *   copy/paste/selectAll) are registered *display-only* (no `run`) — the editor
 *   handles them, so we only show their shortcut and never double-toggle.
 * - `global: true` bindings (save, find, …) also fire while typing in
 *   inputs/textareas; everything else is suppressed when a field is focused so it
 *   only acts inside the editor.
 * - When a modal dialog is open, only Ctrl/Cmd+S is allowed (dialogs own their
 *   own keyboard handling).
 * - Desktop-shell commands (new / open / openFolder / saveAs / quickOpen /
 *   commandPalette / close / toggleSidebar / fileTree) are intentionally absent:
 *   this package has no file shell. `save` fires the `@save` event bus instead of
 *   writing a file.
 */

/** A rebindable command plus its default binding and display metadata. */
export interface CommandDef {
  /** Stable id, shared with menu item ids and persisted overrides. */
  id: string
  /** i18n key for the human-readable command name. */
  labelKey: string
  /** Default binding. */
  default: HotkeySpec
  /** Action to run; omitted for editor-native / display-only commands. */
  run?: () => void | Promise<void>
  /** Fire even when a form field is focused. */
  global?: boolean
}

function h(n: number): () => void {
  return () => A.setHeading(n)
}

export const COMMAND_DEFS: CommandDef[] = [
  // ── File / global ───────────────────────────────────────────────
  { id: 'save', labelKey: 'menu.save', default: { ctrl: true, key: 's' }, run: requestSave, global: true },
  { id: 'preferences', labelKey: 'menu.preferences', default: { ctrl: true, key: ',' }, run: A.openPreferences, global: true },
  { id: 'sourceMode', labelKey: 'menu.sourceMode', default: { ctrl: true, key: '/' }, run: A.toggleSourceMode, global: true },
  { id: 'find', labelKey: 'menu.find', default: { ctrl: true, key: 'f' }, run: A.openFind, global: true },
  { id: 'replace', labelKey: 'menu.replace', default: { ctrl: true, key: 'h' }, run: A.openFind, global: true },

  // ── Paragraph / blocks ──────────────────────────────────────────
  { id: 'paragraph', labelKey: 'menu.paragraph', default: { ctrl: true, key: '0' }, run: A.setParagraph },
  { id: 'h1', labelKey: 'menu.h1', default: { ctrl: true, key: '1' }, run: h(1) },
  { id: 'h2', labelKey: 'menu.h2', default: { ctrl: true, key: '2' }, run: h(2) },
  { id: 'h3', labelKey: 'menu.h3', default: { ctrl: true, key: '3' }, run: h(3) },
  { id: 'h4', labelKey: 'menu.h4', default: { ctrl: true, key: '4' }, run: h(4) },
  { id: 'h5', labelKey: 'menu.h5', default: { ctrl: true, key: '5' }, run: h(5) },
  { id: 'h6', labelKey: 'menu.h6', default: { ctrl: true, key: '6' }, run: h(6) },
  { id: 'incHeading', labelKey: 'menu.incHeading', default: { ctrl: true, key: '=' }, run: A.increaseHeadingLevel },
  { id: 'decHeading', labelKey: 'menu.decHeading', default: { ctrl: true, key: '-' }, run: A.decreaseHeadingLevel },
  { id: 'insertTable', labelKey: 'menu.insertTable', default: { ctrl: true, key: 't' }, run: A.insertTable },
  { id: 'mathBlock', labelKey: 'menu.insertMath', default: { ctrl: true, shift: true, key: 'm' }, run: A.insertMathBlock },
  { id: 'codeBlock', labelKey: 'menu.codeBlock', default: { ctrl: true, shift: true, key: 'k' }, run: A.insertCodeBlock },
  { id: 'quote', labelKey: 'menu.quote', default: { ctrl: true, shift: true, key: 'q' }, run: A.insertBlockquote },
  { id: 'orderedList', labelKey: 'menu.orderedList', default: { ctrl: true, shift: true, key: '[' }, run: A.insertOrderedList },
  { id: 'unorderedList', labelKey: 'menu.unorderedList', default: { ctrl: true, shift: true, key: ']' }, run: A.insertUnorderedList },
  { id: 'taskList', labelKey: 'menu.taskList', default: { ctrl: true, shift: true, key: 'x' }, run: A.insertTaskList },
  { id: 'linkReference', labelKey: 'menu.linkReference', default: { alt: true, ctrl: true, key: 'l' }, run: A.insertLinkReference },
  { id: 'footnote', labelKey: 'menu.footnote', default: { alt: true, ctrl: true, key: 'r' }, run: A.insertFootnote },
  { id: 'inlineMath', labelKey: 'menu.inlineMath', default: { ctrl: true, key: 'm' }, run: A.insertInlineMath },

  // ── Format ──────────────────────────────────────────────────────
  { id: 'link', labelKey: 'menu.link', default: { ctrl: true, key: 'k' }, run: A.insertHyperlink },
  // Inline code: match the physical Backquote key (Ctrl/Cmd+Shift+`) — `e.key`
  // reports '~' while Shift is held, so a `key: '`'` binding would never fire.
  { id: 'inlineCode', labelKey: 'menu.code', default: { ctrl: true, shift: true, code: 'Backquote', key: '`' }, run: A.toggleInlineCode },
  { id: 'underline', labelKey: 'menu.underline', default: { ctrl: true, key: 'u' }, run: A.toggleUnderline },
  { id: 'strike', labelKey: 'menu.strike', default: { alt: true, shift: true, key: '5' }, run: A.toggleStrike },
  { id: 'clearFormat', labelKey: 'menu.clearFormat', default: { ctrl: true, key: '\\' }, run: A.clearStyle },
  { id: 'copyAsMarkdown', labelKey: 'menu.copyAsMarkdown', default: { ctrl: true, shift: true, key: 'd' }, run: A.copyAsMarkdown },
  { id: 'pastePlain', labelKey: 'menu.pastePlain', default: { ctrl: true, shift: true, key: 'v' }, run: A.pasteAsPlainText },

  // ── View ───────────────────────────────────────────────────────
  { id: 'focusMode', labelKey: 'menu.focusMode', default: { key: 'f8' }, run: A.toggleFocusMode },
  { id: 'typewriterMode', labelKey: 'menu.typewriterMode', default: { key: 'f9' }, run: A.toggleTypewriterMode },
  { id: 'fullscreen', labelKey: 'menu.fullscreen', default: { key: 'f11' }, run: A.toggleFullscreen },
  { id: 'zoomActual', labelKey: 'menu.zoomActual', default: { ctrl: true, shift: true, key: '0' }, run: A.zoomActualSize },
  { id: 'zoomIn', labelKey: 'menu.zoomIn', default: { ctrl: true, shift: true, key: '=' }, run: A.zoomIn },
  { id: 'zoomOut', labelKey: 'menu.zoomOut', default: { ctrl: true, shift: true, key: '-' }, run: A.zoomOut },

  // ── Editor-native (display-only; the editor handles these) ──────
  { id: 'bold', labelKey: 'menu.bold', default: { ctrl: true, key: 'b' } },
  { id: 'italic', labelKey: 'menu.italic', default: { ctrl: true, key: 'i' } },
  { id: 'undo', labelKey: 'menu.undo', default: { ctrl: true, key: 'z' } },
  { id: 'redo', labelKey: 'menu.redo', default: { ctrl: true, key: 'y' } },
  { id: 'cut', labelKey: 'menu.cut', default: { ctrl: true, key: 'x' } },
  { id: 'copy', labelKey: 'menu.copy', default: { ctrl: true, key: 'c' } },
  { id: 'paste', labelKey: 'menu.paste', default: { ctrl: true, key: 'v' } },
  { id: 'selectAll', labelKey: 'menu.selectAll', default: { ctrl: true, key: 'a' } },

  // ── Table submenu (display hints; not yet bound to the editor) ──
  { id: 'table-row-below', labelKey: 'ctx.rowBelow', default: { ctrl: true, key: 'enter' } },
  { id: 'table-move-row-up', labelKey: 'ctx.moveRowUp', default: { alt: true, ctrl: true, key: 'arrowup' } },
  { id: 'table-move-row-down', labelKey: 'ctx.moveRowDown', default: { alt: true, ctrl: true, key: 'arrowdown' } },
  { id: 'table-move-col-left', labelKey: 'ctx.moveColLeft', default: { alt: true, ctrl: true, key: 'arrowleft' } },
  { id: 'table-move-col-right', labelKey: 'ctx.moveColRight', default: { alt: true, ctrl: true, key: 'arrowright' } },
  { id: 'table-del-row', labelKey: 'ctx.deleteRow', default: { ctrl: true, shift: true, key: 'backspace' } },
]

/** Default bindings keyed by command id. */
export const DEFAULT_HOTKEYS: Record<string, HotkeySpec> = Object.fromEntries(
  COMMAND_DEFS.map((d) => [d.id, d.default]),
) as Record<string, HotkeySpec>

/** Commands a user can rebind from Settings (those with an action). */
export const REBINDABLE: CommandDef[] = COMMAND_DEFS.filter((d) => d.run)

/**
 * Effective bindings = user overrides merged over defaults. Reactive: callers
 * that read this inside a Vue computed track `settings.hotkeys`.
 *
 * Falls back to defaults (no overrides) when called before Pinia is active
 * (e.g. a module-level tooltip computed at import time).
 */
export function getEffectiveHotkeys(): Record<string, HotkeySpec> {
  let overrides: Record<string, HotkeySpec> | undefined
  try {
    overrides = useSettingsStore().settings.hotkeys
  } catch {
    overrides = undefined
  }
  const o = overrides || {}
  const out: Record<string, HotkeySpec> = {}
  for (const d of COMMAND_DEFS) out[d.id] = o[d.id] ?? d.default
  return out
}

/** Effective binding for a single command id (undefined if unknown). */
export function getHotkey(id: string): HotkeySpec | undefined {
  return getEffectiveHotkeys()[id]
}

/** Render a binding as a compact, cross-platform label (e.g. `Ctrl/⌘+⇧+``). */
export function formatHotkey(spec: HotkeySpec | undefined): string {
  if (!spec) return ''
  const key = spec.key?.toLowerCase()
  let label = ''
  if (spec.code === 'Backquote') label = '`'
  else if (key === 'enter') label = '⏎'
  else if (key === 'backspace') label = '⌫'
  else if (key === 'escape') label = 'Esc'
  else if (key === 'arrowup') label = '↑'
  else if (key === 'arrowdown') label = '↓'
  else if (key === 'arrowleft') label = '←'
  else if (key === 'arrowright') label = '→'
  else if (key === 'space') label = 'Space'
  else if (key && /^f\d+$/.test(key)) label = key.toUpperCase()
  else if (key && key.length === 1 && /[a-z0-9]/.test(key)) label = key.toUpperCase()
  else if (key) label = key
  const parts: string[] = []
  if (spec.ctrl) parts.push('Ctrl/⌘')
  if (spec.alt) parts.push('Alt/⌥')
  if (spec.shift) parts.push('Shift/⇧')
  if (label) parts.push(label)
  return parts.join('+')
}

/** Convenience: formatted effective shortcut for a command id. */
export function hk(id: string): string {
  return formatHotkey(getHotkey(id))
}

/** True when two specs describe the same physical binding. */
export function sameHotkey(a: HotkeySpec, b: HotkeySpec): boolean {
  return (
    !!a.ctrl === !!b.ctrl &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt &&
    (a.code || '') === (b.code || '') &&
    (a.key || '').toLowerCase() === (b.key || '').toLowerCase()
  )
}

/**
 * Build a {@link HotkeySpec} from a raw keyboard event (used when the user
 * records a new binding). Returns `null` for a lone modifier press so the
 * capture can wait for the real key.
 */
export function specFromEvent(e: KeyboardEvent): HotkeySpec | null {
  const ctrl = e.ctrlKey || e.metaKey
  const shift = e.shiftKey
  const alt = e.altKey
  if (e.code === 'Backquote') return { ctrl, shift, alt, key: '`', code: 'Backquote' }
  const k = e.key.toLowerCase()
  if (['control', 'meta', 'shift', 'alt'].includes(k)) return null
  return { ctrl, shift, alt, key: k }
}

/**
 * True when the event originates from a plain form field, or a contentEditable
 * that is NOT the editor surface.
 *
 * The Milkdown/ProseMirror editing surface is itself `contentEditable`, so it
 * must be treated as *the editor* rather than as a field. Otherwise every
 * paragraph / format hotkey (Ctrl+1..6, Ctrl+0, …) would be suppressed the
 * moment the user types inside the editor — which is exactly where they apply.
 */
function isField(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null
  if (!e) return false
  const tag = e.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if (e.isContentEditable) return !e.closest('.milkdown')
  return false
}

/** Install the global hotkey listener (MdEditor calls it when `hotkeys` is on). */
export function useHotkeys(): void {
  const ui = useUI()

  function handler(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const alt = e.altKey
    const key = e.key.toLowerCase()

    const effective = getEffectiveHotkeys()
    for (const def of COMMAND_DEFS) {
      if (!def.run) continue // display-only
      const spec = effective[def.id]
      if (!spec) continue
      if (!!spec.ctrl !== ctrl) continue
      if (!!spec.shift !== shift) continue
      if (!!spec.alt !== alt) continue
      if (spec.code) {
        if (spec.code !== e.code) continue
      } else if (spec.key !== key) continue

      const dialogsOpen = ui.settingsOpen.value || ui.findOpen.value
      // While a modal dialog is open, only Save is permitted.
      if (dialogsOpen && !(ctrl && key === 's')) return

      // Non-global bindings only act when not typing in a field (i.e. in editor).
      if (!def.global && isField(e.target)) return

      e.preventDefault()
      void def.run()
      return
    }
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
}
