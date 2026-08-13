import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import PriceChart from '../chart/PriceChart'
import MarketClocks from '../agent/MarketClocks'
import T212TradeGuide from './T212TradeGuide'
import { mapPool } from '../../lib/map-pool'
import { alertsEnabled, ensureNotificationPermission, notifyActionNow, setAlertsEnabled } from '../../lib/desk-alerts'
import { biasLabel, computeMarketRegime, type MarketRegime } from '../../lib/market-regime'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import {
  matchT212Preset,
  readT212PresetId,
  T212_PRESETS,
  T212_PRIMARY_PRESETS,
  tpIndexForT212,
  writeT212PresetId,
  type T212PresetId,
} from '../../lib/t212-presets'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import {
  evaluateTjrFull,
  formatSetupHitLabel,
  isAwaitingEntry,
  isEnterLongNow,
  isEnterShortNow,
  listActionNowSetups,
  pickPreferredSetupHit,
  tjrActionLabel,
  tjrTimingLabel,
  tjrScoreColor,
  type TjrDecision,
} from '../../lib/tjr-engine'
import { getCfdMarketStatus, getMarketClocks, getTradingSessionStatus, getInstrumentMarketStatus } from '../../lib/trading-session'
import { explainNoAgora } from '../../lib/no-agora-explain'
import type { Direction, Interval } from '../../lib/types'
import {
  DEFAULT_T212_INSTRUMENT,
  T212_BTC_INSTRUMENT,
  T212_CATALOG,
  T212_CORE_IDS,
  T212_EXTRA_INSTRUMENTS,
  fetchYahooCandlesRaw,
  getT212FeedStats,
  getT212PlaybookCandles,
  readT212WatchlistIds,
  resetT212FeedStats,
  resolveT212Watchlist,
  type T212FeedPreference,
  t212KindLabel,
  writeT212WatchlistIds,
  type T212Instrument,
} from '../../lib/yahoo-market'
import {
  computeEsNqContext,
  t212EsInstrument,
  t212NeedsEsNqGate,
  t212NqInstrument,
  type EsNqContext,
} from '../../lib/t212-es-nq'
import { useScreenWakeLock } from '../../lib/use-screen-wake-lock'
import { requireLiveConfirmationForStaleLtf } from '../../lib/t212-live-confirm'

const RISK_KEY = 't212-risk-index'
const TP_KEY = 't212-tp-mode'
const ALL_SETUPS_KEY = 't212-scan-all-setups'
const WIDE_NET_KEY = 't212-wide-net'
const CFD_PRACTICAL_KEY = 't212-cfd-practical'
const VIDEO_STRICT_KEY = 't212-video-strict'
const FEED_KEY = 't212-data-feed'

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

const isBuyNow = isEnterLongNow
const isSellNow = isEnterShortNow
const isAguardar = isAwaitingEntry
const isInvalidated = (row: TjrDecision) =>
  row.positionGuidance === 'SAIR' || row.positionGuidance === 'REALIZAR_ALVO'

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
  const [scanAllSetups, setScanAllSetups] = useState(() => readBool(ALL_SETUPS_KEY, true))
  const [wideNet, setWideNet] = useState(() => readBool(WIDE_NET_KEY, false))
  const [cfdPractical, setCfdPractical] = useState(() => readBool(CFD_PRACTICAL_KEY, true))
  const [tjrVideoStrict, setTjrVideoStrict] = useState(() => readBool(VIDEO_STRICT_KEY, false))
  const [dataFeed, setDataFeed] = useState<T212FeedPreference>(() => {
    try {
      return localStorage.getItem(FEED_KEY) === 'twelve' ? 'twelve' : 'yahoo'
    } catch {
      return 'yahoo'
    }
  })
  const [watchIds, setWatchIds] = useState(() => readT212WatchlistIds())
  const watchlist = useMemo(() => resolveT212Watchlist(watchIds), [watchIds])
  const riskProfile = profiles[riskIndex]
  const tpMode = tpModes[tpIndex]

  const optionsFor = (instrument: T212Instrument, esNq?: EsNqContext) => {
    const usIndex = t212NeedsEsNqGate(instrument)
    const market = getInstrumentMarketStatus(instrument.kind)
    return {
      referenceLabel: instrument.kind === 'crypto' ? 'BTC' : 'US500',
      wideNet,
      cfdPractical,
      tjrVideoStrict,
      sessionMarket: instrument.kind === 'crypto' ? 'crypto' as const : 'cfd' as const,
      killzoneQualityOnly: instrument.kind === 'forex' || instrument.kind === 'crypto',
      instrumentMarketOpen: market.open,
      instrumentMarketNote: market.reason,
      ...(instrument.kind === 'index' || instrument.kind === 'future' ? {} : { requireSmtAlign: false as const }),
      ...(usIndex ? { usIndexPlaybook: true as const } : {}),
      ...(usIndex && esNq
        ? { esNqAligned: esNq.aligned, esNqNote: esNq.note, esNqSmt: esNq.smt }
        : {}),
    }
  }

  const hasCryptoWatch = useMemo(() => watchlist.some((item) => item.kind === 'crypto'), [watchlist])
  const hasKillzoneQualityOnlyWatch = useMemo(
    () => watchlist.some((item) => item.kind === 'forex' || item.kind === 'crypto'),
    [watchlist],
  )

  const [rows, setRows] = useState<T212Row[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR_JA' | 'VENDER' | 'AGUARDAR' | 'ESPERAR'>('TODAS')
  const [status, setStatus] = useState('Clica «Aplicar + scan» para analisar — índices, forex, metais, energia e crypto CFD.')
  const [running, setRunning] = useState(false)
  useScreenWakeLock(running)
  const [refreshingAguardar, setRefreshingAguardar] = useState(false)
  const [loadingFull, setLoadingFull] = useState<string>()
  const [refinedIds, setRefinedIds] = useState<Set<string>>(() => new Set())
  const [scanProgress, setScanProgress] = useState<{ pct: number; label: string }>()
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [session, setSession] = useState(() => getTradingSessionStatus())
  const [marketClocks, setMarketClocks] = useState(() => getMarketClocks())
  const [cfdMarket, setCfdMarket] = useState(() => getCfdMarketStatus())
  const [regime, setRegime] = useState<MarketRegime>()
  const [alertNow, setAlertNow] = useState(() => alertsEnabled())
  const [presetId, setPresetId] = useState<T212PresetId>(() => readT212PresetId())
  const canScan = cfdMarket.open || hasCryptoWatch

  const buildRow = (
    instrument: T212Instrument,
    data: Awaited<ReturnType<typeof getT212PlaybookCandles>>,
    reference: Awaited<ReturnType<typeof getT212PlaybookCandles>>,
    esNq?: EsNqContext,
    opts?: { allSetups?: boolean },
  ): T212Row => {
    const evalOptions = optionsFor(instrument, esNq)
    const useAllSetups = opts?.allSetups ?? scanAllSetups
    let decision: TjrDecision
    if (useAllSetups) {
      const matchingSetups = listActionNowSetups(instrument.short, data, reference, evalOptions, undefined, 'both')
      if (matchingSetups.length > 0) {
        const best = pickPreferredSetupHit(matchingSetups, riskProfile, tpMode)!
        decision = {
          ...evaluateTjrFull(instrument.short, data, reference, best.profile, best.tpMode, undefined, evalOptions),
          matchingSetups,
          tradeSetup: best,
        }
      } else {
        decision = evaluateTjrFull(instrument.short, data, reference, riskProfile, tpMode, undefined, evalOptions)
      }
    } else {
      decision = evaluateTjrFull(instrument.short, data, reference, riskProfile, tpMode, undefined, evalOptions)
      if (isBuyNow(decision) || isSellNow(decision) || isAwaitingEntry(decision)) {
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
    }
    decision = requireLiveConfirmationForStaleLtf(decision, data)
    const price = data['1m'].at(-1)?.close ?? data['5m'].at(-1)?.close ?? 0
    return { ...decision, instrument, price }
  }

  const instrumentByIdSafe = (): T212Instrument =>
    T212_CATALOG.find((item) => item.id === 'us500') ?? T212_BTC_INSTRUMENT

  const refineRow = async (instrument: T212Instrument, bypassCache = true) => {
    let esNq: EsNqContext | undefined
    if (t212NeedsEsNqGate(instrument)) {
      try {
        const [esPack, nqPack] = await Promise.all([
          getT212PlaybookCandles(t212EsInstrument(), { feed: dataFeed, bypassCache }),
          getT212PlaybookCandles(t212NqInstrument(), { feed: dataFeed, bypassCache }),
        ])
        esNq = computeEsNqContext(esPack['5m'], nqPack['5m'])
      } catch {
        esNq = {
          aligned: false,
          esTrend: 'neutral',
          nqTrend: 'neutral',
          note: 'ES/NQ sem dados.',
          smt: { fresh: false, feedValid: false, note: 'ES/NQ sem dados fiáveis.' },
        }
      }
    }
    const refInstrument = instrument.kind === 'crypto'
      ? T212_BTC_INSTRUMENT
      : instrumentByIdSafe()
    const [data, reference] = await Promise.all([
      getT212PlaybookCandles(instrument, { feed: dataFeed, bypassCache }),
      getT212PlaybookCandles(refInstrument, { feed: dataFeed, bypassCache }),
    ])
    const next = buildRow(instrument, data, reference, esNq)
    const patch = (row: T212Row): T212Row =>
      row.instrument.id === instrument.id ? next : row
    setRows((prev) => [...prev.map(patch)].sort((a, b) => b.score - a.score || (b.riskReward ?? 0) - (a.riskReward ?? 0)))
    setRefinedIds((prev) => new Set(prev).add(instrument.id))
    return next
  }

  /** Re-avalia MTF todas as AGUARDAR — vê quais passam a Long/Short JÁ ou ESPERAR. */
  const refreshAguardar = async () => {
    const targets = rows.filter(isAguardar)
    if (targets.length === 0 || running) return
    setRunning(true)
    setRefreshingAguardar(true)
    setFilter('AGUARDAR')
    setScanProgress({ pct: 0, label: `Refresh Aguardar · 0/${targets.length}` })
    setStatus(`Refresh MTF · ${targets.length} em Aguardar…`)
    let buyNow = 0
    let sellNow = 0
    let stillWait = 0
    let toEsperar = 0
    let failed = 0
    try {
      // ES/NQ + refs uma vez; depois paraleliza instrumentos (Yahoo aguenta; Twelve fica serial na queue).
      if (targets.some((row) => t212NeedsEsNqGate(row.instrument))) {
        try {
          await Promise.all([
            getT212PlaybookCandles(t212EsInstrument(), { feed: dataFeed, bypassCache: true }),
            getT212PlaybookCandles(t212NqInstrument(), { feed: dataFeed, bypassCache: true }),
          ])
        } catch {
          /* gate trata falha no refine */
        }
      }
      const poolLimit = dataFeed === 'twelve' ? 1 : 6
      let done = 0
      await mapPool(targets, poolLimit, async (row) => {
        try {
          const refined = await refineRow(row.instrument, true)
          if (isBuyNow(refined)) {
            buyNow += 1
            void notifyActionNow({
              title: `LONG JÁ · ${refined.instrument.short}`,
              body: `Score ${refined.score} · ${session.badge}`,
              symbol: refined.instrument.short,
            })
          } else if (isSellNow(refined)) {
            sellNow += 1
            void notifyActionNow({
              title: `SHORT JÁ · ${refined.instrument.short}`,
              body: `Score ${refined.score} · ${session.badge}`,
              symbol: refined.instrument.short,
            })
          } else if (isAguardar(refined)) stillWait += 1
          else toEsperar += 1
        } catch {
          failed += 1
        } finally {
          done += 1
          setScanProgress({
            pct: Math.round((done / targets.length) * 100),
            label: `Refresh Aguardar · ${done}/${targets.length} · ${row.instrument.short}`,
          })
          setStatus(`Refresh Aguardar · ${done}/${targets.length} · ${row.instrument.short}…`)
        }
      })
      setStatus(
        `Refresh Aguardar (${targets.length}): ${buyNow} → Long JÁ · ${sellNow} → Short JÁ · ${stillWait} ainda AGUARDAR · ${toEsperar} → ESPERAR/outro${failed ? ` · ${failed} falhou` : ''}.`,
      )
      if (buyNow > 0) setFilter('COMPRAR_JA')
      else if (sellNow > 0) setFilter('VENDER')
      else if (stillWait > 0) setFilter('AGUARDAR')
      else setFilter('TODAS')
    } finally {
      setRunning(false)
      setRefreshingAguardar(false)
      setScanProgress(undefined)
    }
  }

  useEffect(() => {
    if (!selectedId) return
    const instrument =
      T212_CATALOG.find((item) => item.id === selectedId)
      ?? T212_EXTRA_INSTRUMENTS.find((item) => item.id === selectedId)
    if (!instrument) return
    setLoadingFull(instrument.id)
    setRefinedIds((prev) => {
      const next = new Set(prev)
      next.delete(instrument.id)
      return next
    })
    void (async () => {
      const started = Date.now()
      try {
        await refineRow(instrument, true)
      } catch {
        /* mantém linha do scan */
      } finally {
        const minMs = 1000
        const elapsed = Date.now() - started
        if (elapsed < minMs) await new Promise((resolve) => setTimeout(resolve, minMs - elapsed))
        setLoadingFull(undefined)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refine ao abrir asset / mudar setup
  }, [selectedId, riskProfile, tpMode, scanAllSetups, wideNet, cfdPractical, tjrVideoStrict, dataFeed])

  useEffect(() => {
    try {
      localStorage.setItem(RISK_KEY, String(riskIndex))
      localStorage.setItem(TP_KEY, tpMode)
      localStorage.setItem(ALL_SETUPS_KEY, scanAllSetups ? '1' : '0')
      localStorage.setItem(WIDE_NET_KEY, wideNet ? '1' : '0')
      localStorage.setItem(CFD_PRACTICAL_KEY, cfdPractical ? '1' : '0')
      localStorage.setItem(VIDEO_STRICT_KEY, tjrVideoStrict ? '1' : '0')
      localStorage.setItem(FEED_KEY, dataFeed)
      writeT212WatchlistIds(watchIds)
    } catch {
      /* ignore */
    }
    const matched = matchT212Preset({ riskIndex, tpMode, wideNet, cfdPractical, scanAllSetups, tjrVideoStrict })
    setPresetId(matched)
    writeT212PresetId(matched)
  }, [riskIndex, tpMode, scanAllSetups, wideNet, cfdPractical, tjrVideoStrict, dataFeed, watchIds])

  const applyPreset = (id: Exclude<T212PresetId, 'custom'>) => {
    const { config } = T212_PRESETS[id]
    setRiskIndex(config.riskIndex)
    setTpIndex(tpIndexForT212(config.tpMode))
    setWideNet(config.wideNet)
    setCfdPractical(config.cfdPractical)
    setTjrVideoStrict(config.tjrVideoStrict)
    setScanAllSetups(config.scanAllSetups)
    setPresetId(id)
    writeT212PresetId(id)
    setStatus(`Playbook «${T212_PRESETS[id].label}» — aplica + scan.`)
  }

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
    setRows([])
    setFilter('TODAS')
    const market = getCfdMarketStatus()
    setCfdMarket(market)
    const scanList = market.open
      ? watchlist
      : watchlist.filter((item) => item.kind === 'crypto')
    if (scanList.length === 0) {
      setStatus(market.reason)
      setScanProgress(undefined)
      setRunning(false)
      return
    }
    const cryptoOnly = !market.open
    const total = scanList.length
    setScanProgress({ pct: 2, label: 'Pack Yahoo…' })
    setStatus(
      cryptoOnly
        ? 'Fim de semana CFD — a analisar só crypto CFD…'
        : 'Scan rápido — resultados aparecem à medida que chegam…',
    )
    setRefinedIds(new Set())

    const sortRows = (list: T212Row[]) =>
      [...list].sort((a, b) => b.score - a.score || (b.riskReward ?? 0) - (a.riskReward ?? 0))

    const publish = (list: T212Row[], done: number, label: string) => {
      setRows(sortRows(list))
      setScanProgress({ pct: Math.min(99, Math.round((done / total) * 100)), label })
      setStatus(label)
    }

    type Pack = Awaited<ReturnType<typeof getT212PlaybookCandles>>
    const packById = new Map<string, Pack>()
    let indexRefPack: Pack | undefined
    let cryptoRefPack: Pack | undefined
    const refFor = (instrument: T212Instrument, data: Pack): Pack => {
      if (instrument.kind === 'crypto') return cryptoRefPack ?? data
      return indexRefPack ?? cryptoRefPack ?? data
    }
    const results: T212Row[] = []
    const failed: string[] = []
    let done = 0

    try {
      resetT212FeedStats()

      const needsEsNq = scanList.some(t212NeedsEsNqGate)
      let esNq: EsNqContext | undefined
      if (needsEsNq) {
        setScanProgress({ pct: 3, label: 'Gate ES↔NQ 5m…' })
        try {
          const [esPack, nqPack] = await Promise.all([
            getT212PlaybookCandles(t212EsInstrument(), { feed: dataFeed }),
            getT212PlaybookCandles(t212NqInstrument(), { feed: dataFeed }),
          ])
          esNq = computeEsNqContext(esPack['5m'], nqPack['5m'])
        } catch {
          esNq = {
            aligned: false,
            esTrend: 'neutral',
            nqTrend: 'neutral',
            note: 'ES/NQ sem dados.',
            smt: { fresh: false, feedValid: false, note: 'ES/NQ sem dados fiáveis.' },
          }
        }
      }

      const indexRef = scanList.find((item) => item.id === 'us500')
        ?? scanList.find((item) => item.kind === 'index')
        ?? scanList.find((item) => item.kind === 'future')
      const needsCryptoRef = scanList.some((item) => item.kind === 'crypto')

      const refInstrument = indexRef ?? scanList[0]

      // Prefetch refs em paralelo (BTC + índice) antes do pool — como de manhã, rede primeiro.
      await Promise.all([
        needsCryptoRef && refInstrument.id !== T212_BTC_INSTRUMENT.id
          ? getT212PlaybookCandles(T212_BTC_INSTRUMENT, { feed: dataFeed })
            .then((pack) => {
              cryptoRefPack = pack
              packById.set(T212_BTC_INSTRUMENT.id, pack)
            })
            .catch(() => { /* BTC ref opcional */ })
          : Promise.resolve(),
        (async () => {
          try {
            const data = await getT212PlaybookCandles(refInstrument, { feed: dataFeed })
            packById.set(refInstrument.id, data)
            if (refInstrument.kind === 'index' || refInstrument.kind === 'future' || refInstrument.id === 'us500') {
              indexRefPack = data
            }
            if (refInstrument.kind === 'crypto' && !cryptoRefPack) cryptoRefPack = data
            // Fase 1: 1 eval (rápido). Os 9 setups vêm depois, em cache.
            results.push(buildRow(refInstrument, data, refFor(refInstrument, data), esNq, { allSetups: false }))
            done += 1
            publish(results, done, `OK · ${refInstrument.short} · ${done}/${total}${esNq?.smt.fresh ? ` · SMT ${esNq.smt.direction}` : ''}`)
          } catch (error) {
            failed.push(refInstrument.short)
            done += 1
            setStatus(error instanceof Error ? error.message : `Falha ${refInstrument.short}`)
          }
        })(),
      ])

      const rest = scanList.filter((item) => item.id !== refInstrument.id)
      // Concurrency 4 — valor estável de manhã (6/8 saturavam Yahoo → fallback lento).
      const poolLimit = dataFeed === 'twelve' ? 1 : 4
      await mapPool(rest, poolLimit, async (instrument) => {
        try {
          const data = await getT212PlaybookCandles(instrument, { feed: dataFeed })
          packById.set(instrument.id, data)
          if (instrument.kind !== 'crypto' && !indexRefPack) indexRefPack = data
          if (instrument.kind === 'crypto' && !cryptoRefPack) cryptoRefPack = data
          results.push(buildRow(instrument, data, refFor(instrument, data), esNq, { allSetups: false }))
        } catch {
          failed.push(instrument.short)
        } finally {
          done += 1
          publish(results, done, `OK · ${instrument.short} · ${done}/${total}`)
        }
      })

      // Fase 2: expandir 9 setups em memória (sem novas calls) — mais oportunidades, sem atrasar o fetch.
      if (scanAllSetups && results.length > 0) {
        setScanProgress({ pct: 92, label: `9 setups · ${results.length} símbolos…` })
        setStatus(`A expandir 9 setups (cache) · ${results.length}…`)
        for (let index = 0; index < results.length; index += 1) {
          const row = results[index]
          const data = packById.get(row.instrument.id)
          if (!data) continue
          try {
            results[index] = buildRow(row.instrument, data, refFor(row.instrument, data), esNq, { allSetups: true })
          } catch {
            // Mantém a avaliação rápida deste instrumento; nunca apaga resultados já obtidos.
            failed.push(`${row.instrument.short} (9 setups)`)
          }
          if (index % 4 === 3 || index === results.length - 1) {
            publish(results, total, `9 setups · ${index + 1}/${results.length}`)
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
        }
      }

      if (results.length === 0) {
        throw new Error(failed.length ? `Dados falharam: ${failed.join(', ')}` : 'Sem candles (Twelve/Yahoo).')
      }

      const sorted = sortRows(results)
      setRows(sorted)
      const btcRow = sorted.find((row) => row.instrument.id === 'btc' || row.instrument.short === 'BTC')
      const us500 = sorted.find((row) => row.instrument.short === 'US500')
      const biasRow = btcRow ?? us500
      setRegime(computeMarketRegime(sorted, (biasRow?.bias ?? 'neutral') as Direction))
      const buyNow = sorted.filter(isBuyNow).length
      const sellNow = sorted.filter(isSellNow).length
      const aguardar = sorted.filter(isAguardar).length
      for (const row of sorted) {
        if (isBuyNow(row)) {
          void notifyActionNow({
            title: `LONG JÁ · ${row.instrument.short}`,
            body: `Score ${row.score} · T212`,
            symbol: `t212-L-${row.instrument.id}`,
          })
        } else if (isSellNow(row)) {
          void notifyActionNow({
            title: `SHORT JÁ · ${row.instrument.short}`,
            body: `Score ${row.score} · T212`,
            symbol: `t212-S-${row.instrument.id}`,
          })
        }
      }
      const weekendNote = cryptoOnly ? ' (só crypto — resto CFD fechado).' : ''
      const feed = getT212FeedStats()
      const feedNote = feed.twelve + feed.yahoo > 0
        ? ` Feed: Twelve×${feed.twelve}${feed.yahoo ? ` + Yahoo×${feed.yahoo}` : ''}${feed.twelveExhausted ? ' (créditos Twelve esgotados)' : ''}.`
        : ''
      const esNqNote = esNq
        ? ` ES↔NQ: ${esNq.smt.note} Tendência ${esNq.esTrend}/${esNq.nqTrend}.`
        : ''
      const whyNone = buyNow + sellNow === 0
        ? ` ${explainNoAgora(sorted, {
            tjrVideoStrict,
            cfdPractical,
            esNqBlocked: esNq ? tjrVideoStrict && !esNq.smt.feedValid : false,
          })}`
        : ''
      setStatus(
        buyNow + sellNow > 0
          ? `${sorted.length} ok · ${buyNow} LONG · ${sellNow} SHORT${scanAllSetups ? ' (melhor dos 9 setups)' : ''}.${weekendNote}${feedNote}${esNqNote}${failed.length ? ` Falhou: ${failed.join(', ')}.` : ''}`
          : `${sorted.length} ok · 0 agora · ${aguardar} aguardar.${weekendNote}${feedNote}${esNqNote}${whyNone}${failed.length ? ` Falhou: ${failed.join(', ')}.` : ''}`,
      )
      // Não esconder linhas quando a fase dos 9 setups termina.
      // Os contadores permitem ao utilizador filtrar LONG/SHORT manualmente.
      setFilter('TODAS')
    } catch (error) {
      if (results.length > 0) {
        setRows(sortRows(results))
        setStatus(`Scan parcial mantido (${results.length}/${total}) · ${error instanceof Error ? error.message : 'falha de dados'}.`)
      } else {
        setStatus(error instanceof Error ? error.message : 'Falha ao obter dados Yahoo.')
      }
    } finally {
      setRunning(false)
      setScanProgress(undefined)
    }
  }

  useEffect(() => {
    const market = getCfdMarketStatus()
    setCfdMarket(market)
    if (!market.open && !watchlist.some((item) => item.kind === 'crypto')) {
      setStatus(market.reason)
    }
    // Só ao abrir o separador — scan só com «Aplicar + scan».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => ({
    COMPRAR_JA: rows.filter(isBuyNow).length,
    VENDER: rows.filter(isSellNow).length,
    AGUARDAR: rows.filter(isAguardar).length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR' || isInvalidated(row)).length,
  }), [rows])

  const visibleRows = [...rows]
    .filter((row) => {
      if (filter === 'COMPRAR_JA') return isBuyNow(row)
      if (filter === 'VENDER') return isSellNow(row)
      if (filter === 'AGUARDAR') return isAguardar(row)
      if (filter === 'ESPERAR') return row.action === 'ESPERAR' || isInvalidated(row)
      return true
    })
    .sort((a, b) => b.score - a.score || (b.riskReward ?? 0) - (a.riskReward ?? 0))

  const selected = rows.find((row) => row.instrument.id === selectedId)
  const selectedInstrumentMarket = selected ? getInstrumentMarketStatus(selected.instrument.kind) : undefined

  const confirmLiveSetup = (instrumentId: string, livePrice: number) => {
    const confirmedAt = Date.now()
    setRows((current) => current.map((row) => {
      if (row.instrument.id !== instrumentId || !row.liveConfirmationRequired) return row
      if (row.stop === undefined || row.target === undefined) return row
      const insideLevels = row.action === 'COMPRAR'
        ? livePrice > row.stop && livePrice < row.target
        : row.action === 'VENDER'
          ? livePrice < row.stop && livePrice > row.target
          : false
      if (!insideLevels) return row
      const risk = Math.abs(livePrice - row.stop)
      const reward = Math.abs(row.target - livePrice)
      return {
        ...row,
        entry: livePrice,
        price: livePrice,
        riskReward: risk > 0 ? reward / risk : row.riskReward,
        entryTiming: 'AGORA',
        positionGuidance: 'ENTRAR_AGORA',
        setupStatus: 'CONFIRMADA',
        liveConfirmationRequired: false,
        ltfFeedFresh: true,
        manualLiveConfirmedAt: confirmedAt,
        reasons: ['5m + 1m confirmados manualmente no gráfico live T212.', ...row.reasons],
        checklist: row.checklist.map((item) => item.label === 'Dados LTF live'
          ? { ...item, complete: true, note: 'Confirmado manualmente no T212; válido por 2 min.' }
          : item),
      }
    }))

    window.setTimeout(() => {
      setRows((current) => current.map((row) => {
        if (row.instrument.id !== instrumentId || row.manualLiveConfirmedAt !== confirmedAt) return row
        return {
          ...row,
          entryTiming: 'RETRACE',
          positionGuidance: 'AGUARDAR_ENTRADA',
          setupStatus: 'A_AGUARDAR',
          liveConfirmationRequired: true,
          ltfFeedFresh: false,
          manualLiveConfirmedAt: undefined,
          reasons: ['Confirmação live expirou — volta a validar 5m + 1m no T212.', ...row.reasons],
          checklist: row.checklist.map((item) => item.label === 'Dados LTF live'
            ? { ...item, complete: false, note: 'Confirmação expirada — volta a validar no T212.' }
            : item),
        }
      }))
    }, 120_000)
  }

  const closeDetail = () => {
    const id = selectedId
    setSelectedId(undefined)
    if (!id) return
    window.requestAnimationFrame(() => {
      document.querySelector(`tr[data-t212="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const loadChartCandles = (symbol: string, interval: Interval) => {
    const match = T212_CATALOG.find((item) => item.short === symbol) ?? selected?.instrument ?? DEFAULT_T212_INSTRUMENT
    return fetchYahooCandlesRaw(match.yahooSymbol, interval)
  }

  const toggleExtra = (id: string) => {
    setWatchIds((prev) => {
      const on = prev.includes(id)
      const next = on ? prev.filter((item) => item !== id) : [...prev, id]
      return resolveT212Watchlist(next).map((item) => item.id)
    })
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
          <span className={`session-badge session-${session.window} ${session.inIdealWindow ? 'ideal' : ''} ${session.blockEntries && !hasKillzoneQualityOnlyWatch ? 'blocked' : ''}`}>
            {session.badge}{session.blockEntries && hasKillzoneQualityOnlyWatch ? ' · FX/Crypto permitidos' : ''}
          </span>
          {selected?.riskyHighLong ? (
            <span className="sweep-badge warn">Sweep H · long arriscado</span>
          ) : selected?.softOpposed ? (
            <span className="sweep-badge caution">Só malha · oposto aviso</span>
          ) : selected?.opposedSweep && selected.action !== 'VENDER' ? (
            <span className="sweep-badge warn">Opposed · bloqueia</span>
          ) : selected?.action === 'VENDER' && selected.sweepLabel ? (
            <span className="sweep-badge warn">Short · {selected.sweepLabel}</span>
          ) : selected?.reactive ? (
            <span className="sweep-badge reactive">Reactivo · {selected.sweepLabel}</span>
          ) : selected?.sweepLabel ? (
            <span className="sweep-badge">Sweep · {selected.sweepLabel}</span>
          ) : (
            <span className="sweep-badge muted">Clica num instrumento</span>
          )}
          <span className="tv-clock">{session.nowLisbon} PT</span>
        </div>
        <div className="tv-toolbar-right">
          <button type="button" className="agent-scan-btn" onClick={() => void analyzeAll()} disabled={running || !canScan}>
            {running ? 'A analisar…' : canScan ? 'Analisar' : 'Mercado fechado'}
          </button>
        </div>
      </header>

      {!cfdMarket.open && (
        <p className="t212-closed-banner" role="status">
          {hasCryptoWatch
            ? `${cfdMarket.reason} Crypto CFD na watchlist continua disponível para scan.`
            : cfdMarket.reason}
        </p>
      )}
      {regime && rows.length > 0 && (
        <p className={`agent-regime-banner tone-${regime.tone}`} role="status" title={regime.hint}>
          <strong>{regime.label}</strong>
          {' · '}Ref {biasLabel(regime.btcBias)}
          {' · '}{regime.longCandidates} longs / {regime.highSweepHeavy} opposed / {regime.total}
          <span className="desk-sub"> — {regime.hint}</span>
        </p>
      )}

      <section className="zella-kpis" aria-label="Resumo T212">
        <article>
          <span>Long já</span>
          <strong className={counts.COMPRAR_JA > 0 ? 'positive' : ''}>{counts.COMPRAR_JA}</strong>
          <small>Buy CFD</small>
        </article>
        <article>
          <span>Short já</span>
          <strong className={counts.VENDER > 0 ? 'negative' : ''}>{counts.VENDER}</strong>
          <small>Sell CFD</small>
        </article>
        <article>
          <span>Aguardar</span>
          <strong>{counts.AGUARDAR}</strong>
          <small>retrace</small>
        </article>
        <article>
          <span>Instrumentos</span>
          <strong>{rows.length || watchlist.length}</strong>
          <small>{scanAllSetups ? '× 9 setups' : `${watchlist.length} ativos`}</small>
        </article>
        <article>
          <span>Risco</span>
          <strong>{riskProfiles[riskProfile].label}</strong>
          <small>{tpModeMeta[tpMode].short}</small>
        </article>
        <article className={session.inIdealWindow ? 'kpi-hot' : ''}>
          <span>Sessão</span>
          <strong>
            {selectedInstrumentMarket
              ? (selectedInstrumentMarket.open ? `OPEN · ${selectedInstrumentMarket.reason}` : `CLOSED · ${selectedInstrumentMarket.reason}`)
              : (!cfdMarket.open && !hasCryptoWatch ? 'Fechado' : session.inIdealWindow ? 'NY open' : session.window.replace('_', ' '))}
          </strong>
          <small>killzone</small>
        </article>
      </section>

      <section className="tv-setup-bar" aria-label="Setup T212">
        <div className="preset-chip-row" role="group" aria-label="Playbooks">
          {T212_PRIMARY_PRESETS.map((id) => (
            <button
              key={id}
              type="button"
              className={`preset-chip${presetId === id ? ' active' : ''}`}
              title={T212_PRESETS[id].title}
              onClick={() => applyPreset(id)}
            >
              {T212_PRESETS[id].label}
            </button>
          ))}
          {(presetId === 'estrito' || presetId === 'custom') && (
            <span className="preset-chip muted">{presetId === 'estrito' ? 'Estrito' : 'Custom'}</span>
          )}
        </div>
        <p className="preset-blurb">
          {presetId !== 'custom'
            ? T212_PRESETS[presetId].blurb
            : 'Ajustes manuais — escolhe um playbook ou abre Ajustes.'}
        </p>
        <label className="tv-setup-toggle" title="Notificação do browser em LONG JÁ / SHORT JÁ">
          <input
            type="checkbox"
            checked={alertNow}
            onChange={(event) => {
              const on = event.target.checked
              setAlertNow(on)
              setAlertsEnabled(on)
              if (on) void ensureNotificationPermission()
            }}
          />
          <span>Alertas</span>
        </label>
        <button type="button" className="setup-reapply" onClick={() => void analyzeAll()} disabled={running || !canScan}>
          {running ? '…' : 'Aplicar + scan'}
        </button>
        <details className="setup-advanced">
          <summary>Ajustes (risco, TP, dados, toggles)</summary>
          <div className="setup-advanced-grid">
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
            <label className="tv-setup-field" title="Yahoo por defeito. Twelve Data usa a key Netlify; se créditos esgotarem, volta a Yahoo.">
              <span>Dados</span>
              <select
                aria-label="Fonte de dados"
                value={dataFeed}
                onChange={(event) => setDataFeed(event.target.value === 'twelve' ? 'twelve' : 'yahoo')}
              >
                <option value="yahoo">Yahoo</option>
                <option value="twelve">Twelve Data</option>
              </select>
            </label>
            <button type="button" className="preset-chip" onClick={() => applyPreset('estrito')}>
              Estrito
            </button>
            <label className="tv-setup-toggle" title="Mais sinais, menor qualidade. Desactivado com Disciplina.">
              <input type="checkbox" checked={wideNet} onChange={(event) => setWideNet(event.target.checked)} />
              <span>Malha larga</span>
            </label>
            <label className="tv-setup-toggle" title="Confirmação flexível Yahoo — mais AGORA. Preferido no playbook Prático.">
              <input type="checkbox" checked={cfdPractical} onChange={(event) => setCfdPractical(event.target.checked)} />
              <span>CFD prático</span>
            </label>
            <label className="tv-setup-toggle" title="Filtro apertado 5m+1m BOS/iFVG.">
              <input type="checkbox" checked={tjrVideoStrict} onChange={(event) => setTjrVideoStrict(event.target.checked)} />
              <span>Disciplina (toggle)</span>
            </label>
            <label className="tv-setup-toggle" title="Testa 9 combos (3 riscos × 3 TPs).">
              <input type="checkbox" checked={scanAllSetups} onChange={(event) => setScanAllSetups(event.target.checked)} />
              <span>Todos setups</span>
            </label>
          </div>
        </details>
      </section>

      <details className="t212-watchlist-panel">
        <summary>Watchlist · {watchlist.length} activos ({T212_CORE_IDS.length} core + {watchlist.length - T212_CORE_IDS.length} extras)</summary>
        <p className="desk-sub">Core sempre ligado. Extras opcionais — mais símbolos = scan mais lento. SMT em <strong>índices/futuros</strong>; forex/metal/energia/crypto = informativo. Futuros CME (ES/NQ/YM) = análise → executar no CFD T212. Crypto CFD = long + short.</p>
        <div className="t212-extra-grid">
          {T212_EXTRA_INSTRUMENTS.map((item) => {
            const on = watchIds.includes(item.id)
            return (
              <label key={item.id} className={`t212-extra-chip${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggleExtra(item.id)} />
                <span>{item.short}</span>
                <small>{t212KindLabel(item.kind)}</small>
              </label>
            )
          })}
        </div>
      </details>

      <MarketClocks snapshot={marketClocks} compact />
      {scanProgress && (
        <div className="scan-progress" role="progressbar" aria-valuenow={scanProgress.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="scan-progress-fill" style={{ width: `${scanProgress.pct}%` }} />
          <span>{scanProgress.label}</span>
        </div>
      )}
      <p className="agent-status">{status}</p>
      {rows.length > 0 && counts.COMPRAR_JA + counts.VENDER === 0 && (
        <section className="scan-empty" style={{ marginBottom: 12 }}>
          <h3>Nenhum LONG/SHORT JÁ neste scan</h3>
          <p>
            {explainNoAgora(rows, {
              tjrVideoStrict,
              cfdPractical,
              esNqBlocked: rows.some((r) => r.checklist?.some((c) => c.label.startsWith('ES↔NQ') && !c.complete)),
            })}
          </p>
          {counts.AGUARDAR > 0 && (
            <div className="scan-empty-actions">
              <button type="button" onClick={() => setFilter('AGUARDAR')}>Ver Aguardar ({counts.AGUARDAR})</button>
            </div>
          )}
        </section>
      )}
      <p className="t212-disclaimer">
        CFD: long (Buy) e short (Sell), incluindo crypto CFD. Feed preferido: {dataFeed === 'twelve' ? 'Twelve Data' : 'Yahoo'} · cada linha mostra a frescura LTF.
        Índices/forex fecham fim de semana; crypto CFD continua.
        Gestão de posição aberta → tab <strong>Posições</strong>. Acções US CLOSED = sem JÁ (aguarda 09:30 ET).
      </p>

      {rows.length > 0 && (
        <section className="agent-summary desk-filters">
          <button type="button" className={filter === 'TODAS' ? 'active' : ''} onClick={() => setFilter('TODAS')}>Todas <span>{rows.length}</span></button>
          <button type="button" className={filter === 'COMPRAR_JA' ? 'active buy' : 'buy'} onClick={() => setFilter('COMPRAR_JA')}>Long <span>{counts.COMPRAR_JA}</span></button>
          <button type="button" className={filter === 'VENDER' ? 'active sell' : 'sell'} onClick={() => setFilter('VENDER')}>Short <span>{counts.VENDER}</span></button>
          <button type="button" className={filter === 'AGUARDAR' ? 'active watch' : 'watch'} onClick={() => setFilter('AGUARDAR')}>Aguardar <span>{counts.AGUARDAR}</span></button>
          <button type="button" className={filter === 'ESPERAR' ? 'active wait' : 'wait'} onClick={() => setFilter('ESPERAR')}>Esperar <span>{counts.ESPERAR}</span></button>
          {counts.AGUARDAR > 0 && (
            <button
              type="button"
              className="setup-reapply refresh-aguardar"
              onClick={() => void refreshAguardar()}
              disabled={running}
              title="Re-avalia MTF só as AGUARDAR — vê quais passam a Long/Short JÁ ou caem para ESPERAR"
            >
              {refreshingAguardar ? 'A refrescar…' : `Refresh Aguardar (${counts.AGUARDAR})`}
            </button>
          )}
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
                        data-t212={row.instrument.id}
                        className={`${row.action.toLowerCase()}${open ? ' selected' : ''}${isBuyNow(row) ? ' buy-now' : ''}${isSellNow(row) ? ' sell-now' : ''}`}
                        onClick={() => (open ? closeDetail() : setSelectedId(row.instrument.id))}
                      >
                        <td className="col-symbol">
                          {row.instrument.short}
                          <small className="desk-sub">{t212KindLabel(row.instrument.kind)}</small>
                          {/* per-row market-open badge */}
                          {(() => {
                            const m = getInstrumentMarketStatus(row.instrument.kind)
                            return (
                              <small
                                className={`market-badge ${m.open ? 'open' : 'closed'}`}
                                title={m.reason}
                                style={{ marginLeft: 8 }}
                              >
                                {m.open ? 'OPEN' : 'CLOSED'}
                              </small>
                            )
                          })()}
                        </td>
                        <td>
                          <strong className={`timing-${row.entryTiming.toLowerCase()}`}>
                            {row.liveConfirmationRequired ? 'CONFIRMAR LIVE' : tjrActionLabel(row, { cfd: true })}
                          </strong>
                          <small className="desk-sub">
                            {row.manualLiveConfirmedAt
                              ? 'LIVE · manual'
                              : row.ltfFeedFresh
                                ? `LIVE · ${Number.isFinite(row.ltfDataAgeMinutes) ? `${Math.round(row.ltfDataAgeMinutes!)}m` : 'LTF'}`
                                : `DELAYED · ${Number.isFinite(row.ltfDataAgeMinutes) ? `${Math.round(row.ltfDataAgeMinutes!)}m` : 'fallback'}`}
                            {' · '}{row.setupStatus}{refinedIds.has(row.instrument.id) ? ' · MTF' : ''}{loadingFull === row.instrument.id ? ' · a refinar…' : ''}
                          </small>
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
                          {row.riskyHighLong ? (
                            <span className="sweep-tag warn">{row.sweepLabel ?? 'H arriscado'}</span>
                          ) : row.softOpposed ? (
                            <span className="sweep-tag caution">{row.sweepLabel ?? 'só malha'}</span>
                          ) : row.opposedSweep && row.action !== 'VENDER' ? (
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
                              <div className="desk-expand-toolbar">
                                <button type="button" className="desk-expand-close" onClick={closeDetail}>
                                  ← Fechar · voltar à lista
                                </button>
                                <span className="desk-sub">{selected.instrument.short} · {tjrActionLabel(selected, { cfd: true })}</span>
                              </div>
                              <T212TradeGuide
                                instrument={selected.instrument}
                                decision={selected}
                                onConfirmLive={confirmLiveSetup}
                              />
                              <div className="card-expanded-main">
                                <article className="chart-panel">
                                  <header>
                                    <div>
                                      <p className="eyebrow">{selected.instrument.t212Label}</p>
                                      <h2>{tjrActionLabel(selected, { cfd: true })} · {selected.score}/100</h2>
                                    </div>
                                    <span>
                                      {loadingFull === selected.instrument.id
                                        ? 'A refinar MTF…'
                                        : `Yahoo · chart ${chartInterval}${refinedIds.has(selected.instrument.id) ? ' · MTF' : ''}`}
                                    </span>
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
                                    {' · '}<strong>Timing:</strong> {tjrTimingLabel(selected)}
                                    {selected.riskReward !== undefined && <> · <strong>R:R</strong> {selected.riskReward.toFixed(1)}×</>}
                                  </p>
                                  {selected.matchingSetups && selected.matchingSetups.length > 0 && (
                                    <p className="setup-hit-panel">
                                      <strong>Setups agora:</strong> {selected.matchingSetups.map((hit) => hit.label).join(' · ')}
                                    </p>
                                  )}
                                  <ul className="tjr-checklist inline">
                                    {selected.checklist.map((item) => (
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
