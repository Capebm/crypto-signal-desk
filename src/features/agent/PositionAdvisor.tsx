import { useEffect, useState } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getPlaybookCandles } from '../../lib/binance'
import { binancePriceDisplay } from '../../lib/binance-prices'
import {
  resolvePositionSymbol,
  runPositionAdvice,
  type PositionAdvice,
  type PositionAdviceResult,
} from '../../lib/position-advisor'
import type { RiskProfile } from '../../lib/risk-profile'

const STORAGE_KEY = 'tjr-open-positions'

type SavedPosition = {
  base: string
  entryPrice: string
  quantity: string
  userStop: string
}

const adviceClass = (advice: PositionAdvice) => {
  if (advice === 'SAIR') return 'pos-sair'
  if (advice === 'REALIZAR') return 'pos-realizar'
  if (advice === 'COMPRAR_MAIS') return 'pos-add'
  return 'pos-manter'
}

type Props = { riskProfile: RiskProfile }

export default function PositionAdvisor({ riskProfile }: Props) {
  const [base, setBase] = useState('PEOPLE')
  const [entryPrice, setEntryPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [userStop, setUserStop] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PositionAdviceResult>()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as SavedPosition
      if (saved.base) setBase(saved.base)
      if (saved.entryPrice) setEntryPrice(saved.entryPrice)
      if (saved.quantity) setQuantity(saved.quantity)
      if (saved.userStop) setUserStop(saved.userStop)
    } catch {
      /* ignore */
    }
  }, [])

  const persist = (next: SavedPosition) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const analyze = async () => {
    setError('')
    setResult(undefined)
    const symbol = resolvePositionSymbol(base, AGENT_QUOTE_ASSET)
    const entry = Number(entryPrice.replace(',', '.'))
    const qty = quantity ? Number(quantity.replace(',', '.')) : undefined
    const stop = userStop ? Number(userStop.replace(',', '.')) : undefined
    if (!symbol || !Number.isFinite(entry) || entry <= 0) {
      setError('Indica moeda (ex. PEOPLE) e preço de entrada válido.')
      return
    }
    persist({ base: base.toUpperCase(), entryPrice, quantity, userStop })
    setLoading(true)
    try {
      const advice = await runPositionAdvice(
        { symbol, entryPrice: entry, quantity: Number.isFinite(qty) ? qty : undefined, userStop: Number.isFinite(stop) ? stop : undefined },
        riskProfile,
        getPlaybookCandles,
        BTC_REFERENCE_SYMBOL,
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
      <header className="position-advisor-head">
        <div>
          <p className="eyebrow">POSIÇÃO ABERTA</p>
          <h2>Devo manter, reforçar ou sair?</h2>
          <p>Usa o Cost Price da Binance (Holdings). Analisamos estrutura TJR + o teu preço de entrada.</p>
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
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="PEOPLE ou F" autoCapitalize="characters" />
        </label>
        <label>
          Preço entrada (Cost Price)
          <input value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="0.00477" inputMode="decimal" />
        </label>
        <label>
          Quantidade <span className="optional">(opc.)</span>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="3676" inputMode="decimal" />
        </label>
        <label>
          O teu stop <span className="optional">(opc.)</span>
          <input value={userStop} onChange={(e) => setUserStop(e.target.value)} placeholder="0.00530" inputMode="decimal" />
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
            <div><dt>Stop</dt><dd>{binancePriceDisplay(result.levels.stop)}</dd></div>
            <div><dt>Alvo</dt><dd>{binancePriceDisplay(result.levels.target)}</dd></div>
            <div><dt>Score TJR</dt><dd>{result.decision.score}/100</dd></div>
          </dl>
          <ul className="position-reasons">
            {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </article>
      )}
    </section>
  )
}
