import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { agentUsesPracticalConfirm, selectAgentMtfPool } from '../../lib/agent-mtf-pool'
import { addAgentPin, agentPinSymbols, readAgentPins, removeAgentPin } from '../../lib/agent-watchlist'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getCandles, getLiquidMarkets, getPinnedMarkets, getPlaybookCandles, mergeMarketLists } from '../../lib/binance'
import { mapPool } from '../../lib/map-pool'
import {
  AGENT_PRESETS,
  AGENT_PRIMARY_PRESETS,
  matchAgentPreset,
  readActivePresetId,
  tpIndexFor,
  writeActivePresetId,
  type AgentPresetId,
} from '../../lib/agent-presets'
import { goToCryptoTab } from '../../lib/crypto-tabs'
import { alertsEnabled, ensureNotificationPermission, notifyActionNow, setAlertsEnabled } from '../../lib/desk-alerts'
import { dayId, pnlForDay } from '../../lib/journal/journal-stats'
import { getClosedTrades } from '../../lib/journal/trade-store'
import { biasLabel, computeMarketRegime, type MarketRegime } from '../../lib/market-regime'
import { loadOpenPosition, parseOpenNumber } from '../../lib/open-position-store'
import {
  evaluateTjrFull,
  evaluateTjrQuick,
  formatSetupHitLabel,
  listBuyNowSetups,
  pickPreferredSetupHit,
  tjrActionLabel,
  tjrTimingLabel,
  isEnterLongNow,
  tjrScoreColor,
  type TjrDecision,
} from '../../lib/tjr-engine'
import type { TradeSignalMeta } from '../../lib/trade-signal-meta'
import { getMarketClocks, getTradingSessionStatus } from '../../lib/trading-session'
import { t212CryptoAgentSymbols } from '../../lib/yahoo-market'
import { explainNoAgoraSpot } from '../../lib/no-agora-explain'
import MarketClocks from './MarketClocks'
import ActivePositionPin from './ActivePositionPin'
import { BinanceOrderPanel } from './BinanceTradeGuide'
import OnboardingModal from './OnboardingModal'
import PriceChart from '../chart/PriceChart'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import type { Direction, Interval } from '../../lib/types'
import { useScreenWakeLock } from '../../lib/use-screen-wake-lock'
import { useScrollToScanOnRun } from '../../lib/use-scroll-to-scan'
import TpModeModal from './TpModeModal'

const TP_STORAGE_KEY = 'tjr-tp-mode'
const RISK_KEY = 'tjr-risk-index'
const HIGH_SWEEP_KEY = 'tjr-allow-high-sweep-long'
const ALL_SETUPS_KEY = 'tjr-scan-all-setups'
const WIDE_NET_KEY = 'tjr-wide-net'
const AVOID_NY_MID_KEY = 'tjr-avoid-ny-mid'
const VIDEO_STRICT_KEY = 'tjr-video-strict'

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

const resolveBase = (symbol: string) => symbol.replace(new RegExp(`${AGENT_QUOTE_ASSET}$`), '')

const sortByScore = <T extends { score: number; riskReward?: number }>(list: T[]) =>
  [...list].sort((a, b) => b.score - a.score || (b.riskReward ?? 0) - (a.riskReward ?? 0))

const potentialPct = (row: AgentRow) => {
  if (!row.entry || !row.target || row.entry <= 0 || row.action !== 'COMPRAR') return undefined
  return ((row.target - row.entry) / row.entry) * 100
}

/** Top candidatos COMPRAR refinados automaticamente após scan (precisa 1m para COMPRAR JÁ). */
const AUTO_REFINE_TOP = 50

export default function AgentDashboard() {
  const [rows, setRows] = useState<AgentRow[]>([])
  const [status, setStatus] = useState('Pronto — analisa na NY open ou vê posição aberta abaixo.')
  const [running, setRunning] = useState(false)
  useScreenWakeLock(running)
  const scanAnchorRef = useScrollToScanOnRun(running)
  const [refreshingAguardar, setRefreshingAguardar] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ pct: number; label: string }>()
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR_JA' | 'AGUARDAR_COMPRA' | 'VENDER' | 'ESPERAR'>('TODAS')
  const [query, setQuery] = useState('')
  const [riskIndex, setRiskIndex] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(RISK_KEY))
      return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : 1
    } catch {
      return 1
    }
  })
  const [tpIndex, setTpIndex] = useState(() => Math.max(0, tpModes.indexOf(readStoredTpMode())))
  const [tpHelpOpen, setTpHelpOpen] = useState(false)
  const tpMode = tpModes[tpIndex]
  const [allowHighSweepLong, setAllowHighSweepLong] = useState(() => readBool(HIGH_SWEEP_KEY, false))
  const [scanAllSetups, setScanAllSetups] = useState(() => readBool(ALL_SETUPS_KEY, true))
  const [wideNet, setWideNet] = useState(() => readBool(WIDE_NET_KEY, false))
  const [avoidNyMid, setAvoidNyMid] = useState(() => readBool(AVOID_NY_MID_KEY, true))
  const [tjrVideoStrict, setTjrVideoStrict] = useState(() => readBool(VIDEO_STRICT_KEY, false))
  const [selected, setSelected] = useState<AgentRow>()
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [loadingFull, setLoadingFull] = useState<string>()
  const [refinedSymbols, setRefinedSymbols] = useState<Set<string>>(() => new Set())
  const [scanMeta, setScanMeta] = useState<{ at: Date; profile: RiskProfile; tpMode: TpMode }>()
  const [pins, setPins] = useState(() => readAgentPins())
  const [pinDraft, setPinDraft] = useState('')
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const riskProfile = profiles[riskIndex]
  const evalOptions = useMemo(
    () => ({
      instrumentKind: 'crypto' as const,
      allowHighSweepLong,
      wideNet,
      sessionMarket: 'crypto' as const,
      killzoneQualityOnly: true,
      avoidNyMidEnter: avoidNyMid,
      tjrVideoStrict,
      cfdPractical: agentUsesPracticalConfirm(tjrVideoStrict, scanAllSetups),
    }),
    [allowHighSweepLong, wideNet, avoidNyMid, tjrVideoStrict, scanAllSetups],
  )
  const [session, setSession] = useState(() => getTradingSessionStatus(new Date(), { market: 'crypto' }))
  const [marketClocks, setMarketClocks] = useState(() => getMarketClocks())
  const [pinKey, setPinKey] = useState(0)
  const [todayPnl, setTodayPnl] = useState(() => pnlForDay(getClosedTrades(), dayId(Date.now())))
  const [regime, setRegime] = useState<MarketRegime>()
  const [alertBuyNow, setAlertBuyNow] = useState(() => alertsEnabled())
  const [presetId, setPresetId] = useState<AgentPresetId>(() => readActivePresetId())
  const openFill = useMemo(() => loadOpenPosition(), [pinKey])
  const fillPrice = openFill ? parseOpenNumber(openFill.entryPrice) : undefined

  useEffect(() => {
    try {
      localStorage.setItem(TP_STORAGE_KEY, tpMode)
      localStorage.setItem(RISK_KEY, String(riskIndex))
      localStorage.setItem(HIGH_SWEEP_KEY, allowHighSweepLong ? '1' : '0')
      localStorage.setItem(ALL_SETUPS_KEY, scanAllSetups ? '1' : '0')
      localStorage.setItem(WIDE_NET_KEY, wideNet ? '1' : '0')
      localStorage.setItem(AVOID_NY_MID_KEY, avoidNyMid ? '1' : '0')
      localStorage.setItem(VIDEO_STRICT_KEY, tjrVideoStrict ? '1' : '0')
    } catch {
      /* ignore */
    }
    const matched = matchAgentPreset({
      riskIndex,
      tpMode,
      avoidNyMid,
      wideNet,
      allowHighSweepLong,
      scanAllSetups,
      tjrVideoStrict,
    })
    setPresetId(matched)
    writeActivePresetId(matched)
  }, [tpMode, riskIndex, allowHighSweepLong, scanAllSetups, wideNet, avoidNyMid, tjrVideoStrict])

  const applyPreset = (id: Exclude<AgentPresetId, 'custom'>) => {
    const { config } = AGENT_PRESETS[id]
    setRiskIndex(config.riskIndex)
    setTpIndex(tpIndexFor(config.tpMode))
    setAvoidNyMid(config.avoidNyMid)
    setWideNet(config.wideNet)
    setAllowHighSweepLong(config.allowHighSweepLong)
    setScanAllSetups(config.scanAllSetups)
    setTjrVideoStrict(config.tjrVideoStrict)
    setPresetId(id)
    writeActivePresetId(id)
    if (rows.length > 0) setStatus(`Playbook «${AGENT_PRESETS[id].label}» — aplica + scan para recalcular.`)
  }

  const buildSignalMeta = (row: Pick<TjrDecision, 'score' | 'softOpposed' | 'riskyHighLong' | 'opposedSweep'>): TradeSignalMeta => ({
    score: row.score,
    session: session.window,
    sessionBadge: session.badge,
    riskProfile,
    tpMode,
    softOpposed: row.softOpposed,
    riskyHighLong: row.riskyHighLong,
    opposedSweep: row.opposedSweep,
    wideNet,
    allowHighSweepLong,
  })

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

  const refineRow = async (
    symbol: string,
    fallback: Pick<AgentRow, 'price' | 'change24h'>,
    options: { bypassCache?: boolean; btcPack?: Awaited<ReturnType<typeof getPlaybookCandles>> } = {},
  ) => {
    const [data, btc] = await Promise.all([
      getPlaybookCandles(symbol, { bypassCache: options.bypassCache }),
      options.btcPack
        ? Promise.resolve(options.btcPack)
        : getPlaybookCandles(BTC_REFERENCE_SYMBOL, { bypassCache: options.bypassCache }),
    ])
    const openHere = Boolean(openFill && resolveBase(symbol) === openFill.base.toUpperCase())
    const opts = { ...evalOptions, openPosition: openHere }
    let decision = evaluateTjrFull(symbol, data, btc, riskProfile, tpMode, 'long', opts)
    // Todos setups ON: qualquer dos 9 com COMPRAR JÁ ou AGUARDAR → esse sinal (preferência ao teu Risco×TP no mesmo tier).
    const matchingSetups = scanAllSetups ? listBuyNowSetups(symbol, data, btc, opts, 'long') : undefined
    if (scanAllSetups && matchingSetups && matchingSetups.length > 0) {
      const best = pickPreferredSetupHit(matchingSetups, riskProfile, tpMode)!
      const sameAsUi = best.profile === riskProfile && best.tpMode === tpMode
      decision = {
        ...(sameAsUi ? decision : evaluateTjrFull(symbol, data, btc, best.profile, best.tpMode, 'long', opts)),
        matchingSetups,
        tradeSetup: best,
      }
    } else if (isEnterLongNow(decision) || (decision.action === 'COMPRAR' && decision.entryTiming === 'RETRACE')) {
      decision = {
        ...decision,
        tradeSetup: {
          profile: riskProfile,
          tpMode,
          label: formatSetupHitLabel(riskProfile, tpMode),
          score: decision.score,
          action: decision.action,
          entryTiming: decision.entryTiming,
        },
      }
    }
    const price = data['1m'].at(-1)?.close ?? data['5m'].at(-1)?.close ?? fallback.price
    const patch = (row: AgentRow): AgentRow =>
      row.symbol === symbol ? { ...decision, symbol, price, change24h: fallback.change24h } : row
    setRows((prev) => sortByScore(prev.map(patch)))
    setSelected((prev) => (prev?.symbol === symbol ? patch(prev) : prev))
    setRefinedSymbols((prev) => new Set(prev).add(symbol))
    return patch({ ...decision, symbol, price, change24h: fallback.change24h })
  }

  const isAguardarCompra = (row: Pick<AgentRow, 'action' | 'entryTiming'>) =>
    row.action === 'COMPRAR' && row.entryTiming === 'RETRACE'

  /** Re-avalia MTF todas as AGUARDAR COMPRA — vê quais passam a COMPRAR JÁ / ESPERAR. */
  const refreshAguardar = async () => {
    const targets = rows.filter(isAguardarCompra)
    if (targets.length === 0 || running) return
    setRunning(true)
    setRefreshingAguardar(true)
    setFilter('AGUARDAR_COMPRA')
    setScanProgress({ pct: 0, label: `Refresh Aguardar · 0/${targets.length}` })
    setStatus(`Refresh MTF · ${targets.length} em Aguardar…`)
    let buyNow = 0
    let stillWait = 0
    let toEsperar = 0
    let failed = 0
    try {
      const btcPack = await getPlaybookCandles(BTC_REFERENCE_SYMBOL, { bypassCache: true })
      let done = 0
      await mapPool(targets, 5, async (row) => {
        try {
          const refined = await refineRow(
            row.symbol,
            { price: row.price, change24h: row.change24h },
            { bypassCache: true, btcPack },
          )
          if (isEnterLongNow(refined)) {
            buyNow += 1
            void notifyActionNow({
              title: `COMPRAR JÁ · ${formatTradingPair(refined.symbol)}`,
              body: `Score ${refined.score} · ${session.badge}`,
              symbol: refined.symbol,
            })
          } else if (isAguardarCompra(refined)) stillWait += 1
          else toEsperar += 1
        } catch {
          failed += 1
        } finally {
          done += 1
          setScanProgress({
            pct: Math.round((done / targets.length) * 100),
            label: `Refresh Aguardar · ${done}/${targets.length} · ${formatTradingPair(row.symbol)}`,
          })
          setStatus(`Refresh Aguardar · ${done}/${targets.length} · ${formatTradingPair(row.symbol)}…`)
        }
      })
      setStatus(
        `Refresh Aguardar (${targets.length}): ${buyNow} → COMPRAR JÁ · ${stillWait} ainda AGUARDAR · ${toEsperar} → ESPERAR/outro${failed ? ` · ${failed} falhou` : ''}.`,
      )
      if (buyNow > 0) setFilter('COMPRAR_JA')
      else if (stillWait > 0) setFilter('AGUARDAR_COMPRA')
      else setFilter('TODAS')
    } finally {
      setRunning(false)
      setRefreshingAguardar(false)
      setScanProgress(undefined)
    }
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
        await refineRow(symbol, { price: selected.price, change24h: selected.change24h }, { bypassCache: true })
      } catch {
        /* scan rápido 1h permanece */
      } finally {
        const minMs = 1000
        const elapsed = Date.now() - started
        if (elapsed < minMs) await new Promise((resolve) => setTimeout(resolve, minMs - elapsed))
        setLoadingFull(undefined)
      }
    })()
  }, [selected?.symbol, riskProfile, tpMode, allowHighSweepLong, scanAllSetups, wideNet, avoidNyMid, tjrVideoStrict])

  useEffect(() => {
    const needle = query.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (running || !needle) return
    const matches = rows.filter((row) =>
      row.symbol.includes(needle) || row.symbol.replace(/USDC$/, '').includes(needle),
    )
    if (matches.length !== 1) return
    const row = matches[0]
    if (refinedSymbols.has(row.symbol) || loadingFull === row.symbol) return
    void refineRow(row.symbol, { price: row.price, change24h: row.change24h })
    // Só dispara ao pesquisar um par exacto ainda não refinado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const scan = async () => {
    setRunning(true)
    setRows([])
    setSelected(undefined)
    setRefinedSymbols(new Set())
    setScanProgress({ pct: 0, label: 'A iniciar…' })
    try {
      const pinSymbols = agentPinSymbols(AGENT_QUOTE_ASSET)
      const [liquid, pinned, btc1h] = await Promise.all([
        getLiquidMarkets(10_000),
        getPinnedMarkets(pinSymbols),
        getCandles(BTC_REFERENCE_SYMBOL, '1h'),
      ])
      const markets = mergeMarketLists(liquid, pinned)
      const results: AgentRow[] = []
      /** Com Todos setups: scout Agressivo·1R só para escolher quem refinar; o sinal MTF vem do melhor dos 9. */
      const scoutSymbols = new Set<string>()
      const btcQuick = evaluateTjrQuick(BTC_REFERENCE_SYMBOL, btc1h, btc1h, riskProfile, tpMode, evalOptions, 'long')
      const btcBias = (btcQuick.bias ?? 'neutral') as Direction
      for (let index = 0; index < markets.length; index += 10) {
        const done = Math.min(index + 10, markets.length)
        setScanProgress({ pct: Math.round((done / markets.length) * 70), label: `Scan 1h · ${done}/${markets.length}` })
        setStatus(`TJR · ${done} / ${markets.length} moedas…`)
        const batch = await Promise.all(markets.slice(index, index + 10).map(async (market) => {
          try {
            const candles1h = await getCandles(market.symbol, '1h')
            const decision = evaluateTjrQuick(market.symbol, candles1h, btc1h, riskProfile, tpMode, evalOptions, 'long')
            if (scanAllSetups) {
              const scout = evaluateTjrQuick(market.symbol, candles1h, btc1h, 'agressivo', '1r', evalOptions, 'long')
              if (
                scout.action === 'COMPRAR'
                || (scout.bias === 'bullish' && !scout.opposedSweep && scout.action === 'ESPERAR')
              ) {
                scoutSymbols.add(market.symbol)
              }
            }
            const rowPrice = candles1h.at(-1)?.close ?? 0
            return { ...decision, symbol: market.symbol, price: rowPrice, change24h: market.priceChangePercent }
          } catch {
            return undefined
          }
        }))
        results.push(...batch.filter((row): row is AgentRow => row !== undefined))
        const live = sortByScore(results)
        setRows(live)
        setRegime(computeMarketRegime(live, btcBias))
      }
      const sorted = sortByScore(results)

      const buyCandidates = selectAgentMtfPool(sorted, {
        scanAllSetups,
        scoutSymbols,
        prioritySymbols: new Set([...t212CryptoAgentSymbols(AGENT_QUOTE_ASSET), ...pinSymbols]),
        limit: AUTO_REFINE_TOP,
      })
      if (buyCandidates.length > 0) {
        setStatus(
          scanAllSetups
            ? `Scan 1h ok · MTF + 9 combos risco×TP no top ${buyCandidates.length}…`
            : `Scan 1h ok · a refinar top ${buyCandidates.length} candidatos COMPRAR (1m/MTF)…`,
        )
        let buyNow = 0
        let stillAguardar = 0
        const btcPack = await getPlaybookCandles(BTC_REFERENCE_SYMBOL)
        let mtfDone = 0
        await mapPool(buyCandidates, 5, async (row) => {
          try {
            const refined = await refineRow(
              row.symbol,
              { price: row.price, change24h: row.change24h },
              { btcPack },
            )
            if (isEnterLongNow(refined)) {
              buyNow += 1
              void notifyActionNow({
                title: `COMPRAR JÁ · ${formatTradingPair(refined.symbol)}`,
                body: `Score ${refined.score} · ${session.badge}`,
                symbol: refined.symbol,
              })
            } else if (isAguardarCompra(refined)) {
              stillAguardar += 1
            }
          } catch {
            /* mantém scan 1h deste par */
          } finally {
            mtfDone += 1
            setScanProgress({
              pct: 70 + Math.round((mtfDone / buyCandidates.length) * 30),
              label: `MTF · ${mtfDone}/${buyCandidates.length} · ${formatTradingPair(row.symbol)}`,
            })
            setStatus(`MTF · ${mtfDone}/${buyCandidates.length} · ${formatTradingPair(row.symbol)}…`)
          }
        })
        const dropped = buyCandidates.length - buyNow - stillAguardar
        setStatus(
          buyNow > 0
            ? `${results.length} moedas · ${buyCandidates.length} refinadas · ${buyNow} COMPRAR JÁ${scanAllSetups ? ' (melhor dos 9 setups)' : ''}. Expande o cartão.`
            : stillAguardar > 0
              ? `${results.length} moedas · ${buyCandidates.length} refinadas · 0 COMPRAR JÁ · ${stillAguardar} Aguardar (falta BOS 1m).`
              : `${results.length} moedas · ${buyCandidates.length} refinadas · 0 COMPRAR JÁ · 0 Aguardar${dropped > 0 ? ` · ${dropped} sem COMPRAR JÁ nas 9 combos` : ''}.`,
        )
      } else {
        const highSweepHeavy = sorted.filter((row) => row.opposedSweep || row.action === 'VENDER').length
        setStatus(
          highSweepHeavy > sorted.length * 0.15
            ? `${results.length} moedas · 0 candidatos LONG no scan 1h. Mercado cheio de sweeps de HIGH (setups de short) — Spot só compra após sweep de LOW.`
            : `${results.length} moedas analisadas. Nenhum candidato COMPRAR no scan 1h.`,
        )
      }
      setScanMeta({ at: new Date(), profile: riskProfile, tpMode })
    } catch {
      setStatus('Não foi possível obter os dados da Binance. Tenta novamente.')
    } finally {
      setRunning(false)
      setScanProgress(undefined)
    }
  }

  const counts = {
    COMPRAR_JA: rows.filter((row) => isEnterLongNow(row)).length,
    AGUARDAR_COMPRA: rows.filter((row) => isAguardarCompra(row)).length,
    VENDER: rows.filter((row) => row.action === 'VENDER').length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR').length,
  }
  const normalizedQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const visibleRows = sortByScore(rows.filter((row) => {
    const symbolMatch = !normalizedQuery || row.symbol.includes(normalizedQuery) || row.symbol.replace(/USDC$/, '').includes(normalizedQuery)
    if (!symbolMatch) return false
    if (filter === 'TODAS') return true
    if (filter === 'COMPRAR_JA') return isEnterLongNow(row)
    if (filter === 'AGUARDAR_COMPRA') return isAguardarCompra(row)
    if (filter === 'VENDER') return row.action === 'VENDER'
    return row.action === 'ESPERAR'
  }))

  const closeDetail = () => {
    const symbol = selected?.symbol
    setSelected(undefined)
    setLoadingFull(undefined)
    if (!symbol) return
    window.requestAnimationFrame(() => {
      document.querySelector(`tr[data-symbol="${symbol}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const scanStale = Boolean(
    scanMeta && (scanMeta.profile !== riskProfile || scanMeta.tpMode !== tpMode),
  )
  const scanTimeLabel = scanMeta
    ? new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(scanMeta.at)
    : undefined

  const nyClock = marketClocks.clocks.find((clock) => clock.id === 'newyork')
  const showBuyNowEmpty = !running && rows.length > 0 && filter === 'COMPRAR_JA' && counts.COMPRAR_JA === 0 && visibleRows.length === 0

  const renderExpandedRow = (row: AgentRow) => (
    <section className="desk-workspace-chart desk-row-expand" id={`expand-${row.symbol}`}>
      <div className="desk-expand-toolbar">
        <button type="button" className="desk-expand-close" onClick={closeDetail}>
          ← Fechar · voltar à lista
        </button>
        <span className="desk-sub">{formatTradingPair(row.symbol)} · {tjrActionLabel(row)}</span>
      </div>
      <BinanceOrderPanel
        row={row}
        analysisReady={refinedSymbols.has(row.symbol)}
        refining={loadingFull === row.symbol}
        tpMode={tpMode}
        signalMeta={buildSignalMeta(row)}
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
              <li
                key={item.label}
                className={item.partial ? 'partial' : item.complete ? 'done' : 'pending'}
                title={item.note}
              >
                <span>{item.partial ? '!' : item.complete ? '✓' : '○'}</span> {item.label}
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
              <th>Pot. %</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const gainPct = potentialPct(row)
              const open = selected?.symbol === row.symbol
              const detail = open ? (visibleRows.find((r) => r.symbol === selected.symbol) ?? selected) : undefined
              return (
                <Fragment key={row.symbol}>
                  <tr
                    data-symbol={row.symbol}
                    className={`${row.positionGuidance === 'SAIR' ? 'row-exit' : row.action.toLowerCase()}${open ? ' selected' : ''}${isEnterLongNow(row) ? ' buy-now' : ''}`}
                    onClick={() => {
                      if (open) {
                        closeDetail()
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
                        <div className="setup-hit-row" title="Setups com COMPRAR JÁ ou AGUARDAR nos 9 combos">
                          {row.matchingSetups.map((hit) => {
                            const isTrade = row.tradeSetup?.profile === hit.profile && row.tradeSetup?.tpMode === hit.tpMode
                            return (
                              <span
                                key={`${hit.profile}-${hit.tpMode}-${hit.entryTiming ?? ''}`}
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
                      ) : row.softOpposed ? (
                        <span className="sweep-tag caution" title={row.checklist.find((i) => i.label.startsWith('1.'))?.note}>
                          {row.sweepLabel ?? 'só malha'}
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
                    <td className="num">{gainPct !== undefined ? <span className="positive">+{gainPct.toFixed(1)}%</span> : '—'}</td>
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
          <span className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''}`}>
            {session.badge}{!session.inIdealWindow ? ' · qualidade menor' : ''}
          </span>
          {selected?.riskyHighLong ? (
            <span className="sweep-badge warn">Sweep H · long arriscado</span>
          ) : selected?.softOpposed ? (
            <span className="sweep-badge caution">Só malha · oposto aviso</span>
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

      {session.window === 'ny' && avoidNyMid && (
        <p className="agent-ny-mid-banner" role="status">
          NY mid activo — <strong>Evitar NY mid</strong> ligado: sem COMPRAR JÁ (só AGUARDAR). O teu diário perdia mais nesta janela.
        </p>
      )}
      {session.window === 'ny' && !avoidNyMid && (
        <p className="agent-ny-mid-banner warn" role="status">
          NY mid — atenção: no diário esta sessão teve WR baixo. Liga <strong>Evitar NY mid</strong> para bloquear COMPRAR JÁ.
        </p>
      )}
      {regime && rows.length > 0 && (
        <p className={`agent-regime-banner tone-${regime.tone}`} role="status" title={regime.hint}>
          <strong>{regime.label}</strong>
          {' · '}BTC {biasLabel(regime.btcBias)}
          {' · '}{regime.longCandidates} longs / {regime.highSweepHeavy} HIGH sweep / {regime.total}
          <span className="desk-sub"> — {regime.hint}</span>
        </p>
      )}

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

      <section className="tv-setup-bar" aria-label="Setup de risco">
        <div className="preset-chip-row" role="group" aria-label="Playbooks">
          {AGENT_PRIMARY_PRESETS.map((id) => (
            <button
              key={id}
              type="button"
              className={`preset-chip${presetId === id ? ' active' : ''}`}
              title={AGENT_PRESETS[id].title}
              onClick={() => applyPreset(id)}
            >
              {AGENT_PRESETS[id].label}
            </button>
          ))}
          {(presetId === 'disciplina' || presetId === 'custom') && (
            <span className="preset-chip muted">{presetId === 'disciplina' ? 'Conservador' : 'Custom'}</span>
          )}
        </div>
        <p className="preset-blurb">
          {presetId !== 'custom'
            ? AGENT_PRESETS[presetId].blurb
            : 'Ajustes manuais — escolhe um playbook ou abre Ajustes.'}
        </p>
        <label className="tv-setup-toggle" title="Notificação do browser quando um Aguardar passa a COMPRAR JÁ (scan / refresh)">
          <input
            type="checkbox"
            checked={alertBuyNow}
            onChange={(event) => {
              const on = event.target.checked
              setAlertBuyNow(on)
              setAlertsEnabled(on)
              if (on) void ensureNotificationPermission()
            }}
          />
          <span>Alertas</span>
        </label>
        {rows.length > 0 && (
          <button type="button" className="setup-reapply" onClick={() => void scan()} disabled={running}>
            {running ? '…' : 'Aplicar + scan'}
          </button>
        )}
        {scanStale && <strong className="setup-preset-warn">Setup mudou — re-analisa</strong>}
        <details className="setup-advanced">
          <summary>Ajustes (risco, TP, toggles)</summary>
          <div className="setup-advanced-grid">
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
            <button type="button" className="preset-chip" onClick={() => applyPreset('disciplina')}>
              Conservador
            </button>
            <label className="tv-setup-toggle" title="Permite COMPRAR após sweep de HIGH (não é setup clássico de long)">
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
            <label className="tv-setup-toggle" title="Gates + sessão como Agressivo. Mais sinais, menor qualidade.">
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
            <label className="tv-setup-toggle" title="Filtro apertado 5m+1m BOS/iFVG.">
              <input
                type="checkbox"
                checked={tjrVideoStrict}
                onChange={(event) => {
                  setTjrVideoStrict(event.target.checked)
                  if (rows.length > 0) setStatus('Disciplina — re-analisa para aplicar.')
                }}
              />
              <span>Disciplina (toggle)</span>
            </label>
            <label className="tv-setup-toggle" title="COMPRAR JÁ no NY mid baixa para AGUARDAR.">
              <input
                type="checkbox"
                checked={avoidNyMid}
                onChange={(event) => {
                  setAvoidNyMid(event.target.checked)
                  if (rows.length > 0) setStatus('Evitar NY mid — re-analisa para aplicar.')
                }}
              />
              <span>Evitar NY mid</span>
            </label>
            <label className="tv-setup-toggle" title="Testa 9 combos (3 riscos × 3 TPs).">
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
          </div>
        </details>
      </section>

      <details className="t212-watchlist-panel">
        <summary>Pins Spot · {pins.length} (sempre no scan, mesmo fora do top de volume)</summary>
        <p className="desk-sub">
          O scan já cobre USDC líquidos. Acrescenta aqui alts (PYTH, ACH, TOWNS…) para forçar o par no Agente.
        </p>
        <form
          className="agent-pin-form"
          onSubmit={(event) => {
            event.preventDefault()
            const next = addAgentPin(pinDraft)
            setPins(next)
            setPinDraft('')
          }}
        >
          <input
            value={pinDraft}
            onChange={(event) => setPinDraft(event.target.value)}
            placeholder="Ex.: PYTH"
            aria-label="Adicionar pin Spot"
          />
          <button type="submit">Adicionar</button>
        </form>
        <div className="t212-extra-grid">
          {pins.map((base) => (
            <button
              key={base}
              type="button"
              className="t212-extra-chip on"
              onClick={() => setPins(removeAgentPin(base))}
            >
              <span>{base}</span>
              <small>retirar</small>
            </button>
          ))}
        </div>
      </details>

      <MarketClocks snapshot={marketClocks} compact />

      <ActivePositionPin
        riskProfile={riskProfile}
        tpMode={tpMode}
        refreshKey={pinKey}
        onCleared={() => setPinKey((k) => k + 1)}
        onOpenAdvisor={() => goToCryptoTab('positions')}
      />
      <OnboardingModal />

      <div ref={scanAnchorRef} className="scan-anchor">
        {scanProgress && (
          <div className="scan-progress" role="progressbar" aria-valuenow={scanProgress.pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="scan-progress-fill" style={{ width: `${scanProgress.pct}%` }} />
            <span>{scanProgress.label}</span>
          </div>
        )}
      </div>

      <p className="agent-status">{status}</p>

      {rows.length === 0 && !running && (
        <section className="scan-empty scan-welcome">
          <p className="eyebrow">COMEÇAR</p>
          <h2>Encontra oportunidades em 3 passos</h2>
          <ol className="scan-onboarding-steps">
            <li><strong>Playbook:</strong> usa Prático para o dia a dia.</li>
            <li><strong>Sessão:</strong> melhor qualidade na NY open ({marketClocks.windows.nyOpen.lisbon} PT).</li>
            <li><strong>Decisão:</strong> só executa cartões COMPRAR JÁ; AGUARDAR não é entrada.</li>
          </ol>
          {nyClock && !session.inIdealWindow && (
            <p className="scan-empty-hint">Agora: <strong>{nyClock.status}</strong> · {session.badge}</p>
          )}
          <div className="scan-empty-actions">
            <button type="button" className="primary" onClick={() => void scan()}>
              Analisar mercado
            </button>
          </div>
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
            {counts.AGUARDAR_COMPRA > 0 && (
              <button
                type="button"
                className="setup-reapply refresh-aguardar"
                onClick={() => void refreshAguardar()}
                disabled={running}
                title="Re-avalia MTF só as AGUARDAR COMPRA — vê quais passam a COMPRAR JÁ ou caem para ESPERAR"
              >
                {refreshingAguardar ? 'A refrescar…' : `Refresh Aguardar (${counts.AGUARDAR_COMPRA})`}
              </button>
            )}
          </section>

          {showBuyNowEmpty && (
            <section className="scan-empty">
              <h3>Nenhum COMPRAR JÁ neste scan</h3>
              <p>
                {explainNoAgoraSpot(rows, {
                  tjrVideoStrict,
                  avoidNyMid,
                  inIdealWindow: session.inIdealWindow,
                })}
              </p>
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
          <p><strong>Playbooks:</strong> Prático = dia a dia (mais oportunidades). Disciplina = filtro apertado. Malha = rede larga. Toggles avançados ficam em Ajustes.</p>
          <p><strong>Risco ({riskProfiles[riskProfile].label}):</strong> {riskProfiles[riskProfile].description} — com Todos setups OFF, define o sinal da linha.</p>
          <p><strong>TP ({tpModeMeta[tpMode].label}):</strong> {tpModeMeta[tpMode].description}</p>
          <p><strong>Todos setups:</strong> 3×3=9 combos (ligado no Prático/Malha). O sinal da linha é o melhor (JÁ &gt; Aguardar).</p>
          <p><strong>Malha / Long após H / Evitar NY mid:</strong> em Ajustes — aplicam-se a todos os combos.</p>
          <p><strong>Montante:</strong> só no painel Binance ao abrir uma oportunidade. Não altera o scan TJR.</p>
        </div>
      </details>
      <TpModeModal open={tpHelpOpen} onClose={() => setTpHelpOpen(false)} active={tpMode} />

      <details className="agent-panel">
        <summary>Killzone · horários · regras TJR</summary>
        <div className="agent-panel-body">
          <div className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''}`}>
            {session.badge}{!session.inIdealWindow ? ' · qualidade menor; não bloqueia Crypto' : ''}
          </div>
          <div className="session-window-body">
            <p><strong>NY open ({marketClocks.windows.nyOpen.et} ET · {marketClocks.windows.nyOpen.lisbon} PT):</strong> melhor qualidade TJR.</p>
            <p><strong>Outras horas:</strong> um setup Crypto completo e live pode dar COMPRAR JÁ, com penalização no score.</p>
            <p><strong>Londres ({marketClocks.windows.london.lisbon} PT):</strong> janela secundária de liquidez.</p>
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
