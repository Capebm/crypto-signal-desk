import { useEffect, useRef } from 'react'

/** No telemóvel, ao iniciar um scan, leva o ecrã até à barra de progresso. */
export function useScrollToScanOnRun(running: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!running) return
    if (!window.matchMedia('(max-width: 700px)').matches) return
    const id = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [running])
  return ref
}
