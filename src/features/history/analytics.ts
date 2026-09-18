import { monthKey } from '../../api/money'
import { externalFlow, type Operation } from '../operations/model'
import { dayKey, type DaySnapshot } from './holdings'
import { rateOn, valueOn, type PriceBook, type PriceSeries } from './pricing'

export interface HistoryPoint {
  day: string
  date: Date
  /** Стоимость портфеля в рублях. */
  value: number
  /** Внесено минус выведено, нарастающим итогом. */
  invested: number
  /** Внешний денежный поток за день (пополнения − выводы). */
  flow: number
}

/** Внешние потоки по дням в рублях по курсу на день. */
function flowsByDay(operations: Operation[], book: PriceBook): Map<string, number> {
  const flows = new Map<string, number>()
  for (const op of operations) {
    const flow = externalFlow(op)
    if (flow === 0) continue
    const day = dayKey(op.date)
    flows.set(day, (flows.get(day) ?? 0) + flow * rateOn(book, op.currency, day))
  }
  return flows
}

/**
 * Дневная серия стоимости и вложений. Последняя точка — фактическая стоимость портфеля
 * из API, а не пересчёт по свечам: так график всегда заканчивается реальной цифрой.
 */
export function buildHistory(snapshots: DaySnapshot[], operations: Operation[], book: PriceBook, todayValue: number): HistoryPoint[] {
  const flows = flowsByDay(operations, book)
  let invested = 0
  return snapshots.map((snap, i) => {
    const flow = flows.get(snap.day) ?? 0
    invested += flow
    const isLast = i === snapshots.length - 1
    return {
      day: snap.day,
      date: new Date(`${snap.day}T00:00:00Z`),
      value: isLast ? todayValue : valueOn(book, snap.quantities, snap.cash, snap.day),
      invested,
      flow,
    }
  })
}

export interface Performance {
  /** Взвешенная по времени доходность за период, %. Не зависит от того, когда вносили деньги. */
  twr: number
  /** Та же доходность в годовом выражении, %; null — если период короче месяца. */
  twrAnnual: number | null
  /** Максимальная просадка индекса TWR, % (отрицательное число). */
  maxDrawdown: number
  days: number
}

/**
 * TWR: перемножаем дневные доходности, очищенные от внешних потоков.
 * Поток учитываем как пришедший в начале дня: r = V_t / (V_{t-1} + F_t) − 1.
 */
export function performance(points: HistoryPoint[]): Performance | null {
  if (points.length < 2) return null
  let index = 1
  let peak = 1
  let maxDrawdown = 0
  let largest = 0
  for (let i = 1; i < points.length; i++) {
    const base = points[i - 1].value + points[i].flow
    largest = Math.max(largest, points[i - 1].value)
    // счёт пустой или почти пустой (после полного вывода остаются копейки) — дневная доходность
    // тут бессмысленна и может дать −100 %, такие дни пропускаем
    if (base <= 0 || base < largest * 0.01 || points[i].value <= 0) continue
    index *= points[i].value / base
    if (index > peak) peak = index
    const drawdown = (index / peak - 1) * 100
    if (drawdown < maxDrawdown) maxDrawdown = drawdown
  }
  const days = (points[points.length - 1].date.getTime() - points[0].date.getTime()) / (24 * 60 * 60 * 1000)
  const twr = (index - 1) * 100
  const twrAnnual = days >= 30 ? (Math.pow(index, 365.25 / days) - 1) * 100 : null
  return { twr, twrAnnual, maxDrawdown, days }
}

export interface MonthResult {
  month: Date
  /** Изменение прибыли (стоимость − вложения) за месяц. */
  profit: number
}

/** Результат по месяцам: насколько выросла прибыль относительно конца предыдущего месяца. */
export function monthlyResults(points: HistoryPoint[]): MonthResult[] {
  const lastOfMonth = new Map<string, HistoryPoint>()
  for (const p of points) lastOfMonth.set(monthKey(p.date), p)

  const results: MonthResult[] = []
  let prevProfit = 0
  let first = true
  for (const [key, p] of lastOfMonth) {
    const profit = p.value - p.invested
    // в первом месяце «предыдущей прибыли» нет — считаем от нуля
    results.push({ month: new Date(`${key}-01T00:00:00Z`), profit: first ? profit : profit - prevProfit })
    prevProfit = profit
    first = false
  }
  return results
}

/**
 * «А если бы всё в X»: каждое пополнение покупает бенчмарк по цене того дня,
 * каждый вывод — продаёт. Получаем стоимость такого портфеля на каждый день.
 */
export function benchmarkSeries(points: HistoryPoint[], prices: PriceSeries): (number | null)[] {
  let units = 0
  return points.map((p) => {
    const price = prices.at(p.day)
    if (price === undefined || price <= 0) return null
    // вывести больше, чем есть, нельзя: если реальный портфель обогнал бенчмарк и деньги сняли,
    // у бенчмарка просто заканчиваются паи
    if (p.flow !== 0) units = Math.max(0, units + p.flow / price)
    return units * price
  })
}
