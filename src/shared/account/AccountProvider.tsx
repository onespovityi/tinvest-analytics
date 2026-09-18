import { useState, type ReactNode } from 'react'
import { AccountContext, type AccountSelection } from './accountContext'

export function AccountProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<AccountSelection>('all')
  return <AccountContext value={{ selection, setSelection }}>{children}</AccountContext>
}
