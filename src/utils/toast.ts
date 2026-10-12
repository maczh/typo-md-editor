// Lightweight global toast used by the action layer's error handling and elsewhere.
// Appends DOM nodes directly (no Vue reactivity needed) so it works from any layer.

export type ToastType = 'info' | 'error'

let container: HTMLElement | null = null

function ensureContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-wrap'
    document.body.appendChild(container)
  }
  return container
}

export function showToast(message: string, type: ToastType = 'info'): void {
  const wrap = ensureContainer()
  const el = document.createElement('div')
  el.className = `toast${type === 'error' ? ' error' : ''}`
  el.textContent = message
  wrap.appendChild(el)
  window.setTimeout(() => {
    el.remove()
  }, 3200)
}
