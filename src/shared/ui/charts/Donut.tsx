import { useMemo, useState } from 'react'
import styles from './Donut.module.css'
import { SERIES, foldSlices, type Slice } from './palette'

interface Props {
  title: string
  slices: Slice[]
  format: (value: number) => string
}

const SIZE = 180
const RADIUS = 80
const THICKNESS = 26

function arcPath(startAngle: number, endAngle: number): string {
  // угол считаем от 12 часов по часовой стрелке
  const toXY = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return [SIZE / 2 + r * Math.cos(rad), SIZE / 2 + r * Math.sin(rad)]
  }
  const outer = RADIUS
  const inner = RADIUS - THICKNESS
  const large = endAngle - startAngle > 180 ? 1 : 0
  const [sx, sy] = toXY(startAngle, outer)
  const [ex, ey] = toXY(endAngle, outer)
  const [isx, isy] = toXY(startAngle, inner)
  const [iex, iey] = toXY(endAngle, inner)
  return `M${sx},${sy} A${outer},${outer} 0 ${large} 1 ${ex},${ey} L${iex},${iey} A${inner},${inner} 0 ${large} 0 ${isx},${isy} Z`
}

interface Arc {
  path: string
  color: string
  slice: Slice
}

function buildArcs(slices: Slice[], total: number): Arc[] {
  const arcs: Arc[] = []
  let angle = 0
  slices.forEach((slice, i) => {
    const sweep = total > 0 ? (slice.value / total) * 360 : 0
    // полный круг одной дугой не рисуется — чуть не дотягиваем
    const end = Math.min(angle + sweep, angle + 359.99)
    arcs.push({ path: arcPath(angle, end), color: SERIES[i], slice })
    angle += sweep
  })
  return arcs
}

/** Кольцевая диаграмма долей с легендой-таблицей и подсветкой по наведению. */
export function Donut({ title, slices, format }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const folded = useMemo(() => foldSlices(slices), [slices])
  const total = folded.reduce((acc, s) => acc + s.value, 0)

  const arcs = buildArcs(folded, total)

  const active = hovered === null ? null : folded[hovered]

  return (
    <div className={styles.root}>
      <h3 className={styles.title}>{title}</h3>
      {total === 0 ? (
        <div className={styles.empty}>Нет данных</div>
      ) : (
        <div className={styles.body}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.svg} role="img" aria-label={title}>
            {arcs.map((arc, i) => (
              <path
                key={arc.slice.label}
                d={arc.path}
                fill={arc.color}
                className={`${styles.arc} ${hovered !== null && hovered !== i ? styles.dimmed : ''}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
            <text x={SIZE / 2} y={SIZE / 2 - 4} className={styles.centerLabel} textAnchor="middle">
              {active ? active.label : 'Всего'}
            </text>
            <text x={SIZE / 2} y={SIZE / 2 + 14} className={styles.centerValue} textAnchor="middle">
              {active ? `${((active.value / total) * 100).toFixed(1)} %` : format(total)}
            </text>
          </svg>
          <ul className={styles.legend}>
            {folded.map((slice, i) => (
              <li
                key={slice.label}
                className={`${styles.legendItem} ${hovered === i ? styles.legendActive : ''}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className={styles.swatch} style={{ background: SERIES[i] }} />
                <span className={styles.legendLabel}>{slice.label}</span>
                <span className={styles.legendPct}>{((slice.value / total) * 100).toFixed(1)} %</span>
                <span className={styles.legendValue}>{format(slice.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
