import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import { getCandles } from '../../lib/binance'
import type { Action } from '../../lib/decision-engine'
import { sessionLinesForChart } from '../../lib/sessions'
import type { Interval, PriceZone } from '../../lib/types'

const intervals: Interval[] = ['5m', '15m', '1h', '4h', '1d']
const intervalMs: Record<Interval, number> = { '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000, '4h': 4 * 60 * 60_000, '1d': 24 * 60 * 60_000 }

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

const candleLimit: Record<Interval, number> = { '5m': 500, '15m': 300, '1h': 200, '4h': 200, '1d': 200 }

export default function PriceChart({ symbol, action, interval, onIntervalChange, entry, stop, target, zones = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('A carregar gráfico…')
  const [showSessions, setShowSessions] = useState(true)

  useEffect(() => {
    if (!host.current) return
    const chart = createChart(host.current, {
      height: 420,
      layout: { background: { type: ColorType.Solid, color: '#091321' }, textColor: '#9cb1cd' },
      grid: { vertLines: { color: '#15243a' }, horzLines: { color: '#15243a' } },
      rightPriceScale: { borderColor: '#29415f' },
      timeScale: { borderColor: '#29415f', timeVisible: true },
    })
    const candles = chart.addSeries(CandlestickSeries, { upColor: '#42d99e', downColor: '#f57b88', borderVisible: false, wickUpColor: '#42d99e', wickDownColor: '#f57b88' })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    const ema20 = chart.addSeries(LineSeries, { color: '#76a7ff', lineWidth: 1 })
    const ema50 = chart.addSeries(LineSeries, { color: '#f5c451', lineWidth: 1 })
    let active = true
    setMessage('A carregar gráfico…')

    void getCandles(symbol, interval, candleLimit[interval]).then((rows) => {
      if (!active) return
      const time = (value: number) => Math.floor(value / 1000) as UTCTimestamp
      candles.setData(rows.map((row) => ({ time: time(row.openTime), open: row.open, high: row.high, low: row.low, close: row.close })))
      volume.setData(rows.map((row) => ({ time: time(row.openTime), value: row.volume, color: row.close >= row.open ? '#42d99e66' : '#f57b8866' })))
      const closes = rows.map((row) => row.close)
      ema20.setData(ema(closes, 20).map((value, index) => ({ time: time(rows[index].openTime), value })))
      ema50.setData(ema(closes, 50).map((value, index) => ({ time: time(rows[index].openTime), value })))
      if (entry) candles.createPriceLine({ price: entry, color: action === 'COMPRAR' ? '#42d99e' : action === 'VENDER' ? '#f57b88' : '#f5c451', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Entrada' })
      if (stop) candles.createPriceLine({ price: stop, color: '#f57b88', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Stop' })
      if (target) candles.createPriceLine({ price: target, color: '#42d99e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Alvo' })
      for (const zone of zones) {
        if (zone.kind === 'fair-value-gap') {
          candles.createPriceLine({ price: zone.low, color: '#76a7ff99', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'FVG ↓' })
          candles.createPriceLine({ price: zone.high, color: '#76a7ff99', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'FVG ↑' })
        }
        if (zone.kind === 'equilibrium') {
          const mid = (zone.low + zone.high) / 2
          candles.createPriceLine({ price: mid, color: '#c084fc', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: 'Equilibrium' })
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
  }, [symbol, action, interval, entry, stop, target, showSessions, zones])

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
