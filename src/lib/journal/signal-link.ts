import { requireDeskUser, type StoredSignal } from '../signal-log'
import { supabase } from '../supabase'
import { followedPlannedStop } from './journal-stats'
import { realizedR } from './t212-csv'
import type { ClosedTrade, TradeExitType } from './types'

/** Uma entrada conta como "deste sinal" se acontecer até 2h depois dele (ou 5 min antes, por relógio). */
const LINK_AFTER_MS = 2 * 3_600_000
const LINK_BEFORE_MS = 5 * 60_000

const normalizeBase = (base: string) => base.toUpperCase().replace(/(USDC|USDT)$/, '')

/** Spot não traz o tipo de ordem: infere pelo preço de saída face ao SL/TP do sinal (±0,25R). */
export function inferExitType(trade: ClosedTrade, signal: Pick<StoredSignal, 'entry' | 'stop' | 'target'>): TradeExitType {
  const risk = Math.abs(signal.entry - signal.stop)
  if (!(risk > 0)) return 'manual'
  if (Math.abs(trade.exitPrice - signal.target) <= risk * 0.25) return 'tp'
  if (Math.abs(trade.exitPrice - signal.stop) <= risk * 0.25) return 'sl'
  return 'manual'
}

/** Liga cada trade ao sinal mais próximo (mesmo ativo e lado) e calcula plano vs execução. */
export function linkTradesToSignals(trades: ClosedTrade[], signals: StoredSignal[]): ClosedTrade[] {
  const byBase = new Map<string, StoredSignal[]>()
  for (const signal of signals) {
    const key = `${normalizeBase(signal.base)}|${signal.side}`
    const list = byBase.get(key) ?? []
    list.push(signal)
    byBase.set(key, list)
  }
  return trades.map((trade) => {
    const candidates = byBase.get(`${normalizeBase(trade.base)}|${trade.side}`) ?? []
    let best: StoredSignal | undefined
    let bestGap = Infinity
    for (const signal of candidates) {
      const gap = trade.entryTime - Date.parse(signal.signal_at)
      if (gap < -LINK_BEFORE_MS || gap > LINK_AFTER_MS) continue
      if (Math.abs(gap) < bestGap) {
        best = signal
        bestGap = Math.abs(gap)
      }
    }
    if (!best) return trade
    if (trade.venue === 't212') {
      return { ...trade, signalId: best.id, planFollowed: followedPlannedStop(trade, best.stop) }
    }
    // Spot: sem SL anexado no CSV → usa o stop do sinal para R e para "respeitou o stop".
    const r = realizedR(trade.side, trade.entryPrice, trade.exitPrice, best.stop)
    return {
      ...trade,
      signalId: best.id,
      plannedStop: best.stop,
      plannedTarget: best.target,
      realizedR: r,
      exitType: trade.exitType ?? inferExitType(trade, best),
      planFollowed: r === undefined ? false : r >= -1.25,
    }
  })
}

function toRow(trade: ClosedTrade) {
  return {
    id: trade.id,
    venue: trade.venue,
    symbol: trade.symbol,
    base: trade.base,
    side: trade.side,
    asset_class: trade.assetClass,
    entry_time: new Date(trade.entryTime).toISOString(),
    exit_time: new Date(trade.exitTime).toISOString(),
    entry_price: trade.entryPrice,
    exit_price: trade.exitPrice,
    quantity: trade.quantity,
    pnl: trade.pnlUsdc,
    fees: trade.feesUsdc,
    overnight: trade.overnight ?? 0,
    exit_type: trade.exitType,
    planned_stop: trade.plannedStop,
    planned_target: trade.plannedTarget,
    realized_r: trade.realizedR,
    signal_id: trade.signalId,
  }
}

/** Upsert de todos os trades fechados (id estável → reimportar não duplica). */
export async function syncJournalTrades(trades: ClosedTrade[]): Promise<number> {
  const user = await requireDeskUser()
  const updatedAt = new Date().toISOString()
  for (let index = 0; index < trades.length; index += 500) {
    const rows = trades.slice(index, index + 500).map((trade) => ({ ...toRow(trade), user_id: user.id, updated_at: updatedAt }))
    const { error } = await supabase.from('journal_trades').upsert(rows, { onConflict: 'user_id,id' })
    if (error) throw new Error(error.message)
  }
  return trades.length
}
