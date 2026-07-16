import { useEffect, useState } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getPlaybookCandles } from '../../lib/binance'
import { binancePriceDisplay } from '../../lib/binance-prices'
import {
  loadOpenPosition,
  parseOpenNumber,
  saveOpenPosition,
  type SavedOpenPosition,
} from '../../lib/open-position-store'
import {
  resolvePositionSymbol,
  runPositionAdvice,
  type PositionAdvice,
  type PositionAdviceResult,
} from '../../lib/position-advisor'
import type { RiskProfile } from '../../lib/risk-profile'
import type { TpMode } from '../../lib/tp-mode'
import CoinSearchInput from './CoinSearchInput'

const adviceClass = (advice: PositionAdvice) => {
  if (advice === 'SAIR') return 'pos-sair'
  if (advice === 'REALIZAR') return 'pos-realizar'
  if (advice === 'COMPRAR_MAIS') return 'pos-add'
  return 'pos-manter'
}

type Props = { riskProfile: RiskProfile; tpMode: TpMode; onSaved?: () => void }

export default function PositionAdvisor({ riskProfile, tpMode, onSaved }: Props) {
  const [base, setBase] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [userStop, setUserStop] = useState('')
  const [userTarget, setUserTarget] = useState('')
  const [lockOco, setLockOco] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PositionAdviceResult>()

  useEffect(() => {
    const saved = loadOpenPosition()
    if (!saved) return
    setBase(saved.base)
    setEntryPrice(saved.entryPrice)
    setQuantity(saved.quantity)
    setUserStop(saved.userStop)
    setUserTarget(saved.userTarget)
    setLockOco(saved.lockOco)
  }, [])

  const persist = (next: SavedOpenPosition) => {
    saveOpenPosition(next)
    onSaved?.()
  }

  const analyze = async () => {
    setError('')
    setResult(undefined)
    const symbol = resolvePositionSymbol(base, AGENT_QUOTE_ASSET)
    const entry = parseOpenNumber(entryPrice)
    const qty = parseOpenNumber(quantity)
    const stop = parseOpenNumber(userStop)
    const target = parseOpenNumber(userTarget)
    if (!symbol || entry === undefined) {
      setError('Indica moeda (ex. RE) e preço de entrada válido.')
      return
    }
    persist({
      base: base.toUpperCase(),
      entryPrice,
      quantity,
      userStop,
      userTarget,
      lockOco,
    })
    setLoading(true)
    try {
      const advice = await runPositionAdvice(
        {
          symbol,
          entryPrice: entry,
          quantity: qty,
          userStop: lockOco ? stop : undefined,
          userTarget: lockOco ? target : undefined,
        },
        riskProfile,
        getPlaybookCandles,
        BTC_REFERENCE_SYMBOL,
        tpMode,
      )
      setResult(advice)
    } catch {
      setError('Não foi possível analisar. Confirma o par USDC na Binance e tenta de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="position-advisor">
      {result && (
        <div className={`position-active-banner ${adviceClass(result.advice)}`}>
          <strong>{formatTradingPair(resolvePositionSymbol(base))}</strong>
          <span>{result.label}</span>
          <span className={result.pnlPct >= 0 ? 'positive' : 'negative'}>
            {result.pnlPct >= 0 ? '+' : ''}{result.pnlPct.toFixed(2)}%
            {result.pnlUsdc !== undefined && <> · {result.pnlUsdc >= 0 ? '+' : ''}{result.pnlUsdc.toFixed(2)} USDC</>}
          </span>
        </div>
      )}

      <header className="position-advisor-head">
        <div>
          <p className="eyebrow">POSIÇÃO ABERTA</p>
          <h2>Devo manter, reforçar ou sair?</h2>
          <p>Preenche entrada + OCO. O veredicto <strong>MANTER/SAIR</strong> é o que importa — o score mede só uma <em>nova</em> entrada.</p>
        </div>
      </header>

      <form
        className="position-form"
        onSubmit={(event) => {
          event.preventDefault()
          void analyze()
        }}
      >
        <label>
          Moeda
          <CoinSearchInput value={base} onChange={setBase} placeholder={`Ex.: RE/${AGENT_QUOTE_ASSET}`} />
        </label>
        <label>
          Preço entrada (Cost Price)
          <input value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="0.5145" inputMode="decimal" />
        </label>
        <label>
          Quantidade <span className="optional">(opc.)</span>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="38.8" inputMode="decimal" />
        </label>
        <label>
          Stop OCO <span className="optional">(opc.)</span>
          <input value={userStop} onChange={(e) => setUserStop(e.target.value)} placeholder="0.4960" inputMode="decimal" />
        </label>
        <label>
          TP OCO <span className="optional">(opc.)</span>
          <input value={userTarget} onChange={(e) => setUserTarget(e.target.value)} placeholder="0.5320" inputMode="decimal" />
        </label>
        <label className="position-lock-oco">
          <input type="checkbox" checked={lockOco} onChange={(e) => setLockOco(e.target.checked)} />
          Usar stop/TP do OCO (não recalcular)
        </label>
        <button type="submit" disabled={loading}>{loading ? 'A analisar…' : 'Analisar posição'}</button>
      </form>

      {error && <p className="position-error">{error}</p>}

      {result && (
        <article className={`position-result ${adviceClass(result.advice)}`}>
          <p className="position-pair">{formatTradingPair(resolvePositionSymbol(base))}</p>
          <strong className="position-verdict">{result.label}</strong>
          <p className="position-summary">{result.summary}</p>
          <dl className="position-metrics">
            <div><dt>Preço agora</dt><dd>{binancePriceDisplay(result.currentPrice)}</dd></div>
            <div><dt>PnL</dt><dd className={result.pnlPct >= 0 ? 'positive' : 'negative'}>{result.pnlPct.toFixed(2)}%</dd></div>
            <div><dt>Em R</dt><dd>{result.riskR >= 0 ? '+' : ''}{result.riskR.toFixed(2)}R</dd></div>
            {result.pnlUsdc !== undefined && (
              <div><dt>PnL USDC</dt><dd className={result.pnlUsdc >= 0 ? 'positive' : 'negative'}>{result.pnlUsdc.toFixed(2)}</dd></div>
            )}
            <div><dt>Stop</dt><dd>{binancePriceDisplay(result.levels.stop)}{result.usingEntryOco ? ' · OCO' : ''}</dd></div>
            <div><dt>Alvo</dt><dd>{binancePriceDisplay(result.levels.target)}{result.usingEntryOco ? ' · OCO' : ''}</dd></div>
            <div><dt>Score nova entrada</dt><dd>{result.decision.score}/100</dd></div>
          </dl>
          <p className="position-score-note">Score baixo numa posição aberta é normal — mede “compraria de novo agora?”, não “devo segurar?”.</p>
          <ul className="position-reasons">
            {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </article>
      )}
    </section>
  )
}
