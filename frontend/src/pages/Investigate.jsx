import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, AlertTriangle, Share2 } from 'lucide-react'
import { Panel } from '@/components/Panel'
import PendingBanner from '@/components/PendingBanner'
import TransactionGraph from '@/components/TransactionGraph'
import { InvestigateSkeleton } from '@/components/PageSkeletons'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function Investigate() {
  const [centerId, setCenterId] = useState(null)
  const [query, setQuery] = useState('')

  const { data: samplesData, error: samplesError } = useQuery({
    queryKey: ['investigate-samples'],
    queryFn: api.investigateSamples,
  })
  const samples = samplesData?.samples ?? []
  // default to the first real sample once loaded, without needing an effect
  const activeId = centerId ?? samples[0]?.id

  const { data: investigation, error: investigationError, isFetching: loading } = useQuery({
    queryKey: ['investigate', activeId],
    queryFn: () => api.investigate(activeId),
    enabled: !!activeId,
  })

  const error = samplesError || investigationError

  const suggestions = query
    ? samples.filter((s) => s.id.toLowerCase().includes(query.toLowerCase()))
    : []

  if (error && !investigation) {
    return (
      <div className="container py-8">
        <PendingBanner>
          Couldn't reach the backend, or no data found. Make sure it's running:{' '}
          <code>uv run uvicorn backend.main:app --reload</code>
        </PendingBanner>
      </div>
    )
  }

  if (samples.length === 0 && !error) {
    return <InvestigateSkeleton />
  }

  return (
    <div className="container space-y-6 py-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">ApexFi / Investigate</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Investigate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real transaction network — real edges (device_shared, card_shared), real IEEE-CIS data.
        </p>
      </div>

      <div className="relative w-full sm:w-80">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                const id = query.trim().startsWith('TX-') ? query.trim() : `TX-${query.trim()}`
                setCenterId(id)
                setQuery('')
              }
            }}
            placeholder="Enter transaction ID (e.g. TX-590112)…"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card p-1 shadow-xl">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setCenterId(s.id)
                  setQuery('')
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary"
              >
                <span className="font-mono">{s.id}</span>
                {s.isFlagged && <span className="text-risk-high">flagged</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {!query && samples.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center">Try:</span>
          {samples.map((s) => (
            <button
              key={s.id}
              onClick={() => setCenterId(s.id)}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-xs transition-colors',
                s.id === centerId
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {s.id} {s.isFlagged && '⚠'}
            </button>
          ))}
        </div>
      )}

      {loading || !investigation ? (
        <Skeleton className="h-[500px] rounded-xl" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <Panel title="Connected Network" icon={Share2}>
            <AnimatePresence mode="wait">
              <motion.div
                key={centerId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {investigation.neighbors.length > 0 ? (
                  <TransactionGraph
                    center={investigation.center}
                    neighbors={investigation.neighbors}
                    onSelectNode={setCenterId}
                  />
                ) : (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    This transaction has no device_shared or card_shared connections in the graph.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Click any connected node to re-center the graph on it.
            </p>
          </Panel>

          <div className="space-y-4">
            <Panel title="Transaction Details">
              <dl className="space-y-2 text-sm">
                <Row label="ID" value={investigation.center.id} mono />
                <Row label="Amount" value={investigation.center.amount} mono />
                <Row label="Product" value={investigation.center.productCD} />
                <Row label="Card" value={investigation.center.card} mono />
                <Row label="Device" value={investigation.center.device} mono />
                <Row label="Date" value={investigation.center.date} mono />
              </dl>
            </Panel>

            <Panel title="Connections">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">device_shared</span>
                <span className="font-mono text-primary">{investigation.connectionCounts.device_shared}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground">card_shared</span>
                <span className="font-mono text-risk-medium">{investigation.connectionCounts.card_shared}</span>
              </div>
              {(investigation.connectionCounts.device_shared > 10 || investigation.connectionCounts.card_shared > 10) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing up to 10 in the graph above (real total connections may be higher).
                </p>
              )}
            </Panel>

            <Panel title="Risk Assessment" icon={AlertTriangle}>
              <PendingBanner>
                <strong className="text-foreground">Model not yet trained.</strong>{' '}
                {investigation.riskAssessment.note}
              </PendingBanner>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}
