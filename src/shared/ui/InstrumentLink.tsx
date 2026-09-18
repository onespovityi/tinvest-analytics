import type { ReactNode } from 'react'
import { instrumentUrl, type LinkableInstrument } from '../tinvest/links'
import styles from './InstrumentLink.module.css'

interface Props {
  instrument: LinkableInstrument | undefined
  children: ReactNode
  className?: string
}

/** Название бумаги как ссылка в кабинет Т-Инвестиций; без данных об инструменте — просто текст. */
export function InstrumentLink({ instrument, children, className }: Props) {
  const url = instrument ? instrumentUrl(instrument) : undefined
  if (!url) return <span className={className}>{children}</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`${styles.link} ${className ?? ''}`} title="Открыть в Т-Инвестициях">
      {children}
    </a>
  )
}
