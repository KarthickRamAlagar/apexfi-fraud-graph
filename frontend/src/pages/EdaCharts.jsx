import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Download } from 'lucide-react'
import { api2 } from '@/lib/api2'
import { PageHeader, TabBar, Section, Note, DataTable, GhostButton, num } from '@/components/kit/Kit'
import { BoxRows, Scatter, Heatmap, SERIES } from '@/components/kit/Charts'
import { downloadEdaReport } from '@/lib/pdf/edaReport'

const DATASETS = [
  { id: 'ieee_cis_features', label: 'IEEE-CIS Transactions', who: 'Card transactions' },
  { id: 'dgraph_fin_nodes', label: 'DGraph-Fin Users', who: 'Graph users' },
]
const KINDS = [
  { id: 'box', label: 'Box plot', who: 'Spread of a column for fraud and normal rows' },
  { id: 'scatter', label: 'Scatter plot', who: 'Two columns against each other' },
  { id: 'corr', label: 'Correlation heatmap', who: 'Which columns move together, and with fraud' },
]
const f = (v, d = 3) => (v == null ? 'No data' : Number(v).toFixed(d))
const clsColor = (c) => (c === 'fraud' ? SERIES.fraud : c === 'normal' ? SERIES.normal : SERIES.background)

function ColPick({ groups, value, onChange, label }) {
  return (
    <label className="block text-[12.5px] text-ink-300">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-700/70 bg-ink-900 px-2.5 py-1.5 text-[13px] text-foreground">
        {groups.map((g) => <optgroup key={g.group} label={`${g.group} (${g.columns.length})`}>{g.columns.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>)}
      </select>
    </label>
  )
}

function BoxTab({ table, groups }) {
  const all = useMemo(() => groups.flatMap((g) => g.columns), [groups])
  const [sel, setSel] = useState(() => all.slice(0, 3))
  const [log, setLog] = useState(false)
  useEffect(() => setSel(all.slice(0, 3)), [table]) // eslint-disable-line
  const q = useQuery({ queryKey: ['eda-box', table, sel.join(',')], queryFn: () => api2.edaBox(table, sel), enabled: sel.length > 0, retry: 1 })
  return (
    <div className="space-y-5">
      <Section title="Pick up to 6 columns" subtitle="Grouped by what the columns describe.">
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.group}>
              <p className="mb-1 text-[12px] uppercase tracking-wider text-ink-400">{g.group}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.columns.slice(0, 40).map((c) => {
                  const on = sel.includes(c)
                  return <button key={c} type="button" onClick={() => setSel(on ? sel.filter((x) => x !== c) : sel.length < 6 ? [...sel, c] : sel)} className={`rounded-md border px-2 py-0.5 text-[12px] ${on ? 'border-signal-teal/60 bg-signal-teal/10 text-foreground' : 'border-ink-700/70 text-ink-300 hover:text-foreground'}`}>{c}</button>
                })}
                {g.columns.length > 40 && <span className="px-1 text-[12px] text-ink-500">+{g.columns.length - 40} more</span>}
              </div>
            </div>
          ))}
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-[12.5px] text-ink-300"><input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> Log scale (helps when a few huge values squash the box)</label>
      </Section>
      {q.isError && <Note tone="amber">{q.error.message}</Note>}
      {q.isLoading && <p className="text-ink-300">Loading…</p>}
      {q.data && q.data.columns.map((c) => (
        <Section key={c.column} title={c.column} subtitle={`Box = middle half of the rows, white line = median, circle = mean, thin line = whiskers (1.5 × box width). Missing: ${f(c.missing_pct, 1)}%.`}>
          <BoxRows label={`Box plot of ${c.column}`} logScale={log} rows={c.series.map((s) => ({ ...s, label: `${s.class} (${num(s.n)})`, color: clsColor(s.class) }))} />
          <p className="mt-2 text-[12px] text-ink-400">{c.series.map((s) => `${s.class}: median ${f(s.median, 2)}, ${num(s.outliers)} outliers`).join('   ·   ')}</p>
        </Section>
      ))}
      {q.data && <p className="text-[12px] text-ink-400">Drawn from a random sample of {num(q.data.sampleRows)} rows.</p>}
    </div>
  )
}

function ScatterTab({ table, groups }) {
  const all = useMemo(() => groups.flatMap((g) => g.columns), [groups])
  const [x, setX] = useState(all[0]); const [y, setY] = useState(all[1] || all[0])
  const [lx, setLx] = useState(false); const [ly, setLy] = useState(false)
  useEffect(() => { setX(all[0]); setY(all[1] || all[0]) }, [table]) // eslint-disable-line
  const q = useQuery({ queryKey: ['eda-sc', table, x, y], queryFn: () => api2.edaScatter(table, x, y), enabled: !!x && !!y, retry: 1 })
  return (
    <div className="space-y-5">
      <Section title="Choose two columns">
        <div className="grid gap-4 sm:grid-cols-2"><ColPick groups={groups} value={x} onChange={setX} label="X axis" /><ColPick groups={groups} value={y} onChange={setY} label="Y axis" /></div>
        <div className="mt-3 flex gap-5 text-[12.5px] text-ink-300">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={lx} onChange={(e) => setLx(e.target.checked)} /> Log X</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ly} onChange={(e) => setLy(e.target.checked)} /> Log Y</label>
        </div>
      </Section>
      {q.isError && <Note tone="amber">{q.error.message}</Note>}
      {q.isLoading && <p className="text-ink-300">Loading…</p>}
      {q.data && q.data.points.length > 0 && (
        <Section title={`${y} against ${x}`} subtitle={`Pearson correlation ${q.data.pearson == null ? 'No data' : f(q.data.pearson)}. Showing ${num(q.data.shown)} of ${num(q.data.usable_rows)} usable sampled rows. Every fraud row in the sample is shown, normal rows are thinned.`}>
          <Scatter label="Scatter plot" points={q.data.points} xLabel={x} yLabel={y} logX={lx} logY={ly} colors={{ fraud: SERIES.fraud, normal: SERIES.normal }} />
        </Section>
      )}
      {q.data && q.data.points.length === 0 && <Note tone="amber">No rows have both columns filled in. Pick different columns.</Note>}
    </div>
  )
}

function CorrTab({ table }) {
  const [top, setTop] = useState(16)
  const q = useQuery({ queryKey: ['eda-corr', table, top], queryFn: () => api2.edaCorrelation(table, null, top), retry: 1 })
  const strong = useMemo(() => {
    if (!q.data) return []
    const { columns: cs, matrix: m } = q.data, out = []
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (m[i][j] != null && cs[i] !== 'fraud' && cs[j] !== 'fraud') out.push({ a: cs[i], b: cs[j], r: m[i][j] })
    return out.sort((p, r) => Math.abs(r.r) - Math.abs(p.r)).slice(0, 8)
  }, [q.data])
  return (
    <div className="space-y-5">
      <label className="block max-w-xs text-[12.5px] text-ink-300">Columns shown (most linked to fraud first): {top}
        <input type="range" min="6" max="24" value={top} onChange={(e) => setTop(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      {q.isError && <Note tone="amber">{q.error.message}</Note>}
      {q.isLoading && <p className="text-ink-300">Loading…</p>}
      {q.data && (<>
        <Section title="Correlation heatmap" subtitle={`${q.data.mode}. Pearson correlation on ${num(q.data.sampleRows)} sampled rows. The "fraud" row and column show how each column lines up with the label.`}>
          <Heatmap label="Correlation heatmap" labels={q.data.columns} matrix={q.data.matrix} />
        </Section>
        <Section title="Strongest column pairs" subtitle="Highly linked columns carry overlapping information.">
          <DataTable columns={[{ key: 'a', label: 'Column A' }, { key: 'b', label: 'Column B' }, { key: 'r', label: 'Correlation', right: true }]} rows={strong.map((s) => ({ ...s, r: f(s.r) }))} />
        </Section>
      </>)}
    </div>
  )
}

export default function EdaCharts() {
  const [table, setTable] = useState('ieee_cis_features')
  const [kind, setKind] = useState('box')
  const cq = useQuery({ queryKey: ['eda-cols', table], queryFn: () => api2.edaColumns(table), retry: 1 })
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <PageHeader icon={BarChart3} title="EDA Charts" subtitle="Box plots, scatter plots and a correlation heatmap, split by fraud and normal. Drawn from the saved random 50,000-row sample of each table."
        right={<GhostButton icon={Download} onClick={() => downloadEdaReport().catch((e) => window.console.error(e))}>Download PDF</GhostButton>} />
      <TabBar tabs={DATASETS} value={table} onChange={setTable} />
      <TabBar tabs={KINDS} value={kind} onChange={setKind} />
      {cq.isError && <Note tone="amber">{cq.error.message}</Note>}
      {cq.isLoading && <p className="text-ink-300">Loading…</p>}
      {cq.data && kind === 'box' && <BoxTab table={table} groups={cq.data.groups} />}
      {cq.data && kind === 'scatter' && <ScatterTab table={table} groups={cq.data.groups} />}
      {cq.data && kind === 'corr' && <CorrTab table={table} />}
    </div>
  )
}
