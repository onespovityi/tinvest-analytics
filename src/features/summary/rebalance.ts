import type { InstrumentInfo } from '../../api/instruments'
import type { Position, PortfolioSummary } from '../portfolio/model'
import { TARGET_TYPES, type TargetType, type Targets } from './targets'

/** Отклонение больше этого (в процентных пунктах) — уже повод действовать. */
export const DRIFT_THRESHOLD = 3

/** Сделки мельче этого не предлагаем — комиссия и внимание дороже. */
const MIN_TRADE = 1000

/** Больше перекладок за один визит — уже не план, а суета. */
const MAX_SWAPS = 3

export interface TypeDrift {
  type: TargetType
  target: number
  actual: number
  /** actual − target, п.п. */
  drift: number
  /** Сколько рублей не хватает до цели (плюс) или лишних (минус). */
  gap: number
}

/** Одна сторона действия: что и на сколько. Бумага — самая крупная позиция типа; может не быть. */
export interface Leg {
  type: TargetType
  amount: number
  position?: Position
  info?: InstrumentInfo
  lots?: number
}

export type Suggestion =
  /** Покупка на свободные деньги. */
  | { kind: 'buy'; buy: Leg }
  /** Денег нет — перекладываем: продаём перевешенное, покупаем недостающее. */
  | { kind: 'swap'; sell: Leg; buy: Leg }

export interface Rebalance {
  drifts: TypeDrift[]
  freeCash: number
  suggestions: Suggestion[]
}

function largestOfType(positions: Position[], type: TargetType): Position | undefined {
  return positions.filter((p) => p.instrumentType === type && p.currency.toLowerCase() === 'rub').sort((a, b) => b.value - a.value)[0]
}

/** Сколько целых лотов бумаги укладывается в сумму, и сколько это стоит на самом деле. */
function makeLeg(type: TargetType, amount: number, positions: Position[], instruments: Map<string, InstrumentInfo>): Leg {
  const position = largestOfType(positions, type)
  if (!position) return { type, amount }
  const info = instruments.get(position.instrumentUid)
  const lotPrice = (position.currentPrice + position.nkd) * Math.max(1, info?.lot ?? 1)
  const lots = lotPrice > 0 ? Math.floor(amount / lotPrice) : 0
  return { type, amount: lots > 0 ? lots * lotPrice : amount, position, info, lots }
}

/**
 * План ребалансировки по типам активов.
 * 1. Свободные рубли сверх целевой доли кэша тратим на самые «недокупленные» типы (пропорционально недобору).
 * 2. Если после этого какой-то тип всё ещё отклонён больше порога — перекладки (до трёх):
 *    продать самый перевешенный тип, купить самый недовешенный, на одну и ту же сумму.
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
  // остаток недобора/перебора после покупок на кэш — по нему решаем про перекладку
  const remaining = new Map<TargetType, number>(drifts.map((d) => [d.type, d.gap]))

  const spendable = Math.max(0, freeCash - (targets.currency / 100) * total)
  const deficits = drifts.filter((d) => d.type !== 'currency' && d.gap > 0).sort((a, b) => b.gap - a.gap)
  const totalDeficit = deficits.reduce((acc, d) => acc + d.gap, 0)

  if (spendable > 0 && totalDeficit > 0) {
    const budget = Math.min(spendable, totalDeficit)
    for (const d of deficits) {
      const leg = makeLeg(d.type, (budget * d.gap) / totalDeficit, summary.positions, instruments)
      if (leg.lots === 0 || leg.amount < MIN_TRADE) continue
      suggestions.push({ kind: 'buy', buy: leg })
      remaining.set(d.type, d.gap - leg.amount)
    }
    // денег мало и в долях они размазались на суммы меньше лота — тогда всё на самый недовешенный тип
    if (suggestions.length === 0) {
      for (const d of deficits) {
        const leg = makeLeg(d.type, budget, summary.positions, instruments)
        if (leg.lots === 0) continue
        suggestions.push({ kind: 'buy', buy: leg })
        remaining.set(d.type, d.gap - leg.amount)
        break
      }
    }
  }

  // перекладки: самый перевешенный тип → самый недовешенный, пока отклонение больше порога
  const securities = drifts.filter((d) => d.type !== 'currency').map((d) => d.type)
  for (let i = 0; i < MAX_SWAPS; i++) {
    const ranked = securities.map((type) => ({ type, gap: remaining.get(type) ?? 0 })).sort((a, b) => b.gap - a.gap)
    const sink = ranked[0]
    const source = ranked[ranked.length - 1]
    if (!sink || !source || sink.gap <= 0 || source.gap >= 0) break
    const worstDrift = (Math.max(sink.gap, -source.gap) / (total || 1)) * 100
    if (worstDrift < DRIFT_THRESHOLD) break

    const amount = Math.min(sink.gap, -source.gap)
    if (amount < MIN_TRADE) break
    const buy = makeLeg(sink.type, amount, summary.positions, instruments)
    if (buy.lots === 0) break
    // продаём ровно на столько, сколько реально стоит покупка целыми лотами
    const sell = makeLeg(source.type, buy.amount, summary.positions, instruments)
    suggestions.push({ kind: 'swap', sell, buy })
    remaining.set(sink.type, sink.gap - buy.amount)
    remaining.set(source.type, source.gap + buy.amount)
  }

  return { drifts, freeCash, suggestions }
}
