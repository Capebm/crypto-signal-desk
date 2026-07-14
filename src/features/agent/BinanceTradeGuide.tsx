import { AGENT_QUOTE_ASSET, formatTradingPair } from '../../lib/binance'
import { tjrActionLabel, type TjrDecision } from '../../lib/tjr-engine'

type Row = TjrDecision & { symbol: string; price: number }

const DEFAULT_STAKE = 20

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

function buildSteps(row: Row): Step[] {
  const pair = formatTradingPair(row.symbol)
  const base = baseAsset(row.symbol)
  const entry = binancePrice(row.entry)
  const stop = binancePrice(row.stop)
  const target = binancePrice(row.target)
  const stopLimit = row.stop !== undefined ? binancePrice(row.stop * 0.999) : '—'
  const qty = suggestedQuantity(row.entry)
  const qtyLabel = qty ? `${qty.toLocaleString('pt-PT')} ${base}` : `≈ ${DEFAULT_STAKE} ${AGENT_QUOTE_ASSET} ÷ ${entry}`

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
      ? { title: '3. Comprar', body: `Comprar → Mercado (Market) ou Limite a ${entry}. Quantidade sugerida (~${DEFAULT_STAKE} ${AGENT_QUOTE_ASSET}): ${qtyLabel}. Não uses todo o saldo numa trade.` }
      : { title: '3. Ordem limit (aguardar)', body: `Comprar → Limite a ${entry} (zona FVG/equilibrium). Quantidade: ${qtyLabel}. Só executa quando o preço chegar à zona.` }

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

export function BinanceGuideTeaser({ row }: { row: Row }) {
  if (row.action === 'ESPERAR' && row.positionGuidance !== 'SAIR') return null
  const pair = formatTradingPair(row.symbol)
  const label = tjrActionLabel(row)
  return (
    <p className="binance-teaser">
      Binance Spot: <strong>{pair}</strong> · {label}
      {row.entryTiming === 'AGORA' && row.entry !== undefined && (
        <> · ~{suggestedQuantity(row.entry)?.toLocaleString('pt-PT')} {baseAsset(row.symbol)}</>
      )}
    </p>
  )
}

export default function BinanceTradeGuide({ row }: { row: Row }) {
  const steps = buildSteps(row)
  const pair = formatTradingPair(row.symbol)
  const qty = suggestedQuantity(row.entry)

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
            <div><dt>Qtd. sugerida (~{DEFAULT_STAKE} {AGENT_QUOTE_ASSET})</dt><dd><code>{qty.toLocaleString('pt-PT')}</code></dd></div>
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
