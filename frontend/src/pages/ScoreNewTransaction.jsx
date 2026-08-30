import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Sparkles, ShieldAlert, ShieldCheck, Share2, Receipt, CreditCard, MapPin, Smartphone, Hash, Activity, ArrowLeft, ArrowRight } from 'lucide-react'
import AnalyzingCard from '@/components/AnalyzingCard'
import NumberInput from '@/components/NumberInput'
import Stepper from '@/components/Stepper'
import TransactionGraph from '@/components/TransactionGraph'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const PRODUCT_CODES = ['W', 'C', 'R', 'H', 'S']
const CARD_NETWORKS = ['visa', 'mastercard', 'american express', 'discover']
const CARD_TYPES = ['debit', 'credit']
const DEVICE_TYPES = ['mobile', 'desktop']

const EMPTY_FORM = {
  transactionamt: '',
  productcd: 'W',
  card1: '',
  card2: '',
  card3: '',
  card4: '',
  card5: '',
  card6: '',
  addr1: '',
  addr2: '',
  p_emaildomain: '',
  r_emaildomain: '',
  devicetype: '',
  deviceinfo: '',
  c1: '', c2: '', c3: '', c4: '', c5: '', c6: '', c7: '',
  c8: '', c9: '', c10: '', c11: '', c12: '', c13: '', c14: '',
  id_02: '', id_11: '', id_14: '', id_17: '', id_19: '', id_20: '',
}

const LOADING_STEPS = [
  'Preparing features…',
  'Checking real graph connections…',
  'Running the fraud model…',
  'Generating explanation…',
]

const WIZARD_STEPS = [
  { label: 'Transaction', icon: Receipt },
  { label: 'Card Info', icon: CreditCard },
  { label: 'Address & Email', icon: MapPin },
  { label: 'Device', icon: Smartphone },
  { label: 'Counting Features', icon: Hash },
  { label: 'Telemetry', icon: Activity },
]

export default function ScoreNewTransaction() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [currentStep, setCurrentStep] = useState(0)

  const mutation = useMutation({
    mutationFn: (payload) => api.scoreNewTransaction(payload),
  })

  function goNext() {
    setCurrentStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }
  function goPrevious() {
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function toPayload() {
    const payload = { transactionamt: parseFloat(form.transactionamt), productcd: form.productcd }
    const numericFields = [
      'card1', 'card2', 'card3', 'card5', 'addr1', 'addr2',
      'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14',
      'id_02', 'id_11', 'id_14', 'id_17', 'id_19', 'id_20',
    ]
    const stringFields = ['card4', 'card6', 'p_emaildomain', 'r_emaildomain', 'devicetype', 'deviceinfo']
    for (const f of numericFields) {
      if (form[f] !== '') payload[f] = parseFloat(form[f])
    }
    for (const f of stringFields) {
      if (form[f] !== '') payload[f] = form[f]
    }
    return payload
  }

  function handleAnalyze() {
    if (!form.transactionamt || parseFloat(form.transactionamt) <= 0) return
    mutation.mutate(toPayload())
  }

  function handleScoreAnother() {
    setForm(EMPTY_FORM)
    setCurrentStep(0)
    mutation.reset()
  }

  function handleLoadExample() {
    // Real confirmed values from TX-2987781 (a real historical fraud
    // case) — only fields with values actually confirmed via direct
    // database comparison are filled in; nothing here is invented.
    // Still passes through the REAL pipeline when Analyze is clicked.
    setForm({
      ...EMPTY_FORM,
      transactionamt: '10',
      productcd: 'S',
      card1: '8732',
      card2: '360',
      card3: '150',
      card4: 'mastercard',
      card5: '229',
      card6: 'debit',
      addr1: '441',
      addr2: '87',
      r_emaildomain: 'gmail.com',
      devicetype: 'mobile',
      deviceinfo: 'KFFOWI Build/LVY48F',
      c1: '35', c2: '29', c4: '21', c8: '38', c10: '58', c11: '24', c13: '54',
      id_02: '36004', id_11: '100', id_14: '-300', id_17: '166', id_19: '397', id_20: '161',
    })
    setCurrentStep(0)
    mutation.reset()
  }

  const result = mutation.data

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="mb-1 text-xs tracking-wider uppercase text-muted-foreground">ApexFi / Score New Transaction</div>
      <h1 className="text-2xl font-semibold font-display">Score New Transaction</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Real inference on a transaction not in the training data — LightGBM, GNN, and real matched
        neighbors, combined through the real stacking model. Nothing here is hardcoded or simulated.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[140px_1fr_380px]">
        <Panel className="hidden lg:block">
          <Stepper steps={WIZARD_STEPS} currentStep={currentStep} vertical />
        </Panel>

        <Panel
          title="Transaction Details"
          icon={Sparkles}
          headerAction={
            <button
              onClick={handleLoadExample}
              disabled={mutation.isPending}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Load Example
            </button>
          }
        >
          {/* stepper shown inline on smaller screens where the 3-column layout collapses */}
          <div className="mb-5 lg:hidden">
            <Stepper steps={WIZARD_STEPS} currentStep={currentStep} vertical />
          </div>

          <div className="min-h-[220px] space-y-5">
            {currentStep === 0 && (
              <FieldGroup title="Transaction">
                <Field label="Amount (₹)" required>
                  <NumberInput
                    step={0.01}
                    value={form.transactionamt}
                    onChange={(v) => update('transactionamt', v)}
                    placeholder="e.g. 750.00"
                  />
                </Field>
                <Field label="Product Code" required>
                  <select value={form.productcd} onChange={(e) => update('productcd', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50">
                    {PRODUCT_CODES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Field>
              </FieldGroup>
            )}

            {currentStep === 1 && (
              <FieldGroup title="Card Information">
                <Field label="Card1"><NumberInput value={form.card1} onChange={(v) => update('card1', v)} /></Field>
                <Field label="Card2"><NumberInput value={form.card2} onChange={(v) => update('card2', v)} /></Field>
                <Field label="Card3"><NumberInput value={form.card3} onChange={(v) => update('card3', v)} /></Field>
                <Field label="Network">
                  <select value={form.card4} onChange={(e) => update('card4', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="">Unknown</option>
                    {CARD_NETWORKS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Card5"><NumberInput value={form.card5} onChange={(v) => update('card5', v)} /></Field>
                <Field label="Type">
                  <select value={form.card6} onChange={(e) => update('card6', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="">Unknown</option>
                    {CARD_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </FieldGroup>
            )}

            {currentStep === 2 && (
              <>
                <FieldGroup title="Address">
                  <Field label="Addr1"><NumberInput value={form.addr1} onChange={(v) => update('addr1', v)} /></Field>
                  <Field label="Addr2"><NumberInput value={form.addr2} onChange={(v) => update('addr2', v)} /></Field>
                </FieldGroup>
                <FieldGroup title="Email">
                  <Field label="Purchaser email domain"><input value={form.p_emaildomain} onChange={(e) => update('p_emaildomain', e.target.value)} placeholder="e.g. gmail.com" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
                  <Field label="Recipient email domain"><input value={form.r_emaildomain} onChange={(e) => update('r_emaildomain', e.target.value)} placeholder="optional" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
                </FieldGroup>
              </>
            )}

            {currentStep === 3 && (
              <FieldGroup title="Device">
                <Field label="Device Type">
                  <select value={form.devicetype} onChange={(e) => update('devicetype', e.target.value)} className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="">Unknown</option>
                    {DEVICE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Device Info"><input value={form.deviceinfo} onChange={(e) => update('deviceinfo', e.target.value)} placeholder="e.g. SM-G950U Build/R16NW" className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" /></Field>
              </FieldGroup>
            )}

            {currentStep === 4 && (
              <div>
                <div className="mb-2 text-xs font-medium tracking-wide uppercase text-muted-foreground">
                  Counting Features (C1–C14)
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Real behavioral counts (e.g. addresses/emails associated with this card) — exact
                  per-field definitions aren't publicly documented by the source dataset, but a real
                  production system would have these. Optional; improves accuracy when known.
                </p>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
                  {['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14'].map((f) => (
                    <Field key={f} label={f.toUpperCase()}>
                      <NumberInput value={form[f]} onChange={(v) => update(f, v)} />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div>
                <div className="mb-2 text-xs font-medium tracking-wide uppercase text-muted-foreground">
                  Device Telemetry
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Numeric session/device signals a real system would capture at transaction time. Optional.
                </p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {['id_02', 'id_11', 'id_14', 'id_17', 'id_19', 'id_20'].map((f) => (
                    <Field key={f} label={f}>
                      <NumberInput value={form[f]} onChange={(v) => update(f, v)} />
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-5 mt-6 border-t border-border/60">
            <button
              onClick={goPrevious}
              disabled={currentStep === 0 || mutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={14} /> Previous
            </button>

            {currentStep < WIZARD_STEPS.length - 1 ? (
              <button
                onClick={goNext}
                disabled={currentStep === 0 && !form.transactionamt}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleAnalyze}
                disabled={mutation.isPending || !form.transactionamt}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mutation.isPending ? 'Analyzing…' : 'Analyze Transaction'}
              </button>
            )}
          </div>

          {result && result.graphContext.hop1Neighbors > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-5 mt-6 border-t border-border/60"
            >
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
                <Share2 size={15} className="text-muted-foreground" />
                Connected Network
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                This transaction (center) connected to its real matched existing neighbors.
              </p>
              <div className="flex justify-center overflow-hidden">
                <TransactionGraph
                  center={{ id: 'TX-NEW', amount: form.transactionamt ? `₹${form.transactionamt}` : '—' }}
                  neighbors={result.graphContext.matchedNeighbors ?? []}
                  onSelectNode={() => {}}
                />
              </div>
            </motion.div>
          )}
        </Panel>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {mutation.isPending && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Panel>
                  <AnalyzingCard steps={LOADING_STEPS} />
                </Panel>
              </motion.div>
            )}

            {mutation.isError && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Panel title="Unable to Score">
                  <p className="text-sm text-risk-high">
                    {mutation.error?.message || 'Unable to score this transaction.'}
                  </p>
                </Panel>
              </motion.div>
            )}

            {result && !mutation.isPending && (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <Panel title="Prediction" icon={result.isFlagged ? ShieldAlert : ShieldCheck}>
                  <ResultPanel result={result} />
                </Panel>
                <Panel title="Graph Context" icon={Share2}>
                  <GraphContextPanel graphContext={result.graphContext} />
                </Panel>
                <button
                  onClick={handleScoreAnother}
                  className="w-full rounded-lg border border-border py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Score Another Transaction
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!result && !mutation.isPending && !mutation.isError && (
            <Panel title="Result">
              <p className="py-8 text-sm text-center text-muted-foreground">
                Fill in the form and click Analyze Transaction to see a real prediction.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function FieldGroup({ title, children }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium tracking-wide uppercase text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block mb-1 text-xs text-muted-foreground">
        {label}{required && <span className="text-risk-high"> *</span>}
      </span>
      {children}
    </label>
  )
}

function riskTone(score) {
  if (score >= 0.7) return 'high'
  if (score >= 0.3) return 'medium'
  return 'low'
}
const toneText = { high: 'text-risk-high', medium: 'text-risk-medium', low: 'text-risk-low' }
const toneBorder = { high: 'border-risk-high/40', medium: 'border-risk-medium/40', low: 'border-risk-low/40' }

function ResultPanel({ result }) {
  const tone = riskTone(result.riskScore)
  const pct = Math.round(result.riskScore * 100)
  const chartData = result.topContributingFeatures.map((f) => ({ name: f.feature, contribution: f.contribution }))

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-secondary/40 px-3 py-1.5 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        Live inference — previously unseen transaction, not in training data
      </div>

      <div className={cn('flex items-center gap-4 rounded-xl border p-4', toneBorder[tone])}>
        <div className="flex-1">
          <div className={cn('font-display text-3xl font-semibold', toneText[tone])}>
            {result.isFlagged ? 'FRAUD' : 'LEGITIMATE'}
          </div>
          <div className={cn('mt-1 text-lg font-semibold tabular-nums', toneText[tone])}>{pct}% fraud risk</div>
          <div className="text-xs text-muted-foreground">threshold {Math.round(result.threshold * 100)}%</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs text-muted-foreground">Model breakdown</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary/40 p-2.5 text-center">
            <div className="font-mono text-sm tabular-nums">{Math.round(result.componentScores.lightgbm * 100)}%</div>
            <div className="text-[10px] uppercase text-muted-foreground">LightGBM</div>
          </div>
          <div className="rounded-lg bg-secondary/40 p-2.5 text-center">
            <div className="font-mono text-sm tabular-nums">{Math.round(result.componentScores.gnn * 100)}%</div>
            <div className="text-[10px] uppercase text-muted-foreground">GNN</div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs text-muted-foreground">Why? (SHAP — real, per-prediction)</div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={80} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [v.toFixed(3), 'Contribution']}
              />
              <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.contribution >= 0 ? 'hsl(var(--risk-high))' : 'hsl(var(--risk-low))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="pt-3 text-xs leading-relaxed border-t border-border/60 text-muted-foreground">
        {result.modelInfo.note}
      </p>
    </div>
  )
}

function GraphContextPanel({ graphContext }) {
  if (graphContext.hop1Neighbors === 0) {
    return <p className="py-4 text-sm text-center text-muted-foreground">No matching graph relationships found — no existing transactions share this card or device.</p>
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Real matched existing transactions</span>
        <span className="font-mono text-primary">{graphContext.hop1Neighbors}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Their own connections (2-hop)</span>
        <span className="font-mono text-risk-medium">{graphContext.hop2Neighbors}</span>
      </div>
      {graphContext.matchedTransactionIds.length > 0 && (
        <div className="pt-2">
          <div className="mb-1 text-xs text-muted-foreground">Matched via shared card/device:</div>
          <div className="flex flex-wrap gap-1.5">
            {graphContext.matchedTransactionIds.slice(0, 8).map((id) => (
              <span key={id} className="rounded-md bg-secondary/40 px-2 py-0.5 font-mono text-[10px]">{id}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}