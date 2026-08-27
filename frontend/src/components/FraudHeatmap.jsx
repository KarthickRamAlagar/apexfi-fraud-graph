import { useState } from 'react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function FraudHeatmap({ data }) {
  const [hovered, setHovered] = useState(null)
  const max = Math.max(...data.map((d) => d.value))

  return (
    <div>
      <div className="flex gap-1">
        <div className="flex w-8 flex-col justify-between py-1 text-[10px] text-muted-foreground">
          {DAYS.map((d) => (
            <div key={d} style={{ height: 16 }}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-24 gap-[3px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {DAYS.map((day) =>
            Array.from({ length: 24 }, (_, h) => {
              const cell = data.find((d) => d.day === day && d.hour === h)
              const intensity = cell ? cell.value / max : 0
              return (
                <div
                  key={`${day}-${h}`}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  className="h-4 rounded-[2px] transition-transform hover:scale-125"
                  style={{
                    background: `hsl(var(--primary) / ${0.12 + intensity * 0.75})`,
                  }}
                />
              )
            })
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-8 text-[10px] text-muted-foreground">
        <span>12am</span>
        <span>6am</span>
        <span>12pm</span>
        <span>6pm</span>
        <span>11pm</span>
      </div>
      <div className="mt-2 h-5 pl-8 text-xs text-muted-foreground">
        {hovered
          ? `${hovered.day} ${hovered.hour}:00 — relative fraud density ${hovered.value.toFixed(2)}`
          : 'Hover a cell to inspect'}
      </div>
    </div>
  )
}
