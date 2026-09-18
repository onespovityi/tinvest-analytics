const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

export interface CashFlow {
  /** Лет от сегодняшнего дня. */
  t: number
  amount: number
}

export interface BondMetrics {
  /** Доходность к погашению, % годовых (в валюте номинала). */
  ytm: number
  /** Дюрация Маколея, лет. */
  macaulay: number
  /** Модифицированная дюрация: на сколько % изменится цена при сдвиге доходности на 1 п.п. */
  modified: number
}

export function yearsFrom(now: Date, date: string | Date): number {
  return (new Date(date).getTime() - now.getTime()) / YEAR_MS
}

function presentValue(rate: number, flows: CashFlow[]): number {
  return flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + rate, f.t), 0)
}

/**
 * YTM бисекцией по «грязной» цене (цена + НКД): ищем ставку, при которой дисконтированные
 * купоны и номинал равны тому, что платим сегодня. Дюрация — по найденной ставке.
 */
export function bondMetrics(dirtyPrice: number, flows: CashFlow[]): BondMetrics | null {
  const future = flows.filter((f) => f.t > 0 && f.amount > 0)
  if (dirtyPrice <= 0 || future.length === 0) return null

  let lo = -0.5
  let hi = 2
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (presentValue(mid, future) > dirtyPrice) lo = mid
    else hi = mid
  }
  const ytm = (lo + hi) / 2
  const macaulay = future.reduce((acc, f) => acc + (f.t * f.amount) / Math.pow(1 + ytm, f.t), 0) / dirtyPrice
  return { ytm: ytm * 100, macaulay, modified: macaulay / (1 + ytm) }
}
