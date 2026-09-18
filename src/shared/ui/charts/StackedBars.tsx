import { useState } from 'react'
import { SERIES } from './palette'
import styles from './StackedBars.module.css'

export interface BarColumn {
  label: string
  values: number[]
}

interface Props {
  title: string
  series: string[]
  columns: BarColumn[]
  format: (value: number) => string
  /** Цвета серий; по умолчанию — категориальная палитра по порядку. */
  colors?: string[]
}

const HEIGHT = 220
const PAD_TOP = 12
const PAD_BOTTOM = 28
const PAD_LEFT = 8
const PAD_RIGHT = 8
const GAP = 2

/** Красивый шаг сетки: 1/2/5 × 10^n, чтобы линий было 3–5. */
function niceStep(max: number): number {
  if (max <= 0) return 1
  const raw = max / 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / pow
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * pow
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`
  if (value >= 1_000) return `${Math.round(value / 1_000)} тыс.`
  return String(Math.round(value))
}

/** Столбцы с накоплением по сериям, сетка, легенда и тултип на колонку. */
export function StackedBars({ title, series, columns, format, colors = SERIES }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)

  const totals = columns.map((c) => c.values.reduce((a, b) => a + b, 0))
  const max = Math.max(0, ...totals)
  const step = niceStep(max)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const width = Math.max(320, columns.length * 44)
  const plotW = width - PAD_LEFT - PAD_RIGHT
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM
  const slot = columns.length > 0 ? plotW / columns.length : plotW
  const barW = Math.min(28, slot * 0.6)
  const y = (v: number) => PAD_TOP + plotH - (v / top) * plotH

  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)

  const active = hovered === null ? null : columns[hovered]

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <ul className={styles.legend}>
          {series.map((name, i) => (
            <li key={name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: colors[i] }} />
              {name}
            </li>
          ))}
        </ul>
      </div>
      {columns.length === 0 || max === 0 ? (
        <div className={styles.empty}>Нет данных</div>
      ) : (
        <div className={styles.plot}>
          <svg viewBox={`0 0 ${width} ${HEIGHT}`} className={styles.svg} role="img" aria-label={title}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={y(v)} y2={y(v)} className={styles.grid} />
                <text x={PAD_LEFT} y={y(v) - 3} className={styles.tick}>
                  {v > 0 ? compact(v) : ''}
                </text>
              </g>
            ))}
            {columns.map((column, ci) => {
              const cx = PAD_LEFT + slot * ci + slot / 2
              let acc = 0
              return (
                <g
                  key={column.label}
                  onMouseEnter={() => setHovered(ci)}
                  onMouseLeave={() => setHovered(null)}
                  className={hovered !== null && hovered !== ci ? styles.dimmed : undefined}
                >
                  {/* невидимая зона наведения на всю колонку — целиться в тонкий столбик неудобно */}
                  <rect x={cx - slot / 2} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
                  {column.values.map((v, si) => {
                    if (v <= 0) return null
                    const yTop = y(acc + v)
                    const yBottom = y(acc)
                    acc += v
                    const h = Math.max(0, yBottom - yTop - (acc - v > 0 ? GAP : 0))
                    return (
                      <rect
                        key={si}
                        x={cx - barW / 2}
                        y={yTop}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={colors[si]}
                      />
                    )
                  })}
                  <text x={cx} y={HEIGHT - 8} className={styles.axisLabel} textAnchor="middle">
                    {column.label}
                  </text>
                </g>
              )
            })}
          </svg>
          {active && hovered !== null && (
            <div className={styles.tooltip} style={{ left: `${((PAD_LEFT + slot * hovered + slot / 2) / width) * 100}%` }}>
              <div className={styles.tooltipTitle}>{active.label}</div>
              {series.map((name, i) =>
                active.values[i] > 0 ? (
                  <div key={name} className={styles.tooltipRow}>
                    <span className={styles.swatch} style={{ background: colors[i] }} />
                    <span>{name}</span>
                    <span className={styles.tooltipValue}>{format(active.values[i])}</span>
                  </div>
                ) : null,
              )}
              {series.length > 1 && (
                <div className={`${styles.tooltipRow} ${styles.tooltipTotal}`}>
                  <span />
                  <span>Итого</span>
                  <span className={styles.tooltipValue}>{format(totals[hovered])}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
