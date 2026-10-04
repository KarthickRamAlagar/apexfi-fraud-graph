import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, Download, ShieldAlert, ShieldCheck, Info, Loader2 } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`)
  return data
}

async function downloadPdf({ kind, transactionId, payload }) {
  const res =
    kind === 'investigate'
      ? await fetch(`${API_BASE}/api/report/investigate/${encodeURIComponent(transactionId)}`)
      : await fetch(`${API_BASE}/api/report/new-transaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Could not generate the report.')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = kind === 'investigate' ? `apexfi-comparison-${transactionId}.pdf` : 'apexfi-comparison-new-transaction.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const MODES = [
  { key: 'both', label: 'Compare both' },
  { key: 'nonTimeSeries', label: 'Non-time-series' },
  { key: 'timeSeries', label: 'Time-series' },
]

const SHORT = {
  nonTimeSeries: { title: 'Non-time-series model', sub: 'Stacked LightGBM + GraphSAGE · 446 features · random split' },
  timeSeries: { title: 'Time-series model', sub: 'LightGBM · 7 features incl. rolling 1-hour history · chronological split' },
}

/**
 * Model toggle + side-by-side comparison for one input.
 *   kind="investigate": pass transactionId (e.g. "TX-2992212")
 *   kind="new":         pass payload (the exact object sent to /api/predict/new-transaction)
 * Both models are run on the SERVER on the same input; the PDF is also built
 * server-side, so the browser never supplies the numbers in the report.
 */
export default function ModelComparePanel({ kind, transactionId, payload }) {
  const [mode, setMode] = useState('both')
  const [pdfState, setPdfState] = useState({ busy: false, error: null })

  const enabled = kind === 'investigate' ? !!transactionId : !!payload
  const { data, error, isLoading } = useQuery({
    queryKey: ['model-compare', kind, kind === 'investigate' ? transactionId : JSON.stringify(payload)],
    queryFn: () =>
      kind === 'investigate'
        ? postJson(`/api/compare/investigate/${encodeURIComponent(transactionId)}`)
        : postJson('/api/compare/new', payload),
    enabled,
    retry: 1,
  })

  async function handleDownload() {
    setPdfState({ busy: true, error: null })
    try {
      await downloadPdf({ kind, transactionId, payload })
      setPdfState({ busy: false, error: null })
    } catch (e) {
      setPdfState({ busy: false, error: e.message })
    }
  }

  const keys = mode === 'both' ? ['nonTimeSeries', 'timeSeries'] : [mode]

  return (
    <Panel
      title="Model toggle & comparison"
      icon={GitCompare}
      headerAction={
        <button
          onClick={handleDownload}
          disabled={!data || pdfState.busy}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-40"
        >
          {pdfState.busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {pdfState.busy ? 'Building PDF…' : 'Download PDF report'}
        </button>
      }
    >
      <div className="inline-flex gap-1 p-1 mb-3 border rounded-lg border-border bg-secondary/30" role="tablist" aria-label="Model selection">
        {MODES.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              mode === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {pdfState.error && <p className="mb-2 text-xs text-risk-high">{pdfState.error}</p>}

      {isLoading && <p className="py-6 text-xs text-center text-muted-foreground">Running both models on this input…</p>}
      {error && <p className="py-6 text-xs text-center text-risk-high">Couldn't run the comparison: {error.message}</p>}

      {data && (
        <div className="space-y-3">
          {mode === 'both' && (
            <div className="grid grid-cols-2 gap-2">
              {['nonTimeSeries', 'timeSeries'].map((k) => (
                <SummaryTile key={k} title={SHORT[k].title} m={data.models[k]} />
              ))}
            </div>
          )}

          <div className="space-y-3">
            {keys.map((k) => (
              <ModelCard key={k} meta={SHORT[k]} m={data.models[k]} />
            ))}
          </div>

          {mode === 'both' && data.agreement && (
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-xs leading-relaxed',
                data.agreement.comparable && !data.agreement.agree ? 'bg-risk-medium/10 text-risk-medium' : 'bg-secondary/40 text-muted-foreground'
              )}
            >
              {data.agreement.note}
              {data.agreement.comparable && ` Score gap: ${(data.agreement.scoreGap * 100).toFixed(1)} points.`}
            </div>
          )}

          {data.window?.note && (
            <p className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info size={12} className="mt-0.5 shrink-0" /> {data.window.note}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The two models differ in architecture, features and training split, so their scores are not directly
            interchangeable. The time-series result is the more realistic guide to future performance.
          </p>
        </div>
      )}
    </Panel>
  )
}

function tone(score) {
  if (score >= 0.7) return 'high'
  if (score >= 0.3) return 'medium'
  return 'low'
}
const toneText = { high: 'text-risk-high', medium: 'text-risk-medium', low: 'text-risk-low' }
const toneBg = { high: 'bg-risk-high', medium: 'bg-risk-medium', low: 'bg-risk-low' }

function SummaryTile({ title, m }) {
  if (!m?.available) {
    return (
      <div className="p-2.5 text-center border rounded-lg border-border/60">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">Unavailable</div>
      </div>
    )
  }
  const t = tone(m.riskScore)
  return (
    <div className="p-2.5 text-center border rounded-lg border-border/60">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className={cn('mt-1 font-mono text-xl font-semibold tabular-nums', toneText[t])}>{Math.round(m.riskScore * 100)}%</div>
      <div className={cn('text-[11px] font-semibold', m.isFlagged ? 'text-risk-high' : 'text-risk-low')}>
        {m.isFlagged ? 'FLAGGED' : 'CLEAR'}
      </div>
    </div>
  )
}

function ModelCard({ meta, m }) {
  if (!m?.available) {
    return (
      <div className="p-3 border rounded-xl border-border/60">
        <div className="text-sm font-medium">{meta.title}</div>
        <p className="mt-2 text-xs text-muted-foreground">{m?.message || 'This model is unavailable.'}</p>
      </div>
    )
  }
  const t = tone(m.riskScore)
  const pct = Math.round(m.riskScore * 100)
  const feats = m.topContributingFeatures ?? []
  const maxAbs = Math.max(0.05, ...feats.map((f) => Math.abs(f.contribution)))

  return (
    <div className="p-3 border rounded-xl border-border/60">
      <div className="text-sm font-medium">{meta.title}</div>
      <div className="text-[11px] text-muted-foreground">{meta.sub}</div>

      <div className="flex items-center gap-3 mt-3">
        {m.isFlagged ? <ShieldAlert size={26} className="text-risk-high" /> : <ShieldCheck size={26} className="text-risk-low" />}
        <div>
          <div className={cn('font-display text-lg font-semibold', m.isFlagged ? 'text-risk-high' : 'text-risk-low')}>
            {m.isFlagged ? 'FLAGGED' : 'CLEAR'}
          </div>
          <div className="text-xs text-muted-foreground">threshold {Math.round(m.threshold * 100)}%</div>
        </div>
        <div className={cn('ml-auto shrink-0 pl-2 font-mono text-2xl font-semibold tabular-nums', toneText[t])}>{pct}%</div>
      </div>
      <div className="h-1.5 mt-2 overflow-hidden rounded-full bg-secondary">
        <div className={cn('h-full rounded-full', toneBg[t])} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>

      {m.realRollingFeatures && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Previous-hour history: {m.realRollingFeatures.card1_txn_count_1h} card txns · $
          {Math.round(m.realRollingFeatures.card1_amount_sum_1h).toLocaleString()} · {m.realRollingFeatures.device_txn_count_1h} device txns
        </p>
      )}

      <div className="mt-3 text-[11px] text-muted-foreground">Top reasons (SHAP) — red raises risk, green lowers it</div>
      <div className="mt-1 space-y-1">
        {feats.map((f) => (
          <div key={f.feature} className="grid grid-cols-[84px_minmax(0,1fr)_40px] items-center gap-2 text-[11px]">
            <span className="font-mono truncate" title={f.feature}>{f.feature}</span>
            <div className="relative h-2.5 rounded bg-secondary/50">
              <div className="absolute inset-y-0 w-px left-1/2 bg-border" />
              <div
                className={cn('absolute inset-y-0 rounded', f.contribution >= 0 ? 'bg-risk-high' : 'bg-risk-low')}
                style={
                  f.contribution >= 0
                    ? { left: '50%', width: `${(Math.abs(f.contribution) / maxAbs) * 50}%` }
                    : { right: '50%', width: `${(Math.abs(f.contribution) / maxAbs) * 50}%` }
                }
              />
            </div>
            <span className="font-mono text-right tabular-nums text-muted-foreground">{f.contribution >= 0 ? '+' : ''}{f.contribution.toFixed(2)}</span>
          </div>
        ))}
      </div>
      {m.thresholdNote && <p className="mt-2 text-[10px] text-muted-foreground">{m.thresholdNote}</p>}
    </div>
  )
}
