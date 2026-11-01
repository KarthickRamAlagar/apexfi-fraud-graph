import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Calculator, Cpu, SlidersHorizontal } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const money = (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`)
const num = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }))
const TAG = {
  MEASURED: 'bg-emerald-500/15 text-emerald-600',
  DERIVED: 'bg-sky-500/15 text-sky-600',
  SCENARIO: 'bg-amber-500/15 text-amber-600',
}
const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }

function Tag({ t }) {
  const key = (t || '').split(' ')[0]
  return <span className={cn('ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium', TAG[key] || TAG.SCENARIO)}>{key || 'SCENARIO'}</span>
}
function Stat({ label, value, sub, tag }) {
  return (
    <div className="p-4 border rounded-xl border-border bg-card">
      <div className="text-xs text-muted-foreground">{label}{tag && <Tag t={tag} />}</div>
      <div className="mt-1 text-xl font-semibold font-display">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
function Field({ label, value, onChange, step = 'any', hint }) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1.5 mt-1 text-sm border rounded-md border-border bg-background" />
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

const BASE = { prevention_rate: 0.9, loss_given_miss: 1, review_cost: 2, friction_cost: 5, minutes_per_review: 5, analysts: 400 }

function Assumptions({ a, setA }) {
  const s = (k) => (v) => setA((p) => ({ ...p, [k]: v }))
  return (
    <Panel title="Assumptions (editable — these are assumptions, not measurements)" icon={SlidersHorizontal}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Field label="Fraud value stopped when flagged (0–1)" value={a.prevention_rate} onChange={s('prevention_rate')} />
        <Field label="Value lost when missed (0–1)" value={a.loss_given_miss} onChange={s('loss_given_miss')} />
        <Field label="Review cost per alert ($)" value={a.review_cost} onChange={s('review_cost')} />
        <Field label="Friction cost per false alarm ($)" value={a.friction_cost} onChange={s('friction_cost')} hint="At ≤ $1.35 'flag everything' beats the model (see report)" />
        <Field label="Minutes per review" value={a.minutes_per_review} onChange={s('minutes_per_review')} />
        <Field label="Analysts on shift" value={a.analysts} onChange={s('analysts')} />
      </div>
    </Panel>
  )
}

function ManualTab({ a, setA }) {
  const [m, setM] = useState({ transactions_per_day: 1000000, fraud_rate_pct: 3.45, avg_fraud_amount: 135.03, recall_pct: 43.4, false_positive_rate_pct: 0.95 })
  const run = useMutation({ mutationFn: () => api.sdgManual({ ...a, ...m }) })
  const r = run.data
  const set = (k) => (v) => setM((p) => ({ ...p, [k]: v }))
  return (
    <div className="space-y-4">
      <Panel title="Your numbers" icon={Calculator}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Field label="Transactions per day" value={m.transactions_per_day} onChange={set('transactions_per_day')} />
          <Field label="Fraud rate (%)" value={m.fraud_rate_pct} onChange={set('fraud_rate_pct')} />
          <Field label="Average fraud amount ($)" value={m.avg_fraud_amount} onChange={set('avg_fraud_amount')} />
          <Field label="Fraud caught — recall (%)" value={m.recall_pct} onChange={set('recall_pct')} />
          <Field label="Honest customers flagged (%)" value={m.false_positive_rate_pct} onChange={set('false_positive_rate_pct')} />
        </div>
        <button onClick={() => run.mutate()} className="px-3 py-1.5 mt-3 text-sm rounded-md bg-primary text-primary-foreground">Calculate</button>
        <p className="mt-2 text-xs text-muted-foreground">Every number here is typed by you, so every result is a <b>scenario</b>. For results computed from real scored transactions use the Engine tab.</p>
      </Panel>
      {r && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Fraud caught per day" value={num(r.caught)} sub={`${num(r.missed)} missed`} tag="SCENARIO" />
          <Stat label="Value stopped / day" value={money(r.value_stopped)} tag="SCENARIO" />
          <Stat label="Value leaked / day" value={money(r.value_leaked)} tag="SCENARIO" />
          <Stat label="Net benefit / day" value={money(r.net_benefit)} sub={`cost ${money(r.operating_cost)}`} tag="SCENARIO" />
          <Stat label="False alarms / day" value={num(r.false_alarms)} sub={`${num(r.honest_blocked_per_10k)} per 10,000 honest`} tag="SCENARIO" />
          <Stat label="Analyst hours / day" value={num(r.analyst_hours_per_day)} tag="SCENARIO" />
        </div>
      )}
    </div>
  )
}

function EngineTab({ a, setA }) {
  const { data: meta } = useQuery({ queryKey: ['sdg-meta'], queryFn: api.sdgEngineMeta })
  const [q, setQ] = useState({ start: 0, n: 20000, threshold: 0.21, scale_to_daily: 1000000 })
  const run = useMutation({ mutationFn: () => api.sdgEngineReplay({ ...a, ...q }) })
  const res = run.data?.result
  const set = (k) => (v) => setQ((p) => ({ ...p, [k]: v }))
  const chart = res && [
    { name: 'Stopped', v: res.value_stopped, c: '#16a34a' },
    { name: 'Leaked', v: res.value_leaked, c: '#dc2626' },
    { name: 'Operating cost', v: res.operating_cost, c: '#f59e0b' },
    { name: 'Net benefit', v: res.net_benefit, c: '#2563eb' },
  ]
  return (
    <div className="space-y-4">
      <Panel title="Run the fraud engine, then pass its decisions to the SDG calculator" icon={Cpu}>
        <p className="text-xs text-muted-foreground">
          {meta ? `${num(meta.rows)} real held-out transactions (${num(meta.frauds)} frauds), scored by ${meta.source}. Decision threshold ${meta.default_threshold} (${meta.threshold_rule}).` : 'Loading engine info…'}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-3 lg:grid-cols-4">
          <Field label="Start row (time-ordered)" value={q.start} onChange={set('start')} />
          <Field label="Transactions to replay" value={q.n} onChange={set('n')} />
          <Field label="Fraud threshold" value={q.threshold} onChange={set('threshold')} />
          <Field label="Scale to transactions/day (scenario)" value={q.scale_to_daily} onChange={set('scale_to_daily')} />
        </div>
        <button onClick={() => run.mutate()} disabled={run.isPending} className="px-3 py-1.5 mt-3 text-sm rounded-md bg-primary text-primary-foreground">{run.isPending ? 'Running…' : 'Run engine → SDG'}</button>
        {run.error && <p className="mt-2 text-xs text-red-500">{run.error.message}</p>}
      </Panel>
      {run.data && (
        <>
          <Panel title="Payload passed from the engine (first 8 rows)">
            <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th>Amount</th><th>Engine score</th><th>Engine decision</th><th>Actual (held-out label)</th></tr></thead>
              <tbody>{run.data.payload_preview.map((p, i) => (<tr key={i} className="border-t border-border"><td>${p.amount.toFixed(2)}</td><td>{p.score}</td><td className={p.decision === 'FRAUD' ? 'text-red-500' : ''}>{p.decision}</td><td>{p.actual}</td></tr>))}</tbody></table>
          </Panel>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Frauds caught" value={`${num(res.tp)} of ${num(res.fraud_total)}`} sub={`recall ${(res.recall * 100).toFixed(1)}%, precision ${(res.precision * 100).toFixed(1)}%`} tag="MEASURED" />
            <Stat label="False alarms" value={num(res.fp)} sub={`${num(res.honest_blocked_per_10k, 1)} per 10,000 honest`} tag="MEASURED" />
            <Stat label="Real fraud value caught" value={money(res.value_flagged_fraud)} sub={`of ${money(res.fraud_value_total)} (${(res.value_recall * 100).toFixed(1)}% by value)`} tag="MEASURED" />
            <Stat label="Net benefit (window)" value={money(res.net_benefit)} sub={res.net_benefit_mc ? `range ${money(res.net_benefit_mc.p05)} – ${money(res.net_benefit_mc.p95)} (90% Monte Carlo)` : ''} tag="DERIVED" />
          </div>
          <Panel title="Money in this window (real amounts × your assumptions)">
            <div className="h-56"><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} /><Bar dataKey="v">{chart.map((c) => <Cell key={c.name} fill={c.c} />)}</Bar></BarChart></ResponsiveContainer></div>
          </Panel>
          {res.scaled_daily && (
            <Panel title={`Scaled to ${num(q.scale_to_daily)} transactions per day (SCENARIO)`}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Value stopped / day" value={money(res.scaled_daily.value_stopped)} tag="SCENARIO" />
                <Stat label="Value leaked / day" value={money(res.scaled_daily.value_leaked)} tag="SCENARIO" />
                <Stat label="False alarms / day" value={num(res.scaled_daily.fp)} tag="SCENARIO" />
                <Stat label="Analysts needed (≤10 min wait)" value={num(res.workload?.analysts_needed_for_10min_wait)} sub={`${num(res.workload?.analyst_hours_per_day)} analyst-hours/day; utilisation ${(res.workload?.utilisation * 100).toFixed(0)}% with ${a.analysts}`} tag="SCENARIO" />
              </div>
            </Panel>
          )}
          <Panel title="SDG alignment (descriptive indicators — 'aligned with', not 'contributes X%')">
            <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th>SDG</th><th>Target</th><th>Indicator</th><th>Value</th><th>Tag</th></tr></thead>
              <tbody>{res.sdg_alignment.map((s) => (<tr key={s.sdg + s.indicator} className="border-t border-border"><td>SDG {s.sdg}</td><td>{s.target}</td><td>{s.indicator}</td><td>{s.value == null ? '—' : s.value < 5 ? s.value.toFixed(3) : num(s.value)}</td><td><Tag t={s.tag} /></td></tr>))}</tbody></table>
          </Panel>
        </>
      )}
    </div>
  )
}

export default function SdgLab() {
  const [tab, setTab] = useState('engine')
  const [a, setA] = useState(BASE)
  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="mb-1 text-xs tracking-wider uppercase text-muted-foreground">ApexFi / SDG Lab (V2)</div>
      <h1 className="text-2xl font-semibold font-display">SDG Lab</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">Two ways to the same arithmetic. <b>Manual</b>: you type the numbers. <b>Engine</b>: the fraud engine scores real held-out transactions and passes its decisions in; money, workload and uncertainty are computed from the real amounts. Every figure is tagged <Tag t="MEASURED" /> <Tag t="DERIVED" /> <Tag t="SCENARIO" />.</p>
      <div className="flex gap-2 mb-4">
        {[['manual', 'Manual calculator'], ['engine', 'Engine-driven']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('px-3 py-1.5 text-sm rounded-md border border-border', tab === k && 'bg-primary text-primary-foreground')}>{l}</button>))}
      </div>
      <div className="mb-4"><Assumptions a={a} setA={setA} /></div>
      {tab === 'manual' ? <ManualTab a={a} setA={setA} /> : <EngineTab a={a} setA={setA} />}
    </div>
  )
}
