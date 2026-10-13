<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore } from '@/stores/settings'
import { useUI } from '@/composables/useUI'
import { useSourceMode } from '@/composables/useSourceMode'
import { buildOutlineFromMarkdown } from '@/utils/outline'
import {
  blockKindAt,
  posAtCoords,
  viewDomRect,
  setCaret,
  setSelectionRange,
  getSelectionRange,
  insertBlockAfter,
  nodeSelectionPos,
} from '@/commands/prose'
import { useEditorMenu, type MenuSub } from '@/composables/useEditorMenu'
import ImageHandler from './ImageHandler.vue'
import TableToolbar from './TableToolbar.vue'
import SourceView from './SourceView.vue'
import EditorContextMenu from './EditorContextMenu.vue'

const { t } = useI18n()
const props = withDefaults(
  defineProps<{
    /** 表格浮动工具条开关（由 MdEditor 注入）。 */
    showTableToolbar?: boolean
    /** 右键菜单 + 块手柄浮层开关（由 MdEditor 注入）。 */
    showContextMenu?: boolean
  }>(),
  { showTableToolbar: true, showContextMenu: true },
)
const paneEl = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)
const milkdown = useMilkdown()
const editorStore = useEditorStore()
const settingsStore = useSettingsStore()
const ui = useUI()
const source = useSourceMode()
const editorMenu = useEditorMenu()

/** Content column bounds, in percent of the editor pane width. */
const MIN_WIDTH = 30
const MAX_WIDTH = 100
const DEFAULT_WIDTH = 80
const dragging = ref(false)

function clampWidth(pct: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, pct))
}

function applyWidth(pct: number): void {
  settingsStore.update({ contentWidth: clampWidth(pct) })
  settingsStore.applyLayout()
}

function resetWidth(): void {
  applyWidth(DEFAULT_WIDTH)
  void settingsStore.persist()
}

/**
 * Drag the handle on the right edge of the content column to change how much of
 * the editor pane the WYSIWYG surface occupies. The handle is positioned with
 * `left: calc(50% + var(--content-width) / 2)`, which coincides exactly with the
 * column's right edge because the column is centred with `margin: 0 auto`.
 */
function onResizeStart(event: PointerEvent): void {
  if (!paneEl.value) return
  event.preventDefault()
  const paneWidth = paneEl.value.clientWidth || 1
  const startX = event.clientX
  const startPct = settingsStore.settings.contentWidth
  dragging.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const onMove = (e: PointerEvent): void => {
    applyWidth(startPct + ((e.clientX - startX) / paneWidth) * 100)
  }
  const onUp = (): void => {
    dragging.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    void settingsStore.persist()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

async function handleChange(md: string): Promise<void> {
  editorStore.updateContent(md)
  editorStore.setOutline(buildOutlineFromMarkdown(md))
}

/**
 * Right-click inside the editor → open the context menu with a set of actions
 * that depends on what the caret is on (table vs. paragraph vs. list vs. code…).
 *
 * An existing (non-empty) text selection is deliberately left alone when the
 * click lands inside it, so styling actions apply to the *selected text* rather
 * than to a collapsed caret. Clicking outside the selection still moves the
 * caret, as in any other editor.
 */
function onContextMenu(e: MouseEvent): void {
  const editor = milkdown.getEditor()
  if (!editor || !container.value) return
  const target = e.target as Node | null
  if (!target || !container.value.contains(target)) return
  const pos = posAtCoords(editor, { left: e.clientX, top: e.clientY })
  if (pos == null) return
  e.preventDefault()
  e.stopPropagation()

  const current = getSelectionRange(editor)
  const insideSelection =
    current != null && !current.empty && pos >= current.from && pos <= current.to
  if (!insideSelection) setCaret(editor, pos)

  const sel = getSelectionRange(editor)
  editorMenu.show(e.clientX, e.clientY, blockKindAt(editor, pos), {
    from: sel?.from ?? pos,
    to: sel?.to ?? pos,
  })
}

/**
 * The two per-line block handles — both live inside `.milkdown-block-handle`,
 * which Crepe renders at the start of the hovered line:
 *  - "+"  (first `.operation-item`): opens the floating menu on the INSERT
 *         submenu, and creates the new empty line only *after* an item is
 *         picked (see {@link openPlusMenu}).
 *  - "::" (second `.operation-item`): opens the same menu collapsed (submenus
 *         expand on hover); press-and-move still reorders the block through
 *         Crepe's native HTML5 drag (BlockService).
 *
 * The two are told apart by a 4px movement threshold: a press that stays put is
 * a click (open a menu), a press that travels is a drag (leave it to Crepe).
 */
interface HandlePress {
  x: number
  y: number
  /** 0 = the "+" insert handle, 1 = the "::" block handle. */
  item: 0 | 1
  /**
   * Document position of the block the handle was anchored to, captured at
   * pointerdown. It must NOT be re-probed at pointerup: the mousedown in
   * between makes Crepe dispatch a `NodeSelection` + focus the view, which can
   * reflow the page (font metric swaps, overlay widgets) and would make a
   * fresh `posAtCoords` land on a different line than the one the user aimed at.
   */
  pos: number | null
}
let handlePress: HandlePress | null = null

/**
 * Resolve the document position of the block the handle is currently anchored
 * to, probing at the vertical center of the handle.
 *
 * The X probe is the horizontal MIDDLE of the content column: posAtCoords
 * picks the line by Y, then the character by X — the mid-column point always
 * sits inside a line box, while points near the left edge fall into the gutter
 * *outside* the line boxes (lists are indented past them) and resolve to block
 * boundaries. A boundary position makes the caret slip into the wrong block
 * (or an invalid one), and every menu action then silently no-ops.
 */
function probeHandlePos(): number | null {
  const editor = milkdown.getEditor()
  if (!editor) return null
  const handle = document.querySelector<HTMLElement>('.milkdown-block-handle[data-show="true"]')
  const rect = handle?.getBoundingClientRect()
  if (!rect) return null
  const top = rect.top + rect.height / 2
  const pmRect = viewDomRect(editor)
  let pos = pmRect ? posAtCoords(editor, { left: pmRect.left + pmRect.width / 2, top }) : null
  if (pos == null && pmRect) pos = posAtCoords(editor, { left: pmRect.left + 48, top })
  if (pos == null) pos = posAtCoords(editor, { left: rect.right + 8, top })
  return pos
}

/**
 * Open the floating menu anchored next to the block handle, targeting `pos`
 * (captured at pointerdown — see {@link HandlePress.pos}).
 *
 * `sub` pre-expands a submenu ("+" opens the insert one); `before` is an
 * optional hook run instead of restoring the captured range when an item is
 * picked.
 */
function openHandleMenu(
  pos: number,
  clientX: number,
  clientY: number,
  sub: MenuSub = null,
  before: (() => void) | null = null,
): void {
  const editor = milkdown.getEditor()
  if (!editor) return
  const handle = document.querySelector<HTMLElement>('.milkdown-block-handle[data-show="true"]')
  const rect = handle?.getBoundingClientRect()
  setCaret(editor, pos)
  // The caret after setCaret is the reliable anchor: a raw boundary `pos`
  // resolves without list/quote ancestors, so kinds computed from it are wrong.
  const sel = getSelectionRange(editor)
  const caret = sel ? sel.from : pos
  editorMenu.show(
    rect ? rect.right + 8 : clientX,
    rect ? rect.top + 2 : clientY,
    blockKindAt(editor, caret),
    { from: caret, to: sel ? sel.to : caret },
    sub,
    before,
  )
}

/**
 * The "+" handle: open the insert menu **without** creating a line first.
 *
 * Crepe's own `onAdd` inserts an empty paragraph and then opens its slash menu
 * on it, but the line has to appear only once the user has picked something —
 * so we swallow Crepe's `pointerup` and hand the menu a `before` hook that
 * creates the new empty line (below the block the handle was on) at that point.
 * The picked item then applies to that fresh line, which is exactly
 * "先新建空行，再套用相应样式".
 */
function openPlusMenu(pos: number, clientX: number, clientY: number): void {
  openHandleMenu(pos, clientX, clientY, 'insert', () => {
    const editor = milkdown.getEditor()
    if (!editor) return
    const caret = insertBlockAfter(editor, pos)
    if (caret != null) setSelectionRange(editor, caret, caret)
  })
}

/**
 * Which of the two handle buttons an event target belongs to — `0` for the "+",
 * `1` for the "::" grip, `-1` for anything else.
 */
function handleItemOf(target: EventTarget | null): 0 | 1 | -1 {
  const el = target as HTMLElement | null
  const handle = el?.closest?.('.milkdown-block-handle') as HTMLElement | null
  if (!handle || !el) return -1
  const items = handle.querySelectorAll('.operation-item')
  if (items.length < 2) return -1
  const clicked = el.closest('.operation-item')
  if (!clicked) return -1
  return clicked === items[0] ? 0 : clicked === items[1] ? 1 : -1
}

function onHandlePointerDown(e: PointerEvent): void {
  const item = handleItemOf(e.target)
  if (item < 0) return
  // No preventDefault / stopPropagation here: Crepe's own handlers must run
  // either way — `onAdd` for the "+", and the compatibility mousedown that the
  // native HTML5 block drag depends on for the "::" grip.
  handlePress = {
    x: e.clientX,
    y: e.clientY,
    item: item as 0 | 1,
    pos: probeHandlePos(),
  }
}

/**
 * Resolve the position a handle press should act on: the one captured at
 * pointerdown when there is one, then the block Crepe itself selected on
 * mousedown, then a fresh probe as a last resort.
 */
function resolveHandlePos(captured: number | null): number | null {
  if (captured != null) return captured
  const editor = milkdown.getEditor()
  if (!editor) return null
  return nodeSelectionPos(editor) ?? probeHandlePos()
}

function onHandlePointerUp(e: PointerEvent): void {
  const item = handleItemOf(e.target)
  if (item < 0) return
  const press = handlePress
  handlePress = null
  // A press that moved is a drag (reorder the block) — let Crepe handle it.
  if (press && (Math.abs(e.clientX - press.x) > 4 || Math.abs(e.clientY - press.y) > 4)) return

  // Crepe's own `pointerup` handler on the "+" inserts an empty paragraph and
  // opens its slash menu, so it must be swallowed — always, and before any early
  // return. (Reaching here without a captured press is normal: the press may
  // have landed while our menu was open, where it only dismissed that menu.)
  // The same handler owns the `active` class, hence the manual cleanup.
  if (item === 0) e.preventDefault()
  e.stopPropagation()
  ;(e.target as HTMLElement | null)?.closest('.operation-item')?.classList.remove('active')

  const pos = resolveHandlePos(press?.pos ?? null)
  if (pos == null) return
  if (item === 0) openPlusMenu(pos, e.clientX, e.clientY)
  else openHandleMenu(pos, e.clientX, e.clientY)
}

/**
 * A native drag replaces the pointer stream with drag events and never delivers
 * a matching `pointerup`, so the pending press has to be dropped here too —
 * otherwise the next stray pointerup would pop a menu open.
 */
function onHandlePointerCancel(): void {
  handlePress = null
}

onMounted(async () => {
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('pointerdown', onHandlePointerDown, true)
  document.addEventListener('pointerup', onHandlePointerUp, true)
  document.addEventListener('pointercancel', onHandlePointerCancel, true)
  if (!container.value) return
  await milkdown.mount(container.value, editorStore.doc.content, handleChange)
  editorStore.setOutline(buildOutlineFromMarkdown(editorStore.doc.content))
})

onBeforeUnmount(() => {
  document.removeEventListener('contextmenu', onContextMenu, true)
  document.removeEventListener('pointerdown', onHandlePointerDown, true)
  document.removeEventListener('pointerup', onHandlePointerUp, true)
  document.removeEventListener('pointercancel', onHandlePointerCancel, true)
  milkdown.destroy()
})

// Entering / leaving source mode: snapshot the Markdown, or push edits back.
watch(
  () => ui.sourceMode.value,
  async (active) => {
    if (active) {
      await source.enter()
    } else {
      await source.commit()
    }
  },
)

// Reload the editor whenever a *new* document is loaded (loadSignal increments).
watch(
  () => editorStore.loadSignal,
  () => {
    milkdown.loadMarkdown(editorStore.doc.content)
    editorStore.setOutline(buildOutlineFromMarkdown(editorStore.doc.content))
  },
)
</script>

<template>
  <div
    ref="paneEl"
    class="editor-pane"
    :class="[`mode-${settingsStore.settings.mode}`, { resizing: dragging }]"
  >
    <TableToolbar v-if="props.showTableToolbar && !ui.sourceMode.value" />
    <div v-show="!ui.sourceMode.value" ref="container" class="milkdown_root"></div>
    <SourceView v-if="ui.sourceMode.value" v-model="source.sourceText.value" />
    <div
      v-show="!ui.sourceMode.value"
      class="content-resize-handle"
      :class="{ dragging }"
      :title="t('editor.resizeHint')"
      @pointerdown="onResizeStart"
      @dblclick="resetWidth"
    >
      <span class="grip"></span>
    </div>
    <ImageHandler />
    <EditorContextMenu v-if="props.showContextMenu" />
  </div>
</template>

<style scoped>
.editor-pane {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

/* The Crepe surface is centred by `margin: 0 auto` (not by the flex container),
   so `--content-width` maps 1:1 onto the pane width and the resize handle below
   can be positioned with a pure CSS `calc()`.
   The column is a plain percentage of its parent (this scroller), so the editing
   area occupies 80% of the container one level up. */
.milkdown_root {
  flex: 1 1 auto;
  overflow: auto;
  padding: 24px 0 72px;
}
.milkdown_root :deep(.milkdown) {
  width: var(--content-width, 80%);
  max-width: none;
  margin: 0 auto;
}
.editor-pane:not(.resizing) .milkdown_root :deep(.milkdown) {
  transition: width 0.15s ease;
}
/* Crepe's reset hard-codes a very wide 120px horizontal padding, which makes the
   text column feel cramped; keep generous vertical rhythm with less side padding. */
.milkdown_root :deep(.milkdown .ProseMirror) {
  padding: 48px 48px 24px;
}

/* Typora-style block handle: a subtle rounded pill holding the "+" insert
   button and the "::" drag grip. Overrides Crepe's transparent default so the
   two controls read as a single unit, like the screenshot. */
.milkdown_root :deep(.milkdown-block-handle) {
  gap: 0;
  padding: 2px;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.milkdown_root :deep(.milkdown-block-handle .operation-item) {
  width: 26px;
  height: 26px;
  padding: 3px;
}
.milkdown_root :deep(.milkdown-block-handle .operation-item svg) {
  width: 20px;
  height: 20px;
}

/* The drop indicator line shown while dragging a block. Crepe mounts it with
   `backgroundColor: false` (invalid → invisible), so paint it here to match the
   theme — a thin accent line at the drop target, as in the screenshot. */
.milkdown_root :deep(.crepe-drop-cursor) {
  background-color: var(--accent) !important;
  border-radius: 2px;
}

.content-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% + var(--content-width, 80%) / 2);
  width: 14px;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  touch-action: none;
}
.content-resize-handle .grip {
  width: 4px;
  height: 46px;
  border-radius: 4px;
  background: var(--border);
  opacity: 0.55;
  transition: opacity 0.15s ease, background 0.15s ease, height 0.15s ease;
}
.content-resize-handle:hover .grip,
.content-resize-handle.dragging .grip {
  background: var(--accent);
  opacity: 1;
  height: 72px;
}

.mode-focus .table-toolbar,
.mode-typewriter .table-toolbar {
  opacity: 0.25;
}
.mode-focus .table-toolbar:hover,
.mode-typewriter .table-toolbar:hover {
  opacity: 1;
}
</style>
