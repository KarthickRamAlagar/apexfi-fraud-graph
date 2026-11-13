// Shared helpers for the ApexFi PDFs. Every number printed here comes from the data the page already shows.
// The Settings page controls: decimal places, and whether the summary / explanation / notes blocks are printed.
import { getSettings } from '@/lib/settings'
import { newReportDoc, Flow } from '@/lib/reportFlow'

export function opts() { return getSettings() }
export function fmtNum(v, dp) {
  if (v == null || Number.isNaN(Number(v))) return 'No data'
  const d = dp ?? getSettings().pdfDecimalPlaces
  return Number(v).toFixed(d)
}
export const fmtPct = (v, dp = 1) => (v == null || Number.isNaN(Number(v)) ? 'No data' : `${Number(v).toFixed(dp)}%`)
export const fmtInt = (v) => (v == null || Number.isNaN(Number(v)) ? 'No data' : Number(v).toLocaleString('en-US'))
export const fmtUsd = (v) => (v == null ? 'No data' : `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`)

export function startReport(label) {
  const doc = newReportDoc()
  return { doc, flow: new Flow(doc, { label }) }
}
export function save(flow, doc, name) {
  flow.finish()
  const day = new Date().toISOString().slice(0, 10)
  doc.save(`${name}_${day}.pdf`)
}
