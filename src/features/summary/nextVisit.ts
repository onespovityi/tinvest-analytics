import { formatMoney } from '../../api/money'
import type { IisSettings } from '../iis/rules'
import type { UpcomingPayment } from '../payments/useUpcomingPayments'

const DAY_MS = 24 * 60 * 60 * 1000

/** Раз в месяц заглянуть на структуру — достаточно, если ничего не происходит. */
const ROUTINE_DAYS = 30

export interface NextVisit {
  date: Date
  reason: string
}

interface IisContext {
  contributedThisYear: number
  settings: IisSettings
  holdEnd: Date
}

/**
 * Когда в следующий раз есть смысл открыть приложение: ближайшее из событий, требующих действия.
 * Выплаты — потому что деньги надо реинвестировать; даты ИИС — потому что их легко прозевать.
 */
export function nextVisit(now: Date, payments: UpcomingPayment[], iis: IisContext | null): NextVisit {
  const candidates: NextVisit[] = []

  const payment = payments.find((p) => p.date > now)
  if (payment) {
    const what = payment.kind === 'maturity' ? 'погашение' : payment.kind === 'coupon' ? 'купон' : 'дивиденд'
    candidates.push({
      date: payment.date,
      reason: `${what} ${payment.name} — ${formatMoney(payment.total, payment.currency)}, реинвестировать`,
    })
  }

  if (iis) {
    const year = now.getFullYear()
    const january = new Date(year + 1, 0, 10)
    candidates.push({ date: january, reason: `заявить вычет за ${year} год` })

    if (iis.contributedThisYear < iis.settings.deductionCap) {
      const december = new Date(year, 11, 1)
      if (december > now) candidates.push({ date: december, reason: 'проверить, добит ли лимит вычета за год' })
    }

    const closeWindow = new Date(iis.holdEnd.getTime() - 60 * DAY_MS)
    if (closeWindow > now) candidates.push({ date: closeWindow, reason: 'через два месяца ИИС можно закрывать — решить, что дальше' })
  }

  candidates.push({ date: new Date(now.getTime() + ROUTINE_DAYS * DAY_MS), reason: 'плановая проверка структуры (раз в месяц достаточно)' })

  return candidates.sort((a, b) => a.date.getTime() - b.date.getTime())[0]
}
