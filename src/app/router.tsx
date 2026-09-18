import { createBrowserRouter } from 'react-router-dom'
import { AllocationPage } from '../features/allocation/AllocationPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { IisPage } from '../features/iis/IisPage'
import { OperationsPage } from '../features/operations/OperationsPage'
import { PaymentsPage } from '../features/payments/PaymentsPage'
import { PortfolioPage } from '../features/portfolio/PortfolioPage'
import { SummaryPage } from '../features/summary/SummaryPage'
import { Layout } from './Layout'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <SummaryPage /> },
      { path: 'portfolio', element: <PortfolioPage /> },
      { path: 'operations', element: <OperationsPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'allocation', element: <AllocationPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'iis', element: <IisPage /> },
    ],
  },
])
