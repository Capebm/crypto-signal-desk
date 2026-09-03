import { useEffect, useState } from 'react'
import type { Action } from '../../lib/decision-engine'
import type { Candle, Interval, PriceZone } from '../../lib/types'
import PriceChart from '../chart/PriceChart'

type Props = {
  ticker: string
  symbol: string
  action: Action
  sideLabel: 'Buy' | 'Sell'
  stop?: number
  target?: number
  entry?: number
  livePrice?: number
  zones?: PriceZone[]
  htfLevels?: { price: number; title: string; kind: 'high' | 'low' }[]
  staleHint?: string
  loadCandles?: (symbol: string, interval: Interval, limit?: number) => Promise<Candle[]>
}

const clockFmt = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export default function T212LivePrintMock({
  ticker,
  symbol,
  action,
  sideLabel,
  stop,
  target,
  entry,
  livePrice,
  zones,
  htfLevels,
  staleHint,
  loadCandles,
}: Props) {
  const [now, setNow] = useState(() => clockFmt.format(new Date()))
  useEffect(() => {
    const id = window.setInterval(() => setNow(clockFmt.format(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])
  const last = livePrice && livePrice > 0 ? livePrice : undefined

  return (
    <div className="t212-print-mock" aria-label="Print 5m e 1m do desk">
      <p className="t212-print-mock-title">Print do desk — 5m + 1m · agora {now}</p>
      <div className="t212-print-grid">
        {(['5m', '1m'] as const).map((tf) => (
          <figure key={tf} className="t212-print-frame">
            <header>
              <span>Desk</span>
              <strong>{ticker}</strong>
              <em>{tf}</em>
            </header>
            <PriceChart
              compact
              symbol={symbol}
              action={action}
              interval={tf}
              entry={entry}
              stop={stop}
              target={target}
              zones={zones}
              htfLevels={htfLevels}
              loadCandles={loadCandles}
              staleHint={staleHint}
            />
            <figcaption>
              <span>{sideLabel} · last {last ?? '—'}</span>
              <span>Stop {stop ?? '—'} · TP {target ?? '—'}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="desk-sub">Tira o print destes dois gráficos agora. Depois tira os mesmos 5m + 1m na T212, também agora — não esperes pelo :00.</p>
    </div>
  )
}
