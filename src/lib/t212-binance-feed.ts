import { getActiveSpotSymbolSets, getCandles, getPlaybookCandles } from './binance'
import type { Candle, Interval } from './types'

const ALIASES: Record<string, string[]> = {
  POL: ['POL', 'MATIC'],
  MATIC: ['POL', 'MATIC'],
  RENDER: ['RENDER', 'RNDR'],
  RNDR: ['RENDER', 'RNDR'],
  FET: ['FET', 'ASI'],
  ASI: ['FET', 'ASI'],
}

export function t212CryptoBaseAliases(short: string): string[] {
  const base = short.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return ALIASES[base] ?? [base]
}

export function pickBinanceCryptoSymbol(
  bases: string[],
  usdc: Set<string>,
  usdt: Set<string>,
): string | undefined {
  for (const base of bases) {
    const symbol = `${base}USDC`
    if (usdc.has(symbol)) return symbol
  }
  for (const base of bases) {
    const symbol = `${base}USDT`
    if (usdt.has(symbol)) return symbol
  }
  return undefined
}

export async function resolveT212BinancePair(short: string): Promise<string | undefined> {
  const { usdc, usdt } = await getActiveSpotSymbolSets()
  return pickBinanceCryptoSymbol(t212CryptoBaseAliases(short), usdc, usdt)
}

export async function t212BinanceMatchIds(items: { id: string; short: string }[]): Promise<Map<string, string>> {
  const { usdc, usdt } = await getActiveSpotSymbolSets()
  const matched = new Map<string, string>()
  for (const item of items) {
    const pair = pickBinanceCryptoSymbol(t212CryptoBaseAliases(item.short), usdc, usdt)
    if (pair) matched.set(item.id, pair)
  }
  return matched
}

export async function getT212BinancePlaybook(short: string, options: { bypassCache?: boolean } = {}) {
  const pair = await resolveT212BinancePair(short)
  if (!pair) return undefined
  return getPlaybookCandles(pair, options)
}

export async function getT212BinanceCandles(short: string, interval: Interval): Promise<Candle[] | undefined> {
  const pair = await resolveT212BinancePair(short)
  if (!pair) return undefined
  return getCandles(pair, interval)
}
