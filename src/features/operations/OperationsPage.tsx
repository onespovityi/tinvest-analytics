import { useMemo, useState } from 'react'
import { formatDate, formatMoney, formatQuantity, formatSignedMoney } from '../../api/money'
import type { InstrumentType } from '../../api/types'
import { ACCOUNT_LABELS, useAccount } from '../../shared/account/accountContext'
import { useRates, type ToRub } from '../../shared/rates/useRates'
import { InstrumentLink } from '../../shared/ui/InstrumentLink'
import { Empty, ErrorState, Loading } from '../../shared/ui/PageState'
import { Segmented } from '../../shared/ui/Segmented'
import { Stats, type StatItem } from '../../shared/ui/Stats'
import table from '../../shared/ui/table.module.css'
import { useInstruments, type InstrumentRef } from '../instruments/useInstruments'
import { CATEGORY_LABELS, CATEGORY_ORDER, isCoupon, isDividend, type Operation, type OperationCategory } from './model'
import styles from './OperationsPage.module.css'
import { useOperations } from './useOperations'

type Period = 'month' | 'year' | 'all'
type CategoryFilter = OperationCategory | 'all'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
]

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  ...CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
]

function periodStart(period: Period): Date | null {
  const now = new Date()
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'year') return new Date(now.getFullYear(), 0, 1)
  return null
}

/** Сумма платежей в рублях по курсу на сегодня — операции приходят в валюте инструмента. */
function sumWhere(ops: Operation[], toRub: ToRub, predicate: (op: Operation) => boolean): number {
  return ops.reduce((acc, op) => (predicate(op) ? acc + toRub(op.payment, op.currency) : acc), 0)
}

function Summary({ operations, toRub }: { operations: Operation[]; toRub: ToRub }) {
  const input = sumWhere(operations, toRub, (op) => op.category === 'cash' && op.payment > 0)
  const output = sumWhere(operations, toRub, (op) => op.category === 'cash' && op.payment < 0)
  const dividends = sumWhere(operations, toRub, isDividend)
  const coupons = sumWhere(operations, toRub, isCoupon)
  const fees = sumWhere(operations, toRub, (op) => op.category === 'fee')
  const taxes = sumWhere(operations, toRub, (op) => op.category === 'tax')

  const items: StatItem[] = [
    { label: 'Пополнения', value: formatMoney(input) },
    { label: 'Выводы', value: formatMoney(-output) },
    { label: 'Купоны', value: formatMoney(coupons), tone: coupons },
    { label: 'Дивиденды', value: formatMoney(dividends), tone: dividends },
    { label: 'Комиссии', value: formatMoney(-fees), tone: fees },
    { label: 'Налоги', value: formatMoney(-taxes), tone: taxes },
  ]
  return <Stats items={items} />
}

export function OperationsPage() {
  const { selection } = useAccount()
  const { operations, isPending, error } = useOperations()
  const [period, setPeriod] = useState<Period>('year')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const { toRub } = useRates()

  const refs = useMemo(() => {
    if (!operations) return undefined
    const map = new Map<string, InstrumentRef>()
    for (const op of operations) {
      if (op.instrumentUid && !map.has(op.instrumentUid)) {
        map.set(op.instrumentUid, { uid: op.instrumentUid, type: op.instrumentType as InstrumentType, account: op.account })
      }
    }
    return [...map.values()]
  }, [operations])
  const instruments = useInstruments(refs)

  const filtered = useMemo(() => {
    if (!operations) return []
    const start = periodStart(period)
    return operations.filter(
      (op) => (!start || op.date >= start) && (category === 'all' || op.category === category),
    )
  }, [operations, period, category])

  if (error) return <ErrorState error={error} />
  if (isPending || !operations) return <Loading text="Загрузка истории операций…" />

  const showAccount = selection === 'all'

  return (
    <>
      <div className={styles.filters}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        <Segmented options={CATEGORIES} value={category} onChange={setCategory} />
        <span className={styles.count}>{filtered.length} операций</span>
      </div>
      <Summary operations={filtered} toRub={toRub} />
      {filtered.length === 0 ? (
        <Empty text="За выбранный период операций нет" />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th>Дата</th>
                {showAccount && <th className={table.left}>Счёт</th>}
                <th className={table.left}>Операция</th>
                <th className={table.left}>Инструмент</th>
                <th>Кол-во</th>
                <th>Цена</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((op) => (
                <tr key={`${op.account}-${op.id}`}>
                  <td className={table.muted}>{formatDate(op.date)}</td>
                  {showAccount && <td className={`${table.left} ${table.muted}`}>{ACCOUNT_LABELS[op.account]}</td>}
                  <td className={table.left}>{op.description}</td>
                  <td className={`${table.left} ${styles.instrument}`}>
                    <InstrumentLink instrument={instruments.get(op.instrumentUid)}>{op.name || '—'}</InstrumentLink>
                  </td>
                  <td>{op.quantity > 0 ? formatQuantity(op.quantity) : ''}</td>
                  <td>{op.price > 0 ? formatMoney(op.price, op.currency) : ''}</td>
                  <td className={op.payment > 0 ? table.positive : op.payment < 0 ? table.negative : undefined}>
                    {formatSignedMoney(op.payment, op.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
