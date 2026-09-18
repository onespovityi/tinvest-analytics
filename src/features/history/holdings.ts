import type { Operation } from '../operations/model'
import type { Position } from '../portfolio/model'

/** Ключ дня в UTC: 2026-09-18. Свечи и операции API тоже отдаёт в UTC. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function shiftDay(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return dayKey(d)
}

/** Список дней от `from` до `to` включительно. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = shiftDay(day, 1)) days.push(day)
  return days
}

/** Состояние на конец дня: сколько каких бумаг и сколько денег в каждой валюте. */
export interface DaySnapshot {
  day: string
  quantities: Map<string, number>
  cash: Map<string, number>
}

const BUY = /OPERATION_TYPE_BUY/
const SELL = /OPERATION_TYPE_SELL/
const FULL_REPAYMENT = /BOND_REPAYMENT_FULL/
const SECURITIES_IN = /INPUT_SECURITIES/
const SECURITIES_OUT = /OUTPUT_SECURITIES/

/** На сколько штук операция изменила позицию (в прямом направлении времени). */
function quantityDelta(op: Operation): number {
  if (BUY.test(op.type) || SECURITIES_IN.test(op.type)) return op.quantity
  if (SELL.test(op.type) || FULL_REPAYMENT.test(op.type) || SECURITIES_OUT.test(op.type)) return -op.quantity
  return 0
}

/** Код валюты по тикеру валютной позиции: RUB000UTSTOM → rub, CNYRUB_TOM_CETS → cny. */
export function currencyOfTicker(ticker: string | undefined): string {
  return (ticker ?? 'RUB').slice(0, 3).toLowerCase()
}

/**
 * Восстанавливает позиции и остатки на каждый день, двигаясь от сегодняшнего портфеля назад
 * и откатывая операции. Так сегодняшняя точка всегда совпадает с реальностью,
 * а неучтённые типы операций портят только далёкое прошлое, не настоящее.
 */
export function buildSnapshots(
  positions: Position[],
  operations: Operation[],
  currencyOfInstrument: (uid: string) => string | undefined,
  today: string,
): DaySnapshot[] {
  const quantities = new Map<string, number>()
  const cash = new Map<string, number>()

  // одна бумага может ходить под разными instrumentUid (в сделках один, в портфеле и купонах другой),
  // а positionUid у неё общий — приводим всё к uid из портфеля, а если бумаги уже нет, к первому встреченному
  const canonicalUid = new Map<string, string>()
  for (const p of positions) canonicalUid.set(p.positionUid, p.instrumentUid)
  for (const op of operations) {
    if (op.positionUid && !canonicalUid.has(op.positionUid)) canonicalUid.set(op.positionUid, op.instrumentUid)
  }
  const uidOf = (op: Operation) => canonicalUid.get(op.positionUid) ?? op.instrumentUid

  for (const p of positions) {
    if (p.instrumentType === 'currency') {
      const cur = currencyOfTicker(p.ticker)
      cash.set(cur, (cash.get(cur) ?? 0) + p.quantity)
    } else {
      quantities.set(p.instrumentUid, (quantities.get(p.instrumentUid) ?? 0) + p.quantity)
    }
  }

  const byDay = new Map<string, Operation[]>()
  let firstDay = today
  for (const op of operations) {
    const day = dayKey(op.date)
    if (day < firstDay) firstDay = day
    const list = byDay.get(day)
    if (list) list.push(op)
    else byDay.set(day, [op])
  }

  const snapshots: DaySnapshot[] = []
  for (let day = today; day >= firstDay; day = shiftDay(day, -1)) {
    snapshots.push({ day, quantities: new Map(quantities), cash: new Map(cash) })

    // откатываем операции этого дня → получаем состояние на конец предыдущего
    for (const op of byDay.get(day) ?? []) {
      const cur = op.currency.toLowerCase()
      cash.set(cur, (cash.get(cur) ?? 0) - op.payment)

      const delta = quantityDelta(op)
      if (delta === 0) continue
      if (op.instrumentType === 'currency') {
        // покупка валюты — это перекладывание денег из одной валюты в другую
        const bought = currencyOfInstrument(op.instrumentUid)
        if (bought) cash.set(bought, (cash.get(bought) ?? 0) - delta)
      } else {
        const uid = uidOf(op)
        quantities.set(uid, (quantities.get(uid) ?? 0) - delta)
      }
    }
  }

  return snapshots.reverse()
}
