import { cn } from '@/lib/utils'

/**
 * Step progress indicator. Vertical mode (used by Score New Transaction)
 * stacks steps top-to-bottom with a flexible connector that stretches to
 * fill the available height, matching the result panel next to it.
 *
 * Completed steps keep their OWN icon (not a checkmark) on a solid green
 * background — deliberately, not the more common checkmark pattern.
 */
export default function Stepper({ steps, currentStep, vertical = false }) {
  if (vertical) {
    return (
      <div className="flex flex-col items-center h-full">
        {steps.map((step, i) => {
          const isCompleted = i < currentStep
          const isCurrent = i === currentStep
          const Icon = step.icon

          return (
            <div key={step.label} className={cn('flex flex-col items-center', i < steps.length - 1 && 'flex-1')}>
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300',
                  isCompleted && 'border-risk-low bg-risk-low text-background',
                  isCurrent && 'border-primary bg-primary text-primary-foreground',
                  !isCompleted && !isCurrent && 'border-border bg-secondary/30 text-muted-foreground'
                )}
              >
                <Icon size={18} />
              </div>
              <span
                className={cn(
                  'mt-2 max-w-[100px] text-center text-[11px] leading-tight',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'my-3 w-0.5 flex-1 transition-colors duration-300',
                    isCompleted ? 'bg-risk-low' : 'bg-border'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // horizontal mode, kept for any other future use
  return (
    <div className="flex items-start mb-8">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep
        const isCurrent = i === currentStep
        const Icon = step.icon

        return (
          <div key={step.label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300',
                  isCompleted && 'border-risk-low bg-risk-low text-background',
                  isCurrent && 'border-primary bg-primary text-primary-foreground',
                  !isCompleted && !isCurrent && 'border-border bg-secondary/30 text-muted-foreground'
                )}
              >
                <Icon size={16} />
              </div>
              <span
                className={cn(
                  'whitespace-nowrap text-xs',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn('mx-2 h-0.5 flex-1 transition-colors duration-300', isCompleted ? 'bg-risk-low' : 'bg-border')}
                style={{ marginBottom: '1.5rem' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}