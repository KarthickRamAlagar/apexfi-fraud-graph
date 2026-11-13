import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { GitCompare, Clock, Scale } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }
const MODES = [
  { key: 'both', label: 'Side by side' },
  { key: 'random', label: 'Non-time-series (random split)' },
  { key: 'chrono', label: 'Time-series (chronological)' },
]

const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)
const f4 = (v) => (v === null || v === undefined ? '—' : v.toFixed(4))

export default function ModelComparison() {
  const [mode, setMode] = useState('both')
  const { data, error } = useQuery({ queryKey: ['temporal-full-report'], queryFn: api.temporalFullReport })

  if (error) return <p className="py-12 text-sm text-center text-risk-high">Couldn't load the comparison data.</p>
  if (!data) return <p className="py-12 text-sm text-center text-muted-foreground">Loading real, saved results…</p>

  const rnd = data.randomSplitFullMetrics
  const thr = data.thresholdOptimization
  const abl = data.featureGroupAblation
  const db = data.databaseOptimization
  if (!rnd || !thr || !abl) return <p className="py-12 text-sm text-center text-risk-high">Some result files are missing — re-run the evaluation scripts.</p>

  const R = rnd.random_split_full_metrics
  const C = { ...thr['default_threshold_0.5'], roc_auc: thr.roc_auc, pr_auc: thr.pr_auc }
  const rec = thr.threshold_sweep.find((t) => t.threshold === 0.6)

  const rows = [
    { label: 'ROC-AUC', r: R.roc_auc, c: C.roc_auc, fmt: f4 },
    { label: 'PR-AUC', r: R.pr_auc, c: C.pr_auc, fmt: f4 },
    { label: 'Precision', r: R.precision, c: C.precision, fmt: pct },
    { label: 'Recall', r: R.recall, c: C.recall, fmt: pct },
    { label: 'F1', r: R.f1, c: C.f1, fmt: pct },
    { label: 'Accuracy', r: R.accuracy, c: C.accuracy, fmt: pct },
    { label: 'False-positive rate', r: R.false_positive_rate, c: C.fpr, fmt: pct },
    { label: 'False-negative rate', r: R.false_negative_rate, c: C.fnr, fmt: pct },
  ]
  const chartData = ['ROC-AUC', 'PR-AUC', 'Precision', 'Recall', 'F1'].map((name) => {
    const row = rows.find((x) => x.label === name)
    return { name, 'Non-time-series': row.r, 'Time-series': row.c }
  })

  const showR = mode !== 'chrono'
  const showC = mode !== 'random'
  const splitEffect = abl.group_a_frequency_only.roc_auc - R.roc_auc
  const rollingGain = abl.group_c_combined.roc_auc - abl.group_a_frequency_only.roc_auc

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="flex items-center gap-2 mb-1 text-xs tracking-wider uppercase text-muted-foreground">
        <GitCompare size={12} /> ApexFi / Model Comparison
      </div>
      <h1 className="text-2xl font-semibold font-display">Time-series vs Non-time-series Model</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The same fraud problem scored two ways: a <strong>random split</strong> (the model may see "future" patterns
        while training) versus a <strong>chronological split</strong> (trained on the earliest 75% of transactions,
        tested on the most recent 25%, with rolling-window velocity features). All figures are real saved results at the
        default 0.5 threshold.
      </p>

      <div className="inline-flex gap-1 p-1 mt-5 border rounded-lg border-border bg-secondary/30">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mode === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 mt-6 lg:grid-cols-2">
        <Panel title="Metrics" icon={Scale}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-left text-muted-foreground">
                <th className="py-1.5 font-normal">Metric</th>
                {showR && <th className="py-1.5 font-normal text-right">Non-time-series</th>}
                {showC && <th className="py-1.5 font-normal text-right">Time-series</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-border/50">
                  <td className="py-1.5 text-muted-foreground">{row.label}</td>
                  {showR && <td className="py-1.5 font-mono text-right tabular-nums">{row.fmt(row.r)}</td>}
                  {showC && <td className="py-1.5 font-mono text-right tabular-nums">{row.fmt(row.c)}</td>}
                </tr>
              ))}
              <tr className="border-t border-border/50">
                <td className="py-1.5 text-muted-foreground">Avg inference latency</td>
                {showR && <td className="py-1.5 font-mono text-right tabular-nums">{rnd.system_performance.avg_inference_latency_ms} ms</td>}
                {showC && <td className="py-1.5 font-mono text-right tabular-nums">{db ? `${db.after.avg_ms} ms` : '—'}</td>}
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            <Clock size={10} className="inline mr-1" />
            Latency is not like-for-like: the non-time-series figure is model + SHAP compute only; the time-series
            figure is the full live endpoint including two real database lookups for rolling-window features (after indexing).
          </p>
        </Panel>

        <Panel title="Visual comparison" icon={GitCompare}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} domain={[0, 1]} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'hsl(var(--foreground))' }} formatter={(v) => v.toFixed(4)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {showR && <Bar dataKey="Non-time-series" fill="hsl(var(--risk-medium))" radius={[4, 4, 0, 0]} />}
                {showC && <Bar dataKey="Time-series" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Why the numbers differ — a like-for-like breakdown (ROC-AUC)" className="mt-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Tile label="Random split · 4 frequency features" value={f4(R.roc_auc)} tone="medium" />
          <Tile label="Chronological · same 4 features" value={f4(abl.group_a_frequency_only.roc_auc)} sub={`${splitEffect >= 0 ? '+' : ''}${splitEffect.toFixed(4)} from the split alone`} tone="high" />
          <Tile label="+ 3 rolling-window features" value={f4(abl.group_c_combined.roc_auc)} sub={`${rollingGain >= 0 ? '+' : ''}${rollingGain.toFixed(4)} recovered`} tone="low" />
          <Tile label="Rolling features alone" value={f4(abl.group_b_rolling_only.roc_auc)} sub="weak on their own" tone="medium" />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Holding the features fixed, simply splitting by time instead of at random drops ROC-AUC by about{' '}
          {Math.abs(splitEffect).toFixed(3)}: the random split flatters the model because it can learn card and device
          patterns from the future. The chronological model is the realistic estimate of how it would perform on
          tomorrow's transactions. Rolling-window velocity features win back a modest {rollingGain.toFixed(3)}.
        </p>
      </Panel>

      <Panel title="Which one should you trust?" className="mt-6">
        <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>• <strong className="text-foreground">Report the time-series numbers as the real expectation.</strong> The non-time-series model scores higher on paper, but part of that is information leakage from the future.</li>
          <li>• At the recommended operating threshold (0.6), the time-series model reaches precision {pct(rec?.precision)}, recall {pct(rec?.recall)} and F1 {pct(rec?.f1)}.</li>
          <li>• The flagship stacked model (LightGBM + GraphSAGE, 446 features) reports F1 0.798 / ROC-AUC 0.974 on IEEE-CIS under a random split. Those are random-split figures and are not comparable with the chronological numbers above.</li>
        </ul>
      </Panel>
    </div>
  )
}

function Tile({ label, value, sub, tone }) {
  const color = { high: 'text-risk-high', medium: 'text-risk-medium', low: 'text-risk-low' }[tone]
  return (
    <div className="p-3 border rounded-xl border-border/60 bg-secondary/20">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-mono text-xl font-semibold tabular-nums', color)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}