import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getCandles, getLiquidMarkets, getPlaybookCandles } from '../../lib/binance'
import { goToCryptoTab } from '../../lib/crypto-tabs'
import { dayId, pnlForDay } from '../../lib/journal/journal-stats'
import { getClosedTrades } from '../../lib/journal/trade-store'
import { loadOpenPosition, parseOpenNumber } from '../../lib/open-position-store'
import {
  evaluateTjrFull,
  evaluateTjrQuick,
  formatSetupHitLabel,
  listBuyNowSetups,
  tjrActionLabel,
  tjrTimingLabel,
  isEnterLongNow,
  tjrScoreColor,
  type TjrDecision,
} from '../../lib/tjr-engine'
import { getMarketClocks, getTradingSessionStatus } from '../../lib/trading-session'
import MarketClocks from './MarketClocks'
import ActivePositionPin from './ActivePositionPin'
import { BinanceOrderPanel, STAKE_OPTIONS } from './BinanceTradeGuide'
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
const HIGH_SWEEP_KEY = 'tjr-allow-high-sweep-long'
const ALL_SETUPS_KEY = 'tjr-scan-all-setups'
const WIDE_NET_KEY = 'tjr-wide-net'

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
  const [allowHighSweepLong, setAllowHighSweepLong] = useState(() => readBool(HIGH_SWEEP_KEY, false))
  const [scanAllSetups, setScanAllSetups] = useState(() => readBool(ALL_SETUPS_KEY, false))
  const [wideNet, setWideNet] = useState(() => readBool(WIDE_NET_KEY, false))
  const [selected, setSelected] = useState<AgentRow>()
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [loadingFull, setLoadingFull] = useState<string>()
  const [refinedSymbols, setRefinedSymbols] = useState<Set<string>>(() => new Set())
  const [scanMeta, setScanMeta] = useState<{ at: Date; profile: RiskProfile; tpMode: TpMode; stakeUsdc: number }>()
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const riskProfile = profiles[riskIndex]
  const evalOptions = useMemo(
    () => ({ allowHighSweepLong, wideNet, sessionMarket: 'crypto' as const }),
    [allowHighSweepLong, wideNet],
  )
  const [session, setSession] = useState(() => getTradingSessionStatus(new Date(), { market: 'crypto' }))
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
      localStorage.setItem(HIGH_SWEEP_KEY, allowHighSweepLong ? '1' : '0')
      localStorage.setItem(ALL_SETUPS_KEY, scanAllSetups ? '1' : '0')
      localStorage.setItem(WIDE_NET_KEY, wideNet ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [tpMode, riskIndex, stakeIndex, accountUsdc, allowHighSweepLong, scanAllSetups, wideNet])

  useEffect(() => {
    const tick = () => {
      setSession(getTradingSessionStatus(new Date(), { market: 'crypto' }))
      setMarketClocks(getMarketClocks())
      setTodayPnl(pnlForDay(getClosedTrades(), dayId(Date.now())))
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const refineRow = async (symbol: string, fallback: Pick<AgentRow, 'price' | 'change24h'>) => {
    const [data, btc] = await Promise.all([getPlaybookCandles(symbol), getPlaybookCandles(BTC_REFERENCE_SYMBOL)])
    const openHere = Boolean(openFill && resolveBase(symbol) === openFill.base.toUpperCase())
    const opts = { ...evalOptions, openPosition: openHere }
    let decision = evaluateTjrFull(symbol, data, btc, riskProfile, tpMode, 'long', opts)
    const matchingSetups = scanAllSetups ? listBuyNowSetups(symbol, data, btc, opts, 'long') : undefined
    if (scanAllSetups && matchingSetups && matchingSetups.length > 0) {
      const userHit = matchingSetups.find((hit) => hit.profile === riskProfile && hit.tpMode === tpMode)
      if (userHit) {
        decision = {
          ...decision,
          matchingSetups,
          tradeSetup: userHit,
        }
      } else {
        const best = matchingSetups[0]
        decision = {
          ...evaluateTjrFull(symbol, data, btc, best.profile, best.tpMode, 'long', opts),
          matchingSetups,
          tradeSetup: best,
        }
      }
    } else if (isEnterLongNow(decision)) {
      decision = {
        ...decision,
        tradeSetup: {
          profile: riskProfile,
          tpMode,
          label: formatSetupHitLabel(riskProfile, tpMode),
          score: decision.score,
        },
      }
    }
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
  }, [selected?.symbol, riskProfile, tpMode, allowHighSweepLong, scanAllSetups, wideNet])

  const scan = async () => {
    setRunning(true)
    setRows([])
    setSelected(undefined)
    setRefinedSymbols(new Set())
    setScanProgress({ pct: 0, label: 'A iniciar…' })
    try {
      const [markets, btc1h] = await Promise.all([getLiquidMarkets(10_000), getCandles(BTC_REFERENCE_SYMBOL, '1h')])
      const results: AgentRow[] = []
      const quickProfile: RiskProfile = scanAllSetups ? 'agressivo' : riskProfile
      const quickTp: TpMode = scanAllSetups ? '1r' : tpMode
      for (let index = 0; index < markets.length; index += 5) {
        const done = Math.min(index + 5, markets.length)
        setScanProgress({ pct: Math.round((done / markets.length) * 70), label: `Scan 1h · ${done}/${markets.length}` })
        setStatus(`TJR · ${done} / ${markets.length} moedas…`)
        const batch = await Promise.all(markets.slice(index, index + 5).map(async (market) => {
          try {
            const candles1h = await getCandles(market.symbol, '1h')
            const decision = evaluateTjrQuick(market.symbol, candles1h, btc1h, quickProfile, quickTp, evalOptions, 'long')
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

      // MTF só para candidatos a LONG. Com "Todos setups", NÃO usar top score global —
      // senão o refine gasta-se em VENDER (sweeps de H / short), que Spot não compra.
      const comprarQuick = sorted.filter((row) => row.action === 'COMPRAR')
      const longWatch = sorted.filter(
        (row) => row.action === 'ESPERAR' && row.bias === 'bullish' && !row.opposedSweep,
      )
      const buyCandidates = (() => {
        if (!scanAllSetups) return comprarQuick.slice(0, AUTO_REFINE_TOP)
        const pool: AgentRow[] = []
        const pushUnique = (row: AgentRow) => {
          if (pool.length >= AUTO_REFINE_TOP) return
          if (pool.some((item) => item.symbol === row.symbol)) return
          pool.push(row)
        }
        for (const row of comprarQuick) pushUnique(row)
        for (const row of longWatch) pushUnique(row)
        return pool
      })()
      if (buyCandidates.length > 0) {
        setStatus(
          scanAllSetups
            ? `Scan 1h ok · a testar setups no top ${buyCandidates.length} longs…`
            : `Scan 1h ok · a refinar top ${buyCandidates.length} candidatos COMPRAR (1m/MTF)…`,
        )
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
            if (isEnterLongNow(refined)) buyNow += 1
          } catch {
            /* mantém scan 1h deste par */
          }
        }
        setStatus(
          buyNow > 0
            ? `${results.length} moedas · ${buyCandidates.length} refinadas · ${buyNow} COMPRAR JÁ. Expande o cartão para valores Binance.`
            : `${results.length} moedas · ${buyCandidates.length} refinadas · 0 COMPRAR JÁ (falta BOS 1m ou setup incompleto). Vê Aguardar.`,
        )
      } else {
        const highSweepHeavy = sorted.filter((row) => row.opposedSweep || row.action === 'VENDER').length
        setStatus(
          highSweepHeavy > sorted.length * 0.15
            ? `${results.length} moedas · 0 candidatos LONG no scan 1h. Mercado cheio de sweeps de HIGH (setups de short) — Spot só compra após sweep de LOW.`
            : `${results.length} moedas analisadas. Nenhum candidato COMPRAR no scan 1h.`,
        )
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
    COMPRAR_JA: rows.filter((row) => isEnterLongNow(row)).length,
    AGUARDAR_COMPRA: rows.filter((row) => row.action === 'COMPRAR' && row.entryTiming === 'RETRACE').length,
    VENDER: rows.filter((row) => row.action === 'VENDER').length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR').length,
  }
  const normalizedQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const visibleRows = rows.filter((row) => {
    const symbolMatch = !normalizedQuery || row.symbol.includes(normalizedQuery) || row.symbol.replace(/USDC$/, '').includes(normalizedQuery)
    if (!symbolMatch) return false
    if (filter === 'TODAS') return true
    if (filter === 'COMPRAR_JA') return isEnterLongNow(row)
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

  const renderExpandedRow = (row: AgentRow) => (
    <section className="desk-workspace-chart desk-row-expand" id={`expand-${row.symbol}`}>
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
            <div>
              <p className="eyebrow">{formatTradingPair(row.symbol)}</p>
              <h2>{tjrActionLabel(row)} · {row.score}/100</h2>
            </div>
            <span>
              {loadingFull === row.symbol ? 'A refinar MTF…' : `Exec ${row.executionInterval ?? '15m'} · chart ${chartInterval}`}
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
            htfLevels={row.htfLevels}
          />
        </article>
        <aside className="evidence-panel compact">
          {row.invalidationReason && (row.positionGuidance === 'SAIR' || row.positionGuidance === 'REALIZAR_ALVO') && (
            <p className="invalidation-alert"><strong>{tjrActionLabel(row)}:</strong> {row.invalidationReason}</p>
          )}
          <p className="evidence-summary">
            <strong>Bias:</strong> {row.bias === 'bullish' ? 'Altista' : row.bias === 'bearish' ? 'Baixista' : 'Neutro'}
            {' · '}<strong>Timing:</strong> {tjrTimingLabel(row)}
            {row.riskReward !== undefined && <> · <strong>R:R</strong> {row.riskReward.toFixed(1)}×</>}
          </p>
          {row.matchingSetups && row.matchingSetups.length > 0 && (
            <p className="setup-hit-panel">
              <strong>Setups COMPRAR JÁ:</strong>{' '}
              {row.matchingSetups.map((hit) => hit.label).join(' · ')}
              {row.tradeSetup && (
                <> · <strong>níveis:</strong> {row.tradeSetup.label}</>
              )}
            </p>
          )}
          {!row.matchingSetups && row.tradeSetup && (
            <p className="setup-hit-panel"><strong>Setup:</strong> {row.tradeSetup.label}</p>
          )}
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
  )

  useEffect(() => {
    if (!selected?.symbol) return
    const id = window.requestAnimationFrame(() => {
      document.getElementById(`expand-${selected.symbol}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [selected?.symbol])

  const renderDecisionList = () => (
    <section className="desk-watchlist">
      <div className="desk-table-wrap">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Par</th>
              <th>Sinal</th>
              <th>Sweep</th>
              <th>Score</th>
              <th>Preço</th>
              <th>24h</th>
              <th>Entrada</th>
              <th>Stop</th>
              <th>TP1</th>
              <th>R:R</th>
              <th>Pot. @ {stakeUsdc}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const gain = potentialUsdc(row, stakeUsdc)
              const open = selected?.symbol === row.symbol
              const detail = open ? (visibleRows.find((r) => r.symbol === selected.symbol) ?? selected) : undefined
              return (
                <Fragment key={row.symbol}>
                  <tr
                    className={`${row.positionGuidance === 'SAIR' ? 'row-exit' : row.action.toLowerCase()}${open ? ' selected' : ''}${isEnterLongNow(row) ? ' buy-now' : ''}`}
                    onClick={() => {
                      if (open) {
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
                  >
                    <td className="col-symbol">{formatTradingPair(row.symbol)}</td>
                    <td>
                      <strong className={`timing-${row.entryTiming.toLowerCase()}`}>{tjrActionLabel(row)}</strong>
                      <small className="desk-sub">{row.setupStatus}{refinedSymbols.has(row.symbol) ? ' · MTF' : ''}</small>
                      {row.matchingSetups && row.matchingSetups.length > 0 && (
                        <div className="setup-hit-row" title="Setups que deram COMPRAR JÁ">
                          {row.matchingSetups.map((hit) => {
                            const isTrade = row.tradeSetup?.profile === hit.profile && row.tradeSetup?.tpMode === hit.tpMode
                            return (
                              <span
                                key={`${hit.profile}-${hit.tpMode}`}
                                className={`setup-hit${isTrade ? ' current' : ''}`}
                              >
                                {hit.label}
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {!row.matchingSetups && row.tradeSetup && isEnterLongNow(row) && (
                        <div className="setup-hit-row">
                          <span className="setup-hit current">{row.tradeSetup.label}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {row.riskyHighLong ? (
                        <span className="sweep-tag warn" title={row.checklist.find((i) => i.label.startsWith('1.'))?.note}>
                          {row.sweepLabel ?? 'H · arriscado'}
                        </span>
                      ) : row.opposedSweep ? (
                        <span className="sweep-tag warn" title={row.checklist.find((i) => i.label.startsWith('1.'))?.note}>
                          {row.sweepLabel ?? 'H · não comprar'}
                        </span>
                      ) : row.reactive ? (
                        <span className="sweep-tag reactive" title={row.checklist.find((i) => i.label.startsWith('1.'))?.note}>
                          Reactivo · {row.sweepLabel ?? 'low'}
                        </span>
                      ) : row.sweepLabel ? (
                        <span className="sweep-tag" title={row.checklist.find((i) => i.label.startsWith('1.'))?.note}>
                          {row.sweepLabel}
                        </span>
                      ) : (
                        <span className="sweep-tag muted">Sem low</span>
                      )}
                    </td>
                    <td>
                      <span className="tjr-score-badge inline" style={{ '--score-color': tjrScoreColor(row.score) } as CSSProperties}>
                        <strong>{row.score}</strong>
                      </span>
                    </td>
                    <td className="num">{price(row.price)}</td>
                    <td className={`num ${row.change24h >= 0 ? 'positive' : 'negative'}`}>{row.change24h.toFixed(1)}%</td>
                    <td className="num">{price(row.entry)}</td>
                    <td className="num">{price(row.stop)}</td>
                    <td className="num">{price(row.target)}</td>
                    <td className="num">{row.riskReward?.toFixed(1) ?? '—'}×</td>
                    <td className="num">{gain !== undefined ? <span className="positive">+{moneyShort(gain)}</span> : '—'}</td>
                  </tr>
                  {detail && (
                    <tr className="desk-expand-row" onClick={(event) => event.stopPropagation()}>
                      <td colSpan={11}>{renderExpandedRow(detail)}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )

  return (
    <main className="agent-shell desk-workspace">
      <header className="tv-toolbar">
        <div className="tv-toolbar-left">
          <strong className="tv-symbol">SPOT/{AGENT_QUOTE_ASSET}</strong>
          <span className="tv-sep">·</span>
          <span className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''} ${session.blockEntries ? 'blocked' : ''}`}>
            {session.badge}
          </span>
          {selected?.riskyHighLong ? (
            <span className="sweep-badge warn">Sweep H · long arriscado</span>
          ) : selected?.opposedSweep ? (
            <span className="sweep-badge warn">Sweep H · não comprar</span>
          ) : selected?.reactive ? (
            <span className="sweep-badge reactive">Reactivo · {selected.sweepLabel}</span>
          ) : selected?.sweepLabel ? (
            <span className="sweep-badge">Sweep L · {selected.sweepLabel}</span>
          ) : (
            <span className="sweep-badge muted">À espera de sweep de LOW</span>
          )}
          <span className="tv-clock" title="Lisboa">{session.nowLisbon} PT</span>
          <span className="tv-clock muted" title="New York">{session.nowNy} ET</span>
        </div>
        <div className="tv-toolbar-right">
          <button type="button" className="agent-scan-btn" onClick={() => void scan()} disabled={running}>
            {running ? 'A analisar…' : 'Analisar mercado'}
          </button>
        </div>
      </header>

      <section className="zella-kpis" aria-label="Resumo do desk">
        <article>
          <span>PnL hoje</span>
          <strong className={todayPnl.pnl >= 0 ? 'positive' : 'negative'}>
            {todayPnl.pnl >= 0 ? '+' : ''}{todayPnl.pnl.toFixed(2)}
          </strong>
          <small>{AGENT_QUOTE_ASSET}</small>
        </article>
        <article>
          <span>Trades</span>
          <strong>{todayPnl.trades}</strong>
          <small>hoje</small>
        </article>
        <article>
          <span>Stake</span>
          <strong>{stakeUsdc}</strong>
          <small>{stakePct.toFixed(0)}% conta</small>
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
          <small>{scanTimeLabel ? `scan ${scanTimeLabel}` : 'sem scan'}</small>
        </article>
      </section>

      <section className="tv-setup-bar" aria-label="Setup de risco e montante">
        <label className="tv-setup-field">
          <span>Risco</span>
          <select
            aria-label="Perfil de risco"
            value={riskIndex}
            onChange={(event) => {
              setRiskIndex(Number(event.target.value))
              if (rows.length > 0) setStatus('Perfil alterado — aplica e re-analisa para recalcular.')
            }}
          >
            {profiles.map((profile, index) => (
              <option key={profile} value={index}>{riskProfiles[profile].label}</option>
            ))}
          </select>
        </label>
        <label className="tv-setup-field">
          <span>TP <button type="button" className="tp-help-btn" onClick={() => setTpHelpOpen(true)} title="Explicar modos de TP">?</button></span>
          <select
            aria-label="Modo de take-profit"
            value={tpIndex}
            onChange={(event) => {
              setTpIndex(Number(event.target.value))
              if (rows.length > 0) setStatus('Modo TP alterado — aplica e re-analisa para recalcular o alvo.')
            }}
          >
            {tpModes.map((mode, index) => (
              <option key={mode} value={index}>{tpModeMeta[mode].short}</option>
            ))}
          </select>
        </label>
        <label className="tv-setup-field">
          <span>Montante</span>
          <select
            aria-label="Montante por trade"
            value={stakeIndex}
            onChange={(event) => setStakeIndex(Number(event.target.value))}
          >
            {STAKE_OPTIONS.map((value, index) => (
              <option key={value} value={index}>{value} {AGENT_QUOTE_ASSET}</option>
            ))}
          </select>
        </label>
        <label className="tv-setup-field account">
          <span>Conta</span>
          <input
            type="number"
            min={50}
            step={10}
            value={accountUsdc}
            onChange={(event) => setAccountUsdc(Math.max(50, Number(event.target.value) || 50))}
          />
        </label>
        <label className="tv-setup-toggle" title="Permite COMPRAR após sweep de HIGH (não é setup TJR clássico de long)">
          <input
            type="checkbox"
            checked={allowHighSweepLong}
            onChange={(event) => {
              setAllowHighSweepLong(event.target.checked)
              if (rows.length > 0) setStatus('Toggle H-sweep — re-analisa para aplicar.')
            }}
          />
          <span>Long após H</span>
        </label>
        <label className="tv-setup-toggle" title="Gates + sessão como Agressivo (Londres / NY mid). Mantém BOS 1m para COMPRAR JÁ. Mais sinais, menor qualidade.">
          <input
            type="checkbox"
            checked={wideNet}
            onChange={(event) => {
              setWideNet(event.target.checked)
              if (rows.length > 0) setStatus('Malha larga — re-analisa para aplicar.')
            }}
          />
          <span>Malha larga</span>
        </label>
        <label className="tv-setup-toggle" title="No refine MTF testa as 9 combinações risco×TP e mostra no cartão quais deram COMPRAR JÁ">
          <input
            type="checkbox"
            checked={scanAllSetups}
            onChange={(event) => {
              setScanAllSetups(event.target.checked)
              if (rows.length > 0) setStatus('Todos os setups — re-analisa para aplicar.')
            }}
          />
          <span>Todos setups</span>
        </label>
        {rows.length > 0 && (
          <button type="button" className="setup-reapply" onClick={() => void scan()} disabled={running}>
            {running ? '…' : 'Aplicar + scan'}
          </button>
        )}
        {scanStale && <strong className="setup-preset-warn">Setup mudou — re-analisa</strong>}
      </section>

      <MarketClocks snapshot={marketClocks} compact />

      <ActivePositionPin
        riskProfile={riskProfile}
        tpMode={tpMode}
        refreshKey={pinKey}
        onCleared={() => setPinKey((k) => k + 1)}
        onOpenAdvisor={() => setAdvisorOpen(true)}
      />
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
          <h2>Watchlist vazia</h2>
          <p>Define risco · TP · montante na barra de setup e carrega <strong>Analisar mercado</strong>. Melhor na NY open ({marketClocks.windows.nyOpen.lisbon} PT).</p>
          {nyClock && !session.inIdealWindow && (
            <p className="scan-empty-hint">Agora: <strong>{nyClock.status}</strong> · {session.badge}</p>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <>
          <section className="agent-summary desk-filters">
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
        <summary>Ajuda setup · o que muda cada controlo</summary>
        <div className="agent-panel-body setup-help">
          <p><strong>Risco ({riskProfiles[riskProfile].label}):</strong> {riskProfiles[riskProfile].description}</p>
          <p><strong>TP ({tpModeMeta[tpMode].label}):</strong> {tpModeMeta[tpMode].description}</p>
          <p><strong>Montante:</strong> {stakeUsdc} {AGENT_QUOTE_ASSET} ≈ {stakePct.toFixed(1)}% da conta ({accountUsdc} {AGENT_QUOTE_ASSET}). Usado no painel Binance e no preview de lucro.</p>
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
            <div><strong>VENDER</strong><span>Só com posição aberta (stop/alvo/BOS). Sem trade = não aparece.</span></div>
            <div><strong>ESPERAR</strong><span>Sem setup long completo (sweep LOW, estrutura, killzone…).</span></div>
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
