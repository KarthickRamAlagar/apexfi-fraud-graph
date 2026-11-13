import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, RefreshCw, Download } from 'lucide-react'
import { api2 } from '@/lib/api2'
import { PageHeader, TabBar, Note, Section, Big, DataTable, KeyVals, Pill, GhostButton, NoData, num, when } from '@/components/kit/Kit'
import { downloadOpsReport } from '@/lib/pdf/opsReport'

const TABS = [
  { id: 'overview', label: 'Overview', who: 'Everyone: is it up, and what is it serving' },
  { id: 'system', label: 'System', who: 'Server, database and response time, measured live' },
  { id: 'models', label: 'Models', who: 'The saved ApexFi results the app shows' },
  { id: 'data', label: 'Data and lineage', who: 'Where the numbers come from and which files are served' },
  { id: 'issues', label: 'Known issues', who: 'Things we found and how big they are' },
]
const f3 = (v) => (v == null ? null : Number(v).toFixed(3))
const uptime = (s) => (s == null ? null : s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

export default function Ops() {
  const [tab, setTab] = useState('overview')
  const q = useQuery({ queryKey: ['ops-summary'], queryFn: api2.opsSummary, retry: 1, refetchOnMount: 'always', staleTime: 0 })
  const d = q.data

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <PageHeader icon={Activity} title="Ops: performance and provenance"
        subtitle="How the ApexFi service is running and where every number on screen comes from. If something was not measured, it says No data."
        meta={d ? `Snapshot taken ${when(d.generatedAt)}` : null}
        right={<>
          <GhostButton icon={RefreshCw} onClick={() => q.refetch()}>{q.isFetching ? 'Refreshing…' : 'Refresh'}</GhostButton>
          <GhostButton icon={Download} disabled={!d} onClick={() => downloadOpsReport(d)}>Download PDF</GhostButton>
        </>} />

      {q.isError && <Note tone="red">The ApexFi API did not answer ({q.error?.message}). Start the backend, then press Refresh.</Note>}
      {q.isLoading && <p className="text-ink-300">Loading…</p>}

      {d && <>
        <TabBar tabs={TABS} value={tab} onChange={setTab} />

        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Big label="API" value={<Pill tone="green">Up</Pill>} sub={`Running for ${uptime(d.service.uptimeSeconds)}`} small />
              <Big label="Database" value={<Pill tone={d.service.database.ok ? 'green' : 'red'}>{d.service.database.ok ? 'Connected' : 'Not reachable'}</Pill>}
                sub={d.service.database.ok ? `${d.service.database.ms} ms round trip` : d.service.database.error} small />
              <Big label="Saved result files" value={num(d.service.snapshotFiles)} sub={`Folder: ${d.service.snapshotFolder}/`} />
              <Big label="API calls seen" value={num(d.latency.totalCalls)} sub={`${d.latency.totalErrors} server errors`} />
            </div>
            {d.models.v2 && (
              <Section title="Current ApexFi result (V2)" subtitle={d.models.v2.protocol}>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <Big label="Labelled records" value={num(d.models.v2.labelledRecords)} />
                  <Big label="Final model" value={d.models.v2.winner} small />
                  <Big label="Test PR-AUC" value={f3(d.models.v2.prAuc)} />
                  <Big label="Test ROC-AUC" value={f3(d.models.v2.rocAuc)} />
                </div>
              </Section>
            )}
            {d.dbOptimisation && (
              <Section title="Scoring query speed (measured)" subtitle={d.dbOptimisation.note}>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <Big label="Average before" value={`${num(d.dbOptimisation.before.avg_ms)} ms`} small />
                  <Big label="Average after" value={`${num(d.dbOptimisation.after.avg_ms)} ms`} small />
                  <Big label="Slowest 5% before" value={`${num(d.dbOptimisation.before.p95_ms)} ms`} small />
                  <Big label="Slowest 5% after" value={`${num(d.dbOptimisation.after.p95_ms)} ms`} small />
                </div>
              </Section>
            )}
          </div>
        )}

        {tab === 'system' && (
          <div className="space-y-5">
            <Section title="Response time by route" subtitle={d.latency.note}>
              {d.latency.routes.length === 0
                ? <p className="text-[13.5px] text-ink-300"><NoData why="no API calls yet. Open a few pages, then press Refresh" /></p>
                : <DataTable columns={[
                    { key: 'route', label: 'Route' },
                    { key: 'calls', label: 'Calls', right: true, fmt: (v) => num(v) },
                    { key: 'p50', label: 'Median (ms)', right: true, fmt: (v) => num(v, 1) },
                    { key: 'p95', label: 'Slowest 5% (ms)', right: true, fmt: (v) => num(v, 1) },
                    { key: 'errors', label: 'Errors', right: true, fmt: (v) => num(v) },
                  ]} rows={d.latency.routes} />}
            </Section>
            <Section title="Service">
              <KeyVals rows={[
                ['Uptime', uptime(d.service.uptimeSeconds)],
                ['Database', d.service.database.ok ? `Connected (${d.service.database.ms} ms)` : `Not reachable (${d.service.database.error || 'unknown'})`],
                ['Saved results folder', d.service.snapshotFolder + '/'],
              ]} />
            </Section>
          </div>
        )}

        {tab === 'models' && (
          <div className="space-y-5">
            {d.models.v2 ? (
              <Section title="V2 final model" subtitle="Time-ordered test block. The full table is on the V2 Evaluation page.">
                <KeyVals rows={[['Final model', d.models.v2.winner], ['Test PR-AUC', f3(d.models.v2.prAuc)], ['Test ROC-AUC', f3(d.models.v2.rocAuc)], ['Labelled records', num(d.models.v2.labelledRecords)]]} />
              </Section>
            ) : <Note tone="grey">v2_summary.json is not in the results folder. <NoData /></Note>}
            <Section title="Three-seed results (random split)" subtitle="Mean and spread over seeds 42, 123 and 777.">
              <DataTable columns={[
                { key: 'name', label: 'Dataset' }, { key: 'f1', label: 'F1 (stacked)', right: true }, { key: 'roc', label: 'ROC-AUC (stacked)', right: true }, { key: 'seeds', label: 'Seeds', right: true },
              ]} rows={['ieee_cis', 'dgraph_fin'].map((k) => {
                const s = d.models.multiseed?.[k]?.stacked
                return { name: k === 'ieee_cis' ? 'IEEE-CIS' : 'DGraph-Fin', f1: s ? `${f3(s.f1.mean)} ± ${f3(s.f1.std)}` : null, roc: s ? f3(s.roc_auc.mean) : null, seeds: d.models.multiseed?.[k]?.seeds?.length }
              })} />
            </Section>
            {d.models.dgraphStacked && (
              <Section title="DGraph-Fin stacked model (retrained)" subtitle="Retrained without node_timestamp.">
                <KeyVals rows={[['ROC-AUC', f3(d.models.dgraphStacked.roc_auc)], ['PR-AUC', f3(d.models.dgraphStacked.pr_auc)], ['F1', f3(d.models.dgraphStacked.f1)]]} />
              </Section>
            )}
          </div>
        )}

        {tab === 'data' && (
          <div className="space-y-5">
            <Section title="Sources">
              <DataTable columns={[{ key: 'source', label: 'Source' }, { key: 'rows', label: 'Rows', right: true, fmt: (v) => num(v) }, { key: 'role', label: 'Used for' }]} rows={d.lineage} />
            </Section>
            <Section title={`Files served from ${d.service.snapshotFolder}/`} subtitle="Every chart and table in the app reads one of these saved files.">
              <DataTable dense columns={[{ key: 'name', label: 'File' }, { key: 'kb', label: 'Size (KB)', right: true, fmt: (v) => num(v, 1) }, { key: 'modified', label: 'Last changed', fmt: (v) => when(v) }]} rows={d.snapshot} />
            </Section>
          </div>
        )}

        {tab === 'issues' && (
          <div className="space-y-4">
            {d.knownIssues.map((i) => (
              <Section key={i.id} title={i.title}><p className="text-[13.5px] leading-relaxed text-ink-100">{i.detail}</p></Section>
            ))}
          </div>
        )}
      </>}
    </div>
  )
}
