import { cn } from '@/lib/utils'

export function Panel({ title, icon: Icon, children, className }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      {title && (
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          {Icon && <Icon size={15} className="text-muted-foreground" />}
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
