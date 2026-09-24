import styles from './PageState.module.css'

export function Loading({ text = 'Загрузка…' }: { text?: string }) {
  return <div className={styles.state}>{text}</div>
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className={`${styles.state} ${styles.error}`}>
      {error.message}
      {onRetry && (
        <div>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <div className={styles.state}>{text}</div>
}
