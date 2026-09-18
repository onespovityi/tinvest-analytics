import { useCallback, useState } from 'react'
import { defaultSettings, type IisSettings } from './rules'

const STORAGE_KEY = 'tinvest-analytics:iis-settings'

function load(fallback: IisSettings): IisSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<IisSettings>) }
  } catch {
    return fallback
  }
}

/** Параметры планировщика живут в localStorage — это личные настройки на этой машине. */
export function useIisSettings(currentYear: number, minCloseYear: number): [IisSettings, (patch: Partial<IisSettings>) => void] {
  const [settings, setSettings] = useState<IisSettings>(() => load(defaultSettings(currentYear, minCloseYear)))

  const update = useCallback((patch: Partial<IisSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // приватный режим или запрет на хранение — просто не сохраняем
      }
      return next
    })
  }, [])

  return [settings, update]
}
