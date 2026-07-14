import { AGENT_QUOTE_ASSET, formatTradingPair } from '../../lib/binance'
import { tjrActionLabel, type TjrDecision } from '../../lib/tjr-engine'

type Row = TjrDecision & { symbol: string; price: number }

export const STAKE_OPTIONS = [10, 20, 50, 100] as const
export const DEFAULT_STAKE = 20

type GuideProps = { row: Row; stakeUsdc?: number }

const baseAsset = (symbol: string) => symbol.replace(new RegExp(`${AGENT_QUOTE_ASSET}$`), '')

/** Preços copiáveis para a Binance (sem símbolo €). */
export const binancePrice = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.01) return value.toFixed(4)
  return value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') || value.toPrecision(4)
}

export const suggestedQuantity = (entry?: number, stake = DEFAULT_STAKE) => {
  if (!entry || entry <= 0) return undefined
  return Math.floor(stake / entry)
}

const copyText = (value: string) => {
  if (value === '—') return
  void navigator.clipboard.writeText(value)
}

function CopyField({ label, value, tone = 'neutral', hint }: { label: string; value: string; tone?: 'buy' | 'sell' | 'neutral'; hint?: string }) {
  return (
    <button type="button" className={`binance-field binance-field-${tone}`} onClick={() => copyText(value)} title="Clica para copiar">
      <span>{label}</span>
      <code>{value}</code>
      {hint && <small>{hint}</small>}
    </button>
  )
}

/** Valores exactos para colar na Binance — layout compacto, sem scroll. */
export function BinanceOrderPanel({ row, stakeUsdc = DEFAULT_STAKE }: GuideProps) {
  const pair = formatTradingPair(row.symbol)
  const base = baseAsset(row.symbol)
  const qty = suggestedQuantity(row.entry, stakeUsdc)
  const qtyLabel = qty ? qty.toLocaleString('pt-PT') : '—'
  const entry = binancePrice(row.entry)
  const stop = binancePrice(row.stop)
  const target = binancePrice(row.target)
  const stopLimit = row.stop !== undefined ? binancePrice(row.stop * 0.999) : '—'
  const orderTotal = row.entry && qty ? (row.entry * qty).toFixed(2) : '—'
  const label = tjrActionLabel(row)

  if (row.positionGuidance === 'SAIR' || row.positionGuidance === 'REALIZAR_ALVO') {
    return (
      <section className="binance-order-panel">
        <header className="binance-order-head">
          <div><strong>{pair}</strong> · {label}</div>
          <span>Clica num valor para copiar</span>
        </header>
        <div className="binance-order-groups single">
          <div className="binance-order-group">
            <p className="binance-group-title sell">Vender agora (Spot)</p>
            <CopyField label="Tipo" value="Mercado" tone="sell" hint="Vender → Mercado → 100%" />
            <CopyField label={`Amount (${base})`} value="100%" tone="sell" hint="Ou quantidade total da posição" />
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
  const buyPriceHint = row.entryTiming === 'AGORA' ? 'Comprar → Mercado' : `Comprar → Limite @ ${entry}`

  return (
    <section className="binance-order-panel">
      <header className="binance-order-head">
        <div><strong>{pair}</strong> · {label} · {stakeUsdc} {AGENT_QUOTE_ASSET}</div>
        <span>Clica num valor para copiar → cola na Binance</span>
      </header>
      <div className="binance-order-groups">
        <div className="binance-order-group">
          <p className="binance-group-title buy">1 · Comprar (Spot)</p>
          <CopyField label="Tipo" value={buyType} tone="buy" hint={buyPriceHint} />
          {row.entryTiming === 'RETRACE' && <CopyField label={`Preço limite (${AGENT_QUOTE_ASSET})`} value={entry} tone="buy" />}
          <CopyField label={`Amount (${base})`} value={qtyLabel} tone="buy" />
          <CopyField label={`Total (${AGENT_QUOTE_ASSET})`} value={orderTotal} tone="buy" hint={Number(orderTotal) < 1 ? 'Mínimo 1 USDC' : undefined} />
        </div>
        <div className="binance-order-group">
          <p className="binance-group-title sell">2 · Proteger — OCO (Vender)</p>
          <CopyField label={`TP Limit (${AGENT_QUOTE_ASSET})`} value={target} tone="sell" hint="Take Profit" />
          <CopyField label={`SL Trigger (${AGENT_QUOTE_ASSET})`} value={stop} tone="sell" hint="Stop Loss trigger" />
          <CopyField label={`SL Limit (${AGENT_QUOTE_ASSET})`} value={stopLimit} tone="sell" hint="≤ trigger" />
          <CopyField label={`Amount (${base})`} value={qtyLabel} tone="sell" hint="100% · Fill Amount" />
        </div>
      </div>
      <p className="binance-order-foot">Alternativa sem OCO: Limit @ {target} + Stop-Limit {stop}/{stopLimit}. Se uma executar, cancela a outra.</p>
    </section>
  )
}

export function BinanceGuideTeaser({ row, stakeUsdc = DEFAULT_STAKE }: GuideProps) {
  if (row.action === 'ESPERAR' && row.positionGuidance !== 'SAIR') return null
  const pair = formatTradingPair(row.symbol)
  const label = tjrActionLabel(row)
  const qty = suggestedQuantity(row.entry, stakeUsdc)
  return (
    <p className="binance-teaser">
      Binance: <strong>{pair}</strong> · {label}
      {qty !== undefined && row.action === 'COMPRAR' && (
        <> · TP {binancePrice(row.target)} · SL {binancePrice(row.stop)} · {qty.toLocaleString('pt-PT')} {baseAsset(row.symbol)}</>
      )}
    </p>
  )
}

export default function BinanceTradeGuide({ row, stakeUsdc = DEFAULT_STAKE }: GuideProps) {
  return <BinanceOrderPanel row={row} stakeUsdc={stakeUsdc} />
}
