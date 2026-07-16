import type { BinanceFill } from './types'

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const parseNumber = (raw: string) => {
  const cleaned = raw.replace(/"/g, '').replace(/,/g, '').trim()
  if (!cleaned) return NaN
  return Number(cleaned)
}

const parseSide = (raw: string): 'BUY' | 'SELL' | undefined => {
  const side = raw.replace(/"/g, '').trim().toUpperCase()
  if (side === 'BUY' || side === 'BUY ') return 'BUY'
  if (side === 'SELL') return 'SELL'
  return undefined
}

const parseTime = (raw: string): number | undefined => {
  const cleaned = raw.replace(/"/g, '').trim()
  const ms = Date.parse(cleaned)
  return Number.isFinite(ms) ? ms : undefined
}

const pick = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/** Parse CSV text (Binance Spot trade / order exports). */
export function parseBinanceCsv(text: string): BinanceFill[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map(normalizeHeader)
  const fills: BinanceFill[] = []

  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index])
    if (cells.length < 4) continue

    const row: Record<string, string> = {}
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? ''
    })

    const status = pick(row, ['status', 'state'])?.replace(/"/g, '').toLowerCase()
    if (status && !['filled', 'partiallyfilled', 'partialfilled', ''].includes(status.replace(/\s/g, ''))) {
      continue
    }

    const side = parseSide(pick(row, ['side', 'operation']) ?? '')
    if (!side) continue

    const time = parseTime(pick(row, ['dateutc', 'utc_time', 'time', 'date', 'timestamp']) ?? '')
    if (time === undefined) continue

    const pair = (pick(row, ['market', 'pair', 'symbol']) ?? '').replace(/"/g, '').replace(/\//g, '').toUpperCase()
    if (!pair) continue

    const price = parseNumber(
      pick(row, ['price', 'avgtradingprice', 'avgprice', 'orderprice', 'tradeprice']) ?? '',
    )
    const quantity = parseNumber(
      pick(row, ['amount', 'executed', 'filled', 'executedqty', 'executedamount']) ?? '',
    )
    if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) continue

    let quoteAmount = parseNumber(pick(row, ['total', 'quoteqty', 'executedquote']) ?? '')
    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) quoteAmount = price * quantity

    const fee = parseNumber(pick(row, ['fee', 'commission']) ?? '')
    const feeAsset = pick(row, ['feecoin', 'commissionasset', 'feeasset'])?.replace(/"/g, '').toUpperCase()

    const id = `${time}-${pair}-${side}-${price}-${quantity}-${index}`
    fills.push({
      id,
      time,
      symbol: pair,
      side,
      price,
      quantity,
      quoteAmount,
      fee: Number.isFinite(fee) ? fee : undefined,
      feeAsset,
    })
  }

  return fills.sort((a, b) => a.time - b.time)
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

export function mergeFills(existing: BinanceFill[], incoming: BinanceFill[]): BinanceFill[] {
  const map = new Map<string, BinanceFill>()
  for (const fill of [...existing, ...incoming]) {
    map.set(fill.id, fill)
  }
  return [...map.values()].sort((a, b) => a.time - b.time)
}
