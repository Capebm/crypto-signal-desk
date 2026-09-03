import { useEffect, useRef, useState } from 'react'
import type { Action } from '../../lib/decision-engine'
import { composeDeskLivePrint, deliverDeskPrintPack } from '../../lib/t212-desk-print'
import type { T212LivePrintInput } from '../../lib/t212-live-confirm'
import type { Candle, Interval, PriceZone } from '../../lib/types'
import PriceChart, { type PriceChartHandle } from '../chart/PriceChart'

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
  pasteText: string
  stakeEur: number
  loadCandles?: (symbol: string, interval: Interval, limit?: number) => Promise<Candle[]>
}

const clockFmt = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const deliveryHint: Record<string, string> = {
  shared: 'Texto copiado · escolhe Claude (ou Guardar imagem) na folha de partilha.',
  clipboard: 'Pack no clipboard — cola no Claude.',
  download: 'Texto copiado · PNG descarregado. Anexa a imagem no Claude.',
}

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
  pasteText,
  stakeEur,
  loadCandles,
}: Props) {
  const fiveRef = useRef<PriceChartHandle>(null)
  const oneRef = useRef<PriceChartHandle>(null)
  const [now, setNow] = useState(() => clockFmt.format(new Date()))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    const id = window.setInterval(() => setNow(clockFmt.format(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])
  const last = livePrice && livePrice > 0 ? livePrice : undefined

  const packInput: T212LivePrintInput = {
    ticker,
    sideLabel,
    entry,
    stop,
    target,
    stakeEur,
    livePrice,
  }

  const capturePack = async () => {
    setBusy(true)
    setStatus('')
    try {
      const [fiveMin, oneMin] = await Promise.all([
        fiveRef.current?.capture(),
        oneRef.current?.capture(),
      ])
      if (!fiveMin || !oneMin) throw new Error('Gráficos ainda a carregar — espera 2s e tenta de novo.')
      const sheet = composeDeskLivePrint(fiveMin, oneMin, { ...packInput, takenAt: clockFmt.format(new Date()) })
      const how = await deliverDeskPrintPack(sheet, pasteText, `desk-${ticker}-5m-1m.png`)
      setStatus(deliveryHint[how] ?? 'Pack pronto.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível gerar o print.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="t212-print-mock" aria-label="Print 5m e 1m do desk">
      <p className="t212-print-mock-title">Pack desk — 5m + 1m · {now}</p>
      <button type="button" className="primary t212-print-pack-btn" onClick={() => void capturePack()} disabled={busy}>
        {busy ? 'A gerar print…' : 'Copiar pack Claude'}
      </button>
      {status && <p className="desk-sub">{status}</p>}
      <div className="t212-print-grid">
        {([
          { tf: '5m' as const, chartRef: fiveRef },
          { tf: '1m' as const, chartRef: oneRef },
        ]).map(({ tf, chartRef }) => (
          <figure key={tf} className="t212-print-frame">
            <header>
              <span>Desk · não T212</span>
              <strong>{ticker}</strong>
              <em>{tf}</em>
            </header>
            <PriceChart
              ref={chartRef}
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
      <p className="desk-sub">O botão gera a imagem completa (não precisas de print de ecrã). Depois só faltam as duas fotos T212: 5m e a seguir 1m, agora, sem esperar :00.</p>
    </div>
  )
}
