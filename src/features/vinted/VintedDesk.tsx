import { useState } from 'react'
import OpportunityCard from './OpportunityCard'
import { fetchOpportunities, type SearchResponse } from '../../lib/vinted/api'
import { PRESET_SEARCHES } from '../../lib/vinted/format'

export default function VintedDesk() {
  const [query, setQuery] = useState('')
  const [bundlesOnly, setBundlesOnly] = useState(true)
  const [minProfitPct, setMinProfitPct] = useState(25)
  const [maxBuyPrice, setMaxBuyPrice] = useState(50)
  const [packagingCost, setPackagingCost] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SearchResponse | null>(null)

  async function runSearch(searchQuery = query) {
    setLoading(true)
    setError(null)

    try {
      const response = await fetchOpportunities({
        query: searchQuery,
        bundlesOnly,
        minProfitPct,
        maxBuyPrice: maxBuyPrice || undefined,
        packagingCost,
        limit: 24,
      })
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na pesquisa')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="vinted-shell">
      <header className="vinted-header">
        <div>
          <p className="eyebrow">Arbitragem Vinted.pt</p>
          <h1>Encontra oportunidades para revender</h1>
          <p>
            Pesquisa o OLX por lotes, packs e artigos individuais. Compara preços no Vinted e
            mostra margens estimadas para comprar barato e vender mais caro.
          </p>
        </div>
        <button type="button" disabled={loading} onClick={() => runSearch()}>
          {loading ? 'A pesquisar…' : 'Pesquisar oportunidades'}
        </button>
      </header>

      <section className="vinted-rules">
        <div>
          <strong>1. Comprar</strong>
          <span>OLX — lotes, packs e pechinchas perto de ti</span>
        </div>
        <div>
          <strong>2. Comparar</strong>
          <span>Mediana de preços no Vinted.pt para o mesmo tipo de artigo</span>
        </div>
        <div>
          <strong>3. Revender</strong>
          <span>Margem estimada após custo de embalagem</span>
        </div>
      </section>

      <form
        className="vinted-filters"
        onSubmit={(e) => {
          e.preventDefault()
          runSearch()
        }}
      >
        <label>
          Pesquisa
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ex: lote roupa, pack sapatilhas, lote livros…"
          />
        </label>

        <label>
          Margem mínima (%)
          <input
            type="number"
            min={0}
            max={500}
            value={minProfitPct}
            onChange={(e) => setMinProfitPct(Number(e.target.value))}
          />
        </label>

        <label>
          Preço máx. compra (€)
          <input
            type="number"
            min={0}
            value={maxBuyPrice}
            onChange={(e) => setMaxBuyPrice(Number(e.target.value))}
          />
        </label>

        <label>
          Custo embalagem (€)
          <input
            type="number"
            min={0}
            step={0.5}
            value={packagingCost}
            onChange={(e) => setPackagingCost(Number(e.target.value))}
          />
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={bundlesOnly}
            onChange={(e) => setBundlesOnly(e.target.checked)}
          />
          Só lotes / packs / bundles
        </label>
      </form>

      <div className="vinted-presets">
        <span>Pesquisas rápidas:</span>
        {PRESET_SEARCHES.map((preset) => (
          <button
            key={preset.query}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuery(preset.query)
              runSearch(preset.query)
            }}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" disabled={loading} onClick={() => runSearch('')}>
          Scan automático
        </button>
      </div>

      {error ? <p className="vinted-error">{error}</p> : null}

      {result ? (
        <p className="vinted-status">
          {result.opportunities.length} oportunidades de {result.scannedBuyListings} anúncios OLX
          analisados
          {result.errors.length > 0 ? ` · ${result.errors.length} avisos` : ''}
        </p>
      ) : null}

      {result?.errors.length ? (
        <div className="vinted-warnings">
          {result.errors.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {result?.opportunities.length ? (
        <section className="opportunity-grid">
          {result.opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </section>
      ) : result && !loading ? (
        <p className="vinted-empty">
          Nenhuma oportunidade encontrada com estes filtros. Tenta baixar a margem mínima ou
          desativar &quot;só lotes&quot;.
        </p>
      ) : null}

      <p className="vinted-disclaimer">
        Estimativas baseadas em dados públicos do OLX e Vinted. Não executa compras nem vendas.
        Valida sempre estado, autenticidade, portes e concorrência antes de investir. O Vinted pode
        bloquear pedidos automatizados — usa com moderação.
      </p>
    </div>
  )
}
