import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { HelpCircle, ShieldAlert, ShieldCheck } from 'lucide-react'
import AnalyzingCard from '@/components/AnalyzingCard'
import NumberInput from '@/components/NumberInput'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function ScoreUnlabeledAccount() {
  const [searchParams] = useSearchParams()
  const [nodeId, setNodeId] = useState('')
  const [debouncedId, setDebouncedId] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedId(nodeId), 300)
    return () => clearTimeout(t)
  }, [nodeId])

  const { data: searchData } = useQuery({
    queryKey: ['dgraph-fin-search', debouncedId],
    queryFn: () => api.dgraphFinSearch(debouncedId),
    enabled: debouncedId.length >= 2,
  })
  const suggestions = nodeId ? (searchData?.results ?? []) : []

  const { data: samplesData } = useQuery({
    queryKey: ['dgraph-fin-samples'],
    queryFn: api.dgraphFinSamples,
  })
  const samples = samplesData?.samples ?? []

  const mutation = useMutation({
    mutationFn: (id) => api.dgraphFinScore(id),
  })

  function handleScore(id) {
    const target = id ?? nodeId
    if (!target) return
    setNodeId(String(target))
    mutation.mutate(target)
  }

  // deep-linked from the top-nav search — auto-score on load
  useEffect(() => {
    const deepLinkedId = searchParams.get('id')
    if (deepLinkedId) handleScore(deepLinkedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScoreAnother() {
    setNodeId('')
    mutation.reset()
  }

  const result = mutation.data

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="mb-1 text-xs tracking-wider uppercase text-muted-foreground">ApexFi / Score Unlabeled Account</div>
      <h1 className="text-2xl font-semibold font-display">Score Unlabeled Account</h1>
      <p className="max-w-3xl mt-1 text-sm text-muted-foreground">
        Predicts a real account's fraud risk from DGraph-Fin's 2.47M genuinely unlabeled
        "background" accounts — real features, real network connections, a truly unknown outcome,
        not a reconstruction.
      </p>

      <Panel title="Pick an account" className="mt-6">
        <div className="relative mb-4">
          <div className="flex items-center gap-2">
            <NumberInput
              value={nodeId}
              onChange={setNodeId}
              onKeyDown={(e) => e.key === 'Enter' && handleScore()}
              placeholder="Enter account ID, or search…"
              className="py-2"
            />
            <button
              onClick={() => handleScore()}
              disabled={!nodeId || mutation.isPending}
              className="px-4 py-2 text-sm font-medium transition-transform rounded-lg whitespace-nowrap bg-primary text-primary-foreground hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mutation.isPending ? 'Scoring…' : 'Score Account'}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-10 w-full p-1 mt-1 border rounded-lg shadow-xl border-border bg-card">
              {suggestions.map((s) => (
                <button
                  key={s.nodeId}
                  onClick={() => handleScore(s.nodeId)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs text-left rounded-md hover:bg-secondary"
                >
                  <span className="font-mono">#{s.nodeId}</span>
                  <span className="text-muted-foreground">
                    {s.connections} connections{s.isBackgroundAccount ? '' : ' · has real label'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-2 text-xs text-muted-foreground">Or try a real background account:</div>
        <div className="flex flex-wrap gap-2">
          {samples.map((s) => (
            <button
              key={s.nodeId}
              onClick={() => handleScore(s.nodeId)}
              disabled={mutation.isPending}
              className="rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-xs font-mono transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              #{s.nodeId} <span className="text-muted-foreground">({s.connections} connections)</span>
            </button>
          ))}
        </div>

        <p className="pt-4 mt-4 text-xs leading-relaxed border-t border-border/60 text-muted-foreground">
          These sample IDs are real background accounts, randomly drawn from the actual dataset —
          not selected for effect. Their true outcome is genuinely unlabeled in the source data.
        </p>
      </Panel>

      <div className="mt-6">
        <AnimatePresence mode="wait">
          {mutation.isPending && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Panel>
                <AnalyzingCard
                  steps={['Loading real account features…', 'Checking real network connections…', 'Running the fraud model…', 'Generating explanation…']}
                />
              </Panel>
            </motion.div>
          )}

          {mutation.isError && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Panel title="Unable to Score">
                <p className="text-sm text-risk-high">
                  {mutation.error?.data?.detail || mutation.error?.message || 'Unable to score this account.'}
                </p>
              </Panel>
            </motion.div>
          )}

          {result && !mutation.isPending && (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel title="Prediction" icon={result.isFlagged ? ShieldAlert : ShieldCheck}>
                <ResultPanel result={result} />
              </Panel>
              <button
                onClick={handleScoreAnother}
                className="mt-4 w-full rounded-lg border border-border py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Score Another Account
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!result && !mutation.isPending && !mutation.isError && (
          <Panel title="Result" icon={HelpCircle}>
            <p className="py-8 text-sm text-center text-muted-foreground">
              Enter an account ID or pick a sample to see a real prediction.
            </p>
          </Panel>
        )}
      </div>
    </div>
  )
}

function riskTone(score) {
  if (score >= 0.7) return 'high'
  if (score >= 0.3) return 'medium'
  return 'low'
}
const toneText = { high: 'text-risk-high', medium: 'text-risk-medium', low: 'text-risk-low' }
const toneBorder = { high: 'border-risk-high/40', medium: 'border-risk-medium/40', low: 'border-risk-low/40' }

function ResultPanel({ result }) {
  const tone = riskTone(result.riskScore)
  const pct = Math.round(result.riskScore * 100)
  const chartData = result.topContributingFeatures.map((f) => ({ name: f.feature, contribution: f.contribution }))

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-secondary/40 px-3 py-1.5 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        Account #{result.nodeId} · {result.isBackgroundAccount ? 'genuinely unlabeled account' : 'has a real historical label'}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={cn('flex items-center gap-4 rounded-xl border p-4', toneBorder[tone])}>
          <div>
            <div className={cn('font-display text-2xl font-semibold', toneText[tone])}>
              {result.isFlagged ? 'FLAGGED' : 'CLEAR'}
            </div>
            <div className={cn('mt-1 text-base font-semibold tabular-nums', toneText[tone])}>{pct}% risk</div>
            <div className="text-xs text-muted-foreground">threshold {Math.round(result.threshold * 100)}%</div>
          </div>
        </div>

        <div className="p-4 border rounded-xl border-border/60">
          <div className="mb-2 text-xs text-muted-foreground">Model breakdown</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-secondary/40 p-2.5 text-center">
              <div className="font-mono text-sm tabular-nums">{Math.round(result.componentScores.lightgbm * 100)}%</div>
              <div className="text-[10px] uppercase text-muted-foreground">LightGBM</div>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2.5 text-center">
              <div className="font-mono text-sm tabular-nums">{Math.round(result.componentScores.gnn * 100)}%</div>
              <div className="text-[10px] uppercase text-muted-foreground">GNN</div>
            </div>
          </div>
        </div>

        <div className="p-4 border rounded-xl border-border/60">
          <div className="mb-2 text-xs text-muted-foreground">Real connections in the network</div>
          <div className="text-2xl font-semibold font-display text-primary tabular-nums">{result.realConnectionCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs text-muted-foreground">Why? (SHAP — real, per-prediction)</div>
          <div className="h-48 p-3 border rounded-xl border-border/60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={80} />
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
            Feature names (x0-x16) are anonymized in the source dataset — not something we can label more helpfully.
          </p>
        </div>

        <div className="flex flex-col justify-center p-4 border rounded-xl border-border/60">
          <p className="text-sm leading-relaxed text-muted-foreground">{result.modelInfo.note}</p>
        </div>
      </div>
    </div>
  )
}