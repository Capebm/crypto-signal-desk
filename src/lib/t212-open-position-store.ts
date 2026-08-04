/** Posição CFD aberta no T212 — separado do Spot Agente. */

export const T212_OPEN_POSITION_KEY = 't212-open-position-v1'

export type SavedT212OpenPosition = {
  instrumentId: string
  side: 'long' | 'short'
  entryPrice: string
  quantity: string
  userStop: string
  userTarget: string
  lockOco: boolean
  savedAt?: string
}

export function loadT212OpenPosition(): SavedT212OpenPosition | undefined {
  try {
    const raw = localStorage.getItem(T212_OPEN_POSITION_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as SavedT212OpenPosition
    if (!parsed.instrumentId || !parsed.entryPrice) return undefined
    return {
      instrumentId: parsed.instrumentId,
      side: parsed.side === 'short' ? 'short' : 'long',
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

export function saveT212OpenPosition(position: SavedT212OpenPosition) {
  localStorage.setItem(
    T212_OPEN_POSITION_KEY,
    JSON.stringify({ ...position, savedAt: position.savedAt ?? new Date().toISOString() }),
  )
}

export function clearT212OpenPosition() {
  localStorage.removeItem(T212_OPEN_POSITION_KEY)
}
