import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getInstrument, type InstrumentInfo } from '../../api/instruments'
import type { AccountKey, InstrumentType } from '../../api/types'
import type { Position } from '../portfolio/model'

const DAY = 24 * 60 * 60 * 1000

/** Что нужно, чтобы запросить справочник: uid, тип (у каждого свой метод) и токен, через который ходить. */
export interface InstrumentRef {
  uid: string
  type: InstrumentType
  account: AccountKey
}

/**
 * Справочные данные по инструментам (название, сектор, погашение).
 * Они не зависят от счёта, поэтому запрашиваем через любой доступный токен
 * и держим в кэше сутки — меняются они крайне редко.
 */
export function useInstruments(refs: InstrumentRef[] | undefined): Map<string, InstrumentInfo> {
  const results = useQueries({
    queries: (refs ?? []).map((ref) => ({
      queryKey: ['instrument', ref.uid],
      queryFn: () => getInstrument(ref.account, ref.type, ref.uid),
      staleTime: DAY,
      gcTime: DAY,
    })),
    combine: (rs) => rs.map((r) => r.data),
  })

  return useMemo(() => {
    const map = new Map<string, InstrumentInfo>()
    for (const info of results) if (info) map.set(info.uid, info)
    return map
  }, [results])
}

export function refsFromPositions(positions: Position[]): InstrumentRef[] {
  return positions.map((p) => ({ uid: p.instrumentUid, type: p.instrumentType, account: p.accounts[0] }))
}

/** Справочник по текущим позициям портфеля. */
export function usePositionInstruments(positions: Position[] | undefined): Map<string, InstrumentInfo> {
  const refs = useMemo(() => (positions ? refsFromPositions(positions) : undefined), [positions])
  return useInstruments(refs)
}
