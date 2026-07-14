import { useEffect, useState } from 'react'
import { AGENT_QUOTE_ASSET, BTC_REFERENCE_SYMBOL, formatTradingPair, getCandles, getLiquidMarkets, getPlaybookCandles } from '../../lib/binance'
import { evaluateTjrFull, evaluateTjrQuick, tjrActionLabel, tjrSortRank, type TjrDecision } from '../../lib/tjr-engine'
import PriceChart from '../chart/PriceChart'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import type { Interval } from '../../lib/types'

type AgentRow = TjrDecision & {
  symbol: string
  price: number
  change24h: number
}

const price = (value?: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', maximumFractionDigits: value && value < 1 ? 5 : 2 }).format(value ?? 0)

export default function AgentDashboard() {
  const [rows, setRows] = useState<AgentRow[]>([])
  const [status, setStatus] = useState('Pronto para analisar o mercado.')
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR_JA' | 'AGUARDAR_COMPRA' | 'VENDER' | 'ESPERAR'>('TODAS')
  const [query, setQuery] = useState('')
  const [riskIndex, setRiskIndex] = useState(1)
  const [selected, setSelected] = useState<AgentRow>()
  const [chartInterval, setChartInterval] = useState<Interval>('1h')
  const [loadingFull, setLoadingFull] = useState<string>()
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const riskProfile = profiles[riskIndex]

  useEffect(() => {
    if (!selected) return
    const symbol = selected.symbol
    setLoadingFull(symbol)
    void (async () => {
      try {
        const [data, btc] = await Promise.all([getPlaybookCandles(symbol), getPlaybookCandles(BTC_REFERENCE_SYMBOL)])
        const decision = evaluateTjrFull(symbol, data, btc, riskProfile)
        const patch = (row: AgentRow): AgentRow =>
          row.symbol === symbol ? { ...decision, symbol, price: row.price, change24h: row.change24h } : row
        setRows((prev) => prev.map(patch))
        setSelected((prev) => (prev?.symbol === symbol ? patch(prev) : prev))
      } catch {
        /* scan rápido 1h permanece */
      } finally {
        setLoadingFull(undefined)
      }
    })()
  }, [selected?.symbol, riskProfile])

  const scan = async () => {
    setRunning(true)
    setRows([])
    setSelected(undefined)
    try {
      const [markets, btc1h] = await Promise.all([getLiquidMarkets(10_000), getCandles(BTC_REFERENCE_SYMBOL, '1h')])
      const results: AgentRow[] = []
      for (let index = 0; index < markets.length; index += 5) {
        setStatus(`TJR · ${Math.min(index + 5, markets.length)} / ${markets.length} moedas…`)
        const batch = await Promise.all(markets.slice(index, index + 5).map(async (market) => {
          try {
            const candles1h = await getCandles(market.symbol, '1h')
            const decision = evaluateTjrQuick(market.symbol, candles1h, btc1h, riskProfile)
            const price = candles1h.at(-1)?.close ?? 0
            return { ...decision, symbol: market.symbol, price, change24h: market.priceChangePercent }
          } catch {
            return undefined
          }
        }))
        results.push(...batch.filter((row): row is AgentRow => row !== undefined))
      }
      const sorted = results.sort((left, right) => tjrSortRank(left) - tjrSortRank(right) || (right.riskReward ?? 0) - (left.riskReward ?? 0))
      setRows(sorted)
      setSelected(sorted[0])
      setStatus(`${results.length} moedas analisadas.`)
    } catch {
      setStatus('Não foi possível obter os dados da Binance. Tenta novamente.')
    } finally {
      setRunning(false)
    }
  }

  const counts = {
    COMPRAR_JA: rows.filter((row) => row.action === 'COMPRAR' && row.entryTiming === 'AGORA').length,
    AGUARDAR_COMPRA: rows.filter((row) => row.action === 'COMPRAR' && row.entryTiming === 'RETRACE').length,
    VENDER: rows.filter((row) => row.action === 'VENDER').length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR').length,
  }
  const normalizedQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const visibleRows = rows.filter((row) => {
    const symbolMatch = !normalizedQuery || row.symbol.includes(normalizedQuery) || row.symbol.replace(/USDC$/, '').includes(normalizedQuery)
    if (!symbolMatch) return false
    if (filter === 'TODAS') return true
    if (filter === 'COMPRAR_JA') return row.action === 'COMPRAR' && row.entryTiming === 'AGORA'
    if (filter === 'AGUARDAR_COMPRA') return row.action === 'COMPRAR' && row.entryTiming === 'RETRACE'
    if (filter === 'VENDER') return row.action === 'VENDER'
    return row.action === 'ESPERAR'
  })

  return (
    <main className="agent-shell">
      <header className="agent-header">
        <div><p className="eyebrow">AGENTE TJR · BINANCE SPOT {AGENT_QUOTE_ASSET}</p><h1>O que fazer agora?</h1><p>Pares {AGENT_QUOTE_ASSET} (UE/MiCA): liquidez → confirmação → continuação → SMT vs BTC.</p></div>
        <button onClick={() => void scan()} disabled={running}>{running ? 'A analisar…' : 'Analisar mercado'}</button>
      </header>

      <section className="agent-rules">
        <div><strong>COMPRAR JÁ</strong><span>Preço já está na zona FVG/equilibrium — entrada válida agora.</span></div>
        <div><strong>AGUARDAR COMPRA</strong><span>Setup confirmado, mas espera retrace à zona antes de entrar.</span></div>
        <div><strong>VENDER / SAIR</strong><span>BOS contrário no 15m/5m, stop atingido ou alvo — o agente deteta automaticamente.</span></div>
        <div><strong>ESPERAR</strong><span>Sem setup completo ou R:R insuficiente.</span></div>
      </section>
      <section className="risk-control">
        <div><strong title="Define quão exigente é o agente antes de emitir COMPRAR.">Risco: {riskProfiles[riskProfile].label}</strong><p>{riskProfiles[riskProfile].description}</p></div>
        <input aria-label="Perfil de risco" type="range" min="0" max="2" step="1" value={riskIndex} onChange={(event) => setRiskIndex(Number(event.target.value))} />
        <div className="risk-labels"><span>Conservador</span><span>Equilibrado</span><span>Agressivo</span></div>
      </section>

      <p className="agent-status">{status}</p>
      {rows.length > 0 && <>
        <section className="agent-summary">
          <button className={filter === 'TODAS' ? 'active' : ''} onClick={() => setFilter('TODAS')}>Todas <span>{rows.length}</span></button>
          <button className={filter === 'COMPRAR_JA' ? 'active buy' : 'buy'} onClick={() => setFilter('COMPRAR_JA')}>Comprar já <span>{counts.COMPRAR_JA}</span></button>
          <button className={filter === 'AGUARDAR_COMPRA' ? 'active watch' : 'watch'} onClick={() => setFilter('AGUARDAR_COMPRA')}>Aguardar compra <span>{counts.AGUARDAR_COMPRA}</span></button>
          <button className={filter === 'VENDER' ? 'active sell' : 'sell'} onClick={() => setFilter('VENDER')}>Vender <span>{counts.VENDER}</span></button>
          <button className={filter === 'ESPERAR' ? 'active wait' : 'wait'} onClick={() => setFilter('ESPERAR')}>Esperar <span>{counts.ESPERAR}</span></button>
          <label>Pesquisar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Ex.: BTC/${AGENT_QUOTE_ASSET}`} /></label>
        </section>
        <section className="decision-list">
        {visibleRows.map((row) => (
          <div className="decision-item" key={row.symbol}>
            <article
              className={`decision-card ${row.positionGuidance === 'SAIR' ? 'vender invalidated' : row.action.toLowerCase()} ${selected?.symbol === row.symbol ? 'selected' : ''}`}
              onClick={() => setSelected(selected?.symbol === row.symbol ? undefined : row)}
              tabIndex={0}
              title="Clica para abrir ou fechar o gráfico desta moeda."
            >
              <div className="decision-top">
                <div><p>{formatTradingPair(row.symbol)}</p><strong className={`timing-${row.entryTiming.toLowerCase()}`}>{tjrActionLabel(row)}</strong></div>
                <span>{row.setupStatus} · {row.confidence}</span>
              </div>
              <p className="decision-price">{price(row.price)} <span className={row.change24h >= 0 ? 'positive' : 'negative'}>{row.change24h.toFixed(1)}% hoje</span></p>
              <p>{row.reasons[0]}</p>
              <dl>
                <div><dt>{row.entryTiming === 'RETRACE' ? 'Zona entrada' : 'Entrada'}</dt><dd>{price(row.entry)}</dd></div>
                <div><dt>Stop</dt><dd>{price(row.stop)}</dd></div>
                <div><dt>Alvo (venda)</dt><dd>{price(row.target)}</dd></div>
                <div><dt>Risco/retorno</dt><dd>{row.riskReward?.toFixed(1) ?? '—'}×</dd></div>
              </dl>
            </article>
            {selected?.symbol === row.symbol && (
              <section className="card-expanded">
                <article className="chart-panel">
                  <header>
                    <div><p className="eyebrow">{formatTradingPair(row.symbol)}</p><h2>{tjrActionLabel(row)} · {row.confidence} confiança</h2></div>
                    <span title="Scan rápido em 1h; ao expandir refina com 4h/1h/15m/5m.">
                      {loadingFull === row.symbol ? 'A refinar MTF…' : `Execução: ${row.executionInterval ?? '15m'} · gráfico: ${chartInterval}`}
                    </span>
                  </header>
                  <PriceChart symbol={row.symbol} action={row.action} interval={chartInterval} onIntervalChange={setChartInterval} entry={row.entry} stop={row.stop} target={row.target} zones={row.zones} />
                </article>
                <aside className="evidence-panel">
                  <h2>Checklist TJR</h2>
                  <section className="bos-guide">
                    <h3>Como ler BOS (Break of Structure)</h3>
                    <p><strong>Long:</strong> válido enquanto o close no {row.executionInterval ?? '15m'} <em>não</em> fechar abaixo do último swing low. Se fechar abaixo → <strong>SAIR — INVALIDADO</strong>.</p>
                    <p><strong>Short / sair:</strong> válido enquanto o close <em>não</em> fechar acima do último swing high.</p>
                    <p>Re-analisa após comprar: se o cartão mudar para <strong>SAIR — INVALIDADO</strong>, vende — não esperes só pelo alvo.</p>
                  </section>
                  <p><strong>Bias:</strong> {row.bias === 'bullish' ? 'Altista' : row.bias === 'bearish' ? 'Baixista' : 'Neutro'} · <strong>Timing:</strong> {row.entryTiming === 'AGORA' ? 'Entrar agora' : row.entryTiming === 'RETRACE' ? 'Aguardar retrace' : 'Sem entrada'}{row.positionGuidance === 'SAIR' && ' · ⚠ Invalidado'}{row.positionGuidance === 'REALIZAR_ALVO' && ' · ✓ Alvo atingido'}</p>
                  {row.invalidationReason && (row.positionGuidance === 'SAIR' || row.positionGuidance === 'REALIZAR_ALVO') && (
                    <p className="invalidation-alert"><strong>{tjrActionLabel(row)}:</strong> {row.invalidationReason}</p>
                  )}
                  {row.entryZone && row.entryTiming === 'RETRACE' && (
                    <p><strong>Zona de entrada:</strong> {price(row.entryZone.low)} – {price(row.entryZone.high)}</p>
                  )}
                  <ul className="tjr-checklist">
                    {row.checklist.map((item) => (
                      <li key={item.label} className={item.complete ? 'done' : 'pending'}>
                        <span>{item.complete ? '✓' : '○'}</span>
                        <div><strong>{item.label}</strong><p>{item.note}</p></div>
                      </li>
                    ))}
                  </ul>
                  {row.reasons[0] && <p><strong>Resumo:</strong> {row.reasons.join(' ')}</p>}
                  {row.exitPlan && (
                    <section className="exit-plan">
                      <h3>Plano de saída (depois de comprar)</h3>
                      <p>{row.exitPlan.note}</p>
                      <dl>
                        <div><dt>Stop-loss</dt><dd>{price(row.exitPlan.stopLoss)}</dd></div>
                        <div><dt>Take-profit</dt><dd>{price(row.exitPlan.takeProfit)}</dd></div>
                      </dl>
                      <ol className="exit-steps">
                        {row.exitPlan.steps.map((step) => <li key={step}>{step}</li>)}
                      </ol>
                    </section>
                  )}
                  <dl>
                    <div><dt title="Preço de referência da ideia.">{row.entryTiming === 'RETRACE' ? 'Zona entrada ⓘ' : 'Entrada ⓘ'}</dt><dd>{price(row.entry)}</dd></div>
                    <div><dt title="Invalidação abaixo/acima do swing.">Stop ⓘ</dt><dd>{price(row.stop)}</dd></div>
                    <div><dt title="Liquidez oposta (sessão/swing/dia anterior).">Alvo ⓘ</dt><dd>{price(row.target)}</dd></div>
                  </dl>
                </aside>
              </section>
            )}
          </div>
        ))}
      </section></>}

      <section className="agent-disclaimer"><strong>Importante:</strong> sinal técnico, não garantia. Não executa ordens, não usa Futures nem alavancagem. Define o teu risco antes de agir.</section>
    </main>
  )
}
