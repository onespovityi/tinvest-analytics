import { externalFlow, type Operation } from './model'

export interface CashFlow {
  date: Date
  amount: number
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + rate, (f.date.getTime() - t0) / YEAR_MS), 0)
}

/**
 * Внутренняя норма доходности с учётом дат (аналог XIRR в Excel), в процентах годовых.
 * Ньютон с откатом на бисекцию: у денежных потоков портфеля корень почти всегда один,
 * но на коротких историях Ньютон может улететь — бисекция на [-99 %, +1000 %] спасает.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null
  const hasNegative = flows.some((f) => f.amount < 0)
  const hasPositive = flows.some((f) => f.amount > 0)
  if (!hasNegative || !hasPositive) return null

  const t0 = Math.min(...flows.map((f) => f.date.getTime()))
  const f = (r: number) => npv(r, flows, t0)

  let rate = 0.1
  for (let i = 0; i < 50; i++) {
    const value = f(rate)
    const h = 1e-6
    const derivative = (f(rate + h) - value) / h
    if (Math.abs(derivative) < 1e-12) break
    const next = rate - value / derivative
    if (!Number.isFinite(next) || next <= -0.99) break
    if (Math.abs(next - rate) < 1e-8) return next * 100
    rate = next
  }

  let lo = -0.99
  let hi = 10
  if (f(lo) * f(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(lo) * f(mid) <= 0) hi = mid
    else lo = mid
    if (hi - lo < 1e-8) break
  }
  return ((lo + hi) / 2) * 100
}

/**
 * Потоки для XIRR из операций: пополнение — это деньги «из кармана» (минус),
 * вывод — обратно в карман (плюс), плюс текущая стоимость портфеля как финальный «вывод».
 * Считаем только рублёвые потоки — валютные пополнения тут редкость, а курс на дату
 * тянуть отдельно пока не стоит.
 */
export function portfolioXirr(operations: Operation[], currentValue: number): number | null {
  const flows: CashFlow[] = operations
    .filter((op) => op.currency.toLowerCase() === 'rub' && externalFlow(op) !== 0)
    .map((op) => ({ date: op.date, amount: -externalFlow(op) }))

  if (flows.length === 0) return null
  flows.push({ date: new Date(), amount: currentValue })
  return xirr(flows)
}

/** Дата первого пополнения — с неё начинается отсчёт XIRR; на коротких историях цифра годовых мало что значит. */
export function firstCashFlowDate(operations: Operation[]): Date | null {
  let first: Date | null = null
  for (const op of operations) {
    if (externalFlow(op) !== 0 && (!first || op.date < first)) first = op.date
  }
  return first
}
