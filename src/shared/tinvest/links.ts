import type { InstrumentType } from '../../api/types'

export interface LinkableInstrument {
  type: InstrumentType
  ticker: string
  isin?: string
}

const SECTION: Partial<Record<InstrumentType, string>> = {
  share: 'stocks',
  bond: 'bonds',
  etf: 'etfs',
  currency: 'currencies',
  futures: 'futures',
}

/**
 * Страница бумаги в кабинете Т-Инвестиций — там же кнопки «Купить» / «Продать».
 * Везде адресуем по тикеру: у ОФЗ он свой (SU26249RMFS1), и ISIN там отдаёт 404,
 * а у корпоративных облигаций тикер и так совпадает с ISIN. Валюта — по паре (CNYRUB_TOM_CETS → CNYRUB).
 * Для рублей и неизвестных типов страницы нет.
 */
export function instrumentUrl(instrument: LinkableInstrument): string | undefined {
  const section = SECTION[instrument.type]
  if (!section) return undefined

  let id = instrument.ticker || instrument.isin || ''
  if (instrument.type === 'currency') {
    if (id.startsWith('RUB')) return undefined
    id = id.replace(/_.*$/, '').replace(/000UTSTOM$/, 'RUB')
  }
  if (!id) return undefined
  // «@» в тикере (TMOS@) сайт понимает только как есть, %40 отдаёт 404
  return `https://www.tbank.ru/invest/${section}/${encodeURIComponent(id).replace(/%40/g, '@')}/`
}
