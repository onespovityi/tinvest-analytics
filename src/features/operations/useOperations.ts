import { useMemo } from 'react'
import { getAllOperations } from '../../api/operations'
import type { OperationItem } from '../../api/types'
import { useScopedQueries, type ScopedResult } from '../../shared/account/useScopedQueries'
import { toOperation, type Operation } from './model'

/** Вся история операций по выбранным счетам — с даты открытия счёта по сегодня, новые сверху. */
export function useOperations(): { operations: Operation[] | undefined; isPending: boolean; error: Error | null } {
  const { data, isPending, error } = useScopedQueries<OperationItem[]>(
    'operations',
    (account, info) => getAllOperations(account, info.id, info.openedDate, new Date().toISOString()),
    5 * 60_000,
  )

  const operations = useMemo(() => (data ? flatten(data) : undefined), [data])
  return { operations, isPending, error }
}

function flatten(entries: ScopedResult<OperationItem[]>[]): Operation[] {
  return entries
    .flatMap(({ account, data }) => data.map((raw) => toOperation(raw, account)))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}
