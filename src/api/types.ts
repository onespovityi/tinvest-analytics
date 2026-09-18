/** Денежная сумма: units — целая часть, nano — дробная (1e-9). */
export interface MoneyValue {
  currency: string
  units: string
  nano: number
}

/** Число без валюты, тот же формат units/nano. */
export interface Quotation {
  units: string
  nano: number
}

export type AccountKey = 'iis' | 'broker'

export interface Account {
  id: string
  type: string
  name: string
  status: string
  openedDate: string
  accessLevel: string
}

export interface GetAccountsResponse {
  accounts: Account[]
}

export type InstrumentType = 'share' | 'bond' | 'etf' | 'currency' | 'futures' | 'option' | 'sp'

export interface PortfolioPosition {
  figi: string
  instrumentUid: string
  positionUid: string
  instrumentType: InstrumentType
  ticker?: string
  quantity: Quotation
  averagePositionPrice: MoneyValue
  averagePositionPriceFifo: MoneyValue
  currentPrice: MoneyValue
  currentNkd: MoneyValue
  expectedYield: Quotation
  expectedYieldFifo: Quotation
  dailyYield: MoneyValue
  blocked: boolean
}

export interface PortfolioResponse {
  accountId: string
  totalAmountShares: MoneyValue
  totalAmountBonds: MoneyValue
  totalAmountEtf: MoneyValue
  totalAmountCurrencies: MoneyValue
  totalAmountFutures: MoneyValue
  totalAmountOptions: MoneyValue
  totalAmountSp: MoneyValue
  totalAmountPortfolio: MoneyValue
  /** Относительная доходность портфеля, в процентах. */
  expectedYield: Quotation
  dailyYield: MoneyValue
  dailyYieldRelative: Quotation
  positions: PortfolioPosition[]
}

/** Элемент ответа GetOperationsByCursor. `type` — enum вида OPERATION_TYPE_BUY, `description` — текст по-русски. */
export interface OperationItem {
  id: string
  parentOperationId?: string
  brokerAccountId: string
  name: string
  date: string
  type: string
  description: string
  state: string
  instrumentUid: string
  positionUid: string
  figi: string
  instrumentType: string
  payment: MoneyValue
  price: MoneyValue
  commission: MoneyValue
  yield: MoneyValue
  accruedInt: MoneyValue
  quantity: string
  quantityDone: string
}

export interface GetOperationsByCursorResponse {
  hasNext: boolean
  nextCursor: string
  items: OperationItem[]
}

/** Сырой ответ ShareBy / BondBy / EtfBy / CurrencyBy — берём только общие и нужные поля. */
export interface RawInstrument {
  uid: string
  figi: string
  ticker: string
  name: string
  currency: string
  isin?: string
  lot?: number
  countryOfRisk?: string
  countryOfRiskName?: string
  sector?: string
  // bond
  maturityDate?: string
  nominal?: MoneyValue
  couponQuantityPerYear?: number
  floatingCouponFlag?: boolean
  riskLevel?: string
  // etf
  focusType?: string
}

export interface Coupon {
  figi: string
  couponDate: string
  couponNumber: string
  payOneBond: MoneyValue
  couponType: string
  couponStartDate: string
  couponEndDate: string
}

export interface Candle {
  open: Quotation
  high: Quotation
  low: Quotation
  close: Quotation
  volume: string
  time: string
  isComplete: boolean
}

export interface GetBondCouponsResponse {
  events: Coupon[]
}

export interface Dividend {
  dividendNet: MoneyValue
  paymentDate: string
  declaredDate: string
  lastBuyDate: string
  recordDate: string
  dividendType: string
}

export interface GetDividendsResponse {
  dividends: Dividend[]
}
