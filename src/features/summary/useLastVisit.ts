import { useState } from 'react'

const LAST_KEY = 'tinvest-analytics:last-visit'
const CURRENT_KEY = 'tinvest-analytics:current-visit'
/** Перезагрузки в течение получаса — тот же визит, «с прошлого раза» не сдвигаем. */
const SESSION_MS = 30 * 60 * 1000

function read(key: string): Date | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Date(raw) : null
  } catch {
    return null
  }
}

function write(key: string, date: Date) {
  try {
    localStorage.setItem(key, date.toISOString())
  } catch {
    // без хранилища просто не запомним
  }
}

/** Дата прошлого визита (null — первый раз). Текущий визит фиксируется при первом вызове. */
export function useLastVisit(): Date | null {
  const [since] = useState<Date | null>(() => {
    const now = new Date()
    const current = read(CURRENT_KEY)
    if (current && now.getTime() - current.getTime() < SESSION_MS) return read(LAST_KEY)
    if (current) write(LAST_KEY, current)
    write(CURRENT_KEY, now)
    return current ?? read(LAST_KEY)
  })
  return since
}
