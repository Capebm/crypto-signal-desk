import { useEffect, useRef, useState } from 'react'
import { readDeskRiskSnapshot, warningsFor } from './desk-risk-context'
import { buildSignalRecord, logSignals, type BuildSignalInput, type DbState } from './signal-log'
import { getTradingSessionStatus } from './trading-session'

export type LoggableSignal = Omit<BuildSignalInput, 'warnings' | 'at' | 'session'>

/**
 * Regista na BD cada sinal JÁ que aparece nos resultados do scan, com os avisos de risco
 * do momento. Dedupe por signal_key (ativo + lado + janela 15 min).
 */
export function useSignalLogger(signals: LoggableSignal[]): { state?: DbState; lastSent: number } {
  const [state, setState] = useState<DbState>()
  const [lastSent, setLastSent] = useState(0)
  const seen = useRef(new Set<string>())

  const fingerprint = signals.map((s) => `${s.venue}|${s.base}|${s.side}|${s.entry}`).join(',')

  useEffect(() => {
    if (!signals.length) return
    const at = new Date()
    const snapshot = readDeskRiskSnapshot(at)
    const session = getTradingSessionStatus(at).window
    const records = signals
      .map((signal) => buildSignalRecord({
        ...signal,
        session,
        at,
        warnings: warningsFor(signal.venue, signal.instrumentKind, signal.entry, snapshot, at).map((w) => w.code),
      }))
      .filter((record): record is NonNullable<typeof record> => Boolean(record))
      .filter((record) => !seen.current.has(record.signal_key))
    if (!records.length) return
    for (const record of records) seen.current.add(record.signal_key)
    void logSignals(records).then((result) => {
      setState(result.state)
      if (result.sent) setLastSent(Date.now())
    })
    // fingerprint resume a lista; evita re-registar em cada re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint])

  return { state, lastSent }
}
