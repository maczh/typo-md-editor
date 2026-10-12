/**
 * Clipboard access for the editor's cut / copy / paste buttons — browser
 * environment (no desktop runtime).
 *
 * Why this exists instead of a one-liner `document.execCommand('copy')`:
 *
 *  - `document.execCommand('paste')` is **disabled** in WebKit (and Blink, and
 *    Gecko). It never throws, it just returns `false`, so a `try/catch` around it
 *    silently does nothing — which is exactly how the paste button ended up dead.
 *  - `execCommand('cut'/'copy')` only work on the *live DOM selection* of a
 *    focused element. The menus are `Teleport`ed overlays outside the editor DOM,
 *    so by the time the item is clicked the DOM selection no longer matches
 *    ProseMirror's — the command is a no-op.
 *  - `navigator.clipboard.readText()` needs a `clipboard-read` permission that
 *    browsers may deny outside a secure context / without a user gesture.
 *
 * So: prefer the async clipboard API (works in a browser / secure context), and
 * fall back to the legacy hidden-textarea trick (write-only).
 */

/** Write `text` to the system clipboard. Resolves to false when nothing worked. */
export async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* insecure context or denied permission */
    }
  }

  return legacyWrite(text)
}

/** Read the system clipboard as plain text, or `null` when unavailable. */
export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText()
    } catch {
      /* denied */
    }
  }

  return null
}

/**
 * Last-resort write path: a temporary off-screen textarea owns the DOM selection,
 * and `execCommand('copy')` copies from it. Reliable regardless of what the
 * editor's own selection state is.
 */
function legacyWrite(text: string): boolean {
  if (typeof document === 'undefined') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('aria-hidden', 'true')
  area.setAttribute('tabindex', '-1')
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none'
  document.body.appendChild(area)
  const previous = document.activeElement as HTMLElement | null
  area.focus()
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  } finally {
    area.remove()
    previous?.focus?.()
  }
  return ok
}
