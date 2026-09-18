import type { MoneyValue, Quotation } from './types'

/** units/nano → обычное число. */
export function toNumber(value: Quotation | MoneyValue | undefined): number {
  if (!value) return 0
  return Number(value.units) + value.nano / 1e9
}

const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number, currency = 'RUB'): string {
  const code = currency.toUpperCase()
  let fmt = moneyFormatters.get(code)
  if (!fmt) {
    fmt = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: code, maximumFractionDigits: 2 })
    moneyFormatters.set(code, fmt)
  }
  // округляем до копеек заранее, иначе -0.001 превратится в «-0,00»
  return fmt.format(Math.round(amount * 100) / 100 + 0)
}

/** Сумма со знаком: «+1 234 ₽» / «−1 234 ₽». */
export function formatSignedMoney(amount: number, currency = 'RUB'): string {
  const sign = amount > 0 ? '+' : ''
  return sign + formatMoney(amount, currency)
}

export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)} %`
}

const quantityFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 })

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value)
}

export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('ru-RU')
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** «сен 26» — подпись месяца для осей и группировок. */
export function formatMonth(date: Date): string {
  return `${MONTHS_SHORT[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`
}

/** Ключ месяца вида 2026-09 — для группировки. */
export function monthKey(iso: string | Date): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
