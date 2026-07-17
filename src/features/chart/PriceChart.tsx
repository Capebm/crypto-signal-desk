import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import { getCandles } from '../../lib/binance'
import type { Action } from '../../lib/decision-engine'
import { sessionLinesForChart } from '../../lib/sessions'
import type { Interval, PriceZone } from '../../lib/types'

const intervals: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d']
const intervalMs: Record<Interval, number> = { '1m': 60_000, '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000, '4h': 4 * 60 * 60_000, '1d': 24 * 60 * 60_000 }

const staleMessage = (interval: Interval, openTime: number) => {
  const ageHours = (Date.now() - openTime) / 3_600_000
  const staleAfterHours = intervalMs[interval] / 3_600_000 * 3
  if (ageHours <= staleAfterHours) return ''
  const date = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(openTime)
  return `Dados da Binance só até ${date}. Este par pode estar suspenso ou sem negociação recente.`
}

type Props = {
  symbol: string
  action: Action
  interval: Interval
  onIntervalChange: (interval: Interval) => void
  entry?: number
  stop?: number
  target?: number
  targetSecondary?: number
  targetLabel?: string
  targetSecondaryLabel?: string
  /** Fill real da Binance (Cost Price) — separado da entrada TJR. */
  fillPrice?: number
  fillLabel?: string
  zones?: PriceZone[]
}

const ema = (values: number[], period: number) => {
  const multiplier = 2 / (period + 1)
  return values.reduce<number[]>((result, value, index) => {
    result.push(index === 0 ? value : value * multiplier + result[index - 1] * (1 - multiplier))
    return result
  }, [])
}

const sessionIntervals: Interval[] = ['5m', '15m', '1h']

const candleLimit: Record<Interval, number> = { '1m': 300, '5m': 500, '15m': 300, '1h': 200, '4h': 200, '1d': 200 }

export default function PriceChart({ symbol, action, interval, onIntervalChange, entry, stop, target, targetSecondary, targetLabel, targetSecondaryLabel, fillPrice, fillLabel = 'Fill', zones = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('A carregar gráfico…')
  const [showSessions, setShowSessions] = useState(true)

  useEffect(() => {
    if (!host.current) return
    const chart = createChart(host.current, {
      height: 420,
      layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#787b86' },
      grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale: { borderColor: '#2a2e39', timeVisible: true },
      crosshair: {
        vertLine: { color: '#758696', width: 1, style: 3, labelBackgroundColor: '#2a2e39' },
        horzLine: { color: '#758696', width: 1, style: 3, labelBackgroundColor: '#2a2e39' },
      },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    const ema20 = chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 1 })
    const ema50 = chart.addSeries(LineSeries, { color: '#ff9800', lineWidth: 1 })
    let active = true
    setMessage('A carregar gráfico…')

    void getCandles(symbol, interval, candleLimit[interval]).then((rows) => {
      if (!active) return
      const time = (value: number) => Math.floor(value / 1000) as UTCTimestamp
      candles.setData(rows.map((row) => ({ time: time(row.openTime), open: row.open, high: row.high, low: row.low, close: row.close })))
      volume.setData(rows.map((row) => ({ time: time(row.openTime), value: row.volume, color: row.close >= row.open ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)' })))
      const closes = rows.map((row) => row.close)
      ema20.setData(ema(closes, 20).map((value, index) => ({ time: time(rows[index].openTime), value })))
      ema50.setData(ema(closes, 50).map((value, index) => ({ time: time(rows[index].openTime), value })))
      if (entry) candles.createPriceLine({ price: entry, color: action === 'COMPRAR' ? '#26a69a' : action === 'VENDER' ? '#ef5350' : '#b2b5be', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Entrada' })
      if (fillPrice !== undefined && (entry === undefined || Math.abs(fillPrice - entry) > entry * 0.0005)) {
        candles.createPriceLine({ price: fillPrice, color: '#ff9800', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: fillLabel })
      }
      if (stop) candles.createPriceLine({ price: stop, color: '#ef5350', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Stop' })
      if (target) candles.createPriceLine({ price: target, color: '#26a69a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: targetLabel ? `TP1 ${targetLabel}` : 'Alvo' })
      if (targetSecondary) candles.createPriceLine({ price: targetSecondary, color: '#2962ff', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: targetSecondaryLabel ? `TP2 ${targetSecondaryLabel}` : 'Alvo 2' })
      for (const zone of zones) {
        if (zone.kind === 'fair-value-gap') {
          candles.createPriceLine({ price: zone.low, color: 'rgba(41,98,255,0.55)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'FVG ↓' })
          candles.createPriceLine({ price: zone.high, color: 'rgba(41,98,255,0.55)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'FVG ↑' })
        }
        if (zone.kind === 'equilibrium') {
          const mid = (zone.low + zone.high) / 2
          candles.createPriceLine({ price: mid, color: '#787b86', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: 'EQ' })
        }
      }
      if (showSessions && sessionIntervals.includes(interval)) {
        for (const line of sessionLinesForChart(rows)) {
          candles.createPriceLine({
            price: line.price,
            color: line.color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'title' in line ? line.title : '',
          })
        }
      }
      chart.timeScale().fitContent()
      const last = rows.at(-1)
      setMessage(last ? staleMessage(interval, last.openTime) : '')
    }).catch(() => setMessage('Não foi possível carregar o gráfico.'))

    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.current?.clientWidth ?? 0 }))
    resize.observe(host.current)
    return () => { active = false; resize.disconnect(); chart.remove() }
  }, [symbol, action, interval, entry, stop, target, targetSecondary, targetLabel, targetSecondaryLabel, fillPrice, fillLabel, showSessions, zones])

  return (
    <div className="chart-host">
      <div className="chart-toolbar">
        <div className="chart-legend">
          <span>EMA 20</span><span>EMA 50</span><span>Volume</span>
          {showSessions && sessionIntervals.includes(interval) && (
            <>
              <span className="legend-asia">Ásia</span>
              <span className="legend-london">Londres</span>
              <span className="legend-ny">NY</span>
              <span className="legend-prev">Dia ant.</span>
            </>
          )}
        </div>
        <div className="chart-toolbar-actions">
          {sessionIntervals.includes(interval) && (
            <button
              type="button"
              className={`session-toggle${showSessions ? ' active' : ''}`}
              onClick={() => setShowSessions((v) => !v)}
              title="Highs/lows das sessões Ásia, Londres e Nova Iorque (horário ET, estilo TJR)"
            >
              Sessões
            </button>
          )}
        <div className="timeframe-tabs" title="Muda o intervalo das velas. O sinal do agente foi calculado em 1h.">
          {intervals.map((item) => (
            <button key={item} className={item === interval ? 'active' : ''} onClick={() => onIntervalChange(item)}>{item}</button>
          ))}
        </div>
        </div>
      </div>
      <div ref={host} />
      {message && <p className="chart-message">{message}</p>}
    </div>
  )
}
