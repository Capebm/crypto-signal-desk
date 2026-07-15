/** Stop/target math — shared by TJR engine and tests. */

export function computeLongStop(entry: number, rawStop: number): number {
  const minStopPct = 0.035
  const maxStopPct = 0.08
  return Math.max(entry * (1 - maxStopPct), Math.min(rawStop, entry * (1 - minStopPct)))
}

export function computeShortStop(entry: number, rawStop: number): number {
  const minStopPct = 0.035
  const maxStopPct = 0.08
  return Math.min(entry * (1 + maxStopPct), Math.max(rawStop, entry * (1 + minStopPct)))
}
