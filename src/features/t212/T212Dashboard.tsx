import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import PriceChart from '../chart/PriceChart'
import MarketClocks from '../agent/MarketClocks'
import T212TradeGuide from './T212TradeGuide'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import {
  evaluateTjrFull,
  formatSetupHitLabel,
  isAwaitingEntry,
  isEnterLongNow,
  isEnterShortNow,
  listActionNowSetups,
  tjrActionLabel,
  tjrTimingLabel,
  tjrScoreColor,
  type TjrDecision,
} from '../../lib/tjr-engine'
import { getCfdMarketStatus, getMarketClocks, getTradingSessionStatus } from '../../lib/trading-session'
import type { Interval } from '../../lib/types'
import {
  DEFAULT_T212_INSTRUMENT,
  T212_BTC_INSTRUMENT,
  T212_CATALOG,
  T212_CORE_IDS,
  T212_EXTRA_INSTRUMENTS,
  fetchYahooCandlesRaw,
  getT212PlaybookCandles,
  readT212WatchlistIds,
  resolveT212Watchlist,
  t212KindLabel,
  writeT212WatchlistIds,
  type T212Instrument,
} from '../../lib/yahoo-market'

const RISK_KEY = 't212-risk-index'
const TP_KEY = 't212-tp-mode'
const STAKE_KEY = 't212-stake-eur'
const ALL_SETUPS_KEY = 't212-scan-all-setups'
const WIDE_NET_KEY = 't212-wide-net'
const CFD_PRACTICAL_KEY = 't212-cfd-practical'

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
  const [stakeIndex, setStakeIndex] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(STAKE_KEY))
      return Number.isFinite(raw) && raw >= 0 && raw < STAKE_OPTIONS.length ? raw : 1
    } catch {
      return 1
    }
  })
  const [scanAllSetups, setScanAllSetups] = useState(() => readBool(ALL_SETUPS_KEY, false))
  const [wideNet, setWideNet] = useState(() => readBool(WIDE_NET_KEY, false))
  const [cfdPractical, setCfdPractical] = useState(() => readBool(CFD_PRACTICAL_KEY, true))
  const [watchIds, setWatchIds] = useState(() => readT212WatchlistIds())
  const watchlist = useMemo(() => resolveT212Watchlist(watchIds), [watchIds])
  const riskProfile = profiles[riskIndex]
  const tpMode = tpModes[tpIndex]
  const stakeEur = STAKE_OPTIONS[stakeIndex]

  /** Índices: SMT do perfil. Resto informativo. Crypto CFD: sessão 24/7 (não fecha fim de semana). */
  const optionsFor = (instrument: T212Instrument) => ({
    referenceLabel: instrument.kind === 'crypto' ? 'BTC' : 'US500',
    wideNet,
    cfdPractical,
    sessionMarket: instrument.kind === 'crypto' ? 'crypto' as const : 'cfd' as const,
    ...(instrument.kind === 'index' ? {} : { requireSmtAlign: false as const }),
  })

  const hasCryptoWatch = useMemo(() => watchlist.some((item) => item.kind === 'crypto'), [watchlist])

  const [rows, setRows] = useState<T212Row[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR_JA' | 'VENDER' | 'AGUARDAR' | 'ESPERAR'>('TODAS')
  const [status, setStatus] = useState('Carrega Analisar — índices, forex, metais, energia e crypto CFD (long + short).')
  const [running, setRunning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ pct: number; label: string }>()
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [session, setSession] = useState(() => getTradingSessionStatus())
  const [marketClocks, setMarketClocks] = useState(() => getMarketClocks())
  const [cfdMarket, setCfdMarket] = useState(() => getCfdMarketStatus())
  const canScan = cfdMarket.open || hasCryptoWatch

  useEffect(() => {
    try {
      localStorage.setItem(RISK_KEY, String(riskIndex))
      localStorage.setItem(TP_KEY, tpMode)
      localStorage.setItem(STAKE_KEY, String(stakeIndex))
      localStorage.setItem(ALL_SETUPS_KEY, scanAllSetups ? '1' : '0')
      localStorage.setItem(WIDE_NET_KEY, wideNet ? '1' : '0')
      localStorage.setItem(CFD_PRACTICAL_KEY, cfdPractical ? '1' : '0')
      writeT212WatchlistIds(watchIds)
    } catch {
      /* ignore */
    }
  }, [riskIndex, tpMode, stakeIndex, scanAllSetups, wideNet, cfdPractical, watchIds])

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

    const buildRow = (
      instrument: T212Instrument,
      data: Awaited<ReturnType<typeof getT212PlaybookCandles>>,
      reference: Awaited<ReturnType<typeof getT212PlaybookCandles>>,
    ): T212Row => {
      const evalOptions = optionsFor(instrument)
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
      return { ...decision, instrument, price }
    }

    const sortRows = (list: T212Row[]) =>
      [...list].sort((a, b) => b.score - a.score || (b.riskReward ?? 0) - (a.riskReward ?? 0))

    const publish = (list: T212Row[], done: number, label: string) => {
      setRows(sortRows(list))
      setScanProgress({ pct: Math.min(99, Math.round((done / total) * 100)), label })
      setStatus(label)
    }

    const mapPool = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
      const out: R[] = new Array(items.length)
      let cursor = 0
      const worker = async () => {
        while (cursor < items.length) {
          const index = cursor
          cursor += 1
          out[index] = await fn(items[index])
        }
      }
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
      return out
    }

    try {
      const results: T212Row[] = []
      const failed: string[] = []
      let done = 0

      const indexRef = scanList.find((item) => item.id === 'us500') ?? scanList.find((item) => item.kind === 'index')
      const needsCryptoRef = scanList.some((item) => item.kind === 'crypto')
      let indexRefPack: Awaited<ReturnType<typeof getT212PlaybookCandles>> | undefined
      let cryptoRefPack: Awaited<ReturnType<typeof getT212PlaybookCandles>> | undefined

      if (needsCryptoRef) {
        try {
          cryptoRefPack = await getT212PlaybookCandles(T212_BTC_INSTRUMENT)
        } catch {
          /* BTC ref opcional */
        }
      }

      const refInstrument = indexRef ?? scanList[0]
      try {
        const data = await getT212PlaybookCandles(refInstrument)
        if (refInstrument.kind === 'index' || refInstrument.id === 'us500') indexRefPack = data
        if (refInstrument.kind === 'crypto' && !cryptoRefPack) cryptoRefPack = data
        const refPack = refInstrument.kind === 'crypto'
          ? (cryptoRefPack ?? data)
          : (indexRefPack ?? data)
        results.push(buildRow(refInstrument, data, refPack))
        done += 1
        publish(results, done, `OK · ${refInstrument.short} · ${done}/${total}`)
      } catch (error) {
        failed.push(refInstrument.short)
        done += 1
        setStatus(error instanceof Error ? error.message : `Falha ${refInstrument.short}`)
      }

      const rest = scanList.filter((item) => item.id !== refInstrument.id)
      await mapPool(rest, 4, async (instrument) => {
        try {
          const data = await getT212PlaybookCandles(instrument)
          if (instrument.kind !== 'crypto' && !indexRefPack) indexRefPack = data
          if (instrument.kind === 'crypto' && !cryptoRefPack) cryptoRefPack = data
          const refPack = instrument.kind === 'crypto'
            ? (cryptoRefPack ?? data)
            : (indexRefPack ?? cryptoRefPack ?? data)
          results.push(buildRow(instrument, data, refPack))
        } catch {
          failed.push(instrument.short)
        } finally {
          done += 1
          publish(results, done, `OK · ${instrument.short} · ${done}/${total}`)
        }
      })

      if (results.length === 0) {
        throw new Error(failed.length ? `Yahoo falhou: ${failed.join(', ')}` : 'Sem candles Yahoo.')
      }

      const sorted = sortRows(results)
      setRows(sorted)
      const buyNow = sorted.filter(isBuyNow).length
      const sellNow = sorted.filter(isSellNow).length
      const aguardar = sorted.filter(isAguardar).length
      const otherSetupHits = scanAllSetups
        ? sorted.filter((row) => (row.matchingSetups?.length ?? 0) > 0).length
        : 0
      const weekendNote = cryptoOnly ? ' (só crypto — resto CFD fechado).' : ''
      setStatus(
        buyNow + sellNow > 0
          ? `${sorted.length} ok · ${buyNow} LONG · ${sellNow} SHORT.${weekendNote}${failed.length ? ` Falhou: ${failed.join(', ')}.` : ''}`
          : otherSetupHits > 0
            ? `${sorted.length} ok · 0 no teu perfil · ${otherSetupHits} com setup noutro combo (badges).${weekendNote}${failed.length ? ` Falhou: ${failed.join(', ')}.` : ''}`
            : `${sorted.length} ok · 0 agora · ${aguardar} aguardar.${weekendNote}${scanAllSetups ? ' Todos setups: nenhum dos 9 deu LONG/SHORT JÁ.' : ''}${cfdPractical ? '' : ' Liga CFD prático ou Malha larga.'} Melhor na NY open.`,
      )
      if (buyNow > 0) setFilter('COMPRAR_JA')
      else if (sellNow > 0) setFilter('VENDER')
      else setFilter('TODAS')
    } catch (error) {
      setRows([])
      setStatus(error instanceof Error ? error.message : 'Falha ao obter dados Yahoo.')
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
      return
    }
    void analyzeAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => ({
    COMPRAR_JA: rows.filter(isBuyNow).length,
    VENDER: rows.filter(isSellNow).length,
    AGUARDAR: rows.filter(isAguardar).length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR' || isInvalidated(row)).length,
  }), [rows])

  const visibleRows = rows.filter((row) => {
    if (filter === 'COMPRAR_JA') return isBuyNow(row)
    if (filter === 'VENDER') return isSellNow(row)
    if (filter === 'AGUARDAR') return isAguardar(row)
    if (filter === 'ESPERAR') return row.action === 'ESPERAR' || isInvalidated(row)
    return true
  })

  const selected = rows.find((row) => row.instrument.id === selectedId)

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
          <strong>{!cfdMarket.open && !hasCryptoWatch ? 'Fechado' : session.inIdealWindow ? 'NY open' : session.window.replace('_', ' ')}</strong>
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
        <label className="tv-setup-toggle" title="Gates + sessão como Agressivo (Londres / NY mid). Mantém BOS LTF. Mais sinais, menor qualidade.">
          <input
            type="checkbox"
            checked={wideNet}
            onChange={(event) => setWideNet(event.target.checked)}
          />
          <span>Malha larga</span>
        </label>
        <label className="tv-setup-toggle" title="CFD: confirmação 5m OU 1h; entrada BOS 5m se Yahoo 1m falhar; discount perto do EQ. Ligado por defeito — desliga para TJR estrito.">
          <input
            type="checkbox"
            checked={cfdPractical}
            onChange={(event) => setCfdPractical(event.target.checked)}
          />
          <span>CFD prático</span>
        </label>
        <label className="tv-setup-toggle" title="Corre as 9 combinações (3 riscos × 3 TPs). Inclui Agressivo — pode dar COMPRAR/VENDER mesmo em NY mid quando o teu perfil Conservador só AGUARDA.">
          <input
            type="checkbox"
            checked={scanAllSetups}
            onChange={(event) => setScanAllSetups(event.target.checked)}
          />
          <span>Todos setups</span>
        </label>
        <button type="button" className="setup-reapply" onClick={() => void analyzeAll()} disabled={running || !canScan}>
          {running ? '…' : 'Aplicar + scan'}
        </button>
      </section>

      <details className="t212-watchlist-panel">
        <summary>Watchlist · {watchlist.length} activos ({T212_CORE_IDS.length} core + {watchlist.length - T212_CORE_IDS.length} extras)</summary>
        <p className="desk-sub">Core sempre ligado. Extras opcionais — mais símbolos = scan mais lento. SMT obrigatório só em <strong>índices</strong>; forex/metal/energia/crypto = informativo. Crypto CFD = long + short (Buy/Sell).</p>
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
      <p className="t212-disclaimer">
        CFD: long (Buy) e short (Sell), incluindo crypto CFD. Pack Yahoo · resultados progressivos. Índices/forex fecham fim de semana; crypto CFD continua.
      </p>

      {rows.length > 0 && (
        <section className="agent-summary desk-filters">
          <button type="button" className={filter === 'TODAS' ? 'active' : ''} onClick={() => setFilter('TODAS')}>Todas <span>{rows.length}</span></button>
          <button type="button" className={filter === 'COMPRAR_JA' ? 'active buy' : 'buy'} onClick={() => setFilter('COMPRAR_JA')}>Long <span>{counts.COMPRAR_JA}</span></button>
          <button type="button" className={filter === 'VENDER' ? 'active sell' : 'sell'} onClick={() => setFilter('VENDER')}>Short <span>{counts.VENDER}</span></button>
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
                          <small className="desk-sub">{t212KindLabel(row.instrument.kind)}</small>
                        </td>
                        <td>
                          <strong className={`timing-${row.entryTiming.toLowerCase()}`}>{tjrActionLabel(row, { cfd: true })}</strong>
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
                                      <h2>{tjrActionLabel(selected, { cfd: true })} · {selected.score}/100</h2>
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
