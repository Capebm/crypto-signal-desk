import type { BinanceFill } from './types'

const normalizeHeader = (value: string) => value.toLowerCase().replace(/^\ufeff/, '').replace(/[^a-z0-9]/g, '')

const buildHeaders = (rawHeaders: string[]) => {
  const counts: Record<string, number> = {}
  return rawHeaders.map((raw) => {
    const base = normalizeHeader(raw)
    const seen = counts[base] ?? 0
    counts[base] = seen + 1
    return seen === 0 ? base : `${base}${seen + 1}`
  })
}

const detectDelimiter = (line: string) => {
  const commas = (line.match(/,/g) ?? []).length
  const semis = (line.match(/;/g) ?? []).length
  return semis > commas ? ';' : ','
}

/** Binance appends asset tickers: 17.9XRP, 19.95671USDC, 6024F */
const parseNumber = (raw: string) => {
  let cleaned = raw.replace(/"/g, '').trim()
  if (!cleaned) return NaN
  const numeric = cleaned.match(/^[\d.,+-]+/)
  if (!numeric) return NaN
  cleaned = numeric[0]
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    cleaned = cleaned.replace(/,/g, '')
  }
  return Number(cleaned)
}

/** Extrai asset do sufixo: 0.00012BNB → BNB */
const parseFeeAsset = (raw: string): string | undefined => {
  const cleaned = raw.replace(/"/g, '').trim()
  const m = cleaned.match(/[A-Za-z][A-Za-z0-9]{1,14}$/)
  return m ? m[0].toUpperCase() : undefined
}

const parseSide = (raw: string): 'BUY' | 'SELL' | undefined => {
  const side = raw.replace(/"/g, '').trim().toUpperCase()
  if (side.startsWith('BUY')) return 'BUY'
  if (side.startsWith('SELL')) return 'SELL'
  return undefined
}

const parseTime = (raw: string): number | undefined => {
  const cleaned = raw.replace(/"/g, '').trim()
  let ms = Date.parse(cleaned)
  if (Number.isFinite(ms)) return ms
  // dd/mm/yyyy hh:mm:ss
  const eu = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/)
  if (eu) {
    const [, d, m, y, h, min, s] = eu
    ms = Date.parse(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${s}Z`)
    if (Number.isFinite(ms)) return ms
  }
  // Spot Trade History: "2026-07-22 23:35:50" (UTC sem Z)
  const space = cleaned.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
  if (space) {
    ms = Date.parse(`${space[1]}T${space[2]}Z`)
    if (Number.isFinite(ms)) return ms
  }
  return undefined
}

const pick = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

const isBlockedStatus = (status: string) => {
  const normalized = status.toLowerCase().replace(/\s/g, '')
  if (normalized === 'filled') return false
  return ['canceled', 'cancelled', 'expired', 'rejected', 'failed', 'new', 'pending', 'open'].some(
    (blocked) => normalized.includes(blocked),
  )
}

/** Parse CSV text (Binance Spot trade / order exports). */
export function parseBinanceCsv(text: string): BinanceFill[] {
  const cleaned = text.replace(/^\ufeff/, '').trim()
  if (cleaned.startsWith('PK')) return [] // ZIP — descompactar primeiro
  const lines = cleaned.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const delimiter = detectDelimiter(lines[0])
  const headers = buildHeaders(splitCsvLine(lines[0], delimiter))
  const fills: BinanceFill[] = []

  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index], delimiter)
    if (cells.length < 4) continue

    const row: Record<string, string> = {}
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? ''
    })

    const status = pick(row, ['status', 'state', 'orderstatus'])?.replace(/"/g, '').trim() ?? ''
    if (status && isBlockedStatus(status)) continue

    const side = parseSide(pick(row, ['side', 'operation']) ?? '')
    if (!side) continue

    const time = parseTime(
      pick(row, ['time2', 'dateutc', 'utctime', 'utc_time', 'time', 'date', 'timestamp', 'datetime']) ?? '',
    )
    if (time === undefined) continue

    let pair = (pick(row, ['market', 'pair', 'symbol']) ?? '').replace(/"/g, '').replace(/\//g, '').toUpperCase()
    if (!pair) {
      const base = pick(row, ['baseasset', 'coin', 'base'])?.replace(/"/g, '').toUpperCase()
      const quote = pick(row, ['quoteasset', 'quote'])?.replace(/"/g, '').toUpperCase()
      if (base && quote) pair = `${base}${quote}`
    }
    if (!pair) continue

    const price = parseNumber(
      pick(row, [
        'averageprice',
        'price',
        'avgtradingprice',
        'avgprice',
        'orderprice',
        'tradeprice',
        'executedprice',
      ]) ?? '',
    )
    const quantity = parseNumber(
      pick(row, [
        'executed',
        'executed2',
        'amount',
        'filled',
        'executedqty',
        'executedamount',
        'executedquantity',
        'quantity',
        'orderamount',
      ]) ?? '',
    )
    if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) continue

    let quoteAmount = parseNumber(
      pick(row, ['tradingtotal', 'total', 'quoteqty', 'executedquote', 'executedtotal']) ?? '',
    )
    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) quoteAmount = price * quantity

    const feeRaw = pick(row, ['fee', 'commission']) ?? ''
    const fee = parseNumber(feeRaw)
    const feeAsset =
      pick(row, ['feecoin', 'commissionasset', 'feeasset', 'feecurrency'])?.replace(/"/g, '').toUpperCase() ||
      parseFeeAsset(feeRaw)

    // Id estável por conteúdo — reimportar o mesmo CSV / outro export não duplica
    const id = fillFingerprint({
      time,
      symbol: pair,
      side,
      price,
      quantity,
      quoteAmount,
    })
    fills.push({
      id,
      time,
      symbol: pair,
      side,
      price,
      quantity,
      quoteAmount,
      fee: Number.isFinite(fee) ? Math.abs(fee) : undefined,
      feeAsset,
    })
  }

  return dedupeFillsByFingerprint(fills).sort((a, b) => a.time - b.time)
}

/** Chave estável para merge entre imports (ignora order id / índice da linha). */
export function fillFingerprint(
  fill: Pick<BinanceFill, 'time' | 'symbol' | 'side' | 'price' | 'quantity' | 'quoteAmount'>,
): string {
  const q = Number(fill.quoteAmount.toFixed(8))
  const p = Number(fill.price.toFixed(10))
  const qty = Number(fill.quantity.toFixed(8))
  return `${fill.time}|${fill.symbol}|${fill.side}|${p}|${qty}|${q}`
}

export function dedupeFillsByFingerprint(fills: BinanceFill[]): BinanceFill[] {
  const map = new Map<string, BinanceFill>()
  for (const fill of fills) {
    const id = fillFingerprint(fill)
    const prev = map.get(id)
    if (!prev) {
      map.set(id, { ...fill, id })
      continue
    }
    // Preferir linha com fee preenchida
    if ((prev.fee === undefined || prev.fee === 0) && fill.fee) map.set(id, { ...fill, id })
  }
  return [...map.values()]
}

function splitCsvLine(line: string, delimiter = ','): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === delimiter && !inQuotes) {
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
