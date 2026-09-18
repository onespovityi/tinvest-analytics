import { request } from './client'
import { toNumber } from './money'
import type {
  AccountKey,
  Coupon,
  Dividend,
  GetBondCouponsResponse,
  GetDividendsResponse,
  InstrumentType,
  RawInstrument,
} from './types'

/** Единое описание инструмента, независимо от типа. */
export interface InstrumentInfo {
  uid: string
  figi: string
  ticker: string
  isin: string
  name: string
  type: InstrumentType
  currency: string
  /** Размер лота — торговать можно только кратно ему. */
  lot: number
  sector: string
  countryOfRisk: string
  /** Только для фондов: equity / fixed_income / mixed_allocation… */
  focusType: string
  bond?: {
    maturityDate: string
    nominal: number
    nominalCurrency: string
    couponsPerYear: number
    floating: boolean
    riskLevel: string
  }
}

// у каждого типа свой метод; у них разный набор полей (сектор, погашение…)
const METHOD_BY_TYPE: Partial<Record<InstrumentType, string>> = {
  share: 'ShareBy',
  bond: 'BondBy',
  etf: 'EtfBy',
  currency: 'CurrencyBy',
  futures: 'FutureBy',
  option: 'OptionBy',
}

export async function getInstrument(account: AccountKey, type: InstrumentType, uid: string): Promise<InstrumentInfo> {
  const method = METHOD_BY_TYPE[type] ?? 'GetInstrumentBy'
  const { instrument } = await request<{ instrument: RawInstrument }>(account, 'InstrumentsService', method, {
    idType: 'INSTRUMENT_ID_TYPE_UID',
    id: uid,
  })

  const info: InstrumentInfo = {
    uid: instrument.uid,
    figi: instrument.figi,
    ticker: instrument.ticker,
    isin: instrument.isin ?? '',
    name: instrument.name,
    type,
    currency: instrument.currency,
    lot: instrument.lot ?? 1,
    sector: instrument.sector ?? '',
    countryOfRisk: instrument.countryOfRisk ?? '',
    focusType: instrument.focusType ?? '',
  }

  if (type === 'bond' && instrument.maturityDate) {
    info.bond = {
      maturityDate: instrument.maturityDate,
      nominal: toNumber(instrument.nominal),
      nominalCurrency: instrument.nominal?.currency ?? instrument.currency,
      couponsPerYear: instrument.couponQuantityPerYear ?? 0,
      floating: instrument.floatingCouponFlag ?? false,
      riskLevel: instrument.riskLevel ?? '',
    }
  }

  return info
}

export async function getBondCoupons(account: AccountKey, uid: string, from: string, to: string): Promise<Coupon[]> {
  const res = await request<GetBondCouponsResponse>(account, 'InstrumentsService', 'GetBondCoupons', {
    instrumentId: uid,
    from,
    to,
  })
  return res.events ?? []
}

export async function getDividends(account: AccountKey, uid: string, from: string, to: string): Promise<Dividend[]> {
  const res = await request<GetDividendsResponse>(account, 'InstrumentsService', 'GetDividends', {
    instrumentId: uid,
    from,
    to,
  })
  return res.dividends ?? []
}

/** Инструмент по тикеру и классу (например, TMOS в TQTF) — нужно для бенчмарков. */
export async function getInstrumentByTicker(account: AccountKey, classCode: string, ticker: string): Promise<InstrumentInfo> {
  const { instrument } = await request<{ instrument: RawInstrument & { instrumentType: string } }>(
    account,
    'InstrumentsService',
    'GetInstrumentBy',
    { idType: 'INSTRUMENT_ID_TYPE_TICKER', classCode, id: ticker },
  )
  return getInstrument(account, instrument.instrumentType as InstrumentType, instrument.uid)
}

export interface FoundInstrument {
  uid: string
  ticker: string
  name: string
  classCode: string
  instrumentType: string
  apiTradeAvailableFlag: boolean
}

/**
 * Все листинги бумаги по тикеру: один и тот же фонд может жить под несколькими uid
 * (TMOS на TQTF уже не торгуется, TMOS@ на SPBRU — торгуется), у каждого своя история свечей.
 */
export async function findInstrumentVariants(account: AccountKey, ticker: string, type: InstrumentType): Promise<FoundInstrument[]> {
  const res = await request<{ instruments: FoundInstrument[] }>(account, 'InstrumentsService', 'FindInstrument', {
    query: ticker,
  })
  return (res.instruments ?? []).filter((i) => i.instrumentType === type && i.ticker.replace(/@$/, '') === ticker)
}
