import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { getAccounts } from '../../api/accounts'
import type { Account, AccountKey } from '../../api/types'
import { useAccountScope } from './accountContext'

export interface ScopedResult<T> {
  account: AccountKey
  accountInfo: Account
  data: T
}

export interface ScopedQueriesState<T> {
  /** Результаты по каждому счёту из области выбора; есть только когда загрузились все. */
  data: ScopedResult<T>[] | undefined
  isPending: boolean
  error: Error | null
}

export interface AccountEntry {
  account: AccountKey
  info: Account
}

/** Токен выпущен на один счёт, поэтому GetAccounts вернёт ровно его — берём открытый. */
export async function loadAccount(account: AccountKey): Promise<AccountEntry> {
  const { accounts } = await getAccounts(account)
  const info = accounts.find((a) => a.status === 'ACCOUNT_STATUS_OPEN') ?? accounts[0]
  if (!info) throw new Error(`По токену «${account}» не найдено ни одного счёта`)
  return { account, info }
}

function combine<T>(results: UseQueryResult<T>[]) {
  const error = results.find((r) => r.error)?.error ?? null
  const isPending = !error && results.some((r) => r.isPending)
  return {
    error,
    isPending,
    data: error || isPending ? undefined : results.map((r) => r.data as T),
  }
}

/**
 * Выполняет один и тот же запрос по каждому счёту из текущего выбора (ИИС / брокерский / оба)
 * и собирает результаты в массив. Сначала резолвит accountId по токену, потом сам запрос.
 */
export function useScopedQueries<T>(
  queryKey: string,
  queryFn: (account: AccountKey, info: Account) => Promise<T>,
  staleTime = 60_000,
): ScopedQueriesState<T> {
  const scope = useAccountScope()

  const accounts = useQueries({
    queries: scope.map((account) => ({
      queryKey: ['account', account],
      queryFn: () => loadAccount(account),
      staleTime: Infinity,
    })),
    combine,
  })

  const results = useQueries({
    queries: (accounts.data ?? []).map(({ account, info }) => ({
      queryKey: [queryKey, account, info.id],
      queryFn: async (): Promise<ScopedResult<T>> => ({ account, accountInfo: info, data: await queryFn(account, info) }),
      staleTime,
    })),
    combine,
  })

  if (accounts.error) return { data: undefined, isPending: false, error: accounts.error }
  if (accounts.isPending) return { data: undefined, isPending: true, error: null }
  return results
}
