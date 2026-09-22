import { getLastPrices } from '../../api/marketdata'
import { toNumber } from '../../api/money'
import { getConsensusForecasts, getFundamentals, listShares, withRetry, type RawShare } from '../../api/screener'
import type { AccountKey } from '../../api/types'
import { setProgress } from './progress'

export const SHARE_PROGRESS_KEY = 'screener-shares'

export interface ShareScreenRow {
  uid: string
  assetUid: string
  ticker: string
  isin: string
  name: string
  sector: string
  lot: number
  price: number
  marketCap: number
  pe: number
  pb: number
  evEbitda: number
  netDebtEbitda: number
  roe: number
  divYield: number
  revenueGrowth: number
  consensus?: {
    recommendation: 'buy' | 'hold' | 'sell' | 'unknown'
    target: number
    /** Потенциал до целевой цены, %. */
    upside: number
    buy: number
    hold: number
    sell: number
    date: string
  }
}

/** Рублёвые акции основного режима Мосбиржи, доступные без статуса квала. */
function isMainBoardShare(s: RawShare): boolean {
  return s.currency === 'rub' && s.classCode === 'TQBR' && s.apiTradeAvailableFlag && !s.forQualInvestorFlag
}

function recommendation(raw: string): 'buy' | 'hold' | 'sell' | 'unknown' {
  if (/BUY/.test(raw)) return 'buy'
  if (/HOLD/.test(raw)) return 'hold'
  if (/SELL/.test(raw)) return 'sell'
  return 'unknown'
}

/** Скринер акций: список → цены → фундаментал пачками → консенсус аналитиков. Всего ~10 запросов. */
export async function loadShareScreener(account: AccountKey): Promise<ShareScreenRow[]> {
  setProgress(SHARE_PROGRESS_KEY, { done: 0, total: 4, stage: 'список акций' })
  const shares = (await listShares(account)).filter(isMainBoardShare)

  setProgress(SHARE_PROGRESS_KEY, { done: 1, total: 4, stage: 'цены' })
  const prices = new Map<string, number>()
  for (let i = 0; i < shares.length; i += 200) {
    const res = await withRetry(() => getLastPrices(account, shares.slice(i, i + 200).map((s) => s.uid)))
    for (const p of res) prices.set(p.instrumentUid, toNumber(p.price))
  }

  setProgress(SHARE_PROGRESS_KEY, { done: 2, total: 4, stage: 'фундаментал' })
  const fundamentals = new Map((await getFundamentals(account, shares.map((s) => s.assetUid))).map((f) => [f.assetUid, f]))

  setProgress(SHARE_PROGRESS_KEY, { done: 3, total: 4, stage: 'прогнозы аналитиков' })
  const consensus = new Map((await getConsensusForecasts(account)).map((c) => [c.assetUid, c]))

  setProgress(SHARE_PROGRESS_KEY, { done: 4, total: 4, stage: 'готово' })
  return shares
    .map((s): ShareScreenRow | null => {
      const price = prices.get(s.uid)
      if (!price) return null
      const f = fundamentals.get(s.assetUid)
      const c = consensus.get(s.assetUid)
      const target = c ? toNumber(c.bestTargetPrice) : 0
      return {
        uid: s.uid,
        assetUid: s.assetUid,
        ticker: s.ticker,
        isin: s.isin,
        name: s.name,
        sector: s.sector,
        lot: s.lot,
        price,
        marketCap: f?.marketCapitalization ?? 0,
        pe: f?.peRatioTtm ?? 0,
        pb: f?.priceToBookTtm ?? 0,
        evEbitda: f?.evToEbitdaMrq ?? 0,
        netDebtEbitda: f?.netDebtToEbitda ?? 0,
        roe: f?.roe ?? 0,
        divYield: f?.dividendYieldDailyTtm ?? 0,
        revenueGrowth: f?.oneYearAnnualRevenueGrowthRate ?? 0,
        consensus:
          c && target > 0 && c.currency === 'rub'
            ? {
                recommendation: recommendation(c.consensus),
                target,
                upside: ((target - price) / price) * 100,
                buy: c.totalBuyRecommend,
                hold: c.totalHoldRecommend,
                sell: c.totalSellRecommend,
                date: c.prognosisDate,
              }
            : undefined,
      }
    })
    .filter((r): r is ShareScreenRow => r !== null)
    .sort((a, b) => b.marketCap - a.marketCap)
}
