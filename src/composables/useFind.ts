import { makeReactive, refLike, useStoreSubscription } from '@/composables/useStoreSafe'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { buildOutlineFromMarkdown } from '@/utils/outline'

// Module-level singleton so the global hotkey layer and the dialog share state.
interface FindState {
  findText: string
  replaceText: string
  matchCase: boolean
  replaceVisible: boolean
}

const findObs = makeReactive<FindState>({
  findText: '',
  replaceText: '',
  matchCase: false,
  replaceVisible: false,
})

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// `window.find` is non-standard; it isn't in the TS DOM lib typings.
const winFind = window as unknown as {
  find: (
    aString: string,
    aCaseSensitive?: boolean,
    aBackwards?: boolean,
    aWrapAround?: boolean,
  ) => boolean
}

/**
 * Find / replace. "Find" highlights matches in the rendered (WYSIWYG) view via
 * the browser's native in-page search; "Replace" operates on the Markdown source
 * and reloads the editor — robust across both editing modes.
 *
 * Dialog *visibility* is owned by the host component (MdEditor renders FindDialog
 * on `useUI().findOpen`); `close()` only resets the replace-row state.
 */
export interface FindApi {
  findText: { value: string }
  replaceText: { value: string }
  matchCase: { value: boolean }
  replaceVisible: { value: boolean }
  findNext: () => boolean
  findPrev: () => boolean
  replaceOne: () => Promise<void>
  replaceAll: () => Promise<void>
  close: () => void
}

export const findApi: FindApi = {
  findText: refLike(findObs, 'findText'),
  replaceText: refLike(findObs, 'replaceText'),
  matchCase: refLike(findObs, 'matchCase'),
  replaceVisible: refLike(findObs, 'replaceVisible'),

  findNext: () => {
    if (!findObs.get().findText) return false
    return winFind.find(findObs.get().findText, findObs.get().matchCase, false, true)
  },

  findPrev: () => {
    if (!findObs.get().findText) return false
    return winFind.find(findObs.get().findText, findObs.get().matchCase, true, true)
  },

  async replaceOne(): Promise<void> {
    await applyReplace(false)
  },

  async replaceAll(): Promise<void> {
    await applyReplace(true)
  },

  close: () => {
    findObs.set({ replaceVisible: false })
  },
}

async function applyReplace(replaceAll: boolean): Promise<void> {
  if (!findObs.get().findText) return
  const milkdown = useMilkdown()
  const editor = useEditorStore()
  const md = (await milkdown.getMarkdown()) || editor.doc.content
  const flags = findObs.get().matchCase ? (replaceAll ? 'g' : '') : replaceAll ? 'gi' : 'i'
  const re = new RegExp(escapeRegex(findObs.get().findText), flags)
  const replaced = md.replace(re, findObs.get().replaceText)
  if (replaced !== md) {
    editor.updateContent(replaced)
    editor.setOutline(buildOutlineFromMarkdown(replaced))
    await milkdown.loadMarkdown(replaced)
  }
}

export function useFind(): FindApi {
  useStoreSubscription(findObs)
  return findApi
}
