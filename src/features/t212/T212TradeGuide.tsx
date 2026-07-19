import { goToCryptoTab } from '../../lib/crypto-tabs'
import { tjrActionLabel, type TjrDecision } from '../../lib/tjr-engine'
import type { T212Instrument } from '../../lib/yahoo-market'

type Props = {
  instrument: T212Instrument
  decision: TjrDecision
  stakeEur: number
}

const fmt = (value?: number, digits = 2) => {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value >= 100) return value.toFixed(digits)
  if (value >= 1) return value.toFixed(Math.max(digits, 3))
  return value.toPrecision(5)
}

export default function T212TradeGuide({ instrument, decision, stakeEur }: Props) {
  const ready =
    (decision.action === 'COMPRAR' || decision.action === 'VENDER')
    && (decision.entryTiming === 'AGORA' || decision.entryTiming === 'RETRACE')
  const isShort = decision.action === 'VENDER'
  const sideLabel = isShort ? 'Sell' : 'Buy'
  const riskPct = decision.entry && decision.stop
    ? (Math.abs(decision.entry - decision.stop) / decision.entry) * 100
    : undefined

  return (
    <section className="binance-order-panel t212-guide">
      <header className="binance-order-head">
        <div>
          <p className="eyebrow">Trading 212 · CFD</p>
          <h3>{instrument.t212Label} · {tjrActionLabel(decision)}</h3>
        </div>
        <span className="desk-sub">Execução manual — sem API</span>
      </header>

      <p className="t212-guide-plan">
        Conta <strong>CFD</strong> → pesquisa <strong>{instrument.t212Search}</strong>
        {instrument.kind === 'forex' || instrument.kind === 'metal'
          ? ' (FOREX / metal).'
          : ' (índice).'}
        {' '}Long <strong>e short</strong> (Buy / Sell). Stop + Take profit no ticket.
      </p>

      {!ready ? (
        <p className="binance-order-wait">Sem níveis — espera COMPRAR/VENDER na sessão (dias úteis, preferir NY open).</p>
      ) : (
        <>
          <div className="t212-levels">
            <div><span>Lado</span><strong className={isShort ? 'negative' : 'positive'}>{sideLabel}</strong></div>
            <div><span>Entrada</span><strong>{fmt(decision.entry)}</strong></div>
            <div><span>Stop</span><strong className="negative">{fmt(decision.stop)}</strong></div>
            <div><span>TP</span><strong className="positive">{fmt(decision.target)}</strong></div>
          </div>
          {riskPct !== undefined && (
            <p className="desk-sub">R:R {decision.riskReward?.toFixed(1) ?? '—'}× · stop ≈ {riskPct.toFixed(2)}% · stake ~{stakeEur} €</p>
          )}
          <ol className="t212-steps">
            <li>Abre Trading 212 → conta <strong>CFD</strong>.</li>
            <li>Pesquisa <strong>{instrument.t212Search}</strong>.</li>
            <li>Toca <strong>{sideLabel}</strong> ({isShort ? 'short' : 'long'}). Ajusta tamanho ~{stakeEur} €.</li>
            <li>Stop @ {fmt(decision.stop)} · Take profit @ {fmt(decision.target)}.</li>
            <li>Confirma e regista no Diário ({instrument.short}).</li>
          </ol>
          <div className="binance-wizard-footer">
            <button type="button" className="ghost" onClick={() => goToCryptoTab('journal')}>
              Abrir Diário
            </button>
          </div>
        </>
      )}
    </section>
  )
}
