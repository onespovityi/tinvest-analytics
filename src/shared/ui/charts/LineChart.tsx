import { useEffect, useRef, useState, type MouseEvent } from 'react'
import styles from './LineChart.module.css'
import { SERIES } from './palette'

export interface LineSeries {
  name: string
  values: (number | null)[]
  color?: string
  dashed?: boolean
}

interface Props {
  title: string
  labels: Date[]
  series: LineSeries[]
  format: (value: number) => string
  formatLabel: (date: Date) => string
}

const HEIGHT = 280
const PAD = { top: 16, right: 16, bottom: 28, left: 8 }

function niceStep(span: number): number {
  const raw = span / 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const norm = raw / pow
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow
}

function compact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`
  if (abs >= 1_000) return `${Math.round(value / 1_000)} тыс.`
  return String(Math.round(value))
}

/** Ширину меряем сами: SVG с фиксированным viewBox растянул бы текст. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** Линии по дням: сетка, легенда, перекрестие и тултип со всеми сериями на выбранный день. */
export function LineChart({ title, labels, series, format, formatLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hovered, setHovered] = useState<number | null>(null)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const n = labels.length

  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const rawMin = Math.min(...all)
  const rawMax = Math.max(...all)
  const step = niceStep(rawMax - rawMin || rawMax || 1)
  // деньги считаем от нуля; небольшой минус (например, «вложено» после вывода прибыли) не должен
  // утаскивать ось на целый шаг вниз — округляем его мельче, а линии сетки оставляем на круглых числах
  const fine = step / 10
  const yMin = rawMin >= -Math.abs(rawMax) * 1e-9 ? 0 : Math.floor(rawMin / fine) * fine
  const yMax = Math.ceil(rawMax / step) * step || step

  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH

  const ticks: number[] = []
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + step / 2; v += step) ticks.push(v)

  // подписи оси X: ~6 штук, равномерно
  const labelEvery = Math.max(1, Math.ceil(n / 6))

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left - PAD.left
    const i = Math.round((px / plotW) * (n - 1))
    setHovered(Math.max(0, Math.min(n - 1, i)))
  }

  const path = (values: (number | null)[]) => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <ul className={styles.legend}>
          {series.map((s, i) => (
            <li key={s.name} className={styles.legendItem}>
              <span className={`${styles.swatch} ${s.dashed ? styles.swatchDashed : ''}`} style={{ borderColor: s.color ?? SERIES[i] }} />
              {s.name}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.plot} ref={ref}>
        {n === 0 || all.length === 0 ? (
          <div className={styles.empty}>Нет данных</div>
        ) : (
          <svg
            width={width}
            height={HEIGHT}
            className={styles.svg}
            role="img"
            aria-label={title}
            onMouseMove={onMove}
            onMouseLeave={() => setHovered(null)}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className={styles.grid} />
                <text x={PAD.left} y={y(v) - 4} className={styles.tick}>
                  {compact(v)}
                </text>
              </g>
            ))}
            {labels.map((d, i) =>
              i % labelEvery === 0 && i < n - labelEvery / 2 ? (
                <text key={i} x={x(i)} y={HEIGHT - 8} className={styles.axisLabel} textAnchor={i === 0 ? 'start' : 'middle'}>
                  {formatLabel(d)}
                </text>
              ) : null,
            )}
            {series.map((s, i) => (
              <path
                key={s.name}
                d={path(s.values)}
                fill="none"
                stroke={s.color ?? SERIES[i]}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                strokeLinejoin="round"
              />
            ))}
            {hovered !== null && (
              <g>
                <line x1={x(hovered)} x2={x(hovered)} y1={PAD.top} y2={PAD.top + plotH} className={styles.crosshair} />
                {series.map((s, i) => {
                  const v = s.values[hovered]
                  return v === null ? null : (
                    <circle key={s.name} cx={x(hovered)} cy={y(v)} r={4} fill={s.color ?? SERIES[i]} className={styles.marker} />
                  )
                })}
              </g>
            )}
          </svg>
        )}
        {hovered !== null && n > 0 && (
          <div
            className={styles.tooltip}
            style={{ left: x(hovered), transform: `translateX(${hovered > n / 2 ? '-100%' : '0'})` }}
          >
            <div className={styles.tooltipTitle}>{formatLabel(labels[hovered])}</div>
            {series.map((s, i) => {
              const v = s.values[hovered]
              return v === null ? null : (
                <div key={s.name} className={styles.tooltipRow}>
                  <span className={styles.dot} style={{ background: s.color ?? SERIES[i] }} />
                  <span>{s.name}</span>
                  <span className={styles.tooltipValue}>{format(v)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
