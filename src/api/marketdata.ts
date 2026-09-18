import { request } from './client'
import type { AccountKey, Candle, Quotation } from './types'

export interface LastPrice {
  figi: string
  instrumentUid: string
  price: Quotation
  time: string
}

export async function getLastPrices(account: AccountKey, instrumentIds: string[]): Promise<LastPrice[]> {
  const res = await request<{ lastPrices: LastPrice[] }>(account, 'MarketDataService', 'GetLastPrices', {
    instrumentId: instrumentIds,
  })
  return res.lastPrices ?? []
}

const DAY_MS = 24 * 60 * 60 * 1000
// дневные свечи API отдаёт не больше чем за год за один запрос
const MAX_SPAN_MS = 365 * DAY_MS

/** Дневные свечи за период; длинный период режем на годовые куски. */
export async function getDailyCandles(account: AccountKey, instrumentId: string, from: Date, to: Date): Promise<Candle[]> {
  const candles: Candle[] = []
  let start = from.getTime()
  while (start < to.getTime()) {
    const end = Math.min(start + MAX_SPAN_MS, to.getTime())
    const res = await request<{ candles: Candle[] }>(account, 'MarketDataService', 'GetCandles', {
      instrumentId,
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      interval: 'CANDLE_INTERVAL_DAY',
    })
    candles.push(...(res.candles ?? []))
    start = end
  }
  return candles
}
