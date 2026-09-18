/**
 * Категориальная палитра для тёмной темы. Порядок фиксированный — он подобран так,
 * чтобы соседние цвета различались при дальтонизме; не перемешивать и не «генерировать» 9-й цвет:
 * всё, что не влезло в 8 слотов, сворачивается в «Другое».
 */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

export const MAX_SERIES = SERIES.length

export interface Slice {
  label: string
  value: number
}

/** Сортирует по убыванию и сворачивает хвост в «Другое», чтобы уложиться в палитру. */
export function foldSlices(slices: Slice[], max = MAX_SERIES): Slice[] {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  if (sorted.length <= max) return sorted
  const head = sorted.slice(0, max - 1)
  const rest = sorted.slice(max - 1).reduce((acc, s) => acc + s.value, 0)
  return [...head, { label: 'Другое', value: rest }]
}
