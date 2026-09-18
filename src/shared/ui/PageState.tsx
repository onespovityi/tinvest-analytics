import styles from './PageState.module.css'

export function Loading({ text = 'Загрузка…' }: { text?: string }) {
  return <div className={styles.state}>{text}</div>
}

export function ErrorState({ error }: { error: Error }) {
  return <div className={`${styles.state} ${styles.error}`}>{error.message}</div>
}

export function Empty({ text }: { text: string }) {
  return <div className={styles.state}>{text}</div>
}
