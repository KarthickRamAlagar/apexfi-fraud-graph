// import { useState } from 'react'

// /**
//  * Real, SINGLE box plot -- shows exactly one feature at a time,
//  * matching whichever feature is currently selected (starts at the
//  * first real column, typically C1/TransactionAmt). Changes
//  * dynamically when the selector elsewhere changes.
//  *
//  * Fixed light background by design -- axis/text colors below are
//  * fixed dark tones to stay readable against it, not the app's dark
//  * theme CSS variables used elsewhere.
//  */
// const AXIS_COLOR = '#6b7280'
// const TEXT_COLOR = '#111827'
// const BOX_COLOR = '#4f46e5'
// const BOX_FILL = 'rgba(79, 70, 229, 0.18)'
// const OUTLIER_COLOR = '#dc2626'

// function computeBox(stats) {
//   const { min, p25, p50, p75, max } = stats
//   const iqr = p75 - p25
//   const lowerWhisker = Math.max(min, p25 - 1.5 * iqr)
//   const upperWhisker = Math.min(max, p75 + 1.5 * iqr)
//   const lowerOutlier = min < lowerWhisker ? min : null
//   const upperOutlier = max > upperWhisker ? max : null
//   return { min, p25, p50, p75, max, lowerWhisker, upperWhisker, lowerOutlier, upperOutlier }
// }

// export default function BoxPlot({ stats, featureLabel, width = 260, height = 220 }) {
//   const [hover, setHover] = useState(false)

//   // Real, honest check -- some real IEEE-CIS columns (e.g. D2-D4) are
//   // heavily missing in the actual dataset, which can make one or more
//   // of these aggregate stats null. Show a clear message rather than
//   // silently rendering nothing.
//   const hasAllStats = stats && [stats.min, stats.p25, stats.p50, stats.p75, stats.max]
//     .every((v) => v !== null && v !== undefined)

//   if (!hasAllStats) {
//     return (
//       <div className="flex h-[220px] items-center justify-center rounded-xl bg-white p-4 text-center text-xs text-gray-500">
//         Not enough real data to compute a box plot for {featureLabel} (this column has significant real missingness).
//       </div>
//     )
//   }

//   const box = computeBox(stats)
//   const padTop = 16
//   const padBottom = 32
//   const plotH = height - padTop - padBottom
//   const range = box.max - box.min || 1
//   const scaleY = (v) => padTop + (1 - (v - box.min) / range) * plotH
//   const centerX = width / 2
//   const boxW = 70
//   const axisX = 44

//   return (
//     <div
//       className="relative p-3 bg-white rounded-xl"
//       onMouseEnter={() => setHover(true)}
//       onMouseLeave={() => setHover(false)}
//     >
//       <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
//         <line x1={axisX} y1={padTop} x2={axisX} y2={padTop + plotH} stroke={AXIS_COLOR} strokeWidth="1" />
//         {[
//           { v: box.max, key: 'max' },
//           { v: box.p75, key: 'p75' },
//           { v: box.p50, key: 'p50' },
//           { v: box.p25, key: 'p25' },
//           { v: box.min, key: 'min' },
//         ].map(({ v, key }) => (
//           <g key={key}>
//             <line x1={axisX - 4} y1={scaleY(v)} x2={axisX} y2={scaleY(v)} stroke={AXIS_COLOR} strokeWidth="1" />
//             <text x={axisX - 8} y={scaleY(v) + 3} fontSize="8" fill={AXIS_COLOR} textAnchor="end">
//               {v.toFixed(1)}
//             </text>
//           </g>
//         ))}

//         <line x1={centerX} y1={scaleY(box.lowerWhisker)} x2={centerX} y2={scaleY(box.upperWhisker)} stroke={AXIS_COLOR} strokeWidth="1.5" />
//         <line x1={centerX - 12} y1={scaleY(box.lowerWhisker)} x2={centerX + 12} y2={scaleY(box.lowerWhisker)} stroke={AXIS_COLOR} strokeWidth="1.5" />
//         <line x1={centerX - 12} y1={scaleY(box.upperWhisker)} x2={centerX + 12} y2={scaleY(box.upperWhisker)} stroke={AXIS_COLOR} strokeWidth="1.5" />

//         <rect
//           x={centerX - boxW / 2}
//           y={scaleY(box.p75)}
//           width={boxW}
//           height={Math.max(scaleY(box.p25) - scaleY(box.p75), 1)}
//           fill={hover ? 'rgba(79, 70, 229, 0.32)' : BOX_FILL}
//           stroke={BOX_COLOR}
//           strokeWidth="1.8"
//           rx="3"
//         />
//         <line x1={centerX - boxW / 2} y1={scaleY(box.p50)} x2={centerX + boxW / 2} y2={scaleY(box.p50)} stroke={BOX_COLOR} strokeWidth="2.5" />

//         {box.lowerOutlier !== null && <circle cx={centerX} cy={scaleY(box.lowerOutlier)} r="3.5" fill={OUTLIER_COLOR} />}
//         {box.upperOutlier !== null && <circle cx={centerX} cy={scaleY(box.upperOutlier)} r="3.5" fill={OUTLIER_COLOR} />}

//         <line x1={axisX} y1={padTop + plotH} x2={width - 12} y2={padTop + plotH} stroke={AXIS_COLOR} strokeWidth="1" />
//         <text x={centerX} y={height - 12} fontSize="11" fill={TEXT_COLOR} textAnchor="middle" fontWeight="600">
//           {featureLabel}
//         </text>
//         <text x={12} y={padTop - 4} fontSize="8" fill={AXIS_COLOR}>Value</text>
//       </svg>

//       {hover && (
//         <div className="absolute left-1/2 top-2 z-30 w-48 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white p-2.5 text-[10px] leading-relaxed text-gray-900 shadow-xl">
//           <div className="mb-1 font-semibold">{featureLabel}</div>
//           <div className="grid grid-cols-2 text-gray-500 gap-x-2">
//             <span>Max</span><span className="font-mono text-right text-gray-900">{box.max.toFixed(2)}</span>
//             <span>Upper whisker</span><span className="font-mono text-right text-gray-900">{box.upperWhisker.toFixed(2)}</span>
//             <span>Q3</span><span className="font-mono text-right text-gray-900">{box.p75.toFixed(2)}</span>
//             <span>Median</span><span className="font-mono text-right text-gray-900">{box.p50.toFixed(2)}</span>
//             <span>Q1</span><span className="font-mono text-right text-gray-900">{box.p25.toFixed(2)}</span>
//             <span>Lower whisker</span><span className="font-mono text-right text-gray-900">{box.lowerWhisker.toFixed(2)}</span>
//             <span>Min</span><span className="font-mono text-right text-gray-900">{box.min.toFixed(2)}</span>
//           </div>
//           {(box.lowerOutlier !== null || box.upperOutlier !== null) && (
//             <div className="mt-1.5 border-t border-gray-200 pt-1.5 text-red-600">
//               Real outlier{box.lowerOutlier !== null && box.upperOutlier !== null ? 's' : ''} beyond whisker range
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   )
// }


import { useState } from 'react'

/**
 * Real, SINGLE box plot -- shows exactly one feature at a time,
 * matching whichever feature is currently selected (starts at the
 * first real column, typically C1/TransactionAmt). Changes
 * dynamically when the selector elsewhere changes.
 *
 * Fixed light background by design -- axis/text colors below are
 * fixed dark tones to stay readable against it, not the app's dark
 * theme CSS variables used elsewhere.
 */
const AXIS_COLOR = '#6b7280'
const TEXT_COLOR = '#111827'
const BOX_COLOR = '#4f46e5'
const BOX_FILL = 'rgba(79, 70, 229, 0.18)'
const OUTLIER_COLOR = '#dc2626'

function computeBox(stats) {
  const { min, p25, p50, p75, max } = stats
  const iqr = p75 - p25
  const lowerWhisker = Math.max(min, p25 - 1.5 * iqr)
  const upperWhisker = Math.min(max, p75 + 1.5 * iqr)
  const lowerOutlier = min < lowerWhisker ? min : null
  const upperOutlier = max > upperWhisker ? max : null
  return { min, p25, p50, p75, max, lowerWhisker, upperWhisker, lowerOutlier, upperOutlier }
}

export default function BoxPlot({ stats, featureLabel, width = 260, height = 220 }) {
  const [hover, setHover] = useState(false)

  // Real, honest check -- some real IEEE-CIS columns (e.g. D2-D4) are
  // heavily missing in the actual dataset, which can make one or more
  // of these aggregate stats null. Show a clear message rather than
  // silently rendering nothing.
  const hasAllStats = stats && [stats.min, stats.p25, stats.p50, stats.p75, stats.max]
    .every((v) => v !== null && v !== undefined)

  if (!hasAllStats) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl bg-white p-4 text-center text-xs text-gray-500">
        Not enough real data to compute a box plot for {featureLabel} (this column has significant real missingness).
      </div>
    )
  }

  const box = computeBox(stats)
  const padTop = 24
  const padBottom = 40
  const plotH = height - padTop - padBottom
  // Scale to the whisker range (not min..max) so one extreme value can't squash the box flat.
  // Outliers beyond the range are drawn as clamped markers at the plot edge.
  const viewMin = box.lowerWhisker
  const viewMax = box.upperWhisker
  const range = viewMax - viewMin || 1
  const clamp = (v) => Math.min(Math.max(v, viewMin), viewMax)
  const scaleY = (v) => padTop + (1 - (clamp(v) - viewMin) / range) * plotH
  const centerX = width / 2
  const boxW = 70
  const axisX = 44

  return (
    <div
      className="relative p-3 bg-white rounded-xl"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <line x1={axisX} y1={padTop} x2={axisX} y2={padTop + plotH} stroke={AXIS_COLOR} strokeWidth="1" />
        {[
          { v: box.upperWhisker, key: 'uw' },
          { v: box.p75, key: 'p75' },
          { v: box.p50, key: 'p50' },
          { v: box.p25, key: 'p25' },
          { v: box.lowerWhisker, key: 'lw' },
        ].filter(({ v }, i, arr) => arr.findIndex((o) => Math.abs(scaleY(o.v) - scaleY(v)) < 9) === i).map(({ v, key }) => (
          <g key={key}>
            <line x1={axisX - 4} y1={scaleY(v)} x2={axisX} y2={scaleY(v)} stroke={AXIS_COLOR} strokeWidth="1" />
            <text x={axisX - 8} y={scaleY(v) + 3} fontSize="8" fill={AXIS_COLOR} textAnchor="end">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        <line x1={centerX} y1={scaleY(box.lowerWhisker)} x2={centerX} y2={scaleY(box.upperWhisker)} stroke={AXIS_COLOR} strokeWidth="1.5" />
        <line x1={centerX - 12} y1={scaleY(box.lowerWhisker)} x2={centerX + 12} y2={scaleY(box.lowerWhisker)} stroke={AXIS_COLOR} strokeWidth="1.5" />
        <line x1={centerX - 12} y1={scaleY(box.upperWhisker)} x2={centerX + 12} y2={scaleY(box.upperWhisker)} stroke={AXIS_COLOR} strokeWidth="1.5" />

        <rect
          x={centerX - boxW / 2}
          y={scaleY(box.p75)}
          width={boxW}
          height={Math.max(scaleY(box.p25) - scaleY(box.p75), 1)}
          fill={hover ? 'rgba(79, 70, 229, 0.32)' : BOX_FILL}
          stroke={BOX_COLOR}
          strokeWidth="1.8"
          rx="3"
        />
        <line x1={centerX - boxW / 2} y1={scaleY(box.p50)} x2={centerX + boxW / 2} y2={scaleY(box.p50)} stroke={BOX_COLOR} strokeWidth="2.5" />

        {box.lowerOutlier !== null && (
          <g>
            <circle cx={centerX} cy={padTop + plotH + 8} r="3.5" fill={OUTLIER_COLOR} />
            <text x={centerX + 8} y={padTop + plotH + 11} fontSize="8" fill={OUTLIER_COLOR}>▼ outlier {box.lowerOutlier.toFixed(1)}</text>
          </g>
        )}
        {box.upperOutlier !== null && (
          <g>
            <circle cx={centerX} cy={padTop - 8} r="3.5" fill={OUTLIER_COLOR} />
            <text x={centerX + 8} y={padTop - 5} fontSize="8" fill={OUTLIER_COLOR}>▲ outlier up to {box.upperOutlier.toLocaleString()}</text>
          </g>
        )}

        <line x1={axisX} y1={padTop + plotH} x2={width - 12} y2={padTop + plotH} stroke={AXIS_COLOR} strokeWidth="1" />
        <text x={centerX} y={height - 12} fontSize="11" fill={TEXT_COLOR} textAnchor="middle" fontWeight="600">
          {featureLabel}
        </text>
        <text x={12} y={padTop - 12} fontSize="8" fill={AXIS_COLOR}>Value</text>
      </svg>

      {hover && (
        <div className="absolute left-1/2 top-2 z-30 w-48 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white p-2.5 text-[10px] leading-relaxed text-gray-900 shadow-xl">
          <div className="mb-1 font-semibold">{featureLabel}</div>
          <div className="grid grid-cols-2 text-gray-500 gap-x-2">
            <span>Max</span><span className="font-mono text-right text-gray-900">{box.max.toFixed(2)}</span>
            <span>Upper whisker</span><span className="font-mono text-right text-gray-900">{box.upperWhisker.toFixed(2)}</span>
            <span>Q3</span><span className="font-mono text-right text-gray-900">{box.p75.toFixed(2)}</span>
            <span>Median</span><span className="font-mono text-right text-gray-900">{box.p50.toFixed(2)}</span>
            <span>Q1</span><span className="font-mono text-right text-gray-900">{box.p25.toFixed(2)}</span>
            <span>Lower whisker</span><span className="font-mono text-right text-gray-900">{box.lowerWhisker.toFixed(2)}</span>
            <span>Min</span><span className="font-mono text-right text-gray-900">{box.min.toFixed(2)}</span>
          </div>
          {(box.lowerOutlier !== null || box.upperOutlier !== null) && (
            <div className="mt-1.5 border-t border-gray-200 pt-1.5 text-red-600">
              Real outlier{box.lowerOutlier !== null && box.upperOutlier !== null ? 's' : ''} beyond whisker range
            </div>
          )}
        </div>
      )}
    </div>
  )
}