import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import PriceChart from '../chart/PriceChart'
import MarketClocks from '../agent/MarketClocks'
import T212TradeGuide from './T212TradeGuide'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import {
  evaluateTjrFull,
  formatSetupHitLabel,
  listActionNowSetups,
  tjrActionLabel,
  tjrScoreColor,
  type TjrDecision,
} from '../../lib/tjr-engine'
import { getCfdMarketStatus, getMarketClocks, getTradingSessionStatus } from '../../lib/trading-session'
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
const ALL_SETUPS_KEY = 't212-scan-all-setups'

const STAKE_OPTIONS = [20, 50, 100, 200] as const

const readBool = (key: string, fallback = false) => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* ignore */
  }
  return fallback
}

type T212Row = TjrDecision & {
  instrument: T212Instrument
  price: number
}

const money = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-PT', { maximumFractionDigits: value < 2 ? 5 : 2 })
}

const evalOptions = { referenceLabel: 'US500' as const }

const isBuyNow = (row: TjrDecision) => row.action === 'COMPRAR' && row.entryTiming === 'AGORA'
const isSellNow = (row: TjrDecision) => row.action === 'VENDER' && row.entryTiming === 'AGORA'
const isAguardar = (row: TjrDecision) =>
  (row.action === 'COMPRAR' || row.action === 'VENDER') && row.entryTiming === 'RETRACE'

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
  const [scanAllSetups, setScanAllSetups] = useState(() => readBool(ALL_SETUPS_KEY, false))
  const riskProfile = profiles[riskIndex]
  const tpMode = tpModes[tpIndex]
  const stakeEur = STAKE_OPTIONS[stakeIndex]

  const [rows, setRows] = useState<T212Row[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR_JA' | 'VENDER' | 'AGUARDAR' | 'ESPERAR'>('TODAS')
  const [status, setStatus] = useState('Carrega Analisar — TECH100, US500 e FOREX (long + short CFD).')
  const [running, setRunning] = useState(false)
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [session, setSession] = useState(() => getTradingSessionStatus())
  const [marketClocks, setMarketClocks] = useState(() => getMarketClocks())
  const [cfdMarket, setCfdMarket] = useState(() => getCfdMarketStatus())

  useEffect(() => {
    try {
      localStorage.setItem(RISK_KEY, String(riskIndex))
      localStorage.setItem(TP_KEY, tpMode)
      localStorage.setItem(STAKE_KEY, String(stakeIndex))
      localStorage.setItem(ALL_SETUPS_KEY, scanAllSetups ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [riskIndex, tpMode, stakeIndex, scanAllSetups])

  useEffect(() => {
    const tick = () => {
      setSession(getTradingSessionStatus())
      setMarketClocks(getMarketClocks())
      setCfdMarket(getCfdMarketStatus())
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const analyzeAll = async () => {
    setRunning(true)
    setSelectedId(undefined)
    const market = getCfdMarketStatus()
    setCfdMarket(market)
    if (!market.open) {
      setStatus(market.reason)
      setRunning(false)
      return
    }
    setStatus(`A carregar ${T212_INSTRUMENTS.length} instrumentos em paralelo…`)
    try {
      const settled = await Promise.allSettled(
        T212_INSTRUMENTS.map(async (instrument) => {
          const data = await getT212PlaybookCandles(instrument)
          return { instrument, data }
        }),
      )
      const packs = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const failed = settled
        .map((result, index) => (result.status === 'rejected' ? T212_INSTRUMENTS[index].short : undefined))
        .filter((value): value is string => Boolean(value))
      if (packs.length === 0) {
        throw new Error(failed.length ? `Yahoo falhou: ${failed.join(', ')}` : 'Sem candles Yahoo.')
      }
      const refPack = packs.find((pack) => pack.instrument.id === 'us500')?.data ?? packs[0]?.data
      if (!refPack) throw new Error('Sem candles de referência.')

      const results: T212Row[] = []
      for (const { instrument, data } of packs) {
        setStatus(
          scanAllSetups
            ? `${instrument.short} · 9 setups (Buy+Sell)…`
            : `A avaliar ${instrument.short}…`,
        )
        const reference = instrument.id === 'us500' ? data : refPack
        // Sem forcedSide: CFD permite long e short.
        let decision = evaluateTjrFull(instrument.short, data, reference, riskProfile, tpMode, undefined, evalOptions)
        if (scanAllSetups) {
          const matchingSetups = listActionNowSetups(instrument.short, data, reference, evalOptions, undefined, 'both')
          if (matchingSetups.length > 0) {
            const userHit = matchingSetups.find((hit) => hit.profile === riskProfile && hit.tpMode === tpMode)
            if (userHit) {
              decision = { ...decision, matchingSetups, tradeSetup: userHit }
            } else {
              const best = matchingSetups[0]
              decision = {
                ...evaluateTjrFull(instrument.short, data, reference, best.profile, best.tpMode, undefined, evalOptions),
                matchingSetups,
                tradeSetup: best,
              }
            }
          }
        } else if (isBuyNow(decision) || isSellNow(decision)) {
          decision = {
            ...decision,
            tradeSetup: {
              profile: riskProfile,
              tpMode,
              label: formatSetupHitLabel(riskProfile, tpMode),
              score: decision.score,
              action: decision.action,
            },
          }
        }
        const price = data['1m'].at(-1)?.close ?? data['5m'].at(-1)?.close ?? 0
        results.push({ ...decision, instrument, price })
      }

      const sorted = results.sort((a, b) => b.score - a.score || (b.riskReward ?? 0) - (a.riskReward ?? 0))
      setRows(sorted)
      const buyNow = sorted.filter(isBuyNow).length
      const sellNow = sorted.filter(isSellNow).length
      const aguardar = sorted.filter(isAguardar).length
      setStatus(
        buyNow + sellNow > 0
          ? `${sorted.length} instrumentos · ${buyNow} COMPRAR · ${sellNow} VENDER — clica para expandir.${failed.length ? ` · falhou: ${failed.join(', ')}` : ''}`
          : `${sorted.length} instrumentos · 0 agora · ${aguardar} aguardar.${failed.length ? ` · falhou: ${failed.join(', ')}` : ''} Melhor na NY open.`,
      )
      if (buyNow > 0) setFilter('COMPRAR_JA')
      else if (sellNow > 0) setFilter('VENDER')
    } catch (error) {
      setRows([])
      setStatus(error instanceof Error ? error.message : 'Falha ao obter dados Yahoo.')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    const market = getCfdMarketStatus()
    setCfdMarket(market)
    if (!market.open) {
      setStatus(market.reason)
      return
    }
    void analyzeAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => ({
    COMPRAR_JA: rows.filter(isBuyNow).length,
    VENDER: rows.filter(isSellNow).length,
    AGUARDAR: rows.filter(isAguardar).length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR').length,
  }), [rows])

  const visibleRows = rows.filter((row) => {
    if (filter === 'COMPRAR_JA') return isBuyNow(row)
    if (filter === 'VENDER') return isSellNow(row)
    if (filter === 'AGUARDAR') return isAguardar(row)
    if (filter === 'ESPERAR') return row.action === 'ESPERAR'
    return true
  })

  const selected = rows.find((row) => row.instrument.id === selectedId)

  const loadChartCandles = (symbol: string, interval: Interval) => {
    const match = T212_INSTRUMENTS.find((item) => item.short === symbol) ?? selected?.instrument ?? DEFAULT_T212_INSTRUMENT
    return fetchYahooCandlesRaw(match.yahooSymbol, interval)
  }

  useEffect(() => {
    if (!selectedId) return
    const id = window.requestAnimationFrame(() => {
      document.getElementById(`expand-t212-${selectedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [selectedId])

  return (
    <main className="agent-shell desk-workspace t212-shell">
      <header className="tv-toolbar">
        <div className="tv-toolbar-left">
          <strong className="tv-symbol">T212/CFD</strong>
          <span className="tv-sep">·</span>
          <span className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''} ${session.blockEntries ? 'blocked' : ''}`}>
            {session.badge}
          </span>
          {selected?.opposedSweep && selected.action !== 'VENDER' ? (
            <span className="sweep-badge warn">Sweep H · não comprar</span>
          ) : selected?.action === 'VENDER' && selected.sweepLabel ? (
            <span className="sweep-badge warn">Short · {selected.sweepLabel}</span>
          ) : selected?.reactive ? (
            <span className="sweep-badge reactive">Reactivo · {selected.sweepLabel}</span>
          ) : selected?.sweepLabel ? (
            <span className="sweep-badge">Sweep L · {selected.sweepLabel}</span>
          ) : (
            <span className="sweep-badge muted">Clica num instrumento</span>
          )}
          <span className="tv-clock">{session.nowLisbon} PT</span>
        </div>
        <div className="tv-toolbar-right">
          <button type="button" className="agent-scan-btn" onClick={() => void analyzeAll()} disabled={running || !cfdMarket.open}>
            {running ? 'A analisar…' : cfdMarket.open ? 'Analisar' : 'Mercado fechado'}
          </button>
        </div>
      </header>

      {!cfdMarket.open && (
        <p className="t212-closed-banner" role="status">{cfdMarket.reason}</p>
      )}

      <section className="zella-kpis" aria-label="Resumo T212">
        <article>
          <span>Comprar já</span>
          <strong className={counts.COMPRAR_JA > 0 ? 'positive' : ''}>{counts.COMPRAR_JA}</strong>
          <small>long</small>
        </article>
        <article>
          <span>Vender</span>
          <strong className={counts.VENDER > 0 ? 'negative' : ''}>{counts.VENDER}</strong>
          <small>short CFD</small>
        </article>
        <article>
          <span>Aguardar</span>
          <strong>{counts.AGUARDAR}</strong>
          <small>retrace</small>
        </article>
        <article>
          <span>Instrumentos</span>
          <strong>{rows.length || T212_INSTRUMENTS.length}</strong>
          <small>{scanAllSetups ? '× 9 setups' : 'watchlist'}</small>
        </article>
        <article>
          <span>Risco</span>
          <strong>{riskProfiles[riskProfile].label}</strong>
          <small>{tpModeMeta[tpMode].short}</small>
        </article>
        <article className={session.inIdealWindow ? 'kpi-hot' : ''}>
          <span>Sessão</span>
          <strong>{!cfdMarket.open ? 'Fechado' : session.inIdealWindow ? 'NY open' : session.window.replace('_', ' ')}</strong>
          <small>killzone</small>
        </article>
      </section>

      <section className="tv-setup-bar" aria-label="Setup T212">
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
        <label className="tv-setup-toggle" title="Testa as 9 combinações risco×TP (Buy e Sell) em cada instrumento">
          <input
            type="checkbox"
            checked={scanAllSetups}
            onChange={(event) => setScanAllSetups(event.target.checked)}
          />
          <span>Todos setups</span>
        </label>
        <button type="button" className="setup-reapply" onClick={() => void analyzeAll()} disabled={running || !cfdMarket.open}>
          {running ? '…' : 'Aplicar + scan'}
        </button>
      </section>

      <MarketClocks snapshot={marketClocks} compact />
      <p className="agent-status">{status}</p>
      <p className="t212-disclaimer">
        CFD: long (Buy) e short (Sell). Dados Yahoo em paralelo. Fim de semana = mercado fechado (não é bug do TJR).
      </p>

      {rows.length > 0 && (
        <section className="agent-summary desk-filters">
          <button type="button" className={filter === 'TODAS' ? 'active' : ''} onClick={() => setFilter('TODAS')}>Todas <span>{rows.length}</span></button>
          <button type="button" className={filter === 'COMPRAR_JA' ? 'active buy' : 'buy'} onClick={() => setFilter('COMPRAR_JA')}>Comprar <span>{counts.COMPRAR_JA}</span></button>
          <button type="button" className={filter === 'VENDER' ? 'active sell' : 'sell'} onClick={() => setFilter('VENDER')}>Vender <span>{counts.VENDER}</span></button>
          <button type="button" className={filter === 'AGUARDAR' ? 'active watch' : 'watch'} onClick={() => setFilter('AGUARDAR')}>Aguardar <span>{counts.AGUARDAR}</span></button>
          <button type="button" className={filter === 'ESPERAR' ? 'active wait' : 'wait'} onClick={() => setFilter('ESPERAR')}>Esperar <span>{counts.ESPERAR}</span></button>
        </section>
      )}

      {rows.length > 0 && (
        <section className="desk-watchlist">
          <div className="desk-table-wrap">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Instrumento</th>
                  <th>Sinal</th>
                  <th>Sweep</th>
                  <th>Score</th>
                  <th>Preço</th>
                  <th>Entrada</th>
                  <th>Stop</th>
                  <th>TP</th>
                  <th>R:R</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const open = selectedId === row.instrument.id
                  return (
                    <Fragment key={row.instrument.id}>
                      <tr
                        className={`${row.action.toLowerCase()}${open ? ' selected' : ''}${isBuyNow(row) ? ' buy-now' : ''}${isSellNow(row) ? ' sell-now' : ''}`}
                        onClick={() => setSelectedId(open ? undefined : row.instrument.id)}
                      >
                        <td className="col-symbol">
                          {row.instrument.short}
                          <small className="desk-sub">{row.instrument.kind === 'index' ? 'Índice' : row.instrument.kind === 'metal' ? 'Metal' : 'Forex'}</small>
                        </td>
                        <td>
                          <strong className={`timing-${row.entryTiming.toLowerCase()}`}>{tjrActionLabel(row)}</strong>
                          <small className="desk-sub">{row.setupStatus}</small>
                          {row.matchingSetups && row.matchingSetups.length > 0 && (
                            <div className="setup-hit-row">
                              {row.matchingSetups.map((hit) => {
                                const isTrade = row.tradeSetup?.profile === hit.profile && row.tradeSetup?.tpMode === hit.tpMode
                                return (
                                  <span key={`${hit.profile}-${hit.tpMode}-${hit.action ?? ''}`} className={`setup-hit${isTrade ? ' current' : ''}`}>
                                    {hit.label}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </td>
                        <td>
                          {row.opposedSweep && row.action !== 'VENDER' ? (
                            <span className="sweep-tag warn">{row.sweepLabel ?? 'H'}</span>
                          ) : row.reactive ? (
                            <span className="sweep-tag reactive">Reactivo · {row.sweepLabel}</span>
                          ) : row.sweepLabel ? (
                            <span className="sweep-tag">{row.sweepLabel}</span>
                          ) : (
                            <span className="sweep-tag muted">Sem sweep</span>
                          )}
                        </td>
                        <td>
                          <span className="tjr-score-badge inline" style={{ '--score-color': tjrScoreColor(row.score) } as CSSProperties}>
                            <strong>{row.score}</strong>
                          </span>
                        </td>
                        <td className="num">{money(row.price)}</td>
                        <td className="num">{money(row.entry)}</td>
                        <td className="num">{money(row.stop)}</td>
                        <td className="num">{money(row.target)}</td>
                        <td className="num">{row.riskReward?.toFixed(1) ?? '—'}×</td>
                      </tr>
                      {open && selected && (
                        <tr className="desk-expand-row" onClick={(event) => event.stopPropagation()}>
                          <td colSpan={9}>
                            <section className="desk-workspace-chart desk-row-expand" id={`expand-t212-${selected.instrument.id}`}>
                              <T212TradeGuide instrument={selected.instrument} decision={selected} stakeEur={stakeEur} />
                              <div className="card-expanded-main">
                                <article className="chart-panel">
                                  <header>
                                    <div>
                                      <p className="eyebrow">{selected.instrument.t212Label}</p>
                                      <h2>{tjrActionLabel(selected)} · {selected.score}/100</h2>
                                    </div>
                                    <span>Yahoo · chart {chartInterval}</span>
                                  </header>
                                  <PriceChart
                                    symbol={selected.instrument.short}
                                    action={selected.action}
                                    interval={chartInterval}
                                    onIntervalChange={setChartInterval}
                                    entry={selected.entry}
                                    stop={selected.stop}
                                    target={selected.target}
                                    targetSecondary={selected.targetSecondary}
                                    targetLabel={selected.targetLabel}
                                    targetSecondaryLabel={selected.targetSecondaryLabel}
                                    zones={selected.zones}
                                    htfLevels={selected.htfLevels}
                                    loadCandles={loadChartCandles}
                                    staleHint="Dados Yahoo"
                                  />
                                </article>
                                <aside className="evidence-panel compact">
                                  <p className="evidence-summary">
                                    <strong>Bias:</strong> {selected.bias === 'bullish' ? 'Altista' : selected.bias === 'bearish' ? 'Baixista' : 'Neutro'}
                                    {' · '}<strong>Timing:</strong> {selected.entryTiming === 'AGORA' ? 'Entrar agora' : selected.entryTiming === 'RETRACE' ? 'Aguardar' : 'Sem entrada'}
                                    {selected.riskReward !== undefined && <> · <strong>R:R</strong> {selected.riskReward.toFixed(1)}×</>}
                                  </p>
                                  {selected.matchingSetups && selected.matchingSetups.length > 0 && (
                                    <p className="setup-hit-panel">
                                      <strong>Setups agora:</strong> {selected.matchingSetups.map((hit) => hit.label).join(' · ')}
                                    </p>
                                  )}
                                  <ul className="tjr-checklist inline">
                                    {selected.checklist.map((item) => (
                                      <li key={item.label} className={item.complete ? 'done' : 'pending'} title={item.note}>
                                        <span>{item.complete ? '✓' : '○'}</span> {item.label}
                                      </li>
                                    ))}
                                  </ul>
                                  <details className="evidence-details">
                                    <summary>Detalhes</summary>
                                    {selected.reasons[0] && <p>{selected.reasons.join(' ')}</p>}
                                  </details>
                                </aside>
                              </div>
                            </section>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
