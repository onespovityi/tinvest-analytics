import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getLastPrices } from '../../api/marketdata'
import { toNumber } from '../../api/money'
import { ACCOUNT_KEYS } from '../account/accountContext'

/** FIGI валютных пар на Мосбирже — курс «валюта → рубль». */
export const CURRENCY_FIGI: Record<string, string> = {
  usd: 'BBG0013HGFT4',
  eur: 'BBG0013HJJ31',
  cny: 'BBG0013HRTL0',
  hkd: 'BBG0013HSW87',
}

export type ToRub = (amount: number, currency: string) => number

/**
 * Курсы валют к рублю по последним сделкам. Нужны, чтобы складывать суммы
 * из операций и выплат — они приходят в валюте инструмента, а не в рублях.
 */
export function useRates(): { toRub: ToRub; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['rates'],
    queryFn: async () => {
      const prices = await getLastPrices(ACCOUNT_KEYS[0], Object.values(CURRENCY_FIGI))
      const rates = new Map<string, number>([['rub', 1]])
      for (const [currency, figi] of Object.entries(CURRENCY_FIGI)) {
        const price = prices.find((p) => p.figi === figi)
        if (price) rates.set(currency, toNumber(price.price))
      }
      return rates
    },
    staleTime: 10 * 60_000,
  })

  const toRub = useCallback<ToRub>(
    (amount, currency) => amount * (data?.get(currency.toLowerCase()) ?? 1),
    [data],
  )

  return { toRub, isPending }
}
