import { useQuery } from '@tanstack/react-query'
import { WEEK } from '../../app/queryClient'
import { ACCOUNT_KEYS } from '../../shared/account/accountContext'
import { loadBondScreener } from './bondScreener'
import { loadShareScreener } from './shareScreener'

const HOUR = 60 * 60 * 1000

/** Скринеры не зависят от счёта — ходим через первый токен и держим результат несколько часов. */
export function useBondScreener() {
  return useQuery({
    queryKey: ['screener-bonds'],
    queryFn: () => loadBondScreener(ACCOUNT_KEYS[0]),
    staleTime: 6 * HOUR,
    gcTime: WEEK,
  })
}

export function useShareScreener() {
  return useQuery({
    queryKey: ['screener-shares'],
    queryFn: () => loadShareScreener(ACCOUNT_KEYS[0]),
    staleTime: 6 * HOUR,
    gcTime: WEEK,
  })
}
