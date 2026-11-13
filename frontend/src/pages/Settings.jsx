import { Settings as Cog, RotateCcw } from 'lucide-react'
import { PageHeader, Section, GhostButton, Note } from '@/components/kit/Kit'
import { useSettings, saveSettings, resetSettings, DEFAULT_SETTINGS } from '@/lib/settings'

function Row({ title, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-ink-800/80 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[14px] text-foreground">{title}</p>
        {hint && <p className="mt-0.5 max-w-[60ch] text-[12.5px] text-ink-400">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full border transition-colors ${on ? 'border-signal-teal bg-signal-teal/80' : 'border-ink-600 bg-ink-800'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-1'}`} />
    </button>
  )
}
function Seg({ value, options, onChange }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-ink-700/70">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-3.5 py-1.5 text-[13px] ${value === v ? 'bg-signal-teal/15 font-medium text-foreground' : 'text-ink-300 hover:text-foreground'}`}>{l}</button>
      ))}
    </div>
  )
}

export default function Settings() {
  const s = useSettings()
  const set = (k) => (v) => saveSettings({ [k]: v })
  return (
    <div className="mx-auto max-w-[860px] px-6 py-8">
      <PageHeader icon={Cog} title="Settings" subtitle="Saved in this browser only. Each setting below is used by real code; nothing is stored that the app does not read."
        right={<GhostButton icon={RotateCcw} onClick={resetSettings}>Reset to defaults</GhostButton>} />
      <div className="space-y-5">
        <Section title="PDF reports" subtitle="Used by every Download PDF button (V2 Evaluation, Score New Transaction, Score Unlabeled Account, Ops).">
          <Row title="Include the headline numbers" hint="The result tiles at the top of a report."><Toggle label="Include summary" on={s.pdfIncludeSummary} onChange={set('pdfIncludeSummary')} /></Row>
          <Row title="Include the explanation" hint="The per-prediction SHAP table on the score reports."><Toggle label="Include explanation" on={s.pdfIncludeExplanation} onChange={set('pdfIncludeExplanation')} /></Row>
          <Row title="Include notes and limits" hint="Honest notes, known issues and the model note."><Toggle label="Include notes" on={s.pdfIncludeNotes} onChange={set('pdfIncludeNotes')} /></Row>
          <Row title="Decimal places" hint="For scores and metrics printed in a report.">
            <Seg value={s.pdfDecimalPlaces} options={[[2, '2'], [3, '3'], [4, '4']]} onChange={set('pdfDecimalPlaces')} />
          </Row>
        </Section>
        <Section title="Appearance">
          <Row title="Theme"><Seg value={s.theme} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]} onChange={set('theme')} /></Row>
          <Row title="Compact interface" hint="Slightly tighter text and spacing."><Toggle label="Compact interface" on={s.compactInterface} onChange={set('compactInterface')} /></Row>
          <Row title="Animations" hint="Turn off to remove motion."><Toggle label="Animations" on={s.animationsEnabled} onChange={set('animationsEnabled')} /></Row>
          <Row title="Start with the sidebar collapsed"><Toggle label="Sidebar collapsed" on={s.sidebarCollapsedDefault} onChange={set('sidebarCollapsedDefault')} /></Row>
        </Section>
        <Note tone="grey">Defaults: theme {DEFAULT_SETTINGS.theme}, {DEFAULT_SETTINGS.pdfDecimalPlaces} decimal places.</Note>
      </div>
    </div>
  )
}
