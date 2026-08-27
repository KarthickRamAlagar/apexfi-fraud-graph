const API_BASE = 'http://localhost:8000'

async function fetchJson(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options)
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.detail || `API error ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  dashboardSummary: () => fetchJson('/api/dashboard/summary'),
  recentTransactions: () => fetchJson('/api/dashboard/recent-transactions'),
  datasets: () => fetchJson('/api/datasets/'),
  analytics: () => fetchJson('/api/analytics/'),
  eda: (dataset) => fetchJson(`/api/eda/${dataset}`),
  investigateSamples: () => fetchJson('/api/investigate/samples'),
  investigate: (id) => fetchJson(`/api/investigate/${id}`),
  ask: (question, language) =>
    fetchJson('/api/ask/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, language }),
    }),
}
