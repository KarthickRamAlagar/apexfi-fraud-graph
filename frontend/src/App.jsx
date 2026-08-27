import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TopNav from '@/components/TopNav'
import DesktopOnlyGate from '@/components/DesktopOnlyGate'
import Dashboard from '@/pages/Dashboard'
import Datasets from '@/pages/Datasets'
import Investigate from '@/pages/Investigate'
import Analytics from '@/pages/Analytics'
import EDA from '@/pages/EDA'
import AskYourData from '@/pages/AskYourData'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// Real Gold-layer data doesn't change between page visits within a
// session (it's precomputed / refreshed only when you re-run the
// precompute script), so a 5-minute staleTime avoids refetching every
// time you navigate back to a page — cached data shows instantly,
// with a background refetch only if it's actually gone stale.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ReactQueryDevtools initialIsOpen={false} />
      <DesktopOnlyGate>
        <HashRouter>
          <div className="app-gradient-bg" />
          <div className="min-h-screen">
            <TopNav />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/datasets" element={<Datasets />} />
              <Route path="/investigate" element={<Investigate />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/eda" element={<EDA />} />
              <Route path="/ask" element={<AskYourData />} />
            </Routes>
          </div>
        </HashRouter>
      </DesktopOnlyGate>
    </QueryClientProvider>
  )
}
