import { useMemo } from 'react'
import { getPortfolio } from '../../api/portfolio'
import { useScopedQueries } from '../../shared/account/useScopedQueries'
import { buildSummary, type PortfolioSummary } from './model'

export function usePortfolio(): { summary: PortfolioSummary | undefined; isPending: boolean; error: Error | null } {
  const { data, isPending, error } = useScopedQueries('portfolio', (account, info) => getPortfolio(account, info.id))
  const summary = useMemo(() => (data ? buildSummary(data) : undefined), [data])
  return { summary, isPending, error }
}
