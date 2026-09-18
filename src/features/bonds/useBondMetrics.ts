import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getBondCoupons, type InstrumentInfo } from '../../api/instruments'
import { toNumber } from '../../api/money'
import { WEEK } from '../../app/queryClient'
import { useRates } from '../../shared/rates/useRates'
import type { Position } from '../portfolio/model'
import { bondMetrics, yearsFrom, type BondMetrics } from './bondMath'

const HOUR = 60 * 60 * 1000

export interface BondRow {
  position: Position
  info: InstrumentInfo
  yearsLeft: number
  /** Цена в процентах от номинала. */
  pricePct: number
  /** Купонов в год на одну бумагу, в валюте номинала. */
  couponPerYear: number
  /** Купон к текущей цене, %. */
  currentYield: number
  metrics: BondMetrics | null
}

export interface BondSummary {
  rows: BondRow[]
  /** Средневзвешенные по стоимости позиций. */
  avgYtm: number
  avgDuration: number
  totalValue: number
  isPending: boolean
}

/**
 * Доходность к погашению и дюрация по каждой облигации в портфеле.
 * Купоны до погашения запрашиваем один раз в сутки — график выплат не меняется.
 */
export function useBondMetrics(positions: Position[] | undefined, instruments: Map<string, InstrumentInfo>): BondSummary {
  const { toRub } = useRates()
  const now = useMemo(() => new Date(), [])
  const bonds = useMemo(
    () => (positions ?? []).filter((p) => p.instrumentType === 'bond' && instruments.get(p.instrumentUid)?.bond),
    [positions, instruments],
  )

  const coupons = useQueries({
    queries: bonds.map((p) => {
      const info = instruments.get(p.instrumentUid)!
      return {
        queryKey: ['coupons-to-maturity', p.instrumentUid],
        queryFn: () => getBondCoupons(p.accounts[0], p.instrumentUid, now.toISOString(), info.bond!.maturityDate),
        staleTime: 24 * HOUR,
        gcTime: WEEK,
      }
    }),
    combine: (rs) => ({ isPending: rs.some((r) => r.isPending), data: rs.map((r) => r.data) }),
  })

  return useMemo(() => {
    const rows: BondRow[] = bonds.map((position, i) => {
      const info = instruments.get(position.instrumentUid)!
      const bond = info.bond!
      // портфель отдаёт цену в рублях, а купоны и номинал — в валюте номинала; сводим к одной валюте
      const rate = toRub(1, bond.nominalCurrency) || 1
      const dirty = (position.currentPrice + position.nkd) / rate
      const events = coupons.data[i] ?? []
      const flows = events.map((c) => ({ t: yearsFrom(now, c.couponDate), amount: toNumber(c.payOneBond) }))
      flows.push({ t: yearsFrom(now, bond.maturityDate), amount: bond.nominal })
      const couponPerYear = events.length > 0 ? toNumber(events[0].payOneBond) * (bond.couponsPerYear || 1) : 0
      const price = position.currentPrice / rate
      return {
        position,
        info,
        yearsLeft: yearsFrom(now, bond.maturityDate),
        pricePct: bond.nominal > 0 ? (price / bond.nominal) * 100 : 0,
        couponPerYear,
        currentYield: price > 0 ? (couponPerYear / price) * 100 : 0,
        metrics: events.length > 0 ? bondMetrics(dirty, flows) : null,
      }
    })

    const withMetrics = rows.filter((r) => r.metrics)
    const totalValue = withMetrics.reduce((acc, r) => acc + r.position.value, 0)
    const weighted = (pick: (m: BondMetrics) => number) =>
      totalValue > 0 ? withMetrics.reduce((acc, r) => acc + pick(r.metrics!) * r.position.value, 0) / totalValue : 0

    return {
      rows: rows.sort((a, b) => b.position.value - a.position.value),
      avgYtm: weighted((m) => m.ytm),
      avgDuration: weighted((m) => m.modified),
      totalValue: rows.reduce((acc, r) => acc + r.position.value, 0),
      isPending: coupons.isPending,
    }
  }, [bonds, instruments, coupons.data, coupons.isPending, now, toRub])
}
