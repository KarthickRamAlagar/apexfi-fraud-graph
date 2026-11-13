import { startReport, save, opts, fmtNum, fmtInt } from './common'

// Ops snapshot. Input: the object from /api/ops/summary.
export function downloadOpsReport(d) {
  const o = opts(), { doc, flow } = startReport('Ops Snapshot')
  const up = d.service.uptimeSeconds
  flow.title('ApexFi Ops snapshot', `Taken ${new Date(d.generatedAt).toLocaleString()}`, 'How the service is running and where the numbers come from. Anything not measured says No data.')
  flow.section('Service', { index: false })
  flow.kpi([
    { label: 'API', value: 'Up', sub: up < 7200 ? `${Math.round(up / 60)} min` : `${(up / 3600).toFixed(1)} h` },
    { label: 'Database', value: d.service.database.ok ? 'Connected' : 'Not reachable', sub: d.service.database.ok ? `${d.service.database.ms} ms` : d.service.database.error || '' },
    { label: 'Result files', value: fmtInt(d.service.snapshotFiles), sub: `${d.service.snapshotFolder}/` },
    { label: 'API calls seen', value: fmtInt(d.latency.totalCalls), sub: `${d.latency.totalErrors} errors` },
  ])
  flow.h2('Response time by route')
  if (d.latency.routes.length) flow.table([{ label: 'Route', key: 'route', left: true, w: 4 }, { label: 'Calls', key: 'calls', w: 1 }, { label: 'Median ms', key: 'p50', w: 1.3, fmt: (v) => fmtNum(v, 1) }, { label: 'Slowest 5% ms', key: 'p95', w: 1.5, fmt: (v) => fmtNum(v, 1) }], d.latency.routes)
  else flow.para('No data. No API calls had been measured yet.', { italic: true })
  if (d.dbOptimisation) {
    flow.h2('Scoring query speed (measured)')
    flow.table([{ label: '', idx: 0, left: true, w: 2 }, { label: 'Average ms', idx: 1, w: 1 }, { label: 'Slowest 5% ms', idx: 2, w: 1 }],
      [['Before indexes', d.dbOptimisation.before.avg_ms, d.dbOptimisation.before.p95_ms], ['After indexes', d.dbOptimisation.after.avg_ms, d.dbOptimisation.after.p95_ms]])
    flow.para(d.dbOptimisation.note, { size: 8, italic: true })
  }
  flow.section('Sources')
  flow.table([{ label: 'Source', key: 'source', left: true, w: 2 }, { label: 'Rows', key: 'rows', w: 1, fmt: (v) => fmtInt(v) }, { label: 'Used for', key: 'role', left: true, w: 3 }], d.lineage)
  if (o.pdfIncludeNotes) {
    flow.section('Known issues')
    d.knownIssues.forEach((i) => { flow.h2(i.title); flow.para(i.detail) })
  }
  save(flow, doc, 'ApexFi_Ops_Snapshot')
}
