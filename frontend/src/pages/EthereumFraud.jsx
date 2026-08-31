import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ShieldAlert, ShieldCheck, HelpCircle, Link2 } from 'lucide-react'
import { Panel } from '@/components/Panel'
import AnalyzingCard from '@/components/AnalyzingCard'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function EthereumFraud() {
  const [address, setAddress] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(address), 300)
    return () => clearTimeout(t)
  }, [address])

  const { data: searchData } = useQuery({
    queryKey: ['eth-search', debounced],
    queryFn: () => api.ethereumFraudSearch(debounced),
    enabled: debounced.length >= 3,
  })
  const suggestions = address ? (searchData?.results ?? []) : []

  const { data: samplesData } = useQuery({
    queryKey: ['eth-samples'],
    queryFn: api.ethereumFraudSamples,
  })
  const samples = samplesData?.samples ?? []

  const mutation = useMutation({ mutationFn: (addr) => api.ethereumFraudScore(addr) })

  function handleScore(addr) {
    const target = addr ?? address
    if (!target) return
    setAddress(target)
    setDropdownOpen(false)
    mutation.mutate(target)
  }

  function handleLoadSample() {
    if (samples.length === 0) return
    const sample = samples[Math.floor(Math.random() * samples.length)]
    setAddress(sample.address)
    mutation.reset()
  }

  const result = mutation.data

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="flex items-center gap-2 mb-1 text-xs tracking-wider uppercase text-muted-foreground">
        <Link2 size={12} /> ApexFi / Blockchain Fraud (Experiment)
      </div>
      <h1 className="text-2xl font-semibold font-display">Ethereum Blockchain Fraud Detection</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A third, independent proof point: the same real, proven explainable fraud-detection
        methodology (LightGBM + SHAP), applied to a structurally different domain — real Ethereum
        blockchain accounts, not UPI transactions. Deliberately kept separate from the main
        pipeline — blockchain and UPI have no genuine shared identity.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <Panel title="Pick an account">
          <div className="relative mb-4">
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value)
                setDropdownOpen(true)
              }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              onKeyDown={(e) => e.key === 'Enter' && handleScore()}
              placeholder="Enter or search a real Ethereum address…"
              className="w-full px-3 py-2 text-sm border rounded-md outline-none border-border bg-secondary/30 text-foreground focus:border-primary/50"
            />
            {dropdownOpen && suggestions.length > 0 && (
              <div className="absolute z-10 w-full p-1 mt-1 border rounded-lg shadow-xl border-border bg-card">
                {suggestions.map((s) => (
                  <button
                    key={s.address}
                    onMouseDown={() => handleScore(s.address)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs text-left rounded-md text-foreground hover:bg-secondary"
                  >
                    <span className="font-mono truncate">{s.address}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => handleScore()}
              disabled={!address || mutation.isPending}
              className="px-4 py-2 text-sm font-medium transition-transform rounded-lg bg-primary text-primary-foreground hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mutation.isPending ? 'Scoring…' : 'Score Account'}
            </button>
            <button
              onClick={handleLoadSample}
              disabled={mutation.isPending || samples.length === 0}
              className="px-4 py-2 text-sm transition-colors border rounded-lg border-border text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Load Sample
            </button>
          </div>

          <div className="mb-2 text-xs text-muted-foreground">Or try a real sample account:</div>
          <div className="flex flex-wrap gap-2">
            {samples.map((s) => (
              <button
                key={s.address}
                onClick={() => handleScore(s.address)}
                disabled={mutation.isPending}
                className="rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-xs font-mono text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {s.address.slice(0, 10)}…
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {mutation.isPending && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Panel><AnalyzingCard steps={['Loading account features…', 'Running the fraud model…', 'Generating explanation…']} /></Panel>
              </motion.div>
            )}
            {mutation.isError && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Panel title="Unable to Score">
                  <p className="text-sm text-risk-high">{mutation.error?.message || 'Unable to score this account.'}</p>
                </Panel>
              </motion.div>
            )}
            {result && !mutation.isPending && (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Panel title="Prediction" icon={result.isFlagged ? ShieldAlert : ShieldCheck}>
                  <ResultPanel result={result} />
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>
          {!result && !mutation.isPending && !mutation.isError && (
            <Panel title="Result" icon={HelpCircle}>
              <p className="py-8 text-sm text-center text-muted-foreground">
                Enter or pick a real Ethereum address to see a real prediction.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultPanel({ result }) {
  const pct = Math.round(result.riskScore * 100)
  const tone = result.isFlagged ? 'high' : 'low'
  const chartData = result.topContributingFeatures.map((f) => ({ name: f.feature, contribution: f.contribution }))

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-secondary/40 px-3 py-1.5 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        Real historical label: {result.realLabel ? 'Fraud' : 'Normal'}
      </div>
      <div className={cn('rounded-xl border p-4', tone === 'high' ? 'border-risk-high/40' : 'border-risk-low/40')}>
        <div className={cn('font-display text-3xl font-semibold', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>
          {result.isFlagged ? 'FLAGGED' : 'CLEAR'}
        </div>
        <div className={cn('mt-1 text-lg font-semibold', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>{pct}% fraud risk</div>
      </div>
      <div>
        <div className="mb-2 text-xs text-muted-foreground">Why? (SHAP — real, per-prediction)</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={170} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(v) => [v.toFixed(3), 'Contribution']}
              />
              <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.contribution >= 0 ? 'hsl(var(--risk-high))' : 'hsl(var(--risk-low))'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="pt-3 text-xs leading-relaxed border-t border-border/60 text-muted-foreground">{result.modelInfo.note}</p>
    </div>
  )
}