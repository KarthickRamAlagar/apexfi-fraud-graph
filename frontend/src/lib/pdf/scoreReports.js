import { startReport, save, opts, fmtNum, fmtPct, fmtInt } from './common'
import { COL } from '@/lib/reportFlow'

// One report for both score pages. kind: 'transaction' | 'account'. result: the object the page already shows.
export function downloadScoreReport(kind, result, inputs = null) {
  const o = opts(), isTx = kind === 'transaction'
  const { doc, flow } = startReport(isTx ? 'Transaction Risk Report' : 'Account Risk Report')
  const flagged = !!result.isFlagged, tone = flagged ? COL.red : COL.green
  flow.title(isTx ? 'Transaction risk report' : `Account risk report: #${result.nodeId}`,
    isTx ? 'Live score of a transaction the model has not seen' : (result.isBackgroundAccount ? 'Genuinely unlabeled DGraph-Fin account' : 'DGraph-Fin account with a real historical label'),
    'The score is a model estimate. It is not a decision on any real account.')

  if (o.pdfIncludeSummary) {
    flow.section('Result', { index: false })
    flow.kpi([
      { label: 'Decision', value: isTx ? (flagged ? 'FRAUD' : 'LEGITIMATE') : (flagged ? 'FLAGGED' : 'CLEAR'), color: tone },
      { label: 'Risk', value: `${Math.round(result.riskScore * 100)}%`, sub: `flag at ${Math.round(result.threshold * 100)}%`, color: tone },
      { label: 'LightGBM part', value: `${Math.round(result.componentScores.lightgbm * 100)}%` },
      { label: 'GNN part', value: `${Math.round(result.componentScores.gnn * 100)}%` },
    ])
  }
  if (isTx && result.graphContext) {
    flow.h2('Graph context')
    flow.kv([
      ['Matched existing transactions (shared card or device)', fmtInt(result.graphContext.hop1Neighbors)],
      ['Their own connections (2-hop)', fmtInt(result.graphContext.hop2Neighbors)],
      ['Matched transaction ids', (result.graphContext.matchedTransactionIds || []).slice(0, 8).join(', ') || 'None'],
    ], { head: ['Item', 'Value'], w: [0.55, 0.45] })
  }
  if (!isTx) {
    flow.h2('Network')
    flow.kv([['Real connections in the network', fmtInt(result.realConnectionCount)]], { w: [0.55, 0.45] })
  }
  if (o.pdfIncludeExplanation && result.topContributingFeatures?.length) {
    flow.section('Why this score (SHAP, per prediction)')
    flow.table([{ label: 'Feature', key: 'feature', left: true, w: 3 }, { label: 'Contribution (log-odds)', key: 'contribution', w: 2, fmt: (v) => fmtNum(v) }, { label: 'Effect', key: 'contribution', w: 2, fmt: (v) => (v >= 0 ? 'Pushes risk up' : 'Pushes risk down') }],
      result.topContributingFeatures)
    flow.para(isTx ? 'Signed SHAP on the LightGBM component. The final risk blends LightGBM and the GNN, so the bars explain the tree model, not the whole stack.'
      : 'Signed SHAP on the LightGBM component. Feature names (x0 to x16) are anonymised in the source dataset.', { italic: true, size: 8 })
  }
  if (isTx && inputs) {
    flow.section('Inputs used')
    const rows = Object.entries(inputs).filter(([, v]) => v !== '' && v != null && !Number.isNaN(v)).map(([k, v]) => [k, String(v)])
    flow.kv(rows.length ? rows : [['Inputs', 'No data']])
  }
  if (o.pdfIncludeNotes && result.modelInfo?.note) {
    flow.section('Model note')
    flow.para(result.modelInfo.note)
  }
  save(flow, doc, isTx ? 'ApexFi_Transaction_Report' : `ApexFi_Account_${result.nodeId}_Report`)
}
