import { useMemo } from 'react'
import { useEditorStore } from '@/stores/editor'
import { useTranslation } from '@/i18n'
import type { OutlineNode } from '@/types'

interface FlatNode {
  node: OutlineNode
  depth: number
}

export default function OutlinePanel() {
  const { t } = useTranslation()
  const editor = useEditorStore()

  function flatten(nodes: OutlineNode[], depth: number, acc: FlatNode[]): void {
    for (const n of nodes) {
      acc.push({ node: n, depth })
      if (n.children?.length) flatten(n.children, depth + 1, acc)
    }
  }

  const flat = useMemo<FlatNode[]>(() => {
    const acc: FlatNode[] = []
    flatten(editor.outline, 0, acc)
    return acc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.outline])

  function scrollTo(node: OutlineNode): void {
    const root = document.querySelector('.milkdown')
    if (!root) return
    const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    const target = headings.find((h) => (h.textContent || '').trim() === node.text)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const el = target as HTMLElement
    el.style.transition = 'background 0.6s ease'
    el.style.background = 'var(--accent-soft)'
    window.setTimeout(() => {
      el.style.background = ''
    }, 800)
  }

  return (
    <div className="outline-panel">
      {flat.length === 0 && <div className="empty">{t('outline.empty')}</div>}
      <ul className="outline-list">
        {flat.map((item) => (
          <li
            key={item.node.id}
            className="outline-item"
            style={{ paddingLeft: `${8 + item.depth * 14}px` }}
            onClick={() => scrollTo(item.node)}
          >
            {item.node.text || '·'}
          </li>
        ))}
      </ul>
    </div>
  )
}
