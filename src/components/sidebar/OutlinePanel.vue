<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import type { OutlineNode } from '@/types'

const { t } = useI18n()
const editor = useEditorStore()

interface FlatNode {
  node: OutlineNode
  depth: number
}

function flatten(nodes: OutlineNode[], depth: number, acc: FlatNode[]): void {
  for (const n of nodes) {
    acc.push({ node: n, depth })
    if (n.children?.length) flatten(n.children, depth + 1, acc)
  }
}

const flat = computed<FlatNode[]>(() => {
  const acc: FlatNode[] = []
  flatten(editor.outline, 0, acc)
  return acc
})

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
</script>

<template>
  <div class="outline-panel">
    <div v-if="!flat.length" class="empty">{{ t('outline.empty') }}</div>
    <ul class="outline-list">
      <li
        v-for="item in flat"
        :key="item.node.id"
        class="outline-item"
        :style="{ paddingLeft: 8 + item.depth * 14 + 'px' }"
        @click="scrollTo(item.node)"
      >
        {{ item.node.text || '·' }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.outline-panel {
  font-size: 13px;
}
.outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.outline-item {
  padding: 3px 6px;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fg);
}
.outline-item:hover {
  background: var(--accent-soft);
}
.empty {
  padding: 6px;
  font-size: 12px;
  color: var(--fg-muted);
}
</style>
