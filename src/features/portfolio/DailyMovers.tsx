import type { InstrumentInfo } from '../../api/instruments'
import { formatMoney, formatPercent, formatSignedMoney } from '../../api/money'
import { InstrumentLink } from '../../shared/ui/InstrumentLink'
import styles from './DailyMovers.module.css'
import { dailyPercent, type Position } from './model'

interface Props {
  positions: Position[]
  instruments: Map<string, InstrumentInfo>
  total: number
}

/**
 * Кто двигал портфель сегодня: бумаги по вкладу в рублях, от лучшей к худшей.
 * Ширина полосы — доля бумаги в сумме всех дневных движений, так видно, кто определил итог.
 */
export function DailyMovers({ positions, instruments, total }: Props) {
  const movers = positions
    .filter((p) => Math.abs(p.dailyYield) >= 0.5 && p.instrumentType !== 'currency')
    .sort((a, b) => b.dailyYield - a.dailyYield)

  if (movers.length === 0) return <p className={styles.empty}>Сегодня цены не менялись — торгов ещё не было.</p>

  const maxAbs = Math.max(...movers.map((m) => Math.abs(m.dailyYield)))
  const gains = movers.filter((m) => m.dailyYield > 0).reduce((acc, m) => acc + m.dailyYield, 0)
  const losses = movers.filter((m) => m.dailyYield < 0).reduce((acc, m) => acc + m.dailyYield, 0)

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <span className={styles.positive}>рост {formatSignedMoney(gains)}</span>
        <span className={styles.negative}>падение {formatSignedMoney(losses)}</span>
        <span className={styles.net}>итого {formatSignedMoney(gains + losses)}</span>
      </div>
      <ul className={styles.list}>
        {movers.map((p) => {
          const info = instruments.get(p.instrumentUid)
          const up = p.dailyYield > 0
          return (
            <li key={p.instrumentUid} className={styles.row}>
              <span className={styles.name}>
                <InstrumentLink instrument={info}>{info?.name ?? p.ticker ?? p.figi}</InstrumentLink>
              </span>
              {/* полоса влево от центра — падение, вправо — рост */}
              <span className={styles.track}>
                <span className={styles.half}>
                  {!up && (
                    <span
                      className={`${styles.bar} ${styles.barDown}`}
                      style={{ width: `${(Math.abs(p.dailyYield) / maxAbs) * 100}%` }}
                    />
                  )}
                </span>
                <span className={styles.half}>
                  {up && <span className={`${styles.bar} ${styles.barUp}`} style={{ width: `${(p.dailyYield / maxAbs) * 100}%` }} />}
                </span>
              </span>
              <span className={`${styles.value} ${up ? styles.positive : styles.negative}`}>{formatSignedMoney(p.dailyYield)}</span>
              <span className={`${styles.pct} ${up ? styles.positive : styles.negative}`}>{formatPercent(dailyPercent(p))}</span>
              <span className={styles.share} title="доля бумаги в портфеле">
                {total > 0 ? `${((p.value / total) * 100).toFixed(0)} %` : ''}
              </span>
            </li>
          )
        })}
      </ul>
      <p className={styles.note}>
        Столбец справа — доля бумаги в портфеле: падение крупной позиции весит больше, чем такое же падение мелкой.
        Всего в портфеле {formatMoney(total)}.
      </p>
    </div>
  )
}
