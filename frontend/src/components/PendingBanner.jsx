export default function PendingBanner({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}
