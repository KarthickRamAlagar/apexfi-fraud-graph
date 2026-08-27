import { CheckCircle2 } from 'lucide-react'

export default function StatusBadge({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-risk-low">
      <CheckCircle2 size={13} />
      {status}
    </span>
  )
}
