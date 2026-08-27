import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { LayoutGrid, Radar, Share2, Cpu, TrendingUp, GitCompareArrows } from 'lucide-react'
import StatPill from '@/components/StatPill'
import { Panel } from '@/components/Panel'
import PendingBanner from '@/components/PendingBanner'
import { DashboardSkeleton } from '@/components/PageSkeletons'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: 'easeOut' },
  }),
}

const toneMap = { normal: 'low', background: 'medium', fraud: 'high' }
const toneClasses = { low: 'text-risk-low', medium: 'text-risk-medium', high: 'text-risk-high' }
const toneBg = { low: 'bg-risk-low', medium: 'bg-risk-medium', high: 'bg-risk-high' }

export default function Dashboard() {
  const { data: summary, error: summaryError } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: api.dashboardSummary,
  })
  const { data: analytics, error: analyticsError } = useQuery({
    queryKey: ['analytics'],
    queryFn: api.analytics,
  })
  const { data: recentTxData, error: txError } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: api.recentTransactions,
  })
  const recentTx = recentTxData?.transactions

  const error = summaryError || analyticsError || txError

  if (error) {
    return (
      <div className="container py-8">
        <PendingBanner>
          Couldn't reach the backend at localhost:8000. Make sure it's running:{' '}
          <code>uv run uvicorn backend.main:app --reload</code>
        </PendingBanner>
      </div>
    )
  }

  if (!summary || !analytics || !recentTx) {
    return <DashboardSkeleton />
  }

  const totalEntities = summary.ieee_cis.total_transactions + summary.dgraph_fin.total_nodes
  const totalFlagged = summary.ieee_cis.fraud_count + summary.dgraph_fin.fraud_count
  const totalEdges = summary.ieee_cis.graph_edges + summary.dgraph_fin.total_edges

  const dgraphTotal = summary.dgraph_fin.total_nodes
  const riskDistribution = [
    { label: 'Normal', value: (summary.dgraph_fin.normal_count / dgraphTotal) * 100, tone: 'low' },
    { label: 'Background', value: (summary.dgraph_fin.background_count / dgraphTotal) * 100, tone: 'medium' },
    { label: 'Fraud', value: (summary.dgraph_fin.fraud_count / dgraphTotal) * 100, tone: 'high' },
  ]

  return (
    <div className="container space-y-6 py-8">
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <p className="text-sm text-muted-foreground">Monitored across both source datasets</p>
        <h1 className="font-display text-3xl font-semibold tabular-nums">
          {totalEntities.toLocaleString()}{' '}
          <span className="text-base font-normal text-muted-foreground">total entities</span>
        </h1>
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2" variants={fadeUp} initial="hidden" animate="show" custom={1}>
        <StatPill
          label="IEEE-CIS"
          sublabel="Card transactions"
          value={summary.ieee_cis.total_transactions.toLocaleString()}
          trend={analytics.fraudTrend.map((t) => t.fraudRate)}
          tone="high"
        />
        <StatPill
          label="DGraph-Fin"
          sublabel="User network"
          value={summary.dgraph_fin.total_nodes.toLocaleString()}
          tone="high"
        />
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <Panel title="Overview" icon={LayoutGrid}>
          <div className="text-2xl font-semibold tabular-nums">{totalFlagged.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Flagged across both datasets</div>
        </Panel>
        <Panel title="Risk Signals" icon={Radar}>
          <div className="text-2xl font-semibold tabular-nums text-risk-high">2</div>
          <div className="text-xs text-muted-foreground">Evidence-backed edge types</div>
        </Panel>
        <Panel title="Graph Stats" icon={Share2}>
          <div className="text-2xl font-semibold tabular-nums">{totalEdges.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total connections</div>
        </Panel>
        <Panel title="Model Status" icon={Cpu}>
          <div className="text-2xl font-semibold capitalize text-muted-foreground">
            {summary.model_status.replace(/_/g, ' ')}
          </div>
          <div className="text-xs text-muted-foreground">Training paused, resuming soon</div>
        </Panel>
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-4 lg:grid-cols-3" variants={fadeUp} initial="hidden" animate="show" custom={3}>
        <Panel title="Fraud Rate Trend" icon={TrendingUp} className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.fraudTrend}>
                <defs>
                  <linearGradient id="fraudGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="fraudRate" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#fraudGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Real monthly fraud rate, IEEE-CIS date range (Dec 2017–Jun 2018).
          </p>
        </Panel>

        <div className="space-y-4">
          <Panel title="DGraph-Fin Label Distribution">
            <div className="space-y-3">
              {riskDistribution.map((r) => (
                <div key={r.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={cn('font-medium tabular-nums', toneClasses[r.tone])}>
                      {r.value.toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className={cn('h-full rounded-full', toneBg[r.tone])} style={{ width: `${r.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Graph Edge Fraud Lift" icon={GitCompareArrows}>
            <div className="space-y-2">
              {analytics.edgeLift.map((e) => (
                <div key={e.name} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-foreground">{e.name}</span>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">{e.n.toLocaleString()} transactions</div>
                    <div className="text-xs text-primary">{e.lift}x lift</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}>
        <Panel title="Recent Transactions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-normal">Transaction</th>
                  <th className="pb-2 font-normal">Amount</th>
                  <th className="pb-2 font-normal">Device</th>
                  <th className="pb-2 font-normal">Card</th>
                  <th className="pb-2 font-normal">Historical Label</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 font-mono text-xs">{tx.id}</td>
                    <td className="py-2.5 tabular-nums">{tx.amount}</td>
                    <td className="py-2.5 text-muted-foreground">{tx.device}</td>
                    <td className="py-2.5 text-muted-foreground">{tx.card}</td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          tx.historicalLabel === 'Fraud' ? 'bg-risk-high/15 text-risk-high' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {tx.historicalLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Real historical labels from the source data — not a live model prediction.
          </p>
        </Panel>
      </motion.div>

      <PendingBanner>
        <strong className="text-foreground">Model not yet trained.</strong> Every figure on this page
        is real, pulled live from the Gold layer. The Investigate page will show real GNNExplainer
        output once training completes.
      </PendingBanner>
    </div>
  )
}
