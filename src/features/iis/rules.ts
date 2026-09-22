import { isCoupon, isDividend, type Operation } from '../operations/model'

/**
 * Параметры ИИС-3, которые меняются законом или зависят от человека.
 * Всё редактируется на странице — правила по ИИС правят каждый год, зашивать их намертво нельзя.
 */
export interface IisSettings {
  /** База вычета на взносы за календарный год, ₽. */
  deductionCap: number
  /** Ставка НДФЛ, % — по ней считается возврат. */
  ndflRate: number
  /** Минимальный срок владения ИИС-3, лет (для открытых до 2027 — 5). */
  minYears: number
  /** Сколько лет старого ИИС засчитывается при переводе в ИИС-3. */
  convertedYearsCap: number
  /** Освобождение прибыли при закрытии — не больше этой суммы, ₽. */
  profitExemptionCap: number
  /** Уплаченный (или ожидаемый) НДФЛ по основной базе за год — зарплата и т.п. Год → ₽. */
  ndflByYear: Record<number, number>
  /** Планируемый взнос в год начиная со следующего года, ₽. */
  plannedContribution: number
  /** Ожидаемая доходность портфеля, % годовых. */
  expectedReturn: number
  /** Год закрытия ИИС (включительно). */
  closeYear: number
  /** Реинвестировать ли возврат НДФЛ обратно на ИИС. */
  reinvestRefund: boolean
}

export function defaultSettings(currentYear: number, minCloseYear: number): IisSettings {
  return {
    deductionCap: 400_000,
    ndflRate: 13,
    minYears: 5,
    convertedYearsCap: 3,
    profitExemptionCap: 30_000_000,
    // уплаченный НДФЛ по годам вводится на странице ИИС — у каждого свой
    ndflByYear: {},
    plannedContribution: 400_000,
    expectedReturn: 15,
    closeYear: Math.max(minCloseYear, currentYear + 5),
    reinvestRefund: true,
  }
}

/**
 * Дата, с которой ИИС-3 можно закрыть без потери льгот.
 * Для счёта, переведённого из старого ИИС, засчитывается не больше convertedYearsCap лет прошлого владения,
 * поэтому у открытых в 2023 срок — просто opened + minYears.
 */
export function minHoldingEnd(openedDate: Date, settings: IisSettings): Date {
  const end = new Date(openedDate)
  end.setFullYear(end.getFullYear() + settings.minYears)
  return end
}

export interface YearContribution {
  year: number
  contributed: number
  withdrawn: number
  coupons: number
  dividends: number
}

/** Взносы, выводы и выплаты по годам — только внешние деньги считаются взносом. */
export function contributionsByYear(operations: Operation[]): YearContribution[] {
  const byYear = new Map<number, YearContribution>()
  const get = (year: number) => {
    let row = byYear.get(year)
    if (!row) {
      row = { year, contributed: 0, withdrawn: 0, coupons: 0, dividends: 0 }
      byYear.set(year, row)
    }
    return row
  }
  for (const op of operations) {
    const row = get(op.date.getFullYear())
    if (op.category === 'cash') {
      if (op.payment > 0) row.contributed += op.payment
      else row.withdrawn += -op.payment
    } else if (isCoupon(op)) row.coupons += op.payment
    else if (isDividend(op)) row.dividends += op.payment
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year)
}

export interface DeductionRow {
  year: number
  contributed: number
  /** Часть взносов, которая идёт в вычет. */
  base: number
  /** Сверх лимита — вычета не даёт (но на ИИС-3 всё равно растёт без налога). */
  excess: number
  ndfl: number | undefined
  /** Возврат: база × ставка, но не больше уплаченного НДФЛ. */
  refund: number
  /** Возврат упёрся в уплаченный НДФЛ. */
  limitedByNdfl: boolean
}

export function deductionFor(year: number, contributed: number, settings: IisSettings): DeductionRow {
  const base = Math.min(contributed, settings.deductionCap)
  const nominal = (base * settings.ndflRate) / 100
  const ndfl = settings.ndflByYear[year]
  const refund = ndfl === undefined ? nominal : Math.min(nominal, ndfl)
  return {
    year,
    contributed,
    base,
    excess: Math.max(0, contributed - settings.deductionCap),
    ndfl,
    refund,
    limitedByNdfl: ndfl !== undefined && ndfl < nominal,
  }
}

export interface ProjectionRow {
  year: number
  startValue: number
  contribution: number
  /** Возврат НДФЛ за прошлый год, пришедший в этом году. */
  refundReceived: number
  growth: number
  endValue: number
  isActual: boolean
}

export interface Projection {
  rows: ProjectionRow[]
  totalContributed: number
  totalRefunds: number
  finalValue: number
  profit: number
  /** Налог, который не придётся платить при закрытии ИИС-3 (по сравнению с брокерским счётом). */
  taxSaved: number
  totalBenefit: number
}

/**
 * Прогноз до года закрытия. Текущий год берётся по факту (стоимость и взносы уже есть),
 * дальше — плановый взнос в начале года, возврат НДФЛ за прошлый год (если реинвестируем — тоже на счёт
 * и тоже в базу вычета), рост по ожидаемой доходности на средний капитал года.
 */
export function project(
  currentYear: number,
  currentValue: number,
  actualByYear: Map<number, number>,
  settings: IisSettings,
): Projection {
  const rows: ProjectionRow[] = []
  const rate = settings.expectedReturn / 100
  let value = currentValue
  let totalContributed = [...actualByYear.entries()].filter(([y]) => y < currentYear).reduce((acc, [, v]) => acc + v, 0)
  let totalRefunds = 0
  let prevContribution = actualByYear.get(currentYear - 1) ?? 0

  for (let year = currentYear; year <= settings.closeYear; year++) {
    const isActual = year === currentYear
    const refund = deductionFor(year - 1, prevContribution, settings).refund
    const reinvested = settings.reinvestRefund ? refund : 0
    const planned = isActual ? (actualByYear.get(year) ?? 0) : settings.plannedContribution
    const contribution = planned + (isActual ? 0 : reinvested)
    const startValue = value
    // в текущем году стоимость уже включает взносы — рост считаем только на остаток года
    const remaining = isActual ? 1 - (new Date().getMonth() + 0.5) / 12 : 1
    const growthBase = isActual ? value : value + contribution / 2
    const growth = growthBase * rate * remaining
    value = isActual ? value + growth : value + contribution + growth

    rows.push({ year, startValue, contribution, refundReceived: refund, growth, endValue: value, isActual })
    totalContributed += contribution
    totalRefunds += refund
    prevContribution = contribution
  }

  // возврат за последний год придёт уже после закрытия — считаем его тоже, он никуда не денется
  const lastRefund = deductionFor(settings.closeYear, prevContribution, settings).refund
  totalRefunds += lastRefund

  const profit = Math.max(0, value - totalContributed)
  const taxSaved = (Math.min(profit, settings.profitExemptionCap) * settings.ndflRate) / 100
  return { rows, totalContributed, totalRefunds, finalValue: value, profit, taxSaved, totalBenefit: totalRefunds + taxSaved }
}

export interface Reminder {
  text: string
  /** Срочное — выделяем. */
  urgent: boolean
}

/** Напоминания по ИИС для сводки: только то, что актуально прямо сейчас. */
export function iisReminders(now: Date, contributedThisYear: number, settings: IisSettings, holdEnd: Date): Reminder[] {
  const reminders: Reminder[] = []
  const month = now.getMonth()
  const year = now.getFullYear()
  const format = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`

  if (month <= 2) {
    reminders.push({ text: `Заяви вычет за ${year - 1} год — через ЛК ФНС, упрощённый порядок. Деньги придут за 1–2 месяца.`, urgent: month === 0 })
  }
  const remaining = settings.deductionCap - contributedThisYear
  if (remaining > 0 && month >= 10) {
    reminders.push({ text: `До лимита вычета за ${year} осталось ${format(remaining)} — внести до 31 декабря.`, urgent: month === 11 })
  }
  const daysToHoldEnd = (holdEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  if (daysToHoldEnd > 0 && daysToHoldEnd <= 60) {
    reminders.push({ text: `Через ${Math.ceil(daysToHoldEnd)} дн. ИИС можно закрыть без потери льгот — пора решать, что дальше.`, urgent: true })
  }
  return reminders
}
