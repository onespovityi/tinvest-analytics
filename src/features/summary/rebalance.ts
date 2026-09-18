import type { InstrumentInfo } from '../../api/instruments'
import type { Position, PortfolioSummary } from '../portfolio/model'
import { TARGET_TYPES, type TargetType, type Targets } from './targets'

/** Отклонение больше этого (в процентных пунктах) — уже повод действовать. */
export const DRIFT_THRESHOLD = 3

export interface TypeDrift {
  type: TargetType
  target: number
  actual: number
  /** actual − target, п.п. */
  drift: number
  /** Сколько рублей не хватает до цели (плюс) или лишних (минус). */
  gap: number
}

export interface Suggestion {
  kind: 'buy' | 'sell'
  type: TargetType
  amount: number
  /** Конкретная бумага — самая крупная позиция этого типа; может не быть, если тип пустой. */
  position?: Position
  info?: InstrumentInfo
  lots?: number
  /** Покупка на свободные деньги, а не за счёт продажи чего-то. */
  fromCash: boolean
}

export interface Rebalance {
  drifts: TypeDrift[]
  freeCash: number
  suggestions: Suggestion[]
}

/** Сколько лотов бумаги можно купить на сумму, и сколько это будет стоить. */
function lotsFor(position: Position, info: InstrumentInfo | undefined, amount: number): { lots: number; cost: number } {
  const lot = Math.max(1, info?.lot ?? 1)
  const unitPrice = position.currentPrice + position.nkd
  const lotPrice = unitPrice * lot
  if (lotPrice <= 0) return { lots: 0, cost: 0 }
  const lots = Math.floor(amount / lotPrice)
  return { lots, cost: lots * lotPrice }
}

function largestOfType(positions: Position[], type: TargetType): Position | undefined {
  return positions.filter((p) => p.instrumentType === type && p.currency.toLowerCase() === 'rub').sort((a, b) => b.value - a.value)[0]
}

/**
 * План ребалансировки по типам активов.
 * Сначала тратим свободные рубли на самые «недокупленные» типы (пропорционально недобору),
 * и только если после этого отклонение всё ещё больше порога — предлагаем продажи.
 */
export function rebalance(summary: PortfolioSummary, targets: Targets, instruments: Map<string, InstrumentInfo>): Rebalance {
  const total = summary.total
  const drifts: TypeDrift[] = TARGET_TYPES.map((type) => {
    const actual = total > 0 ? (summary.byType[type] / total) * 100 : 0
    const target = targets[type]
    return { type, target, actual, drift: actual - target, gap: (target / 100) * total - summary.byType[type] }
  })

  const freeCash = Object.values(summary.cashByAccount).reduce((a, b) => a + (b ?? 0), 0)
  const suggestions: Suggestion[] = []

  // деньги сверх целевой доли кэша — то, что можно инвестировать
  const cashTarget = (targets.currency / 100) * total
  let spendable = Math.max(0, freeCash - cashTarget)
  const deficits = drifts.filter((d) => d.type !== 'currency' && d.gap > 0)
  const totalDeficit = deficits.reduce((acc, d) => acc + d.gap, 0)

  if (spendable > 0 && totalDeficit > 0) {
    const budget = Math.min(spendable, totalDeficit)
    for (const d of deficits.sort((a, b) => b.gap - a.gap)) {
      const amount = (budget * d.gap) / totalDeficit
      const position = largestOfType(summary.positions, d.type)
      const info = position ? instruments.get(position.instrumentUid) : undefined
      const lots = position ? lotsFor(position, info, amount) : undefined
      if (lots && lots.lots === 0) continue
      suggestions.push({ kind: 'buy', type: d.type, amount: lots ? lots.cost : amount, position, info, lots: lots?.lots, fromCash: true })
      spendable -= lots ? lots.cost : amount
    }
  }

  // что останется перекошенным после покупок на кэш — уже через продажу
  for (const d of drifts) {
    if (d.type === 'currency') continue
    const bought = suggestions.filter((s) => s.type === d.type && s.fromCash).reduce((acc, s) => acc + s.amount, 0)
    const remainingGap = d.gap - bought
    const remainingDrift = total > 0 ? (-remainingGap / total) * 100 : 0
    if (Math.abs(remainingDrift) < DRIFT_THRESHOLD) continue
    const position = largestOfType(summary.positions, d.type)
    const info = position ? instruments.get(position.instrumentUid) : undefined
    const amount = Math.abs(remainingGap)
    const lots = position ? lotsFor(position, info, amount) : undefined
    suggestions.push({
      kind: remainingGap > 0 ? 'buy' : 'sell',
      type: d.type,
      amount: lots && lots.lots > 0 ? lots.cost : amount,
      position,
      info,
      lots: lots?.lots,
      fromCash: false,
    })
  }

  return { drifts, freeCash, suggestions }
}
