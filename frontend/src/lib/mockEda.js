// Shape numbers are REAL (verified Gold-layer counts). Distribution/
// correlation/quality percentages are illustrative mock values until the
// full statistical profiling backend is wired up.

export const edaDatasets = {
  ieee_cis: {
    label: 'IEEE-CIS Transactions',
    rows: 590540,
    totalColumns: 440,
    targetColumn: 'is_fraud',
    independentColumns: 439,
    dependentColumns: 1,
    quality: { valid: 71.2, missing: 27.4, duplicate: 1.4 },
    statColumns: [
      { key: 'TransactionAmt', meaning: 'Transaction amount, in USD.' },
      { key: 'C1', meaning: 'Anonymized counting feature — e.g. number of addresses linked to this card.' },
      { key: 'D1', meaning: 'Anonymized time-delta feature — days since a related prior event.' },
      { key: 'day_of_week', meaning: 'Derived feature: day of week the transaction occurred (0 = Sun … 6 = Sat).' },
    ],
    stats: {
      TransactionAmt: { mean: 134.62, std: 227.35, min: 0.25, p25: 41.95, p50: 68.5, p75: 125.0, max: 31937.39, count: 590540 },
      C1: { mean: 15.2, std: 42.1, min: 0, p25: 1, p50: 3, p75: 12, max: 4685, count: 590540 },
      D1: { mean: 96.3, std: 111.4, min: 0, p25: 0, p50: 41, p75: 174, max: 640, count: 589271 },
      day_of_week: { mean: 3.1, std: 1.98, min: 0, p25: 1, p50: 3, p75: 5, max: 6, count: 590540 },
    },
    histogram: {
      TransactionAmt: [4, 9, 22, 41, 68, 95, 120, 98, 71, 44, 28, 15, 9, 5, 3, 2],
      C1: [180, 220, 140, 90, 55, 34, 20, 12, 7, 4, 2, 1, 1, 0, 0, 0],
      D1: [90, 60, 45, 38, 33, 30, 28, 27, 26, 25, 24, 22, 18, 12, 6, 2],
      day_of_week: [58, 71, 82, 90, 88, 79, 62, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    correlationLabels: ['TxnAmt', 'C1', 'D1', 'DOW', 'is_fraud'],
    correlationMeanings: {
      TxnAmt: 'Transaction amount',
      C1: 'Counting feature (addresses linked)',
      D1: 'Time-delta feature (days since event)',
      DOW: 'Day of week',
      is_fraud: 'Target label',
    },
    correlationMatrix: [
      [1.00, 0.18, -0.09, 0.02, 0.11],
      [0.18, 1.00, -0.31, 0.04, 0.24],
      [-0.09, -0.31, 1.00, -0.06, -0.14],
      [0.02, 0.04, -0.06, 1.00, 0.03],
      [0.11, 0.24, -0.14, 0.03, 1.00],
    ],
    categorical: [
      { label: 'ProductCD: W', count: 439670 },
      { label: 'ProductCD: C', count: 68519 },
      { label: 'ProductCD: R', count: 37699 },
      { label: 'ProductCD: H', count: 33024 },
      { label: 'ProductCD: S', count: 11628 },
    ],
    graph: {
      edgeTypes: 2,
      totalEdges: 17322878,
      avgDegree: 58.7,
      note: 'device_shared (real signal, lift 2.67x) + card_shared (structural, lift 0.82x)',
    },
  },
  dgraph_fin: {
    label: 'DGraph-Fin Users',
    rows: 3700550,
    totalColumns: 24,
    targetColumn: 'label',
    independentColumns: 23,
    dependentColumns: 1,
    quality: { valid: 99.6, missing: 0.0, duplicate: 0.0 },
    statColumns: [
      { key: 'x0', meaning: 'Anonymized node feature — one of 17 DGraph-Fin user features (x0-x16).' },
      { key: 'x3', meaning: 'Anonymized node feature — one of 17 DGraph-Fin user features (x0-x16).' },
      { key: 'total_degree', meaning: 'Number of emergency-contact connections for this user (in + out).' },
      { key: 'node_timestamp', meaning: 'Fraud-onset timestamp — only present for fraud-labeled nodes.' },
    ],
    stats: {
      x0: { mean: 0.02, std: 0.98, min: -3.4, p25: -0.61, p50: 0.01, p75: 0.63, max: 3.9, count: 3700550 },
      x3: { mean: -0.01, std: 1.02, min: -3.8, p25: -0.66, p50: -0.02, p75: 0.64, max: 4.1, count: 3700550 },
      total_degree: { mean: 2.33, std: 3.12, min: 0, p25: 1, p50: 2, p75: 3, max: 210, count: 3700550 },
      node_timestamp: { mean: null, std: null, min: 0, p25: null, p50: null, p75: null, max: 821, count: 15509 },
    },
    histogram: {
      x0: [3, 8, 20, 45, 90, 140, 175, 175, 140, 90, 45, 20, 8, 3, 1, 0],
      x3: [2, 7, 18, 42, 88, 138, 178, 178, 138, 88, 42, 18, 7, 2, 1, 0],
      total_degree: [180, 620, 940, 710, 420, 240, 130, 70, 38, 19, 10, 5, 3, 2, 1, 1],
      node_timestamp: [45, 52, 60, 55, 48, 42, 38, 35, 33, 30, 28, 25, 20, 15, 10, 5],
    },
    correlationLabels: ['x0', 'x3', 'degree', 'label'],
    correlationMeanings: {
      x0: 'Anonymized user feature',
      x3: 'Anonymized user feature',
      degree: 'Emergency-contact connection count',
      label: 'Target label',
    },
    correlationMatrix: [
      [1.00, 0.06, -0.03, 0.02],
      [0.06, 1.00, 0.04, -0.05],
      [-0.03, 0.04, 1.00, -0.19],
      [0.02, -0.05, -0.19, 1.00],
    ],
    categorical: [
      { label: 'Normal', count: 1210092 },
      { label: 'Background', count: 2474949 },
      { label: 'Fraud', count: 15509 },
    ],
    graph: {
      edgeTypes: 11,
      totalEdges: 4300999,
      avgDegree: 2.33,
      note: 'Native emergency-contact graph — fraud users show lower avg. degree (1.95) than normal (2.89)',
    },
  },
}
