import { NavLink } from 'react-router-dom'
import { ChevronLeft, Network, PlayCircle } from 'lucide-react'
import { NAV_GROUPS } from '@/lib/nav'
import { cn } from '@/lib/utils'

// Left rail, same construction as the DEM workspace: logo + caps label on top, grouped pages, collapse button at the bottom.
export default function Sidebar({ collapsed, onToggleCollapse }) {
  return (
    <aside
      className={cn(
        'hidden md:flex h-full shrink-0 flex-col border-r border-ink-700/60 bg-ink-950 transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-60'
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center gap-2 border-b border-ink-700/60 px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-signal-teal/40 bg-signal-teal/15">
          <Network size={15} className="text-signal-teal" strokeWidth={2} />
        </div>
        {!collapsed && <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-200">ApexFi</span>}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((g) => (
          <div key={g.id}>
            {!collapsed ? (
              <div className="eyebrow px-3 pb-1.5">{g.label}</div>
            ) : (
              <div className="mx-3 mb-1.5 border-t border-ink-700/60" />
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    title={item.label}
                    className={({ isActive }) =>
                      cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'border-ink-600/70 bg-ink-800 text-foreground'
                          : 'border-transparent text-ink-200 hover:bg-ink-900 hover:text-foreground'
                      )
                    }
                  >
                    <Icon size={17} strokeWidth={1.8} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-ink-700/60 p-2">
        <button
          onClick={() => window.dispatchEvent(new Event('apexfi:start-tour'))}
          title="Application Tour"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 hover:bg-ink-900 hover:text-foreground"
        >
          <PlayCircle size={17} strokeWidth={1.8} className="shrink-0" />
          {!collapsed && <span>Application Tour</span>}
        </button>
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-ink-300 hover:bg-ink-900 hover:text-foreground"
        >
          <ChevronLeft size={16} className={cn('transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>
    </aside>
  )
}
