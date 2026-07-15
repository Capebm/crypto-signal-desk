export type SessionWindow = 'ny' | 'london' | 'quiet' | 'off'

export type TradingSessionStatus = {
  window: SessionWindow
  inIdealWindow: boolean
  badge: string
  nowLisbon: string
}

const lisbonTime = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return { hour, minute, mins: hour * 60 + minute, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}

export function getTradingSessionStatus(date = new Date()): TradingSessionStatus {
  const { mins, label } = lisbonTime(date)

  if (mins >= 13 * 60 + 30 && mins < 17 * 60) {
    return { window: 'ny', inIdealWindow: true, badge: 'Janela NY ativa', nowLisbon: label }
  }
  if (mins >= 8 * 60 && mins < 12 * 60) {
    return { window: 'london', inIdealWindow: false, badge: 'Sessão Londres', nowLisbon: label }
  }
  if (mins >= 22 * 60 || mins < 2 * 60) {
    return { window: 'quiet', inIdealWindow: false, badge: 'Baixa liquidez', nowLisbon: label }
  }
  return { window: 'off', inIdealWindow: false, badge: 'Fora da janela ideal', nowLisbon: label }
}
