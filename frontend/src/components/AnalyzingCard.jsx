import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Landmark } from 'lucide-react'

/**
 * A polished, Claude.ai-style loading state — a gently pulsing bank icon
 * with cycling status text, used for any real inference call that takes
 * a couple of seconds. Shared across both Score pages for consistency.
 */
export default function AnalyzingCard({ steps, title = 'Analyzing' }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    setStepIndex(0)
    const timer = setInterval(
      () => setStepIndex((i) => Math.min(i + 1, steps.length - 1)),
      900
    )
    return () => clearInterval(timer)
  }, [steps])

  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="relative flex items-center justify-center w-16 h-16">
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/20"
          animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="relative flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 text-primary"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Landmark size={22} />
        </motion.div>
      </div>

      <div className="text-center">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="h-5 mt-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={stepIndex}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-xs text-muted-foreground"
            >
              {steps[stepIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}