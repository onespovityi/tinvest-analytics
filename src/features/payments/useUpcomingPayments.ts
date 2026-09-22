import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getBondCoupons, getDividends, type InstrumentInfo } from '../../api/instruments'
import { toNumber } from '../../api/money'
import type { Coupon, Dividend } from '../../api/types'
import type { Operation } from '../operations/model'
import type { Position } from '../portfolio/model'

export type PaymentKind = 'coupon' | 'dividend' | 'maturity'

export const KIND_LABELS: Record<PaymentKind, string> = {
  coupon: 'Купон',
  dividend: 'Дивиденд',
  maturity: 'Погашение',
}

export interface UpcomingPayment {
  date: Date
  kind: PaymentKind
  instrumentUid: string
  name: string
  perUnit: number
  quantity: number
  total: number
  currency: string
}

const HOUR = 60 * 60 * 1000

const DAY = 24 * HOUR

// стабильная ссылка, иначе useMemo пересчитывался бы на каждый рендер
const NO_OPERATIONS: Operation[] = []

interface Window {
  from: string
  to: string
  /** Для дивидендов окно начинается раньше: API фильтрует по дате закрытия реестра, а платят через недели после. */
  dividendsFrom: string
  fromDate: Date
  toDate: Date
}

/** Окно «сегодня → +12 месяцев», округлённое до часа, чтобы ключ кэша не менялся каждый рендер. */
function nextYearWindow(): Window {
  const fromDate = new Date(Math.floor(Date.now() / HOUR) * HOUR)
  const toDate = new Date(fromDate)
  toDate.setFullYear(toDate.getFullYear() + 1)
  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    dividendsFrom: new Date(fromDate.getTime() - 90 * DAY).toISOString(),
    fromDate,
    toDate,
  }
}

/**
 * Будущие выплаты по текущим позициям: купоны и погашения облигаций, объявленные дивиденды акций.
 * Данные по инструментам нужны для названий и даты погашения — пока их нет, погашения не показываем.
 */
/**
 * Сколько бумаг было на руках в указанный день: текущее количество минус то, что купили после,
 * плюс то, что продали после. Нужно для дивидендов с уже прошедшей отсечкой.
 */
function quantityAt(position: Position, date: Date, operations: Operation[]): number {
  let quantity = position.quantity
  for (const op of operations) {
    if (op.positionUid !== position.positionUid || op.date <= date) continue
    if (/OPERATION_TYPE_BUY/.test(op.type)) quantity -= op.quantity
    else if (/OPERATION_TYPE_SELL/.test(op.type)) quantity += op.quantity
  }
  return Math.max(0, quantity)
}

export function useUpcomingPayments(
  positions: Position[] | undefined,
  instruments: Map<string, InstrumentInfo>,
  operations: Operation[] | undefined = NO_OPERATIONS,
): { payments: UpcomingPayment[]; isPending: boolean } {
  const window = useMemo(() => nextYearWindow(), [])
  const bonds = useMemo(() => (positions ?? []).filter((p) => p.instrumentType === 'bond'), [positions])
  const shares = useMemo(() => (positions ?? []).filter((p) => p.instrumentType === 'share'), [positions])

  const coupons = useQueries({
    queries: bonds.map((p) => ({
      queryKey: ['coupons', p.instrumentUid, window.from],
      queryFn: () => getBondCoupons(p.accounts[0], p.instrumentUid, window.from, window.to),
      staleTime: 12 * HOUR,
    })),
    combine: (rs) => ({ isPending: rs.some((r) => r.isPending), data: rs.map((r) => r.data) }),
  })

  const dividends = useQueries({
    queries: shares.map((p) => ({
      queryKey: ['dividends', p.instrumentUid, window.dividendsFrom],
      queryFn: () => getDividends(p.accounts[0], p.instrumentUid, window.dividendsFrom, window.to),
      staleTime: 12 * HOUR,
    })),
    combine: (rs) => ({ isPending: rs.some((r) => r.isPending), data: rs.map((r) => r.data) }),
  })

  const payments = useMemo(() => {
    const result: UpcomingPayment[] = []
    const nameOf = (p: Position) => instruments.get(p.instrumentUid)?.name ?? p.ticker ?? p.figi

    bonds.forEach((p, i) => {
      for (const coupon of coupons.data[i] ?? []) result.push(fromCoupon(p, nameOf(p), coupon))
      const bond = instruments.get(p.instrumentUid)?.bond
      if (bond) {
        const maturity = new Date(bond.maturityDate)
        if (maturity >= window.fromDate && maturity <= window.toDate) {
          result.push({
            date: maturity,
            kind: 'maturity',
            instrumentUid: p.instrumentUid,
            name: nameOf(p),
            perUnit: bond.nominal,
            quantity: p.quantity,
            total: bond.nominal * p.quantity,
            currency: bond.nominalCurrency,
          })
        }
      }
    })

    shares.forEach((p, i) => {
      for (const dividend of dividends.data[i] ?? []) {
        // реестр мог закрыться до сегодняшнего дня — важно, что выплата ещё впереди
        if (!dividend.paymentDate || new Date(dividend.paymentDate) < window.fromDate) continue
        // если отсечка уже прошла, платят за то, что было на руках в тот день, а не сейчас
        const record = dividend.recordDate ? new Date(dividend.recordDate) : null
        const quantity = record && record < window.fromDate ? quantityAt(p, record, operations ?? NO_OPERATIONS) : p.quantity
        if (quantity > 0) result.push(fromDividend(p, nameOf(p), dividend, quantity))
      }
    })

    return result.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [bonds, shares, coupons.data, dividends.data, instruments, window, operations])

  return { payments, isPending: coupons.isPending || dividends.isPending }
}

function fromCoupon(p: Position, name: string, coupon: Coupon): UpcomingPayment {
  const perUnit = toNumber(coupon.payOneBond)
  return {
    date: new Date(coupon.couponDate),
    kind: 'coupon',
    instrumentUid: p.instrumentUid,
    name,
    perUnit,
    quantity: p.quantity,
    total: perUnit * p.quantity,
    currency: coupon.payOneBond.currency,
  }
}

function fromDividend(p: Position, name: string, dividend: Dividend, quantity: number): UpcomingPayment {
  const perUnit = toNumber(dividend.dividendNet)
  return {
    date: new Date(dividend.paymentDate),
    kind: 'dividend',
    instrumentUid: p.instrumentUid,
    name,
    perUnit,
    quantity,
    total: perUnit * quantity,
    currency: dividend.dividendNet.currency,
  }
}
