import { QueryClient } from '@tanstack/react-query'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'

export const WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Что переживает перезагрузку: тяжёлое и редко меняющееся. Портфель и операции — нет,
 * они должны быть свежими при каждом заходе.
 */
const PERSISTED_KEYS = new Set([
  'candles',
  'coupons-history',
  'coupons-to-maturity',
  'instrument',
  'instrument-variants',
  'screener-bonds',
  'screener-shares',
])

/** Поднимать при несовместимом изменении формата кэша — старый просто выбросится. */
const CACHE_VERSION = 'v1'

const STORE_KEY = `tinvest-analytics:query-cache:${CACHE_VERSION}`

export const persister: Persister = {
  persistClient: (client: PersistedClient) => set(STORE_KEY, client),
  restoreClient: () => get<PersistedClient>(STORE_KEY),
  removeClient: () => del(STORE_KEY),
}

export const persistOptions = {
  persister,
  maxAge: WEEK,
  buster: CACHE_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { status: string } }) =>
      PERSISTED_KEYS.has(String(query.queryKey[0])) && query.state.status === 'success',
  },
}

// retry: false — при ошибке авторизации (плохой токен) нет смысла долбить API три раза
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})
