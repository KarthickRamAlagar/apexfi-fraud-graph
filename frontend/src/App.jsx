import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TopNav from '@/components/TopNav'
import DesktopOnlyGate from '@/components/DesktopOnlyGate'
import Dashboard from '@/pages/Dashboard'
import Datasets from '@/pages/Datasets'
import Investigate from '@/pages/Investigate'
import ScoreNewTransaction from '@/pages/ScoreNewTransaction'
import ScoreUnlabeledAccount from '@/pages/ScoreUnlabeledAccount'
import Analytics from '@/pages/Analytics'
import EDA from '@/pages/EDA'
import AskYourData from '@/pages/AskYourData'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import EthereumFraud from '@/pages/EthereumFraud'
import TemporalValidation from '@/pages/TemporalValidation'

// Real Gold-layer data doesn't change between page visits within a
// session (it's precomputed / refreshed only when you re-run the
// precompute script), so a 5-minute staleTime avoids refetching every
// time you navigate back to a page — cached data shows instantly,
// with a background refetch only if it's actually gone stale.
// This data is precomputed (via the precompute script), not live —
// it only changes when someone manually re-runs that script, not
// continuously. A short staleTime/gcTime was causing real, unnecessary
// refetches on every navigation once enough time passed between visits
// to the same page during normal back-and-forth exploration. Since
// there's no real reason to consider this data "stale" within an entire
// session, both are set generously long — effectively "don't refetch
// until a hard page refresh."
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 60 * 1000, // 1 hour
      gcTime: 2 * 60 * 60 * 1000, // 2 hours — cache survives well beyond any single session of navigating around
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false, // trust the cache once it's loaded once this session
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
              <Route path="/score-new" element={<ScoreNewTransaction />} />
              <Route path="/score-account" element={<ScoreUnlabeledAccount />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/eda" element={<EDA />} />
              <Route path="/ask" element={<AskYourData />} />
              <Route path="/ethereum-fraud" element={<EthereumFraud />} />
              <Route path="/temporal-validation" element={<TemporalValidation />} />
            </Routes>
          </div>
        </HashRouter>
      </DesktopOnlyGate>
    </QueryClientProvider>
  )
}