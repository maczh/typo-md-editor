import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Node has no DOM. `commands/actions.ts` transitively imports modules whose
// top-level code touches `window` (useFind's `winFind`), so the stubs must be
// planted BEFORE the src modules load — hence the dynamic imports (static
// imports are hoisted above this statement, and esbuild tree-shakes a bare
// side-effect-only helper module).
const globals = globalThis as unknown as Record<string, unknown>
if (!globals.window) {
  globals.window = { find: () => false, addEventListener: () => {}, removeEventListener: () => {} }
}

const {
  COMMAND_DEFS,
  DEFAULT_HOTKEYS,
  REBINDABLE,
  formatHotkey,
  sameHotkey,
  specFromEvent,
  getEffectiveHotkeys,
  getHotkey,
  hk,
} = await import('../src/composables/useHotkeys')
const actions = await import('../src/commands/actions')
type CommandDef = (typeof COMMAND_DEFS)[number]

// White-box coverage for the hotkey registry — the single source of truth the
// toolbar, the floating menus and the global key handler all read from. The
// static "wiring" assertions are the anti-regression net for the wiring bugs
// fixed earlier in this project's life (menu entries pointing at commands that
// don't exist, shortcuts displayed but never bound, …).

// The suite runs from the project root (npm test), and the bundle lives in
// tests/.out — so resolve source paths from cwd, not import.meta.url.
const root = process.cwd()
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf8')

/* ------------------------------ structure ------------------------------ */

test('COMMAND_DEFS ids are unique', () => {
  const ids = COMMAND_DEFS.map((d) => d.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(',')}`)
})

test('every command has a labelKey and a default binding', () => {
  for (const d of COMMAND_DEFS) {
    assert.ok(d.labelKey, `${d.id}: labelKey missing`)
    assert.ok(d.default && typeof d.default === 'object', `${d.id}: default binding missing`)
    assert.ok(d.default.key, `${d.id}: default.key missing`)
  }
})

test('editor-native commands are display-only (no run) — never double-fire', () => {
  // The ProseMirror editor owns these natively; a `run` here would toggle the
  // mark twice (once by us, once by the editor).
  const native = ['bold', 'italic', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']
  for (const id of native) {
    const def = COMMAND_DEFS.find((d) => d.id === id)
    assert.ok(def, `${id} missing from the registry`)
    assert.equal(def!.run, undefined, `${id} must not have run — the editor handles it`)
  }
})

test('REBINDABLE = exactly the commands with an action', () => {
  assert.deepEqual(
    REBINDABLE.map((d) => d.id).sort(),
    COMMAND_DEFS.filter((d) => d.run).map((d) => d.id).sort(),
  )
  for (const d of REBINDABLE) assert.equal(typeof d.run, 'function')
})

test('DEFAULT_HOTKEYS mirrors COMMAND_DEFS defaults', () => {
  for (const d of COMMAND_DEFS) {
    assert.deepEqual(DEFAULT_HOTKEYS[d.id], d.default, `${d.id}: default mismatch`)
  }
})

/* ------------------------- wiring: registry → actions ------------------------ */

test('every bound command references a real action export', () => {
  // `run: A.foo` / `run: () => A.foo(...)` — pull the referenced symbol out of
  // the source and assert it exists in the actions facade. (No trailing paren
  // in the pattern: most entries are plain function references.)
  const src = read('src/composables/useHotkeys.ts')
  const refs = [...src.matchAll(/\bA\.([A-Za-z0-9_]+)/g)].map((m) => m[1])
  assert.ok(refs.length >= 30, `expected the registry to call many actions, saw ${refs.length}`)
  const exports = Object.keys(actions)
  for (const name of new Set(refs)) {
    assert.ok(exports.includes(name), `useHotkeys references A.${name} but actions.ts does not export it`)
  }
})

test('every command labelKey resolves in all three locales', async () => {
  // Stronger than a regex over the source: actually translate each key in each
  // language. `translate` returns the key itself when a translation is missing.
  const { i18n } = await import('../src/i18n')
  for (const d of COMMAND_DEFS) {
    for (const lang of ['zh-CN', 'en', 'zh-TW'] as const) {
      i18n.global.locale.value = lang
      const out = i18n.global.t(d.labelKey)
      assert.ok(out && out !== d.labelKey, `${d.id}: labelKey ${d.labelKey} missing in ${lang}`)
    }
  }
})

/* --------------------- wiring: UI surfaces → registry --------------------- */

function scanHotkeyIds(rel: string): string[] {
  const src = read(rel)
  const ids = [...src.matchAll(/\b(?:hk|getHotkey)\('([^']+)'\)/g)].map((m) => m[1])
  return [...new Set(ids)]
}

function scanActionRefs(rel: string): string[] {
  const src = read(rel)
  return [...new Set([...src.matchAll(/\bA\.([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]))]
}

test('toolbar / menus only reference commands that exist', () => {
  const surfaces = [
    'src/components/editor/Toolbar.tsx',
    'src/components/editor/EditorContextMenu.tsx',
  ]
  for (const rel of surfaces) {
    for (const id of scanHotkeyIds(rel)) {
      assert.ok(
        COMMAND_DEFS.some((d) => d.id === id),
        `${rel}: references unknown command id "${id}"`,
      )
    }
  }
})

test('toolbar / menus only invoke actions that exist', () => {
  const surfaces = [
    'src/components/editor/Toolbar.tsx',
    'src/components/editor/EditorContextMenu.tsx',
    'src/components/dialogs/SettingsDialog.tsx',
  ]
  const exports = Object.keys(actions)
  for (const rel of surfaces) {
    for (const name of scanActionRefs(rel)) {
      assert.ok(exports.includes(name), `${rel}: invokes A.${name} which actions.ts does not export`)
    }
  }
})

test('every toolbar button title carries its effective shortcut', () => {
  // The toolbar must display what the registry holds (used to be hardcoded,
  // so rebinding a command left stale hints behind).
  const src = read('src/components/editor/Toolbar.tsx')
  const hardcoded = src.match(/title="[^"]*\(Ctrl/g)
  assert.equal(hardcoded, null, 'toolbar still hardcodes a Ctrl+… shortcut in a title')
  const used = scanHotkeyIds('src/components/editor/Toolbar.tsx')
  assert.ok(used.length >= 15, `toolbar reads few shortcuts from the registry (${used.length})`)
})

/* ------------------------------ pure helpers ------------------------------ */

test('formatHotkey renders modifiers and special keys', () => {
  assert.equal(formatHotkey(undefined), '')
  assert.equal(formatHotkey({ ctrl: true, shift: true, key: 'i' }), 'Ctrl/⌘+Shift/⇧+I')
  assert.equal(formatHotkey({ ctrl: true, key: 's' }), 'Ctrl/⌘+S')
  assert.equal(formatHotkey({ key: 'f8' }), 'F8')
  assert.equal(formatHotkey({ ctrl: true, key: 'enter' }), 'Ctrl/⌘+⏎')
  assert.equal(formatHotkey({ ctrl: true, key: 'backspace' }), 'Ctrl/⌘+⌫')
  assert.equal(formatHotkey({ ctrl: true, key: 'escape' }), 'Ctrl/⌘+Esc')
  assert.equal(formatHotkey({ alt: true, ctrl: true, key: 'arrowup' }), 'Ctrl/⌘+Alt/⌥+↑')
  assert.equal(formatHotkey({ ctrl: true, shift: true, code: 'Backquote', key: '`' }), 'Ctrl/⌘+Shift/⇧+`')
})

test('hk() formats the effective binding of a known command', () => {
  assert.equal(hk('save'), 'Ctrl/⌘+S')
  assert.equal(hk('bold'), 'Ctrl/⌘+B')
  assert.equal(hk('nope'), '')
})

test('sameHotkey compares the physical binding, not the object', () => {
  const a = { ctrl: true, shift: true, key: 'i' }
  assert.ok(sameHotkey(a, { ctrl: true, shift: true, key: 'I' }), 'key comparison is case-insensitive')
  assert.ok(sameHotkey(a, { ctrl: true, shift: true, key: 'i' }))
  assert.ok(!sameHotkey(a, { ctrl: true, key: 'i' }), 'shift differs')
  assert.ok(!sameHotkey(a, { ctrl: true, shift: true, alt: true, key: 'i' }), 'alt differs')
  assert.ok(!sameHotkey(a, { ctrl: true, shift: true, key: 'j' }), 'key differs')
  assert.ok(
    sameHotkey({ ctrl: true, code: 'Backquote', key: '`' }, { ctrl: true, code: 'Backquote', key: '`' }),
  )
})

test('specFromEvent: lone modifiers yield null so capture can wait', () => {
  for (const key of ['Control', 'Meta', 'Shift', 'Alt']) {
    const spec = specFromEvent({ ctrlKey: true, key, code: key } as unknown as KeyboardEvent)
    assert.equal(spec, null, `${key} alone must not capture`)
  }
})

test('specFromEvent: real keys capture ctrl/shift/alt, Backquote by code', () => {
  const e = { ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, key: 'I', code: 'KeyI' }
  assert.deepEqual(specFromEvent(e as unknown as KeyboardEvent), { ctrl: true, shift: true, alt: false, key: 'i' })
  const mac = { ctrlKey: false, metaKey: true, shiftKey: false, altKey: false, key: 's', code: 'KeyS' }
  assert.deepEqual(specFromEvent(mac as unknown as KeyboardEvent), { ctrl: true, shift: false, alt: false, key: 's' })
  const bq = { ctrlKey: true, shiftKey: true, altKey: false, key: '~', code: 'Backquote' }
  assert.deepEqual(specFromEvent(bq as unknown as KeyboardEvent), {
    ctrl: true,
    shift: true,
    alt: false,
    key: '`',
    code: 'Backquote',
  })
})

test('getEffectiveHotkeys / getHotkey fall back to defaults without overrides', () => {
  const eff = getEffectiveHotkeys()
  for (const d of COMMAND_DEFS) {
    assert.deepEqual(eff[d.id], d.default, `${d.id}: effective binding drifted from default`)
  }
  assert.deepEqual(getHotkey('save'), { ctrl: true, key: 's' })
  assert.equal(getHotkey('does-not-exist'), undefined)
})

test('global bindings are exactly the dialog-level commands', () => {
  const global = COMMAND_DEFS.filter((d) => d.global).map((d) => d.id)
  assert.deepEqual(global.sort(), ['find', 'preferences', 'replace', 'save', 'sourceMode'])
})

test('every REBINDABLE command is listed in the settings hotkeys tab', () => {
  // SettingsDialog maps over REBINDABLE, so a rebindable command automatically
  // appears; this guards the contract from the other side.
  const src = read('src/components/dialogs/SettingsDialog.tsx')
  assert.ok(src.includes('REBINDABLE'), 'settings dialog no longer maps REBINDABLE')
})

/* ------------------------- menu id ↔ command id cross-check ------------------------ */

test('context menu shortcuts all exist in the registry (incl. table submenu)', () => {
  // The table submenu used to display 6 shortcuts with nothing bound.
  const ids = scanHotkeyIds('src/components/editor/EditorContextMenu.tsx')
  for (const id of ['table-row-below', 'table-move-row-up', 'table-move-col-left', 'table-del-row']) {
    assert.ok(ids.includes(id), `context menu no longer shows ${id}`)
    const def = COMMAND_DEFS.find((d) => d.id === id)
    assert.ok(def?.run, `${id} is display-only — the shortcut would do nothing`)
  }
})

test('CommandDef shape stays stable for consumers', () => {
  const sample: CommandDef | undefined = COMMAND_DEFS[0]
  assert.ok(sample)
  assert.equal(typeof sample!.id, 'string')
  assert.equal(typeof sample!.labelKey, 'string')
})
