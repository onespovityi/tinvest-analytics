import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './app/global.css'
import { persistOptions, queryClient } from './app/queryClient'
import { router } from './app/router'
import { AccountProvider } from './shared/account/AccountProvider'

// localhost и 127.0.0.1 для браузера — разные сайты с разным localStorage (цели, настройки, визиты).
// Держим всё на одном адресе, том же, что в README.
if (import.meta.env.DEV && location.hostname === 'localhost') {
  location.replace(location.href.replace('//localhost', '//127.0.0.1'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AccountProvider>
        <RouterProvider router={router} />
      </AccountProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
