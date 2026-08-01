import { useEffect, useState } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getPlaybookCandles } from '../../lib/binance'
import { addManualClosedTrade } from '../../lib/journal/trade-store'
import { clearOpenPosition, loadOpenPosition, parseOpenNumber, type SavedOpenPosition } from '../../lib/open-position-store'
import { hoursSinceIso, isPastTimeStop, TIME_STOP_HOURS, TIME_STOP_NOTE } from '../../lib/trade-guards'
import { resolvePositionSymbol, runPositionAdvice, type PositionAdviceResult } from '../../lib/position-advisor'
import type { RiskProfile } from '../../lib/risk-profile'
import type { TpMode } from '../../lib/tp-mode'

type Props = {
  riskProfile: RiskProfile
  tpMode: TpMode
  refreshKey?: number
  onCleared?: () => void
  onOpenAdvisor?: () => void
}

export default function ActivePositionPin({ riskProfile, tpMode, refreshKey = 0, onCleared, onOpenAdvisor }: Props) {
  const [saved, setSaved] = useState<SavedOpenPosition | undefined>(() => loadOpenPosition())
  const [result, setResult] = useState<PositionAdviceResult>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setSaved(loadOpenPosition())
  }, [refreshKey])

  useEffect(() => {
    if (!saved) {
      setResult(undefined)
      return
    }
    const entry = parseOpenNumber(saved.entryPrice)
    if (!entry) return
    let cancelled = false
    const tick = async () => {
      setLoading(true)
      try {
        const stop = parseOpenNumber(saved.userStop)
        const target = parseOpenNumber(saved.userTarget)
        const qty = parseOpenNumber(saved.quantity)
        const advice = await runPositionAdvice(
          {
            symbol: resolvePositionSymbol(saved.base, AGENT_QUOTE_ASSET),
            entryPrice: entry,
            quantity: qty,
            userStop: saved.lockOco ? stop : undefined,
            userTarget: saved.lockOco ? target : undefined,
          },
          riskProfile,
          getPlaybookCandles,
          BTC_REFERENCE_SYMBOL,
          tpMode,
        )
        if (!cancelled) setResult(advice)
      } catch {
        if (!cancelled) setResult(undefined)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 45_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [saved?.base, saved?.entryPrice, saved?.quantity, saved?.userStop, saved?.userTarget, saved?.lockOco, riskProfile, tpMode])

  if (!saved) return null

  const pair = formatTradingPair(resolvePositionSymbol(saved.base))
  const heldHours = hoursSinceIso(saved.savedAt)
  const pastTimeStop = isPastTimeStop(saved.savedAt)
  const adviceClass =
    result?.advice === 'SAIR' ? 'pos-sair'
      : result?.advice === 'REALIZAR' ? 'pos-realizar'
        : result?.advice === 'COMPRAR_MAIS' ? 'pos-add'
          : 'pos-manter'

  const closeToJournal = () => {
    const entry = parseOpenNumber(saved.entryPrice)
    const qty = parseOpenNumber(saved.quantity)
    if (!entry || !qty) {
      clearOpenPosition()
      setSaved(undefined)
      setResult(undefined)
      onCleared?.()
      return
    }
    const suggested = result?.currentPrice
    const raw = window.prompt(
      `Preço de saída (${AGENT_QUOTE_ASSET}) — regista no Diário com meta do sinal`,
      suggested !== undefined ? String(suggested) : '',
    )
    if (raw === null) return
    const exit = Number(raw.replace(',', '.'))
    if (!Number.isFinite(exit) || exit <= 0) {
      window.alert('Preço de saída inválido.')
      return
    }
    const entryTime = saved.savedAt ? Date.parse(saved.savedAt) : Date.now() - 60_000
    addManualClosedTrade({
      symbol: resolvePositionSymbol(saved.base, AGENT_QUOTE_ASSET),
      entryPrice: entry,
      exitPrice: exit,
      quantity: qty,
      entryTime: Number.isFinite(entryTime) ? entryTime : Date.now() - 60_000,
      exitTime: Date.now(),
      signal: saved.signal,
    })
    clearOpenPosition()
    setSaved(undefined)
    setResult(undefined)
    onCleared?.()
  }

  return (
    <div className={`active-position-pin ${adviceClass}`}>
      <div className="active-position-pin-main">
        <strong>{pair}</strong>
        <span className="active-position-verdict">{loading && !result ? 'A actualizar…' : result?.label ?? 'Posição guardada'}</span>
        {result && (
          <span className={result.pnlPct >= 0 ? 'positive' : 'negative'}>
            {result.pnlPct >= 0 ? '+' : ''}{result.pnlPct.toFixed(2)}%
            {result.pnlUsdc !== undefined && <> · {result.pnlUsdc >= 0 ? '+' : ''}{result.pnlUsdc.toFixed(2)} {AGENT_QUOTE_ASSET}</>}
          </span>
        )}
        {heldHours !== undefined && (
          <span className={pastTimeStop ? 'negative' : 'desk-sub'} title={TIME_STOP_NOTE}>
            {heldHours.toFixed(1)}h{pastTimeStop ? ` · time-stop ${TIME_STOP_HOURS}h` : ''}
          </span>
        )}
        {saved.signal && (
          <span className="desk-sub" title="Meta do sinal na entrada">
            score {saved.signal.score}
            {saved.signal.softOpposed ? ' · malha' : ''}
            {saved.signal.riskyHighLong ? ' · H' : ''}
          </span>
        )}
      </div>
      <div className="active-position-pin-actions">
        {onOpenAdvisor && (
          <button type="button" className="ghost-sm" onClick={onOpenAdvisor}>Detalhe</button>
        )}
        <button type="button" className="ghost-sm" onClick={closeToJournal} title="Regista saída no Diário e limpa a pin">
          Fechou
        </button>
      </div>
    </div>
  )
}
