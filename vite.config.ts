import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { Agent } from 'node:https'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

const TINVEST_REST = 'https://invest-public-api.tinkoff.ru'
const CONTRACT_PREFIX = '/rest/tinkoff.public.invest.api.contract.v1.'

/**
 * API Т-Инвестиций работает по сертификату Минцифры (Russian Trusted Root CA).
 * Windows ему доверяет, а у Node свой список корневых CA, где его нет —
 * поэтому корневой сертификат лежит в репозитории и явно передаётся агенту.
 */
const tinvestAgent = new Agent({
  ca: readFileSync(new URL('./certs/russian-trusted-root-ca.pem', import.meta.url)),
})

/**
 * Прокси на один счёт: всё, что пришло на `/api/<account>/<Service>/<Method>`,
 * уходит на T-Invest REST с токеном этого счёта в заголовке.
 * Токен живёт только здесь (Node-процесс Vite), браузер его не видит.
 */
function accountProxy(token: string, prefix: string): ProxyOptions {
  return {
    target: TINVEST_REST,
    changeOrigin: true,
    agent: tinvestAgent,
    rewrite: (path) => path.replace(prefix, CONTRACT_PREFIX),
    headers: { Authorization: `Bearer ${token}` },
  }
}

export default defineConfig(({ mode }) => {
  // третий аргумент '' — грузим все переменные, не только с префиксом VITE_
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api/iis': accountProxy(env.TINVEST_TOKEN_IIS ?? '', '/api/iis/'),
        '/api/broker': accountProxy(env.TINVEST_TOKEN_BROKER ?? '', '/api/broker/'),
      },
    },
  }
})
