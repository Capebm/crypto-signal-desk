import { useState } from 'react'
import { AGENT_QUOTE_ASSET, formatTradingPair } from '../../lib/binance'
import {
  binancePriceCopy,
  binancePriceDisplay,
  binanceStopLimitCopy,
} from '../../lib/binance-prices'
import { tjrActionLabel, type TjrDecision } from '../../lib/tjr-engine'
import { tpModeMeta, type TpMode } from '../../lib/tp-mode'

type Row = TjrDecision & { symbol: string; price: number }

export const STAKE_OPTIONS = [10, 20, 50, 100] as const
export const DEFAULT_STAKE = 20

type GuideProps = { row: Row; stakeUsdc?: number; analysisReady?: boolean; refining?: boolean; tpMode?: TpMode }

const baseAsset = (symbol: string) => symbol.replace(new RegExp(`${AGENT_QUOTE_ASSET}$`), '')

function roundForBinance(value: number): number {
  if (value >= 1) return Math.round(value * 100) / 100
  if (value >= 0.1) return Math.round(value * 1000) / 1000
  if (value >= 0.01) return Math.round(value * 10000) / 10000
  return Math.round(value * 100000) / 100000
}

/** @deprecated use binancePriceCopy from binance-prices */
export const binancePrice = binancePriceCopy

export const suggestedQuantity = (entry?: number, stake = DEFAULT_STAKE) => {
  if (!entry || entry <= 0) return undefined
  return Math.floor(stake / entry)
}

async function copyText(value: string): Promise<boolean> {
  if (value === '—') return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = value
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  }
}

function CopyField({
  label,
  copyValue,
  displayValue,
  tone = 'neutral',
  hint,
}: {
  label: string
  copyValue: string
  displayValue?: string
  tone?: 'buy' | 'sell' | 'neutral'
  hint?: string
}) {
  const [copied, setCopied] = useState(false)
  const display = displayValue ?? copyValue

  return (
    <button
      type="button"
      className={`binance-field binance-field-${tone}${copied ? ' binance-field-copied' : ''}`}
      onClick={() => {
        void copyText(copyValue).then((ok) => {
          if (!ok) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        })
      }}
      title="Clica para copiar (formato Binance)"
    >
      <span>{label}</span>
      <code>{display}</code>
      <small>{copied ? 'Copiado ✓' : hint ?? 'Clica para copiar'}</small>
    </button>
  )
}

/** Valores exactos para colar na Binance — layout compacto, sem scroll. */
export function BinanceOrderPanel({ row, stakeUsdc = DEFAULT_STAKE, analysisReady = true, refining = false, tpMode = '1_5r' }: GuideProps) {
  const pair = formatTradingPair(row.symbol)
  const base = baseAsset(row.symbol)
  const qty = suggestedQuantity(row.entry, stakeUsdc)
  const qtyCopy = qty ? String(qty) : '—'
  const qtyDisplay = qty ? qty.toLocaleString('pt-PT') : '—'
  const partialQty = qty ? Math.max(1, Math.floor(qty / 2)) : undefined
  const partialQtyCopy = partialQty ? String(partialQty) : '—'
  const restQty = qty && partialQty ? qty - partialQty : undefined
  const restQtyCopy = restQty ? String(restQty) : '—'
  const entryCopy = binancePriceCopy(row.entry)
  const zoneLowCopy = row.entryZone ? binancePriceCopy(row.entryZone.low) : undefined
  const zoneHighCopy = row.entryZone ? binancePriceCopy(row.entryZone.high) : undefined
  const stopCopy = binancePriceCopy(row.stop)
  const targetCopy = binancePriceCopy(row.target)
  const target2Copy = binancePriceCopy(row.targetSecondary)
  const stopLimitCopy = binanceStopLimitCopy(row.stop)
  const stopLimitDisplay = stopLimitCopy === '—' ? '—' : stopLimitCopy.replace('.', ',')
  const orderTotalCopy = row.entry && qty ? (roundForBinance(row.entry * qty)).toFixed(2) : '—'
  const orderTotalDisplay = orderTotalCopy.replace('.', ',')
  const label = tjrActionLabel(row)
  const hasPartialTp = tpMode === 'liquidez' && row.targetSecondary !== undefined && partialQty !== undefined && restQty !== undefined
  const tp1Label = row.targetLabel ? `TP1 · ${row.targetLabel}` : 'TP1 · liquidez'
  const tp2Label = row.targetSecondaryLabel ? `TP2 · ${row.targetSecondaryLabel}` : 'TP2 · liquidez'
  const stopDistancePct =
    row.entry && row.stop && row.entry > row.stop
      ? ((row.entry - row.stop) / row.entry) * 100
      : undefined
  const stopTooTight = stopDistancePct !== undefined && stopDistancePct < 3.2

  if (!analysisReady || refining) {
    return (
      <section className="binance-order-panel muted refining">
        <header className="binance-order-head">
          <div><strong>{pair}</strong> · {label}</div>
          <span className="refine-badge">{refining ? 'A refinar MTF…' : 'MTF pendente'}</span>
        </header>
        <p className="binance-order-wait">
          A refinar análise 4h/5m/15m… Aguarda antes de copiar valores para a Binance.
        </p>
      </section>
    )
  }

  if (row.positionGuidance === 'SAIR' || row.positionGuidance === 'REALIZAR_ALVO') {
    return (
      <section className="binance-order-panel">
        <header className="binance-order-head">
          <div><strong>{pair}</strong> · {label}</div>
          <span>Clica num valor → copia para a Binance</span>
        </header>
        <div className="binance-order-groups single">
          <div className="binance-order-group">
            <p className="binance-group-title sell">Vender agora (Spot)</p>
            <CopyField label="Tipo" copyValue="Mercado" tone="sell" hint="Vender → Mercado → 100%" />
            <CopyField label={`Amount (${base})`} copyValue="100%" tone="sell" hint="Ou quantidade total da posição" />
          </div>
        </div>
      </section>
    )
  }

  if (row.action === 'ESPERAR' || row.entryTiming === 'NENHUM') {
    return (
      <section className="binance-order-panel muted">
        <header className="binance-order-head">
          <div><strong>{pair}</strong> · {label}</div>
        </header>
        <p className="binance-order-wait">Sem valores — setup incompleto. Espera COMPRAR JÁ ou AGUARDAR COMPRA.</p>
      </section>
    )
  }

  const buyType = row.entryTiming === 'AGORA' ? 'Mercado' : 'Limite'
  const buyPriceHint = row.entryTiming === 'AGORA'
    ? 'Sweep confirmado — Comprar → Mercado'
    : row.entryZone
      ? `Limite na zona FVG/EQ (${binancePriceDisplay(row.entryZone.low)}–${binancePriceDisplay(row.entryZone.high)})`
      : `Comprar → Limite @ ${binancePriceDisplay(row.entry)}`

  return (
    <section className="binance-order-panel">
      <header className="binance-order-head">
        <div><strong>{pair}</strong> · {label} · {stakeUsdc} {AGENT_QUOTE_ASSET}</div>
        <span>Ecrã: vírgula · Copiar: ponto (Binance)</span>
      </header>
      <p className="binance-tjr-plan">
        <strong>Plano TJR:</strong>{' '}
        {row.entryTiming === 'AGORA'
          ? 'Entrada após sweep + BOS 1m (mercado).'
          : 'Entrada no retrace à zona de discount (limite).'}
        {' '}
        Saída em {tpMode === 'liquidez' ? 'draws HTF (baixa resistência)' : `${tpModeMeta[tpMode].short} fixo`}.
      </p>
      {stopTooTight ? (
        <p className="binance-order-warn">
          Stop a apenas {stopDistancePct!.toFixed(1).replace('.', ',')}% da entrada — em altcoins isso dispara em minutos. A app agora usa mínimo 3,5%.
        </p>
      ) : stopDistancePct !== undefined ? (
        <p className="binance-order-meta">Risco até stop: ~{stopDistancePct.toFixed(1).replace('.', ',')}%</p>
      ) : null}
      <div className={`binance-order-groups${hasPartialTp ? ' partial-tp' : ''}`}>
        <div className="binance-order-group">
          <p className="binance-group-title buy">1 · Comprar (Spot)</p>
          <CopyField label="Tipo" copyValue={buyType} tone="buy" hint={buyPriceHint} />
          {row.entryTiming === 'RETRACE' && row.entryZone && zoneLowCopy && zoneHighCopy && (
            <>
              <CopyField
                label={`Limite baixo (${AGENT_QUOTE_ASSET})`}
                copyValue={zoneLowCopy}
                displayValue={binancePriceDisplay(row.entryZone.low)}
                tone="buy"
                hint="Conservador — fundo da zona"
              />
              <CopyField
                label={`Limite médio (${AGENT_QUOTE_ASSET})`}
                copyValue={entryCopy}
                displayValue={binancePriceDisplay(row.entry)}
                tone="buy"
                hint="Equilibrado — meio da zona"
              />
              <CopyField
                label={`Limite alto (${AGENT_QUOTE_ASSET})`}
                copyValue={zoneHighCopy}
                displayValue={binancePriceDisplay(row.entryZone.high)}
                tone="buy"
                hint="Agressivo — topo da zona"
              />
            </>
          )}
          {row.entryTiming === 'RETRACE' && !row.entryZone && (
            <CopyField
              label={`Preço limite (${AGENT_QUOTE_ASSET})`}
              copyValue={entryCopy}
              displayValue={binancePriceDisplay(row.entry)}
              tone="buy"
            />
          )}
          <CopyField label={`Amount (${base})`} copyValue={qtyCopy} displayValue={qtyDisplay} tone="buy" />
          <CopyField
            label={`Total (${AGENT_QUOTE_ASSET})`}
            copyValue={orderTotalCopy}
            displayValue={orderTotalDisplay}
            tone="buy"
            hint={Number(orderTotalCopy) < 1 ? 'Mínimo 1 USDC' : undefined}
          />
        </div>
        {hasPartialTp ? (
          <>
            <div className="binance-order-group">
              <p className="binance-group-title sell">2 · OCO 50% ({tp1Label})</p>
              <CopyField
                label={`TP Limit (${AGENT_QUOTE_ASSET})`}
                copyValue={targetCopy}
                displayValue={binancePriceDisplay(row.target)}
                tone="sell"
                hint="1.º draw HTF"
              />
              <CopyField
                label={`SL Trigger (${AGENT_QUOTE_ASSET})`}
                copyValue={stopCopy}
                displayValue={binancePriceDisplay(row.stop)}
                tone="sell"
                hint="Stop Loss trigger"
              />
              <CopyField
                label={`SL Limit (${AGENT_QUOTE_ASSET})`}
                copyValue={stopLimitCopy}
                displayValue={stopLimitDisplay}
                tone="sell"
                hint="< trigger (1 tick)"
              />
              <CopyField label={`Amount (${base})`} copyValue={partialQtyCopy} displayValue={partialQtyCopy} tone="sell" hint="~50% da posição" />
            </div>
            <div className="binance-order-group binance-order-group-wide">
              <p className="binance-group-title sell">3 · Limit 50% ({tp2Label})</p>
              <CopyField
                label={`TP Limit (${AGENT_QUOTE_ASSET})`}
                copyValue={target2Copy}
                displayValue={binancePriceDisplay(row.targetSecondary)}
                tone="sell"
                hint="2.º draw HTF — coloca após fill"
              />
              <CopyField label={`Amount (${base})`} copyValue={restQtyCopy} displayValue={restQtyCopy} tone="sell" hint="Resto da posição" />
              <CopyField label="Tipo" copyValue="Limite" tone="sell" hint="Vender → Limite (sem OCO)" />
            </div>
          </>
        ) : (
        <div className="binance-order-group">
          <p className="binance-group-title sell">2 · Proteger — OCO (Vender)</p>
          <CopyField
            label={`TP Limit (${AGENT_QUOTE_ASSET})`}
            copyValue={targetCopy}
            displayValue={binancePriceDisplay(row.target)}
            tone="sell"
            hint={row.targetLabel ? row.targetLabel : 'Take Profit'}
          />
          <CopyField
            label={`SL Trigger (${AGENT_QUOTE_ASSET})`}
            copyValue={stopCopy}
            displayValue={binancePriceDisplay(row.stop)}
            tone="sell"
            hint="Stop Loss trigger"
          />
          <CopyField
            label={`SL Limit (${AGENT_QUOTE_ASSET})`}
            copyValue={stopLimitCopy}
            displayValue={stopLimitDisplay}
            tone="sell"
            hint="< trigger (1 tick)"
          />
          <CopyField label={`Amount (${base})`} copyValue={qtyCopy} displayValue={qtyDisplay} tone="sell" hint="100% · Fill Amount" />
        </div>
        )}
      </div>
      <p className="binance-order-foot">
        {hasPartialTp
          ? 'TJR: realiza metade no 1.º draw HTF (OCO) e metade no 2.º. Se TP1 executar, mantém stop no resto ou sobe para breakeven.'
          : `Alternativa sem OCO: Limit @ ${binancePriceDisplay(row.target)} + Stop-Limit ${binancePriceDisplay(row.stop)}/${stopLimitDisplay}. Se uma executar, cancela a outra.`}
      </p>
    </section>
  )
}

export function BinanceGuideTeaser({ row, tpMode = '1_5r' }: GuideProps) {
  if (row.action === 'ESPERAR' && row.positionGuidance !== 'SAIR') return null
  const pair = formatTradingPair(row.symbol)
  const label = tjrActionLabel(row)
  const targetHint = row.targetLabel
    ? ` · alvo ${row.targetLabel}${row.targetSecondaryLabel ? ` → ${row.targetSecondaryLabel}` : ''}`
    : tpMode === 'liquidez' ? ' · saída liquidez HTF' : ''
  return (
    <p className="binance-teaser">
      Binance: <strong>{pair}</strong> · {label}
      {row.action === 'COMPRAR' && <>{targetHint} · expande para valores MTF</>}
    </p>
  )
}

export default function BinanceTradeGuide({ row, stakeUsdc = DEFAULT_STAKE }: GuideProps) {
  return <BinanceOrderPanel row={row} stakeUsdc={stakeUsdc} />
}
