import { ref } from 'vue'

// Shared UI visibility state (source mode + the two optional dialogs).
// Module-level singleton so any component can open/close without prop-drilling.
// Sidebar / recovery / quick-open / command-palette / status-bar state belonged
// to the desktop shell and is intentionally not part of this package.
const settingsOpen = ref(false)
const sourceMode = ref(false)
const findOpen = ref(false)

export function useUI() {
  return {
    settingsOpen,
    sourceMode,
    findOpen,

    openSettings: () => (settingsOpen.value = true),
    closeSettings: () => (settingsOpen.value = false),

    toggleSourceMode: () => (sourceMode.value = !sourceMode.value),
    openSourceMode: () => (sourceMode.value = true),
    closeSourceMode: () => (sourceMode.value = false),

    openFind: () => (findOpen.value = true),
    closeFind: () => (findOpen.value = false),
  }
}
