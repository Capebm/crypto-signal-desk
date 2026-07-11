import { useState } from 'react'
import { getCandles, getLiquidUsdtMarkets } from '../../lib/binance'
import { decide, type Decision } from '../../lib/decision-engine'
import { analyse } from '../../lib/indicators'
import PriceChart from '../chart/PriceChart'
import { riskProfiles, type RiskProfile } from '../../lib/risk-profile'
import type { Interval } from '../../lib/types'

type AgentRow = Decision & {
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
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const riskProfile = profiles[riskIndex]

  const scan = async () => {
    setRunning(true)
    setRows([])
    try {
      const markets = await getLiquidUsdtMarkets(10_000)
      const results: AgentRow[] = []
      for (let index = 0; index < markets.length; index += 5) {
        setStatus(`A analisar ${Math.min(index + 5, markets.length)} de ${markets.length} moedas…`)
        const batch = await Promise.all(markets.slice(index, index + 5).map(async (market) => {
          try {
            const analysis = analyse(await getCandles(market.symbol, '1h'), market.priceChangePercent)
            const decision = decide(analysis, riskProfile)
            return { ...decision, symbol: market.symbol, price: analysis.price, change24h: analysis.change24h }
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
        <div><p className="eyebrow">AGENTE DE DAY TRADING · BINANCE GLOBAL</p><h1>O que fazer agora?</h1><p>O agente analisa todos os mercados Spot USDT ativos e decide: comprar, vender ou esperar.</p></div>
        <button onClick={() => void scan()} disabled={running}>{running ? 'A analisar…' : 'Analisar mercado'}</button>
      </header>

      <section className="agent-rules">
        <div><strong>COMPRAR</strong><span>Tendência, momentum, volume e risco/retorno estão alinhados.</span></div>
        <div><strong>VENDER</strong><span>O movimento técnico é negativo; para Spot, significa sair ou reduzir uma posição.</span></div>
        <div><strong>ESPERAR</strong><span>Falta qualidade ou há sinais contraditórios. Não fazer nada é uma decisão.</span></div>
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
              <div className="decision-top"><div><p>{row.symbol}</p><strong>{row.action}</strong></div><span>{row.confidence} confiança</span></div>
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
                    <span title="O sinal foi calculado em 1h. Podes mudar o gráfico para ver outros timeframes.">Sinal: 1h · gráfico: {chartInterval}</span>
                  </header>
                  <PriceChart symbol={row.symbol} action={row.action} interval={chartInterval} onIntervalChange={setChartInterval} entry={row.entry} stop={row.stop} target={row.target} />
                </article>
                <aside className="evidence-panel">
                  <h2>Porque esta decisão?</h2>
                  <p><strong>Principal:</strong> {row.reasons[0]}</p>
                  <p title="Tendência, momentum, volatilidade, volume e risco têm de concordar para COMPRAR ou VENDER.">O agente compara vários grupos de sinais. Se houver conflito, diz ESPERAR.</p>
                  <dl>
                    <div><dt title="Preço de referência da ideia.">Entrada ⓘ</dt><dd>{price(row.entry)}</dd></div>
                    <div><dt title="Se este preço for atingido, a ideia deixa de fazer sentido.">Stop ⓘ</dt><dd>{price(row.stop)}</dd></div>
                    <div><dt title="Alvo técnico estimado.">Alvo ⓘ</dt><dd>{price(row.target)}</dd></div>
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
