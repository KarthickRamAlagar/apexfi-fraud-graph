import { useEffect, useState } from 'react'
import { Network, Laptop } from 'lucide-react'

const MIN_WIDTH = 768 // blocks phones, allows tablets and up

export default function DesktopOnlyGate({ children }) {
  const [isWideEnough, setIsWideEnough] = useState(
    typeof window === 'undefined' ? true : window.innerWidth >= MIN_WIDTH
  )

  useEffect(() => {
    function handleResize() {
      setIsWideEnough(window.innerWidth >= MIN_WIDTH)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (isWideEnough) return children

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Network size={22} />
      </div>
      <h1 className="font-display text-xl font-semibold">ApexFi is built for larger screens</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This is a financial monitoring platform, best viewed on a laptop or desktop — for the full
        experience, please open ApexFi on a larger screen.
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Laptop size={14} />
        Try a laptop or desktop
      </div>
    </div>
  )
}
