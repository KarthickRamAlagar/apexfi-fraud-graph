import { motion } from 'framer-motion'

const EDGE_COLORS = {
  device_shared: 'hsl(var(--primary))',
  card_shared: 'hsl(var(--risk-medium))',
}

export default function TransactionGraph({ center, neighbors, onSelectNode }) {
  const size = 640
  const cx = size / 2
  const cy = size / 2
  const radius = 240

  const positions = neighbors.map((n, i) => {
    const angle = (i / neighbors.length) * Math.PI * 2 - Math.PI / 2
    return {
      ...n,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="max-w-full">
        {positions.map((n, i) => (
          <line
            key={`${n.id}-${n.edgeType}-${i}`}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            stroke={EDGE_COLORS[n.edgeType]}
            strokeWidth={2.5}
            strokeOpacity={0.55}
          />
        ))}

        {positions.map((n, i) => (
          <motion.g
            key={n.id + i}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="cursor-pointer"
            onClick={() => onSelectNode(n.id)}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={32}
              fill={n.isFlagged ? 'hsl(var(--risk-high) / 0.25)' : 'hsl(var(--secondary))'}
              stroke={n.isFlagged ? 'hsl(var(--risk-high))' : 'hsl(var(--border))'}
              strokeWidth={2}
            />
            <text
              x={n.x}
              y={n.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontFamily="var(--font-mono, monospace)"
              fill="hsl(var(--foreground))"
            >
              {n.id.replace('TX-', '')}
            </text>
            <text x={n.x} y={n.y + 50} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
              {n.amount}
            </text>
          </motion.g>
        ))}

        <motion.g initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <circle cx={cx} cy={cy} r={44} fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth={2.5} />
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize={14} fontFamily="var(--font-mono, monospace)" fontWeight={600} fill="hsl(var(--foreground))">
            {center.id.replace('TX-', '')}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
            {center.amount}
          </text>
        </motion.g>
      </svg>

      <div className="mt-2 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: EDGE_COLORS.device_shared }} />
          device_shared
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: EDGE_COLORS.card_shared }} />
          card_shared
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-risk-high bg-risk-high/25" />
          flagged
        </span>
      </div>
    </div>
  )
}
