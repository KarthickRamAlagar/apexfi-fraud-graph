import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '@/lib/api'

// Same search as before (transactions + DGraph-Fin accounts), moved out of the old top bar.
export default function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: txData } = useQuery({
    queryKey: ['global-search-tx', debounced],
    queryFn: () => api.investigateSearch(debounced),
    enabled: debounced.length >= 2,
    retry: 1,
  })
  const { data: accountData } = useQuery({
    queryKey: ['global-search-account', debounced],
    queryFn: () => api.dgraphFinSearch(debounced),
    enabled: debounced.length >= 2,
    retry: 1,
  })

  const txMatches = (txData?.results ?? []).slice(0, 5)
  const accountMatches = (accountData?.results ?? []).slice(0, 5)
  const hasResults = txMatches.length > 0 || accountMatches.length > 0
  const showDropdown = open && debounced.length >= 2

  const go = (path) => { setQuery(''); setOpen(false); navigate(path) }

  return (
    <div className="relative hidden lg:block">
      <div className="flex items-center gap-2 rounded-lg border border-ink-700/70 bg-ink-900/60 px-3 py-1.5 text-sm text-ink-300 focus-within:border-signal-teal/50">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search transactions, accounts…"
          className="w-60 bg-transparent text-foreground outline-none placeholder:text-ink-400"
        />
      </div>
      {showDropdown && (
        <div className="absolute right-0 z-40 mt-1 w-80 rounded-lg border border-ink-700/70 bg-ink-900 p-1 shadow-panel">
          {!hasResults && <div className="px-3 py-3 text-xs text-ink-300">No matches found.</div>}
          {txMatches.length > 0 && (
            <>
              <div className="eyebrow px-3 pb-1 pt-2">IEEE-CIS Transactions</div>
              {txMatches.map((t) => (
                <button key={t.id} onMouseDown={() => go(`/investigate?id=${t.id}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-ink-800">
                  <span className="font-mono">{t.id}</span>
                  {t.isFlagged && <span className="text-signal-red">flagged</span>}
                </button>
              ))}
            </>
          )}
          {accountMatches.length > 0 && (
            <>
              <div className="eyebrow px-3 pb-1 pt-2">DGraph-Fin Accounts</div>
              {accountMatches.map((a) => (
                <button key={a.nodeId} onMouseDown={() => go(`/score-account?id=${a.nodeId}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-ink-800">
                  <span className="font-mono">#{a.nodeId}</span>
                  <span className="text-ink-300">{a.connections} connections</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
