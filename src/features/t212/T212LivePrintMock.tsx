type Props = {
  ticker: string
  sideLabel: 'Buy' | 'Sell'
  isShort: boolean
  stop?: number
  target?: number
  livePrice?: number
}

const CANDLES = [
  { x: 18, o: 62, c: 48, h: 66, l: 44 },
  { x: 36, o: 48, c: 40, h: 52, l: 36 },
  { x: 54, o: 41, c: 54, h: 58, l: 38 },
  { x: 72, o: 54, c: 42, h: 56, l: 38 },
  { x: 90, o: 43, c: 32, h: 46, l: 28 },
  { x: 108, o: 33, c: 46, h: 50, l: 30 },
  { x: 126, o: 46, c: 24, h: 48, l: 20 },
  { x: 144, o: 26, c: 38, h: 42, l: 22 },
]

function Candle({
  x, o, c, h, l, ghost, bos,
}: { x: number; o: number; c: number; h: number; l: number; ghost?: boolean; bos?: boolean }) {
  const bear = c > o
  const color = ghost ? 'var(--tv-text-muted)' : bear ? 'var(--tv-red)' : 'var(--tv-green)'
  const top = Math.min(o, c)
  const height = Math.max(4, Math.abs(c - o))
  return (
    <g opacity={ghost ? 0.35 : 1}>
      <line x1={x} x2={x} y1={h} y2={l} stroke={color} strokeWidth="1.5" strokeDasharray={ghost ? '3 3' : undefined} />
      <rect x={x - 5} y={top} width="10" height={height} fill={color} />
      {bos && <text x={x} y={Math.min(h, l) - 6} textAnchor="middle" className="t212-print-svg-label">BOS</text>}
      {ghost && <text x={x} y={78} textAnchor="middle" className="t212-print-svg-warn">IGNORA</text>}
    </g>
  )
}

export default function T212LivePrintMock({ ticker, sideLabel, isShort, stop, target, livePrice }: Props) {
  const last = livePrice && livePrice > 0 ? livePrice : undefined
  return (
    <div className="t212-print-mock" aria-label="Hipótese de print T212 para o Claude">
      <p className="t212-print-mock-title">Print T212 — o Claude precisa disto no ecrã</p>
      <div className="t212-print-grid">
        {(['5m', '1m'] as const).map((tf) => (
          <figure key={tf} className="t212-print-frame">
            <header>
              <span>T212 · CFD</span>
              <strong>{ticker}</strong>
              <em>{tf}</em>
            </header>
            <svg viewBox="0 0 168 88" role="img" aria-label={`Hipótese ${tf} ${ticker}`}>
              {stop !== undefined && <line x1="8" x2="160" y1="18" y2="18" className="t212-print-stop" />}
              {target !== undefined && <line x1="8" x2="160" y1="70" y2="70" className="t212-print-tp" />}
              {CANDLES.map((bar, index) => (
                <Candle
                  key={bar.x}
                  {...bar}
                  ghost={index === CANDLES.length - 1}
                  bos={index === CANDLES.length - 2}
                />
              ))}
            </svg>
            <figcaption>
              <span>{sideLabel} · last {last ?? '—'}</span>
              <span>Stop {stop ?? '—'} · TP {target ?? '—'}</span>
              {tf === '1m'
                ? <span>{isShort ? 'Retrace bullish fechado → BOS bearish fechado' : 'Retrace bearish fechado → BOS bullish fechado'}</span>
                : <span>BOS/iFVG {isShort ? 'bearish' : 'bullish'} em vela fechada</span>}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="desk-sub">Tira o print na T212 assim: ticker visível, intervalo 5m e depois 1m, preço, Stop/TP se os desenhares, e a vela da direita de fora (ainda a pintar).</p>
    </div>
  )
}
