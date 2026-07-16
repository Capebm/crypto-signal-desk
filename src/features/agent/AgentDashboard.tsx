import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getCandles, getLiquidMarkets, getPlaybookCandles } from '../../lib/binance'
import { goToCryptoTab } from '../../lib/crypto-tabs'
import { dayId, pnlForDay } from '../../lib/journal/journal-stats'
import { getClosedTrades } from '../../lib/journal/trade-store'
import { loadOpenPosition, parseOpenNumber } from '../../lib/open-position-store'
import { evaluateTjrFull, evaluateTjrQuick, tjrActionLabel, tjrScoreColor, type TjrDecision } from '../../lib/tjr-engine'
import { getMarketClocks, getTradingSessionStatus } from '../../lib/trading-session'
import MarketClocks from './MarketClocks'
import ActivePositionPin from './ActivePositionPin'
import { BinanceGuideTeaser, BinanceOrderPanel, STAKE_OPTIONS } from './BinanceTradeGuide'
import OnboardingModal from './OnboardingModal'
import PositionAdvisor from './PositionAdvisor'
import PriceChart from '../chart/PriceChart'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import type { Interval } from '../../lib/types'
import TpModeModal from './TpModeModal'

const TP_STORAGE_KEY = 'tjr-tp-mode'
const ACCOUNT_KEY = 'tjr-account-usdc'
const RISK_KEY = 'tjr-risk-index'
const STAKE_KEY = 'tjr-stake-index'

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

const moneyShort = (value: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

const resolveBase = (symbol: string) => symbol.replace(new RegExp(`${AGENT_QUOTE_ASSET}$`), '')

const potentialUsdc = (row: AgentRow, stake: number) => {
  if (!row.entry || !row.target || row.entry <= 0 || row.action !== 'COMPRAR') return undefined
  return stake * ((row.target - row.entry) / row.entry)
}

/** Top candidatos COMPRAR refinados automaticamente após scan (precisa 1m para COMPRAR JÁ). */
const AUTO_REFINE_TOP = 15

export default function AgentDashboard() {
  const [rows, setRows] = useState<AgentRow[]>([])
  const [status, setStatus] = useState('Pronto — analisa na NY open ou vê posição aberta abaixo.')
  const [running, setRunning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ pct: number; label: string }>()
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR_JA' | 'AGUARDAR_COMPRA' | 'VENDER' | 'ESPERAR'>('TODAS')
  const [query, setQuery] = useState('')
  const [riskIndex, setRiskIndex] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(RISK_KEY))
      return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : 0
    } catch {
      return 0
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
  const stakeUsdc = STAKE_OPTIONS[stakeIndex]
  const [accountUsdc, setAccountUsdc] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(ACCOUNT_KEY))
      return Number.isFinite(raw) && raw > 0 ? raw : 500
    } catch {
      return 500
    }
  })
  const [tpIndex, setTpIndex] = useState(() => Math.max(0, tpModes.indexOf(readStoredTpMode())))
  const [tpHelpOpen, setTpHelpOpen] = useState(false)
  const tpMode = tpModes[tpIndex]
  const [selected, setSelected] = useState<AgentRow>()
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [loadingFull, setLoadingFull] = useState<string>()
  const [refinedSymbols, setRefinedSymbols] = useState<Set<string>>(() => new Set())
  const [scanMeta, setScanMeta] = useState<{ at: Date; profile: RiskProfile; tpMode: TpMode; stakeUsdc: number }>()
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const riskProfile = profiles[riskIndex]
  const [session, setSession] = useState(() => getTradingSessionStatus())
  const [marketClocks, setMarketClocks] = useState(() => getMarketClocks())
  const [pinKey, setPinKey] = useState(0)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [todayPnl, setTodayPnl] = useState(() => pnlForDay(getClosedTrades(), dayId(Date.now())))
  const openFill = useMemo(() => loadOpenPosition(), [pinKey])
  const fillPrice = openFill ? parseOpenNumber(openFill.entryPrice) : undefined
  const stakePct = accountUsdc > 0 ? (stakeUsdc / accountUsdc) * 100 : 0

  useEffect(() => {
    try {
      localStorage.setItem(TP_STORAGE_KEY, tpMode)
      localStorage.setItem(RISK_KEY, String(riskIndex))
      localStorage.setItem(STAKE_KEY, String(stakeIndex))
      localStorage.setItem(ACCOUNT_KEY, String(accountUsdc))
    } catch {
      /* ignore */
    }
  }, [tpMode, riskIndex, stakeIndex, accountUsdc])

  useEffect(() => {
    const tick = () => {
      setSession(getTradingSessionStatus())
      setMarketClocks(getMarketClocks())
      setTodayPnl(pnlForDay(getClosedTrades(), dayId(Date.now())))
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
    setScanProgress({ pct: 0, label: 'A iniciar…' })
    try {
      const [markets, btc1h] = await Promise.all([getLiquidMarkets(10_000), getCandles(BTC_REFERENCE_SYMBOL, '1h')])
      const results: AgentRow[] = []
      for (let index = 0; index < markets.length; index += 5) {
        const done = Math.min(index + 5, markets.length)
        setScanProgress({ pct: Math.round((done / markets.length) * 70), label: `Scan 1h · ${done}/${markets.length}` })
        setStatus(`TJR · ${done} / ${markets.length} moedas…`)
        const batch = await Promise.all(markets.slice(index, index + 5).map(async (market) => {
          try {
            const candles1h = await getCandles(market.symbol, '1h')
            const decision = evaluateTjrQuick(market.symbol, candles1h, btc1h, riskProfile, tpMode)
            const rowPrice = candles1h.at(-1)?.close ?? 0
            return { ...decision, symbol: market.symbol, price: rowPrice, change24h: market.priceChangePercent }
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
          setScanProgress({
            pct: 70 + Math.round(((index + 1) / buyCandidates.length) * 30),
            label: `MTF · ${index + 1}/${buyCandidates.length} · ${formatTradingPair(row.symbol)}`,
          })
          setStatus(`MTF · ${index + 1}/${buyCandidates.length} · ${formatTradingPair(row.symbol)}…`)
          try {
            const refined = await refineRow(row.symbol, { price: row.price, change24h: row.change24h })
            if (refined.action === 'COMPRAR' && refined.entryTiming === 'AGORA') buyNow += 1
          } catch {
            /* mantém scan 1h deste par */
          }
        }
        setStatus(
          `${results.length} moedas · ${buyCandidates.length} refinadas · ${buyNow} COMPRAR JÁ. Expande o cartão para valores Binance.`,
        )
      } else {
        setStatus(`${results.length} moedas analisadas. Nenhum candidato COMPRAR no scan 1h.`)
      }
      setScanMeta({ at: new Date(), profile: riskProfile, tpMode, stakeUsdc })
    } catch {
      setStatus('Não foi possível obter os dados da Binance. Tenta novamente.')
    } finally {
      setRunning(false)
      setScanProgress(undefined)
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

  const scanStale = Boolean(
    scanMeta && (scanMeta.profile !== riskProfile || scanMeta.tpMode !== tpMode || scanMeta.stakeUsdc !== stakeUsdc),
  )
  const scanTimeLabel = scanMeta
    ? new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(scanMeta.at)
    : undefined

  const nyClock = marketClocks.clocks.find((clock) => clock.id === 'newyork')
  const showBuyNowEmpty = rows.length > 0 && filter === 'COMPRAR_JA' && counts.COMPRAR_JA === 0 && visibleRows.length === 0

  const renderDecisionList = () => (
    <section className="decision-list">
      {visibleRows.map((row) => {
        const gain = potentialUsdc(row, stakeUsdc)
        return (
          <div className="decision-item" key={row.symbol}>
            <article
              className={`decision-card ${row.positionGuidance === 'SAIR' ? 'vender invalidated' : row.action.toLowerCase()} ${selected?.symbol === row.symbol ? 'selected' : ''}${row.action === 'COMPRAR' && row.entryTiming === 'AGORA' ? ' buy-now' : ''}`}
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
              title="Clica para abrir gráfico e painel Binance."
            >
              <div className="decision-top">
                <div>
                  <p>{formatTradingPair(row.symbol)}</p>
                  <strong className={`timing-${row.entryTiming.toLowerCase()}`}>{tjrActionLabel(row)}</strong>
                </div>
                <span className="tjr-score-badge" style={{ '--score-color': tjrScoreColor(row.score) } as CSSProperties} title="Score de nova entrada (0–100)">
                  <strong>{row.score}</strong><small>/100</small>
                </span>
              </div>
              <p className="decision-meta">
                {row.setupStatus} · {row.confidence}
                {refinedSymbols.has(row.symbol) ? ' · MTF ✓' : row.action === 'COMPRAR' ? ' · scan 1h' : ''}
                {row.riskReward !== undefined && <> · R:R {row.riskReward.toFixed(1)}×</>}
              </p>
              <p className="decision-price">{price(row.price)} <span className={row.change24h >= 0 ? 'positive' : 'negative'}>{row.change24h.toFixed(1)}% hoje</span></p>
              {row.entry && row.stop && row.target && (
                <p className="decision-levels-compact">
                  {price(row.entry)} → {price(row.target)}
                  {gain !== undefined && <> · <span className="positive">+{moneyShort(gain)}</span> @ {stakeUsdc} {AGENT_QUOTE_ASSET}</>}
                </p>
              )}
              <p>{row.reasons[0]}</p>
              <dl>
                <div><dt>{row.entryTiming === 'RETRACE' ? 'Zona entrada' : 'Entrada'}</dt><dd>{price(row.entry)}</dd></div>
                <div><dt>Stop</dt><dd>{price(row.stop)}</dd></div>
                <div><dt>Alvo (venda)</dt><dd>{price(row.target)}{row.targetLabel ? ` · ${row.targetLabel}` : ''}</dd></div>
                {row.targetSecondary !== undefined && (
                  <div><dt>Alvo 2</dt><dd>{price(row.targetSecondary)}{row.targetSecondaryLabel ? ` · ${row.targetSecondaryLabel}` : ''}</dd></div>
                )}
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
                  onPositionSaved={() => setPinKey((k) => k + 1)}
                  onGoJournal={() => goToCryptoTab('journal')}
                />
                <div className="card-expanded-main">
                  <article className="chart-panel">
                    <header>
                      <div><p className="eyebrow">{formatTradingPair(row.symbol)}</p><h2>{tjrActionLabel(row)} · score {row.score}/100</h2></div>
                      <span title="Scan rápido em 1h; ao expandir refina com 4h/1h/15m/5m.">
                        {loadingFull === row.symbol ? 'A refinar MTF…' : `Execução: ${row.executionInterval ?? '15m'} · gráfico: ${chartInterval}`}
                      </span>
                    </header>
                    <PriceChart
                      symbol={row.symbol}
                      action={row.action}
                      interval={chartInterval}
                      onIntervalChange={setChartInterval}
                      entry={row.entry}
                      stop={row.stop}
                      target={row.target}
                      targetSecondary={row.targetSecondary}
                      targetLabel={row.targetLabel}
                      targetSecondaryLabel={row.targetSecondaryLabel}
                      fillPrice={openFill && resolveBase(row.symbol) === openFill.base.toUpperCase() ? fillPrice : undefined}
                      fillLabel="Fill OCO"
                      zones={row.zones}
                    />
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
        )
      })}
    </section>
  )

  return (
    <main className="agent-shell">
      <div className="agent-desk-sticky">
        <header className="agent-header agent-header-compact">
          <div>
            <p className="eyebrow">AGENTE TJR · SPOT {AGENT_QUOTE_ASSET}</p>
            <h1>O que fazer agora?</h1>
          </div>
          <button type="button" className="agent-scan-btn" onClick={() => void scan()} disabled={running}>
            {running ? 'A analisar…' : 'Analisar mercado'}
          </button>
        </header>

        <section className="session-shell session-shell-compact">
          <MarketClocks snapshot={marketClocks} />
        </section>

        <div className={`setup-preset-bar${scanStale ? ' stale' : ''}`}>
          <span className="setup-preset-label">Setup activo</span>
          <span>{riskProfiles[riskProfile].label}</span>
          <span>·</span>
          <span>TP {tpModeMeta[tpMode].short}</span>
          <span>·</span>
          <span>{stakeUsdc} {AGENT_QUOTE_ASSET} ({stakePct.toFixed(0)}%)</span>
          <span>·</span>
          <span className={todayPnl.pnl >= 0 ? 'positive' : 'negative'}>
            Hoje {todayPnl.pnl >= 0 ? '+' : ''}{todayPnl.pnl.toFixed(2)} {AGENT_QUOTE_ASSET}
            {todayPnl.trades > 0 && <> · {todayPnl.trades}t</>}
          </span>
          {scanTimeLabel && (
            <>
              <span>·</span>
              <span className="setup-preset-scan">Scan {scanTimeLabel}</span>
            </>
          )}
          {scanStale && <strong className="setup-preset-warn"> · config mudou — re-analisa</strong>}
        </div>
        <ActivePositionPin
          riskProfile={riskProfile}
          tpMode={tpMode}
          refreshKey={pinKey}
          onCleared={() => setPinKey((k) => k + 1)}
          onOpenAdvisor={() => setAdvisorOpen(true)}
        />
      </div>
      <OnboardingModal />

      {scanProgress && (
        <div className="scan-progress" role="progressbar" aria-valuenow={scanProgress.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="scan-progress-fill" style={{ width: `${scanProgress.pct}%` }} />
          <span>{scanProgress.label}</span>
        </div>
      )}

      <p className="agent-status">{status}</p>

      {rows.length === 0 && !running && (
        <section className="scan-empty scan-welcome">
          <h2>Mesa de trading Spot TJR</h2>
          <p>Ajusta o setup abaixo e carrega <strong>Analisar mercado</strong> na NY open ({marketClocks.windows.nyOpen.lisbon} PT).</p>
          {nyClock && !session.inIdealWindow && (
            <p className="scan-empty-hint">Agora: <strong>{nyClock.status}</strong> · {session.badge}</p>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <>
          <section className="agent-summary">
            <button type="button" className={filter === 'TODAS' ? 'active' : ''} onClick={() => setFilter('TODAS')}>Todas <span>{rows.length}</span></button>
            <button type="button" className={filter === 'COMPRAR_JA' ? 'active buy' : 'buy'} onClick={() => setFilter('COMPRAR_JA')}>Comprar já <span>{counts.COMPRAR_JA}</span></button>
            <button type="button" className={filter === 'AGUARDAR_COMPRA' ? 'active watch' : 'watch'} onClick={() => setFilter('AGUARDAR_COMPRA')}>Aguardar <span>{counts.AGUARDAR_COMPRA}</span></button>
            <button type="button" className={filter === 'VENDER' ? 'active sell' : 'sell'} onClick={() => setFilter('VENDER')}>Vender <span>{counts.VENDER}</span></button>
            <button type="button" className={filter === 'ESPERAR' ? 'active wait' : 'wait'} onClick={() => setFilter('ESPERAR')}>Esperar <span>{counts.ESPERAR}</span></button>
            <label>Pesquisar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Ex.: RE/${AGENT_QUOTE_ASSET}`} /></label>
          </section>

          {showBuyNowEmpty && (
            <section className="scan-empty">
              <h3>Nenhum COMPRAR JÁ neste scan</h3>
              <p>Normal fora da NY open ou quando nenhum par completa os 4 passos + BOS 1m. Setups expiram em minutos.</p>
              <div className="scan-empty-actions">
                {counts.AGUARDAR_COMPRA > 0 && (
                  <button type="button" onClick={() => setFilter('AGUARDAR_COMPRA')}>Ver aguardar compra ({counts.AGUARDAR_COMPRA})</button>
                )}
                {!session.inIdealWindow && nyClock && (
                  <p className="scan-empty-hint">Próxima NY open: <strong>{marketClocks.windows.nyOpen.lisbon} PT</strong> · {nyClock.status}</p>
                )}
              </div>
            </section>
          )}

          {!showBuyNowEmpty && renderDecisionList()}
        </>
      )}

      <details className="agent-panel">
        <summary>Configuração · risco · TP · montante</summary>
        <div className="agent-panel-body">
          <section className="risk-control">
            <div><strong>Risco: {riskProfiles[riskProfile].label}</strong><p>{riskProfiles[riskProfile].description}</p></div>
            <input aria-label="Perfil de risco" type="range" min="0" max="2" step="1" value={riskIndex} onChange={(event) => setRiskIndex(Number(event.target.value))} />
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
            <input aria-label="Modo de take-profit" type="range" min="0" max="2" step="1" value={tpIndex} onChange={(event) => setTpIndex(Number(event.target.value))} />
            <div className="risk-labels"><span>1R</span><span>1.5R</span><span>Liquidez</span></div>
          </section>
          <section className="stake-control">
            <div>
              <strong>Montante por trade: {stakeUsdc} {AGENT_QUOTE_ASSET}</strong>
              <p>~{stakePct.toFixed(1)}% da conta ({accountUsdc} {AGENT_QUOTE_ASSET}). Mínimo Binance: 1 {AGENT_QUOTE_ASSET}.</p>
            </div>
            <input aria-label="Montante por trade" type="range" min="0" max={STAKE_OPTIONS.length - 1} step="1" value={stakeIndex} onChange={(event) => setStakeIndex(Number(event.target.value))} />
            <div className="risk-labels">{STAKE_OPTIONS.map((value) => <span key={value}>{value}</span>)}</div>
            <label className="account-size-field">
              Conta total ({AGENT_QUOTE_ASSET})
              <input
                type="number"
                min={50}
                step={10}
                value={accountUsdc}
                onChange={(event) => setAccountUsdc(Math.max(50, Number(event.target.value) || 50))}
              />
            </label>
          </section>
          {rows.length > 0 && (
            <button type="button" className="agent-reapply-btn" onClick={() => void scan()} disabled={running}>
              Aplicar setup e re-analisar
            </button>
          )}
        </div>
      </details>
      <TpModeModal open={tpHelpOpen} onClose={() => setTpHelpOpen(false)} active={tpMode} />

      <details className="agent-panel" open={advisorOpen} onToggle={(event) => setAdvisorOpen((event.target as HTMLDetailsElement).open)}>
        <summary>Posição aberta</summary>
        <div className="agent-panel-body">
          <PositionAdvisor riskProfile={riskProfile} tpMode={tpMode} onSaved={() => setPinKey((k) => k + 1)} />
        </div>
      </details>

      <details className="agent-panel">
        <summary>Killzone · horários · regras TJR</summary>
        <div className="agent-panel-body">
          <div className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''} ${session.blockEntries ? 'blocked' : ''}`}>{session.badge}</div>
          <div className="session-window-body">
            <p><strong>NY open ({marketClocks.windows.nyOpen.et} ET · {marketClocks.windows.nyOpen.lisbon} PT):</strong> COMPRAR JÁ (conservador/equilibrado).</p>
            <p><strong>NY mid ({marketClocks.windows.nyMid.lisbon} PT):</strong> só AGUARDAR COMPRA.</p>
            <p><strong>NY fecho + noite:</strong> sem novas entradas.</p>
            <p><strong>Londres ({marketClocks.windows.london.lisbon} PT):</strong> AGUARDAR; COMPRAR JÁ só agressivo.</p>
          </div>
          <section className="agent-rules">
            <div><strong>COMPRAR JÁ</strong><span>4 passos: sweep → BOS 5m → zona → BOS 1m.</span></div>
            <div><strong>AGUARDAR</strong><span>Setup ok; à espera retrace + BOS 1m.</span></div>
            <div><strong>VENDER</strong><span>BOS contrário, stop ou alvo.</span></div>
            <div><strong>ESPERAR</strong><span>Modelo incompleto ou fora killzone.</span></div>
          </section>
          <details className="tjr-glossary">
            <summary>Glossário (BOS · FVG · SMT)</summary>
            <ul>
              <li><strong>BOS</strong> — Break of Structure: close que rompe o último swing (confirmação ou invalidação).</li>
              <li><strong>FVG</strong> — Fair Value Gap: zona de imbalance onde o preço tende a retrace (entrada).</li>
              <li><strong>SMT</strong> — Smart Money Tool / divergência vs BTC: alt e BTC a fazer extremos opostos.</li>
              <li><strong>Sweep</strong> — wick além de high/low de sessão ou dia para capturar liquidez.</li>
              <li><strong>1R</strong> — lucro igual ao risco entry→stop; TP Liquidez usa draws HTF.</li>
            </ul>
          </details>
        </div>
      </details>

      <section className="agent-disclaimer"><strong>Importante:</strong> sinal técnico, não garantia. Não executa ordens. Define o teu risco antes de agir.</section>
    </main>
  )
}
