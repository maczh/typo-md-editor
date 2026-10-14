import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import * as A from '@/commands/actions'
import { useEditorMenu, type MenuSub } from '@/composables/useEditorMenu'
import { hk } from '@/composables/useHotkeys'
import { useTranslation } from '@/i18n'
import Icon from '@/components/common/Icon'

/**
 * Typora-style floating menu, shared by three entry points:
 *  - the "+" block handle (opens on the INSERT submenu),
 *  - the "::" block handle (opens collapsed — submenus expand on hover), and
 *  - right-clicking inside the editor (context-sensitive: table vs. paragraph,
 *    also collapsed).
 */
export default function EditorContextMenu() {
  const { t } = useTranslation()
  const menu = useEditorMenu()
  const [openSub, setOpenSub] = useState<MenuSub>(null)

  const isTable = menu.kind.value === 'table'
  const submenuTitle = isTable ? t('ctx.blockStyleTable') : t('ctx.blockStyle')

  const style = useMemo(() => {
    const w = 248
    const h = 360
    let left = menu.x.value
    let top = menu.y.value
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8)
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8)
    return { left: `${left}px`, top: `${top}px` }
  }, [menu.x.value, menu.y.value])

  function run(fn?: () => void | Promise<void>): void {
    const r = menu.range.value
    const before = menu.beforeRun.value
    menu.hide()
    if (before) before()
    else if (r) A.restoreSelection(r.from, r.to)
    else A.focusEditor()
    if (fn) void fn()
  }

  function isPara(): boolean {
    return A.currentBlockType() === 'paragraph'
  }
  function isHeading(i: number): boolean {
    return A.nodeActive('heading', { level: i })
  }
  function markActive(...n: string[]): boolean {
    return A.markActive(...n)
  }
  function nodeActive(n: string): boolean {
    return A.nodeActive(n)
  }

  interface Item {
    sep?: boolean
    label?: string
    shortcut?: string
    run?: () => void | Promise<void>
    checked?: () => boolean
  }

  const paragraphItems = useMemo<Item[]>(
    () => [
      { label: t('ctx.text'), shortcut: hk('paragraph'), run: A.setParagraph, checked: isPara },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({
        label: t(`ctx.h${i}`),
        shortcut: hk(`h${i}`),
        run: () => A.setHeading(i),
        checked: () => isHeading(i),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const insertItems = useMemo<Item[]>(
    () => [
      { label: t('ctx.image'), shortcut: hk('insertLocalImage'), run: A.insertLocalImage },
      { label: t('ctx.footnote'), run: A.insertFootnote },
      { label: t('ctx.linkRef'), run: A.insertLinkReference },
      { label: t('ctx.horizontalRule'), run: A.insertHorizontalRule },
      { label: t('ctx.table'), shortcut: hk('insertTable'), run: A.insertTable },
      { label: t('ctx.codeBlock'), shortcut: hk('codeBlock'), run: A.insertCodeBlock },
      { label: t('ctx.mathBlock'), shortcut: hk('mathBlock'), run: A.insertMathBlock },
      { label: t('ctx.toc'), run: A.insertToc },
      { label: t('ctx.yaml'), run: A.insertYamlFrontMatter },
      { sep: true },
      { label: t('ctx.paraAbove'), run: A.insertParagraphAbove },
      { label: t('ctx.paraBelow'), run: A.insertParagraphBelow },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const tableItems = useMemo<Item[]>(
    () => [
      { label: t('ctx.rowAbove'), run: A.tableRowAbove },
      { label: t('ctx.rowBelow'), shortcut: hk('table-row-below'), run: A.tableRowBelow },
      { label: t('ctx.colLeft'), run: A.tableColLeft },
      { label: t('ctx.colRight'), run: A.tableColRight },
      { sep: true },
      { label: t('ctx.moveRowUp'), shortcut: hk('table-move-row-up'), run: A.tableMoveRowUp },
      { label: t('ctx.moveRowDown'), shortcut: hk('table-move-row-down'), run: A.tableMoveRowDown },
      { label: t('ctx.moveColLeft'), shortcut: hk('table-move-col-left'), run: A.tableMoveColLeft },
      { label: t('ctx.moveColRight'), shortcut: hk('table-move-col-right'), run: A.tableMoveColRight },
      { sep: true },
      { label: t('ctx.deleteRow'), shortcut: hk('table-del-row'), run: A.tableDeleteRow },
      { label: t('ctx.deleteCol'), run: A.tableDeleteCol },
      { sep: true },
      { label: t('ctx.copyTable'), run: A.tableCopy },
      { label: t('ctx.formatTable'), run: A.tableFormat },
      { sep: true },
      { label: t('ctx.deleteTable'), run: A.tableDelete },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  useEffect(() => {
    if (menu.open.value) setOpenSub(menu.sub.value)
  }, [menu.open.value, menu.sub.value])

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') menu.hide()
  }

  function onOutsidePointerDown(e: PointerEvent): void {
    if (!menu.open.value) return
    const target = e.target as HTMLElement | null
    if (target?.closest?.('.ctx-menu')) return
    menu.hide()
  }

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutsidePointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutsidePointerDown, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.open.value])

  if (!menu.open.value) return null

  return createPortal(
    <div className="ctx-layer" onContextMenu={(e) => e.preventDefault()}>
      <div
        className="ctx-menu"
        style={style}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="ctx-bar">
          <button type="button" title={t('ctx.cut')} aria-label={t('ctx.cut')} onClick={() => run(A.cut)}>
            <Icon name="cut" />
          </button>
          <button
            type="button"
            title={t('ctx.copy')}
            aria-label={t('ctx.copy')}
            onClick={() => run(A.copySelection)}
          >
            <Icon name="copy" />
          </button>
          <button
            type="button"
            title={t('ctx.paste')}
            aria-label={t('ctx.paste')}
            onClick={() => run(A.paste)}
          >
            <Icon name="paste" />
          </button>
          <button
            type="button"
            title={t('ctx.remove')}
            aria-label={t('ctx.remove')}
            onClick={() => run(A.deleteSelection)}
          >
            <Icon name="delete" />
          </button>
        </div>

        <div className="ctx-bar">
          <button
            type="button"
            className="wide"
            title={t('ctx.copyAsMarkdown')}
            onClick={() => run(A.copyAsMarkdown)}
          >
            <Icon name="copyAsMarkdown" size={18} />
            <span>{t('ctx.copyAs')} Markdown</span>
          </button>
          <button
            type="button"
            className="wide"
            title={t('ctx.pasteAs')}
            onClick={() => run(A.pasteAsPlainText)}
          >
            <Icon name="pastePlain" size={18} />
            <span>{t('ctx.pasteAs')}</span>
          </button>
        </div>

        <div className="ctx-bar">
          <button
            type="button"
            className={markActive('strong', 'bold') ? 'active' : ''}
            title={t('ctx.bold')}
            aria-label={t('ctx.bold')}
            onClick={() => run(A.toggleBold)}
          >
            <Icon name="bold" />
          </button>
          <button
            type="button"
            className={markActive('emphasis', 'em', 'italic') ? 'active' : ''}
            title={t('ctx.italic')}
            aria-label={t('ctx.italic')}
            onClick={() => run(A.toggleItalic)}
          >
            <Icon name="italic" />
          </button>
          <button
            type="button"
            className={markActive('inlineCode') ? 'active' : ''}
            title={t('ctx.inlineCode')}
            aria-label={t('ctx.inlineCode')}
            onClick={() => run(A.toggleInlineCode)}
          >
            <Icon name="code" />
          </button>
          <button
            type="button"
            title={t('ctx.link')}
            aria-label={t('ctx.link')}
            onClick={() => run(A.insertHyperlink)}
          >
            <Icon name="link" />
          </button>
          <button
            type="button"
            className={markActive('strike_through', 'strikethrough', 'strike') ? 'active' : ''}
            title={t('ctx.strike')}
            aria-label={t('ctx.strike')}
            onClick={() => run(A.toggleStrike)}
          >
            <Icon name="strike" />
          </button>
          <button
            type="button"
            title={t('ctx.clearFormat')}
            aria-label={t('ctx.clearFormat')}
            onClick={() => run(A.clearStyle)}
          >
            <Icon name="clearFormat" />
          </button>
        </div>

        <div className="ctx-bar">
          <button
            type="button"
            className={nodeActive('blockquote') ? 'active' : ''}
            title={t('ctx.quote')}
            aria-label={t('ctx.quote')}
            onClick={() => run(A.insertBlockquote)}
          >
            <Icon name="quote" />
          </button>
          <button
            type="button"
            className={nodeActive('bullet_list') ? 'active' : ''}
            title={t('ctx.bulletList')}
            aria-label={t('ctx.bulletList')}
            onClick={() => run(A.insertUnorderedList)}
          >
            <Icon name="bulletList" />
          </button>
          <button
            type="button"
            className={nodeActive('ordered_list') ? 'active' : ''}
            title={t('ctx.orderedList')}
            aria-label={t('ctx.orderedList')}
            onClick={() => run(A.insertOrderedList)}
          >
            <Icon name="orderedList" />
          </button>
          <button
            type="button"
            className={A.taskItemActive() ? 'active' : ''}
            title={t('ctx.taskList')}
            aria-label={t('ctx.taskList')}
            onClick={() => run(A.insertTaskList)}
          >
            <Icon name="taskList" />
          </button>
        </div>

        <div className="ctx-sep" />

        <div
          className="ctx-item has-sub"
          onMouseEnter={() => setOpenSub(isTable ? 'table' : 'style')}
        >
          <span>{submenuTitle}</span>
          <span className="arrow">▸</span>
          {(openSub === 'table' || openSub === 'style') && (
            <div className="ctx-submenu">
              {isTable ? (
                tableItems.map((it, idx) => (
                  <div key={`t${idx}`}>
                    {it.sep ? (
                      <div className="ctx-sep" />
                    ) : (
                      <button
                        type="button"
                        className="ctx-row-item"
                        onClick={() => run(it.run)}
                      >
                        <span className="lbl">{it.label}</span>
                        <span className="sc">{it.shortcut || ''}</span>
                      </button>
                    )}
                  </div>
                ))
              ) : (
                paragraphItems.map((it, idx) => (
                  <button
                    key={`p${idx}`}
                    type="button"
                    className="ctx-row-item"
                    onClick={() => run(it.run)}
                  >
                    <span className="lbl">
                      <span className="check">{it.checked && it.checked() ? '✓' : ''}</span>
                      {it.label}
                    </span>
                    <span className="sc">{it.shortcut || ''}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="ctx-item has-sub" onMouseEnter={() => setOpenSub('insert')}>
          <span>{t('ctx.insert')}</span>
          <span className="arrow">▸</span>
          {openSub === 'insert' && (
            <div className="ctx-submenu">
              {insertItems.map((it, idx) => (
                <div key={`i${idx}`}>
                  {it.sep ? (
                    <div className="ctx-sep" />
                  ) : (
                    <button
                      type="button"
                      className="ctx-row-item"
                      onClick={() => run(it.run)}
                    >
                      <span className="lbl">{it.label}</span>
                      <span className="sc">{it.shortcut || ''}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
