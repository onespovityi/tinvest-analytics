import { useMemo } from 'react'
import { formatDate, formatMoney, formatSignedMoney, toNumber } from '../../api/money'
import { useAccountData } from '../../shared/account/useAccountData'
import { ErrorState, Loading } from '../../shared/ui/PageState'
import { Stats, type StatItem } from '../../shared/ui/Stats'
import table from '../../shared/ui/table.module.css'
import styles from './IisPage.module.css'
import { contributionsByYear, deductionFor, minHoldingEnd, project, type IisSettings } from './rules'
import { useIisSettings } from './useIisSettings'

const DAY_MS = 24 * 60 * 60 * 1000

interface NumberFieldProps {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  step?: number
  suffix?: string
  placeholder?: string
}

function NumberField({ label, value, onChange, step = 1000, suffix, placeholder }: NumberFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldInput}>
        <input
          type="number"
          value={value ?? ''}
          step={step}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
    </label>
  )
}

export function IisPage() {
  const { info, portfolio, operations, isPending, error } = useAccountData('iis')
  // дату фиксируем на рендер: линтер прав, Date.now() внутри рендера — нестабильно
  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const opened = info ? new Date(info.openedDate) : undefined
  const minCloseYear = opened ? opened.getFullYear() + 5 : currentYear + 5
  const [settings, update] = useIisSettings(currentYear, minCloseYear)

  const years = useMemo(() => (operations ? contributionsByYear(operations) : []), [operations])
  const actualByYear = useMemo(() => new Map(years.map((y) => [y.year, y.contributed])), [years])
  const total = portfolio ? toNumber(portfolio.totalAmountPortfolio) : 0
  const projection = useMemo(() => project(currentYear, total, actualByYear, settings), [currentYear, total, actualByYear, settings])

  if (error) return <ErrorState error={error} />
  if (isPending || !info || !opened || !operations) return <Loading text="Загрузка данных ИИС…" />

  const holdEnd = minHoldingEnd(opened, settings)
  const daysLeft = Math.ceil((holdEnd.getTime() - now.getTime()) / DAY_MS)
  const thisYear = deductionFor(currentYear, actualByYear.get(currentYear) ?? 0, settings)
  const remainingCap = Math.max(0, settings.deductionCap - thisYear.contributed)

  const status: StatItem[] = [
    { label: 'Открыт', value: formatDate(opened), hint: 'ИИС-3' },
    {
      label: 'Закрыть без потери льгот',
      value: formatDate(holdEnd),
      hint: daysLeft > 0 ? `через ${daysLeft} дн.` : 'срок уже вышел',
      tone: daysLeft > 0 ? 0 : 1,
    },
    { label: `Внесено в ${currentYear}`, value: formatMoney(thisYear.contributed), hint: `в вычет ${formatMoney(thisYear.base)}` },
    {
      label: `Сверх лимита в ${currentYear}`,
      value: formatMoney(thisYear.excess),
      hint: thisYear.excess > 0 ? 'вычета не даёт, но растёт без налога' : undefined,
      tone: thisYear.excess > 0 ? -1 : 0,
    },
    {
      label: `Возврат НДФЛ за ${currentYear}`,
      value: formatMoney(thisYear.refund),
      hint: thisYear.limitedByNdfl ? 'ограничен уплаченным НДФЛ' : `заявить можно с января ${currentYear + 1}`,
      tone: thisYear.refund,
    },
    { label: 'До лимита в этом году', value: formatMoney(remainingCap), hint: remainingCap === 0 ? `следующий взнос — с 1 января ${currentYear + 1}` : undefined },
  ]

  const advice = buildAdvice(currentYear, thisYear, years, settings, holdEnd)

  return (
    <>
      <Stats items={status} />

      <section className={styles.section}>
        <h2 className={styles.heading}>Что делать</h2>
        <ul className={styles.advice}>
          {advice.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Взносы и вычеты по годам</h2>
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th>Год</th>
                <th>Внесено</th>
                <th>В вычет</th>
                <th>Сверх лимита</th>
                <th>НДФЛ за год</th>
                <th>Возврат</th>
                <th>Купоны на ИИС</th>
                <th>Дивиденды на ИИС</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const d = deductionFor(y.year, y.contributed, settings)
                return (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td>{formatMoney(y.contributed)}</td>
                    <td>{formatMoney(d.base)}</td>
                    <td className={d.excess > 0 ? table.negative : undefined}>{formatMoney(d.excess)}</td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        step={1000}
                        value={settings.ndflByYear[y.year] ?? ''}
                        placeholder="не задан"
                        onChange={(e) => update({ ndflByYear: setNdfl(settings, y.year, e.target.value) })}
                      />
                    </td>
                    <td className={d.refund > 0 ? table.positive : undefined}>
                      {formatMoney(d.refund)}
                      {d.limitedByNdfl && <div className={table.muted}>упёрся в НДФЛ</div>}
                    </td>
                    <td>{formatMoney(y.coupons)}</td>
                    <td>{formatMoney(y.dividends)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Купоны и дивиденды приходят внутрь ИИС и взносом не считаются — вычет дают только деньги, заведённые извне.
          НДФЛ за год — это налог с зарплаты и другой «основной базы»; налог с купонов, дивидендов и продаж бумаг для вычета не подходит.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Прогноз до закрытия</h2>
        <div className={styles.settings}>
          <NumberField label="Взнос в год с следующего года" value={settings.plannedContribution} onChange={(v) => update({ plannedContribution: v ?? 0 })} suffix="₽" />
          <NumberField
            label="Ожидаемый НДФЛ в год (2027+)"
            value={settings.ndflByYear[currentYear + 1]}
            placeholder="не ограничивать"
            onChange={(v) => update({ ndflByYear: fillFuture(settings, currentYear, v) })}
            suffix="₽"
          />
          <NumberField label="Доходность" value={settings.expectedReturn} onChange={(v) => update({ expectedReturn: v ?? 0 })} step={1} suffix="% годовых" />
          <NumberField label="Год закрытия" value={settings.closeYear} onChange={(v) => update({ closeYear: Math.max(minCloseYear, v ?? minCloseYear) })} step={1} />
          <NumberField label="Ставка НДФЛ" value={settings.ndflRate} onChange={(v) => update({ ndflRate: v ?? 13 })} step={1} suffix="%" />
          <NumberField label="Лимит базы вычета" value={settings.deductionCap} onChange={(v) => update({ deductionCap: v ?? 0 })} suffix="₽" />
          <label className={styles.checkbox}>
            <input type="checkbox" checked={settings.reinvestRefund} onChange={(e) => update({ reinvestRefund: e.target.checked })} />
            Возврат НДФЛ вносить обратно на ИИС
          </label>
        </div>

        <Stats
          items={[
            { label: `Стоимость к концу ${settings.closeYear}`, value: formatMoney(projection.finalValue) },
            { label: 'Всего внесено', value: formatMoney(projection.totalContributed) },
            { label: 'Прибыль', value: formatSignedMoney(projection.profit), tone: projection.profit },
            { label: 'Возвраты НДФЛ', value: formatMoney(projection.totalRefunds), tone: projection.totalRefunds },
            { label: 'Налог, который не платим при закрытии', value: formatMoney(projection.taxSaved), tone: projection.taxSaved },
            { label: 'Выгода ИИС-3 против брокерского', value: formatMoney(projection.totalBenefit), tone: projection.totalBenefit },
          ]}
        />

        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th>Год</th>
                <th>На начало</th>
                <th>Взнос</th>
                <th>Возврат НДФЛ</th>
                <th>Рост</th>
                <th>На конец</th>
              </tr>
            </thead>
            <tbody>
              {projection.rows.map((r) => (
                <tr key={r.year}>
                  <td>
                    {r.year}
                    {r.isActual && <span className={table.muted}> факт</span>}
                  </td>
                  <td>
                    {formatMoney(r.startValue)}
                    {r.isActual && <div className={table.muted}>сегодня, взносы уже внутри</div>}
                  </td>
                  <td>{formatMoney(r.contribution)}</td>
                  <td className={r.refundReceived > 0 ? table.positive : undefined}>{formatMoney(r.refundReceived)}</td>
                  <td>{formatSignedMoney(r.growth)}</td>
                  <td>{formatMoney(r.endValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Модель: взнос и возврат за прошлый год приходят в начале года, доходность начисляется на средний капитал года.
          В текущем году стоимость берётся из портфеля как есть, рост — только за оставшиеся месяцы. Это оценка, не обещание.
        </p>
      </section>
    </>
  )
}

/** Пустое поле — «не задан», тогда возврат считаем без ограничения по НДФЛ. */
function setNdfl(settings: IisSettings, year: number, raw: string): Record<number, number> {
  const next = { ...settings.ndflByYear }
  if (raw === '') delete next[year]
  else next[year] = Number(raw)
  return next
}

/** Один ожидаемый НДФЛ на все будущие годы; пусто — без ограничения возврата. */
function fillFuture(settings: IisSettings, currentYear: number, value: number | undefined): Record<number, number> {
  const next = { ...settings.ndflByYear }
  for (let year = currentYear + 1; year <= settings.closeYear + 1; year++) {
    if (value === undefined) delete next[year]
    else next[year] = value
  }
  return next
}

function buildAdvice(
  currentYear: number,
  thisYear: ReturnType<typeof deductionFor>,
  years: ReturnType<typeof contributionsByYear>,
  settings: IisSettings,
  holdEnd: Date,
): string[] {
  const advice: string[] = []
  const cap = formatMoney(settings.deductionCap)

  if (thisYear.excess > 0) {
    advice.push(
      `В ${currentYear} внесено ${formatMoney(thisYear.contributed)} — вычет считается только с ${cap}. Лишние ${formatMoney(thisYear.excess)} вычета не дают, но на ИИС-3 всё равно растут без налога, так что это не ошибка, если в следующем году ты всё равно внесёшь ${cap}.`,
    )
  } else if (thisYear.contributed < settings.deductionCap) {
    advice.push(`До лимита ${cap} в ${currentYear} осталось ${formatMoney(settings.deductionCap - thisYear.contributed)} — внести до 31 декабря, чтобы получить максимум возврата.`)
  }

  if (thisYear.ndfl === undefined) {
    advice.push(`Укажи уплаченный НДФЛ за ${currentYear} в таблице — возврат не может быть больше него.`)
  } else if (thisYear.limitedByNdfl) {
    advice.push(`Возврат за ${currentYear} упирается в уплаченный НДФЛ (${formatMoney(thisYear.ndfl)}): взносы сверх ${formatMoney((thisYear.ndfl * 100) / settings.ndflRate)} вычета уже не добавят.`)
  }

  advice.push(
    `На ИИС-3 деньги выгоднее заводить как можно раньше, а не в декабре: прибыль здесь не облагается налогом, и чем дольше она копится внутри, тем лучше. Ждать конца года имеет смысл только для тех денег, которые иначе лежали бы на вкладе.`,
  )
  advice.push(`Купоны и дивиденды, пришедшие на ИИС, реинвестируй сразу — они уже внутри, взносом не считаются, а простаивая, ничего не приносят.`)

  const nextNdfl = settings.ndflByYear[currentYear + 1]
  if (nextNdfl === 0) {
    advice.push(
      `В ${currentYear + 1} НДФЛ не ожидается — возврата за взносы ${currentYear + 1} не будет. Заводить деньги всё равно выгодно (безналоговый рост), но спешить к 31 декабря незачем.`,
    )
  } else if (nextNdfl === undefined) {
    advice.push(`Если в ${currentYear + 1} будет зарплата с НДФЛ не меньше ${formatMoney((settings.deductionCap * settings.ndflRate) / 100)}, взнос ${cap} в ${currentYear + 1} вернёт эти деньги целиком.`)
  }

  const claimable = years.filter((y) => y.year < currentYear && y.contributed > 0)
  for (const y of claimable) {
    advice.push(`Вычет за ${y.year} можно заявить до конца ${y.year + 3} года (3-НДФЛ или упрощённый порядок через ЛК ФНС).`)
  }

  advice.push(`Не выводить деньги и не закрывать счёт до ${formatDate(holdEnd)} — иначе полученные вычеты придётся вернуть, а прибыль обложат налогом.`)
  advice.push(
    `С точки зрения налогов на ИИС-3 лучше всего живут облигации (купоны освобождаются при закрытии) и фонды без выплат вроде TMOS (дивиденды внутри фонда не облагаются). Дивиденды акций облагаются 13 % в любом случае.`,
  )
  return advice
}
