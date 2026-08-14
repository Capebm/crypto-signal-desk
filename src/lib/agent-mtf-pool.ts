/** Prático/Malha (9 setups, não Disciplina): mesmas regras práticas que o T212 crypto. */
export function agentUsesPracticalConfirm(tjrVideoStrict: boolean, scanAllSetups: boolean): boolean {
  return !tjrVideoStrict && scanAllSetups
}

type ScoutRow = {
  symbol: string
  action: string
  bias?: string
  opposedSweep?: boolean
}

/** Prioridade: cryptos T212 → COMPRAR → longs limpos → scout → resto, até `limit`. */
export function selectAgentMtfPool<T extends ScoutRow>(
  sorted: T[],
  options: {
    scanAllSetups: boolean
    scoutSymbols: Set<string>
    prioritySymbols: Set<string>
    limit: number
  },
): T[] {
  const pool: T[] = []
  const pushUnique = (row: T) => {
    if (pool.length >= options.limit) return
    if (pool.some((item) => item.symbol === row.symbol)) return
    pool.push(row)
  }
  for (const row of sorted) {
    if (options.prioritySymbols.has(row.symbol)) pushUnique(row)
  }
  for (const row of sorted.filter((item) => item.action === 'COMPRAR')) pushUnique(row)
  if (options.scanAllSetups) {
    for (const row of sorted.filter((item) => item.action === 'ESPERAR' && item.bias === 'bullish' && !item.opposedSweep)) {
      pushUnique(row)
    }
    for (const row of sorted) {
      if (options.scoutSymbols.has(row.symbol)) pushUnique(row)
    }
    for (const row of sorted) pushUnique(row)
  }
  return pool.slice(0, options.limit)
}
