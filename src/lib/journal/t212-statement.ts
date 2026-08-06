/** Tipos + helpers partilhados do ledger T212 (CSV). */

export type T212ExecDirection = 'Buy' | 'Sell'
export type T212ExecSource = 'cfd' | 'invest'

/** Uma ordem EXECUTED (OPEN/CLOSE) do CSV History. */
export type T212Execution = {
  /** Id estável para merge entre CSVs. */
  id: string
  time: number
  instrument: string
  orderId: string
  direction: T212ExecDirection
  size: number
  price: number
  value?: number
  result?: number
  source: T212ExecSource
  /** Position ID do CSV T212 (POS…). */
  positionId?: string
}

export function t212ExecutionId(e: Omit<T212Execution, 'id'>): string {
  return `${e.source}:${e.orderId}:${e.time}:${e.direction}:${e.size}:${e.price}`
}

export function dedupeExecutions(executions: T212Execution[]): T212Execution[] {
  const map = new Map<string, T212Execution>()
  for (const e of executions) {
    const id = e.id || t212ExecutionId(e)
    const prev = map.get(id)
    if (!prev) {
      map.set(id, { ...e, id })
      continue
    }
    if (prev.result === undefined && e.result !== undefined) map.set(id, { ...e, id })
    if (!prev.positionId && e.positionId) map.set(id, { ...prev, ...e, id })
  }
  return [...map.values()]
}
