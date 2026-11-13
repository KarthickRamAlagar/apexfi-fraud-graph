import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Moon, Sun, Radio } from 'lucide-react'
import Sidebar from './Sidebar'
import GlobalSearch from './GlobalSearch'
import { titleFor } from '@/lib/nav'
import { saveSettings, useSettings, resolveTheme } from '@/lib/settings'
import { pingApi } from '@/lib/api2'

// The page frame: sidebar on the left, a slim title bar on top (breadcrumb, search, live status, theme), the page below.
export default function AppShell() {
  const settings = useSettings()
  const [collapsed, setCollapsed] = useState(settings.sidebarCollapsedDefault)
  const [live, setLive] = useState('checking')
  const mainRef = useRef(null)
  const { pathname } = useLocation()
  const page = titleFor(pathname)

  // Settings > "Start with sidebar collapsed" applies at once
  useEffect(() => { setCollapsed(settings.sidebarCollapsedDefault) }, [settings.sidebarCollapsedDefault])
  // every page opens at the top
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [pathname])
  // API status chip
  useEffect(() => {
    let stop = false
    const tick = async () => { const ok = await pingApi(); if (!stop) setLive(ok ? 'live' : 'offline') }
    tick()
    const t = setInterval(tick, 20000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  const isLight = resolveTheme(settings.theme) === 'light'
  const chip =
    live === 'live' ? { text: 'LIVE · 3 SOURCE DATASETS', cls: 'border-signal-teal/40 bg-signal-teal/10 text-signal-teal' }
    : live === 'offline' ? { text: 'API OFFLINE', cls: 'border-signal-red/40 bg-signal-red/10 text-signal-red' }
    : { text: 'CHECKING…', cls: 'border-ink-600 bg-ink-800 text-ink-200' }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <main ref={mainRef} className="relative h-full min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-ink-700/60 bg-background/80 px-6 backdrop-blur-xl">
          <div className="eyebrow min-w-0 truncate">
            ApexFi{page.group ? ` / ${page.group}` : ''} / <span className="text-ink-100">{page.label}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <GlobalSearch />
            <span className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10.5px] tracking-[0.14em] sm:inline-flex ${chip.cls}`}>
              <Radio size={11} /> {chip.text}
            </span>
            <button
              onClick={() => saveSettings({ theme: isLight ? 'dark' : 'light' })}
              title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-700/70 bg-ink-900/60 text-ink-200 hover:text-foreground"
            >
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
