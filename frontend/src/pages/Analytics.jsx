import { Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, Grid3x3, GitCompareArrows, Landmark, Share2 } from 'lucide-react'
import { Panel } from '@/components/Panel'
import PendingBanner from '@/components/PendingBanner'
import FraudHeatmap from '@/components/FraudHeatmap'
import { AnalyticsSkeleton } from '@/components/PageSkeletons'
import { api } from '@/lib/api'

const chartTooltip = {
  contentStyle: {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
  },
}

const axisProps = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35 } }),
}

export default function Analytics() {
  // Same queryKey as Dashboard's analytics fetch — TanStack Query shares
  // the cache between them, so visiting one after the other is instant.
  const { data, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: api.analytics,
  })

  if (error) {
    return (
      <div className="container py-8">
        <PendingBanner>
          Couldn't reach the backend at localhost:8000, or no precomputed summary exists yet. Run:{' '}
          <code>uv run python -m backend.services.precompute_summaries</code>
        </PendingBanner>
      </div>
    )
  }

  if (!data) {
    return <AnalyticsSkeleton />
  }

  const { kpis, fraudTrend, heatmap, edgeLift, rbiOverlay, rbiOverlayNote, degreeByLabel } = data

  return (
    <div className="container space-y-6 py-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">ApexFi / Analytics</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every panel below is precomputed from real Gold-layer SQL aggregates — not mock data.
        </p>
      </div>

      <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-3" variants={fadeUp} initial="hidden" animate="show">
        <Panel>
          <div className="text-xs text-muted-foreground">Overall Fraud Rate</div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-risk-high">
            {kpis.overallFraudRate}%
          </div>
        </Panel>
        <Panel>
          <div className="text-xs text-muted-foreground">Total Flagged</div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {kpis.totalFlagged.toLocaleString()}
          </div>
        </Panel>
        <Panel>
          <div className="text-xs text-muted-foreground">Best Edge Lift</div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-primary">
            {kpis.bestEdgeLift}x
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}>
        <Panel title="Fraud Rate Trend" icon={TrendingUp}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fraudTrend}>
                <defs>
                  <linearGradient id="analyticsFraudGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} unit="%" />
                <Tooltip {...chartTooltip} />
                <Area type="monotone" dataKey="fraudRate" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#analyticsFraudGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Real monthly fraud rate, IEEE-CIS date range (Dec 2017–Jun 2018).
          </p>
        </Panel>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
          <Panel title="Fraud Density by Day &amp; Hour" icon={Grid3x3}>
            <FraudHeatmap data={heatmap} />
          </Panel>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}>
          <Panel title="Graph Edge Fraud Lift" icon={GitCompareArrows}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={edgeLift} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" {...axisProps} unit="x" />
                  <YAxis type="category" dataKey="name" {...axisProps} width={110} />
                  <Tooltip {...chartTooltip} formatter={(v) => [`${v}x`, 'Fraud lift']} />
                  <Bar dataKey="lift" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Real lift: fraud rate among transactions with each edge type vs. transactions with no edges at all.
            </p>
          </Panel>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}>
          <Panel title="Fraud Rate vs. RBI Bank Rate" icon={Landmark}>
            {rbiOverlay.length > 1 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rbiOverlay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="fiscalYear" {...axisProps} />
                    <YAxis yAxisId="left" {...axisProps} unit="%" />
                    <YAxis yAxisId="right" orientation="right" {...axisProps} />
                    <Tooltip {...chartTooltip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="fraudRate" name="Fraud rate %" stroke="hsl(var(--risk-high))" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="bankRate" name="RBI bank rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              // Only one real fiscal year of RBI-matched data exists — a
              // line chart with one point looks broken, so show it as a
              // clear stat callout instead.
              <div className="grid grid-cols-2 gap-3">
                {rbiOverlay.map((r) => (
                  <Fragment key={r.fiscalYear}>
                    <div className="rounded-lg bg-secondary/40 p-3 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">{r.fiscalYear} Fraud Rate</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-risk-high">{r.fraudRate}%</div>
                    </div>
                    <div className="rounded-lg bg-secondary/40 p-3 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">{r.fiscalYear} RBI Bank Rate</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-primary">{r.bankRate}%</div>
                    </div>
                  </Fragment>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{rbiOverlayNote}</p>
          </Panel>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}>
          <Panel title="DGraph-Fin: Avg. Connections by Label" icon={Share2}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={degreeByLabel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="degree" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Real average degree by label — fraud users show measurably fewer connections.
            </p>
          </Panel>
        </motion.div>
      </div>
    </div>
  )
}
