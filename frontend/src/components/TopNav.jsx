import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Network } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/datasets', label: 'Datasets' },
  { path: '/investigate', label: 'Investigate' },
  { path: '/score-new', label: 'Score New Transaction' },
  { path: '/score-account', label: 'Score Unlabeled Account' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/eda', label: 'EDA' },
  { path: '/ask', label: 'Ask your data' },
]

export default function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex items-center h-16 gap-6">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary">
            <Network size={18} />
          </div>
          <span className="text-sm font-semibold tracking-wide font-display">
            ApexFi
          </span>
        </div>

        <nav className="items-center hidden gap-1 md:flex">
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

        <div className="flex items-center gap-3 ml-auto">
          <GlobalSearch />
        </div>
      </div>
    </header>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // real search across both datasets, in parallel — only fires once
  // there's at least 2 digits typed, same debounce discipline used
  // elsewhere in the app
  const { data: txData } = useQuery({
    queryKey: ['global-search-tx', debounced],
    queryFn: () => api.investigateSearch(debounced),
    enabled: debounced.length >= 2,
  })
  const { data: accountData } = useQuery({
    queryKey: ['global-search-account', debounced],
    queryFn: () => api.dgraphFinSearch(debounced),
    enabled: debounced.length >= 2,
  })

  const txMatches = (txData?.results ?? []).slice(0, 5)
  const accountMatches = (accountData?.results ?? []).slice(0, 5)
  const hasResults = txMatches.length > 0 || accountMatches.length > 0
  const showDropdown = open && debounced.length >= 2

  function goToTransaction(id) {
    setQuery('')
    setOpen(false)
    navigate(`/investigate?id=${id}`)
  }

  function goToAccount(id) {
    setQuery('')
    setOpen(false)
    navigate(`/score-account?id=${id}`)
  }

  return (
    <div className="relative hidden lg:block">
      <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground focus-within:border-primary/50">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search transactions, accounts…"
          className="bg-transparent outline-none w-60 text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {showDropdown && (
        <div className="absolute right-0 z-30 p-1 mt-1 border rounded-lg shadow-xl w-80 border-border bg-card">
          {!hasResults && (
            <div className="px-3 py-3 text-xs text-muted-foreground">No matches found.</div>
          )}

          {txMatches.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                IEEE-CIS Transactions
              </div>
              {txMatches.map((t) => (
                <button
                  key={t.id}
                  onMouseDown={() => goToTransaction(t.id)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs text-left rounded-md hover:bg-secondary"
                >
                  <span className="font-mono">{t.id}</span>
                  {t.isFlagged && <span className="text-risk-high">flagged</span>}
                </button>
              ))}
            </>
          )}

          {accountMatches.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                DGraph-Fin Accounts
              </div>
              {accountMatches.map((a) => (
                <button
                  key={a.nodeId}
                  onMouseDown={() => goToAccount(a.nodeId)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs text-left rounded-md hover:bg-secondary"
                >
                  <span className="font-mono">#{a.nodeId}</span>
                  <span className="text-muted-foreground">{a.connections} connections</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}