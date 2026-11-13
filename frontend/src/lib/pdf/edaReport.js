import { startReport, save, fmtInt } from './common'
import { COL } from '@/lib/reportFlow'
import { api2 } from '@/lib/api2'

const RED = [220, 38, 38], SKY = [59, 130, 246]
const f3 = (v) => (v == null ? 'No data' : Number(v).toFixed(3))

function boxPlot(flow, c) {
  const d = flow.doc, rows = c.series, rh = 9, L = 28, W = flow.CW - L - 4
  flow.need(rows.length * rh + 16)
  d.setFont('helvetica', 'bold'); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(String(c.column), flow.M, flow.y); flow.y += 3
  const lo = Math.min(...rows.map((r) => r.whisker_low)), hi = Math.max(...rows.map((r) => r.whisker_high)), X = (v) => flow.M + L + (W * (v - lo)) / (hi - lo || 1)
  rows.forEach((r, i) => {
    const y = flow.y + i * rh, col = r.class === 'fraud' ? RED : SKY
    d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...COL.text); d.text(`${r.class} (${fmtInt(r.n)})`, flow.M, y + 5)
    d.setDrawColor(...col); d.setLineWidth(0.4); d.line(X(r.whisker_low), y + 4, X(r.whisker_high), y + 4)
    d.setFillColor(...col.map((v) => Math.round(255 - (255 - v) * 0.3))); d.rect(X(r.q1), y + 1, Math.max(0.6, X(r.q3) - X(r.q1)), 6, 'FD')
    d.setDrawColor(20, 20, 20); d.setLineWidth(0.6); d.line(X(r.median), y + 1, X(r.median), y + 7); d.setLineWidth(0.2)
  })
  flow.y += rows.length * rh
  d.setFont('helvetica', 'normal'); d.setFontSize(6.5); d.setTextColor(...COL.grey)
  d.text(String(Number(lo.toFixed(2))), flow.M + L, flow.y + 2.5); d.text(String(Number(hi.toFixed(2))), flow.M + L + W, flow.y + 2.5, { align: 'right' })
  flow.y += 7
  flow.para(rows.map((r) => `${r.class}: median ${Number(r.median).toFixed(2)}, mean ${Number(r.mean).toFixed(2)}, ${fmtInt(r.outliers)} outliers`).join('   |   ') + `   |   missing ${Number(c.missing_pct).toFixed(1)}%`, { size: 7.2, color: COL.grey })
}

// EDA charts report: correlation heatmap and box plots for each dataset, fraud against normal.
export async function downloadEdaReport() {
  const tables = [['ieee_cis_features', 'IEEE-CIS transactions'], ['dgraph_fin_nodes', 'DGraph-Fin users']]
  const got = []
  for (const [t, name] of tables) {
    try {
      const cols = await api2.edaColumns(t)
      const corr = await api2.edaCorrelation(t, null, 16)
      const top = corr.columns.filter((c) => c !== 'fraud').slice(0, 4)
      const box = top.length ? await api2.edaBox(t, top) : { columns: [] }
      got.push({ t, name, corr, box, groups: cols.groups })
    } catch (e) { got.push({ t, name, error: e.message }) }
  }
  const { doc, flow } = startReport('EDA Charts')
  flow.title('EDA charts report', 'Fraud against normal, drawn from the saved random samples', 'Correlation heatmap and box plots for the columns most linked to fraud. Each chart comes from the saved 50,000-row sample of its table.')
  got.forEach((g, i) => {
    flow.section(`${i + 1}. ${g.name}`, { minSpace: 100 })
    if (g.error) { flow.para(`No data. ${g.error}`, { italic: true }); return }
    flow.para(`${g.corr.mode}. Pearson correlation on ${fmtInt(g.corr.sampleRows)} sampled rows. The "fraud" row and column show how each column lines up with the label. Teal = move together, red = move opposite.`, { size: 8 })
    flow.heatmap({ title: 'Correlation heatmap', labels: g.corr.columns, matrix: g.corr.matrix })
    const { columns: cs, matrix: m } = g.corr, pairs = []
    for (let a = 0; a < cs.length; a += 1) for (let b = a + 1; b < cs.length; b += 1) if (m[a][b] != null && cs[a] !== 'fraud' && cs[b] !== 'fraud') pairs.push([cs[a], cs[b], m[a][b]])
    pairs.sort((p, q) => Math.abs(q[2]) - Math.abs(p[2]))
    flow.h2('Strongest column pairs')
    flow.table([{ label: 'Column A', idx: 0, left: true, w: 2 }, { label: 'Column B', idx: 1, left: true, w: 2 }, { label: 'Correlation', idx: 2, w: 1 }], pairs.slice(0, 8).map((p) => [p[0], p[1], f3(p[2])]))
    flow.h2('Box plots of the columns most linked to fraud')
    flow.para('Box = middle half of the rows. Black line = median. Thin line = whiskers (1.5 times the box width).', { size: 7.5, color: COL.grey })
    g.box.columns.forEach((c) => boxPlot(flow, c))
  })
  save(flow, doc, 'ApexFi_EDA_Charts')
}
