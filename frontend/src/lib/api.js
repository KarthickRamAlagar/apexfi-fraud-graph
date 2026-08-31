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
  investigateSearch: (q) => fetchJson(`/api/investigate/search?q=${encodeURIComponent(q)}`),
  investigate: (id) => fetchJson(`/api/investigate/${id}`),
  scoreNewTransaction: (payload) =>
    fetchJson('/api/predict/new-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  dgraphFinSamples: () => fetchJson('/api/dgraph-fin/samples'),
  dgraphFinSearch: (q) => fetchJson(`/api/dgraph-fin/search?q=${encodeURIComponent(q)}`),
  dgraphFinScore: (nodeId) => fetchJson(`/api/dgraph-fin/score/${nodeId}`),
  ask: (question, language) =>
    fetchJson('/api/ask/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, language }),
    }),
ethereumFraudSamples: () => fetchJson('/api/ethereum-fraud/samples'),
ethereumFraudSearch: (q) => fetchJson(`/api/ethereum-fraud/search?q=${encodeURIComponent(q)}`),
ethereumFraudScore: (address) => fetchJson(`/api/ethereum-fraud/score/${address}`),
}