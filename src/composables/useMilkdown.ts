import type { Editor } from '@milkdown/core'
import { createEditor, type EditorInstance } from '@/milkdown/setup'
import type { ImageUploader } from '@/utils/images'
import { makeReactive, refLike, useStoreSubscription } from '@/composables/useStoreSafe'

// Module-level shared state so every component (EditorPane, ImageHandler,
// TableToolbar, export) operates on the same editor instance.
interface MilkdownState {
  instance: EditorInstance | null
  isReady: boolean
}

const milkObs = makeReactive<MilkdownState>({ instance: null, isReady: false })

/**
 * Shared Milkdown controller. Returns the singleton editor instance and helpers.
 * Call `mount` once from EditorPane.
 *
 * `onUpload` is an optional image-uploader passthrough for direct consumers of
 * `createEditor`; the component flow instead injects the uploader globally via
 * `setImageUploader` (MdEditor's `onUpload` prop), which `image-block` reads.
 */
export interface MilkdownApi {
  instance: { value: EditorInstance | null }
  isReady: { value: boolean }
  mount: (
    container: HTMLElement,
    defaultValue?: string,
    onChange?: (markdown: string) => void,
    onUpload?: ImageUploader,
  ) => Promise<void>
  getMarkdown: () => Promise<string> | string
  loadMarkdown: (md: string) => void
  getHTML: () => Promise<string> | string
  getEditor: () => Editor | null
  insert: (md: string) => void
  destroy: () => void
}

export const milkApi: MilkdownApi = {
  instance: refLike(milkObs, 'instance'),
  isReady: refLike(milkObs, 'isReady'),

  async mount(container, defaultValue = '', onChange, onUpload) {
    const inst = await createEditor(container, defaultValue, { onChange, onUpload })
    milkObs.set({ instance: inst, isReady: true })
    // Opt-in handle so automated probes can drive the editor. Only exposed when the
    // URL carries `?e2e=1`, so it has no effect in normal use or production.
    if (typeof location !== 'undefined' && location.search.includes('e2e=1')) {
      ;(window as unknown as { __typo?: EditorInstance }).__typo = inst
    }
  },

  getMarkdown: () => milkObs.get().instance?.getMarkdown() ?? '',

  loadMarkdown: (md: string) => {
    milkObs.get().instance?.loadMarkdown(md)
  },

  getHTML: () => milkObs.get().instance?.getHTML() ?? '',

  getEditor: () => milkObs.get().instance?.getEditor() ?? null,

  insert: (md: string) => {
    milkObs.get().instance?.insert(md)
  },

  destroy: () => {
    milkObs.get().instance?.destroy()
    milkObs.set({ instance: null, isReady: false })
  },
}

export function useMilkdown(): MilkdownApi {
  useStoreSubscription(milkObs)
  return milkApi
}
