import { makeReactive, refLike, useStoreSubscription } from '@/composables/useStoreSafe'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { buildOutlineFromMarkdown } from '@/utils/outline'

/**
 * Drives the "source code mode" (Ctrl+/) toggle. When entering source mode we
 * snapshot the live Markdown; when leaving we push the edited text back into the
 * editor and refresh the document store + outline.
 */
interface SourceState {
  sourceText: string
}

const sourceObs = makeReactive<SourceState>({ sourceText: '' })

export interface SourceModeApi {
  sourceText: { value: string }
  enter: () => Promise<void>
  commit: () => Promise<void>
}

export const sourceApi: SourceModeApi = {
  sourceText: refLike(sourceObs, 'sourceText'),

  async enter(): Promise<void> {
    const milkdown = useMilkdown()
    const editor = useEditorStore()
    const md = await milkdown.getMarkdown()
    sourceObs.set({
      sourceText: typeof md === 'string' ? md : editor.doc.content,
    })
  },

  async commit(): Promise<void> {
    const md = sourceObs.get().sourceText
    const editor = useEditorStore()
    editor.updateContent(md)
    editor.setOutline(buildOutlineFromMarkdown(md))
    await useMilkdown().loadMarkdown(md)
  },
}

export function useSourceMode(): SourceModeApi {
  useStoreSubscription(sourceObs)
  return sourceApi
}
