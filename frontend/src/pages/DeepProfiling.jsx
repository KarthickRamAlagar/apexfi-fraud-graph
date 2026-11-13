import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListTree } from 'lucide-react'
import { api2 } from '@/lib/api2'
import { PageHeader, TabBar, Section, Big, DataTable, HBars, Note, NoData, num, C } from '@/components/kit/Kit'

const TABS = [
  { id: 'ieee_cis_features', label: 'IEEE-CIS Transactions', who: '590,540 card transactions, every column profiled' },
  { id: 'dgraph_fin_nodes', label: 'DGraph-Fin Users', who: '3,700,550 users, every column profiled' },
]
const f = (v, d = 3) => (v == null ? null : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }))

function Histogram({ h }) {
  const W = 640, H = 190, L = 6, B = 22, max = Math.max(...h.counts, 1), n = h.counts.length, bw = (W - L * 2) / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Histogram of the 50,000-row sample">
      {h.counts.map((c, i) => {
        const bh = ((H - B - 8) * c) / max
        return <rect key={i} x={L + i * bw + 1} y={H - B - bh} width={bw - 2} height={bh} rx="1.5" fill={C.good}><title>{`${f(h.edges[i], 2)} to ${f(h.edges[i + 1], 2)}: ${c.toLocaleString()} rows`}</title></rect>
      })}
      <text x={L} y={H - 6} fontSize="11" fill={C.muted}>{f(h.edges[0], 2)}</text>
      <text x={W - L} y={H - 6} fontSize="11" textAnchor="end" fill={C.muted}>{f(h.edges[h.edges.length - 1], 2)}</text>
    </svg>
  )
}

function ColumnDeepDive({ table, columns }) {
  const [col, setCol] = useState(columns[0]?.column)
  const q = useQuery({ queryKey: ['deep-col', table, col], queryFn: () => api2.deepColumn(table, col), enabled: !!col, retry: 1 })
  const d = q.data
  return (
    <Section title="Column deep-dive" subtitle="Pick a column to see its spread. Shape comes from the saved 50,000-row sample; counts and missing % come from the full table.">
      <select value={col} onChange={(e) => setCol(e.target.value)} aria-label="Column"
        className="mb-4 w-full max-w-sm rounded-lg border border-ink-700/70 bg-ink-900 px-3 py-2 text-[14px] text-foreground">
        {columns.map((c) => <option key={c.column} value={c.column}>{c.column}</option>)}
      </select>
      {q.isLoading && <p className="text-ink-300">Loading…</p>}
      {q.isError && <Note tone="red">{q.error.message}</Note>}
      {d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Big small label="Type" value={d.stats.dtype} />
            <Big small label="Missing" value={d.stats.missing_pct == null ? null : `${f(d.stats.missing_pct, 2)}%`} />
            <Big small label="Mean" value={f(d.stats.mean)} />
            <Big small label="Min" value={f(d.stats.min)} />
            <Big small label="Max" value={f(d.stats.max)} />
          </div>
          {d.histogram && <Histogram h={d.histogram} />}
          {d.valueCounts && <HBars label="Most common values" rows={d.valueCounts.slice(0, 15).map((v) => ({ label: v.value.slice(0, 22), value: v.count }))} fmt={(v) => v.toLocaleString()} />}
          {!d.histogram && !d.valueCounts && <p className="text-[13.5px] text-ink-300"><NoData why="this column is not in the saved sample" /></p>}
        </div>
      )}
    </Section>
  )
}

export default function DeepProfiling() {
  const [tab, setTab] = useState('ieee_cis_features')
  const [filter, setFilter] = useState('')
  const q = useQuery({ queryKey: ['deep-prof', tab], queryFn: () => api2.deepProfiling(tab), retry: 1 })
  const d = q.data
  const rows = useMemo(() => (d ? d.columns.filter((c) => c.column.toLowerCase().includes(filter.toLowerCase())) : []), [d, filter])
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <PageHeader icon={ListTree} title="Full Profiling" subtitle="Every column of both datasets: type, how much is missing, and basic statistics. Read from the saved result files." />
      <TabBar tabs={TABS} value={tab} onChange={(t) => { setTab(t); setFilter('') }} />
      {q.isLoading && <p className="text-ink-300">Loading…</p>}
      {q.isError && <Note tone="red">{q.error.message}</Note>}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Big label="Rows" value={num(d.totalRows)} />
            <Big label="Columns" value={num(d.columnCount)} />
            <Big label="Columns with any missing values" value={num(d.columns.filter((c) => c.missing_pct > 0).length)} />
          </div>
          <Section title="Most-missing columns (top 40)" subtitle="Share of rows with no value.">
            <HBars label="Missing share by column" rows={d.worstMissing.map((w) => ({ label: w.column, value: w.missingPct }))} fmt={(v) => `${v.toFixed(1)}%`} color={C.warn} />
          </Section>
          <ColumnDeepDive key={tab} table={tab} columns={d.columns} />
          <Section title="All columns" right={<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name" aria-label="Filter columns"
            className="w-48 rounded-lg border border-ink-700/70 bg-ink-900 px-3 py-1.5 text-[13px] text-foreground" />}>
            <div className="max-h-[560px] overflow-y-auto">
              <DataTable dense columns={[
                { key: 'column', label: 'Column' }, { key: 'dtype', label: 'Type' },
                { key: 'missing_pct', label: 'Missing %', right: true, fmt: (v) => f(v, 2) },
                { key: 'mean', label: 'Mean', right: true, fmt: (v) => f(v) }, { key: 'std', label: 'Std', right: true, fmt: (v) => f(v) },
                { key: 'min', label: 'Min', right: true, fmt: (v) => f(v) }, { key: 'max', label: 'Max', right: true, fmt: (v) => f(v) },
              ]} rows={rows} />
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}
