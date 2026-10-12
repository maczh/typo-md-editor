import type { Editor } from '@milkdown/core'
import { $prose, insert } from '@milkdown/utils'
import { Plugin, PluginKey, TextSelection, type Selection } from '@milkdown/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view'
import type { Node as ProseNode } from '@milkdown/prose/model'
import { i18n } from '@/i18n'

/**
 * Mermaid diagram support.
 *
 * Crepe ships no Mermaid feature, so this module adds one on top of it:
 *
 *  - `insertDiagram` inserts a ```` ```mermaid ```` fenced block at the caret.
 *  - `mermaidDiagramPlugin` renders every `mermaid` fenced block as a real
 *    diagram *below* the block, and hides the fenced source while the caret is
 *    elsewhere — the Typora behaviour. Clicking a rendered diagram moves the
 *    caret back into its source, revealing the editor again.
 *
 * Rendering is lazy (Mermaid is dynamically imported) and cached per
 * source + theme so typing never triggers a render storm.
 */

/** Insert a Mermaid code block (```` ```mermaid ````) at the caret. */
export function insertDiagram(editor: Editor, code: string): void {
  const md = `\n\`\`\`mermaid\n${code}\n\`\`\`\n`
  editor.action(insert(md))
}

const MERMAID_LANGUAGE = 'mermaid'
const RENDER_DEBOUNCE_MS = 220
const MAX_CACHE_ENTRIES = 80

type MermaidThemeName = 'default' | 'dark'

type RenderEntry = { status: 'ready'; svg: string } | { status: 'error' }

/** Rendered diagrams keyed by `<theme>|<source>`. */
const renderCache = new Map<string, RenderEntry>()
/** Keys currently queued / being rendered, mapped to their source. */
const inFlight = new Map<string, string>()
let pendingSources = new Set<string>()
let flushTimer: number | null = null
let activeView: EditorView | null = null

const mermaidKey = new PluginKey<DecorationSet>('typo-mermaid-diagram')

function t(key: string): string {
  return i18n.global.t(key)
}

/** Light/dark Mermaid palette, derived from the active app theme. */
export function currentMermaidTheme(): MermaidThemeName {
  const theme = document.documentElement.getAttribute('data-theme') || ''
  return theme.includes('dark') ? 'dark' : 'default'
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
let initializedTheme: MermaidThemeName | null = null

async function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default)
  }
  return mermaidPromise
}

/** Lazily load and initialize Mermaid, returning the singleton instance. */
export async function getMermaid(): Promise<typeof import('mermaid').default> {
  const instance = await loadMermaid()
  const theme = currentMermaidTheme()
  if (initializedTheme !== theme) {
    instance.initialize({
      startOnLoad: false,
      // `strict` keeps Mermaid's output sanitized (safe to inject into the DOM)
      // while still supporting every diagram type, including HTML-ish labels.
      securityLevel: 'strict',
      theme,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif',
    })
    initializedTheme = theme
  }
  return instance
}

let renderSeq = 0

/**
 * Mermaid's ER grammar (mermaid 10.x) is ASCII-only: Chinese (and any non-ASCII)
 * in entity names, relationship labels, or attribute names is rejected with a
 * parse error. To keep Chinese ER diagrams working, we swap every non-ASCII run
 * for a unique ASCII placeholder, let Mermaid render it, then restore the
 * original text in the produced SVG. Other diagram types already accept Unicode,
 * so we only apply this to `erDiagram` sources.
 */
function isErDiagram(code: string): boolean {
  return /^erDiagram\b/i.test(code.trim())
}

function cjkSafeTransform(code: string): {
  code: string
  restore: (svg: string) => string
} {
  const map = new Map<string, string>()
  let i = 0
  const transformed = code.replace(/[^\x00-\x7F]+/g, (run) => {
    let ph = `typocjk${i}`
    while (code.includes(ph)) {
      i += 1
      ph = `typocjk${i}`
    }
    map.set(ph, run)
    i += 1
    return ph
  })
  const restore = (svg: string): string => {
    let out = svg
    for (const [ph, orig] of map) out = out.split(ph).join(orig)
    return out
  }
  return { code: transformed, restore }
}

/** Render a Mermaid diagram definition to an SVG string. */
export async function renderMermaid(code: string): Promise<string> {
  const mermaid = await getMermaid()
  renderSeq += 1
  let renderCode = code
  let restore: (svg: string) => string = (svg) => svg
  if (isErDiagram(code)) {
    const t = cjkSafeTransform(code)
    renderCode = t.code
    restore = t.restore
  }
  const { svg } = await mermaid.render(`typo-mermaid-${renderSeq}`, renderCode)
  return restore(svg)
}

function cacheKey(source: string): string {
  return `${currentMermaidTheme()}|${source}`
}

function clearRenderCache(): void {
  renderCache.clear()
  inFlight.clear()
  pendingSources = new Set()
}

/* ------------------------------------------------------------------ *
 * Async render queue
 * ------------------------------------------------------------------ */

function scheduleRefresh(): void {
  window.setTimeout(() => {
    const view = activeView
    if (!view) return
    try {
      view.dispatch(view.state.tr.setMeta(mermaidKey, 'refresh'))
    } catch {
      /* an update is in progress — decorations rebuild on the next transaction */
    }
  }, 0)
}

async function flushRenders(): Promise<void> {
  flushTimer = null
  const jobs = Array.from(pendingSources)
  pendingSources = new Set()
  for (const source of jobs) {
    const key = cacheKey(source)
    if (!inFlight.has(key)) continue
    inFlight.delete(key)
    try {
      const svg = await renderMermaid(source)
      renderCache.set(key, { status: 'ready', svg })
    } catch {
      renderCache.set(key, { status: 'error' })
    }
  }
  // Sources superseded before they got rendered: allow a later retry.
  const stillPending = new Set(Array.from(pendingSources).map(cacheKey))
  for (const key of Array.from(inFlight.keys())) {
    if (!stillPending.has(key)) inFlight.delete(key)
  }
  if (renderCache.size > MAX_CACHE_ENTRIES) clearRenderCache()
  scheduleRefresh()
}

function ensureRendered(source: string): void {
  if (!source.trim()) return
  const key = cacheKey(source)
  if (renderCache.has(key) || inFlight.has(key)) return
  inFlight.set(key, source)
  pendingSources.add(source)
  if (flushTimer != null) window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => void flushRenders(), RENDER_DEBOUNCE_MS)
}

/* ------------------------------------------------------------------ *
 * Diagram DOM
 * ------------------------------------------------------------------ */

function statusDom(text: string, kind?: 'error'): HTMLDivElement {
  const el = document.createElement('div')
  el.className = kind === 'error' ? 'typo-mermaid-status error' : 'typo-mermaid-status'
  el.textContent = text
  return el
}

function focusSource(view: EditorView, getPos: () => number | undefined): void {
  const widgetPos = getPos()
  if (widgetPos == null) return
  const $pos = view.state.doc.resolve(widgetPos)
  const node = $pos.nodeBefore
  if (!node || node.type.name !== 'code_block') return
  const start = widgetPos - node.nodeSize
  window.setTimeout(() => {
    if (!activeView) return
    try {
      const tr = view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(start + 1)),
      )
      tr.scrollIntoView()
      view.dispatch(tr)
      view.focus()
    } catch {
      /* node moved in the meantime */
    }
  }, 0)
}

function buildDiagramDom(
  source: string,
  view: EditorView,
  getPos: () => number | undefined,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'typo-mermaid-diagram'
  wrap.contentEditable = 'false'

  const entry = renderCache.get(cacheKey(source))
  if (!source.trim()) {
    wrap.appendChild(statusDom(t('editor.mermaidHint')))
  } else if (entry?.status === 'ready') {
    wrap.innerHTML = entry.svg
    wrap.classList.add('is-ready')
  } else if (entry?.status === 'error') {
    wrap.appendChild(statusDom(t('editor.mermaidInvalid'), 'error'))
  } else {
    wrap.appendChild(statusDom(t('editor.mermaidLoading')))
  }

  const hint = document.createElement('div')
  hint.className = 'typo-mermaid-hint'
  hint.textContent = t('editor.mermaidHint')
  wrap.appendChild(hint)

  // Clicking the rendered diagram puts the caret back inside the fenced block,
  // which makes the source editor above it reappear.
  wrap.addEventListener('mousedown', (event) => {
    event.preventDefault()
    focusSource(view, getPos)
  })
  return wrap
}

/* ------------------------------------------------------------------ *
 * Decorations
 * ------------------------------------------------------------------ */

function isMermaidBlock(node: ProseNode): boolean {
  return (
    node.type.name === 'code_block' &&
    String(node.attrs.language || '').toLowerCase() === MERMAID_LANGUAGE
  )
}

function buildDecorations(doc: ProseNode, selection: Selection): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!isMermaidBlock(node)) return
    const end = pos + node.nodeSize
    const source = node.textContent
    const editing = selection.from <= end && selection.to >= pos
    if (!editing) {
      // Caret is elsewhere: collapse the fenced source, keep the diagram.
      decorations.push(Decoration.node(pos, end, { class: 'typo-mermaid-source-hidden' }))
    }
    ensureRendered(source)
    // Include the current render status in the widget key. ProseMirror reuses
    // widget decorations whose key is unchanged, so without this the "loading"
    // DOM would be cached forever and never swapped for the rendered SVG. Flipping
    // the key to `ready` (or `error`) forces ProseMirror to rebuild the widget,
    // which re-runs `buildDiagramDom` and paints the diagram.
    const status = renderCache.get(cacheKey(source))?.status ?? 'pending'
    decorations.push(
      Decoration.widget(end, (view, getPos) => buildDiagramDom(source, view, getPos), {
        side: 1,
        key: `typo-mermaid|${end}|${source.length}|${editing ? 'edit' : 'view'}|${status}`,
      }),
    )
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * ProseMirror plugin that pairs every `mermaid` fenced code block with a live
 * diagram preview. Register it on the editor *after* Crepe's own features.
 */
export const mermaidDiagramPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: mermaidKey,
      state: {
        init: (_config, state) => buildDecorations(state.doc, state.selection),
        apply: (tr, value, _prev, next) => {
          if (tr.docChanged || tr.selectionSet || tr.getMeta(mermaidKey)) {
            return buildDecorations(next.doc, next.selection)
          }
          return value
        },
      },
      props: {
        decorations: (state) => mermaidKey.getState(state) ?? undefined,
      },
      view: (view) => {
        activeView = view
        return {
          update: () => {},
          destroy: () => {
            if (activeView === view) activeView = null
          },
        }
      },
    }),
)
