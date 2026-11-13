import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Network, Download } from 'lucide-react'
import { api2 } from '@/lib/api2'
import { api } from '@/lib/api'
import { PageHeader, TabBar, Section, Big, DataTable, Note, HBars, KeyVals, GhostButton, NoData, C, num } from '@/components/kit/Kit'
import { XYChart, GroupedBars, DualHist, ConfusionTiles, SERIES } from '@/components/kit/Charts'
import { fromCm } from '@/lib/evalMath'
import { downloadEvaluationReport } from '@/lib/pdf/evaluationReport'

const TABS = [
  { id: 'rank', label: 'Ranking power', who: 'How well the score puts fraud above normal: ROC, precision-recall, KS' },
  { id: 'cut', label: 'At the cut-off', who: 'What happens at the chosen threshold: confusion matrix, precision, recall, F1' },
  { id: 'trust', label: 'Trust in the score', who: 'Is a 30% score really about 30% fraud? Calibration and score spread' },
  { id: 'budget', label: 'Review budget', who: 'If analysts can only look at the top x% of transactions, how much fraud is caught' },
  { id: 'groups', label: 'Feature groups', who: 'Which families of columns carry the signal' },
  { id: 'bayes', label: 'Bayesian network', who: 'A small, readable probability model, tried as an interpretable side model' },
]
const f3 = (v) => (v == null ? null : Number(v).toFixed(3))
const pct = (v, d = 1) => (v == null ? null : `${(v * 100).toFixed(d)}%`)

function Tiles({ items }) {
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{items.map((i) => <Big key={i.label} label={i.label} value={i.value} sub={i.sub} />)}</div>
}

/* ------------------------------- Bayesian network ------------------------------- */
function posterior(bn, evidence) {
  const vars = Object.fromEntries(bn.variables.map((v) => [v.key, v]))
  const kids = {}
  bn.variables.forEach((v) => { if (v.parent) (kids[v.parent] ||= []).push(v.key) })
  const roots = bn.variables.filter((v) => !v.parent).map((v) => v.key)
  const msg = (key, c, ps) => {
    const v = vars[key], ev = evidence[key]
    let tot = 0
    v.states.forEach((_, s) => {
      if (ev != null && ev !== s) return
      let p = bn.cpt[key][c][ps][s]
      for (const k of kids[key] || []) p *= msg(k, c, s)
      tot += p
    })
    return tot
  }
  const L = [0, 1].map((c) => bn.prior[c] * roots.reduce((a, r) => a * msg(r, c, 0), 1))
  return L[1] / (L[0] + L[1])
}

function BnGraph({ bn }) {
  const depth = {}
  const byKey = Object.fromEntries(bn.variables.map((v) => [v.key, v]))
  const d = (k) => (depth[k] ??= byKey[k].parent ? d(byKey[k].parent) + 1 : 0)
  bn.variables.forEach((v) => d(v.key))
  const levels = {}
  bn.variables.forEach((v) => (levels[depth[v.key]] ||= []).push(v))
  const W = 760, rowH = 86, H = (Object.keys(levels).length) * rowH + 40, pos = {}
  Object.entries(levels).forEach(([lv, arr]) => arr.forEach((v, i) => { pos[v.key] = [((i + 1) * W) / (arr.length + 1), 34 + lv * rowH] }))
  const cmi = Object.fromEntries(bn.edges.map((e) => [e.to, e.cmi]))
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 620 }} className="h-auto w-full" role="img" aria-label="Learned Bayesian network structure">
        {bn.variables.filter((v) => v.parent).map((v) => <line key={v.key} x1={pos[v.parent][0]} y1={pos[v.parent][1] + 14} x2={pos[v.key][0]} y2={pos[v.key][1] - 14} stroke={C.second} strokeOpacity="0.55" strokeWidth={1 + (cmi[v.key] || 0) * 6}><title>{`${v.parent} → ${v.key}  (dependence ${cmi[v.key]})`}</title></line>)}
        {bn.variables.map((v) => <g key={v.key}><rect x={pos[v.key][0] - 58} y={pos[v.key][1] - 14} width="116" height="28" rx="8" fill="rgb(var(--ink-900))" stroke={C.good} /><text x={pos[v.key][0]} y={pos[v.key][1] + 4} fontSize="11" textAnchor="middle" fill="rgb(var(--ink-100))">{v.label.length > 20 ? v.label.slice(0, 19) + '…' : v.label}</text></g>)}
      </svg>
      <p className="mt-1 text-[12px] text-ink-400">Every feature also depends on the class (fraud or normal); that link is not drawn. A thicker line means the two features depend on each other more, even after you know the class.</p>
    </div>
  )
}

function WhatIf({ bn }) {
  const [ev, setEv] = useState({})
  const p = useMemo(() => posterior(bn, ev), [bn, ev])
  const base = bn.prior[1]
  const n = Object.values(ev).filter((v) => v != null).length
  return (
    <Section title="What-if: set what you know, read the fraud probability" subtitle="Leave a box on 'unknown' and the network sums it out. This is exact Bayesian inference on the learned tables.">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-3 sm:grid-cols-2">
          {bn.variables.map((v) => (
            <label key={v.key} className="block text-[12.5px] text-ink-300">{v.label}
              <select value={ev[v.key] ?? ''} onChange={(e) => setEv({ ...ev, [v.key]: e.target.value === '' ? null : Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-ink-700/70 bg-ink-900 px-2.5 py-1.5 text-[13px] text-foreground">
                <option value="">unknown</option>{v.states.map((s, i) => <option key={s} value={i}>{s}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-ink-700/70 bg-ink-900/60 p-4 text-center lg:self-start">
          <p className="text-[12px] uppercase tracking-wider text-ink-400">Fraud probability</p>
          <p className="font-display text-[44px] font-semibold leading-tight text-foreground">{(p * 100).toFixed(1)}%</p>
          <p className="text-[12.5px] text-ink-300">Without any evidence: {(base * 100).toFixed(1)}% (the base rate)</p>
          <p className="mt-1 text-[12.5px] text-ink-300">{n === 0 ? 'Nothing set yet.' : `${n} fact${n > 1 ? 's' : ''} set. That is ${(p / base).toFixed(1)}× the base rate.`}</p>
          <button type="button" onClick={() => setEv({})} className="mt-3 text-[12.5px] text-signal-teal hover:underline">Clear all</button>
        </div>
      </div>
    </Section>
  )
}

function BayesTab({ bn, v2 }) {
  const t = bn.metrics.tan, nb = bn.metrics.naive_bayes
  const [open, setOpen] = useState(bn.single_variable[1]?.key)
  const sv = bn.single_variable.find((s) => s.key === open)
  return (
    <div className="space-y-5">
      <Note tone="amber">Honest result: with only 12 coarse features the network reaches PR-AUC {f3(t.pr_auc)} and ROC-AUC {f3(t.roc_auc)} on the same untouched test block. Its PR-AUC is higher than the old 7-feature LightGBM (V1), its ROC-AUC is about the same, and both are well below the final model ({v2 ? `${f3(v2.final.pr_auc)} and ${f3(v2.final.roc_auc)}` : 'see V2 Evaluation'}). It is kept as an interpretable side model, not used for scoring.</Note>
      <Section title="Network against the other models (same test block)">
        <DataTable columns={[{ key: 'm', label: 'Model' }, { key: 'pr', label: 'PR-AUC', right: true }, { key: 'roc', label: 'ROC-AUC', right: true }, { key: 'p', label: 'Precision', right: true }, { key: 'r', label: 'Recall', right: true }, { key: 'f', label: 'F1', right: true }, { key: 'b', label: 'Brier', right: true }]}
          rows={[
            { m: 'Naive Bayes (no extra links)', pr: f3(nb.pr_auc), roc: f3(nb.roc_auc), p: f3(nb.precision), r: f3(nb.recall), f: f3(nb.f1), b: f3(nb.brier) },
            { m: 'Bayesian network (TAN, learned links)', pr: f3(t.pr_auc), roc: f3(t.roc_auc), p: f3(t.precision), r: f3(t.recall), f: f3(t.f1), b: f3(t.brier) },
            ...(v2 ? [{ m: 'V1: LightGBM, 7 features', pr: f3(v2.v1.pr_auc), roc: f3(v2.v1.roc_auc), p: f3(v2.v1.precision), r: f3(v2.v1.recall), f: f3(v2.v1.f1), b: 'n/a' },
              { m: 'V2 final: LightGBM, 449 features', pr: f3(v2.final.pr_auc), roc: f3(v2.final.roc_auc), p: f3(v2.final.precision), r: f3(v2.final.recall), f: f3(v2.final.f1), b: f3(v2.final.brier) }] : []),
          ]} />
        <p className="mt-3 text-[12.5px] text-ink-400">{bn.protocol} Trained on {num(bn.fit_rows)} rows; tested on {num(bn.test_rows)} rows ({num(bn.test_frauds)} frauds). The cut-off was chosen on the validation block.</p>
      </Section>
      <Section title="Learned structure" subtitle="Which features still depend on each other after the class is known. Learned from the data (Chow-Liu tree on conditional mutual information).">
        <BnGraph bn={bn} />
      </Section>
      <WhatIf bn={bn} />
      <Section title="Read the tables: fraud rate in each state" subtitle="The fraud share among the training rows that were in each state. This is the easiest way to read what the network learned.">
        <div className="mb-3 flex flex-wrap gap-1.5">{bn.single_variable.map((s) => <button key={s.key} type="button" onClick={() => setOpen(s.key)} className={`rounded-md border px-2.5 py-1 text-[12.5px] ${open === s.key ? 'border-signal-teal/60 bg-signal-teal/10 text-foreground' : 'border-ink-700/70 text-ink-300 hover:text-foreground'}`}>{s.label}</button>)}</div>
        {sv && <HBars label={`Fraud rate by ${sv.label}`} rows={sv.rows.map((r) => ({ label: `${r.state}  (${num(r.rows)} rows)`, value: r.fraud_rate_pct }))} fmt={(v) => `${v.toFixed(2)}%`} color={C.warn} />}
        <p className="mt-2 text-[12px] text-ink-400">Overall fraud rate in the training rows: {bn.base_rate_pct}%.</p>
      </Section>
      <Note tone="grey">Why try it: a Bayesian network gives a fraud probability built from small tables a reviewer can read and challenge, and it handles missing facts without guessing. Bayesian methods for card-fraud detection are an established idea in the literature. The trade-off seen here is accuracy: coarse bins and 12 features lose a lot of what LightGBM uses.</Note>
    </div>
  )
}

/* ---------------------------------- page ---------------------------------- */
export default function EvaluationMetrics() {
  const [tab, setTab] = useState('rank')
  const cq = useQuery({ queryKey: ['eval-curves'], queryFn: api2.evalCurves, retry: 1, staleTime: 5 * 60 * 1000 })
  const gq = useQuery({ queryKey: ['eval-groups'], queryFn: api2.evalFeatureGroups, retry: 1 })
  const bq = useQuery({ queryKey: ['eval-bn'], queryFn: api2.evalBayesNet, retry: 1 })
  const sq = useQuery({ queryKey: ['v2-summary'], queryFn: api.v2Summary, retry: 1 })
  const c = cq.data, v2 = sq.data
  const m1 = c && fromCm(c.v1.confusion), m2 = c && fromCm(c.v2.confusion)

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <PageHeader icon={Network} title="Evaluation Metrics"
        subtitle="Every curve and metric for the V2 model against V1, on the untouched test block (the last 25% of transactions in time order). Computed from the saved model scores, nothing typed by hand."
        meta={c ? `${num(c.v2.rows)} test transactions · ${num(c.v2.frauds)} frauds` : null}
        right={<GhostButton icon={Download} disabled={!c} onClick={() => downloadEvaluationReport({ curves: c, groups: gq.data, bayes: bq.data, summary: v2 })}>Download full PDF</GhostButton>} />
      <TabBar tabs={TABS} value={tab} onChange={setTab} />
      {cq.isError && tab !== 'groups' && tab !== 'bayes' && <Note tone="red">{cq.error.message}</Note>}
      {cq.isLoading && tab !== 'groups' && tab !== 'bayes' && <p className="text-ink-300">Loading…</p>}

      {c && tab === 'rank' && (
        <div className="space-y-5">
          <Tiles items={[
            { label: 'ROC-AUC (V2)', value: f3(c.v2.roc.auc), sub: `V1: ${f3(c.v1.roc.auc)}` },
            { label: 'PR-AUC (V2)', value: f3(c.v2.pr.ap), sub: `V1: ${f3(c.v1.pr.ap)}. Chance level: ${f3(c.v2.pr.base_rate)}` },
            { label: 'KS (V2)', value: f3(c.v2.ks.value), sub: `V1: ${f3(c.v1.ks.value)}` },
            { label: 'Gini (V2)', value: f3(2 * c.v2.roc.auc - 1), sub: `V1: ${f3(2 * c.v1.roc.auc - 1)}. Gini = 2 × ROC-AUC − 1` },
          ]} />
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="ROC curve" subtitle="Caught fraud against false alarms as the cut-off moves. Closer to the top-left is better. The dots are the chosen cut-offs.">
              <XYChart label="ROC curve" xLabel="False alarm rate (normal transactions flagged)" yLabel="Caught fraud rate (recall)" diag
                series={[{ name: `V2 (AUC ${f3(c.v2.roc.auc)})`, color: SERIES.v2, xs: c.v2.roc.fpr, ys: c.v2.roc.tpr }, { name: `V1 (AUC ${f3(c.v1.roc.auc)})`, color: SERIES.v1, xs: c.v1.roc.fpr, ys: c.v1.roc.tpr }]}
                marks={[{ x: c.v2.confusion.fp / (c.v2.confusion.fp + c.v2.confusion.tn), y: c.v2.confusion.tp / (c.v2.confusion.tp + c.v2.confusion.fn), label: 'V2 cut-off', color: SERIES.v2 }, { x: c.v1.confusion.fp / (c.v1.confusion.fp + c.v1.confusion.tn), y: c.v1.confusion.tp / (c.v1.confusion.tp + c.v1.confusion.fn), label: 'V1 cut-off', color: SERIES.v1 }]} />
            </Section>
            <Section title="Precision-recall curve" subtitle="With rare fraud this is the more honest view: how many flags are real fraud at each level of recall.">
              <XYChart label="Precision recall curve" xLabel="Recall (share of fraud caught)" yLabel="Precision (share of flags that are fraud)"
                series={[{ name: `V2 (AP ${f3(c.v2.pr.ap)})`, color: SERIES.v2, xs: c.v2.pr.recall, ys: c.v2.pr.precision }, { name: `V1 (AP ${f3(c.v1.pr.ap)})`, color: SERIES.v1, xs: c.v1.pr.recall, ys: c.v1.pr.precision }, { name: `Chance (${f3(c.v2.pr.base_rate)})`, color: SERIES.ref, dash: '4 4', xs: [0, 1], ys: [c.v2.pr.base_rate, c.v2.pr.base_rate] }]}
                marks={[{ x: m2.recall, y: m2.precision, label: 'V2 cut-off', color: SERIES.v2 }, { x: m1.recall, y: m1.precision, label: 'V1 cut-off', color: SERIES.v1 }]} />
            </Section>
          </div>
          <Note tone="grey">KS is the largest gap between the share of fraud caught and the share of normal transactions flagged. V2 reaches {f3(c.v2.ks.value)} at a score of {f3(c.v2.ks.at_score)}, catching {pct(c.v2.ks.tpr)} of fraud for {pct(c.v2.ks.fpr, 2)} false alarms.</Note>
        </div>
      )}

      {c && tab === 'cut' && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title={`V2 confusion matrix`} subtitle={`Cut-off ${f3(c.v2.threshold)}`}><ConfusionTiles cm={c.v2.confusion} /></Section>
            <Section title={`V1 confusion matrix`} subtitle={`Cut-off ${f3(c.v1.threshold)}`}><ConfusionTiles cm={c.v1.confusion} /></Section>
          </div>
          <Section title="Metrics at the cut-off" subtitle="All derived from the two matrices above.">
            <DataTable columns={[{ key: 'k', label: 'Metric' }, { key: 'v1', label: 'V1', right: true }, { key: 'v2', label: 'V2', right: true }, { key: 'h', label: 'Plain meaning' }]}
              rows={[
                ['Precision', 'precision', 'Of everything flagged, the share that was fraud'], ['Recall (sensitivity)', 'recall', 'Of all fraud, the share that was caught'], ['F1', 'f1', 'Balance of precision and recall'],
                ['Specificity', 'specificity', 'Of all normal transactions, the share left alone'], ['False alarm rate', 'fpr', 'Normal transactions wrongly flagged'], ['Balanced accuracy', 'balanced', 'Average of recall and specificity'],
                ['MCC', 'mcc', 'One number that stays fair when fraud is rare (−1 to 1)'], ['Alert rate', 'alert', 'Share of all transactions flagged'],
              ].map(([k, key, h]) => ({ k, h, v1: key === 'alert' || key === 'fpr' ? pct(m1[key], 2) : f3(m1[key]), v2: key === 'alert' || key === 'fpr' ? pct(m2[key], 2) : f3(m2[key]) }))} />
          </Section>
          <Section title="Precision, recall and F1 as the cut-off moves (V2)" subtitle="Pick the point that fits the real cost of a missed fraud against a false alarm. The dashed line is the chosen cut-off.">
            <XYChart label="Threshold sweep" xLabel="Cut-off (score above which a transaction is flagged)" yLabel="Value"
              series={[{ name: 'Precision', color: SERIES.v2, xs: c.v2.sweep.map((s) => s.threshold), ys: c.v2.sweep.map((s) => s.precision) }, { name: 'Recall', color: SERIES.fraud, xs: c.v2.sweep.map((s) => s.threshold), ys: c.v2.sweep.map((s) => s.recall) }, { name: 'F1', color: SERIES.v1, xs: c.v2.sweep.map((s) => s.threshold), ys: c.v2.sweep.map((s) => s.f1) }]} />
          </Section>
        </div>
      )}

      {c && tab === 'trust' && (() => {
        const cal = c.v2.calibration, mx = Math.min(1, Math.ceil(Math.max(...cal.flatMap((b) => [b.mean_pred, b.observed])) * 10) / 10)
        return (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="Reliability diagram (V2)" subtitle="Ten equal-sized groups of transactions, lowest score to highest. On the dashed line, a score means what it says.">
                <XYChart label="Reliability diagram" xLabel="Average predicted fraud probability" yLabel="Share that really was fraud" diag xMax={mx} yMax={mx} fmtX={(v) => v.toFixed(2)} fmtY={(v) => v.toFixed(2)}
                  series={[{ name: 'V2 groups', color: SERIES.v2, xs: cal.map((b) => b.mean_pred), ys: cal.map((b) => b.observed) }]} />
              </Section>
              <Section title="Where fraud and normal scores sit (V2)" subtitle="Fraud transactions (red) pile up on the right, normal ones (blue) on the left. A log count axis makes the rare fraud visible.">
                <DualHist label="Score spread" edges={c.v2.score_hist.edges} a={c.v2.score_hist.fraud} b={c.v2.score_hist.normal} aName="Fraud" bName="Normal" aColor={SERIES.fraud} bColor={SERIES.normal} />
              </Section>
            </div>
            <Tiles items={[{ label: 'Calibration error (ECE), V2', value: v2 ? f3(v2.final.ece) : null, sub: v2 ? `V1: ${f3(v2.v1.ece)}` : null }, { label: 'Brier score, V2', value: v2 ? f3(v2.final.brier) : null, sub: 'Lower is better' }]} />
          </div>
        )
      })()}

      {c && tab === 'budget' && (
        <div className="space-y-5">
          <Section title="Gain curve" subtitle="Review only the highest-scored x% of transactions: what share of all fraud is in that slice?">
            <XYChart label="Gain curve" xLabel="Share of transactions reviewed (highest score first)" yLabel="Share of all fraud caught" diag
              series={[{ name: 'V2', color: SERIES.v2, xs: [0, ...c.v2.gain.map((g) => g.top_pct / 100)], ys: [0, ...c.v2.gain.map((g) => g.recall)] }, { name: 'V1', color: SERIES.v1, xs: [0, ...c.v1.gain.map((g) => g.top_pct / 100)], ys: [0, ...c.v1.gain.map((g) => g.recall)] }]} />
          </Section>
          <Section title="Lift table" subtitle="Lift = how many times more fraud than random picking you find in the reviewed slice.">
            <DataTable columns={[{ key: 'top', label: 'Reviewed (top)', right: true }, { key: 'r2', label: 'V2 fraud caught', right: true }, { key: 'l2', label: 'V2 lift', right: true }, { key: 'r1', label: 'V1 fraud caught', right: true }, { key: 'l1', label: 'V1 lift', right: true }]}
              rows={c.v2.gain.map((g, i) => ({ top: `${g.top_pct}%`, r2: pct(g.recall), l2: `${g.lift.toFixed(1)}×`, r1: pct(c.v1.gain[i].recall), l1: `${c.v1.gain[i].lift.toFixed(1)}×` }))} />
          </Section>
        </div>
      )}

      {tab === 'groups' && (
        <div className="space-y-5">
          {gq.isError && <Note tone="amber">{gq.error.message}</Note>}
          {gq.isLoading && <p className="text-ink-300">Loading…</p>}
          {gq.data && (() => {
            const g = gq.data, rows = [...g.groups].sort((a, b) => b.gain_share - a.gain_share)
            return (<>
              <Note tone="grey">{g.note} {g.protocol} All {g.groups.length} groups together: PR-AUC {f3(g.all_columns.pr_auc)}, ROC-AUC {f3(g.all_columns.roc_auc)} on {num(g.test_rows)} test rows.</Note>
              <Section title="Share of the model's split gain, by group" subtitle="How much of the all-columns model's learning power sits in each group of columns.">
                <HBars label="Gain share by feature group" rows={rows.map((r) => ({ label: `${r.group} (${r.n_features})`, value: r.gain_share * 100 }))} fmt={(v) => `${v.toFixed(1)}%`} />
              </Section>
              <Section title="Alone against left out" subtitle="Teal: PR-AUC of a model that sees only this group. Amber: PR-AUC of a model that sees everything except this group. The all-columns model scores the dashed level below.">
                <GroupedBars label="Group ablation" cats={rows.map((r) => r.group)} yMax={0.6} yLabel="Test PR-AUC"
                  series={[{ name: 'Only this group', color: SERIES.v2, values: rows.map((r) => r.alone_pr) }, { name: 'Everything except this group', color: SERIES.v1, values: rows.map((r) => r.without_pr) }]} />
                <p className="mt-2 text-[12.5px] text-ink-400">All columns together: {f3(g.all_columns.pr_auc)}. A group is important when leaving it out drops the score, or when it scores well on its own.</p>
              </Section>
              <Section title="Group table">
                <DataTable columns={[{ key: 'group', label: 'Group' }, { key: 'n', label: 'Columns', right: true }, { key: 'a', label: 'Alone PR-AUC', right: true }, { key: 'ar', label: 'Alone ROC-AUC', right: true }, { key: 'w', label: 'Without PR-AUC', right: true }, { key: 'd', label: 'Drop when left out', right: true }, { key: 'gs', label: 'Gain share', right: true }]}
                  rows={rows.map((r) => ({ group: r.group, n: r.n_features, a: f3(r.alone_pr), ar: f3(r.alone_roc), w: f3(r.without_pr), d: f3(r.drop_in_pr), gs: pct(r.gain_share) }))} />
              </Section>
              <Section title="Top 15 single columns by gain" subtitle="Each with its group.">
                <DataTable dense columns={[{ key: 'feature', label: 'Column' }, { key: 'group', label: 'Group' }, { key: 'gs', label: 'Gain share', right: true }]} rows={g.top_features.map((t) => ({ feature: t.feature, group: t.group, gs: pct(t.gain_share, 2) }))} />
              </Section>
            </>)
          })()}
        </div>
      )}

      {tab === 'bayes' && (
        <>
          {bq.isError && <Note tone="amber">{bq.error.message}</Note>}
          {bq.isLoading && <p className="text-ink-300">Loading…</p>}
          {bq.data && <BayesTab bn={bq.data} v2={v2} />}
        </>
      )}
    </div>
  )
}
