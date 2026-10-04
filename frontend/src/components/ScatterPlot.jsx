import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

/**
 * Real scatter plot -- dynamically plots TransactionAmt (fixed X
 * reference) against whichever feature is CURRENTLY SELECTED (yCol),
 * not a hardcoded pair. Uses the wide sample (500 real random rows,
 * all stat-column values included), extracting just the two needed
 * columns for the current view.
 */
export default function ScatterPlot({ sample, xCol, yCol, xLabel, yLabel }) {
  if (!sample || sample.length === 0) {
    return <p className="py-8 text-xs text-center text-muted-foreground">No scatter sample available.</p>
  }

  const points = sample
    .filter((row) => row[xCol] !== null && row[yCol] !== null)
    .map((row) => ({ x: row[xCol], y: row[yCol], isFraudLike: row.label === 1 || row.label === 'fraud' }))

  if (points.length === 0) {
    return (
      <p className="py-8 text-xs text-center text-muted-foreground">
        Not enough real, non-missing data to plot {xLabel} vs. {yLabel}.
      </p>
    )
  }

  return (
    <div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" dataKey="x" name={xLabel} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis type="number" dataKey="y" name={yLabel} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(v, name) => [typeof v === 'number' ? v.toFixed(2) : v, name]}
            />
            <Scatter data={points} fillOpacity={0.7}>
              {points.map((p, i) => (
                <Cell key={i} fill={p.isFraudLike ? 'hsl(var(--risk-high))' : 'hsl(var(--risk-low))'} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-center text-muted-foreground">
        {xLabel} vs. {yLabel} — real random sample, {points.length.toLocaleString()} points (not the full dataset)
      </p>
    </div>
  )
}