import type { InstrumentType } from '../../api/types'

/** Достаточно типа и сектора — так функцией можно пользоваться и для бумаг не из портфеля. */
export interface SectorSource {
  type: InstrumentType
  sector: string
  focusType?: string
}

const SECTOR_LABELS: Record<string, string> = {
  it: 'IT',
  energy: 'Энергетика',
  financial: 'Финансы',
  consumer: 'Потребительский',
  materials: 'Сырьё',
  industrials: 'Промышленность',
  telecom: 'Телеком',
  health_care: 'Здравоохранение',
  utilities: 'Коммунальные',
  real_estate: 'Недвижимость',
  government: 'Государственные',
  municipal: 'Муниципальные',
  ecomaterials: 'Экоматериалы',
  electrocars: 'Электромобили',
  green_buildings: 'Зелёное строительство',
  green_energy: 'Зелёная энергетика',
  other: 'Другое',
}

const FOCUS_LABELS: Record<string, string> = {
  equity: 'Фонды акций',
  fixed_income: 'Фонды облигаций',
  mixed_allocation: 'Смешанные фонды',
  money_market: 'Денежный рынок',
  real_estate: 'Фонды недвижимости',
  commodity: 'Товарные фонды',
  specialty: 'Специальные фонды',
  private_equity: 'Private equity',
  alternative_investment: 'Альтернативные фонды',
}

/** Название сектора по-русски; для инструментов без сектора — по типу. */
export function sectorLabel(info: SectorSource | undefined): string {
  if (!info) return '…'
  if (info.type === 'currency') return 'Валюта'
  if (info.type === 'etf') return FOCUS_LABELS[info.focusType ?? ''] ?? 'Фонды'
  if (!info.sector) return 'Другое'
  return SECTOR_LABELS[info.sector] ?? info.sector
}

const RISK_LABELS: Record<string, string> = {
  RISK_LEVEL_LOW: 'низкий',
  RISK_LEVEL_MODERATE: 'средний',
  RISK_LEVEL_HIGH: 'высокий',
}

export function riskLabel(level: string): string {
  return RISK_LABELS[level] ?? '—'
}
