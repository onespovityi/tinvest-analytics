import { useMemo, useState } from 'react'
import { formatDate, formatMoney } from '../../api/money'
import { InstrumentLink } from '../../shared/ui/InstrumentLink'
import { ErrorState, Loading } from '../../shared/ui/PageState'
import { Segmented } from '../../shared/ui/Segmented'
import table from '../../shared/ui/table.module.css'
import { useBondMetrics, type BondRow } from '../bonds/useBondMetrics'
import { sectorLabel } from '../instruments/labels'
import { usePositionInstruments } from '../instruments/useInstruments'
import { usePortfolio } from '../portfolio/usePortfolio'
import { BOND_PROGRESS_KEY, type BondKind, type BondScreenRow } from './bondScreener'
import styles from './MarketPage.module.css'
import { useProgress } from './progress'
import { SHARE_PROGRESS_KEY, type ShareScreenRow } from './shareScreener'
import { useBondScreener, useShareScreener } from './useScreeners'

type Tab = 'bonds' | 'shares'
type KindFilter = BondKind | 'all'
type Horizon = 'all' | 'short' | 'mid' | 'long' | 'xlong'
type ShareSort = 'upside' | 'divYield' | 'pe' | 'marketCap'

const HORIZONS: { value: Horizon; label: string; min: number; max: number }[] = [
  { value: 'all', label: 'Любой срок', min: 0, max: Infinity },
  { value: 'short', label: 'до 2 лет', min: 0, max: 2 },
  { value: 'mid', label: '2–5 лет', min: 2, max: 5 },
  { value: 'long', label: '5–10 лет', min: 5, max: 10 },
  { value: 'xlong', label: '10+ лет', min: 10, max: Infinity },
]

const RISK_SHORT: Record<string, string> = { RISK_LEVEL_LOW: 'низкий', RISK_LEVEL_MODERATE: 'средний', RISK_LEVEL_HIGH: 'высокий' }
const REC_LABEL = { buy: 'покупать', hold: 'держать', sell: 'продавать', unknown: '—' }

const pct = (v: number, d = 1) => `${v.toFixed(d)} %`
const num = (v: number, d = 1) => (v ? v.toFixed(d) : '—')

function ProgressText({ progressKey, what }: { progressKey: string; what: string }) {
  const p = useProgress(progressKey)
  const detail = p.total > 0 ? `${p.stage}: ${p.done} из ${p.total}` : p.stage || 'запуск'
  return <Loading text={`Собираем ${what} (${detail})… Первый раз — около минуты, потом из кэша.`} />
}

/** Что из скринера объективно лучше уже купленной облигации: тот же срок (±1 год дюрации), доходность выше на ≥1 п.п. */
function alternativesFor(held: BondRow, rows: BondScreenRow[]): BondScreenRow[] {
  const ytm = held.metrics?.ytm
  const duration = held.metrics?.modified
  // скринер рублёвый: валютную облигацию с ним сравнивать нельзя — доходности в разных валютах
  if (ytm === undefined || duration === undefined || held.info.bond?.nominalCurrency.toLowerCase() !== 'rub') return []
  const kind: BondKind = held.info.sector === 'government' ? 'ofz' : 'corporate'
  return rows
    .filter((r) => r.isin !== held.info.isin && r.kind === kind && Math.abs(r.duration - duration) <= 1 && r.ytm >= ytm + 1)
    .slice(0, 3)
}

function BondsTab({ heldIsins, heldBonds }: { heldIsins: Set<string>; heldBonds: BondRow[] }) {
  const { data, isPending, error } = useBondScreener()
  const [kind, setKind] = useState<KindFilter>('all')
  const [horizon, setHorizon] = useState<Horizon>('all')

  const filtered = useMemo(() => {
    if (!data) return []
    const h = HORIZONS.find((x) => x.value === horizon)!
    return data.filter((r) => (kind === 'all' || r.kind === kind) && r.yearsLeft >= h.min && r.yearsLeft < h.max)
  }, [data, kind, horizon])

  const comparisons = useMemo(
    () => (data ? heldBonds.map((held) => ({ held, alternatives: alternativesFor(held, data) })).filter((c) => c.alternatives.length > 0) : []),
    [data, heldBonds],
  )

  if (error) return <ErrorState error={error} />
  if (isPending || !data) return <ProgressText progressKey={BOND_PROGRESS_KEY} what="скринер облигаций" />

  return (
    <>
      {heldBonds.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Лучше того, что у тебя</h2>
          {comparisons.length === 0 ? (
            <p className={styles.muted}>
              Для твоих облигаций аналогов с той же дюрацией и доходностью выше на 1 п.п. в списке нет — держишь не хуже рынка.
            </p>
          ) : (
            <ul className={styles.list}>
              {comparisons.map(({ held, alternatives }) => (
                <li key={held.position.instrumentUid}>
                  <InstrumentLink instrument={held.info}>{held.info.name}</InstrumentLink>{' '}
                  <span className={styles.muted}>
                    ({pct(held.metrics!.ytm)} к погашению, дюрация {held.metrics!.modified.toFixed(1)})
                  </span>{' '}
                  → {alternatives.map((a, i) => (
                    <span key={a.uid}>
                      {i > 0 && ', '}
                      <InstrumentLink instrument={{ type: 'bond', ticker: a.ticker, isin: a.isin }}>{a.name}</InstrumentLink>{' '}
                      <b>{pct(a.ytm)}</b>
                      <span className={styles.muted}> ({a.duration.toFixed(1)}{a.rating ? `, ${a.rating}` : ''})</span>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className={styles.filters}>
        <Segmented
          options={[
            { value: 'all', label: 'Все' },
            { value: 'ofz', label: 'ОФЗ' },
            { value: 'corporate', label: 'Корпоративные' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Segmented options={HORIZONS.map((h) => ({ value: h.value, label: h.label }))} value={horizon} onChange={setHorizon} />
        <span className={styles.count}>{filtered.length} бумаг</span>
      </div>

      <div className={table.wrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th>Бумага</th>
              <th>Погашение</th>
              <th>Цена, %</th>
              <th>Купон / год</th>
              <th>Текущая</th>
              <th>К погашению</th>
              <th>Дюрация</th>
              <th className={table.left}>Рейтинг</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.uid} className={heldIsins.has(r.isin) ? styles.held : undefined}>
                <td>
                  <InstrumentLink instrument={{ type: 'bond', ticker: r.ticker, isin: r.isin }}>{r.name}</InstrumentLink>
                  <div className={table.muted}>
                    {r.ticker}
                    {heldIsins.has(r.isin) && ' · у тебя'}
                  </div>
                </td>
                <td>
                  {formatDate(r.maturityDate)}
                  <div className={table.muted}>{r.yearsLeft.toFixed(1)} г.</div>
                </td>
                <td>{r.pricePct.toFixed(1)}</td>
                <td>{r.couponPerYear.toFixed(1)} ₽</td>
                <td>{pct(r.currentYield)}</td>
                <td className={styles.strong}>{pct(r.ytm)}</td>
                <td>{r.duration.toFixed(1)}</td>
                <td className={`${table.left} ${table.muted}`}>{r.kind === 'ofz' ? 'ОФЗ' : r.rating || RISK_SHORT[r.riskLevel] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.muted}>
        Только рублёвые бумаги с фиксированным купоном, без амортизации и оферт по типу «вечная/суборд»; корпоративные — ликвидные
        с низким уровнем риска по классификации брокера. Доходность к погашению считается по последней цене и графику купонов.
      </p>
    </>
  )
}

function SharesTab({ heldIsins }: { heldIsins: Set<string> }) {
  const { data, isPending, error } = useShareScreener()
  const [sort, setSort] = useState<ShareSort>('marketCap')
  const [withForecast, setWithForecast] = useState(false)

  const rows = useMemo(() => {
    if (!data) return []
    const list = data.filter((r) => !withForecast || r.consensus)
    const by: Record<ShareSort, (a: ShareScreenRow, b: ShareScreenRow) => number> = {
      upside: (a, b) => (b.consensus?.upside ?? -Infinity) - (a.consensus?.upside ?? -Infinity),
      divYield: (a, b) => b.divYield - a.divYield,
      pe: (a, b) => (a.pe > 0 ? a.pe : Infinity) - (b.pe > 0 ? b.pe : Infinity),
      marketCap: (a, b) => b.marketCap - a.marketCap,
    }
    return [...list].sort(by[sort])
  }, [data, sort, withForecast])

  if (error) return <ErrorState error={error} />
  if (isPending || !data) return <ProgressText progressKey={SHARE_PROGRESS_KEY} what="скринер акций" />

  return (
    <>
      <div className={styles.filters}>
        <Segmented
          options={[
            { value: 'marketCap', label: 'По размеру' },
            { value: 'upside', label: 'По потенциалу' },
            { value: 'divYield', label: 'По дивидендам' },
            { value: 'pe', label: 'По P/E' },
          ]}
          value={sort}
          onChange={setSort}
        />
        <label className={styles.checkbox}>
          <input type="checkbox" checked={withForecast} onChange={(e) => setWithForecast(e.target.checked)} />
          только с прогнозом аналитиков
        </label>
        <span className={styles.count}>{rows.length} акций</span>
      </div>

      <div className={table.wrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th>Компания</th>
              <th>Цена</th>
              <th>P/E</th>
              <th>P/B</th>
              <th>EV/EBITDA</th>
              <th>Долг/EBITDA</th>
              <th>ROE</th>
              <th>Дивиденды</th>
              <th className={table.left}>Консенсус аналитиков</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className={heldIsins.has(r.isin) ? styles.held : undefined}>
                <td>
                  <InstrumentLink instrument={{ type: 'share', ticker: r.ticker }}>{r.name}</InstrumentLink>
                  <div className={table.muted}>
                    {r.ticker} · {sectorLabel({ type: 'share', sector: r.sector })}
                    {heldIsins.has(r.isin) && ' · у тебя'}
                  </div>
                </td>
                <td>{formatMoney(r.price)}</td>
                <td>{num(r.pe)}</td>
                <td>{num(r.pb, 2)}</td>
                <td>{num(r.evEbitda)}</td>
                <td>{num(r.netDebtEbitda)}</td>
                <td>{r.roe ? pct(r.roe) : '—'}</td>
                <td>{r.divYield ? pct(r.divYield) : '—'}</td>
                <td className={table.left}>
                  {r.consensus ? (
                    <>
                      <span className={r.consensus.upside > 0 ? table.positive : table.negative}>
                        {r.consensus.upside > 0 ? '+' : ''}
                        {r.consensus.upside.toFixed(0)} %
                      </span>{' '}
                      до {formatMoney(r.consensus.target)} · {REC_LABEL[r.consensus.recommendation]}
                      <div className={table.muted}>
                        {r.consensus.buy} покупать / {r.consensus.hold} держать / {r.consensus.sell} продавать
                      </div>
                    </>
                  ) : (
                    <span className={table.muted}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.muted}>
        Мультипликаторы — из отчётности за последние 12 месяцев (данные брокера). «Консенсус» — целевые цены инвестдомов, собранные
        Т-Инвестициями; это их мнение, а не прогноз приложения: точность таких целей исторически невысокая, потенциал часто не
        реализуется. Используй как список кандидатов для собственной проверки, не как сигнал.
      </p>
    </>
  )
}

export function MarketPage() {
  const [tab, setTab] = useState<Tab>('bonds')
  const { summary } = usePortfolio()
  const instruments = usePositionInstruments(summary?.positions)
  const heldBonds = useBondMetrics(summary?.positions, instruments)
  const heldIsins = useMemo(() => new Set([...instruments.values()].map((i) => i.isin).filter(Boolean)), [instruments])

  return (
    <>
      <div className={styles.tabs}>
        <Segmented
          options={[
            { value: 'bonds', label: 'Облигации' },
            { value: 'shares', label: 'Акции' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'bonds' ? <BondsTab heldIsins={heldIsins} heldBonds={heldBonds.rows} /> : <SharesTab heldIsins={heldIsins} />}
    </>
  )
}
