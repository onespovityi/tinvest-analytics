import { useMemo } from 'react'
import { formatDate, formatMoney, formatMonth, formatQuantity, monthKey } from '../../api/money'
import { useRates, type ToRub } from '../../shared/rates/useRates'
import { InstrumentLink } from '../../shared/ui/InstrumentLink'
import { ErrorState, Loading } from '../../shared/ui/PageState'
import { Stats, type StatItem } from '../../shared/ui/Stats'
import { StackedBars, type BarColumn } from '../../shared/ui/charts/StackedBars'
import table from '../../shared/ui/table.module.css'
import { usePositionInstruments } from '../instruments/useInstruments'
import { isCoupon, isDividend, type Operation } from '../operations/model'
import { useOperations } from '../operations/useOperations'
import { usePortfolio } from '../portfolio/usePortfolio'
import styles from './PaymentsPage.module.css'
import { KIND_LABELS, useUpcomingPayments, type UpcomingPayment } from './useUpcomingPayments'

const MONTHS_BACK = 12

/** Последние N месяцев, включая текущий, в хронологическом порядке. */
function recentMonths(count: number): Date[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1))
}

function receivedByMonth(operations: Operation[], toRub: ToRub): BarColumn[] {
  const buckets = new Map<string, [number, number]>()
  for (const month of recentMonths(MONTHS_BACK)) buckets.set(monthKey(month), [0, 0])
  for (const op of operations) {
    const bucket = buckets.get(monthKey(op.date))
    if (!bucket) continue
    if (isCoupon(op)) bucket[0] += toRub(op.payment, op.currency)
    else if (isDividend(op)) bucket[1] += toRub(op.payment, op.currency)
  }
  return recentMonths(MONTHS_BACK).map((month) => ({
    label: formatMonth(month),
    values: buckets.get(monthKey(month)) ?? [0, 0],
  }))
}

function Summary({ operations, upcoming, toRub }: { operations: Operation[]; upcoming: UpcomingPayment[]; toRub: ToRub }) {
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const thisYear = operations.filter((op) => op.date >= yearStart)
  const coupons = thisYear.reduce((acc, op) => (isCoupon(op) ? acc + toRub(op.payment, op.currency) : acc), 0)
  const dividends = thisYear.reduce((acc, op) => (isDividend(op) ? acc + toRub(op.payment, op.currency) : acc), 0)
  const taxes = thisYear.reduce((acc, op) => (op.category === 'tax' && /DIVIDEND|COUPON|BOND/.test(op.type) ? acc + toRub(op.payment, op.currency) : acc), 0)

  const income = upcoming.filter((p) => p.kind !== 'maturity')
  const expected = income.reduce((acc, p) => acc + toRub(p.total, p.currency), 0)
  const maturities = upcoming.filter((p) => p.kind === 'maturity').reduce((acc, p) => acc + toRub(p.total, p.currency), 0)

  const items: StatItem[] = [
    { label: 'Купоны в этом году', value: formatMoney(coupons), tone: coupons },
    { label: 'Дивиденды в этом году', value: formatMoney(dividends), tone: dividends },
    { label: 'Налог с выплат', value: formatMoney(-taxes), tone: taxes },
    { label: 'Ожидается за 12 мес.', value: formatMoney(expected), hint: `≈ ${formatMoney(expected / 12)} в месяц` },
    { label: 'Погашения за 12 мес.', value: formatMoney(maturities) },
  ]
  return <Stats items={items} />
}

export function PaymentsPage() {
  const portfolio = usePortfolio()
  const ops = useOperations()
  const instruments = usePositionInstruments(portfolio.summary?.positions)
  const upcoming = useUpcomingPayments(portfolio.summary?.positions, instruments)
  const { toRub } = useRates()

  const columns = useMemo(() => (ops.operations ? receivedByMonth(ops.operations, toRub) : []), [ops.operations, toRub])

  const error = portfolio.error ?? ops.error
  if (error) return <ErrorState error={error} />
  if (!portfolio.summary || !ops.operations) return <Loading text="Загрузка выплат…" />

  return (
    <>
      <Summary operations={ops.operations} upcoming={upcoming.payments} toRub={toRub} />
      <StackedBars title="Получено за последние 12 месяцев" series={['Купоны', 'Дивиденды']} columns={columns} format={(v) => formatMoney(v)} />

      <h2 className={styles.heading}>Календарь выплат</h2>
      {upcoming.isPending && upcoming.payments.length === 0 ? (
        <Loading text="Загрузка календаря…" />
      ) : upcoming.payments.length === 0 ? (
        <div className={table.muted}>Ближайших выплат по текущим позициям нет</div>
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th>Дата</th>
                <th className={table.left}>Тип</th>
                <th className={table.left}>Инструмент</th>
                <th>На бумагу</th>
                <th>Кол-во</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.payments.map((p) => (
                <tr key={`${p.kind}-${p.instrumentUid}-${p.date.toISOString()}`}>
                  <td className={table.muted}>{formatDate(p.date)}</td>
                  <td className={table.left}>{KIND_LABELS[p.kind]}</td>
                  <td className={`${table.left} ${styles.instrument}`}>
                    <InstrumentLink instrument={instruments.get(p.instrumentUid)}>{p.name}</InstrumentLink>
                  </td>
                  <td>{formatMoney(p.perUnit, p.currency)}</td>
                  <td>{formatQuantity(p.quantity)}</td>
                  <td className={p.kind === 'maturity' ? undefined : table.positive}>{formatMoney(p.total, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
