import type { Opportunity } from '../../lib/vinted/api'
import { formatEuro, formatPct } from '../../lib/vinted/format'

interface OpportunityCardProps {
  opportunity: Opportunity
}

export default function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const { buyListing, estimatedProfit, profitMarginPct, confidence } = opportunity
  const confidenceLabel = { high: 'Alta', medium: 'Média', low: 'Baixa' }[confidence]

  return (
    <article className={`opportunity-card confidence-${confidence}`}>
      <header className="opportunity-top">
        <div>
          <p className="eyebrow">{buyListing.isBundle ? 'Lote / Pack' : 'Individual'} · OLX</p>
          <h3>{buyListing.title}</h3>
        </div>
        <span className="confidence-badge">{confidenceLabel}</span>
      </header>

      {buyListing.imageUrl ? (
        <img className="opportunity-image" src={buyListing.imageUrl} alt="" loading="lazy" />
      ) : null}

      <p className="opportunity-profit">
        Lucro estimado <strong className="positive">+{formatEuro(estimatedProfit)}</strong>
        <span className="positive">({formatPct(profitMarginPct)} margem)</span>
      </p>

      <dl className="opportunity-metrics">
        <div>
          <dt>Comprar (OLX)</dt>
          <dd>{formatEuro(opportunity.buyPrice)}</dd>
        </div>
        <div>
          <dt>Vender (Vinted mediana)</dt>
          <dd>{formatEuro(opportunity.estimatedSellPrice)}</dd>
        </div>
        <div>
          <dt>Comparáveis Vinted</dt>
          <dd>{opportunity.vintedStats.sampleSize} anúncios</dd>
        </div>
        <div>
          <dt>Faixa Vinted</dt>
          <dd>
            {formatEuro(opportunity.vintedStats.min)} – {formatEuro(opportunity.vintedStats.max)}
          </dd>
        </div>
        {buyListing.location ? (
          <div>
            <dt>Localização</dt>
            <dd>{buyListing.location}</dd>
          </div>
        ) : null}
      </dl>

      {opportunity.notes.length > 0 ? (
        <ul className="opportunity-notes">
          {opportunity.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <div className="opportunity-actions">
        <a href={buyListing.url} target="_blank" rel="noreferrer">
          Ver no OLX
        </a>
        <a
          href={`https://www.vinted.pt/catalog?search_text=${encodeURIComponent(opportunity.searchQuery)}`}
          target="_blank"
          rel="noreferrer"
        >
          Comparar no Vinted
        </a>
      </div>
    </article>
  )
}
