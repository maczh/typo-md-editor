import { $mark, $remark } from '@milkdown/utils'
import type { MarkSchema, RemarkPluginRaw } from '@milkdown/transformer'

/**
 * Real ProseMirror `underline` mark.
 *
 * Markdown has no native underline, so we round-trip it as raw `<u>…</u>` HTML
 * inline — both directions are handled here:
 *
 *  - **Export (toMarkdown):** the mark is emitted as a single inline `html` node
 *    containing the literal `<u>…</u>` string. The serializer's standard `html`
 *    handler writes it verbatim, so the saved Markdown stays valid and renders
 *    underlined.
 *  - **Import (parseMarkdown + `underlineRemark`):** raw `<u>…</u>` in the source
 *    arrives as `html` inline nodes; the `underlineRemark` remark plugin morphs
 *    each `<u>` … `</u>` pair into a single `underline` mdast node, which this
 *    mark's `parseMarkdown` then turns back into the `underline` ProseMirror mark.
 *
 * Known limitation: when underline is combined with another mark on the same run
 * (e.g. bold + underline), the export emits only the `<u>…</u>` wrapper and the
 * companion mark is dropped for that run, because Milkdown's serializer cannot
 * emit differing open/close delimiters per mark. Standalone underline — the
 * common case — is exact.
 */

export const underline = $mark('underline', () =>
  ({
    parseDOM: [
      { tag: 'u' },
      {
        style: 'text-decoration',
        getAttrs: (value) => (value === 'underline' ? {} : false),
      },
    ],
    toDOM: () => ['u', { class: 'milkdown-underline' }, 0],
    parseMarkdown: {
      match: (node) => node.type === 'underline',
      runner: (state, node, markType) => {
        state.openMark(markType)
        state.next(node.children)
        state.closeMark(markType)
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === 'underline',
      runner: (state, _mark, node) => {
        const text = node.isText ? node.text ?? '' : ''
        state.addNode('html', undefined, `<u>${text}</u>`)
        return true
      },
    },
  }) as MarkSchema,
)

/** Morph `<u>…</u>` raw-HTML inline pairs into `underline` mdast nodes on load. */
export const underlineRemark = $remark(
  'underlineMorph',
  () =>
    ((tree: unknown) => {
      const root = tree as { children?: unknown[] }
      const walk = (nodes: unknown[]): void => {
        if (!Array.isArray(nodes)) return
        for (const child of nodes) {
          const c = child as { children?: unknown[] }
          if (c && Array.isArray(c.children)) walk(c.children)
        }
        let i = 0
        while (i < nodes.length) {
          const n = nodes[i] as { type?: string; value?: unknown }
          if (n && n.type === 'html' && String(n.value).trim() === '<u>') {
            const content: unknown[] = []
            let j = i + 1
            while (j < nodes.length) {
              const m = nodes[j] as { type?: string; value?: unknown }
              if (m && m.type === 'html' && String(m.value).trim() === '</u>') break
              content.push(nodes[j])
              j += 1
            }
            if (j < nodes.length) {
              nodes.splice(i, j - i + 1, { type: 'underline', children: content })
              i += 1
            } else {
              i += 1
            }
          } else {
            i += 1
          }
        }
      }
      if (root && Array.isArray(root.children)) walk(root.children)
    }) as unknown as RemarkPluginRaw<Record<string, unknown>>,
)
