import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './app/global.css'
import { persistOptions, queryClient } from './app/queryClient'
import { router } from './app/router'
import { AccountProvider } from './shared/account/AccountProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AccountProvider>
        <RouterProvider router={router} />
      </AccountProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
