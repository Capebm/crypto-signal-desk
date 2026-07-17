import { useEffect, useState, type CSSProperties } from 'react'
import PriceChart from '../chart/PriceChart'
import MarketClocks from '../agent/MarketClocks'
import T212TradeGuide from './T212TradeGuide'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import { evaluateTjrFull, tjrActionLabel, tjrScoreColor, type TjrDecision } from '../../lib/tjr-engine'
import { getMarketClocks, getTradingSessionStatus } from '../../lib/trading-session'
import type { Interval } from '../../lib/types'
import {
  DEFAULT_T212_INSTRUMENT,
  T212_INSTRUMENTS,
  fetchYahooCandlesRaw,
  getT212PlaybookCandles,
  type T212Instrument,
} from '../../lib/yahoo-market'

const RISK_KEY = 't212-risk-index'
const TP_KEY = 't212-tp-mode'
const STAKE_KEY = 't212-stake-eur'
const INSTRUMENT_KEY = 't212-instrument'

const STAKE_OPTIONS = [20, 50, 100, 200] as const

const readInstrument = (): T212Instrument => {
  try {
    const id = localStorage.getItem(INSTRUMENT_KEY)
    return T212_INSTRUMENTS.find((item) => item.id === id) ?? DEFAULT_T212_INSTRUMENT
  } catch {
    return DEFAULT_T212_INSTRUMENT
  }
}

export default function T212Dashboard() {
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const [riskIndex, setRiskIndex] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(RISK_KEY))
      return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : 1
    } catch {
      return 1
    }
  })
  const [tpIndex, setTpIndex] = useState(() => {
    try {
      const raw = localStorage.getItem(TP_KEY)
      const idx = raw ? tpModes.indexOf(raw as TpMode) : 1
      return idx >= 0 ? idx : 1
    } catch {
      return 1
    }
  })
  const [stakeIndex, setStakeIndex] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(STAKE_KEY))
      return Number.isFinite(raw) && raw >= 0 && raw < STAKE_OPTIONS.length ? raw : 1
    } catch {
      return 1
    }
  })
  const [instrument, setInstrument] = useState(readInstrument)
  const riskProfile = profiles[riskIndex]
  const tpMode = tpModes[tpIndex]
  const stakeEur = STAKE_OPTIONS[stakeIndex]

  const [decision, setDecision] = useState<TjrDecision>()
  const [price, setPrice] = useState<number>()
  const [status, setStatus] = useState('Escolhe o instrumento e actualiza — melhor na NY open.')
  const [running, setRunning] = useState(false)
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [session, setSession] = useState(() => getTradingSessionStatus())
  const [marketClocks, setMarketClocks] = useState(() => getMarketClocks())

  useEffect(() => {
    try {
      localStorage.setItem(RISK_KEY, String(riskIndex))
      localStorage.setItem(TP_KEY, tpMode)
      localStorage.setItem(STAKE_KEY, String(stakeIndex))
      localStorage.setItem(INSTRUMENT_KEY, instrument.id)
    } catch {
      /* ignore */
    }
  }, [riskIndex, tpMode, stakeIndex, instrument.id])

  useEffect(() => {
    const tick = () => {
      setSession(getTradingSessionStatus())
      setMarketClocks(getMarketClocks())
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const analyze = async () => {
    setRunning(true)
    setStatus(`A carregar ${instrument.short} (Yahoo)…`)
    try {
      const refInstrument = T212_INSTRUMENTS.find((item) => item.id === 'us500') ?? instrument
      const [data, ref] = await Promise.all([
        getT212PlaybookCandles(instrument),
        instrument.id === 'us500' ? Promise.resolve(undefined) : getT212PlaybookCandles(refInstrument),
      ])
      const reference = ref ?? data
      const next = evaluateTjrFull(instrument.short, data, reference, riskProfile, tpMode, 'long')
      setDecision(next)
      setPrice(data['1m'].at(-1)?.close ?? data['5m'].at(-1)?.close)
      setStatus(
        next.action === 'COMPRAR' && next.entryTiming === 'AGORA'
          ? `${instrument.t212Label}: COMPRAR JÁ — executa na T212 CFD.`
          : next.action === 'COMPRAR'
            ? `${instrument.t212Label}: AGUARDAR — níveis prontos, espera timing.`
            : `${instrument.t212Label}: ${tjrActionLabel(next)}.`,
      )
    } catch (error) {
      setDecision(undefined)
      setStatus(error instanceof Error ? error.message : 'Falha ao obter dados Yahoo.')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    void analyze()
  }, [instrument.id, riskProfile, tpMode])
  const loadChartCandles = (symbol: string, interval: Interval) => {
    const match = T212_INSTRUMENTS.find((item) => item.short === symbol || item.yahooSymbol === symbol) ?? instrument
    return fetchYahooCandlesRaw(match.yahooSymbol, interval)
  }

  return (
    <main className="agent-shell desk-workspace t212-shell">
      <header className="tv-toolbar">
        <div className="tv-toolbar-left">
          <strong className="tv-symbol">T212/{instrument.short}</strong>
          <span className="tv-sep">·</span>
          <span className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''} ${session.blockEntries ? 'blocked' : ''}`}>
            {session.badge}
          </span>
          {decision?.opposedSweep ? (
            <span className="sweep-badge warn">Sweep H · não comprar</span>
          ) : decision?.reactive ? (
            <span className="sweep-badge reactive">Reactivo · {decision.sweepLabel}</span>
          ) : decision?.sweepLabel ? (
            <span className="sweep-badge">Sweep L · {decision.sweepLabel}</span>
          ) : (
            <span className="sweep-badge muted">À espera de sweep de LOW</span>
          )}
          <span className="tv-clock">{session.nowLisbon} PT</span>
        </div>
        <div className="tv-toolbar-right">
          <button type="button" className="agent-scan-btn" onClick={() => void analyze()} disabled={running}>
            {running ? 'A actualizar…' : 'Actualizar'}
          </button>
        </div>
      </header>

      <section className="zella-kpis" aria-label="Resumo T212">
        <article>
          <span>Preço</span>
          <strong>{price !== undefined ? price.toLocaleString('pt-PT', { maximumFractionDigits: 5 }) : '—'}</strong>
          <small>Yahoo</small>
        </article>
        <article>
          <span>Sinal</span>
          <strong>{decision ? tjrActionLabel(decision) : '—'}</strong>
          <small>{decision?.setupStatus ?? 'sem análise'}</small>
        </article>
        <article>
          <span>Score</span>
          <strong style={{ color: decision ? tjrScoreColor(decision.score) : undefined }}>{decision?.score ?? '—'}</strong>
          <small>TJR</small>
        </article>
        <article>
          <span>Risco</span>
          <strong>{riskProfiles[riskProfile].label}</strong>
          <small>perfil</small>
        </article>
        <article>
          <span>TP</span>
          <strong>{tpModeMeta[tpMode].short}</strong>
          <small>alvo</small>
        </article>
        <article className={session.inIdealWindow ? 'kpi-hot' : ''}>
          <span>Sessão</span>
          <strong>{session.inIdealWindow ? 'NY open' : session.window.replace('_', ' ')}</strong>
          <small>killzone</small>
        </article>
      </section>

      <section className="tv-setup-bar" aria-label="Setup T212">
        <label className="tv-setup-field">
          <span>Instrumento</span>
          <select
            aria-label="Instrumento T212"
            value={instrument.id}
            onChange={(event) => {
              const next = T212_INSTRUMENTS.find((item) => item.id === event.target.value) ?? DEFAULT_T212_INSTRUMENT
              setInstrument(next)
            }}
          >
            {T212_INSTRUMENTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.kind === 'forex' || item.kind === 'metal' ? `FX · ${item.short}` : item.short} — {item.t212Label}
              </option>
            ))}
          </select>
        </label>
        <label className="tv-setup-field">
          <span>Risco</span>
          <select aria-label="Perfil de risco" value={riskIndex} onChange={(event) => setRiskIndex(Number(event.target.value))}>
            {profiles.map((profile, index) => (
              <option key={profile} value={index}>{riskProfiles[profile].label}</option>
            ))}
          </select>
        </label>
        <label className="tv-setup-field">
          <span>TP</span>
          <select aria-label="Modo TP" value={tpIndex} onChange={(event) => setTpIndex(Number(event.target.value))}>
            {tpModes.map((mode, index) => (
              <option key={mode} value={index}>{tpModeMeta[mode].short}</option>
            ))}
          </select>
        </label>
        <label className="tv-setup-field">
          <span>Stake €</span>
          <select aria-label="Stake euros" value={stakeIndex} onChange={(event) => setStakeIndex(Number(event.target.value))}>
            {STAKE_OPTIONS.map((value, index) => (
              <option key={value} value={index}>{value} €</option>
            ))}
          </select>
        </label>
        <button type="button" className="setup-reapply" onClick={() => void analyze()} disabled={running}>
          {running ? '…' : 'Aplicar'}
        </button>
      </section>

      <MarketClocks snapshot={marketClocks} compact />
      <p className="agent-status">{status}</p>
      <p className="t212-disclaimer">
        Dados OHLC via Yahoo (proxy). Preços T212 CFD podem diferir ligeiramente do índice/forex Yahoo.
        Execução só na app Trading 212 — conta CFD.
      </p>

      {decision && (
        <section className="desk-workspace-chart">
          <T212TradeGuide instrument={instrument} decision={decision} stakeEur={stakeEur} />
          <div className="card-expanded-main">
            <article className="chart-panel">
              <header>
                <div>
                  <p className="eyebrow">{instrument.t212Label}</p>
                  <h2>{tjrActionLabel(decision)} · {decision.score}/100</h2>
                </div>
                <span>Yahoo · chart {chartInterval}</span>
              </header>
              <PriceChart
                symbol={instrument.short}
                action={decision.action}
                interval={chartInterval}
                onIntervalChange={setChartInterval}
                entry={decision.entry}
                stop={decision.stop}
                target={decision.target}
                targetSecondary={decision.targetSecondary}
                targetLabel={decision.targetLabel}
                targetSecondaryLabel={decision.targetSecondaryLabel}
                zones={decision.zones}
                htfLevels={decision.htfLevels}
                loadCandles={loadChartCandles}
                staleHint="Dados Yahoo"
              />
            </article>
            <aside className="evidence-panel compact">
              <p className="evidence-summary">
                <strong>Bias:</strong> {decision.bias === 'bullish' ? 'Altista' : decision.bias === 'bearish' ? 'Baixista' : 'Neutro'}
                {' · '}<strong>Timing:</strong> {decision.entryTiming === 'AGORA' ? 'Entrar agora' : decision.entryTiming === 'RETRACE' ? 'Aguardar' : 'Sem entrada'}
                {decision.riskReward !== undefined && <> · <strong>R:R</strong> {decision.riskReward.toFixed(1)}×</>}
              </p>
              <span className="tjr-score-badge inline" style={{ '--score-color': tjrScoreColor(decision.score) } as CSSProperties}>
                <strong>{decision.score}</strong>
              </span>
              <ul className="tjr-checklist inline">
                {decision.checklist.map((item) => (
                  <li key={item.label} className={item.complete ? 'done' : 'pending'} title={item.note}>
                    <span>{item.complete ? '✓' : '○'}</span> {item.label}
                  </li>
                ))}
              </ul>
              <details className="evidence-details">
                <summary>Detalhes</summary>
                {decision.reasons[0] && <p>{decision.reasons.join(' ')}</p>}
              </details>
            </aside>
          </div>
        </section>
      )}
    </main>
  )
}
