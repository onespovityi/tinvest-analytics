import { ApiError, request } from './client'
import type { AccountKey, MoneyValue, Quotation } from './types'

export interface BondRating {
  agencyName: string
  ratingLevel: string
  ratingDate: string
}

/** Облигация из полного списка InstrumentsService/Bonds — только нужные поля. */
export interface RawBond {
  uid: string
  figi: string
  ticker: string
  isin: string
  name: string
  currency: string
  lot: number
  sector: string
  maturityDate: string
  nominal: MoneyValue
  aciValue: MoneyValue
  couponQuantityPerYear: number
  floatingCouponFlag: boolean
  amortizationFlag: boolean
  perpetualFlag: boolean
  subordinatedFlag: boolean
  liquidityFlag: boolean
  forQualInvestorFlag: boolean
  apiTradeAvailableFlag: boolean
  buyAvailableFlag: boolean
  riskLevel: string
  ratings?: BondRating[]
}

export interface RawShare {
  uid: string
  assetUid: string
  figi: string
  ticker: string
  isin: string
  name: string
  currency: string
  classCode: string
  lot: number
  sector: string
  liquidityFlag: boolean
  forQualInvestorFlag: boolean
  apiTradeAvailableFlag: boolean
  divYieldFlag: boolean
}

export interface Fundamentals {
  assetUid: string
  marketCapitalization: number
  peRatioTtm: number
  priceToBookTtm: number
  evToEbitdaMrq: number
  netDebtToEbitda: number
  roe: number
  dividendYieldDailyTtm: number
  forwardAnnualDividendYield: number
  oneYearAnnualRevenueGrowthRate: number
  netMarginMrq: number
}

export interface Consensus {
  uid: string
  assetUid: string
  currency: string
  consensus: string
  bestTargetPrice: Quotation
  bestTargetLow: Quotation
  bestTargetHigh: Quotation
  totalBuyRecommend: number
  totalHoldRecommend: number
  totalSellRecommend: number
  prognosisDate: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Повтор при 429: скринер делает сотни запросов, лимит API легко задеть. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 429 || i >= attempts - 1) throw e
      await sleep(3000 * (i + 1))
    }
  }
}

/** Параллельно, но не больше `limit` запросов сразу; onDone — для прогресса. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onDone?: (done: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
      onDone?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function listBonds(account: AccountKey): Promise<RawBond[]> {
  const res = await request<{ instruments: RawBond[] }>(account, 'InstrumentsService', 'Bonds', {
    instrumentStatus: 'INSTRUMENT_STATUS_BASE',
  })
  return res.instruments ?? []
}

export async function listShares(account: AccountKey): Promise<RawShare[]> {
  const res = await request<{ instruments: RawShare[] }>(account, 'InstrumentsService', 'Shares', {
    instrumentStatus: 'INSTRUMENT_STATUS_BASE',
  })
  return res.instruments ?? []
}

/** Фундаментал пачками — API принимает список активов. */
export async function getFundamentals(account: AccountKey, assetUids: string[]): Promise<Fundamentals[]> {
  const out: Fundamentals[] = []
  for (let i = 0; i < assetUids.length; i += 50) {
    const res = await withRetry(() =>
      request<{ fundamentals: Fundamentals[] }>(account, 'InstrumentsService', 'GetAssetFundamentals', {
        assets: assetUids.slice(i, i + 50),
      }),
    )
    out.push(...(res.fundamentals ?? []))
  }
  return out
}

/** Консенсус-прогнозы аналитиков по всем активам, постранично. */
export async function getConsensusForecasts(account: AccountKey): Promise<Consensus[]> {
  const out: Consensus[] = []
  const limit = 500
  for (let page = 0; ; page++) {
    const res = await withRetry(() =>
      request<{ items: Consensus[]; page: { totalCount: number } }>(account, 'InstrumentsService', 'GetConsensusForecasts', {
        paging: { limit, pageNumber: page },
      }),
    )
    out.push(...(res.items ?? []))
    if ((page + 1) * limit >= (res.page?.totalCount ?? 0) || (res.items ?? []).length === 0) break
  }
  return out
}
