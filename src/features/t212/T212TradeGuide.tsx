import { useState } from 'react'
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
  const ready = decision.action === 'COMPRAR' && (decision.entryTiming === 'AGORA' || decision.entryTiming === 'RETRACE')
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
          ? ' (FOREX / metal na T212).'
          : ' (índice USA Tech 100 / USA 500).'}
        {' '}Long-only neste módulo. Stop + Take profit no ticket.
      </p>

      {!ready ? (
        <p className="binance-order-wait">Sem níveis de entrada — espera COMPRAR JÁ ou AGUARDAR na NY open.</p>
      ) : (
        <>
          <div className="t212-levels">
            <div><span>Entrada</span><strong>{fmt(decision.entry)}</strong></div>
            <div><span>Stop</span><strong className="negative">{fmt(decision.stop)}</strong></div>
            <div><span>TP</span><strong className="positive">{fmt(decision.target)}</strong></div>
            <div><span>R:R</span><strong>{decision.riskReward?.toFixed(1) ?? '—'}×</strong></div>
          </div>
          {riskPct !== undefined && (
            <p className="desk-sub">Distância ao stop ≈ {riskPct.toFixed(2)}% · stake sugerido {stakeEur} €</p>
          )}
          <ol className="t212-steps">
            <li>Abre Trading 212 → conta <strong>CFD</strong> (não Invest).</li>
            <li>Pesquisa <strong>{instrument.t212Search}</strong> e abre o instrumento.</li>
            <li>Toca <strong>Buy</strong> (long). Ajusta tamanho para ~{stakeEur} € de margem/exposição.</li>
            <li>Activa <strong>Stop loss</strong> @ {fmt(decision.stop)} e <strong>Take profit</strong> @ {fmt(decision.target)}.</li>
            <li>Confirma. Depois regista o trade no Diário (moeda = {instrument.short}).</li>
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
