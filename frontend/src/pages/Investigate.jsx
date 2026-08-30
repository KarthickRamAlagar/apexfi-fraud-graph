import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Search, AlertTriangle, Share2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Panel } from '@/components/Panel'
import PendingBanner from '@/components/PendingBanner'
import TransactionGraph from '@/components/TransactionGraph'
import { InvestigateSkeleton } from '@/components/PageSkeletons'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function Investigate() {
  const [searchParams] = useSearchParams()
  const [centerId, setCenterId] = useState(searchParams.get('id'))
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // debounce — waits 300ms after typing stops before actually searching,
  // so we're not hitting the real database on every single keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

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

  // real live search across all 590,540 transactions, not just the 6
  // quick-pick samples — only fires once the user has typed at least 2
  // digits, to avoid an overly broad/wasteful query
  const { data: searchData } = useQuery({
    queryKey: ['investigate-search', debouncedQuery],
    queryFn: () => api.investigateSearch(debouncedQuery),
    enabled: debouncedQuery.replace('TX-', '').length >= 2,
  })

  const error = samplesError || investigationError
  const suggestions = query ? (searchData?.results ?? []) : []

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
    <div className="container py-8 space-y-6">
      <div>
        <p className="text-xs tracking-wide uppercase text-muted-foreground">ApexFi / Investigate</p>
        <h1 className="mt-1 text-2xl font-semibold font-display">Investigate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real transaction network — real edges (device_shared, card_shared), real IEEE-CIS data.
        </p>
      </div>

      <div className="relative w-full sm:w-80">
        <div className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg border-border bg-card">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                const id = query.trim().startsWith('TX-') ? query.trim() : `TX-${query.trim()}`
                setCenterId(id)
                setQuery(id)
              }
            }}
            placeholder="Enter transaction ID (e.g. TX-590112)…"
            className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="absolute z-10 w-full p-1 mt-1 border rounded-lg shadow-xl border-border bg-card">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setCenterId(s.id)
                  setQuery(s.id)
                }}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-left rounded-md hover:bg-secondary"
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
          <span className="self-center text-xs text-muted-foreground">Try:</span>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Connected Network" icon={Share2}>
          {loading || !investigation ? (
            <Skeleton className="h-[420px] rounded-lg" />
          ) : (
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
                  <div className="py-16 text-sm text-center text-muted-foreground">
                    This transaction has no device_shared or card_shared connections in the graph.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
          <p className="mt-3 text-xs text-center text-muted-foreground">
            Click any connected node to re-center the graph on it.
          </p>
        </Panel>

        <div className="space-y-4">
          <Panel title="Transaction Details">
            <dl className="space-y-2 text-sm">
              <Row label="ID" value={investigation?.center.id} mono loading={loading || !investigation} />
              <Row label="Amount" value={investigation?.center.amount} mono loading={loading || !investigation} />
              <Row label="Product" value={investigation?.center.productCD} loading={loading || !investigation} />
              <Row label="Card" value={investigation?.center.card} mono loading={loading || !investigation} />
              <Row label="Device" value={investigation?.center.device} mono loading={loading || !investigation} />
              <Row label="Date" value={investigation?.center.date} mono loading={loading || !investigation} />
            </dl>
          </Panel>

          <Panel title="Connections">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">device_shared</span>
              {loading || !investigation ? (
                <Skeleton className="w-8 h-4" />
              ) : (
                <span className="font-mono text-primary">{investigation.connectionCounts.device_shared}</span>
              )}
            </div>
            <div className="mt-1.5 flex justify-between text-sm">
              <span className="text-muted-foreground">card_shared</span>
              {loading || !investigation ? (
                <Skeleton className="w-8 h-4" />
              ) : (
                <span className="font-mono text-risk-medium">{investigation.connectionCounts.card_shared}</span>
              )}
            </div>
            {investigation && (investigation.connectionCounts.device_shared > 10 || investigation.connectionCounts.card_shared > 10) && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing up to 10 in the graph above (real total connections may be higher).
              </p>
            )}
          </Panel>

          <Panel title="Risk Assessment" icon={AlertTriangle}>
            {loading || !investigation ? (
              <div className="space-y-3">
                <Skeleton className="h-16 rounded-lg" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="rounded-lg h-14" />
                  <Skeleton className="rounded-lg h-14" />
                </div>
                <Skeleton className="h-32 rounded-lg" />
              </div>
            ) : investigation.riskAssessment.status === 'predicted' ? (
              <RiskAssessmentPanel risk={investigation.riskAssessment} />
            ) : (
              <PendingBanner>{investigation.riskAssessment.note}</PendingBanner>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono, loading }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {loading ? (
        <Skeleton className="w-24 h-4" />
      ) : (
        <dd className={cn('text-sm', mono && 'font-mono')}>{value}</dd>
      )}
    </div>
  )
}

function riskTone(score) {
  if (score >= 0.7) return 'high'
  if (score >= 0.3) return 'medium'
  return 'low'
}

const toneText = { high: 'text-risk-high', medium: 'text-risk-medium', low: 'text-risk-low' }
const toneBg = { high: 'bg-risk-high', medium: 'bg-risk-medium', low: 'bg-risk-low' }
const toneBorder = { high: 'border-risk-high/40', medium: 'border-risk-medium/40', low: 'border-risk-low/40' }

function RiskAssessmentPanel({ risk }) {
  const tone = riskTone(risk.riskScore)
  const pct = Math.round(risk.riskScore * 100)

  const chartData = risk.topContributingFeatures.map((f) => ({
    name: f.feature,
    contribution: f.contribution,
  }))

  return (
    <div className="space-y-4">
      <div className={cn('flex items-center gap-4 rounded-xl border p-4', toneBorder[tone])}>
        {risk.isFlagged ? (
          <ShieldAlert size={28} className={toneText[tone]} />
        ) : (
          <ShieldCheck size={28} className="text-risk-low" />
        )}
        <div className="flex-1">
          <div className={cn('font-display text-2xl font-semibold tabular-nums', toneText[tone])}>
            {pct}%
          </div>
          <div className="text-xs text-muted-foreground">
            {risk.isFlagged ? 'Flagged as likely fraud' : 'Not flagged'} · threshold {Math.round(risk.threshold * 100)}%
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs text-muted-foreground">Component scores</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary/40 p-2.5 text-center">
            <div className="font-mono text-sm tabular-nums">{Math.round(risk.componentScores.lightgbm * 100)}%</div>
            <div className="text-[10px] uppercase text-muted-foreground">LightGBM</div>
          </div>
          <div className="rounded-lg bg-secondary/40 p-2.5 text-center">
            <div className="font-mono text-sm tabular-nums">{Math.round(risk.componentScores.gnn * 100)}%</div>
            <div className="text-[10px] uppercase text-muted-foreground">GNN</div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs text-muted-foreground">
          Top contributing features (SHAP — real, per-prediction)
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [v.toFixed(3), 'Contribution']}
              />
              <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.contribution >= 0 ? 'hsl(var(--risk-high))' : 'hsl(var(--risk-low))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Red pushes toward fraud, green pushes toward normal.
        </p>
      </div>

      <p className="pt-3 text-xs leading-relaxed border-t border-border/60 text-muted-foreground">
        {risk.modelInfo.type} · {risk.modelInfo.validated}
      </p>
    </div>
  )
}