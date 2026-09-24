import { useEffect, useMemo } from 'react'
import { formatDate, formatMoney, formatPercent, formatQuantity, formatSignedMoney } from '../../api/money'
import { ACCOUNT_LABELS, useAccount } from '../../shared/account/accountContext'
import { useAccountData } from '../../shared/account/useAccountData'
import { useRates } from '../../shared/rates/useRates'
import { InstrumentLink } from '../../shared/ui/InstrumentLink'
import { ErrorState, Loading } from '../../shared/ui/PageState'
import { Stats, type StatItem } from '../../shared/ui/Stats'
import table from '../../shared/ui/table.module.css'
import { usePositionInstruments } from '../instruments/useInstruments'
import { DailyMovers } from '../portfolio/DailyMovers'
import { contributionsByYear, iisReminders, minHoldingEnd } from '../iis/rules'
import { useIisSettings } from '../iis/useIisSettings'
import { isCoupon, isDividend, type Operation } from '../operations/model'
import { useOperations } from '../operations/useOperations'
import { KIND_LABELS, useUpcomingPayments } from '../payments/useUpcomingPayments'
import { usePortfolio } from '../portfolio/usePortfolio'
import { nextVisit } from './nextVisit'
import { DRIFT_THRESHOLD, rebalance, type Leg, type Suggestion } from './rebalance'
import styles from './SummaryPage.module.css'
import { PLAN_TARGETS, TARGET_LABELS, TARGET_TYPES, targetsFromActual, useTargets, type Targets } from './targets'
import { useLastVisit } from './useLastVisit'

const DAY_MS = 24 * 60 * 60 * 1000
/** Горизонт «ближайших выплат»: месяц с запасом, иначе выплата на 32-й день исчезает с глаз. */
const SOON_DAYS = 45

function formatDateTime(date: Date): string {
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface SinceProps {
  operations: Operation[]
  since: Date | null
  onMarkSeen: () => void
}

function SinceLastVisit({ operations, since, onMarkSeen }: SinceProps) {
  const { toRub } = useRates()
  const mark = (
    <button type="button" className={styles.reset} onClick={onMarkSeen}>
      отметить просмотренным
    </button>
  )
  if (!since) {
    return (
      <p className={styles.muted}>
        Точка отсчёта ещё не задана — в следующий раз здесь будет то, что изменилось. {mark}
      </p>
    )
  }

  const fresh = operations.filter((op) => op.date > since)
  if (fresh.length === 0) {
    return (
      <p className={styles.muted}>
        С {formatDateTime(since)} операций не было. {mark}
      </p>
    )
  }

  const sum = (pred: (op: Operation) => boolean) => fresh.reduce((acc, op) => (pred(op) ? acc + toRub(op.payment, op.currency) : acc), 0)
  const coupons = sum(isCoupon)
  const dividends = sum(isDividend)
  const deposits = sum((op) => op.category === 'cash' && op.payment > 0)
  const deals = fresh.filter((op) => op.category === 'deal')

  const items: string[] = []
  if (coupons > 0) items.push(`купоны ${formatMoney(coupons)}`)
  if (dividends > 0) items.push(`дивиденды ${formatMoney(dividends)}`)
  if (deposits > 0) items.push(`пополнения ${formatMoney(deposits)}`)
  if (deals.length > 0) items.push(`${deals.length} сделок`)

  return (
    <p>
      С {formatDateTime(since)}: {items.join(', ') || `${fresh.length} операций`}. {mark}
    </p>
  )
}

function TargetsEditor({ targets, onChange }: { targets: Targets; onChange: (t: Targets) => void }) {
  const sum = TARGET_TYPES.reduce((acc, t) => acc + targets[t], 0)
  return (
    <div className={styles.targets}>
      {TARGET_TYPES.map((t) => (
        <label key={t} className={styles.target}>
          <span className={styles.targetLabel}>{TARGET_LABELS[t]}</span>
          <span className={styles.targetInput}>
            <input type="number" min={0} max={100} value={targets[t]} onChange={(e) => onChange({ ...targets, [t]: Number(e.target.value) || 0 })} />
            <span>%</span>
          </span>
        </label>
      ))}
      <span className={`${styles.sum} ${sum !== 100 ? styles.sumBad : ''}`}>в сумме {sum} %</span>
      <button type="button" className={styles.reset} onClick={() => onChange(PLAN_TARGETS)}>
        к плану 40 / 35 / 25 / 0
      </button>
    </div>
  )
}

function LegText({ leg }: { leg: Leg }) {
  if (!leg.position) return <>что-нибудь из категории «{TARGET_LABELS[leg.type]}» на {formatMoney(leg.amount)}</>
  const link = { type: leg.position.instrumentType, ticker: leg.info?.ticker ?? leg.position.ticker ?? '', isin: leg.info?.isin }
  const unit = leg.info && leg.info.lot > 1 ? 'лот.' : 'шт.'
  return (
    <>
      <InstrumentLink instrument={link}>
        <b>{leg.info?.name ?? leg.position.ticker ?? leg.position.figi}</b>
      </InstrumentLink>
      {leg.lots !== undefined && leg.lots > 0 && ` — ${formatQuantity(leg.lots)} ${unit}`} на {formatMoney(leg.amount)}
    </>
  )
}

function SuggestionRow({ s }: { s: Suggestion }) {
  if (s.kind === 'buy') {
    return (
      <li>
        Купить <LegText leg={s.buy} />
        <span className={styles.muted}> (на свободные деньги → {TARGET_LABELS[s.buy.type].toLowerCase()})</span>
      </li>
    )
  }
  return (
    <li>
      Продать <LegText leg={s.sell} /> и купить <LegText leg={s.buy} />
      <span className={styles.muted}>
        {' '}
        ({TARGET_LABELS[s.sell.type].toLowerCase()} → {TARGET_LABELS[s.buy.type].toLowerCase()}; свободных денег нет)
      </span>
    </li>
  )
}

export function SummaryPage() {
  const { since, markSeen } = useLastVisit()
  const { summary, isPending, error } = usePortfolio()
  const { operations } = useOperations()
  const instruments = usePositionInstruments(summary?.positions)
  const upcoming = useUpcomingPayments(summary?.positions, instruments, operations)
  const { selection } = useAccount()
  const [storedTargets, saveTargets] = useTargets(selection)
  const iis = useAccountData('iis')

  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const iisOpenedIso = iis.info?.openedDate
  const iisOpened = useMemo(() => (iisOpenedIso ? new Date(iisOpenedIso) : undefined), [iisOpenedIso])
  const [iisSettings] = useIisSettings(currentYear, (iisOpened?.getFullYear() ?? currentYear) + 5)

  // «Всего» и ИИС стартуют с плана владельца; брокерский — с того, что есть (там одна бумага, план к нему не про это)
  const defaults = useMemo(
    () => (selection === 'broker' ? (summary ? targetsFromActual(summary) : null) : PLAN_TARGETS),
    [selection, summary],
  )
  useEffect(() => {
    if (!storedTargets && defaults) saveTargets(defaults)
  }, [storedTargets, defaults, saveTargets])

  const targets = storedTargets ?? defaults
  const plan = useMemo(() => (summary && targets ? rebalance(summary, targets, instruments) : null), [summary, targets, instruments])

  const iisContext = useMemo(() => {
    if (!iisOpened || !iis.operations) return null
    const contributedThisYear = contributionsByYear(iis.operations).find((y) => y.year === currentYear)?.contributed ?? 0
    return { contributedThisYear, settings: iisSettings, holdEnd: minHoldingEnd(iisOpened, iisSettings) }
  }, [iisOpened, iis.operations, currentYear, iisSettings])

  const reminders = useMemo(
    () => (iisContext ? iisReminders(now, iisContext.contributedThisYear, iisContext.settings, iisContext.holdEnd) : []),
    [iisContext, now],
  )
  const next = useMemo(() => nextVisit(now, upcoming.payments, iisContext), [now, upcoming.payments, iisContext])

  if (error) return <ErrorState error={error} />
  if (isPending || !summary || !targets || !plan) return <Loading text="Собираем сводку…" />

  const soon = upcoming.payments.filter((p) => p.date.getTime() - now.getTime() <= SOON_DAYS * DAY_MS)
  const soonTotal = soon.reduce((acc, p) => acc + (p.kind === 'maturity' ? 0 : p.total), 0)
  const maxDrift = Math.max(...plan.drifts.map((d) => Math.abs(d.drift)))

  const stats: StatItem[] = [
    { label: 'Портфель', value: formatMoney(summary.total), hint: formatPercent(summary.expectedYieldPct), tone: summary.expectedYieldPct },
    { label: 'За день', value: formatSignedMoney(summary.dailyYield), tone: summary.dailyYield },
    {
      label: 'Свободные деньги',
      value: formatMoney(plan.freeCash),
      hint: Object.entries(summary.cashByAccount)
        .map(([acc, v]) => `${ACCOUNT_LABELS[acc as keyof typeof ACCOUNT_LABELS]} ${formatMoney(v ?? 0)}`)
        .join(' · '),
    },
    { label: `Выплаты за ${SOON_DAYS} дней`, value: formatMoney(soonTotal), hint: `${soon.length} событий` },
    {
      label: 'Отклонение от цели',
      value: `${maxDrift.toFixed(1)} п.п.`,
      hint: maxDrift >= DRIFT_THRESHOLD ? 'пора ребалансировать' : 'в норме',
      tone: maxDrift >= DRIFT_THRESHOLD ? -1 : 1,
    },
    { label: 'Следующий визит', value: formatDate(next.date), hint: next.reason },
  ]

  return (
    <>
      <Stats items={stats} />

      <section className={styles.section}>
        <h2 className={styles.heading}>Движение за день</h2>
        <DailyMovers positions={summary.positions} instruments={instruments} total={summary.total} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Что сделать</h2>
        {reminders.length === 0 && plan.suggestions.length === 0 ? (
          <p className={styles.muted}>Ничего срочного: структура в норме, свободных денег мало, напоминаний по ИИС нет.</p>
        ) : (
          <ul className={styles.actions}>
            {reminders.map((r) => (
              <li key={r.text} className={r.urgent ? styles.urgent : undefined}>
                {r.text}
              </li>
            ))}
            {plan.suggestions.map((s, i) => (
              <SuggestionRow key={i} s={s} />
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>С прошлого визита</h2>
        {operations ? <SinceLastVisit operations={operations} since={since} onMarkSeen={markSeen} /> : <p className={styles.muted}>Загружаем операции…</p>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Структура: цель и факт</h2>
        <TargetsEditor targets={targets} onChange={saveTargets} />
        <div className={table.wrap}>
          <table className={`${table.table} ${styles.compact}`}>
            <thead>
              <tr>
                <th>Тип</th>
                <th>Цель</th>
                <th>Факт</th>
                <th>Отклонение</th>
                <th>До цели</th>
              </tr>
            </thead>
            <tbody>
              {plan.drifts.map((d) => (
                <tr key={d.type}>
                  <td>{TARGET_LABELS[d.type]}</td>
                  <td>{d.target} %</td>
                  <td>{d.actual.toFixed(1)} %</td>
                  <td className={Math.abs(d.drift) >= DRIFT_THRESHOLD ? table.negative : table.muted}>{formatPercent(d.drift, 1).replace('%', 'п.п.')}</td>
                  <td className={d.gap > 0 ? table.positive : d.gap < 0 ? table.negative : undefined}>{formatSignedMoney(d.gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>
          Действия появляются, когда отклонение больше {DRIFT_THRESHOLD} п.п. Сначала — покупки на свободные деньги, продажи только если иначе не выровнять.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Ближайшие выплаты</h2>
        {soon.length === 0 ? (
          <p className={styles.muted}>Выплат и погашений в ближайшие {SOON_DAYS} дней нет.</p>
        ) : (
          <ul className={styles.list}>
            {soon.map((p) => (
              <li key={`${p.kind}-${p.instrumentUid}-${p.date.toISOString()}`}>
                <span className={styles.muted}>{formatDate(p.date)}</span> {KIND_LABELS[p.kind].toLowerCase()}{' '}
                <InstrumentLink instrument={instruments.get(p.instrumentUid)}>{p.name}</InstrumentLink> — {formatMoney(p.total, p.currency)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
