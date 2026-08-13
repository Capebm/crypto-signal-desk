import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import { getCandles } from '../../lib/binance'
import type { Action } from '../../lib/decision-engine'
import { sessionLinesForChart } from '../../lib/sessions'
import type { Candle, Interval, PriceZone } from '../../lib/types'

const intervals: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d']
const intervalMs: Record<Interval, number> = { '1m': 60_000, '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000, '4h': 4 * 60 * 60_000, '1d': 24 * 60 * 60_000 }

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
  /** Swings 4h/1h para markup HTF. */
  htfLevels?: { price: number; title: string; kind: 'high' | 'low' }[]
  /** Override do fetch (ex. Yahoo para T212). Default: Binance. */
  loadCandles?: (symbol: string, interval: Interval, limit?: number) => Promise<Candle[]>
  staleHint?: string
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

const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches

/** Precisão dinâmica — sem isto, altcoins <0.1 colapsam OHLC e as velas somem (só se vê EMA). */
const priceFormatFor = (price: number) => {
  const p = Math.abs(price) || 1
  if (p >= 1000) return { type: 'price' as const, precision: 2, minMove: 0.01 }
  if (p >= 100) return { type: 'price' as const, precision: 3, minMove: 0.001 }
  if (p >= 1) return { type: 'price' as const, precision: 4, minMove: 0.0001 }
  if (p >= 0.1) return { type: 'price' as const, precision: 5, minMove: 0.00001 }
  if (p >= 0.01) return { type: 'price' as const, precision: 6, minMove: 0.000001 }
  return { type: 'price' as const, precision: 8, minMove: 0.00000001 }
}

export default function PriceChart({ symbol, action, interval, onIntervalChange, entry, stop, target, targetSecondary, targetLabel, targetSecondaryLabel, fillPrice, fillLabel = 'Fill', zones = [], htfLevels = [], loadCandles, staleHint = 'Dados da Binance' }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('A carregar gráfico…')
  const [showSessions, setShowSessions] = useState(() => !isNarrow())
  const fetchCandles = loadCandles ?? getCandles

  useEffect(() => {
    if (!host.current) return
    const narrow = isNarrow()
    const chartHeight = narrow ? 280 : 420
    const visibleBars = narrow ? 56 : 96
    const chart = createChart(host.current, {
      height: chartHeight,
      layout: { background: { type: ColorType.Solid, color: '#05070c' }, textColor: '#5d7390', fontSize: narrow ? 10 : 12 },
      grid: { vertLines: { color: '#121c2c' }, horzLines: { color: '#121c2c' } },
      rightPriceScale: {
        borderColor: '#1e2d42',
        scaleMargins: { top: 0.08, bottom: 0.18 },
        minimumWidth: narrow ? 52 : 64,
      },
      timeScale: {
        borderColor: '#1e2d42',
        timeVisible: true,
        minBarSpacing: narrow ? 5.5 : 7,
        rightOffset: 4,
      },
      crosshair: {
        vertLine: { color: '#6e849e', width: 1, style: 3, labelBackgroundColor: '#121c2c' },
        horzLine: { color: '#6e849e', width: 1, style: 3, labelBackgroundColor: '#121c2c' },
      },
      handleScroll: { vertTouchDrag: false },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#3dffb5',
      downColor: '#ff4d6a',
      borderVisible: true,
      borderUpColor: '#3dffb5',
      borderDownColor: '#ff4d6a',
      wickUpColor: '#3dffb5',
      wickDownColor: '#ff4d6a',
    })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const ema20 = chart.addSeries(LineSeries, { color: '#3ecbff', lineWidth: 1, lastValueVisible: false, priceLineVisible: false })
    const ema50 = chart.addSeries(LineSeries, { color: '#ff8a1f', lineWidth: 1, lastValueVisible: false, priceLineVisible: false })
    let active = true
    setMessage('A carregar gráfico…')

    const addLine = (
      price: number,
      color: string,
      title: string,
      opts?: { lineWidth?: 1 | 2 | 3 | 4; lineStyle?: 0 | 1 | 2 | 3 | 4; showLabel?: boolean },
    ) => {
      candles.createPriceLine({
        price,
        color,
        lineWidth: opts?.lineWidth ?? 1,
        lineStyle: opts?.lineStyle ?? 2,
        axisLabelVisible: opts?.showLabel ?? !narrow,
        title: narrow && !opts?.showLabel ? '' : title,
      })
    }

    void fetchCandles(symbol, interval, candleLimit[interval]).then((rows) => {
      if (!active) return
      if (rows.length === 0) {
        setMessage('Sem candles para este intervalo.')
        return
      }
      const time = (value: number) => Math.floor(value / 1000) as UTCTimestamp
      const sample = rows[rows.length - 1]?.close ?? rows[0].close
      const format = priceFormatFor(sample)
      candles.applyOptions({ priceFormat: format })
      ema20.applyOptions({ priceFormat: format })
      ema50.applyOptions({ priceFormat: format })
      candles.setData(rows.map((row) => ({ time: time(row.openTime), open: row.open, high: row.high, low: row.low, close: row.close })))
      volume.setData(rows.map((row) => ({ time: time(row.openTime), value: row.volume, color: row.close >= row.open ? 'rgba(61,255,181,0.4)' : 'rgba(255,77,106,0.4)' })))
      const closes = rows.map((row) => row.close)
      ema20.setData(ema(closes, 20).map((value, index) => ({ time: time(rows[index].openTime), value })))
      ema50.setData(ema(closes, 50).map((value, index) => ({ time: time(rows[index].openTime), value })))

      if (entry) addLine(entry, action === 'COMPRAR' ? '#3dffb5' : action === 'VENDER' ? '#ff4d6a' : '#6e849e', 'Entrada', { lineWidth: 2, showLabel: true })
      if (fillPrice !== undefined && (entry === undefined || Math.abs(fillPrice - entry) > entry * 0.0005)) {
        addLine(fillPrice, '#ff8a1f', fillLabel, { lineWidth: 2, lineStyle: 0, showLabel: true })
      }
      if (stop) addLine(stop, '#ff4d6a', 'Stop', { showLabel: true })
      if (target) addLine(target, '#3dffb5', targetLabel ? `TP1 ${targetLabel}` : 'Alvo', { showLabel: true })
      if (targetSecondary) addLine(targetSecondary, '#3ecbff', targetSecondaryLabel ? `TP2 ${targetSecondaryLabel}` : 'Alvo 2', { lineStyle: 0, showLabel: !narrow })

      for (const zone of zones) {
        if (zone.kind === 'fair-value-gap') {
          addLine(zone.low, 'rgba(41,98,255,0.55)', 'FVG ↓', { showLabel: !narrow })
          addLine(zone.high, 'rgba(41,98,255,0.55)', 'FVG ↑', { showLabel: !narrow })
        }
        if (zone.kind === 'equilibrium') {
          addLine((zone.low + zone.high) / 2, '#5d7390', 'EQ', { lineStyle: 0, showLabel: !narrow })
        }
        if (zone.kind === 'order-block') {
          addLine(zone.low, 'rgba(255,138,31,0.7)', 'OB ↓', { showLabel: !narrow })
          addLine(zone.high, 'rgba(255,138,31,0.7)', 'OB ↑', { showLabel: !narrow })
        }
        if (zone.kind === 'breaker-block') {
          addLine(zone.low, 'rgba(180,111,255,0.7)', 'BB ↓', { lineStyle: 2, showLabel: !narrow })
          addLine(zone.high, 'rgba(180,111,255,0.7)', 'BB ↑', { lineStyle: 2, showLabel: !narrow })
        }
      }
      if (showSessions && sessionIntervals.includes(interval)) {
        for (const line of sessionLinesForChart(rows)) {
          addLine(line.price, line.color, 'title' in line ? line.title : '', { showLabel: !narrow })
        }
      }
      const htfCap = narrow ? 4 : 8
      for (const level of htfLevels.slice(-htfCap)) {
        addLine(level.price, level.kind === 'high' ? '#9aadc4' : '#5d7390', level.title, { lineStyle: 3, showLabel: !narrow })
      }

      // Zoom nas últimas velas — evita fitContent que esmaga corpos em ecrãs estreitos
      const last = rows.length - 1
      const from = Math.max(0, last - visibleBars)
      chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: last + 3 })

      const lastCandle = rows.at(-1)
      const ageHours = lastCandle ? (Date.now() - lastCandle.openTime) / 3_600_000 : 0
      const staleAfterHours = intervalMs[interval] / 3_600_000 * 3
      setMessage(
        lastCandle && ageHours > staleAfterHours
          ? `${staleHint} só até ${new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(lastCandle.openTime)}.`
          : '',
      )
    }).catch(() => setMessage('Não foi possível carregar o gráfico.'))

    const resize = new ResizeObserver(() => {
      if (!host.current) return
      const nowNarrow = host.current.clientWidth < 720
      chart.applyOptions({
        width: host.current.clientWidth,
        height: nowNarrow ? 280 : 420,
        timeScale: { minBarSpacing: nowNarrow ? 5.5 : 7 },
      })
    })
    resize.observe(host.current)
    return () => { active = false; resize.disconnect(); chart.remove() }
  }, [symbol, action, interval, entry, stop, target, targetSecondary, targetLabel, targetSecondaryLabel, fillPrice, fillLabel, showSessions, zones, htfLevels, fetchCandles, staleHint])

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
          {htfLevels.length > 0 && <span className="legend-prev">4h/1h H·L</span>}
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
      <div ref={host} className="chart-canvas" />
      {message && <p className="chart-message">{message}</p>}
    </div>
  )
}
