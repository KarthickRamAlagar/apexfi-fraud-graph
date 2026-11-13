import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Table2, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { api2 } from '@/lib/api2'
import { PageHeader, TabBar, Section, Note, GhostButton, num } from '@/components/kit/Kit'

const TABS = [
  { id: 'ieee_cis_features', label: 'IEEE-CIS Transactions', who: 'A saved 50,000-row sample of 590,540 transactions' },
  { id: 'dgraph_fin_nodes', label: 'DGraph-Fin Users', who: 'A saved 50,000-row sample of 3,700,550 users' },
]
const LIMIT = 100
const inp = 'rounded-lg border border-ink-700/70 bg-ink-900 px-3 py-1.5 text-[13px] text-foreground w-28'

export default function RawDataBrowser() {
  const [tab, setTab] = useState('ieee_cis_features')
  const [fraud, setFraud] = useState('all')
  const [product, setProduct] = useState([])
  const [amtMin, setAmtMin] = useState('')
  const [amtMax, setAmtMax] = useState('')
  const [labels, setLabels] = useState([])
  const [degMin, setDegMin] = useState('')
  const [degMax, setDegMax] = useState('')
  const [offset, setOffset] = useState(0)

  const params = {}
  if (tab === 'ieee_cis_features') {
    params.fraud = fraud
    if (product.length) params.product = product.join(',')
    if (amtMin !== '') params.amt_min = amtMin
    if (amtMax !== '') params.amt_max = amtMax
  } else {
    if (labels.length) params.label = labels.join(',')
    if (degMin !== '') params.deg_min = degMin
    if (degMax !== '') params.deg_max = degMax
  }
  const q = useQuery({ queryKey: ['deep-raw', tab, params, offset], queryFn: () => api2.deepRaw(tab, { ...params, limit: LIMIT, offset }), retry: 1, placeholderData: (p) => p })
  const d = q.data
  const reset = () => setOffset(0)
  const toggle = (arr, set, v) => { set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]); reset() }
  const chip = (on) => `rounded-md border px-2.5 py-1 text-[12.5px] ${on ? 'border-signal-teal/60 bg-signal-teal/10 text-foreground' : 'border-ink-700/70 text-ink-300 hover:text-foreground'}`

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <PageHeader icon={Table2} title="Raw Data Browser" subtitle="Look at the real rows. Filter the saved sample, page through it, and download what you filtered as a CSV."
        right={<a href={api2.deepRawCsvUrl(tab, params)} download><GhostButton icon={Download} type="button">Download CSV</GhostButton></a>} />
      <TabBar tabs={TABS} value={tab} onChange={(t) => { setTab(t); reset() }} />

      <Section title="Filters" className="mb-5">
        {tab === 'ieee_cis_features' ? (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div><p className="mb-1.5 text-[12.5px] text-ink-400">Status</p>
              <div className="flex gap-1.5">{[['all', 'All'], ['fraud', 'Fraud'], ['normal', 'Normal']].map(([v, l]) => <button key={v} className={chip(fraud === v)} onClick={() => { setFraud(v); reset() }}>{l}</button>)}</div></div>
            <div><p className="mb-1.5 text-[12.5px] text-ink-400">Product code</p>
              <div className="flex gap-1.5">{(d?.meta.products || []).map((p) => <button key={p} className={chip(product.includes(p))} onClick={() => toggle(product, setProduct, p)}>{p}</button>)}</div></div>
            <div><p className="mb-1.5 text-[12.5px] text-ink-400">Amount ($) from / to</p>
              <div className="flex gap-2"><input className={inp} inputMode="decimal" placeholder={d?.meta.amtRange ? String(Math.floor(d.meta.amtRange[0])) : 'min'} value={amtMin} onChange={(e) => { setAmtMin(e.target.value); reset() }} />
                <input className={inp} inputMode="decimal" placeholder={d?.meta.amtRange ? String(Math.ceil(d.meta.amtRange[1])) : 'max'} value={amtMax} onChange={(e) => { setAmtMax(e.target.value); reset() }} /></div></div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div><p className="mb-1.5 text-[12.5px] text-ink-400">Label</p>
              <div className="flex gap-1.5">{(d?.meta.labels || []).map((l) => <button key={l} className={chip(labels.includes(l))} onClick={() => toggle(labels, setLabels, l)}>{l}</button>)}</div></div>
            <div><p className="mb-1.5 text-[12.5px] text-ink-400">Total degree from / to</p>
              <div className="flex gap-2"><input className={inp} inputMode="numeric" placeholder={d?.meta.degreeRange ? String(d.meta.degreeRange[0]) : 'min'} value={degMin} onChange={(e) => { setDegMin(e.target.value); reset() }} />
                <input className={inp} inputMode="numeric" placeholder={d?.meta.degreeRange ? String(d.meta.degreeRange[1]) : 'max'} value={degMax} onChange={(e) => { setDegMax(e.target.value); reset() }} /></div></div>
          </div>
        )}
      </Section>

      {q.isError && <Note tone="red">{q.error.message}</Note>}
      {d && (
        <Section title={`${num(d.meta.matchRows)} matching rows`} subtitle={`Of a ${num(d.meta.sampleRows)}-row saved sample. The full table has ${num(d.meta.totalRows)} rows.`}
          right={<div className="flex items-center gap-2 text-[13px] text-ink-300">
            {offset + 1}-{Math.min(offset + LIMIT, d.meta.matchRows)}
            <GhostButton icon={ChevronLeft} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} aria-label="Previous page" />
            <GhostButton icon={ChevronRight} disabled={offset + LIMIT >= d.meta.matchRows} onClick={() => setOffset(offset + LIMIT)} aria-label="Next page" />
          </div>}>
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-ink-900"><tr className="border-b border-ink-700/70 text-ink-400">{d.columns.map((c) => <th key={c} className="whitespace-nowrap py-2 pr-4 font-medium">{c}</th>)}</tr></thead>
              <tbody>{d.rows.map((r, i) => (
                <tr key={i} className="border-b border-ink-800/80">{r.map((v, j) => <td key={j} className="whitespace-nowrap py-1.5 pr-4 tabular-nums text-ink-100">{v === null ? <span className="text-ink-500">-</span> : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : String(v)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}
