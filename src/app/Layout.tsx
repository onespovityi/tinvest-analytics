import { NavLink, Outlet } from 'react-router-dom'
import { ACCOUNT_KEYS, ACCOUNT_LABELS, useAccount, type AccountSelection } from '../shared/account/accountContext'
import { Segmented } from '../shared/ui/Segmented'
import styles from './Layout.module.css'

const ACCOUNT_OPTIONS = (['all', ...ACCOUNT_KEYS] as AccountSelection[]).map((value) => ({
  value,
  label: ACCOUNT_LABELS[value],
}))

const PAGES = [
  { to: '/', label: 'Портфель' },
  { to: '/operations', label: 'Операции' },
  { to: '/payments', label: 'Выплаты' },
  { to: '/allocation', label: 'Структура' },
  { to: '/history', label: 'Аналитика' },
  { to: '/iis', label: 'ИИС' },
]

export function Layout() {
  const { selection, setSelection } = useAccount()

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.title}>T-Invest Analytics</span>
        <nav className={styles.nav}>
          {PAGES.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              end={page.to === '/'}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
            >
              {page.label}
            </NavLink>
          ))}
        </nav>
        <Segmented options={ACCOUNT_OPTIONS} value={selection} onChange={setSelection} />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
