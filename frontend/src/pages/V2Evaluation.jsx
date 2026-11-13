import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts'
import { FlaskConical, Trophy, Table2, SlidersHorizontal, Scale, ShieldAlert, Search } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { Download } from 'lucide-react'
import { downloadV2Report } from '@/lib/pdf/v2Report'
import { cn } from '@/lib/utils'

const f = (v, d = 3) => (v == null ? '—' : Number(v).toFixed(d))
const pct = (v, d = 1) => (v == null ? '—' : `${Number(v).toFixed(d)}%`)
const money = (v) => (v == null ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString()}`)
const tip = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }
const FAM = { Baseline: '#dc2626', Ensemble: '#d97706', Boosting: '#2563eb', Bagging: '#0891b2', Individual: '#64748b' }

function Stat({ label, value, sub }) {
  return (
    <div className="p-4 border rounded-xl border-border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold font-display">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
function Table({ head, rows, className }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-muted-foreground">{head.map((h) => <th key={h} className="py-1.5 pr-3 font-normal whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="font-mono">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">{r.map((c, j) => <td key={j} className={cn('py-1.5 pr-3', j === 0 && 'font-sans')}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
const Note = ({ children }) => <p className="mt-3 text-xs text-muted-foreground">{children}</p>

const TABS = [
  { id: 'overview', label: 'Result', icon: Trophy },
  { id: 'bench', label: '25-model benchmark', icon: Table2 },
  { id: 'tune', label: 'Features, SMOTE, tuning', icon: SlidersHorizontal },
  { id: 'finance', label: 'Finance metrics', icon: Scale },
  { id: 'dgraph', label: 'DGraph-Fin correction', icon: ShieldAlert },
  { id: 'score', label: 'Score a transaction', icon: Search },
]

function Overview({ s }) {
  const F = s.final, V = s.v1, d = s.decision
  const sig = s.significance['FINAL (production) vs V1 temporal model (7 features)']
  return (
    <div className="space-y-5">
      <div className="p-4 border rounded-xl border-primary/40 bg-primary/5">
        <div className="text-sm font-semibold">Production model: tuned LightGBM, 449 features</div>
        <p className="mt-1 text-xs text-muted-foreground">
          The closest rival ({d.best_challenger}) was only {f(d.challenger_val_gain_pct, 2)}% better on validation. The rule is 1%, so the single, explainable model stays.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Test PR-AUC (main score)" value={f(F.pr_auc)} sub={`V1: ${f(V.pr_auc)}`} />
        <Stat label="Test ROC-AUC" value={f(F.roc_auc)} sub={`V1: ${f(V.roc_auc)}`} />
        <Stat label="F1 at chosen threshold" value={f(F.f1)} sub={`V1: ${f(V.f1)}`} />
        <Stat label="Held-out transactions" value="147,635" sub="5,100 frauds, never used for fitting" />
      </div>
      <Panel title="V1 against V2 (same test block)" icon={FlaskConical}>
        <Table head={['Metric', 'V1 (7 features)', 'V2 final (449 features)']} rows={[
          ['PR-AUC', f(V.pr_auc), f(F.pr_auc)], ['ROC-AUC', f(V.roc_auc), f(F.roc_auc)], ['Precision', f(V.precision, 2), f(F.precision, 2)],
          ['Recall', f(V.recall, 2), f(F.recall, 2)], ['F1', f(V.f1), f(F.f1)], ['KS', f(V.ks), f(F.ks)], ['Calibration error (ECE)', f(V.ece), f(F.ece, 4)],
          ['Share of transactions flagged', pct(V.alert_rate_pct), pct(F.alert_rate_pct)],
        ]} />
        <Note>PR-AUC gain {f(sig.pr_auc.mean)} (95% bootstrap interval {f(sig.pr_auc.lo)} to {f(sig.pr_auc.hi)}). {s.protocol}</Note>
      </Panel>
      <Panel title="Honest notes" icon={ShieldAlert}>
        <ul className="pl-4 space-y-1 text-xs list-disc text-muted-foreground">
          {s.limitations.map((l) => <li key={l}>{l}</li>)}
          <li>Most of the V2 gain comes from using more of the raw Gold columns, not from the engineered rolling features.</li>
          <li>SMOTE was not needed: its gain is inside run-to-run noise.</li>
        </ul>
      </Panel>
    </div>
  )
}

function Bench({ s }) {
  const rows = [...s.benchmark].sort((a, b) => b.test_pr - a.test_pr)
  const rnd = Object.fromEntries(s.benchmark_random.map((r) => [r.model, r]))
  const chart = rows.map((r) => ({ name: r.model.length > 34 ? r.model.slice(0, 33) + '…' : r.model, pr: r.test_pr, fam: r.family }))
  return (
    <div className="space-y-5">
      <Panel title="Test PR-AUC, all 25 models (time-ordered split)" icon={Table2}>
        <ResponsiveContainer width="100%" height={620}>
          <BarChart data={chart} layout="vertical" margin={{ left: 150, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 0.55]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={150} interval={0} />
            <Tooltip contentStyle={tip} formatter={(v) => f(v)} />
            <Bar dataKey="pr" radius={[0, 4, 4, 0]}>{chart.map((c, i) => <Cell key={i} fill={FAM[c.fam] || '#64748b'} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        <Note>Red = Dummy baseline, amber = ensembles, blue = boosting, cyan = bagging, grey = single models. The winner is chosen on validation, not on this test score.</Note>
      </Panel>
      <Panel title="Full table" icon={Table2}>
        <Table head={['Val rank', 'Model', 'Family', 'Val PR', 'Test PR', 'Test ROC', 'F1', 'Prec', 'Recall', 'MCC', 'KS', 'PR (random split)']} rows={s.benchmark.map((r) => [
          r.rank_val, r.model, r.family, f(r.val_pr), f(r.test_pr), f(r.test_roc), f(r.f1_val_thr), f(r.prec, 2), f(r.rec, 2), f(r.mcc, 2), f(r.ks, 2), rnd[r.model] ? f(rnd[r.model].test_pr) : '—',
        ])} />
        <Note>A random split flatters every model. Only the time-ordered number is a fair estimate of future use. KNN used 30,000 rows and RBF-SVM 15,000 rows, both on the 60 strongest features.</Note>
      </Panel>
    </div>
  )
}

function Tune({ s }) {
  const t = s.tuning
  const fsRows = s.feature_selection
  const methods = [...new Set(fsRows.filter((r) => r.k != null && !String(r.method).startsWith('All')).map((r) => r.method))]
  const ks = [...new Set(fsRows.filter((r) => r.k != null && !String(r.method).startsWith('All')).map((r) => r.k))].sort((a, b) => a - b)
  const line = ks.map((k) => Object.fromEntries([['k', k], ...methods.map((m) => [m, (fsRows.find((r) => r.method === m && r.k === k) || {}).val_pr])]))
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#64748b']
  return (
    <div className="space-y-5">
      <Panel title="Feature configurations (LightGBM default)" icon={SlidersHorizontal}>
        <Table head={['Feature set', '# features', 'Val PR', 'Test PR', 'Test ROC']} rows={s.feature_sets.map((r) => [r.feature_set, r.n_features, f(r.val_pr), f(r.test_pr), f(r.test_roc)])} />
        <Note>V1 used 7 features. The raw Gold columns carry the signal; frequency and rolling features add almost nothing here.</Note>
      </Panel>
      <Panel title="Feature selection: validation PR-AUC against features kept" icon={SlidersHorizontal}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={line}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="k" tick={{ fontSize: 11 }} /><YAxis domain={[0.3, 0.65]} tick={{ fontSize: 11 }} /><Tooltip contentStyle={tip} formatter={(v) => f(v)} /><Legend wrapperStyle={{ fontSize: 11 }} />
            {methods.map((m, i) => <Line key={m} type="monotone" dataKey={m} stroke={colors[i % 8]} dot={false} strokeWidth={1.5} />)}
          </LineChart>
        </ResponsiveContainer>
        <Note>Decision: keep all 449 features. The best subset passed the 1% rule on validation but lost on the untouched test block, so it was not adopted. About 150 features (LightGBM gain or SHAP) match the full set, which gives a lean option.</Note>
      </Panel>
      <Panel title="Class imbalance: SMOTE and others" icon={SlidersHorizontal}>
        <Table head={['Strategy', 'Train rows', 'Fraud share', 'Val PR', 'Test PR', 'Test ROC', 'Val gain']} rows={s.imbalance.map((r) => [r.strategy, Number(r.train_rows).toLocaleString(), pct(r.train_fraud_pct), f(r.val_pr), f(r.test_pr), f(r.test_roc), `${r.val_gain_vs_none_pct >= 0 ? '+' : ''}${f(r.val_gain_vs_none_pct, 1)}%`])} />
        <Note>Three-seed check: SMOTE changes validation PR-AUC by {f(s.imbalance_seeds.smote_val_gain_pct, 1)}%, inside noise. Decision: no rebalancing. Full-ratio class weighting hurts.</Note>
      </Panel>
      <Panel title="Hyper-parameter search (30 trials each, time-fold CV)" icon={SlidersHorizontal}>
        <Table head={['Method', 'CV PR', 'Val PR', 'Test PR', 'Test ROC']} rows={Object.entries(t).map(([k, v]) => [k, f(v.cv_pr), f(v.val_pr), f(v.test_pr), f(v.test_roc)])} />
        <div className="mt-4 mb-1 text-xs text-muted-foreground">Which settings mattered (Optuna fANOVA, rough guide from 30 trials)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={Object.entries(s.tuning_importance).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v)} layout="vertical" margin={{ left: 100 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="k" tick={{ fontSize: 11 }} width={100} /><Tooltip contentStyle={tip} formatter={(v) => f(v)} /><Bar dataKey="v" fill="#2563eb" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  )
}

function Finance({ s }) {
  const F = s.finance
  const cols = ['Dummy (prior)', 'V1 temporal model (7 features)', 'LightGBM default', 'Best ensemble: Voting: XGB + LightGBM + CatBoost', 'FINAL (production)']
  const names = ['Dummy', 'V1', 'LGBM default', 'Best ensemble', 'V2 final']
  const defs = [
    ['Threshold', (r) => f(r.threshold, 2)], ['Alert rate', (r) => pct(r.alert_rate_pct)], ['Precision', (r) => f(r.precision)], ['Recall', (r) => f(r.recall)], ['F1', (r) => f(r.f1)], ['MCC', (r) => f(r.mcc)],
    ['ROC-AUC', (r) => f(r.roc_auc)], ['PR-AUC', (r) => f(r.pr_auc)], ['Gini', (r) => f(r.gini)], ['KS', (r) => f(r.ks)], ['Brier', (r) => f(r.brier, 4)], ['Calibration error (ECE)', (r) => f(r.ece, 4)],
    ['Lift, top 1%', (r) => f(r.lift_top1, 1)], ['Lift, top 5%', (r) => f(r.lift_top5, 1)], ['Fraud value caught, top 1%', (r) => f(r.value_recall_top1, 2)], ['Fraud value caught, top 5%', (r) => f(r.value_recall_top5, 2)],
  ]
  const g = F['FINAL (production)'].net_benefit_grid
  const fr = [1, 5, 10, 25, 50].map((c) => ({ c, m: g[`review2_friction${c}`].model, a: g[`review2_friction${c}`].flag_all }))
  return (
    <div className="space-y-5">
      <Panel title="Finance and risk metrics (test block)" icon={Scale}>
        <Table head={['Metric', ...names]} rows={defs.map(([n, fn]) => [n, ...cols.map((c) => (F[c] ? fn(F[c]) : '—'))])} />
        <Note>Lift = precision in the group divided by the overall fraud rate. Score drift (PSI) validation to test: {f(s.drift.score_psi_val_to_test, 4)} (below 0.1 is stable).</Note>
      </Panel>
      <Panel title="Money depends on the cost of a false alarm" icon={Scale}>
        <Table head={['Friction $ per false alarm', 'V2 model', 'Flag everything', 'Better']} rows={fr.map((r) => [r.c, money(r.m), money(r.a), r.m > r.a ? 'Model' : 'Flag everything'])} />
        <Note>Review cost $2 per alert, 90% of caught fraud value stopped. Break-even friction is about ${f(F['FINAL (production)'].break_even_friction_vs_flag_all_usd, 2)}. The right value must come from a bank, not from this project.</Note>
      </Panel>
      <Panel title="Stability across 4 time chunks of the test block" icon={Scale}>
        <Table head={['Chunk', 'PR-AUC', 'ROC-AUC']} rows={s.stability.map((r, i) => [i + 1, f(r.pr_auc), f(r.roc_auc)])} />
      </Panel>
    </div>
  )
}

function Dgraph({ s }) {
  const d = s.dgraph, a = d.v1_ablation
  return (
    <div className="space-y-5">
      <div className="p-4 border rounded-xl border-red-500/40 bg-red-500/5">
        <div className="text-sm font-semibold">Correction: the earlier DGraph-Fin result (ROC-AUC 0.938) was a label leak</div>
        <p className="mt-1 text-xs text-muted-foreground">{d.note}</p>
      </div>
      {d.retrained && (
        <Panel title="Retrained app model (LightGBM + GraphSAGE + stacking, no node_timestamp)" icon={ShieldAlert}>
          <Table head={['Model', 'ROC-AUC', 'PR-AUC']} rows={[
            ['LightGBM (3 seeds)', f(d.retrained.lightgbm.roc_auc), f(d.retrained.lightgbm.pr_auc, 4)],
            ['GraphSAGE (one run)', f(d.retrained.graphsage.roc_auc), f(d.retrained.graphsage.pr_auc, 4)],
            ['Stacked (used by the app)', f(d.retrained.stacked.roc_auc), f(d.retrained.stacked.pr_auc, 4)],
            ['Old leaky model (invalid)', f(d.retrained.old_leaky.roc_auc), f(d.retrained.old_leaky.pr_auc, 4)],
          ]} />
          <Note>{d.retrained.split}. Fraud is {d.retrained.base_rate_pct}% of accounts, so a score of 0.04 PR-AUC is about 3 times random. GraphSAGE beats LightGBM alone, so graph structure adds a small real signal here. LightGBM was re-fitted with 3 seeds; one GraphSAGE checkpoint was reused.</Note>
          <div className="mt-3 text-xs font-medium">Operating point (F1-optimal on validation, threshold {f(d.retrained.operating_point.threshold, 3)})</div>
          <Table className="mt-1" head={['Precision', 'Recall', 'F1', 'Accounts flagged', 'Lift top 1%', 'Lift top 5%']} rows={[[
            f(d.retrained.operating_point.test.precision, 3), f(d.retrained.operating_point.test.recall, 3), f(d.retrained.operating_point.test.f1, 3), pct(d.retrained.operating_point.test.flagged_pct),
            f(d.retrained.operating_point.test.lift_top1, 1), f(d.retrained.operating_point.test.lift_top5, 1)]]} />
          <Note>{d.retrained.operating_point.note}</Note>
        </Panel>
      )}
      <Panel title="Leak shown by ablation (random 70/15/15 split)" icon={ShieldAlert}>
        <Table head={['Features', 'ROC-AUC', 'PR-AUC', 'Precision@0.5', 'Recall@0.5']} rows={[
          ['V1 exact (with node_timestamp)', ...['roc_auc', 'pr_auc', 'precision', 'recall'].map((k) => f(a.V1_exact_all19[k]))],
          ['17 raw + timestamp', ...['roc_auc', 'pr_auc', 'precision', 'recall'].map((k) => f(a['c_raw+timestamp'][k]))],
          ['17 raw + degree', ...['roc_auc', 'pr_auc', 'precision', 'recall'].map((k) => f(a['b_raw+degree'][k]))],
          ['17 raw only', ...['roc_auc', 'pr_auc', 'precision', 'recall'].map((k) => f(a.a_17_raw_only[k]))],
        ]} />
        <Note>node_timestamp is filled only for fraud accounts, so a non-zero value means fraud. Published results for this dataset are in the range of the raw-feature rows.</Note>
      </Panel>
      <Panel title="V2 corrected feature sets (no timestamp)" icon={ShieldAlert}>
        <Table head={['Feature set', 'ROC-AUC', 'PR-AUC', '# features']} rows={Object.entries(d.v2_sets).map(([k, v]) => [k, f(v.roc_auc), f(v.pr_auc), v.n_features])} />
      </Panel>
      <Panel title="25-model benchmark on DGraph-Fin (top 12)" icon={Table2}>
        <Table head={['#', 'Model', 'Val PR', 'Test PR', 'Test ROC', 'KS']} rows={d.benchmark.map((r) => [r.rank_val, r.model, f(r.val_pr, 4), f(r.test_pr, 4), f(r.test_roc), f(r.ks)])} />
        <Note>Every model scores PR-AUC of only about 0.03 to 0.045. This matches the published benchmark: DGraph-Fin is hard. It is not ready for production use with these features.</Note>
      </Panel>
    </div>
  )
}

function Row({ r }) {
  const tone = (o) => (o.includes('wrong') || o.includes('false alarm') ? 'text-red-500' : 'text-emerald-600')
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[['V2 model', r.v2], ['V1 model', r.v1]].map(([n, m]) => (
        <div key={n} className="p-3 border rounded-lg border-border">
          <div className="text-xs text-muted-foreground">{n}</div>
          <div className="mt-1 font-mono text-lg font-semibold">{m.decision}</div>
          <div className="text-xs text-muted-foreground">score {m.score} (flag at {Number(m.threshold).toFixed(2)})</div>
          <div className={cn('mt-1 text-xs font-medium', tone(m.outcome))}>{m.outcome}</div>
          {m.risk_rank && <div className="mt-1 text-[11px] text-muted-foreground">Risk rank {m.risk_rank.toLocaleString()} of {m.of.toLocaleString()} held-out transactions</div>}
        </div>
      ))}
    </div>
  )
}

function Score() {
  const [id, setId] = useState('')
  const [sel, setSel] = useState(null)
  const ex = useQuery({ queryKey: ['v2', 'examples'], queryFn: () => api.v2Examples(3) })
  const one = useQuery({ queryKey: ['v2', 'score', sel], queryFn: () => api.v2Score(sel), enabled: !!sel, retry: false })
  return (
    <div className="space-y-5">
      <Panel title="Look up a held-out transaction" icon={Search}>
        <div className="flex gap-2">
          <input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} placeholder="Transaction id, e.g. 3574822"
            className="w-64 px-2 py-1.5 text-sm border rounded-md border-border bg-background" />
          <button onClick={() => id && setSel(id)} className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground">Show V1 and V2</button>
        </div>
        <Note>V2 scores exist only for the 147,635 held-out (later-in-time) transactions the model never trained on, so no score is shown for data the model has seen.</Note>
        {one.isError && <p className="mt-3 text-xs text-red-500">{one.error.message}</p>}
        {one.data && (
          <div className="mt-4 space-y-2">
            <div className="text-sm">Transaction {one.data.transaction_id} — amount ${one.data.amount} — true label: <b>{one.data.true_label}</b></div>
            <Row r={one.data} />
          </div>
        )}
      </Panel>
      {ex.data && Object.entries({ caught_frauds: 'Frauds V2 caught', missed_frauds: 'Frauds V2 missed', false_alarms: 'False alarms (honest customer flagged)' }).map(([k, label]) => (
        <Panel key={k} title={`${label} — ${ex.data.counts[k].toLocaleString()} in the test block`} icon={Search}>
          <div className="space-y-2">
            {ex.data[k].map((r) => (
              <button key={r.transaction_id} onClick={() => { setId(String(r.transaction_id)); setSel(String(r.transaction_id)) }}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-left border rounded-md border-border hover:bg-secondary">
                <span className="font-mono">TX {r.transaction_id}</span><span>${r.amount}</span><span>V2 {r.v2.score}</span><span>V1 {r.v1.score}</span>
              </button>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  )
}

export default function V2Evaluation() {
  const [tab, setTab] = useState('overview')
  const q = useQuery({ queryKey: ['v2', 'summary'], queryFn: api.v2Summary })
  return (
    <div className="container py-6">
      <div className="flex items-start justify-between gap-4">
      <h1 className="text-2xl font-semibold font-display">V2 Evaluation</h1>
      <button type="button" disabled={!q.data} onClick={() => downloadV2Report(q.data)} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary disabled:opacity-40"><Download size={13} /> Download PDF</button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Every number here is read from a result file made by the V2 pipeline on the combined Golden layer ({q.data ? q.data.data.labelled_records.toLocaleString() : '4,291,090'} labelled records).</p>
      <div className="flex flex-wrap gap-2 mt-4 mb-5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs', tab === t.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <p className="text-sm text-red-500">{q.error.message}</p>}
      {q.data && tab === 'overview' && <Overview s={q.data} />}
      {q.data && tab === 'bench' && <Bench s={q.data} />}
      {q.data && tab === 'tune' && <Tune s={q.data} />}
      {q.data && tab === 'finance' && <Finance s={q.data} />}
      {q.data && tab === 'dgraph' && <Dgraph s={q.data} />}
      {tab === 'score' && <Score />}
    </div>
  )
}
