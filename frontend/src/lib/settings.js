// One small settings store for the whole app: plain localStorage, no React needed to read it.
// A hook (useSettings) re-renders components when a setting changes.
// Every key below is read by real code (see the "used by" notes). Nothing is saved that no code reads.
import { useEffect, useState } from 'react'

export const SETTINGS_KEY = 'apexfiSettings'
export const SETTINGS_EVENT = 'apexfiSettingsChanged'

export const DEFAULT_SETTINGS = {
  // PDF reports - used by lib/pdf/*.js
  pdfIncludeSummary: true,       // headline numbers block
  pdfIncludeExplanation: true,   // SHAP / top reasons
  pdfIncludeNotes: true,         // honest notes and limits
  pdfDecimalPlaces: 3,           // 0 - 4
  // Appearance - used by applyAppearance() below
  theme: 'dark',                 // 'dark' | 'light' | 'system'
  compactInterface: false,
  animationsEnabled: true,
  sidebarCollapsedDefault: false, // used by components/layout/AppShell.jsx
}

const RULES = {
  pdfIncludeSummary: 'bool',
  pdfIncludeExplanation: 'bool',
  pdfIncludeNotes: 'bool',
  pdfDecimalPlaces: { min: 0, max: 4, int: true },
  theme: ['dark', 'light', 'system'],
  compactInterface: 'bool',
  animationsEnabled: 'bool',
  sidebarCollapsedDefault: 'bool',
}

function clean(key, v) {
  const r = RULES[key]
  if (r === 'bool') return typeof v === 'boolean' ? v : undefined
  if (Array.isArray(r)) return r.includes(v) ? v : undefined
  if (r && typeof v === 'number' && Number.isFinite(v)) {
    const n = r.int ? Math.round(v) : v
    return n >= r.min && n <= r.max ? n : undefined
  }
  return undefined
}

export function getSettings() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {} } catch { saved = {} }
  const out = { ...DEFAULT_SETTINGS }
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const c = clean(k, saved[k])
    if (c !== undefined) out[k] = c
  }
  return out
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch { /* storage blocked: settings last for this visit only */ }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }))
  return next
}

export function resetSettings() {
  try { localStorage.removeItem(SETTINGS_KEY) } catch { /* ignore */ }
  const d = { ...DEFAULT_SETTINGS }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: d }))
  return d
}

export function useSettings() {
  const [s, setS] = useState(getSettings)
  useEffect(() => {
    const on = (e) => setS(e.detail || getSettings())
    window.addEventListener(SETTINGS_EVENT, on)
    return () => window.removeEventListener(SETTINGS_EVENT, on)
  }, [])
  return s
}

// ---- Appearance: html[data-theme], html.compact, html.no-anim --------------
export function resolveTheme(theme) {
  if (theme === 'system') {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' } catch { return 'dark' }
  }
  return theme === 'light' ? 'light' : 'dark'
}

export function applyAppearance(s = getSettings()) {
  const root = document.documentElement
  const theme = resolveTheme(s.theme)
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.classList.toggle('compact', !!s.compactInterface)
  root.classList.toggle('no-anim', s.animationsEnabled === false)
}

let started = false
export function initAppearance() {
  applyAppearance()
  if (started) return
  started = true
  window.addEventListener(SETTINGS_EVENT, (e) => applyAppearance(e.detail))
  try {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const on = () => { if (getSettings().theme === 'system') applyAppearance() }
    if (mq.addEventListener) mq.addEventListener('change', on)
    else if (mq.addListener) mq.addListener(on)
  } catch { /* fixed theme still works */ }
}
