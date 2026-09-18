import { request } from './client'
import type { AccountKey, GetAccountsResponse } from './types'

export function getAccounts(account: AccountKey) {
  return request<GetAccountsResponse>(account, 'UsersService', 'GetAccounts')
}
