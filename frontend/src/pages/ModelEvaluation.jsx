import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { api2 } from '@/lib/api2'
import { PageHeader, TabBar, Section, DataTable, Note, Big } from '@/components/kit/Kit'

const f = (v, d = 3) => (v == null ? null : Number(v).toFixed(d))
const ms = (m) => (m ? `${f(m.mean, 4)} ± ${f(m.std, 4)}` : null)

function Confusion({ cm }) {
  if (!cm) return null
  const [[tn, fp], [fn, tp]] = cm
  const cell = (v, l, good) => (
    <div className={`rounded-lg border p-3 text-center ${good ? 'border-signal-teal/40 bg-signal-teal/10' : 'border-signal-red/40 bg-signal-red/10'}`}>
      <p className="font-display text-[20px] font-semibold tabular-nums text-foreground">{v.toLocaleString()}</p><p className="text-[12px] text-ink-300">{l}</p>
    </div>
  )
  return <div className="grid max-w-md grid-cols-2 gap-2">{cell(tn, 'True negatives', true)}{cell(fp, 'False alarms', false)}{cell(fn, 'Missed frauds', false)}{cell(tp, 'Caught frauds', true)}</div>
}

function DatasetView({ ds }) {
  const { gnn, baseline, stacked, multiseed } = ds
  if (!ds.complete) return <Note tone="amber">Some result files for {ds.label} are missing from the saved results folder, so nothing is shown rather than a guess.</Note>
  const rows = [
    { model: baseline.model || 'LightGBM (tabular only)', m: baseline },
    { model: 'GraphSAGE (graph neural network)', m: gnn },
    { model: stacked.model || 'Stacked: LightGBM + GNN', m: stacked, win: true },
  ].map((r) => ({ model: r.model, precision: f(r.m.precision), recall: f(r.m.recall), f1: f(r.m.f1), roc: f(r.m.roc_auc), pr: f(r.m.pr_auc), win: r.win }))
  return (
    <div className="space-y-5">
      {ds.key === 'dgraph_fin' && <Note tone="amber">At the default 0.5 cut-off this model flags almost no one, so precision, recall and F1 print as 0. Fraud is rare in DGraph-Fin (about 1.3% of labelled accounts). The ranking scores (ROC-AUC, PR-AUC) and the tuned operating point are on the V2 Evaluation page.</Note>}
      <Section title="One run: baseline, graph model and stacked model" subtitle="Same held-out test split for all three.">
        <DataTable columns={[{ key: 'model', label: 'Model' }, { key: 'precision', label: 'Precision', right: true }, { key: 'recall', label: 'Recall', right: true }, { key: 'f1', label: 'F1', right: true }, { key: 'roc', label: 'ROC-AUC', right: true }, { key: 'pr', label: 'PR-AUC', right: true }]} rows={rows} />
      </Section>
      {multiseed && (
        <Section title="Three seeds: mean ± spread" subtitle={`Seeds ${multiseed.seeds.join(', ')}. ${multiseed.note || ''}`}>
          <DataTable columns={[{ key: 'model', label: 'Model' }, { key: 'precision', label: 'Precision', right: true }, { key: 'recall', label: 'Recall', right: true }, { key: 'f1', label: 'F1', right: true }, { key: 'roc', label: 'ROC-AUC', right: true }, { key: 'pr', label: 'PR-AUC', right: true }]}
            rows={[['LightGBM', multiseed.lightgbm], ['Stacked', multiseed.stacked]].map(([n, m]) => ({ model: n, precision: ms(m.precision), recall: ms(m.recall), f1: ms(m.f1), roc: ms(m.roc_auc), pr: ms(m.pr_auc) }))} />
        </Section>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Stacked model: confusion matrix" subtitle="Counts on the test split."><Confusion cm={stacked.confusion_matrix} /></Section>
        <Section title="Learned stacking weights">
          {stacked.learned_weight_lightgbm != null ? (
            <div className="grid grid-cols-2 gap-3"><Big label="LightGBM weight" value={f(stacked.learned_weight_lightgbm, 2)} /><Big label="GNN weight" value={f(stacked.learned_weight_gnn, 2)} /></div>
          ) : <p className="text-[13.5px] text-ink-300">Not stored for this model.</p>}
        </Section>
      </div>
      {stacked.note && <Section title="Why two models"><p className="text-[13.5px] leading-relaxed text-ink-100">{stacked.note}</p></Section>}
    </div>
  )
}

export default function ModelEvaluation() {
  const [tab, setTab] = useState('ieee_cis')
  const q = useQuery({ queryKey: ['deep-model-eval'], queryFn: api2.modelEvaluation, retry: 1 })
  const tabs = [{ id: 'ieee_cis', label: 'IEEE-CIS Transactions', who: 'Card transactions, random split' }, { id: 'dgraph_fin', label: 'DGraph-Fin Users', who: 'Retrained without node_timestamp (see V2 Evaluation)' }]
  const ds = q.data?.datasets.find((d) => d.key === tab)
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <PageHeader icon={FlaskConical} title="Model Evaluation" subtitle="Baseline against graph model against the stacked model, with repeat runs. All figures are read from saved result files." />
      <TabBar tabs={tabs} value={tab} onChange={setTab} />
      {q.isLoading && <p className="text-ink-300">Loading…</p>}
      {q.isError && <Note tone="red">{q.error.message}</Note>}
      {ds && <DatasetView ds={ds} />}
    </div>
  )
}
