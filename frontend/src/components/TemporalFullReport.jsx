import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, ReferenceLine,
} from 'recharts'
import { Sliders, Zap, GitMerge, Layers, Database, TrendingUp, Award, HardDrive } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const COLORS = {
  primary: 'hsl(var(--primary))',
  high: 'hsl(var(--risk-high))',
  medium: 'hsl(var(--risk-medium))',
  low: 'hsl(var(--risk-low))',
  muted: 'hsl(var(--muted-foreground))',
}

const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }
const itemStyle = { color: 'hsl(var(--foreground))' }

export default function TemporalFullReport() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['temporal-full-report'],
    queryFn: api.temporalFullReport,
  })

  if (isLoading) {
    return <p className="py-12 text-sm text-center text-muted-foreground">Loading the real, complete evaluation report…</p>
  }
  if (error || !data) {
    return <p className="py-12 text-sm text-center text-risk-high">Couldn't load the full report.</p>
  }

  return (
    <div className="space-y-6">
      {data.databaseOptimization && <DatabasePanel d={data.databaseOptimization} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {data.thresholdOptimization && <ThresholdPanel d={data.thresholdOptimization} />}
        {data.quickWins && <FeatureImportancePanel d={data.quickWins} />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {data.shapGlobalImportance && <ShapPanel d={data.shapGlobalImportance} />}
        {data.featureGroupAblation && <AblationPanel d={data.featureGroupAblation} />}
      </div>

      {data.hybridStacking && data.hybridThresholdCheck && (
        <HybridPanel stacking={data.hybridStacking} thresholdCheck={data.hybridThresholdCheck} />
      )}

      {data.quickWins?.memory_recheck_mb && <ReliabilityPanel d={data.quickWins} />}
    </div>
  )
}

function DatabasePanel({ d }) {
  const before = d.before
  const after = d.after
  return (
    <Panel title="Database Optimization — Real Before/After" icon={Database}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="p-4 border rounded-xl border-risk-high/30 bg-risk-high/5">
          <div className="text-xs tracking-wide uppercase text-muted-foreground">Before (unindexed)</div>
          <div className="mt-1 text-2xl font-semibold font-display text-risk-high tabular-nums">{before.avg_ms.toLocaleString()} ms</div>
          <div className="text-xs text-muted-foreground">avg · P95 {before.p95_ms.toLocaleString()} ms</div>
        </div>
        <div className="p-4 border rounded-xl border-risk-low/30 bg-risk-low/5">
          <div className="text-xs tracking-wide uppercase text-muted-foreground">After (composite indexes)</div>
          <div className="mt-1 text-2xl font-semibold font-display text-risk-low tabular-nums">{after.avg_ms.toLocaleString()} ms</div>
          <div className="text-xs text-muted-foreground">avg · P95 {after.p95_ms.toLocaleString()} ms</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5">
        <Zap size={16} className="text-primary" />
        <span className="text-lg font-semibold font-display text-primary">{d.improvement_pct.avg}%</span>
        <span className="text-sm text-muted-foreground">faster average latency, {d.improvement_pct.p95}% faster P95</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{d.note}</p>
    </Panel>
  )
}

function ThresholdPanel({ d }) {
  const chartData = d.threshold_sweep.map((t) => ({ ...t, thresholdLabel: t.threshold.toFixed(1) }))
  return (
    <Panel title="Threshold Optimization" icon={Sliders}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="thresholdLabel" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={itemStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x="0.6" stroke={COLORS.low} strokeDasharray="4 4" label={{ value: 'Recommended', fontSize: 10, fill: COLORS.low }} />
            <Line type="monotone" dataKey="precision" stroke={COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="recall" stroke={COLORS.high} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="f1" stroke={COLORS.low} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-3 text-xs">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Recommended: 0.6</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Max-F1: {d.best_f1_threshold.threshold}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">ROC-AUC: {d.roc_auc}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">PR-AUC: {d.pr_auc}</span>
      </div>
    </Panel>
  )
}

function FeatureImportancePanel({ d }) {
  const chartData = d.feature_importance_gain.map((f) => ({ name: f.feature, value: f.importance }))
  return (
    <Panel title="Feature Importance (LightGBM Gain)" icon={TrendingUp}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
            <XAxis type="number" stroke={COLORS.muted} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" stroke={COLORS.muted} fontSize={10} tickLine={false} axisLine={false} width={130} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={itemStyle} formatter={(v) => v.toLocaleString()} />
            <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Real threshold: {d.finalized_threshold.value} — chosen over max-F1 to avoid a sharp recall collapse.
      </p>
    </Panel>
  )
}

function ShapPanel({ d }) {
  const chartData = d.global_importance.map((f) => ({
    name: f.feature, value: f.mean_abs_shap, direction: f.typical_direction,
  }))
  return (
    <Panel title="SHAP Global Importance" icon={Award}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
            <XAxis type="number" stroke={COLORS.muted} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" stroke={COLORS.muted} fontSize={10} tickLine={false} axisLine={false} width={130} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={itemStyle} formatter={(v, n, p) => [v.toFixed(3), p.payload.direction]} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((e, i) => (
                <Cell key={i} fill={e.direction === 'toward fraud' ? COLORS.high : COLORS.low} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Real, computed across {d.sample_size.toLocaleString()} test transactions. Red = typically pushes toward fraud, green = toward normal.
      </p>
    </Panel>
  )
}

function AblationPanel({ d }) {
  const chartData = [
    { name: 'Frequency only\n(4 features)', roc_auc: d.group_a_frequency_only.roc_auc },
    { name: 'Rolling only\n(3 features)', roc_auc: d.group_b_rolling_only.roc_auc },
    { name: 'Combined\n(7 features)', roc_auc: d.group_c_combined.roc_auc },
  ]
  return (
    <Panel title="Feature Group Ablation" icon={Layers}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" stroke={COLORS.muted} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} domain={[0, 1]} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={itemStyle} formatter={(v) => v.toFixed(4)} />
            <Bar dataKey="roc_auc" radius={[4, 4, 0, 0]}>
              <Cell fill={COLORS.medium} />
              <Cell fill={COLORS.medium} />
              <Cell fill={COLORS.primary} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Frequency features dominate; rolling-window features add real but modest incremental value.
      </p>
    </Panel>
  )
}

function HybridPanel({ stacking, thresholdCheck }) {
  const r = stacking.results
  const bestHybrid = thresholdCheck.best
  const chartData = [
    { name: 'LightGBM alone', precision: r.lightgbm_alone.precision, recall: r.lightgbm_alone.recall, f1: r.lightgbm_alone.f1 },
    { name: 'GraphSAGE alone', precision: r.graphsage_alone.precision, recall: r.graphsage_alone.recall, f1: r.graphsage_alone.f1 },
    { name: `Hybrid (@ ${bestHybrid.threshold})`, precision: bestHybrid.precision, recall: bestHybrid.recall, f1: bestHybrid.f1 },
  ]
  return (
    <Panel title="Hybrid Model Comparison — Temporal Split" icon={GitMerge}>
      <div className="px-3 py-2 mb-3 text-xs rounded-lg bg-secondary/40 text-muted-foreground">
        <strong className="text-foreground">Real bug found and fixed:</strong> the hybrid model's raw probabilities
        were heavily compressed (median {thresholdCheck.prob_distribution.median.toFixed(4)}) — at the default 0.5
        threshold it looked broken (Recall 0.31%). Properly calibrated at its own optimal threshold ({bestHybrid.threshold}),
        it shows a genuine, modest improvement.
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={itemStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="precision" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            <Bar dataKey="recall" fill={COLORS.high} radius={[4, 4, 0, 0]} />
            <Bar dataKey="f1" fill={COLORS.low} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

function ReliabilityPanel({ d }) {
  // P95/P99 come from the latest quick_wins run, measured AFTER the composite-index fix.
  const lat = d.latency_percentiles_ms
  return (
    <Panel title="System Reliability" icon={HardDrive}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="p-3 rounded-lg bg-secondary/40">
          <div className="font-mono text-lg tabular-nums">{d.memory_recheck_mb.delta >= 0 ? '+' : ''}{d.memory_recheck_mb.delta} MB</div>
          <div className="text-xs text-muted-foreground">Memory delta / 20 predictions</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/40">
          <div className="font-mono text-lg tabular-nums">{lat.p95.toFixed(0)} ms</div>
          <div className="text-xs text-muted-foreground">P95 latency</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/40">
          <div className="font-mono text-lg tabular-nums">{lat.p99.toFixed(0)} ms</div>
          <div className="text-xs text-muted-foreground">P99 latency</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Memory stable across repeated predictions — no leak detected. P95/P99 measured after the indexing fix
        (quick_wins run). The Database Optimization panel above reports its own 100-prediction benchmark, so its
        P95 differs slightly by sample.
      </p>
    </Panel>
  )
}