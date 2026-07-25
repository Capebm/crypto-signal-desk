/** Regras operacionais Spot (diário) — não alteram o CSV. */

/** Horas máximas sugeridas em posição sem progresso claro (TP / BOS a favor). */
export const TIME_STOP_HOURS = 8

export const TIME_STOP_NOTE =
  `Time-stop ${TIME_STOP_HOURS}h: se não estiveres perto do TP ou com BOS a favor, considera sair — holds longos concentraram perdas no diário.`

export function hoursSinceIso(iso?: string, now = Date.now()): number | undefined {
  if (!iso) return undefined
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return undefined
  return Math.max(0, (now - t) / 3_600_000)
}

export function isPastTimeStop(iso?: string, hours = TIME_STOP_HOURS, now = Date.now()): boolean {
  const age = hoursSinceIso(iso, now)
  return age !== undefined && age >= hours
}
