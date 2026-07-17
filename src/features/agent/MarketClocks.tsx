import type { MarketClocksSnapshot } from '../../lib/trading-session'

type Props = { snapshot: MarketClocksSnapshot; compact?: boolean }

export default function MarketClocks({ snapshot, compact = false }: Props) {
  return (
    <section className={`market-clocks${compact ? ' compact' : ''}`} aria-label="Relógios dos mercados TJR">
      <div className="market-clocks-local">
        <span>Tu</span>
        <strong>{snapshot.local.time}</strong>
        {!compact && <small>{snapshot.local.label}</small>}
      </div>
      {snapshot.clocks.map((clock) => (
        <article
          key={clock.id}
          className={`market-clock market-${clock.id}${clock.active ? ' active' : ''}${clock.ideal ? ' ideal' : ''}`}
          title={`${clock.windowEt} · ${clock.windowLisbon}`}
        >
          <header>
            <span className="market-clock-label">{clock.label}</span>
            {!compact && <small>{clock.city} · {clock.tzShort}</small>}
          </header>
          <strong className="market-clock-time">{clock.time}</strong>
          <p className="market-clock-status">{clock.status}</p>
          {!compact && <footer>{clock.windowLisbon}</footer>}
        </article>
      ))}
    </section>
  )
}
