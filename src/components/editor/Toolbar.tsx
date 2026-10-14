import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import * as A from '@/commands/actions'
import { hk } from '@/composables/useHotkeys'
import { useTranslation } from '@/i18n'
import { MERMAID_TEMPLATES } from '@/milkdown/plugins/mermaidTemplates'

interface ActiveState {
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  h1: boolean
  h2: boolean
  h3: boolean
  h4: boolean
  h5: boolean
  h6: boolean
  paragraph: boolean
  bullet: boolean
  ordered: boolean
  task: boolean
  quote: boolean
  codeblock: boolean
}

const INITIAL_ACTIVE: ActiveState = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  h1: false,
  h2: false,
  h3: false,
  h4: false,
  h5: false,
  h6: false,
  paragraph: false,
  bullet: false,
  ordered: false,
  task: false,
  quote: false,
  codeblock: false,
}

function inlineGlyph(key: string): string {
  switch (key) {
    case 'bold':
      return 'B'
    case 'italic':
      return 'I'
    case 'underline':
      return 'U'
    case 'strike':
      return 'S'
    case 'code':
      return '‹›'
    case 'link':
      return '🔗'
    default:
      return ''
  }
}

function blockGlyph(key: string): string {
  switch (key) {
    case 'quote':
      return '❝'
    case 'bullet':
      return '•'
    case 'ordered':
      return '1.'
    case 'task':
      return '☑'
    case 'table':
      return '▦'
    case 'codeblock':
      return '⤞'
    case 'math':
      return '∑'
    case 'image':
      return '🖼'
    case 'source':
      return '⟨/⟩'
    default:
      return ''
  }
}

interface ToolBtn {
  key: string
  title: string
  run: () => void
  isActive?: () => boolean
}

export default function Toolbar() {
  const { t } = useTranslation()
  const [active, setActive] = useState<ActiveState>(INITIAL_ACTIVE)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [blockValue, setBlockValue] = useState('paragraph')
  const scheduledRef = useRef(false)

  function refresh(): void {
    if (scheduledRef.current) return
    scheduledRef.current = true
    requestAnimationFrame(() => {
      scheduledRef.current = false
      const next: ActiveState = {
        bold: A.markActive('strong', 'bold'),
        italic: A.markActive('emphasis', 'em', 'italic'),
        strike: A.markActive('strike_through', 'strikethrough', 'strike'),
        code: A.markActive('inlineCode'),
        h1: A.nodeActive('heading', { level: 1 }),
        h2: A.nodeActive('heading', { level: 2 }),
        h3: A.nodeActive('heading', { level: 3 }),
        h4: A.nodeActive('heading', { level: 4 }),
        h5: A.nodeActive('heading', { level: 5 }),
        h6: A.nodeActive('heading', { level: 6 }),
        paragraph: A.nodeActive('paragraph'),
        bullet: A.nodeActive('bullet_list'),
        ordered: A.nodeActive('ordered_list'),
        task: A.taskItemActive(),
        quote: A.nodeActive('blockquote'),
        codeblock: A.nodeActive('code_block') || A.nodeActive('fence'),
      }
      setActive(next)
      // Keep the block-type select in sync with the caret: it used to only
      // update on user input, so it showed a stale 段落/标题 after the cursor
      // moved into (or out of) a heading.
      const level = ([1, 2, 3, 4, 5, 6] as const).find((i) => next[`h${i}` as keyof ActiveState])
      setBlockValue(level ? `h${level}` : 'paragraph')
    })
  }

  function onSelectionChange(): void {
    refresh()
  }

  function toggleDiagram(): void {
    setDiagramOpen((v) => !v)
  }

  function chooseDiagram(id: string): void {
    A.insertDiagramTemplate(id)
    setDiagramOpen(false)
  }

  function onDocPointerDown(): void {
    setDiagramOpen(false)
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && diagramOpen) setDiagramOpen(false)
  }

  function onBlockChange(e: ChangeEvent<HTMLSelectElement>): void {
    const v = e.target.value
    setBlockValue(v)
    if (v === 'paragraph') A.setParagraph()
    else A.setHeading(Number(v.replace('h', '')))
  }

  useEffect(() => {
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onDocPointerDown)
    document.addEventListener('keydown', onKey)
    refresh()
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onDocPointerDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inlineBtns: ToolBtn[] = [
    { key: 'bold', title: hk('bold'), run: A.toggleBold, isActive: () => active.bold },
    { key: 'italic', title: hk('italic'), run: A.toggleItalic, isActive: () => active.italic },
    { key: 'underline', title: hk('underline'), run: A.toggleUnderline },
    { key: 'strike', title: hk('strike'), run: A.toggleStrike, isActive: () => active.strike },
    { key: 'code', title: hk('inlineCode'), run: A.toggleInlineCode, isActive: () => active.code },
    { key: 'link', title: hk('link'), run: A.insertHyperlink },
  ]

  const blockBtns: ToolBtn[] = [
    { key: 'quote', title: hk('quote'), run: A.insertBlockquote, isActive: () => active.quote },
    { key: 'bullet', title: hk('unorderedList'), run: A.insertUnorderedList, isActive: () => active.bullet },
    { key: 'ordered', title: hk('orderedList'), run: A.insertOrderedList, isActive: () => active.ordered },
    { key: 'task', title: hk('taskList'), run: A.insertTaskList, isActive: () => active.task },
    { key: 'table', title: hk('insertTable'), run: A.insertTable },
    { key: 'codeblock', title: hk('codeBlock'), run: A.insertCodeBlock, isActive: () => active.codeblock },
    { key: 'math', title: hk('mathBlock'), run: A.insertMathBlock },
    { key: 'diagram', title: 'Mermaid', run: A.insertDiagramBlock },
    { key: 'image', title: hk('insertLocalImage'), run: A.insertLocalImage },
    { key: 'source', title: hk('sourceMode'), run: A.toggleSourceMode },
  ]

  return (
    <div className="toolbar">
      <button className="tb-btn" title={`${t('toolbar.undo')} (${hk('undo')})`} onClick={() => A.undo()}>
        ↶
      </button>
      <button className="tb-btn" title={`${t('toolbar.redo')} (${hk('redo')})`} onClick={() => A.redo()}>
        ↷
      </button>

      <span className="sep" />

      <select className="block-select" value={blockValue} onChange={onBlockChange}>
        <option value="paragraph">{t('toolbar.paragraph')}</option>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <option key={i} value={`h${i}`}>
            {t('toolbar.heading')} {i}
          </option>
        ))}
      </select>

      <span className="sep" />

      {inlineBtns.map((b) => (
        <button
          key={b.key}
          className={`tb-btn${b.isActive && b.isActive() ? ' active' : ''}`}
          title={`${t('toolbar.' + b.key)} (${b.title})`}
          onClick={() => b.run()}
        >
          {inlineGlyph(b.key)}
        </button>
      ))}

      <span className="sep" />

      {blockBtns.map((b) =>
        b.key === 'diagram' ? (
          <span key={b.key} className="tb-dropdown" onMouseDown={(e) => e.stopPropagation()}>
            <button
              className={`tb-btn${diagramOpen ? ' active' : ''}`}
              title={`${t('toolbar.diagram')} (Mermaid)`}
              onClick={toggleDiagram}
            >
              📊
            </button>
            {diagramOpen && (
              <div className="tb-menu">
                {MERMAID_TEMPLATES.map((d) => (
                  <button
                    key={d.id}
                    className="tb-menu-item"
                    type="button"
                    onClick={() => chooseDiagram(d.id)}
                  >
                    <span className="tb-menu-icon">{d.icon}</span>
                    <span className="tb-menu-label">{t(d.labelKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        ) : (
          <button
            key={b.key}
            className={`tb-btn${b.isActive && b.isActive() ? ' active' : ''}`}
            title={`${t('toolbar.' + b.key)} (${b.title})`}
            onClick={() => b.run()}
          >
            {blockGlyph(b.key)}
          </button>
        ),
      )}
    </div>
  )
}
