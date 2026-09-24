import { useCallback, useEffect, useState } from 'react'

/** Точка отсчёта для «с прошлого визита». */
const SINCE_KEY = 'tinvest-analytics:visit-since'
/** Когда страницу видели в последний раз — обновляется, пока она открыта, и при уходе. */
const SEEN_KEY = 'tinvest-analytics:visit-seen'
/** Отлучился меньше чем на полчаса — это ещё тот же визит, точку отсчёта не двигаем. */
const BREAK_MS = 30 * 60 * 1000
/** Первый запуск: показываем, что было за последнюю неделю, а не пустой экран. */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const HEARTBEAT_MS = 60 * 1000

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

/**
 * Дата прошлого визита; в первый раз — неделя назад, чтобы свежие выплаты и сделки не потерялись.
 * Новый визит начинается, если страницу не видели дольше получаса: точкой отсчёта становится
 * момент, когда её видели в последний раз.
 */
export function useLastVisit(): { since: Date | null; markSeen: () => void } {
  const [since, setSince] = useState<Date | null>(() => {
    const seen = read(SEEN_KEY)
    const stored = read(SINCE_KEY)
    if (seen && Date.now() - seen.getTime() > BREAK_MS) return seen
    return stored ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS)
  })

  useEffect(() => {
    if (since) write(SINCE_KEY, since)
    const touch = () => write(SEEN_KEY, new Date())
    touch()
    const timer = setInterval(touch, HEARTBEAT_MS)
    const onHide = () => {
      if (document.visibilityState === 'hidden') touch()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', touch)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', touch)
    }
  }, [since])

  const markSeen = useCallback(() => {
    const now = new Date()
    write(SINCE_KEY, now)
    setSince(now)
  }, [])

  return { since, markSeen }
}
