import type { ReactNode } from 'react'
import styles from './Stats.module.css'

export interface StatItem {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** Число, по знаку которого красим значение; 0 или undefined — нейтрально. */
  tone?: number
}

function toneClass(value: number | undefined): string | undefined {
  if (!value) return undefined
  return value > 0 ? styles.positive : styles.negative
}

export function Stats({ items }: { items: StatItem[] }) {
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <div key={item.label} className={styles.card}>
          <div className={styles.label}>{item.label}</div>
          <div className={`${styles.value} ${toneClass(item.tone) ?? ''}`} title={typeof item.value === 'string' ? item.value : undefined}>
            {item.value}
          </div>
          {item.hint && <div className={styles.hint}>{item.hint}</div>}
        </div>
      ))}
    </div>
  )
}
