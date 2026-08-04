import { useEffect, useMemo, useState } from 'react'
import { parseOpenNumber } from '../../lib/open-position-store'
import {
  runT212PositionAdvice,
  type PositionAdvice,
  type PositionAdviceResult,
} from '../../lib/position-advisor'
import type { RiskProfile } from '../../lib/risk-profile'
import type { TpMode } from '../../lib/tp-mode'
import {
  clearT212OpenPosition,
  loadT212OpenPosition,
  saveT212OpenPosition,
  type SavedT212OpenPosition,
} from '../../lib/t212-open-position-store'
import {
  computeEsNqAlignment,
  t212EsInstrument,
  t212NeedsEsNqGate,
  t212NqInstrument,
} from '../../lib/t212-es-nq'
import {
  T212_BTC_INSTRUMENT,
  T212_CATALOG,
  getT212PlaybookCandles,
  instrumentById,
  type T212FeedPreference,
  type T212Instrument,
} from '../../lib/yahoo-market'

const adviceClass = (advice: PositionAdvice) => {
  if (advice === 'SAIR') return 'pos-sair'
  if (advice === 'REALIZAR') return 'pos-realizar'
  if (advice === 'COMPRAR_MAIS') return 'pos-add'
  return 'pos-manter'
}

const money = (value: number) =>
  value.toLocaleString('pt-PT', { maximumFractionDigits: value < 2 ? 5 : 2 })

type Props = {
  riskProfile: RiskProfile
  tpMode: TpMode
  wideNet: boolean
  cfdPractical: boolean
  dataFeed: T212FeedPreference
  defaultInstrumentId?: string
}

export default function T212PositionAdvisor({
  riskProfile,
  tpMode,
  wideNet,
  cfdPractical,
  dataFeed,
  defaultInstrumentId,
}: Props) {
  const [instrumentId, setInstrumentId] = useState(defaultInstrumentId ?? 'ger40')
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [entryPrice, setEntryPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [userStop, setUserStop] = useState('')
  const [userTarget, setUserTarget] = useState('')
  const [lockOco, setLockOco] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PositionAdviceResult>()
  const [hasSaved, setHasSaved] = useState(() => Boolean(loadT212OpenPosition()))

  const instrument = useMemo(
    () => instrumentById(instrumentId) ?? T212_CATALOG[0],
    [instrumentId],
  )

  useEffect(() => {
    const saved = loadT212OpenPosition()
    if (!saved) {
      if (defaultInstrumentId) setInstrumentId(defaultInstrumentId)
      return
    }
    setHasSaved(true)
    setInstrumentId(saved.instrumentId)
    setSide(saved.side)
    setEntryPrice(saved.entryPrice)
    setQuantity(saved.quantity)
    setUserStop(saved.userStop)
    setUserTarget(saved.userTarget)
    setLockOco(saved.lockOco)
  }, [defaultInstrumentId])

  const persist = (next: SavedT212OpenPosition) => {
    saveT212OpenPosition(next)
    setHasSaved(true)
  }

  const optionsFor = (item: T212Instrument, esNqAligned?: boolean, esNqNote?: string) => {
    const usIndex = t212NeedsEsNqGate(item)
    return {
      referenceLabel: item.kind === 'crypto' ? 'BTC' : 'US500',
      wideNet,
      cfdPractical,
      sessionMarket: (item.kind === 'crypto' ? 'crypto' : 'cfd') as 'crypto' | 'cfd',
      ...(item.kind === 'index' || item.kind === 'future' ? {} : { requireSmtAlign: false as const }),
      ...(usIndex ? { usIndexPlaybook: true as const } : {}),
      ...(usIndex && esNqAligned !== undefined
        ? { esNqAligned, esNqNote }
        : {}),
    }
  }

  const analyze = async () => {
    setError('')
    setResult(undefined)
    const entry = parseOpenNumber(entryPrice)
    const qty = parseOpenNumber(quantity)
    const stop = parseOpenNumber(userStop)
    const target = parseOpenNumber(userTarget)
    if (!instrument || entry === undefined) {
      setError('Escolhe o instrumento e um preço de entrada válido.')
      return
    }
    persist({
      instrumentId: instrument.id,
      side,
      entryPrice,
      quantity,
      userStop,
      userTarget,
      lockOco,
    })
    setLoading(true)
    try {
      let esNqAligned: boolean | undefined
      let esNqNote: string | undefined
      if (t212NeedsEsNqGate(instrument)) {
        const [esPack, nqPack] = await Promise.all([
          getT212PlaybookCandles(t212EsInstrument(), { feed: dataFeed }),
          getT212PlaybookCandles(t212NqInstrument(), { feed: dataFeed }),
        ])
        const gate = computeEsNqAlignment(esPack['5m'], nqPack['5m'])
        esNqAligned = gate.aligned
        esNqNote = gate.note
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
          userStop: lockOco ? stop : undefined,
          userTarget: lockOco ? target : undefined,
        },
        riskProfile,
        () => getT212PlaybookCandles(instrument, { feed: dataFeed }),
        () => getT212PlaybookCandles(refInstrument, { feed: dataFeed }),
        instrument.short,
        tpMode,
        optionsFor(instrument, esNqAligned, esNqNote),
      )
      setResult(advice)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível analisar. Tenta de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="position-advisor t212-position-advisor">
      {result && (
        <div className={`position-active-banner ${adviceClass(result.advice)}`}>
          <strong>{instrument.short} · {side === 'short' ? 'SHORT' : 'LONG'}</strong>
          <span>{result.label}</span>
          <span className={result.pnlPct >= 0 ? 'positive' : 'negative'}>
            {result.pnlPct >= 0 ? '+' : ''}{result.pnlPct.toFixed(2)}%
            {result.pnlUsdc !== undefined && <> · {result.pnlUsdc >= 0 ? '+' : ''}{money(result.pnlUsdc)}</>}
          </span>
        </div>
      )}

      <header className="position-advisor-head">
        <div>
          <p className="eyebrow">POSIÇÃO ABERTA · T212 CFD</p>
          <h2>Devo manter, reforçar ou sair?</h2>
          <p>
            Preenche entrada (e stop/TP se tiveres). O veredicto <strong>MANTER/SAIR</strong> é o que importa —
            o score mede só uma <em>nova</em> entrada.
          </p>
        </div>
        {hasSaved && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              clearT212OpenPosition()
              setHasSaved(false)
              setResult(undefined)
              setEntryPrice('')
              setQuantity('')
              setUserStop('')
              setUserTarget('')
            }}
          >
            Limpar
          </button>
        )}
      </header>

      <form
        className="position-form"
        onSubmit={(event) => {
          event.preventDefault()
          void analyze()
        }}
      >
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
          <input value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="ex. 18450" inputMode="decimal" />
        </label>
        <label>
          Quantidade / unidades <span className="optional">(opc.)</span>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" inputMode="decimal" />
        </label>
        <label>
          Stop <span className="optional">(opc.)</span>
          <input value={userStop} onChange={(e) => setUserStop(e.target.value)} placeholder={side === 'short' ? 'acima da entrada' : 'abaixo da entrada'} inputMode="decimal" />
        </label>
        <label>
          TP <span className="optional">(opc.)</span>
          <input value={userTarget} onChange={(e) => setUserTarget(e.target.value)} placeholder={side === 'short' ? 'abaixo da entrada' : 'acima da entrada'} inputMode="decimal" />
        </label>
        <label className="position-lock-oco">
          <input type="checkbox" checked={lockOco} onChange={(e) => setLockOco(e.target.checked)} />
          Usar stop/TP indicados (não recalcular)
        </label>
        <button type="submit" disabled={loading}>{loading ? 'A analisar…' : 'Analisar posição'}</button>
      </form>

      {error && <p className="position-error">{error}</p>}

      {result && (
        <article className={`position-result ${adviceClass(result.advice)}`}>
          <p className="position-pair">{instrument.short} · {side === 'short' ? 'SHORT' : 'LONG'}</p>
          <strong className="position-verdict">{result.label}</strong>
          <p className="position-summary">{result.summary}</p>
          <dl className="position-metrics">
            <div><dt>Preço agora</dt><dd>{money(result.currentPrice)}</dd></div>
            <div><dt>PnL</dt><dd className={result.pnlPct >= 0 ? 'positive' : 'negative'}>{result.pnlPct.toFixed(2)}%</dd></div>
            <div><dt>Em R</dt><dd>{result.riskR >= 0 ? '+' : ''}{result.riskR.toFixed(2)}R</dd></div>
            {result.pnlUsdc !== undefined && (
              <div><dt>PnL (unidades)</dt><dd className={result.pnlUsdc >= 0 ? 'positive' : 'negative'}>{money(result.pnlUsdc)}</dd></div>
            )}
            <div><dt>Stop</dt><dd>{result.levels.stop !== undefined ? money(result.levels.stop) : '—'}{result.usingEntryOco ? ' · teu' : ''}</dd></div>
            <div><dt>Alvo</dt><dd>{result.levels.target !== undefined ? money(result.levels.target) : '—'}{result.usingEntryOco ? ' · teu' : ''}</dd></div>
            <div><dt>Score nova entrada</dt><dd>{result.decision.score}/100</dd></div>
          </dl>
          <p className="position-score-note">Score baixo numa posição aberta é normal — mede “abriria de novo agora?”, não “devo segurar?”.</p>
          <ul className="position-reasons">
            {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </article>
      )}
    </section>
  )
}
