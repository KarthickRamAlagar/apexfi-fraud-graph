// The sidebar groups. The same pages the old top bar had (main row and "More"), now grouped.
// now laid out in groups. Add a page here and it appears in the sidebar, the page title and the search.
import {
  LayoutDashboard, Database, Search as SearchIcon, ScanLine, UserSearch, LineChart, Sparkles, MessageCircleQuestion,
  Table2, ListTree, GaugeCircle, Clock, FileText, Scale, Coins, Target, Bitcoin, Info, Activity, Settings, FlaskConical, BarChart3, Network,
} from 'lucide-react'

export const NAV_GROUPS = [
  {
    id: 'overview', label: 'Overview',
    items: [{ path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    id: 'data', label: 'Data',
    items: [
      { path: '/datasets', label: 'Datasets', icon: Database },
      { path: '/eda', label: 'EDA', icon: Sparkles },
      { path: '/profiling', label: 'Full Profiling', icon: ListTree },
      { path: '/eda-charts', label: 'EDA Charts', icon: BarChart3 },
      { path: '/raw-data', label: 'Raw Data Browser', icon: Table2 },
      { path: '/ask', label: 'Ask your data', icon: MessageCircleQuestion },
      { path: '/analytics', label: 'Analytics', icon: LineChart },
    ],
  },
  {
    id: 'detect', label: 'Detect',
    items: [
      { path: '/investigate', label: 'Investigate', icon: SearchIcon },
      { path: '/score-new', label: 'Score New Transaction', icon: ScanLine },
      { path: '/score-account', label: 'Score Unlabeled Account', icon: UserSearch },
      { path: '/ethereum-fraud', label: 'Blockchain Fraud (Experiment)', icon: Bitcoin },
    ],
  },
  {
    id: 'evaluate', label: 'Evaluation',
    items: [
      { path: '/v2-evaluation', label: 'V2 Evaluation', icon: GaugeCircle },
      { path: '/evaluation-metrics', label: 'Evaluation Metrics', icon: Network },
      { path: '/model-evaluation', label: 'Model Evaluation', icon: FlaskConical },
      { path: '/temporal-validation', label: 'Temporal Validation', icon: Clock },
      { path: '/temporal-full-report', label: 'Full Temporal Report', icon: FileText },
      { path: '/model-comparison', label: 'Model Comparison', icon: Scale },
    ],
  },
  {
    id: 'impact', label: 'Impact',
    items: [
      { path: '/economics', label: 'Economic & SDG Impact', icon: Coins },
      { path: '/sdg-lab', label: 'SDG Lab (V2)', icon: Target },
    ],
  },
  {
    id: 'system', label: 'System',
    items: [
      { path: '/ops', label: 'Ops', icon: Activity },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/about', label: 'About ApexFi', icon: Info },
    ],
  },
]

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))

export function titleFor(pathname) {
  const hit = ALL_NAV.find((i) => (i.end ? pathname === i.path : pathname === i.path || pathname.startsWith(i.path + '/')))
  return hit || { label: 'ApexFi', group: '' }
}
