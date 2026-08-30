import { cn } from '@/lib/utils'

export function Panel({ title, icon: Icon, headerAction, children, className }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {Icon && <Icon size={15} className="text-muted-foreground" />}
            {title}
          </div>
          {headerAction}
        </div>
      )}
      {children}
    </div>
  )
}