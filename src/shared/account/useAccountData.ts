import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getAllOperations } from '../../api/operations'
import { getPortfolio } from '../../api/portfolio'
import type { Account, AccountKey, OperationItem, PortfolioResponse } from '../../api/types'
import { toOperation, type Operation } from '../../features/operations/model'
import { loadAccount, type ScopedResult } from './useScopedQueries'

export interface AccountData {
  info: Account | undefined
  portfolio: PortfolioResponse | undefined
  operations: Operation[] | undefined
  isPending: boolean
  error: Error | null
}

/**
 * Данные одного конкретного счёта независимо от переключателя в шапке.
 * Ключи запросов те же, что у useScopedQueries, поэтому кэш общий.
 */
export function useAccountData(account: AccountKey): AccountData {
  const info = useQuery({
    queryKey: ['account', account],
    queryFn: () => loadAccount(account),
    staleTime: Infinity,
  })
  const acc = info.data?.info

  const portfolio = useQuery({
    queryKey: ['portfolio', account, acc?.id],
    queryFn: async (): Promise<ScopedResult<PortfolioResponse>> => ({
      account,
      accountInfo: acc!,
      data: await getPortfolio(account, acc!.id),
    }),
    enabled: Boolean(acc),
    staleTime: 60_000,
  })

  const operations = useQuery({
    queryKey: ['operations', account, acc?.id],
    queryFn: async (): Promise<ScopedResult<OperationItem[]>> => ({
      account,
      accountInfo: acc!,
      data: await getAllOperations(account, acc!.id, acc!.openedDate, new Date().toISOString()),
    }),
    enabled: Boolean(acc),
    staleTime: 5 * 60_000,
  })

  const ops = useMemo(
    () => operations.data?.data.map((raw) => toOperation(raw, account)).sort((a, b) => b.date.getTime() - a.date.getTime()),
    [operations.data, account],
  )

  return {
    info: acc,
    portfolio: portfolio.data?.data,
    operations: ops,
    isPending: info.isPending || portfolio.isPending || operations.isPending,
    error: info.error ?? portfolio.error ?? operations.error,
  }
}
