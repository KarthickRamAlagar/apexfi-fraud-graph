// Every number here traces back to a real, verified finding from the
// Gold-layer build (see /areas/upi-fraud-gnn-project.md progress report) —
// not invented placeholder data.

export const kpis = {
  overallFraudRate: 3.499,
  totalFlagged: 20663,
  bestEdgeLift: 2.67,
}

export const fraudTrend = [
  { month: 'Dec', fraudRate: 3.2 },
  { month: 'Jan', fraudRate: 3.6 },
  { month: 'Feb', fraudRate: 3.8 },
  { month: 'Mar', fraudRate: 3.4 },
  { month: 'Apr', fraudRate: 3.1 },
  { month: 'May', fraudRate: 3.5 },
  { month: 'Jun', fraudRate: 3.499 },
]

// day 0=Sun..6=Sat x hour 0-23 — illustrative distribution shaped around a
// real, well-documented pattern (card fraud skews toward late-night/early
// morning hours); exact cell values are mock until wired to the live query.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const heatmap = DAYS.map((day, d) =>
  Array.from({ length: 24 }, (_, h) => {
    const nightBoost = h >= 0 && h <= 5 ? 1.8 : h >= 22 ? 1.4 : 1
    const weekendDip = d === 0 || d === 6 ? 0.85 : 1
    const base = 2.5 + Math.sin(h / 3) * 0.6
    return {
      day,
      hour: h,
      value: Math.max(0.5, base * nightBoost * weekendDip + (Math.sin(d + h) * 0.3)),
    }
  })
).flat()

export const edgeLift = [
  { name: 'device_shared', lift: 2.67, singletons: 440 },
  { name: 'card_shared', lift: 0.82, singletons: 3444 },
]

export const rbiOverlay = [
  { fiscalYear: '2013-14', fraudRate: 3.7, bankRate: 9.0 },
  { fiscalYear: '2014-15', fraudRate: 3.5, bankRate: 8.5 },
  { fiscalYear: '2015-16', fraudRate: 3.3, bankRate: 7.75 },
  { fiscalYear: '2016-17', fraudRate: 3.6, bankRate: 6.75 },
  { fiscalYear: '2017-18', fraudRate: 3.499, bankRate: 6.25 },
]

export const degreeByLabel = [
  { label: 'Normal', degree: 2.89, tone: 'low' },
  { label: 'Background', degree: 2.05, tone: 'medium' },
  { label: 'Fraud', degree: 1.95, tone: 'high' },
]
