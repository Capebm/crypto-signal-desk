import type { MarketClocksSnapshot } from '../../lib/trading-session'

type Props = { snapshot: MarketClocksSnapshot }

export default function MarketClocks({ snapshot }: Props) {
  return (
    <section className="market-clocks" aria-label="Relógios dos mercados TJR">
      <div className="market-clocks-local">
        <span>Tu</span>
        <strong>{snapshot.local.time}</strong>
        <small>{snapshot.local.label}</small>
      </div>
      {snapshot.clocks.map((clock) => (
        <article
          key={clock.id}
          className={`market-clock market-${clock.id}${clock.active ? ' active' : ''}${clock.ideal ? ' ideal' : ''}`}
          title={`${clock.windowEt} · ${clock.windowLisbon}`}
        >
          <header>
            <span className="market-clock-label">{clock.label}</span>
            <small>{clock.city} · {clock.tzShort}</small>
          </header>
          <strong className="market-clock-time">{clock.time}</strong>
          <p className="market-clock-status">{clock.status}</p>
          <footer>{clock.windowLisbon}</footer>
        </article>
      ))}
    </section>
  )
}
