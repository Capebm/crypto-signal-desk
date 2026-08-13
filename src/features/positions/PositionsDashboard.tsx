import { useEffect, useMemo, useState } from 'react'
import {
  AGENT_QUOTE_ASSET,
  BTC_REFERENCE_SYMBOL,
  formatTradingPair,
  getPlaybookCandles,
} from '../../lib/binance'
import { binancePriceDisplay } from '../../lib/binance-prices'
import { goToCryptoTab } from '../../lib/crypto-tabs'
import { loadJournalStore } from '../../lib/journal/trade-store'
import {
  clearOpenPosition,
  loadOpenPosition,
  parseOpenNumber,
  saveOpenPosition,
  type SavedOpenPosition,
} from '../../lib/open-position-store'
import {
  resolvePositionSymbol,
  runPositionAdvice,
  runT212PositionAdvice,
  type PositionAdvice,
  type PositionAdviceResult,
} from '../../lib/position-advisor'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import { hoursSinceIso, isPastTimeStop, TIME_STOP_HOURS, TIME_STOP_NOTE } from '../../lib/trade-guards'
import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'
import {
  clearT212OpenPosition,
  loadT212OpenPosition,
  saveT212OpenPosition,
  type SavedT212OpenPosition,
} from '../../lib/t212-open-position-store'
import {
  computeEsNqContext,
  t212EsInstrument,
  t212NeedsEsNqGate,
  t212NqInstrument,
  type EsNqContext,
} from '../../lib/t212-es-nq'
import { getInstrumentMarketStatus } from '../../lib/trading-session'
import {
  T212_BTC_INSTRUMENT,
  T212_CATALOG,
  fetchYahooCandlesRaw,
  getT212PlaybookCandles,
  instrumentById,
  type T212FeedPreference,
  type T212Instrument,
} from '../../lib/yahoo-market'
import type { Interval } from '../../lib/types'
import CoinSearchInput from '../agent/CoinSearchInput'
import PriceChart from '../chart/PriceChart'

type Venue = 'spot' | 't212'

const SPOT_RISK_KEY = 'tjr-risk-index'
const SPOT_TP_KEY = 'tjr-tp-mode'
const T212_RISK_KEY = 't212-risk-index'
const T212_TP_KEY = 't212-tp-mode'
const T212_WIDE_KEY = 't212-wide-net'
const T212_CFD_KEY = 't212-cfd-practical'
const T212_VIDEO_KEY = 't212-video-strict'
const T212_FEED_KEY = 't212-data-feed'

const adviceClass = (advice: PositionAdvice) => {
  if (advice === 'SAIR') return 'pos-sair'
  if (advice === 'REALIZAR') return 'pos-realizar'
  if (advice === 'COMPRAR_MAIS') return 'pos-add'
  return 'pos-manter'
}

const money = (value: number) =>
  value.toLocaleString('pt-PT', { maximumFractionDigits: value < 2 ? 5 : 2 })

const readBool = (key: string, fallback: boolean) => {
  const raw = localStorage.getItem(key)
  if (raw === '1') return true
  if (raw === '0') return false
  return fallback
}

const readRisk = (key: string): RiskProfile => {
  const idx = Math.min(2, Math.max(0, Number(localStorage.getItem(key)) || 1))
  return (['conservador', 'equilibrado', 'agressivo'] as const)[idx]
}

const readTp = (key: string): TpMode => {
  const raw = localStorage.getItem(key)
  if (raw && (tpModes as string[]).includes(raw)) return raw as TpMode
  return '1_5r'
}

export default function PositionsDashboard() {
  const [venue, setVenue] = useState<Venue>('spot')
  const [chartInterval, setChartInterval] = useState<Interval>('15m')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PositionAdviceResult>()

  // Spot form
  const [base, setBase] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [userStop, setUserStop] = useState('')
  const [userTarget, setUserTarget] = useState('')
  const [lockOco, setLockOco] = useState(true)

  // T212 form
  const [instrumentId, setInstrumentId] = useState('ger40')
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [t212Entry, setT212Entry] = useState('')
  const [t212Qty, setT212Qty] = useState('')
  const [t212Stop, setT212Stop] = useState('')
  const [t212Target, setT212Target] = useState('')
  const [t212Lock, setT212Lock] = useState(true)

  const riskProfile = venue === 'spot' ? readRisk(SPOT_RISK_KEY) : readRisk(T212_RISK_KEY)
  const tpMode = venue === 'spot' ? readTp(SPOT_TP_KEY) : readTp(T212_TP_KEY)
  const wideNet = readBool(T212_WIDE_KEY, false)
  const cfdPractical = readBool(T212_CFD_KEY, true)
  const tjrVideoStrict = readBool(T212_VIDEO_KEY, false)
  const dataFeed = (localStorage.getItem(T212_FEED_KEY) as T212FeedPreference | null) ?? 'yahoo'

  const instrument = useMemo(
    () => instrumentById(instrumentId) ?? T212_CATALOG[0],
    [instrumentId],
  )

  const journalOpens = useMemo(() => {
    try {
      return loadJournalStore().t212OpenExecutions ?? []
    } catch {
      return []
    }
  }, [result, venue])

  useEffect(() => {
    const spot = loadOpenPosition()
    if (spot) {
      setBase(spot.base)
      setEntryPrice(spot.entryPrice)
      setQuantity(spot.quantity)
      setUserStop(spot.userStop)
      setUserTarget(spot.userTarget)
      setLockOco(spot.lockOco)
    }
    const t212 = loadT212OpenPosition()
    if (t212) {
      setInstrumentId(t212.instrumentId)
      setSide(t212.side)
      setT212Entry(t212.entryPrice)
      setT212Qty(t212.quantity)
      setT212Stop(t212.userStop)
      setT212Target(t212.userTarget)
      setT212Lock(t212.lockOco)
    }
  }, [])

  const chartSymbol = venue === 'spot'
    ? resolvePositionSymbol(base, AGENT_QUOTE_ASSET)
    : instrument.short

  const chartLoadCandles = venue === 't212'
    ? (_symbol: string, interval: Interval) => fetchYahooCandlesRaw(instrument.yahooSymbol, interval)
    : undefined

  const optionsFor = (item: T212Instrument, esNq?: EsNqContext) => {
    const usIndex = t212NeedsEsNqGate(item)
    const market = getInstrumentMarketStatus(item.kind)
    return {
      referenceLabel: item.kind === 'crypto' ? 'BTC' : 'US500',
      wideNet,
      cfdPractical,
      tjrVideoStrict,
      sessionMarket: (item.kind === 'crypto' ? 'crypto' : 'cfd') as 'crypto' | 'cfd',
      killzoneQualityOnly: item.kind === 'forex' || item.kind === 'crypto',
      instrumentMarketOpen: market.open,
      instrumentMarketNote: market.reason,
      ...(item.kind === 'index' || item.kind === 'future' ? {} : { requireSmtAlign: false as const }),
      ...(usIndex ? { usIndexPlaybook: true as const } : {}),
      ...(usIndex && esNq
        ? { esNqAligned: esNq.aligned, esNqNote: esNq.note, esNqSmt: esNq.smt }
        : {}),
    }
  }

  const analyzeSpot = async () => {
    const symbol = resolvePositionSymbol(base, AGENT_QUOTE_ASSET)
    const entry = parseOpenNumber(entryPrice)
    const qty = parseOpenNumber(quantity)
    const stop = parseOpenNumber(userStop)
    const target = parseOpenNumber(userTarget)
    if (!symbol || entry === undefined) {
      setError('Indica moeda (ex. RE) e preço de entrada válido.')
      return
    }
    const next: SavedOpenPosition = {
      base: base.toUpperCase(),
      entryPrice,
      quantity,
      userStop,
      userTarget,
      lockOco,
    }
    saveOpenPosition(next)
    setLoading(true)
    try {
      const advice = await runPositionAdvice(
        {
          symbol,
          entryPrice: entry,
          quantity: qty,
          userStop: lockOco ? stop : undefined,
          userTarget: lockOco ? target : undefined,
        },
        riskProfile,
        getPlaybookCandles,
        BTC_REFERENCE_SYMBOL,
        tpMode,
      )
      setResult(advice)
    } catch {
      setError('Não foi possível analisar. Confirma o par USDC na Binance.')
    } finally {
      setLoading(false)
    }
  }

  const analyzeT212 = async () => {
    const entry = parseOpenNumber(t212Entry)
    const qty = parseOpenNumber(t212Qty)
    const stop = parseOpenNumber(t212Stop)
    const target = parseOpenNumber(t212Target)
    if (!instrument || entry === undefined) {
      setError('Escolhe o instrumento e um preço de entrada válido.')
      return
    }
    const next: SavedT212OpenPosition = {
      instrumentId: instrument.id,
      side,
      entryPrice: t212Entry,
      quantity: t212Qty,
      userStop: t212Stop,
      userTarget: t212Target,
      lockOco: t212Lock,
    }
    saveT212OpenPosition(next)
    setLoading(true)
    try {
      let esNq: EsNqContext | undefined
      if (t212NeedsEsNqGate(instrument)) {
        const [esPack, nqPack] = await Promise.all([
          getT212PlaybookCandles(t212EsInstrument(), { feed: dataFeed }),
          getT212PlaybookCandles(t212NqInstrument(), { feed: dataFeed }),
        ])
        esNq = computeEsNqContext(esPack['5m'], nqPack['5m'])
      }
      const refInstrument = instrument.kind === 'crypto'
        ? T212_BTC_INSTRUMENT
        : instrumentById('us500')!
      const advice = await runT212PositionAdvice(
        {
          symbol: instrument.short,
          side,
          entryPrice: entry,
          quantity: qty,
          userStop: t212Lock ? stop : undefined,
          userTarget: t212Lock ? target : undefined,
        },
        riskProfile,
        () => getT212PlaybookCandles(instrument, { feed: dataFeed }),
        () => getT212PlaybookCandles(refInstrument, { feed: dataFeed }),
        instrument.short,
        tpMode,
        optionsFor(instrument, esNq),
      )
      setResult(advice)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível analisar.')
    } finally {
      setLoading(false)
    }
  }

  const analyze = async () => {
    setError('')
    setResult(undefined)
    if (venue === 'spot') await analyzeSpot()
    else await analyzeT212()
  }

  const fillPrice = venue === 'spot'
    ? parseOpenNumber(entryPrice)
    : parseOpenNumber(t212Entry)
  const stopLine = result?.levels.stop
  const targetLine = result?.levels.target

  const savedAt = venue === 'spot' ? loadOpenPosition()?.savedAt : loadT212OpenPosition()?.savedAt
  const heldHours = hoursSinceIso(savedAt)
  const pastTimeStop = isPastTimeStop(savedAt)

  return (
    <main className="journal-shell positions-shell">
      <header className="journal-header">
        <div>
          <p className="eyebrow">POSIÇÕES ABERTAS</p>
          <h1>Manter, realizar ou sair?</h1>
          <p>
            Análise TJR com velas e checklist — gestão, não scan de novas entradas.
            Usa o risco/TP guardado no {venue === 'spot' ? 'Agente' : 'T212'} ({riskProfiles[riskProfile].label} · {tpModeMeta[tpMode].short}).
          </p>
        </div>
        <div className="journal-header-actions">
          <button type="button" className="ghost" onClick={() => goToCryptoTab(venue === 'spot' ? 'agent' : 't212')}>
            Ir ao {venue === 'spot' ? 'Agente' : 'T212'}
          </button>
        </div>
      </header>

      <div className="journal-filters" role="group" aria-label="Venue">
        <button type="button" className={venue === 'spot' ? '' : 'ghost'} onClick={() => { setVenue('spot'); setResult(undefined); setError('') }}>
          Spot Binance
        </button>
        <button type="button" className={venue === 't212' ? '' : 'ghost'} onClick={() => { setVenue('t212'); setResult(undefined); setError('') }}>
          T212 CFD
        </button>
      </div>

      {venue === 't212' && journalOpens.length > 0 && (
        <section className="journal-import-help" aria-label="Abertas no ledger CSV">
          <strong>Do CSV T212:</strong>{' '}
          {journalOpens.map((e) => (
            <button
              key={e.id}
              type="button"
              className="ghost"
              style={{ marginRight: 6, marginBottom: 4 }}
              onClick={() => {
                const match = T212_CATALOG.find((c) => c.short === e.instrument)
                if (match) setInstrumentId(match.id)
                setSide(e.direction === 'Sell' ? 'short' : 'long')
                setT212Entry(String(e.price))
                setT212Qty(String(e.size))
              }}
            >
              {e.instrument} {e.direction} @ {money(e.price)}
            </button>
          ))}
        </section>
      )}

      {result && (
        <div className={`position-active-banner ${adviceClass(result.advice)}`}>
          <strong>
            {venue === 'spot'
              ? formatTradingPair(resolvePositionSymbol(base))
              : `${instrument.short} · ${side === 'short' ? 'SHORT' : 'LONG'}`}
          </strong>
          <span>{result.label}</span>
          <span className={result.pnlPct >= 0 ? 'positive' : 'negative'}>
            {result.pnlPct >= 0 ? '+' : ''}{result.pnlPct.toFixed(2)}%
            {result.pnlUsdc !== undefined && (
              <> · {result.pnlUsdc >= 0 ? '+' : ''}{venue === 'spot' ? result.pnlUsdc.toFixed(2) : money(result.pnlUsdc)}{venue === 'spot' ? ` ${AGENT_QUOTE_ASSET}` : ''}</>
            )}
          </span>
          {heldHours !== undefined && (
            <span className={pastTimeStop ? 'negative' : undefined} title={TIME_STOP_NOTE}>
              {heldHours.toFixed(1)}h{pastTimeStop ? ` · time-stop ${TIME_STOP_HOURS}h` : ''}
            </span>
          )}
        </div>
      )}

      <section className="positions-layout">
        <form
          className="position-form positions-form"
          onSubmit={(event) => {
            event.preventDefault()
            void analyze()
          }}
        >
          {venue === 'spot' ? (
            <>
              <label>
                Moeda
                <CoinSearchInput value={base} onChange={setBase} placeholder={`Ex.: RE/${AGENT_QUOTE_ASSET}`} />
              </label>
              <label>
                Preço entrada (Cost Price)
                <input value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="0.5145" inputMode="decimal" />
              </label>
              <label>
                Quantidade <span className="optional">(opc.)</span>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="38.8" inputMode="decimal" />
              </label>
              <label>
                Stop OCO <span className="optional">(opc.)</span>
                <input value={userStop} onChange={(e) => setUserStop(e.target.value)} placeholder="0.4960" inputMode="decimal" />
              </label>
              <label>
                TP OCO <span className="optional">(opc.)</span>
                <input value={userTarget} onChange={(e) => setUserTarget(e.target.value)} placeholder="0.5320" inputMode="decimal" />
              </label>
              <label className="position-lock-oco">
                <input type="checkbox" checked={lockOco} onChange={(e) => setLockOco(e.target.checked)} />
                Usar stop/TP do OCO (não recalcular)
              </label>
            </>
          ) : (
            <>
              <label>
                Instrumento
                <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
                  {T212_CATALOG.map((item) => (
                    <option key={item.id} value={item.id}>{item.short} — {item.t212Label}</option>
                  ))}
                </select>
              </label>
              <label>
                Lado
                <select value={side} onChange={(e) => setSide(e.target.value === 'short' ? 'short' : 'long')}>
                  <option value="long">Long (Buy)</option>
                  <option value="short">Short (Sell)</option>
                </select>
              </label>
              <label>
                Preço entrada
                <input value={t212Entry} onChange={(e) => setT212Entry(e.target.value)} placeholder="ex. 18450" inputMode="decimal" />
              </label>
              <label>
                Unidades <span className="optional">(opc.)</span>
                <input value={t212Qty} onChange={(e) => setT212Qty(e.target.value)} placeholder="1" inputMode="decimal" />
              </label>
              <label>
                Stop <span className="optional">(opc.)</span>
                <input value={t212Stop} onChange={(e) => setT212Stop(e.target.value)} inputMode="decimal" />
              </label>
              <label>
                TP <span className="optional">(opc.)</span>
                <input value={t212Target} onChange={(e) => setT212Target(e.target.value)} inputMode="decimal" />
              </label>
              <label className="position-lock-oco">
                <input type="checkbox" checked={t212Lock} onChange={(e) => setT212Lock(e.target.checked)} />
                Usar stop/TP indicados (não recalcular)
              </label>
            </>
          )}
          <div className="positions-form-actions">
            <button type="submit" disabled={loading}>{loading ? 'A analisar…' : 'Analisar posição'}</button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (venue === 'spot') {
                  clearOpenPosition()
                  setBase('')
                  setEntryPrice('')
                  setQuantity('')
                  setUserStop('')
                  setUserTarget('')
                } else {
                  clearT212OpenPosition()
                  setT212Entry('')
                  setT212Qty('')
                  setT212Stop('')
                  setT212Target('')
                }
                setResult(undefined)
                setError('')
              }}
            >
              Limpar
            </button>
          </div>
        </form>

        <div className="positions-analysis">
          {error && <p className="position-error">{error}</p>}

          {chartSymbol && (
            <article className="evidence-chart positions-chart">
              <header className="evidence-head">
                <div>
                  <p className="eyebrow">{venue === 'spot' ? formatTradingPair(chartSymbol) : chartSymbol}</p>
                  <h2>{result ? result.label : 'Gráfico'}</h2>
                </div>
              </header>
              <PriceChart
                symbol={chartSymbol}
                action={result?.decision.action ?? 'ESPERAR'}
                interval={chartInterval}
                onIntervalChange={setChartInterval}
                entry={result?.levels.entry}
                stop={stopLine}
                target={targetLine}
                fillPrice={fillPrice}
                fillLabel="Entrada"
                zones={result?.decision.zones}
                htfLevels={result?.decision.htfLevels}
                loadCandles={chartLoadCandles}
                staleHint={venue === 't212' ? 'Dados Yahoo / Twelve' : 'Dados da Binance'}
              />
            </article>
          )}

          {result && (
            <>
              <article className={`position-result ${adviceClass(result.advice)}`}>
                <strong className="position-verdict">{result.label}</strong>
                <p className="position-summary">{result.summary}</p>
                <dl className="position-metrics">
                  <div><dt>Preço agora</dt><dd>{venue === 'spot' ? binancePriceDisplay(result.currentPrice) : money(result.currentPrice)}</dd></div>
                  <div><dt>PnL</dt><dd className={result.pnlPct >= 0 ? 'positive' : 'negative'}>{result.pnlPct.toFixed(2)}%</dd></div>
                  <div><dt>Em R</dt><dd>{result.riskR >= 0 ? '+' : ''}{result.riskR.toFixed(2)}R</dd></div>
                  {result.pnlUsdc !== undefined && (
                    <div>
                      <dt>PnL {venue === 'spot' ? AGENT_QUOTE_ASSET : ''}</dt>
                      <dd className={result.pnlUsdc >= 0 ? 'positive' : 'negative'}>
                        {venue === 'spot' ? result.pnlUsdc.toFixed(2) : money(result.pnlUsdc)}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Stop</dt>
                    <dd>
                      {result.levels.stop !== undefined
                        ? (venue === 'spot' ? binancePriceDisplay(result.levels.stop) : money(result.levels.stop))
                        : '—'}
                      {result.usingEntryOco ? ' · teu' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Alvo</dt>
                    <dd>
                      {result.levels.target !== undefined
                        ? (venue === 'spot' ? binancePriceDisplay(result.levels.target) : money(result.levels.target))
                        : '—'}
                      {result.usingEntryOco ? ' · teu' : ''}
                    </dd>
                  </div>
                  <div><dt>Bias</dt><dd>{result.decision.bias === 'bullish' ? 'Altista' : result.decision.bias === 'bearish' ? 'Baixista' : 'Neutro'}</dd></div>
                  <div><dt>Score (nova entrada)</dt><dd>{result.decision.score}/100</dd></div>
                </dl>
                <p className="position-score-note">
                  Score baixo numa posição aberta é normal — mede “abriria de novo agora?”, não “devo segurar?”.
                </p>
                <ul className="position-reasons">
                  {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </article>

              <aside className="evidence-panel compact">
                <p className="evidence-summary">
                  <strong>Guidance:</strong> {result.decision.positionGuidance}
                  {result.decision.invalidationReason && <> — {result.decision.invalidationReason}</>}
                </p>
                <ul className="tjr-checklist inline">
                  {result.decision.checklist.map((item) => (
                    <li
                      key={item.label}
                      className={item.partial ? 'partial' : item.complete ? 'done' : 'pending'}
                      title={item.note}
                    >
                      <span>{item.partial ? '!' : item.complete ? '✓' : '○'}</span> {item.label}
                    </li>
                  ))}
                </ul>
              </aside>
            </>
          )}

          {!result && !loading && (
            <p className="journal-muted">Preenche a posição e analisa para ver velas, MANTER/SAIR e checklist TJR.</p>
          )}
        </div>
      </section>
    </main>
  )
}
