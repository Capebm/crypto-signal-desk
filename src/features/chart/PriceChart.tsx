import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
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
  onIntervalChange?: (interval: Interval) => void
  compact?: boolean
  entry?: number
  stop?: number
  target?: number
  targetSecondary?: number
  targetLabel?: string
  targetSecondaryLabel?: string
  fillPrice?: number
  fillLabel?: string
  zones?: PriceZone[]
  htfLevels?: { price: number; title: string; kind: 'high' | 'low' }[]
  loadCandles?: (symbol: string, interval: Interval, limit?: number) => Promise<Candle[]>
  staleHint?: string
}

type Overlay = {
  action: Action
  entry?: number
  stop?: number
  target?: number
  targetSecondary?: number
  targetLabel?: string
  targetSecondaryLabel?: string
  fillPrice?: number
  fillLabel: string
  zones: PriceZone[]
  htfLevels: { price: number; title: string; kind: 'high' | 'low' }[]
  showSessions: boolean
  interval: Interval
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
const EMPTY_ZONES: PriceZone[] = []
const EMPTY_HTF: Overlay['htfLevels'] = []

const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches

const priceFormatFor = (price: number) => {
  const p = Math.abs(price) || 1
  if (p >= 1000) return { type: 'price' as const, precision: 2, minMove: 0.01 }
  if (p >= 100) return { type: 'price' as const, precision: 3, minMove: 0.001 }
  if (p >= 1) return { type: 'price' as const, precision: 4, minMove: 0.0001 }
  if (p >= 0.1) return { type: 'price' as const, precision: 5, minMove: 0.00001 }
  if (p >= 0.01) return { type: 'price' as const, precision: 6, minMove: 0.000001 }
  return { type: 'price' as const, precision: 8, minMove: 0.00000001 }
}

const overlayKey = (overlay: Overlay) => JSON.stringify({
  action: overlay.action,
  entry: overlay.entry,
  stop: overlay.stop,
  target: overlay.target,
  targetSecondary: overlay.targetSecondary,
  targetLabel: overlay.targetLabel,
  targetSecondaryLabel: overlay.targetSecondaryLabel,
  fillPrice: overlay.fillPrice,
  fillLabel: overlay.fillLabel,
  zones: overlay.zones.map((zone) => [zone.kind, zone.low, zone.high]),
  htfLevels: overlay.htfLevels.map((level) => [level.kind, level.price, level.title]),
  showSessions: overlay.showSessions,
  interval: overlay.interval,
})

const paintOverlays = (
  series: ISeriesApi<'Candlestick'>,
  rows: Candle[],
  overlay: Overlay,
  lines: IPriceLine[],
) => {
  for (const line of lines) series.removePriceLine(line)
  lines.length = 0
  const narrow = isNarrow()
  const addLine = (
    price: number,
    color: string,
    title: string,
    opts?: { lineWidth?: 1 | 2 | 3 | 4; lineStyle?: 0 | 1 | 2 | 3 | 4; showLabel?: boolean },
  ) => {
    lines.push(series.createPriceLine({
      price,
      color,
      lineWidth: opts?.lineWidth ?? 1,
      lineStyle: opts?.lineStyle ?? 2,
      axisLabelVisible: opts?.showLabel ?? !narrow,
      title: narrow && !opts?.showLabel ? '' : title,
    }))
  }
  if (overlay.entry) {
    addLine(overlay.entry, overlay.action === 'COMPRAR' ? '#3dffb5' : overlay.action === 'VENDER' ? '#ff4d6a' : '#6e849e', 'Entrada', { lineWidth: 2, showLabel: true })
  }
  if (overlay.fillPrice !== undefined && (overlay.entry === undefined || Math.abs(overlay.fillPrice - overlay.entry) > overlay.entry * 0.0005)) {
    addLine(overlay.fillPrice, '#ff8a1f', overlay.fillLabel, { lineWidth: 2, lineStyle: 0, showLabel: true })
  }
  if (overlay.stop) addLine(overlay.stop, '#ff4d6a', 'Stop', { showLabel: true })
  if (overlay.target) addLine(overlay.target, '#3dffb5', overlay.targetLabel ? `TP1 ${overlay.targetLabel}` : 'Alvo', { showLabel: true })
  if (overlay.targetSecondary) {
    addLine(overlay.targetSecondary, '#3ecbff', overlay.targetSecondaryLabel ? `TP2 ${overlay.targetSecondaryLabel}` : 'Alvo 2', { lineStyle: 0, showLabel: !narrow })
  }
  for (const zone of overlay.zones) {
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
  if (overlay.showSessions && sessionIntervals.includes(overlay.interval)) {
    for (const line of sessionLinesForChart(rows)) {
      addLine(line.price, line.color, 'title' in line ? line.title : '', { showLabel: !narrow })
    }
  }
  const htfCap = narrow ? 4 : 8
  for (const level of overlay.htfLevels.slice(-htfCap)) {
    addLine(level.price, level.kind === 'high' ? '#9aadc4' : '#5d7390', level.title, { lineStyle: 3, showLabel: !narrow })
  }
}

export default function PriceChart({
  symbol,
  action,
  interval,
  onIntervalChange,
  compact = false,
  entry,
  stop,
  target,
  targetSecondary,
  targetLabel,
  targetSecondaryLabel,
  fillPrice,
  fillLabel = 'Fill',
  zones,
  htfLevels,
  loadCandles,
  staleHint = 'Dados da Binance',
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const rowsRef = useRef<Candle[]>([])
  const fetchRef = useRef(loadCandles ?? getCandles)
  fetchRef.current = loadCandles ?? getCandles
  const overlayRef = useRef<Overlay>({
    action, entry, stop, target, targetSecondary, targetLabel, targetSecondaryLabel,
    fillPrice, fillLabel, zones: zones ?? EMPTY_ZONES, htfLevels: htfLevels ?? EMPTY_HTF, showSessions: false, interval,
  })
  const [message, setMessage] = useState('A carregar gráfico…')
  const [showSessions, setShowSessions] = useState(() => !isNarrow())
  const overlay: Overlay = {
    action, entry, stop, target, targetSecondary, targetLabel, targetSecondaryLabel,
    fillPrice, fillLabel, zones: zones ?? EMPTY_ZONES, htfLevels: htfLevels ?? EMPTY_HTF,
    showSessions: compact ? false : showSessions, interval,
  }
  overlayRef.current = overlay
  const paintedKey = overlayKey(overlay)

  useEffect(() => {
    if (!host.current) return
    const narrow = isNarrow()
    const chart = createChart(host.current, {
      width: host.current.clientWidth,
      height: compact ? 200 : narrow ? 280 : 420,
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
    chartRef.current = chart
    candleSeriesRef.current = candles
    volumeRef.current = volume
    ema20Ref.current = ema20
    ema50Ref.current = ema50
    let lastWidth = host.current.clientWidth
    const resize = new ResizeObserver(() => {
      if (!host.current) return
      const width = host.current.clientWidth
      if (width <= 0 || width === lastWidth) return
      lastWidth = width
      chart.applyOptions({ width })
    })
    resize.observe(host.current)
    return () => {
      resize.disconnect()
      linesRef.current = []
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeRef.current = null
      ema20Ref.current = null
      ema50Ref.current = null
    }
  }, [compact])

  useEffect(() => {
    const candles = candleSeriesRef.current
    const volume = volumeRef.current
    const ema20 = ema20Ref.current
    const ema50 = ema50Ref.current
    const chart = chartRef.current
    if (!candles || !volume || !ema20 || !ema50 || !chart) return
    let active = true
    setMessage('A carregar gráfico…')
    const narrow = isNarrow()
    const visibleBars = compact ? 48 : narrow ? 56 : 96
    void fetchRef.current(symbol, interval, candleLimit[interval]).then((rows) => {
      if (!active || candleSeriesRef.current !== candles) return
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
      rowsRef.current = rows
      paintOverlays(candles, rows, overlayRef.current, linesRef.current)
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
    }).catch(() => {
      if (active) setMessage('Não foi possível carregar o gráfico.')
    })
    return () => { active = false }
  }, [symbol, interval, staleHint, compact])

  useEffect(() => {
    const candles = candleSeriesRef.current
    if (!candles || rowsRef.current.length === 0) return
    paintOverlays(candles, rowsRef.current, overlayRef.current, linesRef.current)
  }, [paintedKey])

  return (
    <div className={`chart-host${compact ? ' compact' : ''}`}>
      {!compact && (
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
            {overlay.htfLevels.length > 0 && <span className="legend-prev">4h/1h H·L</span>}
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
                <button
                  key={item}
                  className={item === interval ? 'active' : ''}
                  onClick={() => onIntervalChange?.(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div ref={host} className="chart-canvas" />
      {message && <p className="chart-message">{message}</p>}
    </div>
  )
}
