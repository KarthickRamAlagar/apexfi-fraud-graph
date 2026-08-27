import { useState } from 'react'

function cellColor(v) {
  if (v >= 0) return `hsl(var(--primary) / ${0.15 + Math.abs(v) * 0.7})`
  return `hsl(var(--risk-high) / ${0.15 + Math.abs(v) * 0.7})`
}

export default function CorrelationMatrix({ labels, fullLabels, matrix }) {
  const [hover, setHover] = useState(null) // { i, j }

  return (
    <table className="border-separate" style={{ borderSpacing: 6 }}>
      <thead>
        <tr>
          <th className="w-24" />
          {labels.map((l, j) => (
            <th
              key={l}
              className="px-1 pb-2 text-xs font-medium text-muted-foreground transition-colors"
              style={{ color: hover?.j === j ? 'hsl(var(--foreground))' : undefined }}
            >
              {l}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, i) => (
          <tr key={labels[i]}>
            <td
              className="pr-3 text-right text-xs font-medium text-muted-foreground transition-colors"
              style={{ color: hover?.i === i ? 'hsl(var(--foreground))' : undefined }}
            >
              {labels[i]}
            </td>
            {row.map((v, j) => {
              const isActive = hover?.i === i || hover?.j === j
              return (
                <td key={j}>
                  <div
                    onMouseEnter={() => setHover({ i, j })}
                    onMouseLeave={() => setHover(null)}
                    className="flex h-16 w-20 cursor-default flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-mono tabular-nums transition-all duration-150"
                    style={{
                      background: cellColor(v),
                      transform: hover?.i === i && hover?.j === j ? 'scale(1.08)' : 'scale(1)',
                      opacity: hover && !isActive ? 0.45 : 1,
                    }}
                  >
                    <span className="font-semibold">{v.toFixed(2)}</span>
                  </div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
      {hover && fullLabels && (
        <caption className="mt-3 caption-bottom text-xs text-muted-foreground">
          {fullLabels[hover.i]} × {fullLabels[hover.j]}: correlation {matrix[hover.i][hover.j].toFixed(2)}
        </caption>
      )}
    </table>
  )
}
