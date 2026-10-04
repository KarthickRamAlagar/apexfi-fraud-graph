// // import { useEffect, useState } from 'react'
// // import { useLocation, useNavigate } from 'react-router-dom'
// // import { X, ChevronLeft, ChevronRight } from 'lucide-react'
// // import { cn } from '@/lib/utils'

// // // Guided walkthrough: moves through the app page by page with a short caption.
// // const STEPS = [
// //   { path: '/', title: 'Dashboard', text: 'Start here: overall fraud rate, validated model cards and live recent transactions. Model cards show random-split numbers — the honest time-aware results are later in the tour.' },
// //   { path: '/datasets', title: 'Datasets', text: 'The three datasets behind ApexFi: IEEE-CIS transactions, DGraph-Fin accounts and an Ethereum experiment, all in the Bronze → Silver → Gold pipeline.' },
// //   { path: '/eda', title: 'Exploratory analysis', text: 'Pick any feature: stats, a box plot, a scatter plot, class balance and a 21×21 correlation matrix, all from the real data.' },
// //   { path: '/analytics', title: 'Analytics', text: 'When fraud happens (hour/day), the fraud trend, and which graph links (shared device vs shared card) actually signal fraud.' },
// //   { path: '/investigate', title: 'Investigate', text: 'Open a real transaction, see its connected network, its risk score and the SHAP explanation of why it was scored that way.' },
// //   { path: '/score-new', title: 'Score a new transaction', text: 'Enter a transaction the model has never seen and get a live prediction with an explanation and its graph context.' },
// //   { path: '/score-account', title: 'Score an unlabeled account', text: 'DGraph-Fin has millions of genuinely unlabeled accounts. Score one and see signed SHAP reasons for the decision.' },
// //   { path: '/model-comparison', title: 'Time-series vs non-time-series', text: 'The same problem with a random split versus a chronological split. Toggle between the two and see why the realistic numbers are lower.' },
// //   { path: '/economics', title: 'Economic & SDG impact', text: 'Turns the confusion matrix into money with editable, clearly labeled assumptions, and then scales the measured rates to a daily volume you choose (slider) to show what they would mean for SDGs 16, 8, 1 and 9.' },
// //   { path: '/temporal-full-report', title: 'Full evaluation report', text: 'Thresholds, SHAP, feature ablation, the hybrid-model fix and the database indexing speed-up (6.4 s → 0.14 s).' },
// //   { path: '/about', title: 'About', text: 'The whole story on one page: problem, data, pipeline, models, security measures, limitations and what is still planned.' },
// //   { path: '/ask', title: 'Ask your data', text: 'Ask a question in plain English (or by voice) and get an answer from the real Gold layer.' },
// // ]

// // const SEEN_KEY = 'apexfi_tour_seen'
// // export const START_TOUR_EVENT = 'apexfi:start-tour'

// // function hasSeenTour() {
// //   try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
// // }
// // function markTourSeen() {
// //   try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode: just ask again next visit */ }
// // }

// // // Small original mascot (inline SVG, no image file needed).
// // function Mascot({ size = 64 }) {
// //   return (
// //     <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="ApexFi guide">
// //       <line x1="32" y1="6" x2="32" y2="14" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
// //       <circle cx="32" cy="5" r="3.5" fill="hsl(var(--primary))" />
// //       <rect x="10" y="14" width="44" height="34" rx="12" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="3" />
// //       <rect x="16" y="22" width="32" height="18" rx="8" fill="hsl(var(--background))" />
// //       <circle cx="25" cy="31" r="4" fill="hsl(var(--primary))" />
// //       <circle cx="39" cy="31" r="4" fill="hsl(var(--primary))" />
// //       <circle cx="26.2" cy="29.8" r="1.2" fill="#fff" />
// //       <circle cx="40.2" cy="29.8" r="1.2" fill="#fff" />
// //       <path d="M26 44 Q32 48 38 44" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" strokeLinecap="round" />
// //       <rect x="4" y="26" width="5" height="12" rx="2.5" fill="hsl(var(--primary))" />
// //       <rect x="55" y="26" width="5" height="12" rx="2.5" fill="hsl(var(--primary))" />
// //       <rect x="20" y="50" width="24" height="9" rx="4" fill="hsl(var(--primary))" opacity="0.85" />
// //     </svg>
// //   )
// // }

// // export default function TourGuide() {
// //   const [step, setStep] = useState(-1) // -1 = tour closed
// //   const [askOpen, setAskOpen] = useState(false)
// //   const navigate = useNavigate()
// //   const location = useLocation()
// //   const open = step >= 0

// //   // First visit only: after a short pause, the guide asks if you want the tour.
// //   useEffect(() => {
// //     if (hasSeenTour()) return
// //     const t = setTimeout(() => setAskOpen(true), 1200)
// //     return () => clearTimeout(t)
// //   }, [])

// //   // Lets other parts of the app (More menu, About page) start the tour on demand.
// //   useEffect(() => {
// //     const start = () => { setAskOpen(false); setStep(0) }
// //     window.addEventListener(START_TOUR_EVENT, start)
// //     return () => window.removeEventListener(START_TOUR_EVENT, start)
// //   }, [])

// //   useEffect(() => {
// //     if (open && STEPS[step] && location.pathname !== STEPS[step].path) navigate(STEPS[step].path)
// //     // eslint-disable-next-line react-hooks/exhaustive-deps
// //   }, [step])

// //   function answer(startNow) {
// //     markTourSeen()
// //     setAskOpen(false)
// //     if (startNow) setStep(0)
// //   }
// //   function closeTour() {
// //     markTourSeen()
// //     setStep(-1)
// //   }

// //   const s = STEPS[step]

// //   if (!open) {
// //     if (!askOpen) return null
// //     return (
// //       <div className="fixed z-40 flex items-start gap-2 top-20 right-6 animate-in fade-in slide-in-from-top-2" role="dialog" aria-label="Application tour">
// //         <div className="relative w-[280px] rounded-2xl rounded-tr-sm border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
// //           <button onClick={() => answer(false)} aria-label="Dismiss" className="absolute text-muted-foreground top-2 right-2 hover:text-foreground">
// //             <X size={14} />
// //           </button>
// //           <div className="text-sm font-semibold font-display">Hi, I'm Apex!</div>
// //           <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
// //             New here? Shall I show you around ApexFi? It takes about two minutes and I'll open each page for you.
// //           </p>
// //           <div className="flex gap-2 mt-3">
// //             <button onClick={() => answer(true)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90">
// //               Yes, show me around
// //             </button>
// //             <button onClick={() => answer(false)} className="px-3 py-1.5 text-xs border rounded-md border-border text-muted-foreground hover:bg-secondary">
// //               Maybe later
// //             </button>
// //           </div>
// //           <p className="mt-2 text-[10px] text-muted-foreground">You can start it any time from More → Application Tour.</p>
// //         </div>
// //         <div className="shrink-0 drop-shadow-lg"><Mascot /></div>
// //       </div>
// //     )
// //   }

// //   return (
// //     <div className="fixed z-40 w-[340px] border shadow-2xl top-20 right-6 rounded-2xl border-border bg-card/95 backdrop-blur-xl">
// //       <div className="flex items-start gap-3 p-4">
// //         <div className="shrink-0"><Mascot size={44} /></div>
// //         <div className="min-w-0">
// //           <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Step {step + 1} of {STEPS.length}</div>
// //           <div className="text-sm font-semibold font-display">{s.title}</div>
// //           <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
// //         </div>
// //         <button onClick={closeTour} aria-label="Close tour" className="text-muted-foreground hover:text-foreground">
// //           <X size={16} />
// //         </button>
// //       </div>
// //       <div className="flex items-center justify-between px-4 pb-4">
// //         <div className="flex gap-1">
// //           {STEPS.map((_, i) => (
// //             <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i === step ? 'bg-primary' : 'bg-border')} />
// //           ))}
// //         </div>
// //         <div className="flex gap-2">
// //           <button
// //             onClick={() => setStep((v) => Math.max(0, v - 1))}
// //             disabled={step === 0}
// //             className="flex items-center gap-1 px-2.5 py-1 text-xs border rounded-md border-border disabled:opacity-40 hover:bg-secondary"
// //           >
// //             <ChevronLeft size={12} /> Back
// //           </button>
// //           {step < STEPS.length - 1 ? (
// //             <button onClick={() => setStep((v) => v + 1)} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground">
// //               Next <ChevronRight size={12} />
// //             </button>
// //           ) : (
// //             <button onClick={closeTour} className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground">Finish</button>
// //           )}
// //         </div>
// //       </div>
// //     </div>
// //   )
// // }


// import { useEffect, useState } from 'react'
// import { useLocation, useNavigate } from 'react-router-dom'
// import { X, ChevronLeft, ChevronRight } from 'lucide-react'
// import { cn } from '@/lib/utils'

// // Guided walkthrough: moves through the app page by page with a short caption.
// const STEPS = [
//   { path: '/', title: 'Dashboard', text: 'Start here: overall fraud rate, validated model cards and live recent transactions. Model cards show random-split numbers — the honest time-aware results are later in the tour.' },
//   { path: '/datasets', title: 'Datasets', text: 'The three datasets behind ApexFi: IEEE-CIS transactions, DGraph-Fin accounts and an Ethereum experiment, all in the Bronze → Silver → Gold pipeline.' },
//   { path: '/eda', title: 'Exploratory analysis', text: 'Pick any feature: stats, a box plot, a scatter plot, class balance and a 21×21 correlation matrix, all from the real data.' },
//   { path: '/analytics', title: 'Analytics', text: 'When fraud happens (hour/day), the fraud trend, and which graph links (shared device vs shared card) actually signal fraud.' },
//   { path: '/investigate', title: 'Investigate', text: 'Open a real transaction, see its connected network, its risk score and the SHAP explanation of why it was scored that way.' },
//   { path: '/score-new', title: 'Score a new transaction', text: 'Enter a transaction the model has never seen and get a live prediction with an explanation and its graph context.' },
//   { path: '/score-account', title: 'Score an unlabeled account', text: 'DGraph-Fin has millions of genuinely unlabeled accounts. Score one and see signed SHAP reasons for the decision.' },
//   { path: '/model-comparison', title: 'Time-series vs non-time-series', text: 'The same problem with a random split versus a chronological split. Toggle between the two and see why the realistic numbers are lower.' },
//   { path: '/economics', title: 'Economic & SDG impact', text: 'Turns the confusion matrix into money with editable, clearly labeled assumptions, and then scales the measured rates to a daily volume you choose (slider) to show what they would mean for SDGs 16, 8, 1 and 9.' },
//   { path: '/temporal-full-report', title: 'Full evaluation report', text: 'Thresholds, SHAP, feature ablation, the hybrid-model fix and the database indexing speed-up (6.4 s → 0.14 s).' },
//   { path: '/about', title: 'About', text: 'The whole story on one page: problem, data, pipeline, models, security measures, limitations and what is still planned.' },
//   { path: '/ask', title: 'Ask your data', text: 'Ask a question in plain English (or by voice) and get an answer from the real Gold layer.' },
// ]

// const SEEN_KEY = 'apexfi_tour_seen'
// export const START_TOUR_EVENT = 'apexfi:start-tour'

// function hasSeenTour() {
//   try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
// }
// function markTourSeen() {
//   try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode: just ask again next visit */ }
// }

// // The guide's face. Put your own character artwork at  frontend/public/images/guide.png
// // (a transparent PNG works best). If that file is missing, the built-in robot is shown instead.
// function GuideAvatar({ size = 64 }) {
//   const [failed, setFailed] = useState(false)
//   if (failed) return <Mascot size={size} />
//   return (
//     <img
//       src="/images/guide.png"
//       alt="ApexFi guide"
//       width={size}
//       height={size}
//       onError={() => setFailed(true)}
//       className="object-cover rounded-full ring-2 ring-primary/60"
//       style={{ width: size, height: size }}
//     />
//   )
// }

// // Small original mascot (inline SVG, fallback when no guide.png exists).
// function Mascot({ size = 64 }) {
//   return (
//     <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="ApexFi guide">
//       <line x1="32" y1="6" x2="32" y2="14" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
//       <circle cx="32" cy="5" r="3.5" fill="hsl(var(--primary))" />
//       <rect x="10" y="14" width="44" height="34" rx="12" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="3" />
//       <rect x="16" y="22" width="32" height="18" rx="8" fill="hsl(var(--background))" />
//       <circle cx="25" cy="31" r="4" fill="hsl(var(--primary))" />
//       <circle cx="39" cy="31" r="4" fill="hsl(var(--primary))" />
//       <circle cx="26.2" cy="29.8" r="1.2" fill="#fff" />
//       <circle cx="40.2" cy="29.8" r="1.2" fill="#fff" />
//       <path d="M26 44 Q32 48 38 44" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" strokeLinecap="round" />
//       <rect x="4" y="26" width="5" height="12" rx="2.5" fill="hsl(var(--primary))" />
//       <rect x="55" y="26" width="5" height="12" rx="2.5" fill="hsl(var(--primary))" />
//       <rect x="20" y="50" width="24" height="9" rx="4" fill="hsl(var(--primary))" opacity="0.85" />
//     </svg>
//   )
// }

// export default function TourGuide() {
//   const [step, setStep] = useState(-1) // -1 = tour closed
//   const [askOpen, setAskOpen] = useState(false)
//   const [pointFailed, setPointFailed] = useState(false)
//   const navigate = useNavigate()
//   const location = useLocation()
//   const open = step >= 0

//   // First visit only: after a short pause, the guide asks if you want the tour.
//   useEffect(() => {
//     if (hasSeenTour()) return
//     const t = setTimeout(() => setAskOpen(true), 1200)
//     return () => clearTimeout(t)
//   }, [])

//   // Lets other parts of the app (More menu, About page) start the tour on demand.
//   useEffect(() => {
//     const start = () => { setAskOpen(false); setStep(0) }
//     window.addEventListener(START_TOUR_EVENT, start)
//     return () => window.removeEventListener(START_TOUR_EVENT, start)
//   }, [])

//   useEffect(() => {
//     if (open && STEPS[step] && location.pathname !== STEPS[step].path) navigate(STEPS[step].path)
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [step])

//   function answer(startNow) {
//     markTourSeen()
//     setAskOpen(false)
//     if (startNow) setStep(0)
//   }
//   function closeTour() {
//     markTourSeen()
//     setStep(-1)
//   }

//   const s = STEPS[step]

//   if (!open) {
//     if (!askOpen) return null
//     return (
//       <div className="fixed z-40 flex items-end pointer-events-none top-20 right-6 animate-in fade-in slide-in-from-top-2" role="dialog" aria-label="Application tour">
//         <div className="relative order-2 pointer-events-auto w-[290px] shrink-0 rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
//           <button onClick={() => answer(false)} aria-label="Dismiss" className="absolute text-muted-foreground top-2 right-2 hover:text-foreground">
//             <X size={14} />
//           </button>
//           <div className="text-sm font-semibold font-display">Namaste! I'm your ApexFi guide.</div>
//           <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
//             New here? Shall I show you around ApexFi? It takes about two minutes and I'll open each page for you.
//           </p>
//           <div className="flex gap-2 mt-3">
//             <button onClick={() => answer(true)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90">
//               Yes, show me around
//             </button>
//             <button onClick={() => answer(false)} className="px-3 py-1.5 text-xs border rounded-md border-border text-muted-foreground hover:bg-secondary">
//               Maybe later
//             </button>
//           </div>
//           <p className="mt-2 text-[10px] text-muted-foreground">You can start it any time from More → Application Tour.</p>
//           <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
//             Guide character inspired by Dr. P. V. Narasimha Rao, who led India's 1991 economic reforms.
//           </p>
//         </div>
//         {/* The guide stands to the left of the bubble, pointing at it. Artwork: frontend/public/images/guide-point.png */}
//         {!pointFailed && (
//           <img
//             src="/images/guide-point.png"
//             alt=""
//             aria-hidden="true"
//             onError={() => setPointFailed(true)}
//             className="relative z-10 order-1 -mr-5 w-[320px] max-w-none shrink-0 select-none drop-shadow-xl"
//             draggable={false}
//           />
//         )}
//       </div>
//     )
//   }

//   const withGuide = !pointFailed // guide artwork present -> reserve space for him on the left

//   return (
//     <div className={cn(
//       'fixed z-40 border shadow-2xl top-20 right-6 rounded-2xl border-border bg-card/95 backdrop-blur-xl',
//       withGuide ? 'w-[540px] max-w-[calc(100vw-3rem)] min-h-[210px]' : 'w-[340px]'
//     )}>
//       {/* The guide stands in the reserved left column, pointing at the text. Artwork: public/images/guide-point.png */}
//       {withGuide && (
//         <img
//           src="/images/guide-point.png"
//           alt=""
//           aria-hidden="true"
//           onError={() => setPointFailed(true)}
//           className="absolute bottom-0 -left-8 w-[250px] max-w-none select-none pointer-events-none drop-shadow-xl"
//           draggable={false}
//         />
//       )}
//       <div className={cn('flex flex-col h-full min-h-[210px] p-4', withGuide && 'pl-[210px]')}>
//         <div className="flex items-start gap-3">
//           {!withGuide && <div className="shrink-0"><GuideAvatar size={48} /></div>}
//           <div className="min-w-0">
//             <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Step {step + 1} of {STEPS.length}</div>
//             <div className="text-sm font-semibold font-display">{s.title}</div>
//             <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
//           </div>
//           <button onClick={closeTour} aria-label="Close tour" className="ml-auto text-muted-foreground hover:text-foreground">
//             <X size={16} />
//           </button>
//         </div>
//         <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-auto">
//           <div className="flex gap-1">
//             {STEPS.map((_, i) => (
//               <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i === step ? 'bg-primary' : 'bg-border')} />
//             ))}
//           </div>
//           <div className="flex gap-2">
//             <button
//               onClick={() => setStep((v) => Math.max(0, v - 1))}
//               disabled={step === 0}
//               className="flex items-center gap-1 px-2.5 py-1 text-xs border rounded-md border-border disabled:opacity-40 hover:bg-secondary"
//             >
//               <ChevronLeft size={12} /> Back
//             </button>
//             {step < STEPS.length - 1 ? (
//               <button onClick={() => setStep((v) => v + 1)} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground">
//                 Next <ChevronRight size={12} />
//               </button>
//             ) : (
//               <button onClick={closeTour} className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground">Finish</button>
//             )}
//           </div>
//         </div>
//       </div>
//     </div>
//   )
// }


import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
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
  { path: '/economics', title: 'Economic & SDG impact', text: 'Turns the confusion matrix into money with editable, clearly labeled assumptions, and then scales the measured rates to a daily volume you choose (slider) to show what they would mean for SDGs 16, 8, 1 and 9.' },
  { path: '/temporal-full-report', title: 'Full evaluation report', text: 'Thresholds, SHAP, feature ablation, the hybrid-model fix and the database indexing speed-up (6.4 s → 0.14 s).' },
  { path: '/about', title: 'About', text: 'The whole story on one page: problem, data, pipeline, models, security measures, limitations and what is still planned.' },
  { path: '/ask', title: 'Ask your data', text: 'Ask a question in plain English (or by voice) and get an answer from the real Gold layer.' },
]

const SEEN_KEY = 'apexfi_tour_seen'
export const START_TOUR_EVENT = 'apexfi:start-tour'

function hasSeenTour() {
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}
function markTourSeen() {
  try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode: just ask again next visit */ }
}

// The guide's face. Put your own character artwork at  frontend/public/images/guide.png
// (a transparent PNG works best). If that file is missing, the built-in robot is shown instead.
function GuideAvatar({ size = 64 }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Mascot size={size} />
  return (
    <img
      src="/images/guide.png"
      alt="ApexFi guide"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="object-cover rounded-full ring-2 ring-primary/60"
      style={{ width: size, height: size }}
    />
  )
}

// Small original mascot (inline SVG, fallback when no guide.png exists).
function Mascot({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="ApexFi guide">
      <line x1="32" y1="6" x2="32" y2="14" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="5" r="3.5" fill="hsl(var(--primary))" />
      <rect x="10" y="14" width="44" height="34" rx="12" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="3" />
      <rect x="16" y="22" width="32" height="18" rx="8" fill="hsl(var(--background))" />
      <circle cx="25" cy="31" r="4" fill="hsl(var(--primary))" />
      <circle cx="39" cy="31" r="4" fill="hsl(var(--primary))" />
      <circle cx="26.2" cy="29.8" r="1.2" fill="#fff" />
      <circle cx="40.2" cy="29.8" r="1.2" fill="#fff" />
      <path d="M26 44 Q32 48 38 44" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="4" y="26" width="5" height="12" rx="2.5" fill="hsl(var(--primary))" />
      <rect x="55" y="26" width="5" height="12" rx="2.5" fill="hsl(var(--primary))" />
      <rect x="20" y="50" width="24" height="9" rx="4" fill="hsl(var(--primary))" opacity="0.85" />
    </svg>
  )
}

export default function TourGuide() {
  const [step, setStep] = useState(-1) // -1 = tour closed
  const [askOpen, setAskOpen] = useState(false)
  const [pointFailed, setPointFailed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const open = step >= 0

  // First visit only: after a short pause, the guide asks if you want the tour.
  useEffect(() => {
    if (hasSeenTour()) return
    const t = setTimeout(() => setAskOpen(true), 1200)
    return () => clearTimeout(t)
  }, [])

  // Lets other parts of the app (More menu, About page) start the tour on demand.
  useEffect(() => {
    const start = () => { setAskOpen(false); setStep(0) }
    window.addEventListener(START_TOUR_EVENT, start)
    return () => window.removeEventListener(START_TOUR_EVENT, start)
  }, [])

  useEffect(() => {
    if (open && STEPS[step] && location.pathname !== STEPS[step].path) navigate(STEPS[step].path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function answer(startNow) {
    markTourSeen()
    setAskOpen(false)
    if (startNow) setStep(0)
  }
  function closeTour() {
    markTourSeen()
    setStep(-1)
  }

  const s = STEPS[step]

  if (!open) {
    if (!askOpen) return null
    return (
      <div className="fixed z-40 flex items-end pointer-events-none top-20 right-6 animate-in fade-in slide-in-from-top-2" role="dialog" aria-label="Application tour">
        <div className="relative order-2 pointer-events-auto w-[290px] shrink-0 rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
          <button onClick={() => answer(false)} aria-label="Dismiss" className="absolute text-muted-foreground top-2 right-2 hover:text-foreground">
            <X size={14} />
          </button>
          <div className="text-sm font-semibold font-display">Namaste! I'm your ApexFi guide.</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            New here? Shall I show you around ApexFi? It takes about two minutes and I'll open each page for you.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => answer(true)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90">
              Yes, show me around
            </button>
            <button onClick={() => answer(false)} className="px-3 py-1.5 text-xs border rounded-md border-border text-muted-foreground hover:bg-secondary">
              Maybe later
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">You can start it any time from More → Application Tour.</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Guide character inspired by Dr. P. V. Narasimha Rao, who led India's 1991 economic reforms.
          </p>
        </div>
        {/* The guide stands to the left of the bubble, pointing at it. Artwork: frontend/public/images/guide-point.png */}
        {!pointFailed && (
          <img
            src="/images/guide-point.png"
            alt=""
            aria-hidden="true"
            onError={() => setPointFailed(true)}
            className="relative z-10 order-1 -mr-3 h-[250px] w-auto max-w-none shrink-0 select-none drop-shadow-xl"
            draggable={false}
          />
        )}
      </div>
    )
  }

  const withGuide = !pointFailed // guide artwork present -> he gets his own column inside the card

  return (
    <div className={cn(
      'fixed z-40 flex overflow-hidden border shadow-2xl top-20 right-6 rounded-2xl border-border bg-card/95 backdrop-blur-xl',
      withGuide ? 'w-[560px] max-w-[calc(100vw-3rem)]' : 'w-[340px]'
    )}>
      {/* The guide stands inside the card, bottom-left, pointing at the text. Artwork: public/images/guide-point.png */}
      {withGuide && (
        <img
          src="/images/guide-point.png"
          alt=""
          aria-hidden="true"
          onError={() => setPointFailed(true)}
          className="self-end h-[230px] w-auto max-w-[230px] ml-3 shrink-0 select-none pointer-events-none object-contain object-bottom"
          draggable={false}
        />
      )}
      <div className="flex flex-col flex-1 min-w-0 p-4 min-h-[210px]">
        <div className="flex items-start gap-3">
          {!withGuide && <div className="shrink-0"><GuideAvatar size={48} /></div>}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Step {step + 1} of {STEPS.length}</div>
            <div className="text-sm font-semibold font-display">{s.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
          </div>
          <button onClick={closeTour} aria-label="Close tour" className="ml-auto text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-auto">
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
              <button onClick={closeTour} className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground">Finish</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}