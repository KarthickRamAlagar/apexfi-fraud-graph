import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { cn } from '@/lib/utils'

const NAV_HEIGHT = 64 // matches TopNav's h-16

export default function InspectorPanel({ isOpen, onToggle, selected }) {
  return (
    <>
      {/* Collapsed state: a slim reopen tab docked to the right edge */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            onClick={onToggle}
            className="fixed right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground"
            style={{ top: NAV_HEIGHT + 16 }}
            aria-label="Expand inspector"
          >
            <ChevronLeft size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && selected && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="fixed right-0 z-20 overflow-hidden border-l border-border bg-card"
            style={{ top: NAV_HEIGHT, height: `calc(100vh - ${NAV_HEIGHT}px)` }}
          >
            <div className="h-full w-[320px] overflow-y-auto p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Metadata Inspector
                </p>
                <button
                  onClick={onToggle}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Collapse inspector"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <h3 className="mt-2 font-display text-lg font-semibold">{selected.name}</h3>
              <StatusBadge status={selected.status} />

              <dl className="mt-5 space-y-3 text-sm">
                <Row label="Source" value={selected.source} />
                <Row label="Category" value={selected.category} />
                <Row label="Rows" value={selected.rows.toLocaleString()} mono />
                <Row label="Columns" value={selected.columns} mono />
                <Row label="Layer" value="Gold (feature-ready)" />
              </dl>

              <p className="mt-5 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm', mono && 'font-mono text-primary')}>{value}</dd>
    </div>
  )
}
