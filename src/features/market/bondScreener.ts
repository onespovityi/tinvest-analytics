import { getBondCoupons } from '../../api/instruments'
import { getLastPrices } from '../../api/marketdata'
import { toNumber } from '../../api/money'
import { listBonds, pool, withRetry, type RawBond } from '../../api/screener'
import type { AccountKey } from '../../api/types'
import { bondMetrics, yearsFrom } from '../bonds/bondMath'
import { setProgress } from './progress'

export const BOND_PROGRESS_KEY = 'screener-bonds'

export type BondKind = 'ofz' | 'corporate'

export interface BondScreenRow {
  uid: string
  ticker: string
  isin: string
  name: string
  kind: BondKind
  currency: string
  lot: number
  maturityDate: string
  yearsLeft: number
  pricePct: number
  couponPerYear: number
  currentYield: number
  ytm: number
  duration: number
  riskLevel: string
  /** Лучший из рейтингов агентств, например «AAA» или «A+». */
  rating: string
}

/** Простые рублёвые бумаги с фиксированным купоном — те, у которых доходность к погашению вообще имеет смысл. */
function isPlainRubBond(b: RawBond, now: Date): boolean {
  return (
    b.currency === 'rub' &&
    b.apiTradeAvailableFlag &&
    b.buyAvailableFlag &&
    !b.forQualInvestorFlag &&
    !b.floatingCouponFlag &&
    !b.amortizationFlag &&
    !b.perpetualFlag &&
    !b.subordinatedFlag &&
    yearsFrom(now, b.maturityDate) > 0.5
  )
}

/** ОФЗ — все; корпораты — только ликвидные с низким риском. Иначе список раздувается до тысячи. */
export function selectUniverse(bonds: RawBond[], now: Date): RawBond[] {
  const plain = bonds.filter((b) => isPlainRubBond(b, now) && !ratingWithdrawn(b))
  const ofz = plain.filter((b) => b.sector === 'government')
  const corporate = plain.filter((b) => b.sector !== 'government' && b.liquidityFlag && b.riskLevel === 'RISK_LEVEL_LOW')
  return [...ofz, ...corporate]
}

const RATING_ORDER = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-']

const WITHDRAWN = /ОТОЗВ|WITHDRAW/i

/** Лучший действующий рейтинг; отозванные не считаются. */
function bestRating(b: RawBond): string {
  const active = (b.ratings ?? []).filter((r) => !WITHDRAWN.test(r.ratingLevel))
  const levels = active.map((r) => r.ratingLevel.replace(/\(RU\)|ru|\.|\s/gi, '').toUpperCase())
  const ranked = levels.filter((l) => RATING_ORDER.includes(l)).sort((a, c) => RATING_ORDER.indexOf(a) - RATING_ORDER.indexOf(c))
  return ranked[0] ?? levels[0] ?? ''
}

/** Есть рейтинги, и все отозваны — эмитент в проблемах, такие бумаги не показываем. */
function ratingWithdrawn(b: RawBond): boolean {
  const ratings = b.ratings ?? []
  return ratings.length > 0 && ratings.every((r) => WITHDRAWN.test(r.ratingLevel))
}

/**
 * Скринер облигаций: список → отбор → цены одним запросом → купоны по каждой (это самое долгое,
 * ~250 запросов) → YTM и дюрация. Результат кэшируется на несколько часов.
 */
export async function loadBondScreener(account: AccountKey): Promise<BondScreenRow[]> {
  const now = new Date()
  setProgress(BOND_PROGRESS_KEY, { done: 0, total: 0, stage: 'список облигаций' })
  const universe = selectUniverse(await listBonds(account), now)

  setProgress(BOND_PROGRESS_KEY, { done: 0, total: universe.length, stage: 'цены' })
  const prices = new Map<string, number>()
  for (let i = 0; i < universe.length; i += 200) {
    const batch = universe.slice(i, i + 200)
    const res = await withRetry(() => getLastPrices(account, batch.map((b) => b.uid)))
    for (const p of res) prices.set(p.instrumentUid || p.figi, toNumber(p.price))
    // цены иногда приходят с figi вместо uid — подстрахуемся
    for (const b of batch) if (!prices.has(b.uid) && prices.has(b.figi)) prices.set(b.uid, prices.get(b.figi)!)
  }

  setProgress(BOND_PROGRESS_KEY, { done: 0, total: universe.length, stage: 'купоны и доходность' })
  const rows = await pool(
    universe,
    3,
    async (b): Promise<BondScreenRow | null> => {
      const pricePct = prices.get(b.uid)
      if (!pricePct) return null
      const coupons = await withRetry(() => getBondCoupons(account, b.uid, now.toISOString(), b.maturityDate))
      if (coupons.length === 0) return null
      const nominal = toNumber(b.nominal)
      const price = (pricePct / 100) * nominal
      const flows = coupons.map((c) => ({ t: yearsFrom(now, c.couponDate), amount: toNumber(c.payOneBond) }))
      flows.push({ t: yearsFrom(now, b.maturityDate), amount: nominal })
      const metrics = bondMetrics(price + toNumber(b.aciValue), flows)
      if (!metrics) return null
      const couponPerYear = toNumber(coupons[0].payOneBond) * (b.couponQuantityPerYear || 1)
      return {
        uid: b.uid,
        ticker: b.ticker,
        isin: b.isin,
        name: b.name,
        kind: b.sector === 'government' ? 'ofz' : 'corporate',
        currency: b.currency,
        lot: b.lot,
        maturityDate: b.maturityDate,
        yearsLeft: yearsFrom(now, b.maturityDate),
        pricePct,
        couponPerYear,
        currentYield: price > 0 ? (couponPerYear / price) * 100 : 0,
        ytm: metrics.ytm,
        duration: metrics.modified,
        riskLevel: b.riskLevel,
        rating: bestRating(b),
      }
    },
    (done) => setProgress(BOND_PROGRESS_KEY, { done, total: universe.length, stage: 'купоны и доходность' }),
  )

  setProgress(BOND_PROGRESS_KEY, { done: universe.length, total: universe.length, stage: 'готово' })
  // отсекаем явный мусор: доходность за пределами разумного — неликвид, битая цена или преддефолт
  return rows
    .filter((r): r is BondScreenRow => r !== null && r.ytm > 0 && r.ytm < 35 && r.currentYield < 30)
    .sort((a, b) => b.ytm - a.ytm)
}
