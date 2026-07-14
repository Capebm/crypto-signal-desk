import { useEffect, useState } from 'react'
import { getCandles, getLiquidUsdtMarkets, getPlaybookCandles } from '../../lib/binance'
import { evaluateTjrFull, evaluateTjrQuick, type TjrDecision } from '../../lib/tjr-engine'
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
  const [filter, setFilter] = useState<'TODAS' | 'COMPRAR' | 'VENDER' | 'ESPERAR'>('TODAS')
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
        const [data, btc] = await Promise.all([getPlaybookCandles(symbol), getPlaybookCandles('BTCUSDT')])
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
      const [markets, btc1h] = await Promise.all([getLiquidUsdtMarkets(10_000), getCandles('BTCUSDT', '1h')])
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
      const rank = { COMPRAR: 0, VENDER: 1, ESPERAR: 2 }
      const sorted = results.sort((left, right) => rank[left.action] - rank[right.action] || (right.riskReward ?? 0) - (left.riskReward ?? 0))
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
    COMPRAR: rows.filter((row) => row.action === 'COMPRAR').length,
    VENDER: rows.filter((row) => row.action === 'VENDER').length,
    ESPERAR: rows.filter((row) => row.action === 'ESPERAR').length,
  }
  const visibleRows = rows.filter((row) => (filter === 'TODAS' || row.action === filter) && row.symbol.includes(query.toUpperCase()))

  return (
    <main className="agent-shell">
      <header className="agent-header">
        <div><p className="eyebrow">AGENTE TJR · BINANCE GLOBAL</p><h1>O que fazer agora?</h1><p>Metodologia TJR: liquidez → confirmação (BOS / inverse FVG) → continuação (FVG / equilibrium) → SMT vs BTC.</p></div>
        <button onClick={() => void scan()} disabled={running}>{running ? 'A analisar…' : 'Analisar mercado'}</button>
      </header>

      <section className="agent-rules">
        <div><strong>COMPRAR</strong><span>Sweep de lows + BOS/inverse FVG + retrace a FVG/equilibrium + SMT vs BTC alinhado + R:R mínimo.</span></div>
        <div><strong>VENDER</strong><span>Sweep de highs + confirmação baixista + continuação + SMT + R:R. Em Spot = sair ou reduzir.</span></div>
        <div><strong>ESPERAR</strong><span>Checklist TJR incompleto. Liquidez sem confirmação, ou SMT/R:R em conflito.</span></div>
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
          <button className={filter === 'COMPRAR' ? 'active buy' : 'buy'} onClick={() => setFilter('COMPRAR')}>Comprar <span>{counts.COMPRAR}</span></button>
          <button className={filter === 'VENDER' ? 'active sell' : 'sell'} onClick={() => setFilter('VENDER')}>Vender <span>{counts.VENDER}</span></button>
          <button className={filter === 'ESPERAR' ? 'active wait' : 'wait'} onClick={() => setFilter('ESPERAR')}>Esperar <span>{counts.ESPERAR}</span></button>
          <label>Pesquisar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: BTC" /></label>
        </section>
        <section className="decision-list">
        {visibleRows.map((row) => (
          <div className="decision-item" key={row.symbol}>
            <article
              className={`decision-card ${row.action.toLowerCase()} ${selected?.symbol === row.symbol ? 'selected' : ''}`}
              onClick={() => setSelected(selected?.symbol === row.symbol ? undefined : row)}
              tabIndex={0}
              title="Clica para abrir ou fechar o gráfico desta moeda."
            >
              <div className="decision-top"><div><p>{row.symbol}</p><strong>{row.action}</strong></div><span>{row.setupStatus} · {row.confidence}</span></div>
              <p className="decision-price">{price(row.price)} <span className={row.change24h >= 0 ? 'positive' : 'negative'}>{row.change24h.toFixed(1)}% hoje</span></p>
              <p>{row.reasons[0]}</p>
              <dl>
                <div><dt>Entrada</dt><dd>{price(row.entry)}</dd></div>
                <div><dt>Stop</dt><dd>{price(row.stop)}</dd></div>
                <div><dt>Alvo</dt><dd>{price(row.target)}</dd></div>
                <div><dt>Risco/retorno</dt><dd>{row.riskReward?.toFixed(1) ?? '—'}×</dd></div>
              </dl>
            </article>
            {selected?.symbol === row.symbol && (
              <section className="card-expanded">
                <article className="chart-panel">
                  <header>
                    <div><p className="eyebrow">{row.symbol}</p><h2>{row.action} · {row.confidence} confiança</h2></div>
                    <span title="Scan rápido em 1h; ao expandir refina com 4h/1h/15m/5m.">
                      {loadingFull === row.symbol ? 'A refinar MTF…' : `Execução: ${row.executionInterval ?? '15m'} · gráfico: ${chartInterval}`}
                    </span>
                  </header>
                  <PriceChart symbol={row.symbol} action={row.action} interval={chartInterval} onIntervalChange={setChartInterval} entry={row.entry} stop={row.stop} target={row.target} zones={row.zones} />
                </article>
                <aside className="evidence-panel">
                  <h2>Checklist TJR</h2>
                  <p><strong>Bias:</strong> {row.bias === 'bullish' ? 'Altista' : row.bias === 'bearish' ? 'Baixista' : 'Neutro'} · <strong>Setup:</strong> {row.setupStatus}</p>
                  <ul className="tjr-checklist">
                    {row.checklist.map((item) => (
                      <li key={item.label} className={item.complete ? 'done' : 'pending'}>
                        <span>{item.complete ? '✓' : '○'}</span>
                        <div><strong>{item.label}</strong><p>{item.note}</p></div>
                      </li>
                    ))}
                  </ul>
                  {row.reasons[0] && <p><strong>Resumo:</strong> {row.reasons.join(' ')}</p>}
                  <dl>
                    <div><dt title="Preço de referência da ideia.">Entrada ⓘ</dt><dd>{price(row.entry)}</dd></div>
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
