import { toNumber } from '../../api/money'
import type { AccountKey, InstrumentType, PortfolioResponse } from '../../api/types'
import type { ScopedResult } from '../../shared/account/useScopedQueries'

/** Позиция в числах, уже слитая по счетам (если выбрано «Всего»). */
export interface Position {
  instrumentUid: string
  /** Одна бумага может встречаться под разными instrumentUid; positionUid у неё один. */
  positionUid: string
  figi: string
  ticker?: string
  instrumentType: InstrumentType
  currency: string
  quantity: number
  avgPrice: number
  currentPrice: number
  /** Накопленный купонный доход на одну бумагу (только облигации). */
  nkd: number
  /** Стоимость позиции с учётом НКД. */
  value: number
  expectedYield: number
  dailyYield: number
  accounts: AccountKey[]
}

export interface PortfolioSummary {
  total: number
  byType: Record<InstrumentType, number>
  /** Свободные рубли на каждом счёте — то, что можно потратить прямо сейчас. */
  cashByAccount: Partial<Record<AccountKey, number>>
  expectedYieldPct: number
  dailyYield: number
  dailyYieldPct: number
  positions: Position[]
}

/** Дневное изменение позиции в процентах: вчерашняя стоимость — это сегодняшняя минус прирост. */
export function dailyPercent(position: Position): number {
  const yesterday = position.value - position.dailyYield
  return yesterday > 0 ? (position.dailyYield / yesterday) * 100 : 0
}

export const TYPE_LABELS: Record<InstrumentType, string> = {
  share: 'Акции',
  bond: 'Облигации',
  etf: 'Фонды',
  currency: 'Валюта',
  futures: 'Фьючерсы',
  option: 'Опционы',
  sp: 'Структурные',
}

function mergePosition(into: Position, add: Position): Position {
  const quantity = into.quantity + add.quantity
  return {
    ...into,
    quantity,
    avgPrice: quantity > 0 ? (into.avgPrice * into.quantity + add.avgPrice * add.quantity) / quantity : 0,
    value: into.value + add.value,
    expectedYield: into.expectedYield + add.expectedYield,
    dailyYield: into.dailyYield + add.dailyYield,
    accounts: [...into.accounts, ...add.accounts],
  }
}

/** Сводит ответы GetPortfolio по одному или нескольким счетам в единую картину. */
export function buildSummary(entries: ScopedResult<PortfolioResponse>[]): PortfolioSummary {
  const byType: Record<InstrumentType, number> = {
    share: 0,
    bond: 0,
    etf: 0,
    currency: 0,
    futures: 0,
    option: 0,
    sp: 0,
  }
  const positionsByUid = new Map<string, Position>()
  const cashByAccount: Partial<Record<AccountKey, number>> = {}
  let total = 0
  let yieldWeighted = 0
  let dailyYield = 0
  let dailyWeighted = 0

  for (const { account, data } of entries) {
    const accountTotal = toNumber(data.totalAmountPortfolio)
    total += accountTotal
    yieldWeighted += toNumber(data.expectedYield) * accountTotal
    dailyYield += toNumber(data.dailyYield)
    dailyWeighted += toNumber(data.dailyYieldRelative) * accountTotal

    byType.share += toNumber(data.totalAmountShares)
    byType.bond += toNumber(data.totalAmountBonds)
    byType.etf += toNumber(data.totalAmountEtf)
    byType.currency += toNumber(data.totalAmountCurrencies)
    byType.futures += toNumber(data.totalAmountFutures)
    byType.option += toNumber(data.totalAmountOptions)
    byType.sp += toNumber(data.totalAmountSp)

    for (const raw of data.positions) {
      const quantity = toNumber(raw.quantity)
      if (raw.instrumentType === 'currency' && raw.ticker?.startsWith('RUB')) {
        cashByAccount[account] = (cashByAccount[account] ?? 0) + quantity
      }
      const currentPrice = toNumber(raw.currentPrice)
      const nkd = toNumber(raw.currentNkd)
      const position: Position = {
        instrumentUid: raw.instrumentUid,
        positionUid: raw.positionUid,
        figi: raw.figi,
        ticker: raw.ticker,
        instrumentType: raw.instrumentType,
        currency: raw.currentPrice.currency,
        quantity,
        avgPrice: toNumber(raw.averagePositionPrice),
        currentPrice,
        nkd,
        value: quantity * (currentPrice + nkd),
        expectedYield: toNumber(raw.expectedYield),
        dailyYield: toNumber(raw.dailyYield),
        accounts: [account],
      }
      const existing = positionsByUid.get(raw.instrumentUid)
      positionsByUid.set(raw.instrumentUid, existing ? mergePosition(existing, position) : position)
    }
  }

  const positions = [...positionsByUid.values()].sort((a, b) => b.value - a.value)

  return {
    total,
    byType,
    cashByAccount,
    expectedYieldPct: total > 0 ? yieldWeighted / total : 0,
    dailyYield,
    dailyYieldPct: total > 0 ? dailyWeighted / total : 0,
    positions,
  }
}
