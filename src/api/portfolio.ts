import { request } from './client'
import type { AccountKey, PortfolioResponse } from './types'

export function getPortfolio(account: AccountKey, accountId: string) {
  return request<PortfolioResponse>(account, 'OperationsService', 'GetPortfolio', {
    accountId,
    currency: 'RUB',
  })
}
