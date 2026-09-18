import type { InstrumentInfo } from '../../api/instruments'
import { formatDate, formatMoney } from '../../api/money'
import { InstrumentLink } from '../../shared/ui/InstrumentLink'
import { Stats } from '../../shared/ui/Stats'
import table from '../../shared/ui/table.module.css'
import type { Position } from '../portfolio/model'
import styles from './BondsSection.module.css'
import { useBondMetrics } from './useBondMetrics'

const CURRENCY_SIGN: Record<string, string> = { rub: '₽', cny: '¥', usd: '$', eur: '€' }

function pct(value: number | undefined, digits = 1): string {
  return value === undefined ? '…' : `${value.toFixed(digits)} %`
}

/** Облигации портфеля: доходность к погашению, дюрация, купонная доходность и средние по всем. */
export function BondsSection({ positions, instruments }: { positions: Position[]; instruments: Map<string, InstrumentInfo> }) {
  const bonds = useBondMetrics(positions, instruments)
  if (bonds.rows.length === 0) return null

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Облигации</h2>
      <Stats
        items={[
          { label: 'Доходность к погашению', value: bonds.isPending ? '…' : pct(bonds.avgYtm), hint: 'средняя по стоимости, в валюте номинала' },
          {
            label: 'Дюрация',
            value: bonds.isPending ? '…' : `${bonds.avgDuration.toFixed(1)} г.`,
            hint: `ставка +1 п.п. → цена ≈ −${bonds.avgDuration.toFixed(1)} %`,
          },
          { label: 'В облигациях', value: formatMoney(bonds.totalValue) },
        ]}
      />
      <div className={table.wrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th>Бумага</th>
              <th>Погашение</th>
              <th>Цена, % ном.</th>
              <th>Купон / год</th>
              <th>Текущая дох.</th>
              <th>К погашению</th>
              <th>Дюрация</th>
              <th>Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {bonds.rows.map((r) => {
              const sign = CURRENCY_SIGN[r.info.bond!.nominalCurrency.toLowerCase()] ?? r.info.bond!.nominalCurrency.toUpperCase()
              return (
                <tr key={r.position.instrumentUid}>
                  <td>
                    <InstrumentLink instrument={r.info}>{r.info.name}</InstrumentLink>
                    <div className={table.muted}>
                      {r.info.ticker}
                      {r.info.bond!.floating && ' · плавающий купон'}
                    </div>
                  </td>
                  <td>
                    {formatDate(r.info.bond!.maturityDate)}
                    <div className={table.muted}>{r.yearsLeft.toFixed(1)} г.</div>
                  </td>
                  <td>{r.pricePct.toFixed(1)}</td>
                  <td>
                    {r.couponPerYear.toFixed(2)} {sign}
                  </td>
                  <td>{pct(r.currentYield)}</td>
                  <td className={styles.strong}>{pct(r.metrics?.ytm)}</td>
                  <td>{r.metrics ? r.metrics.modified.toFixed(1) : '…'}</td>
                  <td>{formatMoney(r.position.value)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Доходность к погашению — по «грязной» цене (с НКД) и графику купонов из API; для валютных бумаг — в валюте номинала.
        Дюрация модифицированная: примерное изменение цены в процентах при сдвиге доходности на 1 п.п.
      </p>
    </section>
  )
}
