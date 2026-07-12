import type { HuntBrief, HuntCandidate, HuntResponse } from './types'

export function getHuntAngles(brief: HuntBrief): string[] {
  const isAll = brief.category === 'Tudo'
  const lotsOnly = !!brief.lotsOnly

  if (lotsOnly) {
    return isAll
      ? [
          'wholesale job lots and liquidation pallets of clothing/shoes',
          'multi-item bundles of sneakers/streetwear (2+ pairs/pieces per listing)',
          'bulk bags of secondhand clothing job lots',
        ]
      : [
          `wholesale job lots of ${brief.category}`,
          `multi-item bundles/packs of ${brief.category}`,
          `bulk lots of ${brief.category} from clearance sales`,
        ]
  }

  return isAll
    ? [
        'single hero items with highest ROI (sneakers, streetwear, designer)',
        'job lots, bundles and wholesale pallets of clothing/shoes',
        'trending/hyped brands selling fast right now',
      ]
    : [
        `underpriced single ${brief.category} items with best ROI`,
        `job lots and bundles of ${brief.category}`,
        `trending / high-demand ${brief.category} right now`,
      ]
}

export function mergeHuntResults(
  batches: Array<{ items: HuntCandidate[]; failed: boolean }>,
  target: number,
): HuntResponse {
  const merged = batches.flatMap((b) => b.items)
  const allFailed = batches.every((b) => b.failed)
  const anyFailed = batches.some((b) => b.failed)

  const seenKey = new Set<string>()
  const seenUrl = new Set<string>()
  const unique: HuntCandidate[] = []

  for (const r of merged) {
    const key = (r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40)
    const urlKey = normUrl(r.sourceUrl || '')
    if (!key || seenKey.has(key) || seenUrl.has(urlKey)) continue
    seenKey.add(key)
    seenUrl.add(urlKey)
    unique.push(r)
  }

  return {
    items: unique.slice(0, target),
    allFailed,
    anyFailed,
    batchCount: batches.length,
  }
}

function normUrl(u: string) {
  try {
    const url = new URL(u)
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return u
  }
}
