import type { Node } from '@milkdown/prose/model'
import type { OutlineNode } from '@/types'

/**
 * Build a nested outline from a ProseMirror document by walking heading nodes.
 * `pos` is the node position used for scroll-to on click.
 */
export function buildOutline(doc: Node): OutlineNode[] {
  const flat: OutlineNode[] = []
  let index = 0
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = (node.attrs.level as number) || 1
      const text = node.textContent || ''
      flat.push({
        // Stable-enough id: sequential index keeps keys from thrashing on edit.
        id: `heading-${index++}`,
        level,
        text,
        pos,
        children: [],
      })
    }
    return true
  })
  return nest(flat)
}

/** Group flat headings into a tree by their level (1 = top). */
function nest(flat: OutlineNode[]): OutlineNode[] {
  const root: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const item of flat) {
    while (stack.length && stack[stack.length - 1].level >= item.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      root.push(item)
    } else {
      stack[stack.length - 1].children.push(item)
    }
    stack.push(item)
  }
  return root
}

/**
 * Build an outline directly from Markdown source (ATX headings). Avoids coupling
 * to the ProseMirror document and is robust for live updates while typing.
 */
export function buildOutlineFromMarkdown(markdown: string): OutlineNode[] {
  const lines = markdown.split('\n')
  const flat: OutlineNode[] = []
  let inFence = false
  let index = 0
  lines.forEach((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m) {
      const level = m[1].length
      const text = m[2].trim()
      flat.push({
        id: `heading-${index++}`,
        level,
        text,
        pos: -1,
        children: [],
      })
    }
  })
  return nest(flat)
}
