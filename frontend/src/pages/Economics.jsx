import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { Coins, SlidersHorizontal } from 'lucide-react'
import SdgImpact from '@/components/SdgImpact'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }

// ASSUMPTIONS — every default below is an assumption (except the dataset mean amount), shown and editable on screen.
const DEFAULTS = {
  avgAmount: 135.03, // REAL: mean TransactionAmt across 590,540 IEEE-CIS transactions (USD)
  preventionRate: 90, // ASSUMPTION: % of value of a correctly flagged fraud that is actually stopped
  lossGivenMiss: 100, // ASSUMPTION: % of value lost when a fraud is missed
  reviewCost: 2, // ASSUMPTION: USD to review one flagged transaction
  frictionCost: 1, // ASSUMPTION: USD extra cost (customer friction) per false alarm
}

const money = (v) => `$${Math.round(v).toLocaleString()}`

export default function Economics() {
  const [a, setA] = useState(DEFAULTS)
  const { data, error } = useQuery({ queryKey: ['temporal-full-report'], queryFn: api.temporalFullReport })

  const sweep = data?.thresholdOptimization?.threshold_sweep
  const calc = useMemo(() => {
    if (!sweep) return null
    return sweep.map((r) => {
      const saved = r.tp * a.avgAmount * (a.preventionRate / 100)
      const reviewCost = (r.tp + r.fp) * a.reviewCost
      const friction = r.fp * a.frictionCost
      const missedLoss = r.fn * a.avgAmount * (a.lossGivenMiss / 100)
      return { ...r, label: r.threshold.toFixed(1), saved, reviewCost, friction, missedLoss, net: saved - reviewCost - friction }
    })
  }, [sweep, a])

  if (error) return <p className="py-12 text-sm text-center text-risk-high">Couldn't load the evaluation results.</p>
  if (!calc) return <p className="py-12 text-sm text-center text-muted-foreground">Loading real, saved results…</p>

  const best = calc.reduce((m, r) => (r.net > m.net ? r : m), calc[0])
  const recommended = calc.find((r) => r.threshold === 0.6)
  const f1Best = data.thresholdOptimization.best_f1_threshold.threshold
  const testSize = calc[0].tp + calc[0].fp + calc[0].fn + calc[0].tn
  const fraudCount = calc[0].tp + calc[0].fn
  const noModelLoss = fraudCount * a.avgAmount * (a.lossGivenMiss / 100)

  const set = (k) => (e) => setA((p) => ({ ...p, [k]: Math.max(0, Number(e.target.value) || 0) }))

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="flex items-center gap-2 mb-1 text-xs tracking-wider uppercase text-muted-foreground">
        <Coins size={12} /> ApexFi / Economic & SDG Impact
      </div>
      <h1 className="text-2xl font-semibold font-display">Economic & SDG Impact</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Turns the time-series model's real confusion matrix ({testSize.toLocaleString()} test transactions,{' '}
        {fraudCount.toLocaleString()} real frauds) into money. The counts are measured; the cost parameters are{' '}
        <strong>assumptions you can edit</strong>. Amounts are in USD, as recorded in the IEEE-CIS dataset.
      </p>

      <Panel title="Assumptions (editable)" icon={SlidersHorizontal} className="mt-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Field label="Avg transaction value ($)" tag="real: dataset mean" value={a.avgAmount} onChange={set('avgAmount')} />
          <Field label="Fraud actually stopped when flagged (%)" tag="assumption" value={a.preventionRate} onChange={set('preventionRate')} />
          <Field label="Value lost when fraud is missed (%)" tag="assumption" value={a.lossGivenMiss} onChange={set('lossGivenMiss')} />
          <Field label="Review cost per flagged txn ($)" tag="assumption" value={a.reviewCost} onChange={set('reviewCost')} />
          <Field label="Friction cost per false alarm ($)" tag="assumption" value={a.frictionCost} onChange={set('frictionCost')} />
        </div>
        <button onClick={() => setA(DEFAULTS)} className="mt-3 text-xs text-primary hover:underline">Reset to defaults</button>
      </Panel>

      <div className="grid grid-cols-1 gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Loss with no model" value={money(noModelLoss)} tone="high" sub="every fraud goes through" />
        <Stat label={`Net benefit @ recommended 0.6`} value={money(recommended.net)} tone="low" sub={`stops ${money(recommended.saved)}, costs ${money(recommended.reviewCost + recommended.friction)}`} />
        <Stat label={`Most profitable threshold`} value={best.label} tone="primary" sub={`net ${money(best.net)}`} />
        <Stat label="F1-best threshold" value={String(f1Best)} tone="medium" sub="not the same as the most profitable" />
      </div>

      <Panel title="Net benefit by decision threshold" icon={Coins} className="mt-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={calc}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'hsl(var(--foreground))' }} formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine x="0.6" stroke="hsl(var(--risk-low))" strokeDasharray="4 4" label={{ value: 'Recommended', fontSize: 10, fill: 'hsl(var(--risk-low))' }} />
              <Line type="monotone" dataKey="net" name="Net benefit" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="saved" name="Fraud stopped" stroke="hsl(var(--risk-low))" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="missedLoss" name="Loss from missed fraud" stroke="hsl(var(--risk-high))" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          With these assumptions the most profitable threshold is <strong className="text-foreground">{best.label}</strong>, because a missed
          fraud (about {money(a.avgAmount * a.lossGivenMiss / 100)}) costs far more than reviewing a false alarm. The best threshold
          depends on those costs — change the inputs above and the curve moves. The threshold chosen for the demo (0.6) balances
          alert volume against recall rather than maximising profit.
        </p>
      </Panel>

      <Panel title="Threshold table" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                {['Threshold', 'Caught frauds', 'False alarms', 'Missed frauds', 'Fraud stopped', 'Review + friction', 'Net benefit'].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-normal text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.map((r) => (
                <tr key={r.label} className={cn('border-t border-border/50', r.label === best.label && 'bg-primary/10')}>
                  <td className="px-2 py-1.5 font-mono">{r.label}{r.label === best.label ? ' ★' : ''}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{r.tp.toLocaleString()}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{r.fp.toLocaleString()}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{r.fn.toLocaleString()}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{money(r.saved)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{money(r.reviewCost + r.friction)}</td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-right">{money(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <SdgImpact
        sweep={sweep}
        avgAmount={a.avgAmount}
        preventionRate={a.preventionRate}
        lossGivenMiss={a.lossGivenMiss}
        db={data.databaseOptimization?.after}
      />
    </div>
  )
}

function Field({ label, tag, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 mt-1 font-mono text-sm border rounded-lg border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{tag}</span>
    </label>
  )
}

function Stat({ label, value, sub, tone }) {
  const color = { high: 'text-risk-high', medium: 'text-risk-medium', low: 'text-risk-low', primary: 'text-primary' }[tone]
  return (
    <div className="p-4 border rounded-xl border-border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-display text-2xl font-semibold tabular-nums', color)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  )
}
