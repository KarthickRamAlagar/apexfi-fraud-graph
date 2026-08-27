import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { BarChart, Bar, ResponsiveContainer, XAxis } from 'recharts'
import { ChevronDown, Sparkles, Share2, Info } from 'lucide-react'
import { Panel } from '@/components/Panel'
import PendingBanner from '@/components/PendingBanner'
import CorrelationMatrix from '@/components/CorrelationMatrix'
import { EDASkeleton } from '@/components/PageSkeletons'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const DATASET_KEYS = ['ieee_cis', 'dgraph_fin']

function ShapeCard({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export default function EDA() {
  const [datasetKey, setDatasetKey] = useState('ieee_cis')
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [statColumn, setStatColumn] = useState(0)
  const audioRef = useRef(null)

  const { data: ds, error } = useQuery({
    queryKey: ['eda', datasetKey],
    queryFn: () => api.eda(datasetKey),
  })

  // reset the selected stat column whenever the dataset actually changes
  useEffect(() => {
    setStatColumn(0)
  }, [datasetKey])

  function handleExploreMore() {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
    const streamlitUrl = import.meta.env.VITE_STREAMLIT_URL || 'http://localhost:8501'
    window.open(streamlitUrl, '_blank', 'noopener,noreferrer')
  }

  if (error) {
    return (
      <div className="container py-8">
        <PendingBanner>
          Couldn't reach the backend, or no precomputed summary exists yet. Run:{' '}
          <code>uv run python -m backend.services.precompute_summaries</code>
        </PendingBanner>
      </div>
    )
  }

  if (!ds) {
    return <EDASkeleton />
  }

  const activeCol = ds.statColumns[statColumn]
  const activeStats = ds.stats[activeCol.key]
  const activeHistogram = ds.histogram[activeCol.key]

  return (
    <div className="container space-y-6 py-8">
      <audio ref={audioRef} src="/sounds/explore-eda.mp3" preload="none" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">ApexFi / EDA</p>
          <div className="relative mt-1">
            <button
              onClick={() => setSelectorOpen((v) => !v)}
              className="flex items-center gap-2 font-display text-2xl font-semibold"
            >
              {ds.label}
              <ChevronDown size={18} className="text-muted-foreground" />
            </button>
            {selectorOpen && (
              <div className="absolute z-10 mt-2 w-64 rounded-lg border border-border bg-card p-1 shadow-xl">
                {DATASET_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDatasetKey(key)
                      setSelectorOpen(false)
                    }}
                    className={cn(
                      'block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary',
                      key === datasetKey && 'text-primary'
                    )}
                  >
                    {key === 'ieee_cis' ? 'IEEE-CIS Transactions' : 'DGraph-Fin Users'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ShapeCard label="Rows" value={ds.rows.toLocaleString()} />
        <ShapeCard label="Feature Columns" value={ds.independentColumns} />
        <ShapeCard label="Target Column" value={ds.targetColumn} />
        <ShapeCard label="Independent Columns" value={ds.independentColumns} />
        <ShapeCard label="Dependent Columns" value={ds.dependentColumns} />
      </div>

      <Panel title="Data Quality">
        <div className="flex h-3 overflow-hidden rounded-full">
          <div style={{ width: `${ds.quality.valid}%` }} className="bg-risk-low" />
          <div style={{ width: `${ds.quality.missing}%` }} className="bg-risk-medium" />
          <div style={{ width: `${ds.quality.duplicate}%` }} className="bg-risk-high" />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-risk-low" />Valid {ds.quality.valid}%</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-risk-medium" />Missing {ds.quality.missing}%</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-risk-high" />Duplicate {ds.quality.duplicate}%</span>
        </div>
        {ds.qualityNote && <p className="mt-2 text-xs text-muted-foreground">{ds.qualityNote}</p>}
      </Panel>

      <Panel title="Statistics &amp; Distribution">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {ds.statColumns.map((col, i) => (
                <div key={col.key} className="group relative">
                  <button
                    onClick={() => setStatColumn(i)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs transition-colors',
                      i === statColumn
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {col.key}
                    <Info size={11} className="opacity-60" />
                  </button>
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                    {col.meaning}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {Object.entries(activeStats).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-secondary/40 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                  <div className="font-mono text-sm tabular-nums">
                    {v === null ? '—' : typeof v === 'number' ? v.toLocaleString() : v}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activeHistogram.map((v, i) => ({ i, v }))}>
                <XAxis dataKey="i" hide />
                <Bar dataKey="v" radius={[3, 3, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-center text-xs text-muted-foreground">{activeCol.key} distribution</p>
          </div>
        </div>
      </Panel>

      <Panel title="Correlation Matrix">
        <div className="flex justify-center py-2">
          <CorrelationMatrix
            labels={ds.correlationLabels}
            fullLabels={ds.correlationLabels.map((l) => ds.correlationMeanings[l] || l)}
            matrix={ds.correlationMatrix}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Categorical Analysis">
          <div className="space-y-2">
            {ds.categorical.map((c) => {
              const max = Math.max(...ds.categorical.map((x) => x.count))
              return (
                <div key={c.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="font-mono tabular-nums">{c.count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel title="Graph Analysis" icon={Share2}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Edge types</dt>
              <dd className="font-mono">{ds.graph.edgeTypes}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total edges</dt>
              <dd className="font-mono">{ds.graph.totalEdges.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Avg. degree</dt>
              <dd className="font-mono">{ds.graph.avgDegree}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
            {ds.graph.note}
          </p>
        </Panel>
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-border/60 pt-6 text-center">
        <p className="text-xs text-muted-foreground">
          Full statistical profiling (pandas-profiling style) runs in the standalone Streamlit app.
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleExploreMore}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02]"
        >
          <Sparkles size={15} />
          Explore More EDA
        </motion.button>
      </div>
    </div>
  )
}
