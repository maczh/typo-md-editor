import { makeReactive, refLike, useStoreSubscription } from '@/composables/useStoreSafe'

// Shared UI visibility state (source mode + the two optional dialogs).
// Module-level singleton so any component can open/close without prop-drilling.
// Sidebar / recovery / quick-open / command-palette / status-bar state belonged
// to the desktop shell and is intentionally not part of this package.
interface UiState {
  settingsOpen: boolean
  sourceMode: boolean
  findOpen: boolean
}

const uiObs = makeReactive<UiState>({
  settingsOpen: false,
  sourceMode: false,
  findOpen: false,
})

export interface UiApi {
  settingsOpen: { value: boolean }
  sourceMode: { value: boolean }
  findOpen: { value: boolean }
  openSettings: () => void
  closeSettings: () => void
  toggleSourceMode: () => void
  openSourceMode: () => void
  closeSourceMode: () => void
  openFind: () => void
  closeFind: () => void
}

export const uiApi: UiApi = {
  settingsOpen: refLike(uiObs, 'settingsOpen'),
  sourceMode: refLike(uiObs, 'sourceMode'),
  findOpen: refLike(uiObs, 'findOpen'),
  openSettings: () => uiObs.set({ settingsOpen: true }),
  closeSettings: () => uiObs.set({ settingsOpen: false }),
  toggleSourceMode: () => uiObs.set({ sourceMode: !uiObs.get().sourceMode }),
  openSourceMode: () => uiObs.set({ sourceMode: true }),
  closeSourceMode: () => uiObs.set({ sourceMode: false }),
  openFind: () => uiObs.set({ findOpen: true }),
  closeFind: () => uiObs.set({ findOpen: false }),
}

export function useUI(): UiApi {
  // Subscribe during render so dialogs / source view appear; harmless outside React.
  useStoreSubscription(uiObs)
  return uiApi
}
