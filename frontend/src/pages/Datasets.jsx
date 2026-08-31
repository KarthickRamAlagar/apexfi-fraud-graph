import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import InspectorPanel from '@/components/InspectorPanel'
import RupeeCoin from '@/components/RupeeCoin'
import PendingBanner from '@/components/PendingBanner'
import { DatasetsSkeleton } from '@/components/PageSkeletons'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const CATEGORIES = ['All', 'Tabular', 'Graph']

export default function Datasets() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(true)

  const { data, error } = useQuery({
    queryKey: ['datasets'],
    queryFn: api.datasets,
  })
  const datasets = data?.datasets
  const displaySelected = selected ?? datasets?.[0]

  if (error) {
    return (
      <div className="p-8">
        <PendingBanner>Couldn't reach the backend at localhost:8000.</PendingBanner>
      </div>
    )
  }

  if (!datasets) {
    return <DatasetsSkeleton />
  }

  const filtered = datasets.filter((ds) => {
    const matchesCategory = activeCategory === 'All' || ds.category === activeCategory
    const matchesQuery = ds.name.toLowerCase().includes(query.toLowerCase())
    return matchesCategory && matchesQuery
  })

  const counts = {
    All: datasets.length,
    Tabular: datasets.filter((d) => d.category === 'Tabular').length,
    Graph: datasets.filter((d) => d.category === 'Graph').length,
  }

  return (
    <>
      <motion.div
        className="px-6 py-8 space-y-5 sm:px-8"
        animate={{ marginRight: inspectorOpen ? 320 : 0 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs tracking-wide uppercase text-muted-foreground">ApexFi / Datasets</p>
            <h1 className="mt-1 text-2xl font-semibold font-display">Datasets</h1>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg border-border bg-card text-muted-foreground sm:w-72">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets…"
              className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {cat} ({counts[cat]})
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map((ds, i) => (
            <motion.button
              key={ds.id}
              onClick={() => setSelected(ds)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                'flex w-full items-center justify-between gap-4 rounded-xl border bg-card p-4 text-left transition-colors',
                displaySelected?.id === ds.id ? 'border-primary/60' : 'border-border hover:border-muted-foreground/40'
              )}
            >
              <div className="flex-1">
                <h3 className="text-base font-semibold font-display">{ds.name}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{ds.description}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {ds.source} · {ds.rows.toLocaleString()} rows · {ds.columns} columns
                </p>
                <div className="flex items-center gap-3 pt-3 mt-3 border-t border-border/60">
                  <StatusBadge status={ds.status} />
                  <span className="text-xs text-muted-foreground">Gold layer</span>
                </div>
              </div>
              <RupeeCoin size={44} />
            </motion.button>
          ))}
        </div>
      </motion.div>

      <InspectorPanel
        isOpen={inspectorOpen}
        onToggle={() => setInspectorOpen((v) => !v)}
        selected={displaySelected}
      />
    </>
  )
}