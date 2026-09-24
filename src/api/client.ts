import type { AccountKey } from './types'

export class ApiError extends Error {
  status: number
  code: string | undefined

  constructor(status: number, code: string | undefined, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Единственная точка входа в T-Invest API.
 * Запрос идёт на локальный `/api/<account>/...`, а Vite-прокси добавляет токен
 * и переправляет на invest-public-api.tinkoff.ru — см. vite.config.ts.
 */
export async function request<TResponse>(
  account: AccountKey,
  service: string,
  method: string,
  body: Record<string, unknown> = {},
): Promise<TResponse> {
  const response = await fetch(`/api/${account}/${service}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let code: string | undefined
    let message =
      response.status === 429
        ? 'Брокер временно ограничил частоту запросов. Подожди минуту и попробуй снова.'
        : `${service}/${method} → HTTP ${response.status}`
    try {
      const error = (await response.json()) as { code?: string; message?: string }
      code = error.code
      if (error.message) message = error.message
    } catch {
      // тело не JSON — оставляем общее сообщение
    }
    throw new ApiError(response.status, code, message)
  }

  return (await response.json()) as TResponse
}
