import { createContext, useContext } from 'react'
import type { AccountKey } from '../../api/types'

/** Что выбрано в шапке: конкретный счёт или оба сразу. */
export type AccountSelection = AccountKey | 'all'

export interface AccountContextValue {
  selection: AccountSelection
  setSelection: (selection: AccountSelection) => void
}

export const AccountContext = createContext<AccountContextValue | null>(null)

export const ACCOUNT_KEYS: AccountKey[] = ['iis', 'broker']

export const ACCOUNT_LABELS: Record<AccountSelection, string> = {
  all: 'Всего',
  iis: 'ИИС',
  broker: 'Брокерский',
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext)
  if (!value) throw new Error('useAccount вызван вне AccountProvider')
  return value
}

/** Список реальных счетов, по которым надо ходить в API при текущем выборе. */
export function useAccountScope(): AccountKey[] {
  const { selection } = useAccount()
  return selection === 'all' ? ACCOUNT_KEYS : [selection]
}
