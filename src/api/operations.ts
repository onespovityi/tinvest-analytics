import { request } from './client'
import type { AccountKey, GetOperationsByCursorResponse, OperationItem } from './types'

/**
 * Все исполненные операции по счёту за период. API отдаёт постранично (курсор),
 * докручиваем до конца. Овернайты исключены — это копеечные ежедневные записи,
 * которые только шумят в истории.
 */
export async function getAllOperations(
  account: AccountKey,
  accountId: string,
  from: string,
  to: string,
): Promise<OperationItem[]> {
  const items: OperationItem[] = []
  let cursor = ''

  for (;;) {
    const page = await request<GetOperationsByCursorResponse>(account, 'OperationsService', 'GetOperationsByCursor', {
      accountId,
      from,
      to,
      cursor,
      limit: 1000,
      state: 'OPERATION_STATE_EXECUTED',
      withoutTrades: true,
      withoutOvernights: true,
    })
    items.push(...page.items)
    if (!page.hasNext || !page.nextCursor) break
    cursor = page.nextCursor
  }

  return items
}
