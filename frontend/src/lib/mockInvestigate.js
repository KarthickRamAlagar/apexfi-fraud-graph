// A small, realistic connected network — two clusters formed by the two
// real edge types we built (device_shared, card_shared), so exploring it
// demonstrates the actual finding: device-sharing clusters correlate with
// fraud more strongly than card-sharing (lift 2.67x vs 0.82x).

export const mockTransactions = {
  'TX-590112': { amount: '₹1,240.00', productCD: 'W', card: 'card1: 9821', device: 'DeviceInfo: SM-G960U', date: '2018-03-14', isFlagged: true },
  'TX-590098': { amount: '₹89.50', productCD: 'C', card: 'card1: 4471', device: 'DeviceInfo: SM-G960U', date: '2018-03-14', isFlagged: false },
  'TX-590077': { amount: '₹4,510.00', productCD: 'W', card: 'card1: 9821', device: 'DeviceInfo: SM-G960U', date: '2018-03-13', isFlagged: true },
  'TX-590055': { amount: '₹210.00', productCD: 'W', card: 'card1: 9821', device: 'DeviceInfo: iOS-14.2', date: '2018-03-15', isFlagged: false },
  'TX-590034': { amount: '₹76.20', productCD: 'R', card: 'card1: 2290', device: 'DeviceInfo: SM-G960U', date: '2018-03-12', isFlagged: false },
  'TX-590021': { amount: '₹3,880.00', productCD: 'C', card: 'card1: 4471', device: 'DeviceInfo: Win10x64', date: '2018-03-11', isFlagged: true },
  'TX-590009': { amount: '₹142.75', productCD: 'W', card: 'card1: 9821', device: 'DeviceInfo: SM-G960U', date: '2018-03-16', isFlagged: false },
}

// edges reference the two real edge types built in Gold
export const mockEdges = [
  { source: 'TX-590112', target: 'TX-590098', type: 'device_shared' },
  { source: 'TX-590112', target: 'TX-590077', type: 'device_shared' },
  { source: 'TX-590112', target: 'TX-590034', type: 'device_shared' },
  { source: 'TX-590112', target: 'TX-590009', type: 'device_shared' },
  { source: 'TX-590112', target: 'TX-590077', type: 'card_shared' },
  { source: 'TX-590112', target: 'TX-590055', type: 'card_shared' },
  { source: 'TX-590112', target: 'TX-590009', type: 'card_shared' },
  { source: 'TX-590077', target: 'TX-590021', type: 'card_shared' },
]

export function getNeighbors(centerId) {
  return mockEdges
    .filter((e) => e.source === centerId || e.target === centerId)
    .map((e) => ({
      id: e.source === centerId ? e.target : e.source,
      type: e.type,
    }))
}
