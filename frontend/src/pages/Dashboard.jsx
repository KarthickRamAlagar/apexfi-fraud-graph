// import { useQuery } from '@tanstack/react-query'
// import { Link } from 'react-router-dom'
// import { motion } from 'framer-motion'
// import {
//   AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
// } from 'recharts'
// import { LayoutGrid, Radar, Share2, Cpu, TrendingUp, GitCompareArrows } from 'lucide-react'
// import StatPill from '@/components/StatPill'
// import { Panel } from '@/components/Panel'
// import PendingBanner from '@/components/PendingBanner'
// import { DashboardSkeleton } from '@/components/PageSkeletons'
// import { api } from '@/lib/api'
// import { cn } from '@/lib/utils'

// const fadeUp = {
//   hidden: { opacity: 0, y: 12 },
//   show: (i = 0) => ({
//     opacity: 1,
//     y: 0,
//     transition: { delay: i * 0.05, duration: 0.4, ease: 'easeOut' },
//   }),
// }

// const toneMap = { normal: 'low', background: 'medium', fraud: 'high' }
// const toneClasses = { low: 'text-risk-low', medium: 'text-risk-medium', high: 'text-risk-high' }
// const toneBg = { low: 'bg-risk-low', medium: 'bg-risk-medium', high: 'bg-risk-high' }

// export default function Dashboard() {
//   const { data: summary, error: summaryError } = useQuery({
//     queryKey: ['dashboard-summary'],
//     queryFn: api.dashboardSummary,
//   })
//   const { data: analytics, error: analyticsError } = useQuery({
//     queryKey: ['analytics'],
//     queryFn: api.analytics,
//   })
//   const { data: recentTxData, error: txError } = useQuery({
//     queryKey: ['recent-transactions'],
//     queryFn: api.recentTransactions,
//   })
//   const recentTx = recentTxData?.transactions

//   const error = summaryError || analyticsError || txError

//   if (error) {
//     return (
//       <div className="container py-8">
//         <PendingBanner>
//           Couldn't reach the backend at localhost:8000. Make sure it's running:{' '}
//           <code>uv run uvicorn backend.main:app --reload</code>
//         </PendingBanner>
//       </div>
//     )
//   }

//   if (!summary || !analytics || !recentTx) {
//     return <DashboardSkeleton />
//   }

//   const totalEntities = summary.ieee_cis.total_transactions + summary.dgraph_fin.total_nodes
//   const totalFlagged = summary.ieee_cis.fraud_count + summary.dgraph_fin.fraud_count
//   const totalEdges = summary.ieee_cis.graph_edges + summary.dgraph_fin.total_edges

//   const dgraphTotal = summary.dgraph_fin.total_nodes
//   const riskDistribution = [
//     { label: 'Normal', value: (summary.dgraph_fin.normal_count / dgraphTotal) * 100, tone: 'low' },
//     { label: 'Background', value: (summary.dgraph_fin.background_count / dgraphTotal) * 100, tone: 'medium' },
//     { label: 'Fraud', value: (summary.dgraph_fin.fraud_count / dgraphTotal) * 100, tone: 'high' },
//   ]

//   return (
//     <div className="container py-8 space-y-6">
//       <motion.div variants={fadeUp} initial="hidden" animate="show">
//         <p className="text-sm text-muted-foreground">Monitored across both source datasets</p>
//         <h1 className="text-3xl font-semibold font-display tabular-nums">
//           {totalEntities.toLocaleString()}{' '}
//           <span className="text-base font-normal text-muted-foreground">total entities</span>
//         </h1>
//       </motion.div>

//       <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2" variants={fadeUp} initial="hidden" animate="show" custom={1}>
//         <StatPill
//           label="IEEE-CIS"
//           sublabel="Card transactions"
//           value={summary.ieee_cis.total_transactions.toLocaleString()}
//           trend={analytics.fraudTrend.map((t) => t.fraudRate)}
//           tone="high"
//         />
//         <StatPill
//           label="DGraph-Fin"
//           sublabel="User network"
//           value={summary.dgraph_fin.total_nodes.toLocaleString()}
//           trend={riskDistribution.map((d) => d.value)}
//           tone="high"
//         />
//       </motion.div>

//       <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" variants={fadeUp} initial="hidden" animate="show" custom={2}>
//         <Panel title="Overview" icon={LayoutGrid}>
//           <div className="text-2xl font-semibold tabular-nums">{totalFlagged.toLocaleString()}</div>
//           <div className="text-xs text-muted-foreground">Flagged across both datasets</div>
//         </Panel>
//         <Panel title="Risk Signals" icon={Radar}>
//           <div className="text-2xl font-semibold tabular-nums text-risk-high">2</div>
//           <div className="text-xs text-muted-foreground">Evidence-backed edge types</div>
//         </Panel>
//         <Panel title="Graph Stats" icon={Share2}>
//           <div className="text-2xl font-semibold tabular-nums">{totalEdges.toLocaleString()}</div>
//           <div className="text-xs text-muted-foreground">Total connections</div>
//         </Panel>
//         <Panel title="Model Status" icon={Cpu}>
//           <div className={cn(
//             'text-2xl font-semibold capitalize',
//             summary.model_status === 'trained_and_validated' ? 'text-risk-low' : 'text-muted-foreground'
//           )}>
//             {summary.model_status === 'trained_and_validated' ? 'Trained' : summary.model_status.replace(/_/g, ' ')}
//           </div>
//           <div className="text-xs text-muted-foreground">
//             {summary.model_status === 'trained_and_validated'
//               ? `${summary.model_validation?.ieee_cis?.seeds_validated ?? 3}-seed validated`
//               : 'Some models still pending'}
//           </div>
//         </Panel>
//       </motion.div>

//       {summary.model_status === 'trained_and_validated' && summary.model_validation && (
//         <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2" variants={fadeUp} initial="hidden" animate="show" custom={2.5}>
//           {Object.entries(summary.model_validation).map(([key, v]) => (
//             <Panel key={key} title={key === 'ieee_cis' ? 'IEEE-CIS Model (validated)' : 'DGraph-Fin Model (validated)'} icon={Cpu}>
//               <div className="flex gap-6">
//                 <div>
//                   <div className="font-mono text-xl font-semibold tabular-nums">
//                     {(v.f1_mean * 100).toFixed(1)}% <span className="text-xs font-normal text-muted-foreground">± {(v.f1_std * 100).toFixed(1)}</span>
//                   </div>
//                   <div className="text-xs text-muted-foreground">F1 score</div>
//                 </div>
//                 <div>
//                   <div className="font-mono text-xl font-semibold tabular-nums">{(v.roc_auc_mean * 100).toFixed(1)}%</div>
//                   <div className="text-xs text-muted-foreground">ROC-AUC</div>
//                 </div>
//               </div>
//               <p className="mt-2 text-xs text-muted-foreground">Real, {v.seeds_validated}-seed cross-validated — stacked LightGBM + GNN.</p>
//             </Panel>
//           ))}
//         </motion.div>
//       )}

//       <motion.div className="grid grid-cols-1 gap-4 lg:grid-cols-3" variants={fadeUp} initial="hidden" animate="show" custom={3}>
//         <Panel title="Fraud Rate Trend" icon={TrendingUp} className="lg:col-span-2">
//           <div className="h-64">
//             <ResponsiveContainer width="100%" height="100%">
//               <AreaChart data={analytics.fraudTrend}>
//                 <defs>
//                   <linearGradient id="fraudGrad" x1="0" y1="0" x2="0" y2="1">
//                     <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
//                     <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
//                   </linearGradient>
//                 </defs>
//                 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
//                 <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
//                 <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} unit="%" />
//                 <Tooltip
//                   contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
//                 />
//                 <Area type="monotone" dataKey="fraudRate" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#fraudGrad)" />
//               </AreaChart>
//             </ResponsiveContainer>
//           </div>
//           <p className="mt-2 text-xs text-muted-foreground">
//             Real monthly fraud rate, IEEE-CIS date range (Dec 2017–Jun 2018).
//           </p>
//         </Panel>

//         <div className="space-y-4">
//           <Panel title="DGraph-Fin Label Distribution">
//             <div className="space-y-3">
//               {riskDistribution.map((r) => (
//                 <div key={r.label}>
//                   <div className="flex justify-between mb-1 text-xs">
//                     <span className="text-muted-foreground">{r.label}</span>
//                     <span className={cn('font-medium tabular-nums', toneClasses[r.tone])}>
//                       {r.value.toFixed(2)}%
//                     </span>
//                   </div>
//                   <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
//                     <div className={cn('h-full rounded-full', toneBg[r.tone])} style={{ width: `${r.value}%` }} />
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </Panel>

//           <Panel title="Graph Edge Fraud Lift" icon={GitCompareArrows}>
//             <div className="space-y-2">
//               {analytics.edgeLift.map((e) => (
//                 <div key={e.name} className="flex items-center justify-between text-sm">
//                   <span className="font-mono text-xs text-foreground">{e.name}</span>
//                   <div className="text-right">
//                     <div className="text-xs text-muted-foreground">{e.n.toLocaleString()} transactions</div>
//                     <div className="text-xs text-primary">{e.lift}x lift</div>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </Panel>
//         </div>
//       </motion.div>

//       <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}>
//         <Panel title="Recent Transactions">
//           <div className="overflow-x-auto">
//             <table className="w-full text-sm">
//               <thead>
//                 <tr className="text-xs text-left border-b border-border text-muted-foreground">
//                   <th className="pb-2 font-normal">Transaction</th>
//                   <th className="pb-2 font-normal">Amount</th>
//                   <th className="pb-2 font-normal">Device</th>
//                   <th className="pb-2 font-normal">Card</th>
//                   <th className="pb-2 font-normal">Historical Label</th>
//                   <th className="pb-2 font-normal">Model Prediction</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {recentTx.map((tx) => {
//                   const matches = tx.predictedLabel && tx.predictedLabel === tx.historicalLabel
//                   return (
//                     <tr key={tx.id} className="border-b border-border/50 last:border-0">
//                       <td className="py-2.5 font-mono text-xs">{tx.id}</td>
//                       <td className="py-2.5 tabular-nums">{tx.amount}</td>
//                       <td className="py-2.5 text-muted-foreground">{tx.device}</td>
//                       <td className="py-2.5 text-muted-foreground">{tx.card}</td>
//                       <td className="py-2.5">
//                         <span
//                           className={cn(
//                             'rounded-full px-2 py-0.5 text-xs',
//                             tx.historicalLabel === 'Fraud' ? 'bg-risk-high/15 text-risk-high' : 'bg-muted text-muted-foreground'
//                           )}
//                         >
//                           {tx.historicalLabel}
//                         </span>
//                       </td>
//                       <td className="py-2.5">
//                         {tx.predictedLabel ? (
//                           <span className="flex items-center gap-1.5">
//                             <span
//                               className={cn(
//                                 'rounded-full px-2 py-0.5 text-xs',
//                                 tx.predictedLabel === 'Fraud' ? 'bg-risk-high/15 text-risk-high' : 'bg-muted text-muted-foreground'
//                               )}
//                             >
//                               {tx.predictedLabel}
//                             </span>
//                             <span className={matches ? 'text-risk-low' : 'text-risk-medium'} title={matches ? 'Matches historical label' : "Doesn't match historical label"}>
//                               {matches ? '✓' : '✗'}
//                             </span>
//                           </span>
//                         ) : (
//                           <span className="text-xs text-muted-foreground">unavailable</span>
//                         )}
//                       </td>
//                     </tr>
//                   )
//                 })}
//               </tbody>
//             </table>
//           </div>
//           <p className="mt-2 text-xs text-muted-foreground">
//             Historical Label is real ground truth from the source data. Model Prediction is a real,
//             live prediction from the trained stacked model, computed fresh for each of these
//             transactions — not the same thing, shown side by side on purpose.
//           </p>
//         </Panel>

//       </motion.div>

//       {summary.model_status === 'trained_and_validated' ? (
//         <div className="p-4 text-sm leading-relaxed border border-dashed rounded-lg border-muted-foreground/30 bg-muted/20 text-muted-foreground">
//           <p>
//             <strong className="text-foreground">Models trained and validated.</strong> Every figure on
//             this page is real, pulled live from the Gold layer.
//           </p>
//           <div className="flex flex-wrap gap-2 mt-3">
//             <Link
//               to="/investigate"
//               className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
//             >
//               Investigate a real transaction →
//             </Link>
//             <Link
//               to="/score-new"
//               className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
//             >
//               Score a new IEEE-CIS transaction →
//             </Link>
//             <Link
//               to="/score-account"
//               className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
//             >
//               Score an unlabeled DGraph-Fin account →
//             </Link>
//           </div>
//         </div>
//       ) : (
//         <PendingBanner>
//           <strong className="text-foreground">Training in progress.</strong> Every figure on this page
//           is real, pulled live from the Gold layer. Some models are still being validated.
//         </PendingBanner>
//       )}
//     </div>
//   )
// }

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { LayoutGrid, Radar, Share2, Cpu, TrendingUp, GitCompareArrows, Link2 } from 'lucide-react'
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

// Ethereum stats now come live from the backend (summary.ethereum),
// computed for real from the actual CSV + saved training metrics — see
// backend/services/precompute_summaries.py::compute_ethereum_summary().
// Handled as possibly-null below, since the summary returns null if the
// raw CSV isn't present on this machine yet.

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

  const eth = summary.ethereum // may be null if the raw CSV isn't present locally yet
  const totalEntities = summary.ieee_cis.total_transactions + summary.dgraph_fin.total_nodes + (eth?.total_accounts ?? 0)
  const totalFlagged = summary.ieee_cis.fraud_count + summary.dgraph_fin.fraud_count + (eth?.fraud_count ?? 0)
  const totalEdges = summary.ieee_cis.graph_edges + summary.dgraph_fin.total_edges

  const dgraphTotal = summary.dgraph_fin.total_nodes
  const riskDistribution = [
    { label: 'Normal', value: (summary.dgraph_fin.normal_count / dgraphTotal) * 100, tone: 'low' },
    { label: 'Background', value: (summary.dgraph_fin.background_count / dgraphTotal) * 100, tone: 'medium' },
    { label: 'Fraud', value: (summary.dgraph_fin.fraud_count / dgraphTotal) * 100, tone: 'high' },
  ]

  const ethDistribution = eth
    ? [
        { value: (eth.normal_count / eth.total_accounts) * 100 },
        { value: (eth.fraud_count / eth.total_accounts) * 100 },
      ]
    : []

  return (
    <div className="container py-8 space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <p className="text-sm text-muted-foreground">Monitored across three source datasets</p>
        <h1 className="text-3xl font-semibold font-display tabular-nums">
          {totalEntities.toLocaleString()}{' '}
          <span className="text-base font-normal text-muted-foreground">total entities</span>
        </h1>
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-3" variants={fadeUp} initial="hidden" animate="show" custom={1}>
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
          trend={riskDistribution.map((d) => d.value)}
          tone="high"
        />
        {eth && (
          <StatPill
            label="Ethereum (Experiment)"
            sublabel="Blockchain accounts"
            value={eth.total_accounts.toLocaleString()}
            trend={ethDistribution.map((d) => d.value)}
            tone="high"
          />
        )}
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <Panel title="Overview" icon={LayoutGrid}>
          <div className="text-2xl font-semibold tabular-nums">{totalFlagged.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Flagged across all three datasets</div>
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
          <div className={cn(
            'text-2xl font-semibold capitalize',
            summary.model_status === 'trained_and_validated' ? 'text-risk-low' : 'text-muted-foreground'
          )}>
            {summary.model_status === 'trained_and_validated' ? 'Trained' : summary.model_status.replace(/_/g, ' ')}
          </div>
          <div className="text-xs text-muted-foreground">
            {summary.model_status === 'trained_and_validated'
              ? `${summary.model_validation?.ieee_cis?.seeds_validated ?? 3}-seed validated`
              : 'Some models still pending'}
          </div>
        </Panel>
      </motion.div>

      {summary.model_status === 'trained_and_validated' && summary.model_validation && (
        <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-3" variants={fadeUp} initial="hidden" animate="show" custom={2.5}>
          {Object.entries(summary.model_validation)
            .filter(([key]) => key !== 'ethereum')
            .map(([key, v]) => (
            <Panel key={key} title={key === 'ieee_cis' ? 'IEEE-CIS Model (validated)' : 'DGraph-Fin Model (validated)'} icon={Cpu}>
              <div className="flex gap-6">
                <div>
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {(v.f1_mean * 100).toFixed(1)}% <span className="text-xs font-normal text-muted-foreground">± {(v.f1_std * 100).toFixed(1)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">F1 score</div>
                </div>
                <div>
                  <div className="font-mono text-xl font-semibold tabular-nums">{(v.roc_auc_mean * 100).toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">ROC-AUC</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Real, {v.seeds_validated}-seed cross-validated — stacked LightGBM + GNN.</p>
            </Panel>
          ))}
          {summary.model_validation.ethereum?.trained && (
            <Panel title="Ethereum Model (validated)" icon={Link2}>
              <div className="flex gap-6">
                <div>
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {(summary.model_validation.ethereum.f1_mean * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">F1 score</div>
                </div>
                <div>
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {(summary.model_validation.ethereum.roc_auc_mean * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">ROC-AUC</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Real held-out test result — single run (not multi-seed validated), LightGBM + SHAP,
                third independent experiment.
              </p>
            </Panel>
          )}
        </motion.div>
      )}

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
                  <div className="flex justify-between mb-1 text-xs">
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
                <tr className="text-xs text-left border-b border-border text-muted-foreground">
                  <th className="pb-2 font-normal">Transaction</th>
                  <th className="pb-2 font-normal">Amount</th>
                  <th className="pb-2 font-normal">Device</th>
                  <th className="pb-2 font-normal">Card</th>
                  <th className="pb-2 font-normal">Historical Label</th>
                  <th className="pb-2 font-normal">Model Prediction</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map((tx) => {
                  const matches = tx.predictedLabel && tx.predictedLabel === tx.historicalLabel
                  return (
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
                      <td className="py-2.5">
                        {tx.predictedLabel ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs',
                                tx.predictedLabel === 'Fraud' ? 'bg-risk-high/15 text-risk-high' : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {tx.predictedLabel}
                            </span>
                            <span className={matches ? 'text-risk-low' : 'text-risk-medium'} title={matches ? 'Matches historical label' : "Doesn't match historical label"}>
                              {matches ? '✓' : '✗'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">unavailable</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Historical Label is real ground truth from the source data. Model Prediction is a real,
            live prediction from the trained stacked model, computed fresh for each of these
            transactions — not the same thing, shown side by side on purpose.
          </p>
        </Panel>

      </motion.div>

      {summary.model_status === 'trained_and_validated' ? (
        <div className="p-4 text-sm leading-relaxed border border-dashed rounded-lg border-muted-foreground/30 bg-muted/20 text-muted-foreground">
          <p>
            <strong className="text-foreground">Models trained and validated.</strong> Every figure on
            this page is real, pulled live from the Gold layer (Ethereum stats are read live from
            its real training data and results, though it's a single-run experiment, not multi-seed
            validated like the other two).
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link
              to="/investigate"
              className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
            >
              Investigate a real transaction →
            </Link>
            <Link
              to="/score-new"
              className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
            >
              Score a new IEEE-CIS transaction →
            </Link>
            <Link
              to="/score-account"
              className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
            >
              Score an unlabeled DGraph-Fin account →
            </Link>
            <Link
              to="/ethereum-fraud"
              className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
            >
              Score an Ethereum account →
            </Link>
          </div>
        </div>
      ) : (
        <PendingBanner>
          <strong className="text-foreground">Training in progress.</strong> Every figure on this page
          is real, pulled live from the Gold layer. Some models are still being validated.
        </PendingBanner>
      )}
    </div>
  )
}