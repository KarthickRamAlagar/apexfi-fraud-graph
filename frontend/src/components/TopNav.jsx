import { NavLink } from 'react-router-dom'
import { Search, Settings, Network } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/datasets', label: 'Datasets' },
  { path: '/investigate', label: 'Investigate' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/eda', label: 'EDA' },
  { path: '/ask', label: 'Ask your data' },
]

export default function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Network size={18} />
          </div>
          <span className="font-display text-sm font-semibold tracking-wide">
            ApexFi
          </span>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  isActive && 'bg-secondary text-foreground'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground lg:flex">
            <Search size={14} />
            <span>Search transactions, cards, devices…</span>
          </div>
          <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
