/** Shared open-position form (Agent pin + Position Advisor). Does not touch TJR engine. */

export const OPEN_POSITION_KEY = 'tjr-open-positions'

export type SavedOpenPosition = {
  base: string
  entryPrice: string
  quantity: string
  userStop: string
  userTarget: string
  lockOco: boolean
  /** ISO when last analysed / registered from Binance wizard. */
  savedAt?: string
}

export function loadOpenPosition(): SavedOpenPosition | undefined {
  try {
    const raw = localStorage.getItem(OPEN_POSITION_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as SavedOpenPosition
    if (!parsed.base || !parsed.entryPrice) return undefined
    return {
      base: parsed.base,
      entryPrice: parsed.entryPrice,
      quantity: parsed.quantity ?? '',
      userStop: parsed.userStop ?? '',
      userTarget: parsed.userTarget ?? '',
      lockOco: parsed.lockOco !== false,
      savedAt: parsed.savedAt,
    }
  } catch {
    return undefined
  }
}

export function saveOpenPosition(position: SavedOpenPosition) {
  localStorage.setItem(OPEN_POSITION_KEY, JSON.stringify({ ...position, savedAt: position.savedAt ?? new Date().toISOString() }))
}

export function clearOpenPosition() {
  localStorage.removeItem(OPEN_POSITION_KEY)
}

export function parseOpenNumber(value: string): number | undefined {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}
