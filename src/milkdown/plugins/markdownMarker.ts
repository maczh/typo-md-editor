import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { EditorState } from '@milkdown/prose/state'
import type { Node as ProseNode } from '@milkdown/prose/model'

/**
 * Typora-style "show Markdown source at the caret" markers.
 *
 * When the caret sits inside a heading (or a blockquote paragraph) the matching
 * Markdown tag is rendered as an inline, non-editable widget at the start of that
 * line — e.g. a level-2 heading shows `## 标题2内容` while the caret is on it.
 * Moving the caret away removes the widget, restoring the pure WYSIWYG view.
 *
 * The widget is a pure decoration: it never touches the document, so the
 * Markdown round-trip (save / source mode / export) is completely unaffected.
 */

const markerKey = new PluginKey<DecorationSet>('typo-markdown-marker')

/** Build the marker decorations for the block that currently holds the caret. */
function buildDecorations(state: EditorState): DecorationSet {
  const { selection, doc } = state
  const $from = selection.$from
  const parent = $from.parent as ProseNode | undefined
  if (!parent || !parent.isTextblock) return DecorationSet.empty

  const at = $from.start()
  const decorations: Decoration[] = []

  const makeWidget = (text: string, key: string): void => {
    decorations.push(
      Decoration.widget(
        at,
        () => {
          const span = document.createElement('span')
          span.className = 'typo-md-marker'
          span.textContent = text
          span.setAttribute('aria-hidden', 'true')
          span.contentEditable = 'false'
          return span
        },
        { side: -1, key },
      ),
    )
  }

  if (parent.type.name === 'heading') {
    const level = Number((parent.attrs as { level?: number }).level ?? 0)
    if (level >= 1 && level <= 6) {
      makeWidget(`${'#'.repeat(level)} `, `h${level}`)
    }
  } else if (parent.type.name === 'paragraph') {
    // Count how many blockquotes wrap this paragraph to render the right `>` run.
    let depth = 0
    for (let d = $from.depth; d > 0; d -= 1) {
      if (($from.node(d) as ProseNode).type.name === 'blockquote') depth += 1
    }
    if (depth > 0) {
      makeWidget(`${'> '.repeat(depth)}`, `q${depth}`)
    }
  }

  if (decorations.length === 0) return DecorationSet.empty
  return DecorationSet.create(doc, decorations)
}

/**
 * ProseMirror plugin that renders the current block's Markdown tag at the caret.
 * Register it on the editor after Crepe's own features.
 */
export const markdownMarkerPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: markerKey,
      state: {
        init: (_config, state) => buildDecorations(state),
        apply: (tr, value, _prev, next) => {
          if (tr.docChanged || tr.selectionSet) return buildDecorations(next)
          return value
        },
      },
      props: {
        decorations: (state) => markerKey.getState(state) ?? undefined,
      },
    }),
)
