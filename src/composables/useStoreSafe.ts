import { useSyncExternalStore } from 'react'

/** Minimal external-store contract shared by the React port's singletons. */
export interface ExternalStore<T> {
  getState: () => T
  subscribe: (listener: () => void) => () => void
}

/**
 * Subscribe to an external store during React render; fall back to a plain
 * snapshot when called outside React (e.g. from the framework-agnostic action
 * layer, which runs at event-handler time and therefore can never use hooks).
 *
 * This lets a single `useX()` accessor be called safely from both contexts,
 * which is required because the preserved `src/commands/actions.ts` invokes
 * `useMilkdown()` / `useSettingsStore()` / `useUI()` at runtime.
 */
export function useStoreSafe<T>(store: ExternalStore<T>): T {
  try {
    return useSyncExternalStore(store.subscribe, store.getState, store.getState)
  } catch {
    return store.getState()
  }
}

/** A tiny observable holding a plain-object state, with ref-like value accessors. */
export interface Observable<T> {
  get: () => T
  set: (partial: Partial<T>) => void
  subscribe: (listener: () => void) => () => void
}

/** Create an observable store. `set` is a no-op when nothing actually changed. */
export function makeReactive<T extends object>(initial: T): Observable<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set: (partial) => {
      let changed = false
      for (const k in partial) {
        if ((partial as Record<string, unknown>)[k] !== (state as Record<string, unknown>)[k]) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...partial }
      listeners.forEach((l) => l())
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

/**
 * Expose a store field as a `{ value }` ref-like object whose getter/setter read
 * and write the underlying observable. Keeps the previous Vue `ref.value` API so
 * the preserved action layer (`ui.sourceMode.value = true`, …) keeps working.
 */
export function refLike<T, K extends keyof T>(obs: Observable<T>, key: K) {
  return {
    get value(): T[K] {
      return obs.get()[key]
    },
    set value(v: T[K]) {
      obs.set({ [key]: v } as unknown as Partial<T>)
    },
  }
}

/** Subscribe to an observable from a React component (no-op outside React). */
export function useStoreSubscription<T>(obs: Observable<T>): void {
  try {
    useSyncExternalStore(obs.subscribe, obs.get, obs.get)
  } catch {
    /* called outside React render — safe to ignore */
  }
}
