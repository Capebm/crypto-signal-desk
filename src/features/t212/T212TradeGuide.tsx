import { useEffect, useState } from 'react'
import { goToCryptoTab } from '../../lib/crypto-tabs'
import { tjrActionLabel, type TjrDecision } from '../../lib/tjr-engine'
import type { T212Instrument } from '../../lib/yahoo-market'

const STAKE_KEY = 't212-stake-eur'
const STAKE_OPTIONS = [20, 50, 100, 200] as const

type Props = {
  instrument: T212Instrument
  decision: TjrDecision
  onConfirmLive?: (instrumentId: string, livePrice: number) => void
}

const fmt = (value?: number, digits = 2) => {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value >= 100) return value.toFixed(digits)
  if (value >= 1) return value.toFixed(Math.max(digits, 3))
  if (value >= 0.01) return value.toFixed(4)
  if (value >= 0.001) return value.toFixed(6)
  return value.toFixed(8)
}

const readStakeIndex = () => {
  try {
    const raw = Number(localStorage.getItem(STAKE_KEY))
    return Number.isFinite(raw) && raw >= 0 && raw < STAKE_OPTIONS.length ? raw : 1
  } catch {
    return 1
  }
}

export default function T212TradeGuide({ instrument, decision, onConfirmLive }: Props) {
  const [stakeIndex, setStakeIndex] = useState(readStakeIndex)
  const [confirmed5m, setConfirmed5m] = useState(false)
  const [confirmed1m, setConfirmed1m] = useState(false)
  const [livePriceText, setLivePriceText] = useState('')
  const stakeEur = STAKE_OPTIONS[stakeIndex]
  useEffect(() => {
    try {
      localStorage.setItem(STAKE_KEY, String(stakeIndex))
    } catch {
      /* ignore */
    }
  }, [stakeIndex])
  useEffect(() => {
    setConfirmed5m(false)
    setConfirmed1m(false)
    setLivePriceText('')
  }, [instrument.id, decision.liveConfirmationRequired])

  const invalidated = decision.positionGuidance === 'SAIR' || decision.positionGuidance === 'REALIZAR_ALVO'
  const enterReady =
    !invalidated
    && (decision.action === 'COMPRAR' || decision.action === 'VENDER')
    && decision.entryTiming === 'AGORA'
    && decision.positionGuidance === 'ENTRAR_AGORA'
  const awaitReady =
    !invalidated
    && (decision.action === 'COMPRAR' || decision.action === 'VENDER')
    && decision.entryTiming === 'RETRACE'
  const isShort = decision.action === 'VENDER'
  const sideLabel = isShort ? 'Sell' : 'Buy'
  const livePrice = Number(livePriceText.trim().replace(',', '.'))
  const validLivePrice = Number.isFinite(livePrice) && livePrice > 0
  const livePriceInsideLevels = validLivePrice
    && decision.stop !== undefined
    && decision.target !== undefined
    && (isShort
      ? livePrice < decision.stop && livePrice > decision.target
      : livePrice > decision.stop && livePrice < decision.target)
  const canConfirmLive = confirmed5m && confirmed1m && livePriceInsideLevels && Boolean(onConfirmLive)
  const riskPct = decision.entry && decision.stop
    ? (Math.abs(decision.entry - decision.stop) / decision.entry) * 100
    : undefined
  const executionState = invalidated
    ? {
        tone: 'blocked',
        title: 'NÃO ENTRAR',
        detail: 'Setup invalidado ou alvo já atingido.',
      }
    : decision.liveConfirmationRequired
      ? {
          tone: 'verify',
          title: 'CONFIRMAR DADOS LIVE',
          detail: `Ainda não entrar · candle 1m ${Number.isFinite(decision.ltfDataAgeMinutes) ? `há ~${Math.round(decision.ltfDataAgeMinutes!)} min` : 'sem idade válida'}.`,
        }
      : enterReady
        ? {
            tone: 'ready',
            title: `${isShort ? 'VENDER' : 'COMPRAR'} AGORA`,
            detail: 'Condições TJR confirmadas. Valida o preço atual antes de enviar.',
          }
        : awaitReady
          ? {
              tone: 'wait',
              title: 'AGUARDAR CONFIRMAÇÃO',
              detail: `Não entrar ainda · falta ${isShort ? 'SHORT JÁ' : 'LONG JÁ'} com BOS/iFVG 1m.`,
            }
          : {
              tone: 'blocked',
              title: 'SEM ENTRADA',
              detail: 'Não existem níveis executáveis neste momento.',
            }

  return (
    <section className="binance-order-panel t212-guide">
      <header className="binance-order-head">
        <div>
          <p className="eyebrow">Trading 212 · CFD</p>
          <h3>{instrument.t212Label} · {tjrActionLabel(decision, { cfd: true })}</h3>
        </div>
        {(enterReady || awaitReady) && !invalidated ? (
          <label className="binance-stake-field" title="Só sugestão de tamanho — não altera o scan">
            <span>Stake €</span>
            <select
              aria-label="Stake euros"
              value={stakeIndex}
              onChange={(event) => setStakeIndex(Number(event.target.value))}
            >
              {STAKE_OPTIONS.map((value, index) => (
                <option key={value} value={index}>{value} €</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="desk-sub">Execução manual — sem API</span>
        )}
      </header>

      <p className="t212-guide-plan">
        Conta <strong>CFD</strong> → pesquisa <strong>{instrument.t212Search}</strong>
        {instrument.kind === 'forex' ? ' (FOREX).'
          : instrument.kind === 'metal' ? ' (metal).'
            : instrument.kind === 'energy' ? ' (energia / crude).'
              : instrument.kind === 'crypto' ? ' (crypto CFD — Buy/Sell na T212, velas Binance).'
                : instrument.kind === 'stock' ? ' (acção US CFD).'
                  : instrument.kind === 'future' ? ' (futuro · executar no CFD índice).'
                    : ' (índice CFD).'}
        {' '}Long = <strong>Buy</strong> · Short = <strong>Sell</strong>.
      </p>

      <div className={`t212-execution-state ${executionState.tone}`} role="status">
        <strong>{executionState.title}</strong>
        <span>{executionState.detail}</span>
      </div>

      {invalidated ? (
        <p className="binance-order-wait">
          <strong>Não entres.</strong> {decision.positionGuidance === 'SAIR'
            ? 'Setup invalidado (BOS contrário ou stop) — isto não é oportunidade de short/long.'
            : 'Alvo atingido — se tinhas posição, realiza; se não, não abras nova.'}
          {' '}Espera um sinal <strong>LONG JÁ</strong> ou <strong>SHORT JÁ</strong>.
        </p>
      ) : decision.liveConfirmationRequired ? (
        <div className="t212-live-confirm">
          <p className="binance-order-wait">
            <strong>CONFIRMAR LIVE — ainda não entres.</strong> O candle 1m recebido tem
            {Number.isFinite(decision.ltfDataAgeMinutes)
              ? ` ~${Math.round(decision.ltfDataAgeMinutes!)} min`
              : ' idade desconhecida'}
            . Valida no gráfico live do Trading 212.
          </p>
          {(enterReady || awaitReady) && (
            <div className="t212-levels">
              <div><span>Lado</span><strong className={isShort ? 'negative' : 'positive'}>{sideLabel}</strong></div>
              <div><span>Entrada</span><strong>{fmt(decision.entry)}</strong></div>
              <div><span>OCO Stop</span><strong className="negative">{fmt(decision.stop)}</strong></div>
              <div><span>OCO TP</span><strong className="positive">{fmt(decision.target)}</strong></div>
            </div>
          )}
          <ol className="t212-steps">
            <li>Abre <strong>{instrument.t212Search}</strong> em candles de <strong>5m</strong>: confirma BOS/iFVG {isShort ? 'bearish' : 'bullish'}.</li>
            <li>Muda para <strong>1m</strong>: confirma retrace + BOS/iFVG na mesma direcção.</li>
            <li>Copia o preço actual exactamente como aparece no T212.</li>
          </ol>
          <label className="t212-live-check">
            <input type="checkbox" checked={confirmed5m} onChange={(event) => setConfirmed5m(event.target.checked)} />
            5m confirmado
          </label>
          <label className="t212-live-check">
            <input type="checkbox" checked={confirmed1m} onChange={(event) => setConfirmed1m(event.target.checked)} />
            1m confirmado
          </label>
          <label className="t212-live-price">
            <span>Preço live T212</span>
            <input
              type="text"
              inputMode="decimal"
              value={livePriceText}
              placeholder={fmt(decision.entry)}
              onChange={(event) => setLivePriceText(event.target.value)}
            />
          </label>
          {validLivePrice && !livePriceInsideLevels && (
            <p className="negative">Preço fora de Stop ↔ TP. O setup antigo já não é executável; não confirmes.</p>
          )}
          <button
            type="button"
            className="primary"
            disabled={!canConfirmLive}
            onClick={() => onConfirmLive?.(instrument.id, livePrice)}
          >
            Confirmar live · válido 2 min
          </button>
          <p className="desk-sub">A confirmação é manual e temporária. Entrada passa a usar o preço live; Stop/TP mantêm os níveis estruturais.</p>
        </div>
      ) : !enterReady && !awaitReady ? (
        <p className="binance-order-wait">Sem níveis — espera LONG JÁ / SHORT JÁ (dias úteis, preferir NY open ~14:30–16:00 Lisboa).</p>
      ) : (
        <>
          {awaitReady && (
            <p className="binance-order-wait">
              Podes preparar os níveis, mas <strong>não envies a ordem</strong> enquanto o cartão estiver em AGUARDAR.
            </p>
          )}
          <div className="t212-levels">
            <div><span>Lado</span><strong className={isShort ? 'negative' : 'positive'}>{sideLabel} ({isShort ? 'short' : 'long'})</strong></div>
            <div><span>Entrada</span><strong>{fmt(decision.entry)}</strong></div>
            <div><span>OCO Stop</span><strong className="negative">{fmt(decision.stop)}</strong></div>
            <div><span>OCO TP</span><strong className="positive">{fmt(decision.target)}</strong></div>
          </div>
          {riskPct !== undefined && (
            <p className="desk-sub">
              R:R {decision.riskReward?.toFixed(1) ?? '—'}× · stop ≈ {riskPct.toFixed(2)}% · stake ~{stakeEur} €
              {enterReady ? ' · Compra/venda agora + OCO no ticket.' : ' · OCO: Stop Loss + Take Profit no mesmo ticket T212.'}
            </p>
          )}
          <ol className="t212-steps">
            <li>Abre Trading 212 → conta <strong>CFD</strong>.</li>
            <li>Pesquisa <strong>{instrument.t212Search}</strong>.</li>
            <li>
              {enterReady
                ? <>Toca <strong>{sideLabel}</strong> ({isShort ? 'short' : 'long'}). Ajusta tamanho ~{stakeEur} €.</>
                : <>Prepara {sideLabel} limite na entrada ({fmt(decision.entry)}) — ainda não confirms mercado.</>}
            </li>
            <li>OCO no ticket: Stop @ {fmt(decision.stop)} · Take profit @ {fmt(decision.target)}.</li>
            <li>Confirma e regista no Diário ({instrument.short}).</li>
          </ol>
          <div className="binance-wizard-footer">
            <button type="button" className="ghost" onClick={() => goToCryptoTab('journal')}>
              Abrir Diário
            </button>
          </div>
        </>
      )}
    </section>
  )
}
