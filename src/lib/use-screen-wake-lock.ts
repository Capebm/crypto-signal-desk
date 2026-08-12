import { useEffect } from 'react'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

/** Mantém o ecrã acordado durante scans; readquire quando a app volta ao primeiro plano. */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return

    let sentinel: WakeLockSentinelLike | undefined
    let cancelled = false

    const acquire = async () => {
      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock
      if (!wakeLock || document.visibilityState !== 'visible') return
      try {
        const next = await wakeLock.request('screen')
        if (cancelled) {
          await next.release()
          return
        }
        sentinel = next
      } catch {
        /* Browser/OS pode recusar (ex.: bateria baixa); o scan continua. */
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (sentinel && !sentinel.released) void sentinel.release()
    }
  }, [active])
}
