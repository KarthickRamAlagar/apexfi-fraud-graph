// Endpoints added with the new layout (Ops, profiling, raw data, model evaluation).
// Kept in its own file so lib/api.js (which has local edits) is not touched.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`)
  let data = null
  try { data = await res.json() } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.detail) || `API error ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

// Any HTTP answer means the server is up. Only a network error means offline.
export async function pingApi() {
  try { await fetch(`${API_BASE}/api/ops/health`, { method: 'GET' }); return true } catch { return false }
}

export const api2 = {
  opsSummary: () => getJson('/api/ops/summary'),
  opsHealth: () => getJson('/api/ops/health'),
  deepOverview: () => getJson('/api/deep/overview'),
  deepProfiling: (table) => getJson(`/api/deep/profiling/${table}`),
  deepColumn: (table, col) => getJson(`/api/deep/column/${table}/${encodeURIComponent(col)}`),
  deepRaw: (table, params) => getJson(`/api/deep/raw/${table}?${new URLSearchParams(params).toString()}`),
  deepRawCsvUrl: (table, params) => `${API_BASE}/api/deep/raw/${table}.csv?${new URLSearchParams(params).toString()}`,
  modelEvaluation: () => getJson('/api/deep/model-evaluation'),
  evalCurves: () => getJson('/api/eval/curves'),
  evalFeatureGroups: () => getJson('/api/eval/feature-groups'),
  evalBayesNet: () => getJson('/api/eval/bayes-net'),
  edaColumns: (table) => getJson(`/api/deep/eda-columns/${table}`),
  edaBox: (table, columns) => getJson(`/api/deep/box/${table}?columns=${encodeURIComponent(columns.join(','))}`),
  edaScatter: (table, x, y) => getJson(`/api/deep/scatter/${table}?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`),
  edaCorrelation: (table, columns, top = 18) => getJson(`/api/deep/correlation/${table}?top=${top}${columns && columns.length ? `&columns=${encodeURIComponent(columns.join(','))}` : ''}`),
}
