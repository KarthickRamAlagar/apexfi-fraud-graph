import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

export default function StatPill({ label, sublabel, value, trend, tone = 'primary' }) {
  const toneColor = {
    primary: 'hsl(var(--primary))',
    high: 'hsl(var(--risk-high))',
    low: 'hsl(var(--risk-low))',
  }[tone]

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-lg font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{sublabel}</div>
      </div>
      {trend && (
        <div className="h-10 w-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend.map((v, i) => ({ i, v }))}>
              <defs>
                <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={toneColor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={toneColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={toneColor}
                strokeWidth={1.5}
                fill={`url(#grad-${label})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
