import { toNumber } from '../../api/money'
import type { AccountKey, OperationItem } from '../../api/types'

export type OperationCategory = 'deal' | 'income' | 'cash' | 'fee' | 'tax' | 'other'

export const CATEGORY_LABELS: Record<OperationCategory, string> = {
  deal: 'Сделки',
  income: 'Выплаты',
  cash: 'Пополнения / выводы',
  fee: 'Комиссии',
  tax: 'Налоги',
  other: 'Прочее',
}

export const CATEGORY_ORDER: OperationCategory[] = ['deal', 'income', 'cash', 'fee', 'tax', 'other']

/** Операция в числах, с привязкой к счёту, откуда пришла. */
export interface Operation {
  id: string
  account: AccountKey
  date: Date
  type: string
  description: string
  category: OperationCategory
  name: string
  instrumentUid: string
  positionUid: string
  instrumentType: string
  quantity: number
  price: number
  payment: number
  currency: string
}

/** Категория по enum-типу: порядок проверок важен (DIVIDEND_TAX — налог, а не выплата). */
export function categorize(type: string): OperationCategory {
  if (/TAX/.test(type)) return 'tax'
  if (/FEE/.test(type)) return 'fee'
  if (/DIVIDEND|COUPON/.test(type)) return 'income'
  if (/INPUT|OUTPUT|INP_MULTI|OUT_MULTI/.test(type)) return 'cash'
  if (/BUY|SELL|REPAYMENT/.test(type)) return 'deal'
  return 'other'
}

export function toOperation(raw: OperationItem, account: AccountKey): Operation {
  return {
    id: raw.id,
    account,
    date: new Date(raw.date),
    type: raw.type,
    description: raw.description,
    category: categorize(raw.type),
    name: raw.name,
    instrumentUid: raw.instrumentUid,
    positionUid: raw.positionUid,
    instrumentType: raw.instrumentType,
    quantity: Number(raw.quantityDone || raw.quantity || 0),
    price: toNumber(raw.price),
    payment: toNumber(raw.payment),
    currency: raw.payment?.currency ?? 'rub',
  }
}

export const isDividend = (op: Operation) => op.category === 'income' && /DIVIDEND/.test(op.type)
export const isCoupon = (op: Operation) => op.category === 'income' && /COUPON/.test(op.type)
export const isRepayment = (op: Operation) => /REPAYMENT/.test(op.type)

/**
 * Внешний денежный поток операции: плюс — деньги пришли на счёт извне, минус — ушли.
 * «Покупка с карты» сюда не входит: брокер проводит её как отдельное пополнение плюс покупку.
 */
export function externalFlow(op: Operation): number {
  return op.category === 'cash' ? op.payment : 0
}
