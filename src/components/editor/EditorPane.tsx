import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '@/i18n'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore } from '@/stores/settings'
import { useUI } from '@/composables/useUI'
import { useSourceMode } from '@/composables/useSourceMode'
import { useEditorMenu, type MenuSub } from '@/composables/useEditorMenu'
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
  type BlockKind,
} from '@/commands/prose'
import ImageHandler from './ImageHandler'
import TableToolbar from './TableToolbar'
import SourceView from './SourceView'
import EditorContextMenu from './EditorContextMenu'

export interface EditorPaneProps {
  /** 表格浮动工具条开关（由 MdEditor 注入）。 */
  showTableToolbar?: boolean
  /** 右键菜单 + 块手柄浮层开关（由 MdEditor 注入）。 */
  showContextMenu?: boolean
}

interface HandlePress {
  x: number
  y: number
  /** 0 = the "+" insert handle, 1 = the "::" block handle. */
  item: 0 | 1
  pos: number | null
}

function EditorPane({ showTableToolbar = true, showContextMenu = true }: EditorPaneProps) {
  const { t } = useTranslation()
  const paneRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const milkdown = useMilkdown()
  const editorStore = useEditorStore()
  const settingsStore = useSettingsStore()
  const ui = useUI()
  const source = useSourceMode()
  const editorMenu = useEditorMenu()
  const handlePressRef = useRef<HandlePress | null>(null)
  const [dragging, setDragging] = useState(false)

  const MIN_WIDTH = 30
  const MAX_WIDTH = 100
  const DEFAULT_WIDTH = 80

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

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!paneRef.current) return
    event.preventDefault()
    const paneWidth = paneRef.current.clientWidth || 1
    const startX = event.clientX
    const startPct = settingsStore.settings.contentWidth
    setDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e: PointerEvent): void => {
      applyWidth(startPct + ((e.clientX - startX) / paneWidth) * 100)
    }
    const onUp = (): void => {
      setDragging(false)
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

  function onContextMenu(e: MouseEvent): void {
    const editor = milkdown.getEditor()
    if (!editor || !containerRef.current) return
    const target = e.target as Node | null
    if (!target || !containerRef.current.contains(target)) return
    const pos = posAtCoords(editor, { left: e.clientX, top: e.clientY })
    if (pos == null) return
    e.preventDefault()
    e.stopPropagation()

    const current = getSelectionRange(editor)
    const insideSelection =
      current != null && !current.empty && pos >= current.from && pos <= current.to
    if (!insideSelection) setCaret(editor, pos)

    const sel = getSelectionRange(editor)
    editorMenu.show(
      e.clientX,
      e.clientY,
      blockKindAt(editor, pos),
      {
        from: sel?.from ?? pos,
        to: sel?.to ?? pos,
      },
    )
  }

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

  function openPlusMenu(pos: number, clientX: number, clientY: number): void {
    openHandleMenu(pos, clientX, clientY, 'insert', () => {
      const editor = milkdown.getEditor()
      if (!editor) return
      const caret = insertBlockAfter(editor, pos)
      if (caret != null) setSelectionRange(editor, caret, caret)
    })
  }

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
    handlePressRef.current = {
      x: e.clientX,
      y: e.clientY,
      item: item as 0 | 1,
      pos: probeHandlePos(),
    }
  }

  function resolveHandlePos(captured: number | null): number | null {
    if (captured != null) return captured
    const editor = milkdown.getEditor()
    if (!editor) return null
    return nodeSelectionPos(editor) ?? probeHandlePos()
  }

  function onHandlePointerUp(e: PointerEvent): void {
    const item = handleItemOf(e.target)
    if (item < 0) return
    const press = handlePressRef.current
    handlePressRef.current = null
    if (press && (Math.abs(e.clientX - press.x) > 4 || Math.abs(e.clientY - press.y) > 4)) return

    if (item === 0) e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement | null)?.closest('.operation-item')?.classList.remove('active')

    const pos = resolveHandlePos(press?.pos ?? null)
    if (pos == null) return
    if (item === 0) openPlusMenu(pos, e.clientX, e.clientY)
    else openHandleMenu(pos, e.clientX, e.clientY)
  }

  function onHandlePointerCancel(): void {
    handlePressRef.current = null
  }

  // Mount + document-level listeners (once).
  useEffect(() => {
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('pointerdown', onHandlePointerDown, true)
    document.addEventListener('pointerup', onHandlePointerUp, true)
    document.addEventListener('pointercancel', onHandlePointerCancel, true)

    let cancelled = false
    void (async () => {
      if (!containerRef.current) return
      await milkdown.mount(containerRef.current, editorStore.doc.content, handleChange)
      if (cancelled) return
      editorStore.setOutline(buildOutlineFromMarkdown(editorStore.doc.content))
    })()

    return () => {
      cancelled = true
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('pointerdown', onHandlePointerDown, true)
      document.removeEventListener('pointerup', onHandlePointerUp, true)
      document.removeEventListener('pointercancel', onHandlePointerCancel, true)
      milkdown.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Entering / leaving source mode: snapshot the Markdown, or push edits back.
  const skipSourceRef = useRef(true)
  useEffect(() => {
    if (skipSourceRef.current) {
      skipSourceRef.current = false
      return
    }
    if (ui.sourceMode.value) {
      void source.enter()
    } else {
      void source.commit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.sourceMode.value])

  // Reload the editor whenever a *new* document is loaded (loadSignal increments).
  const skipLoadRef = useRef(true)
  useEffect(() => {
    if (skipLoadRef.current) {
      skipLoadRef.current = false
      return
    }
    milkdown.loadMarkdown(editorStore.doc.content)
    editorStore.setOutline(buildOutlineFromMarkdown(editorStore.doc.content))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorStore.loadSignal])

  return (
    <div
      ref={paneRef}
      className={`editor-pane mode-${settingsStore.settings.mode}${dragging ? ' resizing' : ''}`}
    >
      {showTableToolbar && !ui.sourceMode.value && <TableToolbar />}
      <div
        ref={containerRef}
        className="milkdown_root"
        style={{ display: ui.sourceMode.value ? 'none' : undefined }}
      />
      {ui.sourceMode.value && (
        <SourceView
          modelValue={source.sourceText.value}
          onUpdateModelValue={(v) => {
            source.sourceText.value = v
          }}
        />
      )}
      <div
        className={`content-resize-handle${dragging ? ' dragging' : ''}`}
        title={t('editor.resizeHint')}
        onPointerDown={onResizeStart}
        onDoubleClick={resetWidth}
      >
        <span className="grip" />
      </div>
      <ImageHandler />
      {showContextMenu && <EditorContextMenu />}
    </div>
  )
}

export default EditorPane
