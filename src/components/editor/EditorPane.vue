<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore } from '@/stores/settings'
import { useUI } from '@/composables/useUI'
import { useSourceMode } from '@/composables/useSourceMode'
import { buildOutlineFromMarkdown } from '@/utils/outline'
import { blockKindAt, posAtCoords, setCaret, getSelectionRange } from '@/commands/prose'
import { useEditorMenu } from '@/composables/useEditorMenu'
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
 * The block handle at the start of each line: a short press (no drag) on its
 * drag grip opens the same menu, pre-targeted at that block's style submenu.
 */
let handlePress: { x: number; y: number; el: HTMLElement } | null = null

function onHandlePointerDown(e: PointerEvent): void {
  const target = e.target as HTMLElement | null
  const handle = target?.closest('.milkdown-block-handle') as HTMLElement | null
  if (!handle || !target) {
    handlePress = null
    return
  }
  const items = handle.querySelectorAll('.operation-item')
  const clicked = target.closest('.operation-item')
  // The last operation-item is the drag grip; the first is Crepe's "+" button.
  if (!clicked || clicked !== items[items.length - 1]) {
    handlePress = null
    return
  }
  handlePress = { x: e.clientX, y: e.clientY, el: handle }
}

function onHandlePointerUp(e: PointerEvent): void {
  const press = handlePress
  handlePress = null
  if (!press) return
  // Treat it as a drag (not a click) when the pointer moved noticeably.
  if (Math.abs(e.clientX - press.x) > 4 || Math.abs(e.clientY - press.y) > 4) return
  const editor = milkdown.getEditor()
  if (!editor) return
  const rect = press.el.getBoundingClientRect()
  const pos = posAtCoords(editor, { left: rect.right + 8, top: rect.top + rect.height / 2 })
  if (pos == null) return
  setCaret(editor, pos)
  // Remember the range: the handle lives outside the editor DOM, so the click on
  // a menu item would otherwise run against a stale/empty selection.
  const sel = getSelectionRange(editor)
  editorMenu.show(rect.right + 6, rect.top - 4, blockKindAt(editor, pos), {
    from: sel?.from ?? pos,
    to: sel?.to ?? pos,
  })
}

onMounted(async () => {
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('pointerdown', onHandlePointerDown, true)
  document.addEventListener('pointerup', onHandlePointerUp, true)
  if (!container.value) return
  await milkdown.mount(container.value, editorStore.doc.content, handleChange)
  editorStore.setOutline(buildOutlineFromMarkdown(editorStore.doc.content))
})

onBeforeUnmount(() => {
  document.removeEventListener('contextmenu', onContextMenu, true)
  document.removeEventListener('pointerdown', onHandlePointerDown, true)
  document.removeEventListener('pointerup', onHandlePointerUp, true)
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
   can be positioned with a pure CSS `calc()`. */
.milkdown_root {
  flex: 1 1 auto;
  overflow: auto;
  padding: 24px 0 72px;
}
.milkdown_root :deep(.milkdown) {
  width: var(--content-width, 70%);
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

.content-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% + var(--content-width, 70%) / 2);
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
