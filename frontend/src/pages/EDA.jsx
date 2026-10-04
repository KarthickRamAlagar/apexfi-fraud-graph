import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronDown, Sparkles, Share2, Info } from 'lucide-react'
import { Panel } from '@/components/Panel'
import PendingBanner from '@/components/PendingBanner'
import CorrelationMatrix from '@/components/CorrelationMatrix'
import BoxPlot from '@/components/BoxPlot'
import ScatterPlot from '@/components/ScatterPlot'
import { EDASkeleton } from '@/components/PageSkeletons'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import LoadingOverlay from '@/components/LoadingOverlay'

const DATASET_KEYS = ['ieee_cis', 'dgraph_fin']

function ShapeCard({ label, value }) {
  return (
    <div className="px-4 py-3 border rounded-xl border-border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold font-display tabular-nums">{value}</div>
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

  // Default to C1 for IEEE-CIS (first feature after TransactionAmt); first column otherwise.
  useEffect(() => {
    if (!ds) { setStatColumn(0); return }
    const c1 = ds.statColumns.findIndex((c) => c.key === 'C1')
    setStatColumn(c1 >= 0 ? c1 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey, ds?.label])

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
    return <LoadingOverlay><EDASkeleton /></LoadingOverlay>
  }

  const activeCol = ds.statColumns[statColumn]
  const activeStats = ds.stats[activeCol.key]
  // Scatter X reference = first column, unless it IS the selected one (would plot x vs itself).
  const scatterX = ds.statColumns[0].key === activeCol.key ? ds.statColumns[1] ?? ds.statColumns[0] : ds.statColumns[0]

  return (
    <div className="container py-8 space-y-6">
      <audio ref={audioRef} src="/sounds/explore-eda.mp3" preload="none" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs tracking-wide uppercase text-muted-foreground">ApexFi / EDA</p>
          <div className="relative mt-1">
            <button
              onClick={() => setSelectorOpen((v) => !v)}
              className="flex items-center gap-2 text-2xl font-semibold font-display"
            >
              {ds.label}
              <ChevronDown size={18} className="text-muted-foreground" />
            </button>
            {selectorOpen && (
              <div className="absolute z-10 w-64 p-1 mt-2 border rounded-lg shadow-xl border-border bg-card">
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
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span><span className="inline-block w-2 h-2 mr-1 rounded-full bg-risk-low" />Valid {ds.quality.valid}%</span>
          <span><span className="inline-block w-2 h-2 mr-1 rounded-full bg-risk-medium" />Missing {ds.quality.missing}%</span>
          <span><span className="inline-block w-2 h-2 mr-1 rounded-full bg-risk-high" />Duplicate {ds.quality.duplicate}%</span>
        </div>
        {ds.qualityNote && <p className="mt-2 text-xs text-muted-foreground">{ds.qualityNote}</p>}
      </Panel>

      <Panel title="Statistics, Distribution &amp; Spread">
        <div className="flex flex-wrap gap-2 mb-3">
          {ds.statColumns.map((col, i) => (
            <div key={col.key} className="relative group">
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

        <div className="grid grid-cols-4 gap-2 mb-4 text-center">
          {Object.entries(activeStats).map(([k, v]) => (
            <div key={k} className="p-2 rounded-lg bg-secondary/40">
              <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
              <div className="font-mono text-sm tabular-nums">
                {v === null ? '—' : typeof v === 'number' ? v.toLocaleString() : v}
              </div>
            </div>
          ))}
        </div>

        <div>
          {ds.scatterSample && (
            <ScatterPlot
              sample={ds.scatterSample}
              xCol={scatterX.col}
              yCol={activeCol.col}
              xLabel={scatterX.key}
              yLabel={activeCol.key}
            />
          )}
        </div>
      </Panel>

      {/* Class Distribution + Box Plot Grid (all real features, not just
          the currently-selected one) -- share the row 50/50 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {ds.classDistribution && (
          <Panel title="Class Distribution">
            <div className="p-4 space-y-2 border rounded-xl border-border/50 bg-card/40 backdrop-blur-md">
              {ds.classDistribution.map((c) => {
                const total = ds.classDistribution.reduce((sum, x) => sum + x.count, 0)
                const pct = ((c.count / total) * 100).toFixed(2)
                const toneClasses = { low: 'bg-risk-low', medium: 'bg-risk-medium', high: 'bg-risk-high' }
                return (
                  <div key={c.label}>
                    <div className="flex justify-between mb-1 text-xs">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="font-mono tabular-nums">{c.count.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className={cn('h-full rounded-full', toneClasses[c.tone])} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}

        <Panel title={`Box Plot — ${activeCol.key}`}>
          <BoxPlot featureLabel={activeCol.key} stats={activeStats} />
          <p className="mt-2 text-xs text-muted-foreground">
            Click a feature above (in Statistics &amp; Distribution) to switch this box plot dynamically.
            Hover the box for real min, max, whiskers (Tukey 1.5×IQR), quartiles, and outlier flags.
          </p>
        </Panel>
      </div>

      <Panel title={`Correlation Matrix (${ds.correlationLabels.length}×${ds.correlationLabels.length})`}>
        <div className="flex justify-center py-2 overflow-x-auto">
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
                  <div className="flex justify-between mb-1 text-xs">
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
          <p className="pt-3 mt-3 text-xs leading-relaxed border-t border-border/60 text-muted-foreground">
            {ds.graph.note}
          </p>
        </Panel>
      </div>

      <div className="flex flex-col items-center gap-3 pt-6 text-center border-t border-border/60">
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