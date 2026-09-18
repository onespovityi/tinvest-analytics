import { useMemo, useState } from 'react'
import { formatDate, formatMonth, formatMoney, formatPercent, formatSignedMoney } from '../../api/money'
import { ErrorState, Loading } from '../../shared/ui/PageState'
import { Segmented } from '../../shared/ui/Segmented'
import { Stats, type StatItem } from '../../shared/ui/Stats'
import { LineChart, type LineSeries } from '../../shared/ui/charts/LineChart'
import { StackedBars } from '../../shared/ui/charts/StackedBars'
import { SERIES } from '../../shared/ui/charts/palette'
import { useOperations } from '../operations/useOperations'
import { portfolioXirr } from '../operations/xirr'
import { monthlyResults, performance, type HistoryPoint } from './analytics'
import styles from './HistoryPage.module.css'
import { BENCHMARKS, useHistory, type Benchmark } from './useHistory'

type Range = '1m' | '3m' | '6m' | '1y' | 'all'

const RANGES: { value: Range; label: string; days: number }[] = [
  { value: '1m', label: '1 мес', days: 30 },
  { value: '3m', label: '3 мес', days: 91 },
  { value: '6m', label: '6 мес', days: 182 },
  { value: '1y', label: '1 год', days: 365 },
  { value: 'all', label: 'Всё', days: Infinity },
]

// прибыль/убыток по месяцам — расходящаяся пара «синий ↔ красный», не зелёный/красный статусов
const PROFIT_COLOR = SERIES[0]
const LOSS_COLOR = SERIES[7]

function sliceRange(points: HistoryPoint[], range: Range): HistoryPoint[] {
  const days = RANGES.find((r) => r.value === range)?.days ?? Infinity
  if (!Number.isFinite(days)) return points
  return points.slice(Math.max(0, points.length - days - 1))
}

function Summary({ points, all, xirr }: { points: HistoryPoint[]; all: HistoryPoint[]; xirr: number | null }) {
  const last = points[points.length - 1]
  const first = points[0]
  const profit = last.value - last.invested
  const periodProfit = profit - (first.value - first.invested)
  const perf = performance(points)
  const days = (all[all.length - 1].date.getTime() - all[0].date.getTime()) / 86_400_000

  const items: StatItem[] = [
    { label: 'Стоимость', value: formatMoney(last.value) },
    { label: 'Вложено', value: formatMoney(last.invested), hint: `история ${Math.round(days)} дн.` },
    { label: 'Прибыль всего', value: formatSignedMoney(profit), tone: profit, hint: last.invested > 0 ? formatPercent((profit / last.invested) * 100) : undefined },
    { label: 'Прибыль за период', value: formatSignedMoney(periodProfit), tone: periodProfit },
    {
      label: 'Доходность за период (TWR)',
      value: perf ? formatPercent(perf.twr) : '—',
      tone: perf?.twr,
      hint: perf?.twrAnnual !== null && perf?.twrAnnual !== undefined ? `${formatPercent(perf.twrAnnual)} годовых` : 'период меньше месяца',
    },
    { label: 'Годовых (XIRR)', value: xirr === null ? '—' : formatPercent(xirr), tone: xirr ?? 0, hint: 'с учётом дат пополнений' },
    { label: 'Макс. просадка', value: perf ? formatPercent(perf.maxDrawdown) : '—', tone: perf?.maxDrawdown },
  ]
  return <Stats items={items} />
}

export function HistoryPage() {
  const [range, setRange] = useState<Range>('all')
  const [benchmark, setBenchmark] = useState<Benchmark | null>(BENCHMARKS[0])
  const history = useHistory(benchmark)
  const { operations } = useOperations()

  const visible = useMemo(() => (history.points ? sliceRange(history.points, range) : []), [history.points, range])
  const offset = (history.points?.length ?? 0) - visible.length

  const xirr = useMemo(
    () => (operations && history.points ? portfolioXirr(operations, history.points[history.points.length - 1].value) : null),
    [operations, history.points],
  )

  const months = useMemo(() => (history.points ? monthlyResults(history.points) : []), [history.points])

  if (history.error) return <ErrorState error={history.error} />
  if (history.isPending || !history.points) {
    const { loaded, total } = history.progress
    return <Loading text={total > 0 ? `Восстанавливаем историю: котировки ${loaded} из ${total}…` : 'Загрузка истории…'} />
  }
  if (history.points.length < 2) return <Loading text="Истории пока нет — нужны хотя бы две операции в разные дни" />

  const series: LineSeries[] = [
    { name: 'Портфель', values: visible.map((p) => p.value) },
    { name: 'Вложено', values: visible.map((p) => p.invested), dashed: true },
  ]
  if (benchmark && history.benchmark) {
    series.push({ name: `Если бы всё в ${benchmark.ticker}`, values: history.benchmark.slice(offset) })
  }

  return (
    <>
      <div className={styles.filters}>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        <label className={styles.select}>
          Сравнить с
          <select value={benchmark?.ticker ?? ''} onChange={(e) => setBenchmark(BENCHMARKS.find((b) => b.ticker === e.target.value) ?? null)}>
            {BENCHMARKS.map((b) => (
              <option key={b.ticker} value={b.ticker}>
                {b.label}
              </option>
            ))}
            <option value="">ни с чем</option>
          </select>
        </label>
      </div>

      <Summary points={visible} all={history.points} xirr={xirr} />

      <LineChart
        title="Стоимость портфеля"
        labels={visible.map((p) => p.date)}
        series={series}
        format={(v) => formatMoney(v)}
        formatLabel={(d) => formatDate(d)}
      />

      <div className={styles.section}>
        <StackedBars
          title="Результат по месяцам"
          series={['Прибыль', 'Убыток']}
          colors={[PROFIT_COLOR, LOSS_COLOR]}
          columns={months.map((m) => ({
            label: formatMonth(m.month),
            values: [Math.max(0, m.profit), Math.max(0, -m.profit)],
          }))}
          format={(v) => formatMoney(v)}
        />
      </div>

      <p className={styles.note}>
        История восстановлена из операций и дневных свечей: сегодняшняя точка — реальная стоимость из API, прошлые дни —
        пересчёт по ценам закрытия (облигации с НКД, валюта по курсу дня). Дивиденды и купоны учтены как деньги на счёте.
        Бенчмарк — что было бы, если бы каждое пополнение в тот же день целиком покупало выбранный фонд, а каждый вывод — продавал.
      </p>
    </>
  )
}
