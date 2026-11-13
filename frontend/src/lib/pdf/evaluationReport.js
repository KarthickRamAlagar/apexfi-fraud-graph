import { startReport, save, fmtInt } from './common'
import { COL } from '@/lib/reportFlow'
import { fromCm } from '@/lib/evalMath'

const BLUE = [13, 148, 136], AMBER = [217, 119, 6], RED = [220, 38, 38], SKY = [59, 130, 246], GREY = [140, 146, 156]
const f3 = (v) => (v == null || Number.isNaN(Number(v)) ? 'No data' : Number(v).toFixed(3))
const pc = (v, d = 1) => (v == null ? 'No data' : `${(v * 100).toFixed(d)}%`)

// Complete evaluation report: every graph and metric on the Evaluation Metrics page, in the ApexFi PDF template.
// Input: {curves, groups, bayes, summary} (any of groups/bayes/summary may be missing; their sections say so).
export function downloadEvaluationReport({ curves: c, groups: g, bayes: bn, summary: s }) {
  const { doc, flow } = startReport('Evaluation Metrics')
  const m1 = fromCm(c.v1.confusion), m2 = fromCm(c.v2.confusion)
  flow.title('Evaluation metrics report', 'V2 model against V1, on the untouched test block', `${fmtInt(c.v2.rows)} test transactions, ${fmtInt(c.v2.frauds)} frauds. The test block is the last 25% of transactions in time order. All curves are computed from the saved model scores.`)
  flow.kpi([
    { label: 'ROC-AUC V2', value: f3(c.v2.roc.auc), sub: `V1 ${f3(c.v1.roc.auc)}` },
    { label: 'PR-AUC V2', value: f3(c.v2.pr.ap), sub: `V1 ${f3(c.v1.pr.ap)}` },
    { label: 'KS V2', value: f3(c.v2.ks.value), sub: `V1 ${f3(c.v1.ks.value)}` },
    { label: 'Gini V2', value: f3(2 * c.v2.roc.auc - 1), sub: `V1 ${f3(2 * c.v1.roc.auc - 1)}` },
  ])

  flow.section('1. Ranking power', { minSpace: 60 })
  flow.para('How well the score puts fraud above normal transactions. ROC shows caught fraud against false alarms. Precision-recall is the more honest view when fraud is rare.')
  const ok = (cm) => ({ x: cm.fp / (cm.fp + cm.tn), y: cm.tp / (cm.tp + cm.fn) })
  flow.lineChart({ title: 'ROC curve', xLabel: 'False alarm rate', yLabel: 'Caught fraud rate', diag: true,
    series: [{ name: `V2 (AUC ${f3(c.v2.roc.auc)})`, color: BLUE, xs: c.v2.roc.fpr, ys: c.v2.roc.tpr }, { name: `V1 (AUC ${f3(c.v1.roc.auc)})`, color: AMBER, xs: c.v1.roc.fpr, ys: c.v1.roc.tpr }],
    marks: [{ ...ok(c.v2.confusion), color: BLUE }, { ...ok(c.v1.confusion), color: AMBER }], note: 'Closer to the top-left corner is better. Dots mark each model\'s chosen cut-off.' })
  flow.lineChart({ title: 'Precision-recall curve', xLabel: 'Recall', yLabel: 'Precision',
    series: [{ name: `V2 (AP ${f3(c.v2.pr.ap)})`, color: BLUE, xs: c.v2.pr.recall, ys: c.v2.pr.precision }, { name: `V1 (AP ${f3(c.v1.pr.ap)})`, color: AMBER, xs: c.v1.pr.recall, ys: c.v1.pr.precision }, { name: `Chance (${f3(c.v2.pr.base_rate)})`, color: GREY, dash: true, xs: [0, 1], ys: [c.v2.pr.base_rate, c.v2.pr.base_rate] }],
    marks: [{ x: m2.recall, y: m2.precision, color: BLUE }, { x: m1.recall, y: m1.precision, color: AMBER }] })
  flow.para(`KS: V2 reaches ${f3(c.v2.ks.value)} at score ${f3(c.v2.ks.at_score)}, catching ${pc(c.v2.ks.tpr)} of fraud for ${pc(c.v2.ks.fpr, 2)} false alarms.`)

  flow.section('2. At the cut-off', { minSpace: 90 })
  flow.confusion([{ title: `V2 (cut-off ${f3(c.v2.threshold)})`, cm: c.v2.confusion }, { title: `V1 (cut-off ${f3(c.v1.threshold)})`, cm: c.v1.confusion }])
  const rows = [['Precision', 'precision', 'Share of flags that were fraud'], ['Recall', 'recall', 'Share of fraud caught'], ['F1', 'f1', 'Balance of precision and recall'], ['Specificity', 'specificity', 'Normal transactions left alone'],
    ['False alarm rate', 'fpr', 'Normal transactions wrongly flagged'], ['Balanced accuracy', 'balanced', 'Average of recall and specificity'], ['MCC', 'mcc', 'Fair when fraud is rare (-1 to 1)'], ['Alert rate', 'alert', 'Share of all transactions flagged']]
    .map(([k, key, h]) => [k, key === 'alert' || key === 'fpr' ? pc(m1[key], 2) : f3(m1[key]), key === 'alert' || key === 'fpr' ? pc(m2[key], 2) : f3(m2[key]), h])
  flow.table([{ label: 'Metric', idx: 0, left: true, w: 2 }, { label: 'V1', idx: 1, w: 1 }, { label: 'V2', idx: 2, w: 1 }, { label: 'Plain meaning', idx: 3, left: true, w: 3.5 }], rows)
  const sw = c.v2.sweep
  flow.lineChart({ title: 'Precision, recall and F1 as the cut-off moves (V2)', xLabel: 'Cut-off', yLabel: 'Value',
    series: [{ name: 'Precision', color: BLUE, xs: sw.map((x) => x.threshold), ys: sw.map((x) => x.precision) }, { name: 'Recall', color: RED, xs: sw.map((x) => x.threshold), ys: sw.map((x) => x.recall) }, { name: 'F1', color: AMBER, xs: sw.map((x) => x.threshold), ys: sw.map((x) => x.f1) }] })

  flow.section('3. Trust in the score', { minSpace: 90 })
  const cal = c.v2.calibration, mx = Math.min(1, Math.ceil(Math.max(...cal.flatMap((b) => [b.mean_pred, b.observed])) * 10) / 10)
  flow.lineChart({ title: 'Reliability diagram (V2)', xLabel: 'Average predicted fraud probability', yLabel: 'Share that was fraud', diag: true, xMax: mx, yMax: mx, fx: (v) => v.toFixed(2), fy: (v) => v.toFixed(2),
    series: [{ name: 'V2, ten equal groups', color: BLUE, dots: true, xs: cal.map((b) => b.mean_pred), ys: cal.map((b) => b.observed) }], note: 'On the dashed line, a score means what it says.' })
  flow.hist({ title: 'Where fraud and normal scores sit (V2)', edges: c.v2.score_hist.edges, a: c.v2.score_hist.fraud, b: c.v2.score_hist.normal, aName: 'Fraud', bName: 'Normal', aColor: RED, bColor: SKY })
  if (s) flow.para(`Calibration error (ECE): V2 ${f3(s.final.ece)}, V1 ${f3(s.v1.ece)}. Brier score V2: ${f3(s.final.brier)} (lower is better).`)

  flow.section('4. Review budget', { minSpace: 90 })
  flow.para('If analysts can review only the top x% of transactions, how much of the fraud is inside that slice.')
  flow.lineChart({ title: 'Gain curve', xLabel: 'Share of transactions reviewed (highest score first)', yLabel: 'Share of all fraud caught', diag: true,
    series: [{ name: 'V2', color: BLUE, xs: [0, ...c.v2.gain.map((x) => x.top_pct / 100)], ys: [0, ...c.v2.gain.map((x) => x.recall)] }, { name: 'V1', color: AMBER, xs: [0, ...c.v1.gain.map((x) => x.top_pct / 100)], ys: [0, ...c.v1.gain.map((x) => x.recall)] }] })
  flow.table([{ label: 'Reviewed (top)', idx: 0, left: true, w: 1.4 }, { label: 'V2 fraud caught', idx: 1, w: 1.4 }, { label: 'V2 lift', idx: 2, w: 1 }, { label: 'V1 fraud caught', idx: 3, w: 1.4 }, { label: 'V1 lift', idx: 4, w: 1 }],
    c.v2.gain.map((x, i) => [`${x.top_pct}%`, pc(x.recall), `${x.lift.toFixed(1)}x`, pc(c.v1.gain[i].recall), `${c.v1.gain[i].lift.toFixed(1)}x`]))

  flow.section('5. Feature groups', { minSpace: 90 })
  if (!g) flow.para('No data. The feature-group result file is not in app_data yet.', { italic: true })
  else {
    const gr = [...g.groups].sort((a, b) => b.gain_share - a.gain_share)
    flow.para(`${g.note} ${g.protocol} All ${g.groups.length} groups together reach PR-AUC ${f3(g.all_columns.pr_auc)} and ROC-AUC ${f3(g.all_columns.roc_auc)} on ${fmtInt(g.test_rows)} test rows.`, { size: 8 })
    flow.hbars({ title: 'Share of split gain by group', rows: gr.map((r) => ({ label: `${r.group} (${r.n_features})`, value: r.gain_share * 100 })), fmt: (v) => `${v.toFixed(1)}%` })
    flow.barChart({ title: 'Group alone against group left out (test PR-AUC)', cats: gr.map((r) => r.group), yMax: 0.6, yLabel: 'PR-AUC', series: [{ name: 'Only this group', color: BLUE, values: gr.map((r) => r.alone_pr) }, { name: 'Everything except this group', color: AMBER, values: gr.map((r) => r.without_pr) }], ref: { value: g.all_columns.pr_auc, label: `all columns ${f3(g.all_columns.pr_auc)}` } })
    flow.table([{ label: 'Group', idx: 0, left: true, w: 2.6 }, { label: 'Cols', idx: 1, w: 0.8 }, { label: 'Alone PR', idx: 2, w: 1 }, { label: 'Alone ROC', idx: 3, w: 1 }, { label: 'Without PR', idx: 4, w: 1.1 }, { label: 'Drop', idx: 5, w: 1 }, { label: 'Gain share', idx: 6, w: 1.1 }],
      gr.map((r) => [r.group, r.n_features, f3(r.alone_pr), f3(r.alone_roc), f3(r.without_pr), f3(r.drop_in_pr), pc(r.gain_share)]))
    flow.h2('Top single columns by gain')
    flow.table([{ label: 'Column', idx: 0, left: true, w: 2 }, { label: 'Group', idx: 1, left: true, w: 2 }, { label: 'Gain share', idx: 2, w: 1 }], g.top_features.map((t) => [t.feature, t.group, pc(t.gain_share, 2)]))
  }

  flow.section('6. Bayesian network (side model)', { minSpace: 90 })
  if (!bn) flow.para('No data. The Bayesian network result file is not in app_data yet.', { italic: true })
  else {
    const t = bn.metrics.tan, nb = bn.metrics.naive_bayes
    flow.para(`A tree-augmented Bayesian network on ${bn.variables.length} coarse features. It is kept as a readable side model and is not used for scoring. ${bn.protocol} Trained on ${fmtInt(bn.fit_rows)} rows, tested on ${fmtInt(bn.test_rows)} rows (${fmtInt(bn.test_frauds)} frauds).`, { size: 8 })
    const mrow = (n, x) => [n, f3(x.pr_auc), f3(x.roc_auc), f3(x.precision), f3(x.recall), f3(x.f1), x.brier == null ? 'n/a' : f3(x.brier)]
    flow.table([{ label: 'Model', idx: 0, left: true, w: 3 }, { label: 'PR-AUC', idx: 1, w: 1 }, { label: 'ROC-AUC', idx: 2, w: 1 }, { label: 'Precision', idx: 3, w: 1 }, { label: 'Recall', idx: 4, w: 1 }, { label: 'F1', idx: 5, w: 1 }, { label: 'Brier', idx: 6, w: 1 }],
      [mrow('Naive Bayes', nb), mrow('Bayesian network (TAN)', t), ...(s ? [mrow('V1 LightGBM, 7 features', { ...s.v1, brier: null }), mrow('V2 LightGBM, 449 features', s.final)] : [])], { highlight: (r) => (String(r[0]).startsWith('Bayesian') ? 'win' : null) })
    flow.para(`Honest result: the network scores PR-AUC ${f3(t.pr_auc)} and ROC-AUC ${f3(t.roc_auc)}. Its PR-AUC is higher than V1 and its ROC-AUC is about the same as V1, and both are clearly below the final model, because 12 coarse features lose much of what LightGBM uses.`, { size: 8, italic: true })
    flow.h2('Learned links between features')
    flow.table([{ label: 'Parent', idx: 0, left: true, w: 2 }, { label: 'Child', idx: 1, left: true, w: 2 }, { label: 'Dependence given class', idx: 2, w: 1.6 }], bn.edges.map((e) => [e.from, e.to, f3(e.cmi)]))
    flow.h2('Fraud rate in each state')
    bn.single_variable.forEach((sv) => flow.hbars({ title: sv.label, rows: sv.rows.map((r) => ({ label: `${r.state} (${fmtInt(r.rows)} rows)`, value: r.fraud_rate_pct })), fmt: (v) => `${v.toFixed(2)}%`, color: COL.amber }))
    flow.para(`Overall fraud rate in the training rows: ${bn.base_rate_pct}%.`, { size: 8 })
  }
  save(flow, doc, 'ApexFi_Evaluation_Metrics')
}
