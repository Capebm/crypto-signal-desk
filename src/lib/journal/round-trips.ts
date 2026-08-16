import { AGENT_QUOTE_ASSET } from '../binance'
import { getTradingSessionStatus } from '../trading-session'
import type { BinanceFill, ClosedTrade } from './types'

type Lot = {
  time: number
  price: number
  quantity: number
  quoteAmount: number
  feeUsdc: number
}

const feeToUsdc = (fill: BinanceFill) => {
  if (!fill.fee || fill.fee <= 0) return 0
  if (!fill.feeAsset || fill.feeAsset === AGENT_QUOTE_ASSET || fill.feeAsset === 'USDT') return fill.fee
  return fill.fee * fill.price
}

const baseFromSymbol = (symbol: string) => symbol.replace(new RegExp(`${AGENT_QUOTE_ASSET}$`), '')

/** FIFO round-trips for spot longs (buy → sell). */
export function buildClosedTrades(fills: BinanceFill[]): ClosedTrade[] {
  const bySymbol = new Map<string, BinanceFill[]>()
  for (const fill of fills) {
    const list = bySymbol.get(fill.symbol) ?? []
    list.push(fill)
    bySymbol.set(fill.symbol, list)
  }

  const trades: ClosedTrade[] = []

  for (const [symbol, symbolFills] of bySymbol) {
    const lots: Lot[] = []

    for (const fill of symbolFills.sort((a, b) => a.time - b.time)) {
      const feeUsdc = feeToUsdc(fill)

      if (fill.side === 'BUY') {
        lots.push({
          time: fill.time,
          price: fill.price,
          quantity: fill.quantity,
          quoteAmount: fill.quoteAmount,
          feeUsdc,
        })
        continue
      }

      let remaining = fill.quantity
      const sellFeeUsdc = feeUsdc
      let allocatedSellFee = 0

      while (remaining > 1e-12 && lots.length > 0) {
        const lot = lots[0]
        const matchedQty = Math.min(remaining, lot.quantity)
        const ratio = matchedQty / fill.quantity
        const sellFeeShare = sellFeeUsdc * ratio
        const buyFeeShare = lot.feeUsdc * (matchedQty / lot.quantity)

        const entryPrice = lot.price
        const exitPrice = fill.price
        const entryCost = entryPrice * matchedQty + buyFeeShare
        const exitProceeds = exitPrice * matchedQty - sellFeeShare
        const pnlUsdc = exitProceeds - entryCost
        const pnlPct = entryCost > 0 ? (pnlUsdc / entryCost) * 100 : 0
        const feesUsdc = buyFeeShare + sellFeeShare

        const entrySession = getTradingSessionStatus(new Date(lot.time))
        const exitSession = getTradingSessionStatus(new Date(fill.time))

        trades.push({
          id: `${symbol}-${lot.time}-${fill.time}-${matchedQty}-${trades.length}`,
          symbol,
          base: baseFromSymbol(symbol),
          entryTime: lot.time,
          exitTime: fill.time,
          entryPrice,
          exitPrice,
          quantity: matchedQty,
          pnlUsdc,
          pnlPct,
          feesUsdc,
          entrySession: entrySession.window,
          entrySessionBadge: entrySession.badge,
          exitSession: exitSession.window,
          exitSessionBadge: exitSession.badge,
          durationMs: fill.time - lot.time,
          venue: 'spot',
          side: 'long',
        })

        remaining -= matchedQty
        allocatedSellFee += sellFeeShare
        lot.quantity -= matchedQty
        lot.feeUsdc -= buyFeeShare
        if (lot.quantity <= 1e-12) lots.shift()
      }
    }
  }

  return trades.sort((a, b) => b.exitTime - a.exitTime)
}

/**
 * Junta pernas FIFO do mesmo sell Spot (mesmo par + mesma saída)
 * para a tabela e KPIs tratarem ACH/XRP/PYTH como um trade.
 */
export function collapseFifoFills(trades: ClosedTrade[]): ClosedTrade[] {
  const groups = new Map<string, ClosedTrade[]>()
  for (const trade of trades) {
    const key =
      trade.venue === 'spot' ? `${trade.venue}|${trade.symbol}|${trade.exitTime}` : trade.id
    const list = groups.get(key) ?? []
    list.push(trade)
    groups.set(key, list)
  }

  const collapsed: ClosedTrade[] = []
  for (const legs of groups.values()) {
    if (legs.length === 1) {
      collapsed.push(legs[0])
      continue
    }
    const sorted = [...legs].sort((a, b) => a.entryTime - b.entryTime)
    const quantity = sorted.reduce((sum, leg) => sum + leg.quantity, 0)
    const entryNotional = sorted.reduce((sum, leg) => sum + leg.entryPrice * leg.quantity, 0)
    const exitNotional = sorted.reduce((sum, leg) => sum + leg.exitPrice * leg.quantity, 0)
    const pnlUsdc = sorted.reduce((sum, leg) => sum + leg.pnlUsdc, 0)
    const feesUsdc = sorted.reduce((sum, leg) => sum + leg.feesUsdc, 0)
    const withSignal = sorted.find((leg) => leg.signal)
    collapsed.push({
      ...sorted[0],
      id: sorted.map((leg) => leg.id).join('+'),
      quantity,
      entryPrice: quantity > 0 ? entryNotional / quantity : sorted[0].entryPrice,
      exitPrice: quantity > 0 ? exitNotional / quantity : sorted[0].exitPrice,
      pnlUsdc,
      pnlPct: entryNotional > 0 ? (pnlUsdc / entryNotional) * 100 : 0,
      feesUsdc,
      durationMs: sorted[sorted.length - 1].exitTime - sorted[0].entryTime,
      signal: withSignal?.signal,
    })
  }
  return collapsed.sort((a, b) => b.exitTime - a.exitTime)
}
