/**
 * Sequence guard for asynchronous editor mounts.
 *
 * `createEditor` is async (Crepe builds its DOM and plugins across several
 * microtasks), so React 18 StrictMode's mount → cleanup → mount cycle starts a
 * *second* mount before the first one has resolved — and the cleanup's
 * `destroy()` is a no-op at that point because the store is still empty. Both
 * editors then land in the same container: the page shows the document twice,
 * and every handle / coordinate probe (`document.querySelector` for the block
 * handle, `getEditor()`, `posAtCoords`) resolves against the wrong instance —
 * the orphaned first copy's handles stop responding and menus open at the
 * wrong block.
 *
 * Each `mount()` takes a sequence token; `invalidate()` retires every
 * outstanding token. A mount whose token is stale when its editor resolves
 * discards its own instance instead of publishing it, so exactly one editor
 * ever survives.
 */
export interface MountSequence {
  /** Claim the next token — call this when a mount starts. */
  next: () => number
  /** Whether `token` still belongs to the newest mount (false = stale). */
  isCurrent: (token: number) => boolean
  /** Retire every outstanding token (destroy / a newer mount superseded them). */
  invalidate: () => void
}

export function createMountSequence(): MountSequence {
  let seq = 0
  return {
    next: () => {
      seq += 1
      return seq
    },
    isCurrent: (token: number) => token === seq,
    invalidate: () => {
      seq += 1
    },
  }
}
