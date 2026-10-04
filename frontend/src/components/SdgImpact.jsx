import { useMemo, useState } from 'react'
import { Globe2, Scale, ShieldCheck, Users, Cpu } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { cn } from '@/lib/utils'

// Three kinds of numbers, never mixed up:
//   MEASURED  = read straight from the saved evaluation files (test set)
//   DERIVED   = arithmetic on measured numbers
//   SCENARIO  = depends on an input the viewer can change here
const TAGS = {
  measured: { label: 'Measured', cls: 'bg-risk-low/15 text-risk-low' },
  derived: { label: 'Derived', cls: 'bg-primary/15 text-primary' },
  scenario: { label: 'Scenario', cls: 'bg-risk-medium/15 text-risk-medium' },
}

function Tag({ kind }) {
  const t = TAGS[kind]
  return <span className={cn('ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium', t.cls)}>{t.label}</span>
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—')
const money = (v) => `$${fmt(v)}`
const compact = (v) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

const LOG_MIN = 4 // 10,000 / day
const LOG_MAX = 8 // 100,000,000 / day

export default function SdgImpact({ sweep, avgAmount, preventionRate, lossGivenMiss, db }) {
  const base = sweep[0]
  const testFraudPct = ((base.tp + base.fn) / (base.tp + base.fp + base.fn + base.tn)) * 100
  const [volume, setVolume] = useState(1_000_000)
  const [fraudPct, setFraudPct] = useState(Number(testFraudPct.toFixed(2)))
  const [thr, setThr] = useState(0.6)
  const [reviewMin, setReviewMin] = useState(5)

  const r = useMemo(() => {
    const row = sweep.find((x) => x.threshold === thr) || sweep[0]
    const recall = row.tp / (row.tp + row.fn)
    const fpr = row.fp / (row.fp + row.tn)
    const p = fraudPct / 100
    const frauds = volume * p
    const legit = volume * (1 - p)
    const caught = recall * frauds
    const missed = frauds - caught
    const falseAlarms = fpr * legit
    const flagged = caught + falseAlarms
    const tps = volume / 86400
    const perWorker = db ? 1000 / db.avg_ms : null
    return {
      recall, fpr, frauds, caught, missed, falseAlarms, flagged,
      precision: flagged ? caught / flagged : 0,
      stopped: caught * avgAmount * (preventionRate / 100),
      leaked: missed * avgAmount * (lossGivenMiss / 100),
      interceptedPct: recall * (preventionRate / 100) * 100,
      hours: (flagged * reviewMin) / 60,
      tps, perWorker,
      workers: perWorker ? Math.ceil(tps / perWorker) : null,
    }
  }, [sweep, thr, volume, fraudPct, reviewMin, avgAmount, preventionRate, lossGivenMiss, db])

  const slider = Math.log10(Math.max(volume, 1))
  const onSlider = (e) => setVolume(Math.round(10 ** Number(e.target.value) / 1000) * 1000)

  return (
    <Panel title="From model results to SDG indicators (scenario calculator)" icon={Globe2} className="mt-6">
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        The model's <strong className="text-foreground">measured</strong> catch rate and false-alarm rate (from the {fmt(base.tp + base.fp + base.fn + base.tn)}-transaction
        chronological test set) are scaled to a daily volume you choose. The results show what those rates <em>would mean</em> at that
        scale. They are scenarios, not real-world outcomes. The dataset is US card data, not UPI data.
      </p>

      <div className="grid grid-cols-1 gap-4 p-4 border rounded-xl border-border/60 bg-secondary/20 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Transactions per day <Tag kind="scenario" /></span>
            <span className="font-medium tabular-nums text-foreground">{fmt(volume)}</span>
          </div>
          <input type="range" min={LOG_MIN} max={LOG_MAX} step={0.02} value={slider} onChange={onSlider} className="w-full mt-2 accent-primary" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>10 thousand</span><span>1 million</span><span>100 million</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[100_000, 1_000_000, 10_000_000, 50_000_000].map((v) => (
              <button key={v} onClick={() => setVolume(v)} className={cn('rounded-md border px-2 py-0.5 text-[11px]', volume === v ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                {compact(v)}
              </button>
            ))}
          </div>
        </div>
        <NumField className="lg:col-span-2" label="Or type a number" value={volume} min={1000} onChange={(v) => setVolume(Math.max(1000, v))} />
        <NumField className="lg:col-span-2" label="Fraud rate (%)" hint={`Test set: ${testFraudPct.toFixed(2)}%`} value={fraudPct} step={0.01} min={0.01} onChange={(v) => setFraudPct(Math.min(50, Math.max(0.01, v)))} />
        <div className="lg:col-span-2">
          <span className="block text-xs text-muted-foreground">Decision threshold</span>
          <select value={thr} onChange={(e) => setThr(Number(e.target.value))} className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-border bg-background">
            {sweep.map((x) => <option key={x.threshold} value={x.threshold}>{x.threshold.toFixed(1)}{x.threshold === 0.6 ? ' (recommended)' : ''}</option>)}
          </select>
          <span className="text-[11px] text-muted-foreground">Recall {(r.recall * 100).toFixed(1)}% · false-alarm rate {(r.fpr * 100).toFixed(1)}%</span>
        </div>
      </div>

      {fraudPct < testFraudPct / 2 && (
        <p className="p-3 mt-3 text-xs leading-relaxed border rounded-lg border-risk-medium/40 bg-risk-medium/10 text-foreground">
          At a fraud rate this low, precision falls to about <strong>{(r.precision * 100).toFixed(1)}%</strong>: most flagged transactions would be genuine.
          Recall and false-alarm rate are model properties, but precision depends on how rare fraud is, so real deployments need re-tuning on their own data.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 mt-4 md:grid-cols-2 xl:grid-cols-4">
        <Card n={16} icon={Scale} title="Peace, Justice & Strong Institutions" target="Target 16.4 · illicit financial flows"
          big={`${fmt(r.caught)} / day`} bigLabel="fraud attempts caught"
          rows={[
            ['Share of fraud caught (recall)', `${(r.recall * 100).toFixed(1)}%`, 'measured'],
            ['Fraud value stopped / day', money(r.stopped), 'scenario'],
            ['Fraud value stopped / year', money(r.stopped * 365), 'scenario'],
            ['Fraud value that still leaks / day', money(r.leaked), 'scenario'],
          ]} />
        <Card n={8} icon={ShieldCheck} title="Decent Work & Economic Growth" target="Target 8.10 · trust in financial services"
          big={`${fmt(r.falseAlarms)} / day`} bigLabel="genuine customers wrongly flagged"
          rows={[
            ['False-alarm rate (FPR)', `${(r.fpr * 100).toFixed(1)}%`, 'measured'],
            ['Wrongly flagged per 10,000 genuine', fmt(r.fpr * 10000), 'derived'],
            ['Share of flags that are real fraud', `${(r.precision * 100).toFixed(1)}%`, 'scenario'],
            ['Review time / day', `${fmt(r.hours)} analyst-hours`, 'scenario'],
          ]} />
        <Card n={1} icon={Users} title="No Poverty" target="Target 1.4 · access and protection"
          big={`${compact(r.caught * 365)} / year`} bigLabel="fraud events stopped (events, not people)"
          rows={[
            ['Fraud events per day (all)', fmt(r.frauds), 'scenario'],
            ['Fraud value intercepted', `${r.interceptedPct.toFixed(1)}%`, 'derived'],
            ['Average value per event', money(avgAmount), 'measured'],
          ]}
          note="Conceptual link only: we do not measure victims' income, so no poverty outcome is claimed." />
        <Card n={9} icon={Cpu} title="Industry, Innovation & Infrastructure" target="Goal 9 · resilient digital infrastructure"
          big={db ? `${db.avg_ms.toFixed(0)} ms` : '—'} bigLabel="average live scoring time"
          rows={[
            ['P95 latency', db ? `${db.p95_ms.toFixed(0)} ms` : '—', 'measured'],
            ['Average load at this volume', `${r.tps.toFixed(1)} txn / s`, 'derived'],
            ['Workers needed (average load)', r.workers ? String(r.workers) : '—', 'derived'],
          ]}
          note="Average load only: peaks, batching and network time are not modelled." />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 sm:grid-cols-4">
        <NumField label="Minutes per manual review" value={reviewMin} min={0} step={0.5} onChange={setReviewMin} />
        <div className="flex items-end pb-2 text-xs leading-relaxed text-muted-foreground sm:col-span-3">
          Dollar values reuse the assumptions panel above (average value {money(avgAmount)}, {preventionRate}% stopped when flagged, {lossGivenMiss}% lost when missed).
          Wording is deliberately "aligned with the indicator", never "contributes X% to the SDG".
        </div>
      </div>
    </Panel>
  )
}

function Card({ n, icon: Icon, title, target, big, bigLabel, rows, note }) {
  return (
    <div className="flex flex-col p-3 border rounded-xl border-border/60 bg-card">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center text-sm font-semibold rounded-md w-7 h-7 bg-primary/15 text-primary">{n}</span>
        <div className="text-sm font-medium leading-tight">{title}</div>
      </div>
      <div className="mt-1 text-[11px] text-primary">{target}</div>
      <div className="mt-3">
        <div className="text-2xl font-semibold font-display tabular-nums">{big}</div>
        <div className="text-[11px] text-muted-foreground">{bigLabel}</div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2">
        {rows.map(([k, v, kind]) => (
          <div key={k} className="flex items-start justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{k} <Tag kind={kind} /></span>
            <span className="font-medium text-right tabular-nums text-foreground">{v}</span>
          </div>
        ))}
      </div>
      {note && <p className="mt-auto pt-2 text-[10px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  )
}

function NumField({ label, hint, value, onChange, min = 0, step = 1, className }) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <input type="number" min={min} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 mt-1 text-sm tabular-nums border rounded-lg border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}