import { useSyncExternalStore } from 'react'

export interface Progress {
  done: number
  total: number
  stage: string
}

/**
 * Прогресс долгих загрузок скринера. queryFn живёт вне React, поэтому обычный state не подходит —
 * крошечное внешнее хранилище с подпиской.
 */
const state = new Map<string, Progress>()
const listeners = new Set<() => void>()
const EMPTY: Progress = { done: 0, total: 0, stage: '' }

export function setProgress(key: string, progress: Progress) {
  state.set(key, progress)
  for (const l of listeners) l()
}

export function useProgress(key: string): Progress {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state.get(key) ?? EMPTY,
  )
}
