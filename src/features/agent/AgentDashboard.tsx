import { useEffect, useState, type CSSProperties } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getCandles, getLiquidMarkets, getPlaybookCandles } from '../../lib/binance'
import { evaluateTjrFull, evaluateTjrQuick, tjrActionLabel, tjrScoreColor, type TjrDecision } from '../../lib/tjr-engine'
import { getTradingSessionStatus } from '../../lib/trading-session'
import { BinanceGuideTeaser, BinanceOrderPanel } from './BinanceTradeGuide'
import PriceChart from '../chart/PriceChart'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import type { Interval } from '../../lib/types'

type AgentRow = TjrDecision & {
  symbol: string
  price: number
  change24h: number
}

const price = (value?: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', maximumFractionDigits: value && value < 1 ? 5 : 2 }).format(value ?? 0)

export default function AgentDashboard() {
  const [rows, setRows] = useState<AgentRow[]>([])
  const [status, setStatus] = useState('Pronto para analisar o mercado.')
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR_JA' | 'AGUARDAR_COMPRA' | 'VENDER' | 'ESPERAR'>('TODAS')
  const [query, setQuery] = useState('')
  const [riskIndex, setRiskIndex] = useState(0)
  const [stakeIndex, setStakeIndex] = useState(1)
  const stakeOptions = [10, 20, 50, 100]
  const stakeUsdc = stakeOptions[stakeIndex]
  const [selected, setSelected] = useState<AgentRow>()
  const [chartInterval, setChartInterval] = useState<Interval>('1h')
  const [loadingFull, setLoadingFull] = useState<string>()
  const [refinedSymbols, setRefinedSymbols] = useState<Set<string>>(() => new Set())
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const riskProfile = profiles[riskIndex]
  const [session, setSession] = useState(() => getTradingSessionStatus())

  useEffect(() => {
    const tick = () => setSession(getTradingSessionStatus())
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selected) return
    const symbol = selected.symbol
    setLoadingFull(symbol)
    setRefinedSymbols((prev) => {
      const next = new Set(prev)
      next.delete(symbol)
      return next
    })
    void (async () => {
      const started = Date.now()
      try {
        const [data, btc] = await Promise.all([getPlaybookCandles(symbol), getPlaybookCandles(BTC_REFERENCE_SYMBOL)])
        const decision = evaluateTjrFull(symbol, data, btc, riskProfile)
        const patch = (row: AgentRow): AgentRow =>
          row.symbol === symbol ? { ...decision, symbol, price: row.price, change24h: row.change24h } : row
        setRows((prev) => prev.map(patch))
        setSelected((prev) => (prev?.symbol === symbol ? patch(prev) : prev))
        setRefinedSymbols((prev) => new Set(prev).add(symbol))
      } catch {
        /* scan rápido 1h permanece */
      } finally {
        const minMs = 1000
        const elapsed = Date.now() - started
        if (elapsed < minMs) await new Promise((resolve) => setTimeout(resolve, minMs - elapsed))
        setLoadingFull(undefined)
      }
    })()
  }, [selected?.symbol, riskProfile])

  const scan = async () => {
    setRunning(true)
    setRows([])
    setSelected(undefined)
    setRefinedSymbols(new Set())
    try {
      const [markets, btc1h] = await Promise.all([getLiquidMarkets(10_000), getCandles(BTC_REFERENCE_SYMBOL, '1h')])
      const results: AgentRow[] = []
      for (let index = 0; index < markets.length; index += 5) {
        setStatus(`TJR · ${Math.min(index + 5, markets.length)} / ${markets.length} moedas…`)
        const batch = await Promise.all(markets.slice(index, index + 5).map(async (market) => {
          try {
            const candles1h = await getCandles(market.symbol, '1h')
            const decision = evaluateTjrQuick(market.symbol, candles1h, btc1h, riskProfile)
            const price = candles1h.at(-1)?.close ?? 0
            return { ...decision, symbol: market.symbol, price, change24h: market.priceChangePercent }
          } catch {
            return undefined
          }
        }))
        results.push(...batch.filter((row): row is AgentRow => row !== undefined))
      }
      const sorted = results.sort((left, right) => right.score - left.score || (right.riskReward ?? 0) - (left.riskReward ?? 0))
      setRows(sorted)
      setStatus(`${results.length} moedas analisadas. Clica num par para refinar MTF e ver valores Binance.`)
    } catch {
      setStatus('Não foi possível obter os dados da Binance. Tenta novamente.')
    } finally {
      setRunning(false)
    }
  }

  const counts = {
    COMPRAR_JA: rows.filter((row) => row.action === 'COMPRAR' && row.entryTiming === 'AGORA').length,
    AGUARDAR_COMPRA: rows.filter((row) => row.action === 'COMPRAR' && row.entryTiming === 'RETRACE').length,
    VENDER: rows.filter((row) => row.action === 'VENDER').length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR').length,
  }
  const normalizedQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const visibleRows = rows.filter((row) => {
    const symbolMatch = !normalizedQuery || row.symbol.includes(normalizedQuery) || row.symbol.replace(/USDC$/, '').includes(normalizedQuery)
    if (!symbolMatch) return false
    if (filter === 'TODAS') return true
    if (filter === 'COMPRAR_JA') return row.action === 'COMPRAR' && row.entryTiming === 'AGORA'
    if (filter === 'AGUARDAR_COMPRA') return row.action === 'COMPRAR' && row.entryTiming === 'RETRACE'
    if (filter === 'VENDER') return row.action === 'VENDER'
    return row.action === 'ESPERAR'
  })

  return (
    <main className="agent-shell">
      <header className="agent-header">
        <div><p className="eyebrow">AGENTE TJR · BINANCE SPOT {AGENT_QUOTE_ASSET}</p><h1>O que fazer agora?</h1><p>Pares {AGENT_QUOTE_ASSET} (UE/MiCA): liquidez → confirmação → continuação → SMT vs BTC. Ordenado por score (0–100).</p></div>
        <button onClick={() => void scan()} disabled={running}>{running ? 'A analisar…' : 'Analisar mercado'}</button>
      </header>

      <section className="agent-rules">
        <div><strong>COMPRAR JÁ</strong><span>4 passos TJR completos: sweep → BOS 5m → zona → BOS 1m de entrada.</span></div>
        <div><strong>AGUARDAR COMPRA</strong><span>Setup 1–3 ok; à espera do retrace + BOS 1m (não entrar no 5m sozinho).</span></div>
        <div><strong>VENDER / SAIR</strong><span>BOS contrário, stop ou alvo — deteção automática.</span></div>
        <div><strong>ESPERAR</strong><span>Modelo incompleto, R:R fraco, BTC desalinhado ou fora da killzone.</span></div>
      </section>

      <details className="session-window">
        <summary>
          <span className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''} ${session.blockEntries ? 'blocked' : ''}`}>{session.badge}</span>
          <span className="session-summary-title">Killzone · open / mid / close</span>
          <span className="session-clock" title="Hora NY / Lisboa">{session.nowNy} ET · {session.nowLisbon} Lisboa</span>
        </summary>
        <div className="session-window-body">
          <p><strong>NY open (09:30–11:00 ET):</strong> única janela em que o agente permite <strong>COMPRAR JÁ</strong> (conservador/equilibrado).</p>
          <p><strong>NY mid (11:00–15:00 ET):</strong> setups só como <strong>AGUARDAR COMPRA</strong> — volume mais sujo.</p>
          <p><strong>NY fecho (15:00–16:00 ET) + Ásia/fora:</strong> <strong>sem novas entradas</strong>.</p>
          <p><strong>Londres:</strong> permitido AGUARDAR; COMPRAR JÁ só no perfil agressivo.</p>
          <p><strong>Preços:</strong> entrada = close do BOS 1m; stop = 2º swing; alvo = draw sessão/PDH-PDL com R:R 1–3×.</p>
        </div>
      </details>

      <section className="risk-control">
        <div><strong title="Define quão exigente é o agente antes de emitir COMPRAR.">Risco: {riskProfiles[riskProfile].label}</strong><p>{riskProfiles[riskProfile].description}</p></div>
        <input aria-label="Perfil de risco" type="range" min="0" max="2" step="1" value={riskIndex} onChange={(event) => setRiskIndex(Number(event.target.value))} />
        <div className="risk-labels"><span>Conservador</span><span>Equilibrado</span><span>Agressivo</span></div>
      </section>
      <section className="stake-control">
        <div><strong>Montante por trade: {stakeUsdc} {AGENT_QUOTE_ASSET}</strong><p>Quantidade sugerida nos guias Binance (10–100 {AGENT_QUOTE_ASSET}). Mínimo da Binance: 1 {AGENT_QUOTE_ASSET} por ordem.</p></div>
        <input aria-label="Montante por trade" type="range" min="0" max="3" step="1" value={stakeIndex} onChange={(event) => setStakeIndex(Number(event.target.value))} />
        <div className="risk-labels"><span>10</span><span>20</span><span>50</span><span>100</span></div>
      </section>

      <p className="agent-status">{status}</p>
      {rows.length > 0 && <>
        <section className="agent-summary">
          <button className={filter === 'TODAS' ? 'active' : ''} onClick={() => setFilter('TODAS')}>Todas <span>{rows.length}</span></button>
          <button className={filter === 'COMPRAR_JA' ? 'active buy' : 'buy'} onClick={() => setFilter('COMPRAR_JA')}>Comprar já <span>{counts.COMPRAR_JA}</span></button>
          <button className={filter === 'AGUARDAR_COMPRA' ? 'active watch' : 'watch'} onClick={() => setFilter('AGUARDAR_COMPRA')}>Aguardar compra <span>{counts.AGUARDAR_COMPRA}</span></button>
          <button className={filter === 'VENDER' ? 'active sell' : 'sell'} onClick={() => setFilter('VENDER')}>Vender <span>{counts.VENDER}</span></button>
          <button className={filter === 'ESPERAR' ? 'active wait' : 'wait'} onClick={() => setFilter('ESPERAR')}>Esperar <span>{counts.ESPERAR}</span></button>
          <label>Pesquisar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Ex.: BTC/${AGENT_QUOTE_ASSET}`} /></label>
        </section>
        <section className="decision-list">
        {visibleRows.map((row) => (
          <div className="decision-item" key={row.symbol}>
            <article
              className={`decision-card ${row.positionGuidance === 'SAIR' ? 'vender invalidated' : row.action.toLowerCase()} ${selected?.symbol === row.symbol ? 'selected' : ''}`}
              onClick={() => {
                if (selected?.symbol === row.symbol) {
                  setSelected(undefined)
                  return
                }
                setRefinedSymbols((prev) => {
                  const next = new Set(prev)
                  next.delete(row.symbol)
                  return next
                })
                setLoadingFull(row.symbol)
                setSelected(row)
              }}
              tabIndex={0}
              title="Clica para abrir ou fechar o gráfico desta moeda."
            >
              <div className="decision-top">
                <div><p>{formatTradingPair(row.symbol)}</p><strong className={`timing-${row.entryTiming.toLowerCase()}`}>{tjrActionLabel(row)}</strong></div>
                <span className="tjr-score-badge" style={{ '--score-color': tjrScoreColor(row.score) } as CSSProperties} title="Score de oportunidade TJR (0–100)">
                  <strong>{row.score}</strong><small>/100</small>
                </span>
              </div>
              <p className="decision-meta">{row.setupStatus} · {row.confidence} confiança · R:R {row.riskReward?.toFixed(1) ?? '—'}×</p>
              <p className="decision-price">{price(row.price)} <span className={row.change24h >= 0 ? 'positive' : 'negative'}>{row.change24h.toFixed(1)}% hoje</span></p>
              <p>{row.reasons[0]}</p>
              <dl>
                <div><dt>{row.entryTiming === 'RETRACE' ? 'Zona entrada' : 'Entrada'}</dt><dd>{price(row.entry)}</dd></div>
                <div><dt>Stop</dt><dd>{price(row.stop)}</dd></div>
                <div><dt>Alvo (venda)</dt><dd>{price(row.target)}</dd></div>
                <div><dt>Risco/retorno</dt><dd>{row.riskReward?.toFixed(1) ?? '—'}×</dd></div>
              </dl>
              <BinanceGuideTeaser row={row} />
            </article>
            {selected?.symbol === row.symbol && (
              <section className="card-expanded">
                <BinanceOrderPanel
                  row={row}
                  stakeUsdc={stakeUsdc}
                  analysisReady={refinedSymbols.has(row.symbol)}
                  refining={loadingFull === row.symbol}
                />
                <div className="card-expanded-main">
                  <article className="chart-panel">
                    <header>
                      <div><p className="eyebrow">{formatTradingPair(row.symbol)}</p><h2>{tjrActionLabel(row)} · score {row.score}/100</h2></div>
                      <span title="Scan rápido em 1h; ao expandir refina com 4h/1h/15m/5m.">
                        {loadingFull === row.symbol ? 'A refinar MTF…' : `Execução: ${row.executionInterval ?? '15m'} · gráfico: ${chartInterval}`}
                      </span>
                    </header>
                    <PriceChart symbol={row.symbol} action={row.action} interval={chartInterval} onIntervalChange={setChartInterval} entry={row.entry} stop={row.stop} target={row.target} zones={row.zones} />
                  </article>
                  <aside className="evidence-panel compact">
                    {row.invalidationReason && (row.positionGuidance === 'SAIR' || row.positionGuidance === 'REALIZAR_ALVO') && (
                      <p className="invalidation-alert"><strong>{tjrActionLabel(row)}:</strong> {row.invalidationReason}</p>
                    )}
                    <p className="evidence-summary">
                      <strong>Bias:</strong> {row.bias === 'bullish' ? 'Altista' : row.bias === 'bearish' ? 'Baixista' : 'Neutro'}
                      {' · '}<strong>Timing:</strong> {row.entryTiming === 'AGORA' ? 'Entrar agora' : row.entryTiming === 'RETRACE' ? 'Aguardar retrace' : 'Sem entrada'}
                      {row.riskReward !== undefined && <> · <strong>R:R</strong> {row.riskReward.toFixed(1)}×</>}
                    </p>
                    <ul className="tjr-checklist inline">
                      {row.checklist.map((item) => (
                        <li key={item.label} className={item.complete ? 'done' : 'pending'} title={item.note}>
                          <span>{item.complete ? '✓' : '○'}</span> {item.label}
                        </li>
                      ))}
                    </ul>
                    <details className="evidence-details">
                      <summary>Detalhes &amp; notas</summary>
                      {row.entryZone && row.entryTiming === 'RETRACE' && (
                        <p><strong>Zona entrada:</strong> {price(row.entryZone.low)} – {price(row.entryZone.high)}</p>
                      )}
                      {row.reasons[0] && <p>{row.reasons.join(' ')}</p>}
                      <section className="bos-guide compact">
                        <p><strong>BOS:</strong> Long válido enquanto close no {row.executionInterval ?? '15m'} não romper swing low. Se cartão = SAIR — INVALIDADO → vende.</p>
                      </section>
                    </details>
                  </aside>
                </div>
              </section>
            )}
          </div>
        ))}
      </section></>}

      <section className="agent-disclaimer"><strong>Importante:</strong> sinal técnico, não garantia. Não executa ordens, não usa Futures nem alavancagem. Define o teu risco antes de agir.</section>
    </main>
  )
}
