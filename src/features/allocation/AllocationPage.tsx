import { useMemo } from 'react'
import type { InstrumentInfo } from '../../api/instruments'
import { formatMoney } from '../../api/money'
import { ErrorState, Loading } from '../../shared/ui/PageState'
import { Donut } from '../../shared/ui/charts/Donut'
import type { Slice } from '../../shared/ui/charts/palette'
import { sectorLabel } from '../instruments/labels'
import { usePositionInstruments } from '../instruments/useInstruments'
import { TYPE_LABELS, type Position } from '../portfolio/model'
import { usePortfolio } from '../portfolio/usePortfolio'
import styles from './AllocationPage.module.css'

const CURRENCY_LABELS: Record<string, string> = {
  rub: 'Рубль',
  usd: 'Доллар',
  eur: 'Евро',
  cny: 'Юань',
  hkd: 'Гонконгский доллар',
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

function groupBy(positions: Position[], keyOf: (p: Position) => string): Slice[] {
  const map = new Map<string, number>()
  for (const p of positions) map.set(keyOf(p), (map.get(keyOf(p)) ?? 0) + p.value)
  return [...map].map(([label, value]) => ({ label, value }))
}

/** Срок до погашения — «до 1 года», «1–3 года» и т.д. */
function maturityBucket(info: InstrumentInfo | undefined): string {
  if (!info?.bond) return '…'
  const years = (new Date(info.bond.maturityDate).getTime() - Date.now()) / YEAR_MS
  if (years < 1) return 'До 1 года'
  if (years < 3) return '1–3 года'
  if (years < 5) return '3–5 лет'
  if (years < 10) return '5–10 лет'
  return 'Более 10 лет'
}

export function AllocationPage() {
  const { summary, isPending, error } = usePortfolio()
  const instruments = usePositionInstruments(summary?.positions)

  const charts = useMemo(() => {
    if (!summary) return null
    const { positions } = summary
    const bonds = positions.filter((p) => p.instrumentType === 'bond')
    const info = (p: Position) => instruments.get(p.instrumentUid)
    return {
      byType: groupBy(positions, (p) => TYPE_LABELS[p.instrumentType] ?? p.instrumentType),
      bySector: groupBy(positions, (p) => sectorLabel(info(p))),
      // портфель приходит уже в рублях, поэтому валюту берём у самого инструмента;
      // у облигаций — валюту номинала: юаневые бонды торгуются за рубли, но риск в юане
      byCurrency: groupBy(positions, (p) => {
        const i = info(p)
        const currency = (i?.bond?.nominalCurrency ?? i?.currency ?? p.currency).toLowerCase()
        return CURRENCY_LABELS[currency] ?? currency.toUpperCase()
      }),
      byInstrument: groupBy(positions, (p) => info(p)?.name ?? p.ticker ?? p.figi),
      bondsByMaturity: groupBy(bonds, (p) => maturityBucket(info(p))),
      bondsByCoupon: groupBy(bonds, (p) => {
        const bond = info(p)?.bond
        return bond ? (bond.floating ? 'Плавающий купон' : 'Фиксированный купон') : '…'
      }),
    }
  }, [summary, instruments])

  if (error) return <ErrorState error={error} />
  if (isPending || !charts) return <Loading text="Загрузка структуры…" />

  const format = (v: number) => formatMoney(v)

  return (
    <div className={styles.grid}>
      <Donut title="По типам активов" slices={charts.byType} format={format} />
      <Donut title="По секторам" slices={charts.bySector} format={format} />
      <Donut title="По валютам" slices={charts.byCurrency} format={format} />
      <Donut title="По инструментам" slices={charts.byInstrument} format={format} />
      <Donut title="Облигации по сроку погашения" slices={charts.bondsByMaturity} format={format} />
      <Donut title="Облигации по типу купона" slices={charts.bondsByCoupon} format={format} />
    </div>
  )
}
