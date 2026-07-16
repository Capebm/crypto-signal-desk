import { useEffect, useState, type CSSProperties } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getCandles, getLiquidMarkets, getPlaybookCandles } from '../../lib/binance'
import { evaluateTjrFull, evaluateTjrQuick, tjrActionLabel, tjrScoreColor, type TjrDecision } from '../../lib/tjr-engine'
import { getMarketClocks, getTradingSessionStatus } from '../../lib/trading-session'
import MarketClocks from './MarketClocks'
import { BinanceGuideTeaser, BinanceOrderPanel } from './BinanceTradeGuide'
import PositionAdvisor from './PositionAdvisor'
import PriceChart from '../chart/PriceChart'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import type { Interval } from '../../lib/types'
import TpModeModal from './TpModeModal'

const TP_STORAGE_KEY = 'tjr-tp-mode'

const readStoredTpMode = (): TpMode => {
  try {
    const raw = localStorage.getItem(TP_STORAGE_KEY)
    if (raw && (tpModes as string[]).includes(raw)) return raw as TpMode
  } catch {
    /* ignore */
  }
  return '1_5r'
}

type AgentRow = TjrDecision & {
  symbol: string
  price: number
  change24h: number
}

const price = (value?: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', maximumFractionDigits: value && value < 1 ? 5 : 2 }).format(value ?? 0)

/** Top candidatos COMPRAR refinados automaticamente após scan (precisa 1m para COMPRAR JÁ). */
const AUTO_REFINE_TOP = 15

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
  const [tpIndex, setTpIndex] = useState(() => Math.max(0, tpModes.indexOf(readStoredTpMode())))
  const [tpHelpOpen, setTpHelpOpen] = useState(false)
  const tpMode = tpModes[tpIndex]
  const [selected, setSelected] = useState<AgentRow>()
  const [chartInterval, setChartInterval] = useState<Interval>('1h')
  const [loadingFull, setLoadingFull] = useState<string>()
  const [refinedSymbols, setRefinedSymbols] = useState<Set<string>>(() => new Set())
  const [scanMeta, setScanMeta] = useState<{ at: Date; profile: RiskProfile; tpMode: TpMode }>()
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const riskProfile = profiles[riskIndex]
  const [session, setSession] = useState(() => getTradingSessionStatus())
  const [marketClocks, setMarketClocks] = useState(() => getMarketClocks())

  useEffect(() => {
    try {
      localStorage.setItem(TP_STORAGE_KEY, tpMode)
    } catch {
      /* ignore */
    }
  }, [tpMode])

  useEffect(() => {
    const tick = () => {
      setSession(getTradingSessionStatus())
      setMarketClocks(getMarketClocks())
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const refineRow = async (symbol: string, fallback: Pick<AgentRow, 'price' | 'change24h'>) => {
    const [data, btc] = await Promise.all([getPlaybookCandles(symbol), getPlaybookCandles(BTC_REFERENCE_SYMBOL)])
    const decision = evaluateTjrFull(symbol, data, btc, riskProfile, tpMode)
    const patch = (row: AgentRow): AgentRow =>
      row.symbol === symbol ? { ...decision, symbol, price: fallback.price, change24h: fallback.change24h } : row
    setRows((prev) => prev.map(patch))
    setSelected((prev) => (prev?.symbol === symbol ? patch(prev) : prev))
    setRefinedSymbols((prev) => new Set(prev).add(symbol))
    return patch({ ...decision, symbol, price: fallback.price, change24h: fallback.change24h })
  }

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
        await refineRow(symbol, { price: selected.price, change24h: selected.change24h })
      } catch {
        /* scan rápido 1h permanece */
      } finally {
        const minMs = 1000
        const elapsed = Date.now() - started
        if (elapsed < minMs) await new Promise((resolve) => setTimeout(resolve, minMs - elapsed))
        setLoadingFull(undefined)
      }
    })()
  }, [selected?.symbol, riskProfile, tpMode])

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
            const decision = evaluateTjrQuick(market.symbol, candles1h, btc1h, riskProfile, tpMode)
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

      const buyCandidates = sorted.filter((row) => row.action === 'COMPRAR').slice(0, AUTO_REFINE_TOP)
      if (buyCandidates.length > 0) {
        setStatus(`Scan 1h ok · a refinar top ${buyCandidates.length} candidatos COMPRAR (1m/MTF)…`)
        let buyNow = 0
        for (let index = 0; index < buyCandidates.length; index += 1) {
          const row = buyCandidates[index]
          setStatus(`MTF · ${index + 1}/${buyCandidates.length} · ${formatTradingPair(row.symbol)}…`)
          try {
            const refined = await refineRow(row.symbol, { price: row.price, change24h: row.change24h })
            if (refined.action === 'COMPRAR' && refined.entryTiming === 'AGORA') buyNow += 1
          } catch {
            /* mantém scan 1h deste par */
          }
        }
        setStatus(
          `${results.length} moedas · ${buyCandidates.length} refinadas · ${buyNow} COMPRAR JÁ confirmado(s). Clica num par para gráfico e valores Binance.`,
        )
      } else {
        setStatus(`${results.length} moedas analisadas. Nenhum candidato COMPRAR no scan 1h.`)
      }
      setScanMeta({ at: new Date(), profile: riskProfile, tpMode })
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

  const scanStale = Boolean(scanMeta && (scanMeta.profile !== riskProfile || scanMeta.tpMode !== tpMode))
  const scanTimeLabel = scanMeta
    ? new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(scanMeta.at)
    : undefined

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

      <section className="session-shell">
        <MarketClocks snapshot={marketClocks} />
        <details className="session-window">
          <summary>
            <span className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''} ${session.blockEntries ? 'blocked' : ''}`}>{session.badge}</span>
            <span className="session-summary-title">Killzone · open / mid / close</span>
          </summary>
          <div className="session-window-body">
            <p><strong>NY open ({marketClocks.windows.nyOpen.et} ET · {marketClocks.windows.nyOpen.lisbon} PT):</strong> única janela em que o agente permite <strong>COMPRAR JÁ</strong> (conservador/equilibrado).</p>
            <p><strong>NY mid ({marketClocks.windows.nyMid.et} ET · {marketClocks.windows.nyMid.lisbon} PT):</strong> setups só como <strong>AGUARDAR COMPRA</strong> — volume mais sujo.</p>
            <p><strong>NY fecho ({marketClocks.windows.nyClose.et} ET · {marketClocks.windows.nyClose.lisbon} PT) + Ásia/fora:</strong> <strong>sem novas entradas</strong>.</p>
            <p><strong>Londres ({marketClocks.windows.london.et} ET · {marketClocks.windows.london.lisbon} PT):</strong> permitido AGUARDAR; COMPRAR JÁ só no perfil agressivo.</p>
            <p><strong>Preços:</strong> entrada = close do BOS 1m; stop = 2º swing; alvo = conforme modo TP (1R / 1.5R / liquidez).</p>
          </div>
        </details>
      </section>

      <PositionAdvisor riskProfile={riskProfile} tpMode={tpMode} />

      <section className="risk-control">
        <div><strong title="Define quão exigente é o agente antes de emitir COMPRAR.">Risco: {riskProfiles[riskProfile].label}</strong><p>{riskProfiles[riskProfile].description}</p></div>
        <input aria-label="Perfil de risco" type="range" min="0" max="2" step="1" value={riskIndex} onChange={(event) => {
          setRiskIndex(Number(event.target.value))
          if (rows.length > 0) setStatus('Perfil alterado — analisa de novo ou reabre um par para recalcular.')
        }} />
        <div className="risk-labels"><span>Conservador</span><span>Equilibrado</span><span>Agressivo</span></div>
      </section>
      <section className="tp-control">
        <div>
          <strong>
            Take-profit: {tpModeMeta[tpMode].label}{' '}
            <button type="button" className="tp-help-btn" onClick={() => setTpHelpOpen(true)} title="Explicar modos de TP">?</button>
          </strong>
          <p>{tpModeMeta[tpMode].description}</p>
        </div>
        <input
          aria-label="Modo de take-profit"
          type="range"
          min="0"
          max="2"
          step="1"
          value={tpIndex}
          onChange={(event) => {
            setTpIndex(Number(event.target.value))
            if (rows.length > 0) setStatus('Modo TP alterado — analisa de novo ou reabre um par para recalcular o alvo.')
          }}
        />
        <div className="risk-labels"><span>1R</span><span>1.5R</span><span>Liquidez</span></div>
      </section>
      <TpModeModal open={tpHelpOpen} onClose={() => setTpHelpOpen(false)} active={tpMode} />
      <section className="stake-control">
        <div><strong>Montante por trade: {stakeUsdc} {AGENT_QUOTE_ASSET}</strong><p>Quantidade sugerida nos guias Binance (10–100 {AGENT_QUOTE_ASSET}). Mínimo da Binance: 1 {AGENT_QUOTE_ASSET} por ordem.</p></div>
        <input aria-label="Montante por trade" type="range" min="0" max="3" step="1" value={stakeIndex} onChange={(event) => setStakeIndex(Number(event.target.value))} />
        <div className="risk-labels"><span>10</span><span>20</span><span>50</span><span>100</span></div>
      </section>

      <p className="agent-status">{status}</p>
      {rows.length > 0 && scanTimeLabel && (
        <p className={`scan-meta${scanStale ? ' stale' : ''}`}>
          Scan: {scanTimeLabel} · {riskProfiles[scanMeta!.profile].label} · TP {tpModeMeta[scanMeta!.tpMode].short}
          {scanStale && <> · <strong>Perfil ou TP mudou — analisa de novo para recalcular.</strong></>}
          {counts.COMPRAR_JA === 0 && riskProfile === 'conservador' && !session.inIdealWindow && (
            <> · Conservador: COMPRAR JÁ só na NY open (09:30–11:00 ET).</>
          )}
        </p>
      )}
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
              <p className="decision-meta">
                {row.setupStatus} · {row.confidence} confiança · R:R {row.riskReward?.toFixed(1) ?? '—'}×
                {refinedSymbols.has(row.symbol) ? ' · MTF ✓' : row.action === 'COMPRAR' ? ' · scan 1h' : ''}
              </p>
              <p className="decision-price">{price(row.price)} <span className={row.change24h >= 0 ? 'positive' : 'negative'}>{row.change24h.toFixed(1)}% hoje</span></p>
              <p>{row.reasons[0]}</p>
              <dl>
                <div><dt>{row.entryTiming === 'RETRACE' ? 'Zona entrada' : 'Entrada'}</dt><dd>{price(row.entry)}</dd></div>
                <div><dt>Stop</dt><dd>{price(row.stop)}</dd></div>
                <div><dt>Alvo (venda)</dt><dd>{price(row.target)}{row.targetLabel ? ` · ${row.targetLabel}` : ''}</dd></div>
                {row.targetSecondary !== undefined && (
                  <div><dt>Alvo 2</dt><dd>{price(row.targetSecondary)}{row.targetSecondaryLabel ? ` · ${row.targetSecondaryLabel}` : ''}</dd></div>
                )}
                <div><dt>Risco/retorno</dt><dd>{row.riskReward?.toFixed(1) ?? '—'}×</dd></div>
              </dl>
              <BinanceGuideTeaser row={row} tpMode={tpMode} />
            </article>
            {selected?.symbol === row.symbol && (
              <section className="card-expanded">
                <BinanceOrderPanel
                  row={row}
                  stakeUsdc={stakeUsdc}
                  analysisReady={refinedSymbols.has(row.symbol)}
                  refining={loadingFull === row.symbol}
                  tpMode={tpMode}
                />
                <div className="card-expanded-main">
                  <article className="chart-panel">
                    <header>
                      <div><p className="eyebrow">{formatTradingPair(row.symbol)}</p><h2>{tjrActionLabel(row)} · score {row.score}/100</h2></div>
                      <span title="Scan rápido em 1h; ao expandir refina com 4h/1h/15m/5m.">
                        {loadingFull === row.symbol ? 'A refinar MTF…' : `Execução: ${row.executionInterval ?? '15m'} · gráfico: ${chartInterval}`}
                      </span>
                    </header>
                    <PriceChart symbol={row.symbol} action={row.action} interval={chartInterval} onIntervalChange={setChartInterval} entry={row.entry} stop={row.stop} target={row.target} targetSecondary={row.targetSecondary} targetLabel={row.targetLabel} targetSecondaryLabel={row.targetSecondaryLabel} zones={row.zones} />
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
                      {row.exitPlan && row.action === 'COMPRAR' && (
                        <div className="exit-plan">
                          <p><strong>Plano de saída:</strong> {row.exitPlan.note}</p>
                          <ol>{row.exitPlan.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                        </div>
                      )}
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
