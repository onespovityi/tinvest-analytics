import type { InstrumentInfo } from '../../api/instruments'
import { toNumber } from '../../api/money'
import type { Candle, Coupon } from '../../api/types'
import { dayKey } from './holdings'

/** Цена закрытия по дням с протяжкой: в выходные и праздники действует последняя известная. */
export class PriceSeries {
  private readonly days: string[]
  private readonly closes: number[]

  constructor(candles: Candle[]) {
    // свечи могут прийти из нескольких листингов одной бумаги — на день оставляем одну
    const byDay = new Map<string, number>()
    for (const c of [...candles].sort((a, b) => a.time.localeCompare(b.time))) byDay.set(dayKey(new Date(c.time)), toNumber(c.close))
    this.days = [...byDay.keys()]
    this.closes = [...byDay.values()]
  }

  /** Последняя цена не позже указанного дня; undefined — если история ещё не началась. */
  at(day: string): number | undefined {
    let lo = 0
    let hi = this.days.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.days[mid] <= day) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found >= 0 ? this.closes[found] : undefined
  }
}

/** НКД на день: купон растёт линейно от начала купонного периода к его концу. */
export function accruedInterest(coupons: Coupon[], day: string): number {
  const t = new Date(`${day}T00:00:00Z`).getTime()
  for (const c of coupons) {
    const start = new Date(c.couponStartDate).getTime()
    const end = new Date(c.couponEndDate).getTime()
    if (t >= start && t < end && end > start) {
      return (toNumber(c.payOneBond) * (t - start)) / (end - start)
    }
  }
  return 0
}

export interface PriceBook {
  prices: Map<string, PriceSeries>
  /** Курс валюты к рублю по дням; для rub не нужен. */
  rates: Map<string, PriceSeries>
  coupons: Map<string, Coupon[]>
  instruments: Map<string, InstrumentInfo>
}

export function rateOn(book: PriceBook, currency: string, day: string): number {
  const cur = currency.toLowerCase()
  if (cur === 'rub') return 1
  return book.rates.get(cur)?.at(day) ?? 0
}

/**
 * Рублёвая стоимость одной бумаги на день.
 * Свечи облигаций — в процентах от номинала, а номинал может быть в валюте (юаневые бонды).
 */
export function unitPriceOn(book: PriceBook, uid: string, day: string): number | undefined {
  const close = book.prices.get(uid)?.at(day)
  if (close === undefined) return undefined
  const info = book.instruments.get(uid)
  if (info?.bond) {
    const nkd = accruedInterest(book.coupons.get(uid) ?? [], day)
    return ((close / 100) * info.bond.nominal + nkd) * rateOn(book, info.bond.nominalCurrency, day)
  }
  return close * rateOn(book, info?.currency ?? 'rub', day)
}

/** Ежедневная стоимость всех бумаг и денег на счёте. */
export function valueOn(book: PriceBook, quantities: Map<string, number>, cash: Map<string, number>, day: string): number {
  let value = 0
  for (const [uid, qty] of quantities) {
    if (qty === 0) continue
    value += qty * (unitPriceOn(book, uid, day) ?? 0)
  }
  for (const [currency, amount] of cash) value += amount * rateOn(book, currency, day)
  return value
}
