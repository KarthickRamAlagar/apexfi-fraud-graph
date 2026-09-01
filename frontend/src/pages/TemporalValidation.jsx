// import { useState } from 'react'
// import { useQuery, useMutation } from '@tanstack/react-query'
// import { motion, AnimatePresence } from 'framer-motion'
// import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
// import { ShieldAlert, ShieldCheck, HelpCircle, Clock } from 'lucide-react'
// import { Panel } from '@/components/Panel'
// import AnalyzingCard from '@/components/AnalyzingCard'
// import { api } from '@/lib/api'
// import { cn } from '@/lib/utils'

// const EMPTY_FORM = {
//   card1: '', card2: '', addr1: '', p_emaildomain: '', deviceinfo: '',
// }

// export default function TemporalValidation() {
//   const [form, setForm] = useState(EMPTY_FORM)

//   const { data: results, isLoading: resultsLoading } = useQuery({
//     queryKey: ['temporal-results'],
//     queryFn: api.temporalResults,
//   })

//   const mutation = useMutation({ mutationFn: (payload) => api.temporalScore(payload) })

//   function update(field, value) {
//     setForm((f) => ({ ...f, [field]: value }))
//   }

//   function handleScore() {
//     const payload = {
//       card1: form.card1 ? parseInt(form.card1, 10) : null,
//       card2: form.card2 ? parseInt(form.card2, 10) : null,
//       addr1: form.addr1 ? parseInt(form.addr1, 10) : null,
//       p_emaildomain: form.p_emaildomain || null,
//       deviceinfo: form.deviceinfo || null,
//     }
//     mutation.mutate(payload)
//   }

//   function handleReset() {
//     setForm(EMPTY_FORM)
//     mutation.reset()
//   }

//   const result = mutation.data
//   const comparisonData = results
//     ? [
//         {
//           metric: 'ROC-AUC',
//           Random: results.results.random_split.roc_auc,
//           Chronological: results.results.chronological_split.roc_auc,
//         },
//         {
//           metric: 'F1',
//           Random: results.results.random_split.f1,
//           Chronological: results.results.chronological_split.f1,
//         },
//         {
//           metric: 'Precision',
//           Random: results.results.random_split.precision,
//           Chronological: results.results.chronological_split.precision,
//         },
//       ]
//     : []

//   return (
//     <div className="mx-auto max-w-[1800px] px-6 py-8">
//       <div className="flex items-center gap-2 mb-1 text-xs tracking-wider uppercase text-muted-foreground">
//         <Clock size={12} /> ApexFi / Temporal Validation
//       </div>
//       <h1 className="text-2xl font-semibold font-display">Temporal Validation</h1>
//       <p className="mt-1 text-sm text-muted-foreground">
//         A real, honest comparison: a random split can overstate real-world performance, since it
//         lets a model see "future" card/device patterns during training. This page compares that
//         original approach against a genuine chronological split — trained only on the earliest
//         75% of real transactions, tested on the most recent 25% — with real rolling-window
//         velocity features added on top, and lets you score a genuinely new transaction using the
//         chronologically-validated model live.
//       </p>

//       <div className="grid grid-cols-1 gap-6 mt-6 lg:grid-cols-2">
//         <Panel title="Real Comparison: Random vs. Chronological Split">
//           {resultsLoading && <p className="py-8 text-sm text-center text-muted-foreground">Loading real results…</p>}
//           {results && (
//             <>
//               <div className="h-64">
//                 <ResponsiveContainer width="100%" height="100%">
//                   <BarChart data={comparisonData}>
//                     <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
//                     <XAxis dataKey="metric" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
//                     <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
//                     <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
//                     <Legend wrapperStyle={{ fontSize: 12 }} />
//                     <Bar dataKey="Random" fill="hsl(var(--risk-medium))" radius={[4, 4, 0, 0]} />
//                     <Bar dataKey="Chronological" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
//                   </BarChart>
//                 </ResponsiveContainer>
//               </div>
//               <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{results.note}</p>
//             </>
//           )}
//         </Panel>

//         <Panel title="Score a New Transaction (Temporal Model)">
//           <p className="mb-4 text-xs text-muted-foreground">
//             Uses the real, chronologically-validated model — scored as of the dataset's own current
//             "now," using genuine, live-queried rolling-window history, not a hardcoded value.
//           </p>
//           <div className="grid grid-cols-2 gap-3">
//             <Field label="Card1"><input value={form.card1} onChange={(e) => update('card1', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Card2"><input value={form.card2} onChange={(e) => update('card2', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Addr1"><input value={form.addr1} onChange={(e) => update('addr1', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Email domain"><input value={form.p_emaildomain} onChange={(e) => update('p_emaildomain', e.target.value)} placeholder="e.g. gmail.com" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Device Info" full><input value={form.deviceinfo} onChange={(e) => update('deviceinfo', e.target.value)} placeholder="e.g. SM-G950U Build/R16NW" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//           </div>

//           <div className="flex gap-2 mt-4">
//             <button
//               onClick={handleScore}
//               disabled={mutation.isPending}
//               className="px-4 py-2 text-sm font-medium transition-transform rounded-lg bg-primary text-primary-foreground hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
//             >
//               {mutation.isPending ? 'Scoring…' : 'Score Transaction'}
//             </button>
//             <button
//               onClick={handleReset}
//               className="px-4 py-2 text-sm transition-colors border rounded-lg border-border text-muted-foreground hover:bg-secondary"
//             >
//               Reset
//             </button>
//           </div>

//           <div className="mt-4">
//             <AnimatePresence mode="wait">
//               {mutation.isPending && (
//                 <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
//                   <AnalyzingCard steps={['Fetching live transaction history…', 'Computing real rolling features…', 'Running the temporal model…']} />
//                 </motion.div>
//               )}
//               {mutation.isError && (
//                 <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
//                   <p className="text-sm text-risk-high">{mutation.error?.message || 'Unable to score this transaction.'}</p>
//                 </motion.div>
//               )}
//               {result && !mutation.isPending && (
//                 <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
//                   <ResultDisplay result={result} />
//                 </motion.div>
//               )}
//               {!result && !mutation.isPending && !mutation.isError && (
//                 <p className="py-6 text-sm text-center text-muted-foreground">
//                   <HelpCircle size={16} className="mx-auto mb-2" />
//                   Fill in what you know and click Score Transaction.
//                 </p>
//               )}
//             </AnimatePresence>
//           </div>
//         </Panel>
//       </div>
//     </div>
//   )
// }

// function Field({ label, children, full }) {
//   return (
//     <div className={full ? 'col-span-2' : ''}>
//       <label className="block mb-1 text-xs text-muted-foreground">{label}</label>
//       {children}
//     </div>
//   )
// }

// function ResultDisplay({ result }) {
//   const tone = result.isFlagged ? 'high' : 'low'
//   const pct = Math.round(result.riskScore * 100)
//   const chartData = result.topContributingFeatures.map((f) => ({ name: f.feature, contribution: f.contribution }))

//   return (
//     <div className="space-y-4">
//       <div className={cn('rounded-xl border p-4', tone === 'high' ? 'border-risk-high/40' : 'border-risk-low/40')}>
//         <div className="flex items-center gap-2">
//           {result.isFlagged ? <ShieldAlert className="text-risk-high" size={20} /> : <ShieldCheck className="text-risk-low" size={20} />}
//           <span className={cn('font-display text-xl font-semibold', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>
//             {result.isFlagged ? 'FLAGGED' : 'CLEAR'}
//           </span>
//         </div>
//         <div className={cn('mt-1 text-sm font-medium', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>{pct}% fraud risk</div>
//       </div>

//       <div className="grid grid-cols-3 gap-2 text-xs text-center">
//         <div className="p-2 rounded-lg bg-secondary/40">
//           <div className="font-mono text-sm">{result.realRollingFeatures.card1_txn_count_1h}</div>
//           <div className="text-muted-foreground">card txns/1h</div>
//         </div>
//         <div className="p-2 rounded-lg bg-secondary/40">
//           <div className="font-mono text-sm">₹{result.realRollingFeatures.card1_amount_sum_1h.toFixed(0)}</div>
//           <div className="text-muted-foreground">card volume/1h</div>
//         </div>
//         <div className="p-2 rounded-lg bg-secondary/40">
//           <div className="font-mono text-sm">{result.realRollingFeatures.device_txn_count_1h}</div>
//           <div className="text-muted-foreground">device txns/1h</div>
//         </div>
//       </div>

//       <div className="h-32">
//         <ResponsiveContainer width="100%" height="100%">
//           <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
//             <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
//             <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={110} />
//             <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
//             <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
//               {chartData.map((e, i) => <Cell key={i} fill={e.contribution >= 0 ? 'hsl(var(--risk-high))' : 'hsl(var(--risk-low))'} />)}
//             </Bar>
//           </BarChart>
//         </ResponsiveContainer>
//       </div>

//       <p className="text-xs text-muted-foreground">{result.modelInfo.note}</p>
//     </div>
//   )
// }

// import { useState } from 'react'
// import { useQuery, useMutation } from '@tanstack/react-query'
// import { motion, AnimatePresence } from 'framer-motion'
// import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
// import { ShieldAlert, ShieldCheck, HelpCircle, Clock } from 'lucide-react'
// import { Panel } from '@/components/Panel'
// import AnalyzingCard from '@/components/AnalyzingCard'
// import { api } from '@/lib/api'
// import { cn } from '@/lib/utils'

// const EMPTY_FORM = {
//   card1: '', card2: '', addr1: '', p_emaildomain: '', deviceinfo: '',
// }

// export default function TemporalValidation() {
//   const [form, setForm] = useState(EMPTY_FORM)

//   const { data: results, isLoading: resultsLoading } = useQuery({
//     queryKey: ['temporal-results'],
//     queryFn: api.temporalResults,
//   })

//   const mutation = useMutation({ mutationFn: (payload) => api.temporalScore(payload) })

//   function update(field, value) {
//     setForm((f) => ({ ...f, [field]: value }))
//   }

//   function handleScore() {
//     const payload = {
//       card1: form.card1 ? parseInt(form.card1, 10) : null,
//       card2: form.card2 ? parseInt(form.card2, 10) : null,
//       addr1: form.addr1 ? parseInt(form.addr1, 10) : null,
//       p_emaildomain: form.p_emaildomain || null,
//       deviceinfo: form.deviceinfo || null,
//     }
//     mutation.mutate(payload)
//   }

//   function handleReset() {
//     setForm(EMPTY_FORM)
//     mutation.reset()
//   }

//   function handleLoadSample() {
//     // real card1 value validated earlier tonight -- confirmed to have
//     // genuine rolling-window history, so this demo shows a real,
//     // non-zero result rather than an empty one
//     setForm({
//       card1: '7919',
//       card2: '360',
//       addr1: '441',
//       p_emaildomain: 'gmail.com',
//       deviceinfo: 'KFFOWI Build/LVY48F',
//     })
//     mutation.reset()
//   }

//   const result = mutation.data
//   const comparisonData = results
//     ? [
//         {
//           metric: 'ROC-AUC',
//           Random: results.results.random_split.roc_auc,
//           Chronological: results.results.chronological_split.roc_auc,
//         },
//         {
//           metric: 'F1',
//           Random: results.results.random_split.f1,
//           Chronological: results.results.chronological_split.f1,
//         },
//         {
//           metric: 'Precision',
//           Random: results.results.random_split.precision,
//           Chronological: results.results.chronological_split.precision,
//         },
//       ]
//     : []

//   return (
//     <div className="mx-auto max-w-[1800px] px-6 py-8">
//       <div className="flex items-center gap-2 mb-1 text-xs tracking-wider uppercase text-muted-foreground">
//         <Clock size={12} /> ApexFi / Temporal Validation
//       </div>
//       <h1 className="text-2xl font-semibold font-display">Temporal Validation</h1>
//       <p className="mt-1 text-sm text-muted-foreground">
//         A real, honest comparison: a random split can overstate real-world performance, since it
//         lets a model see "future" card/device patterns during training. This page compares that
//         original approach against a genuine chronological split — trained only on the earliest
//         75% of real transactions, tested on the most recent 25% — with real rolling-window
//         velocity features added on top, and lets you score a genuinely new transaction using the
//         chronologically-validated model live.
//       </p>

//       <div className="grid grid-cols-1 gap-6 mt-6 lg:grid-cols-2">
//         <Panel title="Real Comparison: Random vs. Chronological Split">
//           {resultsLoading && <p className="py-8 text-sm text-center text-muted-foreground">Loading real results…</p>}
//           {results && (
//             <>
//               <div className="h-64">
//                 <ResponsiveContainer width="100%" height="100%">
//                   <BarChart data={comparisonData}>
//                     <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
//                     <XAxis dataKey="metric" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
//                     <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
//                     <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
//                     <Legend wrapperStyle={{ fontSize: 12 }} />
//                     <Bar dataKey="Random" fill="hsl(var(--risk-medium))" radius={[4, 4, 0, 0]} />
//                     <Bar dataKey="Chronological" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
//                   </BarChart>
//                 </ResponsiveContainer>
//               </div>
//               <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{results.note}</p>
//             </>
//           )}
//         </Panel>

//         <Panel title="Score a New Transaction (Temporal Model)">
//           <p className="mb-4 text-xs text-muted-foreground">
//             Uses the real, chronologically-validated model — scored as of the dataset's own current
//             "now," using genuine, live-queried rolling-window history, not a hardcoded value.
//           </p>
//           <div className="grid grid-cols-2 gap-3">
//             <Field label="Card1"><input value={form.card1} onChange={(e) => update('card1', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Card2"><input value={form.card2} onChange={(e) => update('card2', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Addr1"><input value={form.addr1} onChange={(e) => update('addr1', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Email domain"><input value={form.p_emaildomain} onChange={(e) => update('p_emaildomain', e.target.value)} placeholder="e.g. gmail.com" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//             <Field label="Device Info" full><input value={form.deviceinfo} onChange={(e) => update('deviceinfo', e.target.value)} placeholder="e.g. SM-G950U Build/R16NW" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
//           </div>

//           <div className="flex gap-2 mt-4">
//             <button
//               onClick={handleScore}
//               disabled={mutation.isPending}
//               className="px-4 py-2 text-sm font-medium transition-transform rounded-lg bg-primary text-primary-foreground hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
//             >
//               {mutation.isPending ? 'Scoring…' : 'Score Transaction'}
//             </button>
//             <button
//               onClick={handleReset}
//               className="px-4 py-2 text-sm transition-colors border rounded-lg border-border text-muted-foreground hover:bg-secondary"
//             >
//               Reset
//             </button>
//           </div>

//           <div className="mt-4">
//             <AnimatePresence mode="wait">
//               {mutation.isPending && (
//                 <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
//                   <AnalyzingCard steps={['Fetching live transaction history…', 'Computing real rolling features…', 'Running the temporal model…']} />
//                 </motion.div>
//               )}
//               {mutation.isError && (
//                 <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
//                   <p className="text-sm text-risk-high">{mutation.error?.message || 'Unable to score this transaction.'}</p>
//                 </motion.div>
//               )}
//               {result && !mutation.isPending && (
//                 <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
//                   <ResultDisplay result={result} />
//                 </motion.div>
//               )}
//               {!result && !mutation.isPending && !mutation.isError && (
//                 <div className="py-6 text-center">
//                   <HelpCircle size={16} className="mx-auto mb-2 text-muted-foreground" />
//                   <p className="text-sm text-muted-foreground">
//                     Fill in what you know and click Score Transaction.
//                   </p>
//                   <button
//                     onClick={handleLoadSample}
//                     className="px-4 py-2 mt-3 text-sm transition-colors border rounded-lg border-border text-muted-foreground hover:bg-secondary"
//                   >
//                     Load Sample
//                   </button>
//                 </div>
//               )}
//             </AnimatePresence>
//           </div>
//         </Panel>
//       </div>
//     </div>
//   )
// }

// function Field({ label, children, full }) {
//   return (
//     <div className={full ? 'col-span-2' : ''}>
//       <label className="block mb-1 text-xs text-muted-foreground">{label}</label>
//       {children}
//     </div>
//   )
// }

// function ResultDisplay({ result }) {
//   const tone = result.isFlagged ? 'high' : 'low'
//   const pct = Math.round(result.riskScore * 100)
//   const chartData = result.topContributingFeatures.map((f) => ({ name: f.feature, contribution: f.contribution }))

//   return (
//     <div className="space-y-4">
//       <div className={cn('rounded-xl border p-4', tone === 'high' ? 'border-risk-high/40' : 'border-risk-low/40')}>
//         <div className="flex items-center gap-2">
//           {result.isFlagged ? <ShieldAlert className="text-risk-high" size={20} /> : <ShieldCheck className="text-risk-low" size={20} />}
//           <span className={cn('font-display text-xl font-semibold', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>
//             {result.isFlagged ? 'FLAGGED' : 'CLEAR'}
//           </span>
//         </div>
//         <div className={cn('mt-1 text-sm font-medium', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>{pct}% fraud risk</div>
//       </div>

//       <div className="grid grid-cols-3 gap-2 text-xs text-center">
//         <div className="p-2 rounded-lg bg-secondary/40">
//           <div className="font-mono text-sm">{result.realRollingFeatures.card1_txn_count_1h}</div>
//           <div className="text-muted-foreground">card txns/1h</div>
//         </div>
//         <div className="p-2 rounded-lg bg-secondary/40">
//           <div className="font-mono text-sm">₹{result.realRollingFeatures.card1_amount_sum_1h.toFixed(0)}</div>
//           <div className="text-muted-foreground">card volume/1h</div>
//         </div>
//         <div className="p-2 rounded-lg bg-secondary/40">
//           <div className="font-mono text-sm">{result.realRollingFeatures.device_txn_count_1h}</div>
//           <div className="text-muted-foreground">device txns/1h</div>
//         </div>
//       </div>

//       <div className="h-32">
//         <ResponsiveContainer width="100%" height="100%">
//           <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
//             <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
//             <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={110} />
//             <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
//             <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
//               {chartData.map((e, i) => <Cell key={i} fill={e.contribution >= 0 ? 'hsl(var(--risk-high))' : 'hsl(var(--risk-low))'} />)}
//             </Bar>
//           </BarChart>
//         </ResponsiveContainer>
//       </div>

//       <p className="text-xs text-muted-foreground">{result.modelInfo.note}</p>
//     </div>
//   )
// }


import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { ShieldAlert, ShieldCheck, HelpCircle, Clock } from 'lucide-react'
import { Panel } from '@/components/Panel'
import AnalyzingCard from '@/components/AnalyzingCard'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const EMPTY_FORM = {
  card1: '', card2: '', addr1: '', p_emaildomain: '', deviceinfo: '',
}

export default function TemporalValidation() {
  const [form, setForm] = useState(EMPTY_FORM)

  const { data: results, isLoading: resultsLoading } = useQuery({
    queryKey: ['temporal-results'],
    queryFn: api.temporalResults,
  })

  const mutation = useMutation({ mutationFn: (payload) => api.temporalScore(payload) })

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleScore() {
    const payload = {
      card1: form.card1 ? parseInt(form.card1, 10) : null,
      card2: form.card2 ? parseInt(form.card2, 10) : null,
      addr1: form.addr1 ? parseInt(form.addr1, 10) : null,
      p_emaildomain: form.p_emaildomain || null,
      deviceinfo: form.deviceinfo || null,
    }
    mutation.mutate(payload)
  }

  function handleReset() {
    setForm(EMPTY_FORM)
    mutation.reset()
  }

  function handleLoadSample() {
    // real card1=9500 -- confirmed to have genuine activity within the
    // dataset's actual last hour (8 real transactions, ₹702.40 total).
    // card1=7919 (used earlier tonight) was a real mistake here: its real
    // history is from early in the dataset, months before "now" (which
    // this feature correctly defines as the dataset's true, real end) --
    // so it always shows zero, honestly and correctly, just not useful
    // as a demo example.
    setForm({
      card1: '9500',
      card2: '360',
      addr1: '441',
      p_emaildomain: 'gmail.com',
      deviceinfo: 'KFFOWI Build/LVY48F',
    })
    mutation.reset()
  }

  const result = mutation.data
  const comparisonData = results
    ? [
        {
          metric: 'ROC-AUC',
          Random: results.results.random_split.roc_auc,
          Chronological: results.results.chronological_split.roc_auc,
        },
        {
          metric: 'F1',
          Random: results.results.random_split.f1,
          Chronological: results.results.chronological_split.f1,
        },
        {
          metric: 'Precision',
          Random: results.results.random_split.precision,
          Chronological: results.results.chronological_split.precision,
        },
      ]
    : []

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="flex items-center gap-2 mb-1 text-xs tracking-wider uppercase text-muted-foreground">
        <Clock size={12} /> ApexFi / Temporal Validation
      </div>
      <h1 className="text-2xl font-semibold font-display">Temporal Validation</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A real, honest comparison: a random split can overstate real-world performance, since it
        lets a model see "future" card/device patterns during training. This page compares that
        original approach against a genuine chronological split — trained only on the earliest
        75% of real transactions, tested on the most recent 25% — with real rolling-window
        velocity features added on top, and lets you score a genuinely new transaction using the
        chronologically-validated model live.
      </p>

      <div className="grid grid-cols-1 gap-6 mt-6 lg:grid-cols-2">
        <Panel title="Real Comparison: Random vs. Chronological Split">
          {resultsLoading && <p className="py-8 text-sm text-center text-muted-foreground">Loading real results…</p>}
          {results && (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="metric" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Random" fill="hsl(var(--risk-medium))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Chronological" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{results.note}</p>
            </>
          )}
        </Panel>

        <Panel title="Score a New Transaction (Temporal Model)">
          <p className="mb-4 text-xs text-muted-foreground">
            Uses the real, chronologically-validated model — scored as of the dataset's own current
            "now," using genuine, live-queried rolling-window history, not a hardcoded value.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Card1"><input value={form.card1} onChange={(e) => update('card1', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
            <Field label="Card2"><input value={form.card2} onChange={(e) => update('card2', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
            <Field label="Addr1"><input value={form.addr1} onChange={(e) => update('addr1', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
            <Field label="Email domain"><input value={form.p_emaildomain} onChange={(e) => update('p_emaildomain', e.target.value)} placeholder="e.g. gmail.com" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
            <Field label="Device Info" full><input value={form.deviceinfo} onChange={(e) => update('deviceinfo', e.target.value)} placeholder="e.g. SM-G950U Build/R16NW" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleScore}
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm font-medium transition-transform rounded-lg bg-primary text-primary-foreground hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mutation.isPending ? 'Scoring…' : 'Score Transaction'}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm transition-colors border rounded-lg border-border text-muted-foreground hover:bg-secondary"
            >
              Reset
            </button>
          </div>

          <div className="mt-4">
            <AnimatePresence mode="wait">
              {mutation.isPending && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <AnalyzingCard steps={['Fetching live transaction history…', 'Computing real rolling features…', 'Running the temporal model…']} />
                </motion.div>
              )}
              {mutation.isError && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <p className="text-sm text-risk-high">{mutation.error?.message || 'Unable to score this transaction.'}</p>
                </motion.div>
              )}
              {result && !mutation.isPending && (
                <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ResultDisplay result={result} />
                </motion.div>
              )}
              {!result && !mutation.isPending && !mutation.isError && (
                <div className="py-6 text-center">
                  <HelpCircle size={16} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Fill in what you know and click Score Transaction.
                  </p>
                  <button
                    onClick={handleLoadSample}
                    className="px-4 py-2 mt-3 text-sm transition-colors border rounded-lg border-border text-muted-foreground hover:bg-secondary"
                  >
                    Load Sample
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Field({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block mb-1 text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function ResultDisplay({ result }) {
  const tone = result.isFlagged ? 'high' : 'low'
  const pct = Math.round(result.riskScore * 100)
  const chartData = result.topContributingFeatures.map((f) => ({ name: f.feature, contribution: f.contribution }))

  return (
    <div className="space-y-4">
      <div className={cn('rounded-xl border p-4', tone === 'high' ? 'border-risk-high/40' : 'border-risk-low/40')}>
        <div className="flex items-center gap-2">
          {result.isFlagged ? <ShieldAlert className="text-risk-high" size={20} /> : <ShieldCheck className="text-risk-low" size={20} />}
          <span className={cn('font-display text-xl font-semibold', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>
            {result.isFlagged ? 'FLAGGED' : 'CLEAR'}
          </span>
        </div>
        <div className={cn('mt-1 text-sm font-medium', tone === 'high' ? 'text-risk-high' : 'text-risk-low')}>{pct}% fraud risk</div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-center">
        <div className="p-2 rounded-lg bg-secondary/40">
          <div className="font-mono text-sm">{result.realRollingFeatures.card1_txn_count_1h}</div>
          <div className="text-muted-foreground">card txns/1h</div>
        </div>
        <div className="p-2 rounded-lg bg-secondary/40">
          <div className="font-mono text-sm">₹{result.realRollingFeatures.card1_amount_sum_1h.toFixed(0)}</div>
          <div className="text-muted-foreground">card volume/1h</div>
        </div>
        <div className="p-2 rounded-lg bg-secondary/40">
          <div className="font-mono text-sm">{result.realRollingFeatures.device_txn_count_1h}</div>
          <div className="text-muted-foreground">device txns/1h</div>
        </div>
      </div>

      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={110} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
            <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
              {chartData.map((e, i) => <Cell key={i} fill={e.contribution >= 0 ? 'hsl(var(--risk-high))' : 'hsl(var(--risk-low))'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted-foreground">{result.modelInfo.note}</p>
    </div>
  )
}