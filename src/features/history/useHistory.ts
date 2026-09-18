import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { findInstrumentVariants, getBondCoupons } from '../../api/instruments'
import { getDailyCandles } from '../../api/marketdata'
import type { AccountKey, Candle, Coupon, InstrumentType } from '../../api/types'
import { WEEK } from '../../app/queryClient'
import { ACCOUNT_KEYS } from '../../shared/account/accountContext'
import { CURRENCY_FIGI } from '../../shared/rates/useRates'
import { useInstruments, type InstrumentRef } from '../instruments/useInstruments'
import { useOperations } from '../operations/useOperations'
import { usePortfolio } from '../portfolio/usePortfolio'
import { benchmarkSeries, buildHistory, type HistoryPoint } from './analytics'
import { buildSnapshots, currencyOfTicker, dayKey, shiftDay } from './holdings'
import { PriceSeries, type PriceBook } from './pricing'

const HOUR = 60 * 60 * 1000

export interface Benchmark {
  ticker: string
  label: string
}

/** С чем сравнивать: «а если бы каждое пополнение уходило в этот фонд». */
export const BENCHMARKS: Benchmark[] = [
  { ticker: 'TMOS', label: 'Индекс Мосбиржи (TMOS)' },
  { ticker: 'LQDT', label: 'Денежный рынок ≈ депозит (LQDT)' },
  { ticker: 'TGLD', label: 'Золото (TGLD)' },
]

export interface HistoryState {
  points: HistoryPoint[] | undefined
  benchmark: (number | null)[] | undefined
  isPending: boolean
  error: Error | null
  /** Сколько запросов за свечами/купонами ещё в пути — для индикатора загрузки. */
  progress: { loaded: number; total: number }
}

const DAY = 24 * HOUR

/** Свечи двух листингов или двух запросов склеиваем по времени; свежие перекрывают старые (незакрытая свеча дня). */
function mergeCandles(older: Candle[], newer: Candle[]): Candle[] {
  const byTime = new Map<string, Candle>()
  for (const c of older) byTime.set(c.time, c)
  for (const c of newer) byTime.set(c.time, c)
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time))
}

/**
 * Дневные свечи с начала истории. Ключ без «до сегодня», поэтому кэш (в том числе восстановленный
 * из IndexedDB) переживает смену дня: при обновлении докачиваем только хвост с последней свечи.
 */
function candleQuery(queryClient: QueryClient, account: AccountKey, id: string, from: string) {
  const queryKey = ['candles', id, from]
  return {
    queryKey,
    queryFn: async () => {
      const cached = queryClient.getQueryData<Candle[]>(queryKey)
      const last = cached?.at(-1)
      // последняя свеча могла быть незакрытой — перезапрашиваем пару дней внахлёст
      const start = last ? new Date(new Date(last.time).getTime() - 2 * DAY) : new Date(`${from}T00:00:00Z`)
      const fresh = await getDailyCandles(account, id, start, new Date())
      return cached ? mergeCandles(cached, fresh) : fresh
    },
    staleTime: HOUR,
    gcTime: WEEK,
  }
}

export function useHistory(benchmark: Benchmark | null): HistoryState {
  const queryClient = useQueryClient()
  const portfolio = usePortfolio()
  const ops = useOperations()
  const positions = portfolio.summary?.positions
  const operations = ops.operations
  const account = ACCOUNT_KEYS[0]

  const today = dayKey(new Date())
  const firstDay = useMemo(() => {
    if (!operations || operations.length === 0) return today
    return dayKey(operations.reduce((min, op) => (op.date < min ? op.date : min), operations[0].date))
  }, [operations, today])
  // свечи берём с запасом в неделю, чтобы на первый день уже была цена
  const candlesFrom = shiftDay(firstDay, -7)

  // все инструменты, которые когда-либо были на счёте: текущие позиции + всё из операций
  const refs = useMemo(() => {
    if (!positions || !operations) return undefined
    const map = new Map<string, InstrumentRef>()
    for (const p of positions) map.set(p.instrumentUid, { uid: p.instrumentUid, type: p.instrumentType, account: p.accounts[0] })
    for (const op of operations) {
      if (op.instrumentUid && !map.has(op.instrumentUid)) {
        map.set(op.instrumentUid, { uid: op.instrumentUid, type: op.instrumentType as InstrumentType, account: op.account })
      }
    }
    return [...map.values()]
  }, [positions, operations])

  const instruments = useInstruments(refs)

  const securityRefs = useMemo(() => (refs ?? []).filter((r) => r.type !== 'currency'), [refs])
  const bondRefs = useMemo(() => securityRefs.filter((r) => r.type === 'bond'), [securityRefs])

  // валюты, курсы которых понадобятся: из операций, валют инструментов и номиналов облигаций
  const currencies = useMemo(() => {
    const set = new Set<string>()
    for (const op of operations ?? []) set.add(op.currency.toLowerCase())
    for (const info of instruments.values()) {
      set.add(info.currency.toLowerCase())
      if (info.bond) set.add(info.bond.nominalCurrency.toLowerCase())
    }
    set.delete('rub')
    return [...set].filter((c) => CURRENCY_FIGI[c])
  }, [operations, instruments])

  const candles = useQueries({
    queries: securityRefs.map((r) => candleQuery(queryClient, r.account, r.uid, candlesFrom)),
    combine: (rs) => ({ pending: rs.filter((r) => r.isPending).length, data: rs.map((r) => r.data) }),
  })

  const rateCandles = useQueries({
    queries: currencies.map((c) => candleQuery(queryClient, account, CURRENCY_FIGI[c], candlesFrom)),
    combine: (rs) => ({ pending: rs.filter((r) => r.isPending).length, data: rs.map((r) => r.data) }),
  })

  const coupons = useQueries({
    queries: bondRefs.map((r) => ({
      queryKey: ['coupons-history', r.uid, firstDay],
      queryFn: () => getBondCoupons(r.account, r.uid, `${firstDay}T00:00:00Z`, new Date(Date.now() + 366 * 24 * HOUR).toISOString()),
      staleTime: 24 * HOUR,
      gcTime: WEEK,
    })),
    combine: (rs) => ({ pending: rs.filter((r) => r.isPending).length, data: rs.map((r) => r.data) }),
  })

  // у бенчмарка может быть несколько листингов с разной историей — берём свечи всех и склеиваем
  const benchmarkVariants = useQuery({
    queryKey: ['instrument-variants', benchmark?.ticker],
    queryFn: () => findInstrumentVariants(account, benchmark!.ticker, 'etf'),
    enabled: Boolean(benchmark),
    staleTime: Infinity,
    gcTime: WEEK,
  })
  const benchmarkCandles = useQueries({
    queries: (benchmarkVariants.data ?? []).map((v) => candleQuery(queryClient, account, v.uid, candlesFrom)),
    combine: (rs) => ({ pending: rs.some((r) => r.isPending), data: rs.every((r) => r.data) ? rs.flatMap((r) => r.data ?? []) : undefined }),
  })

  const pending = candles.pending + rateCandles.pending + coupons.pending
  const total = securityRefs.length + currencies.length + bondRefs.length
  const ready =
    Boolean(positions && operations && portfolio.summary) &&
    refs !== undefined &&
    instruments.size >= refs.length &&
    pending === 0

  const result = useMemo(() => {
    if (!ready || !positions || !operations || !portfolio.summary) return undefined

    const book: PriceBook = {
      prices: new Map(securityRefs.map((r, i) => [r.uid, new PriceSeries((candles.data[i] ?? []) as Candle[])])),
      rates: new Map(currencies.map((c, i) => [c, new PriceSeries((rateCandles.data[i] ?? []) as Candle[])])),
      coupons: new Map(bondRefs.map((r, i) => [r.uid, (coupons.data[i] ?? []) as Coupon[]])),
      instruments,
    }
    const currencyOf = (uid: string) => {
      const info = instruments.get(uid)
      return info?.type === 'currency' ? currencyOfTicker(info.ticker) : undefined
    }
    const snapshots = buildSnapshots(positions, operations, currencyOf, today)
    const points = buildHistory(snapshots, operations, book, portfolio.summary.total)
    const bench = benchmarkCandles.data && benchmarkCandles.data.length > 0 ? benchmarkSeries(points, new PriceSeries(benchmarkCandles.data)) : undefined
    return { points, benchmark: bench }
  }, [ready, positions, operations, portfolio.summary, securityRefs, candles.data, currencies, rateCandles.data, bondRefs, coupons.data, instruments, today, benchmarkCandles.data])

  return {
    points: result?.points,
    benchmark: result?.benchmark,
    isPending: !result,
    error: portfolio.error ?? ops.error,
    progress: { loaded: total - pending, total },
  }
}
