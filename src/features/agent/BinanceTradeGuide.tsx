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

const suggestedQuantity = (entry?: number, stake = DEFAULT_STAKE) => {
  if (!entry || entry <= 0) return undefined
  return Math.floor(stake / entry)
}

type Step = { title: string; body: string }

function buildSteps(row: Row, stake: number): Step[] {
  const pair = formatTradingPair(row.symbol)
  const base = baseAsset(row.symbol)
  const entry = binancePrice(row.entry)
  const stop = binancePrice(row.stop)
  const target = binancePrice(row.target)
  const stopLimit = row.stop !== undefined ? binancePrice(row.stop * 0.999) : '—'
  const qty = suggestedQuantity(row.entry, stake)
  const orderTotal = row.entry && qty ? row.entry * qty : 0
  const qtyLabel = qty ? `${qty.toLocaleString('pt-PT')} ${base}` : `≈ ${stake} ${AGENT_QUOTE_ASSET} ÷ ${entry}`
  const minNote = orderTotal > 0 && orderTotal < 1 ? ' Atenção: total abaixo de 1 USDC — aumenta o montante.' : ''

  if (row.positionGuidance === 'SAIR' || row.positionGuidance === 'REALIZAR_ALVO') {
    return [
      { title: '1. Abre Spot', body: `Trade → Spot → ${pair}` },
      { title: '2. Vende agora', body: `Vender → Mercado (Market) → 100% da posição em ${base}. Motivo: ${tjrActionLabel(row)}.` },
      { title: '3. Cancela ordens', body: 'Open Orders → Cancel All (ordens OCO/limit antigas).' },
    ]
  }

  if (row.action === 'ESPERAR' || row.entryTiming === 'NENHUM') {
    return [
      { title: 'Ainda não entres', body: 'Setup incompleto ou invalidado. Espera até o cartão mostrar COMPRAR JÁ ou AGUARDAR COMPRA.' },
      { title: 'Prepara a conta', body: `Carteiras → Spot → tens ${AGENT_QUOTE_ASSET}? (converte EUR se precisares). Activa desconto BNB nas Fees.` },
    ]
  }

  const buyStep =
    row.entryTiming === 'AGORA'
      ? { title: '3. Comprar', body: `Comprar → Mercado (Market) ou Limite a ${entry}. Quantidade sugerida (${stake} ${AGENT_QUOTE_ASSET}): ${qtyLabel}.${minNote} Não uses todo o saldo numa trade.` }
      : { title: '3. Ordem limit (aguardar)', body: `Comprar → Limite a ${entry} (zona FVG/equilibrium). Quantidade (${stake} ${AGENT_QUOTE_ASSET}): ${qtyLabel}.${minNote} Só executa quando o preço chegar à zona.` }

  return [
    { title: '1. Saldo', body: `Carteiras → Spot → confirma ${AGENT_QUOTE_ASSET}. Se só tens EUR: Converter → EUR → ${AGENT_QUOTE_ASSET}.` },
    { title: '2. Par', body: `Trade → Spot → pesquisa ${base} → ${pair} (não Futures, não USDT).` },
    buyStep,
    {
      title: '4. Proteger (OCO ou 2 ordens)',
      body: `Vender → OCO → TP ${target} · Stop ${stop} · Limit ${stopLimit} · Amount 100%. Mínimo 1 ${AGENT_QUOTE_ASSET} — preenche quantidade até Total ≥ 1. Alternativa: Limit ${target} + Stop-Limit ${stop}/${stopLimit}.`,
    },
    {
      title: '5. Confirmar',
      body: 'Toca SELL → Confirmar. Open Orders deve mostrar 1 OCO ou 2 ordens. Se uma executar, cancela a outra.',
    },
    {
      title: '6. Depois',
      body: 'Não mexas. Re-analisa 1–2×/dia. Se passar a SAIR — INVALIDADO, vende manualmente.',
    },
  ]
}

export function BinanceGuideTeaser({ row, stakeUsdc = DEFAULT_STAKE }: GuideProps) {
  if (row.action === 'ESPERAR' && row.positionGuidance !== 'SAIR') return null
  const pair = formatTradingPair(row.symbol)
  const label = tjrActionLabel(row)
  const qty = suggestedQuantity(row.entry, stakeUsdc)
  return (
    <p className="binance-teaser">
      Binance Spot: <strong>{pair}</strong> · {label}
      {qty !== undefined && row.action === 'COMPRAR' && (
        <> · ~{qty.toLocaleString('pt-PT')} {baseAsset(row.symbol)} ({stakeUsdc} {AGENT_QUOTE_ASSET})</>
      )}
    </p>
  )
}

export default function BinanceTradeGuide({ row, stakeUsdc = DEFAULT_STAKE }: GuideProps) {
  const steps = buildSteps(row, stakeUsdc)
  const pair = formatTradingPair(row.symbol)
  const qty = suggestedQuantity(row.entry, stakeUsdc)
  const orderTotal = row.entry && qty ? row.entry * qty : 0

  return (
    <section className="binance-guide">
      <h3>Como executar na Binance</h3>
      <p className="binance-guide-intro">
        Spot <strong>{pair}</strong> · {tjrActionLabel(row)} · valores prontos a copiar.
      </p>
      {(row.action === 'COMPRAR' || row.action === 'VENDER') && row.entry && (
        <dl className="binance-copy-values">
          <div><dt>Entrada</dt><dd><code>{binancePrice(row.entry)}</code></dd></div>
          <div><dt>Stop</dt><dd><code>{binancePrice(row.stop)}</code></dd></div>
          <div><dt>Alvo</dt><dd><code>{binancePrice(row.target)}</code></dd></div>
          {qty && row.action === 'COMPRAR' && (
            <div><dt>Qtd. ({stakeUsdc} {AGENT_QUOTE_ASSET})</dt><dd><code>{qty.toLocaleString('pt-PT')}</code></dd></div>
          )}
          {orderTotal > 0 && row.action === 'COMPRAR' && (
            <div><dt>Total estimado</dt><dd className={orderTotal < 1 ? 'warn' : ''}><code>{orderTotal.toFixed(2)} {AGENT_QUOTE_ASSET}</code></dd></div>
          )}
        </dl>
      )}
      <ol className="binance-steps">
        {steps.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
