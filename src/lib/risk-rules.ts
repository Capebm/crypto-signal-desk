import { exchangeFor, NY_SESSION, type ExchangeSession } from './index-exchanges'
import type { InstrumentKind } from './trade-levels'

/**
 * Regras derivadas do diário ago–set 2026 (T212 97 trades, Spot 78).
 * Só o R:R bloqueia (no motor); estas regras avisam e ficam registadas no sinal
 * para serem validadas com dados antes de passarem a bloqueio.
 */

export type RiskSettings = {
  /** Capital da conta (moeda da corretora). */
  capital: number
  /** % do capital arriscado por trade (distância entry→stop). */
  riskPct: number
  maxOpenPositions: number
  /** Perda diária máxima em % do capital. */
  dailyLossPct: number
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  capital: 300,
  riskPct: 0.5,
  maxOpenPositions: 2,
  dailyLossPct: 2,
}

const RISK_SETTINGS_KEY = 'desk-risk-settings-v1'

export function readRiskSettings(): RiskSettings {
  try {
    const raw = localStorage.getItem(RISK_SETTINGS_KEY)
    if (!raw) return DEFAULT_RISK_SETTINGS
    const parsed = JSON.parse(raw) as Partial<RiskSettings>
    return sanitizeRiskSettings({ ...DEFAULT_RISK_SETTINGS, ...parsed })
  } catch {
    return DEFAULT_RISK_SETTINGS
  }
}

export function writeRiskSettings(settings: RiskSettings): RiskSettings {
  const clean = sanitizeRiskSettings(settings)
  try {
    localStorage.setItem(RISK_SETTINGS_KEY, JSON.stringify(clean))
  } catch {
    /* ignore */
  }
  return clean
}

function sanitizeRiskSettings(settings: RiskSettings): RiskSettings {
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  return {
    capital: clamp(Number(settings.capital), 10, 10_000_000, DEFAULT_RISK_SETTINGS.capital),
    riskPct: clamp(Number(settings.riskPct), 0.1, 5, DEFAULT_RISK_SETTINGS.riskPct),
    maxOpenPositions: Math.round(clamp(Number(settings.maxOpenPositions), 1, 20, DEFAULT_RISK_SETTINGS.maxOpenPositions)),
    dailyLossPct: clamp(Number(settings.dailyLossPct), 0.5, 20, DEFAULT_RISK_SETTINGS.dailyLossPct),
  }
}

/** Montante a arriscar e notional sugerido para que o stop custe riskPct do capital. */
export function riskBasedStake(
  settings: RiskSettings,
  entry?: number,
  stop?: number,
): { riskAmount: number; notional?: number; stopPct?: number } {
  const riskAmount = settings.capital * (settings.riskPct / 100)
  if (!entry || !stop || entry <= 0) return { riskAmount }
  const stopPct = Math.abs(entry - stop) / entry
  if (!(stopPct > 0)) return { riskAmount }
  return { riskAmount, notional: riskAmount / stopPct, stopPct: stopPct * 100 }
}

export type RiskWarningCode = 'fora_janela' | 'acao_cfd' | 'alt_sub_1' | 'max_posicoes' | 'limite_diario'

export type RiskWarning = { code: RiskWarningCode; label: string; detail: string }

/**
 * Janela com melhor resultado no diário: abertura da bolsa + 2h30 (NY: 09:30–12:00 ET).
 * Em hora local de cada bolsa, para seguir as mudanças de hora (NY: 13:30–16:00 UTC no verão, 14:30–17:00 no inverno).
 */
export const ENTRY_WINDOW_MINUTES = 150

const zoneClocks = new Map<string, Intl.DateTimeFormat>()

/** Minutos que o fuso está à frente (negativo: atrás) de UTC nesse instante. */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  let clock = zoneClocks.get(timeZone)
  if (!clock) {
    clock = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    zoneClocks.set(timeZone, clock)
  }
  const parts = clock.formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000)
}

export function inEntryWindow(at: Date, session: ExchangeSession = NY_SESSION): boolean {
  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes()
  const minutes = (((utcMinutes + zoneOffsetMinutes(at, session.timeZone)) % 1440) + 1440) % 1440
  return minutes >= session.openMinutes && minutes < session.openMinutes + ENTRY_WINDOW_MINUTES
}

/** Janela em hora local (ex. "14:30–17:00") para mostrar ao utilizador. */
export function entryWindowLocalLabel(reference = new Date(), session: ExchangeSession = NY_SESSION): string {
  const offset = zoneOffsetMinutes(reference, session.timeZone)
  const at = (localMinutes: number) => {
    const date = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 0, localMinutes - offset))
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  }
  return `${at(session.openMinutes)}–${at(session.openMinutes + ENTRY_WINDOW_MINUTES)}`
}

export const RISK_WARNING_TEXT: Record<RiskWarningCode, { label: string; detail: string }> = {
  fora_janela: {
    label: 'Fora da janela',
    detail: 'Fora da abertura da bolsa do ativo + 2h30 (NY: 09:30–12:00). Entradas depois das 12:00 de NY deram −35 € no T212 e −22 $ no Spot.',
  },
  acao_cfd: {
    label: 'Ação CFD',
    detail: 'Ações CFD: 59 trades, −43 € — toda a perda do T212. Prefere paper até haver edge.',
  },
  alt_sub_1: {
    label: 'Alt < 1 $',
    detail: 'Stop mínimo de 3,5% em alts < 1 $: perdas de ~3,6% contra ganhos medianos de 1,8%.',
  },
  max_posicoes: {
    label: 'Máx. posições',
    detail: 'Já tens o máximo de posições abertas definido nas regras de risco.',
  },
  limite_diario: {
    label: 'Limite diário',
    detail: 'A perda de hoje já atingiu o limite diário. Para por hoje.',
  },
}

export type RiskContext = {
  at: Date
  venue: 'spot' | 't212'
  instrumentKind: InstrumentKind
  entry?: number
  /** Ticker (ex. GER40): define a bolsa da janela de entrada; sem bolsa conhecida → NY. */
  symbol?: string
  openPositions: number
  /** PnL realizado hoje (negativo = perda). */
  todayPnl: number
  settings: RiskSettings
}

export function riskWarnings(context: RiskContext): RiskWarning[] {
  const codes: RiskWarningCode[] = []
  if (!inEntryWindow(context.at, exchangeFor(context.symbol))) codes.push('fora_janela')
  if (context.venue === 't212' && context.instrumentKind === 'stock') codes.push('acao_cfd')
  if (context.venue === 'spot' && context.entry !== undefined && context.entry < 1) codes.push('alt_sub_1')
  if (context.openPositions >= context.settings.maxOpenPositions) codes.push('max_posicoes')
  const dailyLimit = context.settings.capital * (context.settings.dailyLossPct / 100)
  if (context.todayPnl <= -dailyLimit) codes.push('limite_diario')
  return codes.map((code) => ({ code, ...RISK_WARNING_TEXT[code] }))
}

/** 'auto' = tamanho pelo risco (riskPct do capital até ao stop); número = montante fixo. */
export type StakeChoice = 'auto' | number

export function readStakeChoice(key: string): StakeChoice {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null || raw === 'auto') return 'auto'
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export function writeStakeChoice(key: string, choice: StakeChoice) {
  try {
    localStorage.setItem(key, String(choice))
  } catch {
    /* ignore */
  }
}

/**
 * Montante a usar. Auto: notional que faz o stop custar riskPct do capital,
 * limitado a maxLeverage × capital (Spot = 1×, sem alavancagem).
 */
export function resolveStake(
  choice: StakeChoice,
  entry: number | undefined,
  stop: number | undefined,
  maxLeverage: number,
  settings = readRiskSettings(),
): { amount: number; auto: boolean; riskAmount?: number } {
  if (choice !== 'auto') {
    const stopPct = entry && stop ? Math.abs(entry - stop) / entry : undefined
    return { amount: choice, auto: false, riskAmount: stopPct ? choice * stopPct : undefined }
  }
  const sized = riskBasedStake(settings, entry, stop)
  const cap = settings.capital * maxLeverage
  if (!sized.notional) return { amount: Math.min(cap, settings.capital * 0.2), auto: true }
  const amount = Math.max(1, Math.round(Math.min(cap, sized.notional)))
  return { amount, auto: true, riskAmount: amount * (sized.stopPct ?? 0) / 100 }
}
