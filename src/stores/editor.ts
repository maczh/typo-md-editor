import { createStore, type StoreApi } from 'zustand/vanilla'
import type { EditorDoc, OutlineNode } from '@/types'
import { useStoreSafe } from '@/composables/useStoreSafe'

/**
 * Editor store — owns the current document (Markdown source of truth), the live
 * outline, the cursor position and the word count.
 *
 * Store id carries a package prefix (`typo-editor`) to avoid colliding with a
 * host application's own state containers.
 */
export interface EditorState {
  doc: EditorDoc
  outline: OutlineNode[]
  cursor: { line: number; col: number }
  wordCount: number
  /** Bumped whenever a *new* document is loaded (so the editor pane can reload
   *  without reacting to ordinary saves). */
  loadSignal: number
  loadFromText: (text: string, name?: string) => void
  updateContent: (md: string) => void
  markSaved: () => void
  setOutline: (o: OutlineNode[]) => void
  setCursor: (line: number, col: number) => void
  getContent: () => string
  updateWordCount: (text: string) => void
}

export const editorStore: StoreApi<EditorState> = createStore<EditorState>((set, get) => {
  function updateWordCount(text: string): void {
    const trimmed = text.trim()
    set({ wordCount: trimmed ? trimmed.split(/\s+/).length : 0 })
  }

  /** Replace the whole document (initial mount / host-driven load). */
  function loadFromText(text: string, name = 'untitled.md'): void {
    const trimmed = text.trim()
    set((state) => ({
      doc: { name, content: text, dirty: false, savedAt: Date.now() },
      wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
      loadSignal: state.loadSignal + 1,
    }))
  }

  /** Called by the editor on every content change. */
  function updateContent(md: string): void {
    const trimmed = md.trim()
    set((state) => ({
      doc: { ...state.doc, content: md, dirty: true },
      wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
    }))
  }

  function markSaved(): void {
    set((state) => ({ doc: { ...state.doc, dirty: false, savedAt: Date.now() } }))
  }

  function setOutline(o: OutlineNode[]): void {
    set({ outline: o })
  }

  function setCursor(line: number, col: number): void {
    set({ cursor: { line, col } })
  }

  function getContent(): string {
    return get().doc.content
  }

  return {
    doc: { name: 'untitled.md', content: '', dirty: false, savedAt: null },
    outline: [],
    cursor: { line: 1, col: 1 },
    wordCount: 0,
    loadSignal: 0,
    loadFromText,
    updateContent,
    markSaved,
    setOutline,
    setCursor,
    getContent,
    updateWordCount,
  }
})

/**
 * Accessor / React hook (see {@link useStoreSafe} for the dual-context behaviour).
 */
export function useEditorStore(): EditorState {
  return useStoreSafe(editorStore)
}
