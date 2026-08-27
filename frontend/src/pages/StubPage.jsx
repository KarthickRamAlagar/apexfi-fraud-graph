import PendingBanner from '@/components/PendingBanner'

export default function StubPage({ title, description, reason }) {
  return (
    <div className="container space-y-4 py-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <PendingBanner>{reason}</PendingBanner>
    </div>
  )
}
