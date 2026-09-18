import { useMemo } from 'react'
import type { InstrumentInfo } from '../../api/instruments'
import { formatDate, formatMoney, formatPercent, formatQuantity, formatSignedMoney } from '../../api/money'
import { ACCOUNT_LABELS, useAccount } from '../../shared/account/accountContext'
import { InstrumentLink } from '../../shared/ui/InstrumentLink'
import { ErrorState, Loading } from '../../shared/ui/PageState'
import { Stats, type StatItem } from '../../shared/ui/Stats'
import table from '../../shared/ui/table.module.css'
import { usePositionInstruments } from '../instruments/useInstruments'
import { useOperations } from '../operations/useOperations'
import { firstCashFlowDate, portfolioXirr } from '../operations/xirr'
import { TYPE_LABELS, type PortfolioSummary, type Position } from './model'
import styles from './PortfolioPage.module.css'
import { usePortfolio } from './usePortfolio'

function pnlClass(value: number) {
  if (value > 0) return table.positive
  if (value < 0) return table.negative
  return undefined
}

interface SummaryProps {
  summary: PortfolioSummary
  xirr: number | null | undefined
  since: Date | null
}

function Summary({ summary, xirr, since }: SummaryProps) {
  const items: StatItem[] = [
    { label: 'Всего', value: formatMoney(summary.total) },
    { label: 'Доходность', value: formatPercent(summary.expectedYieldPct), tone: summary.expectedYieldPct },
    {
      label: 'Годовых (XIRR)',
      value: xirr === undefined ? '…' : xirr === null ? '—' : formatPercent(xirr),
      tone: xirr ?? 0,
      hint: since ? `с ${formatDate(since)}, с учётом дат пополнений` : 'с учётом дат пополнений',
    },
    {
      label: 'За день',
      value: formatSignedMoney(summary.dailyYield),
      hint: formatPercent(summary.dailyYieldPct),
      tone: summary.dailyYield,
    },
    ...(['share', 'bond', 'etf', 'currency'] as const).map((type) => ({
      label: TYPE_LABELS[type],
      value: formatMoney(summary.byType[type]),
      hint: summary.total > 0 ? `${((summary.byType[type] / summary.total) * 100).toFixed(1)} %` : undefined,
    })),
  ]
  return <Stats items={items} />
}

export function PortfolioPage() {
  const { selection } = useAccount()
  const { summary: portfolio, isPending, error } = usePortfolio()
  const { operations } = useOperations()
  const instruments = usePositionInstruments(portfolio?.positions)
  // XIRR ждёт историю операций, которая грузится дольше портфеля — таблицу из-за него не задерживаем
  const xirr = useMemo(
    () => (portfolio && operations ? portfolioXirr(operations, portfolio.total) : undefined),
    [portfolio, operations],
  )

  const since = useMemo(() => (operations ? firstCashFlowDate(operations) : null), [operations])

  if (error) return <ErrorState error={error} />
  if (isPending || !portfolio) return <Loading text="Загрузка портфеля…" />

  const showAccount = selection === 'all'

  return (
    <>
      <Summary summary={portfolio} xirr={xirr} since={since} />
      <div className={table.wrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th>Инструмент</th>
              {showAccount && <th className={table.left}>Счёт</th>}
              <th>Кол-во</th>
              <th>Средняя</th>
              <th>Цена</th>
              <th>Стоимость</th>
              <th>Доля</th>
              <th>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.positions.map((position) => (
              <Row
                key={position.instrumentUid}
                position={position}
                info={instruments.get(position.instrumentUid)}
                share={portfolio.total > 0 ? (position.value / portfolio.total) * 100 : 0}
                showAccount={showAccount}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

interface RowProps {
  position: Position
  info: InstrumentInfo | undefined
  share: number
  showAccount: boolean
}

function Row({ position, info, share, showAccount }: RowProps) {
  const { currency } = position
  const pnlPct = position.avgPrice > 0 ? ((position.currentPrice - position.avgPrice) / position.avgPrice) * 100 : 0
  const isBond = position.instrumentType === 'bond'

  return (
    <tr>
      <td>
        <div className={styles.name}>
          <InstrumentLink instrument={info}>{info?.name ?? position.ticker ?? position.figi}</InstrumentLink>
        </div>
        <div className={table.muted}>
          {position.ticker ?? position.figi} · {TYPE_LABELS[position.instrumentType] ?? position.instrumentType}
        </div>
      </td>
      {showAccount && (
        <td className={`${table.left} ${table.muted}`}>{position.accounts.map((a) => ACCOUNT_LABELS[a]).join(' + ')}</td>
      )}
      <td>{formatQuantity(position.quantity)}</td>
      <td>{formatMoney(position.avgPrice, currency)}</td>
      <td>
        {formatMoney(position.currentPrice, currency)}
        {isBond && position.nkd > 0 && <div className={table.muted}>НКД {formatMoney(position.nkd, currency)}</div>}
      </td>
      <td>{formatMoney(position.value, currency)}</td>
      <td className={table.muted}>{share.toFixed(1)} %</td>
      <td className={pnlClass(position.expectedYield)}>
        {formatSignedMoney(position.expectedYield, currency)}
        <div className={table.muted}>{formatPercent(pnlPct)}</div>
      </td>
    </tr>
  )
}

