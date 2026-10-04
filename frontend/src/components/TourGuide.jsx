import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, ChevronLeft, ChevronRight, Compass } from 'lucide-react'
import { cn } from '@/lib/utils'

// Guided walkthrough: moves through the app page by page with a short caption.
const STEPS = [
  { path: '/', title: 'Dashboard', text: 'Start here: overall fraud rate, validated model cards and live recent transactions. Model cards show random-split numbers — the honest time-aware results are later in the tour.' },
  { path: '/datasets', title: 'Datasets', text: 'The three datasets behind ApexFi: IEEE-CIS transactions, DGraph-Fin accounts and an Ethereum experiment, all in the Bronze → Silver → Gold pipeline.' },
  { path: '/eda', title: 'Exploratory analysis', text: 'Pick any feature: stats, a box plot, a scatter plot, class balance and a 21×21 correlation matrix, all from the real data.' },
  { path: '/analytics', title: 'Analytics', text: 'When fraud happens (hour/day), the fraud trend, and which graph links (shared device vs shared card) actually signal fraud.' },
  { path: '/investigate', title: 'Investigate', text: 'Open a real transaction, see its connected network, its risk score and the SHAP explanation of why it was scored that way.' },
  { path: '/score-new', title: 'Score a new transaction', text: 'Enter a transaction the model has never seen and get a live prediction with an explanation and its graph context.' },
  { path: '/score-account', title: 'Score an unlabeled account', text: 'DGraph-Fin has millions of genuinely unlabeled accounts. Score one and see signed SHAP reasons for the decision.' },
  { path: '/model-comparison', title: 'Time-series vs non-time-series', text: 'The same problem with a random split versus a chronological split. Toggle between the two and see why the realistic numbers are lower.' },
  { path: '/economics', title: 'Economic & SDG impact', text: 'Turns the confusion matrix into money with editable, clearly labeled assumptions, and links the work to SDGs 8, 16, 1 and 9.' },
  { path: '/temporal-full-report', title: 'Full evaluation report', text: 'Thresholds, SHAP, feature ablation, the hybrid-model fix and the database indexing speed-up (6.4 s → 0.14 s).' },
  { path: '/ask', title: 'Ask your data', text: 'Ask a question in plain English (or by voice) and get an answer from the real Gold layer.' },
]

export default function TourGuide() {
  const [step, setStep] = useState(-1) // -1 = closed
  const navigate = useNavigate()
  const location = useLocation()
  const open = step >= 0

  useEffect(() => {
    if (open && STEPS[step] && location.pathname !== STEPS[step].path) navigate(STEPS[step].path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const s = STEPS[step]

  if (!open) {
    return (
      <button
        onClick={() => setStep(0)}
        className="fixed z-40 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full shadow-lg bottom-5 left-5 bg-primary text-primary-foreground hover:scale-105 transition-transform"
      >
        <Compass size={16} /> Take a tour
      </button>
    )
  }

  return (
    <div className="fixed z-40 w-[340px] border shadow-2xl bottom-5 left-5 rounded-2xl border-border bg-card/95 backdrop-blur-xl">
      <div className="flex items-start gap-3 p-4">
        <img src="/images/apexfi-logo.png" alt="Guide" className="object-contain w-12 h-12 shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Step {step + 1} of {STEPS.length}</div>
          <div className="text-sm font-semibold font-display">{s.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
        </div>
        <button onClick={() => setStep(-1)} aria-label="Close tour" className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between px-4 pb-4">
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i === step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setStep((v) => Math.max(0, v - 1))}
            disabled={step === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border rounded-md border-border disabled:opacity-40 hover:bg-secondary"
          >
            <ChevronLeft size={12} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((v) => v + 1)} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground">
              Next <ChevronRight size={12} />
            </button>
          ) : (
            <button onClick={() => setStep(-1)} className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground">Finish</button>
          )}
        </div>
      </div>
    </div>
  )
}