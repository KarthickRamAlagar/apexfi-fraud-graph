// Mock data shaped to match what the real /api/dashboard/summary endpoint
// returns — swapping to the real API later should require minimal changes.

export const mockDatasets = [
  {
    key: 'ieee_cis',
    label: 'IEEE-CIS',
    sublabel: 'Card transactions',
    total: 590540,
    fraudRate: 3.499,
    trend: [3.1, 3.3, 3.2, 3.6, 3.4, 3.5, 3.499],
  },
  {
    key: 'dgraph_fin',
    label: 'DGraph-Fin',
    sublabel: 'User network',
    total: 3700550,
    fraudRate: 1.27,
    trend: [1.4, 1.3, 1.35, 1.2, 1.25, 1.28, 1.27],
  },
  {
    key: 'rbi_npci',
    label: 'RBI / NPCI',
    sublabel: 'Macro context',
    total: 34,
    fraudRate: null,
    trend: [6.75, 6.5, 6.25, 6.25, 6.25, 6.25, 6.25],
  },
]

export const mockOverview = {
  totalTransactions: 590540 + 3700550,
  totalFraudFlagged: 20663 + 15509,
  graphEdges: 17322878 + 4300999,
  modelStatus: 'not_trained',
}

export const mockFraudTrend = [
  { month: 'Dec', fraudRate: 3.2 },
  { month: 'Jan', fraudRate: 3.6 },
  { month: 'Feb', fraudRate: 3.8 },
  { month: 'Mar', fraudRate: 3.4 },
  { month: 'Apr', fraudRate: 3.1 },
  { month: 'May', fraudRate: 3.5 },
  { month: 'Jun', fraudRate: 3.499 },
]

export const mockRiskDistribution = [
  { label: 'Normal', value: 96.5, tone: 'low' },
  { label: 'Under review', value: 2.1, tone: 'medium' },
  { label: 'High risk', value: 1.4, tone: 'high' },
]

export const mockRecentTransactions = [
  { id: 'TX-590112', amount: '₹1,240.00', device: 'shared (3x)', card: 'shared (2x)', status: 'pending' },
  { id: 'TX-590098', amount: '₹89.50', device: 'unique', card: 'unique', status: 'pending' },
  { id: 'TX-590077', amount: '₹4,510.00', device: 'shared (7x)', card: 'shared (5x)', status: 'pending' },
  { id: 'TX-590055', amount: '₹210.00', device: 'unique', card: 'shared (2x)', status: 'pending' },
  { id: 'TX-590034', amount: '₹76.20', device: 'unique', card: 'unique', status: 'pending' },
]

export const mockTopRiskEntities = [
  { name: 'DEVICE-88f2', volume: '440 txns', change: 'lift 2.67x' },
  { name: 'CARD-1a9e', volume: '312 txns', change: 'lift 0.82x' },
  { name: 'DEVICE-c701', volume: '287 txns', change: 'lift 2.41x' },
  { name: 'CARD-77bd', volume: '198 txns', change: 'lift 0.94x' },
]
