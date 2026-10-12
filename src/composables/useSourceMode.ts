import { ref } from 'vue'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { useUI } from '@/composables/useUI'
import { buildOutlineFromMarkdown } from '@/utils/outline'

/**
 * Drives the "source code mode" (Ctrl+/) toggle. When entering source mode we
 * snapshot the live Markdown; when leaving we push the edited text back into the
 * editor and refresh the document store + outline.
 */
export function useSourceMode() {
  const milkdown = useMilkdown()
  const editor = useEditorStore()
  const ui = useUI()
  const sourceText = ref('')

  async function enter(): Promise<void> {
    const md = await milkdown.getMarkdown()
    sourceText.value = typeof md === 'string' ? md : editor.doc.content
  }

  async function commit(): Promise<void> {
    const md = sourceText.value
    editor.updateContent(md)
    editor.setOutline(buildOutlineFromMarkdown(md))
    await milkdown.loadMarkdown(md)
  }

  return { sourceText, enter, commit }
}
