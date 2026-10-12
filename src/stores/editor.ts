import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EditorDoc, OutlineNode } from '@/types'

/**
 * Editor store — owns the current document (Markdown source of truth), the live
 * outline, the cursor position and the word count.
 *
 * Store id 带包名前缀（`typo-editor`），避免与宿主应用自己的 pinia store 撞名。
 */
export const useEditorStore = defineStore('typo-editor', () => {
  const doc = ref<EditorDoc>({
    name: 'untitled.md',
    content: '',
    dirty: false,
    savedAt: null,
  })

  const outline = ref<OutlineNode[]>([])
  const cursor = ref({ line: 1, col: 1 })
  const wordCount = ref(0)
  // Bumped whenever a *new* document is loaded so the editor pane can reload
  // without reacting to ordinary saves.
  const loadSignal = ref(0)

  function updateWordCount(text: string): void {
    const trimmed = text.trim()
    wordCount.value = trimmed ? trimmed.split(/\s+/).length : 0
  }

  /** Replace the whole document (initial mount / host-driven load). */
  function loadFromText(text: string, name = 'untitled.md'): void {
    doc.value = {
      name,
      content: text,
      dirty: false,
      savedAt: Date.now(),
    }
    updateWordCount(text)
    loadSignal.value++
  }

  /** Called by the editor on every content change. */
  function updateContent(md: string): void {
    doc.value.content = md
    doc.value.dirty = true
    updateWordCount(md)
  }

  function markSaved(): void {
    doc.value.dirty = false
    doc.value.savedAt = Date.now()
  }

  function setOutline(o: OutlineNode[]): void {
    outline.value = o
  }

  function setCursor(line: number, col: number): void {
    cursor.value = { line, col }
  }

  function getContent(): string {
    return doc.value.content
  }

  return {
    doc,
    outline,
    cursor,
    wordCount,
    loadSignal,
    loadFromText,
    updateContent,
    markSaved,
    setOutline,
    setCursor,
    getContent,
    updateWordCount,
  }
})
