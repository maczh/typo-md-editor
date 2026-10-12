import { ref } from 'vue'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { buildOutlineFromMarkdown } from '@/utils/outline'

// Module-level singleton so the global hotkey layer and the dialog share state.
const findText = ref('')
const replaceText = ref('')
const matchCase = ref(false)
const replaceVisible = ref(false)

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
export function useFind() {
  const milkdown = useMilkdown()
  const editor = useEditorStore()

  function findNext(): boolean {
    if (!findText.value) return false
    return winFind.find(findText.value, matchCase.value, false, true)
  }

  function findPrev(): boolean {
    if (!findText.value) return false
    return winFind.find(findText.value, matchCase.value, true, true)
  }

  async function applyReplace(replaceAll: boolean): Promise<void> {
    if (!findText.value) return
    const md = (await milkdown.getMarkdown()) || editor.doc.content
    const flags = matchCase.value ? (replaceAll ? 'g' : '') : replaceAll ? 'gi' : 'i'
    const re = new RegExp(escapeRegex(findText.value), flags)
    const replaced = md.replace(re, replaceText.value)
    if (replaced !== md) {
      editor.updateContent(replaced)
      editor.setOutline(buildOutlineFromMarkdown(replaced))
      await milkdown.loadMarkdown(replaced)
    }
  }

  function close(): void {
    replaceVisible.value = false
  }

  return {
    findText,
    replaceText,
    matchCase,
    replaceVisible,
    findNext,
    findPrev,
    replaceOne: () => applyReplace(false),
    replaceAll: () => applyReplace(true),
    close,
  }
}
