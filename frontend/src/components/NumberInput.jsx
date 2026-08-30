import { ChevronUp, ChevronDown } from 'lucide-react'

/**
 * A number input with custom, theme-matched increment/decrement buttons —
 * replaces the browser's default (removed globally via CSS) spinner
 * arrows with something that actually matches the app's design.
 */
export default function NumberInput({ value, onChange, onKeyDown, placeholder, step = 1, className = '' }) {
  function nudge(delta) {
    const current = parseFloat(value) || 0
    onChange(String(current + delta))
  }

  return (
    <div className="relative flex items-center">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`w-full rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 pr-6 text-sm text-foreground outline-none focus:border-primary/50 ${className}`}
      />
      <div className="absolute flex flex-col right-1">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => nudge(step)}
          className="flex h-3.5 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronUp size={11} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => nudge(-step)}
          className="flex h-3.5 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronDown size={11} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}