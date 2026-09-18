import { useCallback, useState } from 'react'
import type { InstrumentType } from '../../api/types'
import type { PortfolioSummary } from '../portfolio/model'

/** Типы, по которым держим целевые доли. Остальное (фьючерсы, опционы) — «прочее», без цели. */
export const TARGET_TYPES = ['bond', 'etf', 'share', 'currency'] as const
export type TargetType = (typeof TARGET_TYPES)[number]

export const TARGET_LABELS: Record<TargetType, string> = {
  bond: 'Облигации',
  etf: 'Фонды',
  share: 'Акции',
  currency: 'Деньги',
}

/** Целевые доли в процентах; в сумме должно быть 100. */
export type Targets = Record<TargetType, number>

const STORAGE_KEY = 'tinvest-analytics:targets'

export function isTargetType(type: InstrumentType): type is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(type)
}

/** Стартовые цели — текущая структура, округлённая до процента: пока ничего не менял, действий нет. */
export function targetsFromActual(summary: PortfolioSummary): Targets {
  const total = summary.total || 1
  const raw = TARGET_TYPES.map((t) => (summary.byType[t] / total) * 100)
  const rounded = raw.map(Math.round)
  // округление может дать 99 или 101 — правим самую большую долю
  const diff = 100 - rounded.reduce((a, b) => a + b, 0)
  const largest = rounded.indexOf(Math.max(...rounded))
  rounded[largest] += diff
  return Object.fromEntries(TARGET_TYPES.map((t, i) => [t, rounded[i]])) as Targets
}

function load(): Targets | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Targets) : null
  } catch {
    return null
  }
}

export function useTargets(): [Targets | null, (targets: Targets) => void] {
  const [targets, setTargets] = useState<Targets | null>(load)
  const save = useCallback((next: Targets) => {
    setTargets(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // нет хранилища — живём в памяти до перезагрузки
    }
  }, [])
  return [targets, save]
}
