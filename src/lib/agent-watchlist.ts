import { AGENT_QUOTE_ASSET } from './binance'

const PINS_KEY = 'agent-pin-bases'
const SEED_KEY = 'agent-pin-seeded-v1'

/** Pins iniciais: alts que o diário já usou e podem ficar fora do top de volume. */
export const AGENT_DEFAULT_PINS = ['PYTH', 'ACH', 'TOWNS', 'SUI'] as const

export function normalizeAgentBase(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(new RegExp(`${AGENT_QUOTE_ASSET}$`), '')
}

export function readAgentPins(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY)
    if (!raw) {
      if (!localStorage.getItem(SEED_KEY)) {
        localStorage.setItem(SEED_KEY, '1')
        localStorage.setItem(PINS_KEY, JSON.stringify([...AGENT_DEFAULT_PINS]))
      }
      return [...AGENT_DEFAULT_PINS]
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...AGENT_DEFAULT_PINS]
    const bases = parsed
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeAgentBase)
      .filter((base) => base.length >= 2 && base.length <= 12)
    return [...new Set(bases)]
  } catch {
    return [...AGENT_DEFAULT_PINS]
  }
}

export function writeAgentPins(bases: string[]): string[] {
  const next = [...new Set(bases.map(normalizeAgentBase).filter((base) => base.length >= 2))]
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(next))
    localStorage.setItem(SEED_KEY, '1')
  } catch {
    /* ignore */
  }
  return next
}

export function addAgentPin(raw: string): string[] {
  const base = normalizeAgentBase(raw)
  if (base.length < 2) return readAgentPins()
  return writeAgentPins([...readAgentPins(), base])
}

export function removeAgentPin(raw: string): string[] {
  const base = normalizeAgentBase(raw)
  return writeAgentPins(readAgentPins().filter((item) => item !== base))
}

export function agentPinSymbols(quote = AGENT_QUOTE_ASSET): string[] {
  return readAgentPins().map((base) => `${base}${quote}`)
}
