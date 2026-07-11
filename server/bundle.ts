const BUNDLE_KEYWORDS = [
  'lote',
  'lotes',
  'pack',
  'packs',
  'bundle',
  'conjunto',
  'conjuntos',
  'variado',
  'variados',
  'misto',
  'mistos',
  'kg',
  'kilo',
  'bulk',
  'caixa',
  'saco',
  'job lot',
  'wholesale',
  'atacado',
]

export function detectBundle(title: string, description: string): { isBundle: boolean; score: number } {
  const text = `${title} ${description}`.toLowerCase()
  let score = 0

  for (const keyword of BUNDLE_KEYWORDS) {
    if (text.includes(keyword)) score += 1
  }

  const quantityMatch = text.match(/\b(\d{2,})\s*(peças|pecas|artigos|items|itens|pares|pcs)\b/)
  if (quantityMatch) score += 2

  const kgMatch = text.match(/\b(\d+)\s*kg\b/)
  if (kgMatch) score += 2

  return { isBundle: score >= 1, score }
}

export function cleanSearchQuery(title: string): string {
  return title
    .replace(/\b(lote[s]?|pack[s]?|bundle[s]?|conjunto[s]?|variado[s]?|misto[s]?)\b/gi, '')
    .replace(/\b(\d+)\s*(peças|pecas|artigos|items|itens|pares|pcs|kg)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
