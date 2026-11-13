import { startReport, save, opts, fmtNum, fmtPct, fmtInt, fmtUsd } from './common'
import { COL } from '@/lib/reportFlow'

// V2 Evaluation report. Input: the same object the V2 Evaluation page reads (v2_summary.json).
export function downloadV2Report(s) {
  const o = opts(), { doc, flow } = startReport('V2 Evaluation Report')
  const F = s.final, V = s.v1, d = s.decision, g = (v, dp) => fmtNum(v, dp)
  flow.title('ApexFi V2 Evaluation', `Combined Gold store: ${fmtInt(s.data.labelled_records)} labelled records`, s.protocol)

  if (o.pdfIncludeSummary) {
    flow.section('Result', { index: false })
    flow.kpi([
      { label: 'Test PR-AUC', value: g(F.pr_auc), sub: `V1: ${g(V.pr_auc)}`, color: COL.blue },
      { label: 'Test ROC-AUC', value: g(F.roc_auc), sub: `V1: ${g(V.roc_auc)}` },
      { label: 'F1 at threshold', value: g(F.f1), sub: `V1: ${g(V.f1)}` },
      { label: 'Held-out rows', value: '147,635', sub: '5,100 frauds' },
    ])
    flow.para(`Production model: tuned LightGBM with 449 features. The closest rival (${d.best_challenger}) was ${fmtNum(d.challenger_val_gain_pct, 2)}% better on validation. The rule is 1%, so the single, explainable model stays.`)
    flow.h2('V1 against V2 (same test block)')
    const rows = [['PR-AUC', 'pr_auc'], ['ROC-AUC', 'roc_auc'], ['Precision', 'precision'], ['Recall', 'recall'], ['F1', 'f1'], ['KS', 'ks'], ['Calibration error (ECE)', 'ece']]
    flow.table([{ label: 'Metric', idx: 0, left: true, w: 3 }, { label: 'V1 (7 features)', idx: 1, w: 2 }, { label: 'V2 final (449 features)', idx: 2, w: 2 }],
      rows.map(([n, k]) => [n, g(V[k]), g(F[k])]), { highlight: (r) => (r[0] === 'PR-AUC' ? 'win' : null) })
  }

  flow.section('Finance and risk metrics')
  const cols = ['Dummy (prior)', 'V1 temporal model (7 features)', 'LightGBM default', 'Best ensemble: Voting: XGB + LightGBM + CatBoost', 'FINAL (production)']
  const names = ['Dummy', 'V1', 'LGBM default', 'Best ensemble', 'V2 final']
  const defs = [['Alert rate', (r) => fmtPct(r.alert_rate_pct)], ['Precision', (r) => g(r.precision)], ['Recall', (r) => g(r.recall)], ['F1', (r) => g(r.f1)], ['ROC-AUC', (r) => g(r.roc_auc)], ['PR-AUC', (r) => g(r.pr_auc)], ['KS', (r) => g(r.ks)], ['Lift, top 1%', (r) => g(r.lift_top1, 1)], ['Lift, top 5%', (r) => g(r.lift_top5, 1)]]
  flow.table([{ label: 'Metric', idx: 0, left: true, w: 2.4 }, ...names.map((n, i) => ({ label: n, idx: i + 1, w: 1.5 }))],
    defs.map(([n, fn]) => [n, ...cols.map((c) => (s.finance[c] ? fn(s.finance[c]) : 'No data'))]))
  const grid = F.net_benefit_grid
  flow.h2('Money depends on the cost of a false alarm')
  flow.table([{ label: 'Friction $ per false alarm', idx: 0, left: true, w: 2 }, { label: 'V2 model', idx: 1, w: 2 }, { label: 'Flag everything', idx: 2, w: 2 }, { label: 'Better', idx: 3, w: 1.6 }],
    [1, 5, 10, 25, 50].map((c) => { const r = grid[`review2_friction${c}`]; return [String(c), fmtUsd(r.model), fmtUsd(r.flag_all), r.model > r.flag_all ? 'Model' : 'Flag everything'] }))
  flow.para(`Review cost $2 per alert, 90% of caught fraud value stopped. Break-even friction is about $${fmtNum(F.break_even_friction_vs_flag_all_usd, 2)}. The right value must come from the real business.`, { italic: true })

  flow.section('Benchmark (top 10 on validation)')
  flow.table([{ label: 'Model', key: 'model', left: true, w: 4 }, { label: 'Family', key: 'family', left: true, w: 1.4 }, { label: 'Val PR', key: 'val_pr', w: 1, fmt: (v) => g(v) }, { label: 'Test PR', key: 'test_pr', w: 1, fmt: (v) => g(v) }, { label: 'Test ROC', key: 'test_roc', w: 1, fmt: (v) => g(v) }],
    s.benchmark.slice(0, 10))

  flow.section('DGraph-Fin correction')
  flow.para(s.dgraph.note, { bold: true })
  const R = s.dgraph.retrained
  if (R) {
    flow.table([{ label: 'Model', idx: 0, left: true, w: 3 }, { label: 'ROC-AUC', idx: 1, w: 1 }, { label: 'PR-AUC', idx: 2, w: 1 }], [
      ['LightGBM (3 seeds)', g(R.lightgbm.roc_auc), g(R.lightgbm.pr_auc, 4)], ['GraphSAGE (one run)', g(R.graphsage.roc_auc), g(R.graphsage.pr_auc, 4)],
      ['Stacked (used by the app)', g(R.stacked.roc_auc), g(R.stacked.pr_auc, 4)], ['Old leaky model (invalid)', R.old_leaky ? g(R.old_leaky.roc_auc) : 'No data', R.old_leaky ? g(R.old_leaky.pr_auc, 4) : 'No data'],
    ], { highlight: (r) => (String(r[0]).startsWith('Stacked') ? 'win' : null) })
    flow.para(R.split, { size: 8 })
  }

  if (o.pdfIncludeNotes) {
    flow.section('Honest notes and limits')
    ;[...s.limitations, 'Most of the V2 gain comes from using more of the raw Gold columns, not from the engineered rolling features.', 'SMOTE was not needed: its gain is inside run-to-run noise.'].forEach((l) => flow.bullet(l))
  }
  save(flow, doc, 'ApexFi_V2_Evaluation')
}
