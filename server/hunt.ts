import {
  collectSearchUrls,
  extractJSON,
  resolveListing,
  textFromAnthropic,
} from './garimpo-json'
import type { HuntBrief, HuntCandidate, HuntResponse, HuntSettings } from './types'

interface HuntResultItem {
  name?: string
  category?: string
  source?: string
  sourceUrl?: string
  estBuyPrice?: number
  currency?: string
  region?: string
  qty?: number
  ptLow?: number
  ptMid?: number
  ptHigh?: number
  demand?: 'hot' | 'steady' | 'slow'
  confidence?: 'high' | 'medium' | 'low'
  note?: string
}

function mapResult(
  r: HuntResultItem,
  brief: HuntBrief,
  batchTag: string,
  i: number,
): HuntCandidate {
  return {
    id: `hunt-${batchTag}-${Date.now()}-${i}`,
    name: r.name || 'oportunidade',
    category: brief.category === 'Tudo' ? r.category || 'Outro' : brief.category || 'Outro',
    size: '',
    condition: 'good',
    region:
      r.region === 'EU' || r.region === 'nonEU'
        ? r.region
        : brief.region === 'EU'
          ? 'EU'
          : 'nonEU',
    currency: ['EUR', 'GBP', 'USD', 'PLN'].includes(r.currency || '') ? (r.currency as string) : 'EUR',
    buyPrice: r.estBuyPrice ?? '',
    sourceShip: '',
    qty: r.qty || 1,
    resaleOverride: '',
    ai: {
      low: Number(r.ptLow),
      mid: Number(r.ptMid),
      high: Number(r.ptHigh),
      demand: r.demand || 'steady',
      confidence: r.confidence || 'medium',
      note: r.note || '',
    },
    sourceUrl: r.sourceUrl || '',
    sourceName: r.source || 'web',
    _hunted: true,
  }
}

async function callAnthropic(body: Record<string, unknown>, apiKey: string): Promise<{
  type?: string
  content?: Array<{ type: string; text?: string; content?: Array<{ url?: string; title?: string }>; citations?: Array<{ url?: string; title?: string }> }>
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${err.slice(0, 200)}`)
  }

  return res.json() as Promise<{
    type?: string
    content?: Array<{ type: string; text?: string; content?: Array<{ url?: string; title?: string }>; citations?: Array<{ url?: string; title?: string }> }>
  }>
}

export async function estimateResale(
  candidate: Pick<HuntCandidate, 'name' | 'category' | 'size' | 'condition'>,
  apiKey: string,
) {
  const prompt = `You are an expert appraiser for the Vinted PORTUGAL secondhand market. Estimate the realistic resale price in EUR a Portuguese buyer would pay on Vinted for the item below, and how fast it sells. PT secondhand prices run LOWER than UK/FR/DE. Be realistic and slightly conservative.

Item: ${candidate.name || '(sem nome)'}
Category: ${candidate.category}
Size: ${candidate.size || 'n/a'}
Condition: ${candidate.condition}

Return ONLY raw JSON, no markdown:
{"low":number,"mid":number,"high":number,"demand":"hot"|"steady"|"slow","confidence":"high"|"medium"|"low","note":"max 9 words about PT demand"}`

  const data = await callAnthropic(
    { model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] },
    apiKey,
  )
  const p = extractJSON(textFromAnthropic(data)) as Record<string, unknown>
  return {
    low: Number(p.low),
    mid: Number(p.mid),
    high: Number(p.high),
    demand: p.demand as 'hot' | 'steady' | 'slow',
    confidence: p.confidence as 'high' | 'medium' | 'low',
    note: String(p.note || ''),
  }
}

async function huntBatch(
  brief: HuntBrief,
  angle: string,
  batchTag: string,
  perBatch: number,
  settings: HuntSettings,
  apiKey: string,
) {
  const isAll = brief.category === 'Tudo'
  const lotsOnly = !!brief.lotsOnly
  const srcTxt = brief.sources.length
    ? brief.sources.join(', ')
    : 'Vinted ES, Wallapop, eBay UK/DE, wholesale/liquidation lots'
  const focus = isAll
    ? 'ANY fashion category that sells fast on Vinted PT (sneakers, streetwear, denim, jackets, coats, bags, accessories, kids, sportswear). Give VARIETY.'
    : brief.category
  const lotsRule = lotsOnly
    ? `\n\nHARD RULE: only return MULTI-ITEM LOTS/BUNDLES/PACKS — job lots, wholesale pallets, liquidation bundles. EVERY item must have qty >= 2.`
    : ''
  const maxBuyRule =
    brief.maxBuy && Number(brief.maxBuy) > 0
      ? `\n- Max buy price: ${brief.maxBuy} EUR — HARD CAP on total listing price.`
      : '\n- Max buy price: no hard limit'

  const prompt = `You are a sourcing scout for a reseller who BUYS WORLDWIDE and SELLS on Vinted PORTUGAL. Use web search (up to 3 searches total) to find REAL, currently-listed opportunities to flip for margin in Portugal.

BRIEF
- Hunting: ${brief.what || (isAll ? 'the best flips available right now' : 'profitable resale items')}
- Item focus: ${focus}
- THIS BATCH angle: ${angle}
- Preferred sources: ${srcTxt}${maxBuyRule}
- Buying from: ${brief.region === 'EU' ? 'within the EU (no import VAT)' : brief.region === 'nonEU' ? 'outside the EU (23% import VAT applies in PT)' : 'anywhere — mix EU and non-EU sources'}${lotsRule}

Estimate realistic RESALE price on Vinted PORTUGAL in EUR. Only include items whose ptMid clearly beats the landed buy cost.

LINKS — CRITICAL: "sourceUrl" must be that ONE item's own specific listing page — NEVER a generic search page. If you cannot reach a specific item page, DROP that item.

Exactly ${perBatch} items max, all DIFFERENT, short fields:
[{"name":string,"category":string,"source":string,"sourceUrl":string,"estBuyPrice":number,"currency":"EUR"|"GBP"|"USD","region":"EU"|"nonEU","qty":number,"ptLow":number,"ptMid":number,"ptHigh":number,"demand":"hot"|"steady"|"slow","confidence":"high"|"medium"|"low","note":"max 6 words"}]`

  try {
    const data = await callAnthropic(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      },
      apiKey,
    )

    if (data.type === 'error') return { items: [] as HuntCandidate[], failed: true, reason: 'api_error' }

    const text = textFromAnthropic(data)
    let arr: HuntResultItem[]
    try {
      arr = extractJSON(text) as HuntResultItem[]
    } catch {
      return { items: [], failed: true, reason: 'parse' }
    }
    if (!Array.isArray(arr)) return { items: [], failed: true, reason: 'shape' }

    const pool = collectSearchUrls(data)
    const out: HuntCandidate[] = []

    arr.forEach((r, i) => {
      if (lotsOnly && (!r.qty || Number(r.qty) < 2)) return
      const maxBuy = Number(brief.maxBuy)
      if (maxBuy > 0) {
        const rate = settings.fx[r.currency || 'EUR'] ?? settings.fx.EUR ?? 1
        const buyEUR = (Number(r.estBuyPrice) || 0) * rate
        if (buyEUR > maxBuy * 1.05) return
      }
      const resolved = resolveListing(r.sourceUrl || '', pool)
      if (!resolved) return
      const m = mapResult(r, brief, batchTag, i)
      m.sourceUrl = resolved.url
      m._exactLink = true
      m._verified = resolved.verified
      out.push(m)
    })

    return { items: out, failed: false, reason: pool.length ? null : 'no_urls' }
  } catch {
    return { items: [], failed: true, reason: 'network' }
  }
}

export async function huntOpportunities(
  brief: HuntBrief,
  settings: HuntSettings,
  apiKey: string,
): Promise<HuntResponse> {
  const target = settings.huntTarget || 20
  const isAll = brief.category === 'Tudo'
  const lotsOnly = !!brief.lotsOnly

  const angles = lotsOnly
    ? isAll
      ? [
          'wholesale job lots and liquidation pallets of clothing/shoes',
          'multi-item bundles of sneakers/streetwear (2+ pairs/pieces per listing)',
          'bulk bags of secondhand clothing job lots',
          'clearance / overstock multi-item packs',
        ]
      : [
          `wholesale job lots of ${brief.category}`,
          `multi-item bundles/packs of ${brief.category}`,
          `bulk lots of ${brief.category} from clearance sales`,
        ]
    : isAll
      ? [
          'single hero items with highest ROI (sneakers, streetwear, designer)',
          'job lots, bundles and wholesale pallets of clothing/shoes',
          'trending/hyped brands selling fast right now',
          'underpriced coats, denim and jackets with strong PT demand',
          'bags, accessories and kids clothing with good margin',
        ]
      : [
          `underpriced single ${brief.category} items with best ROI`,
          `job lots and bundles of ${brief.category}`,
          `trending / high-demand ${brief.category} right now`,
        ]

  const perBatch = Math.min(4, Math.max(3, Math.ceil(target / angles.length)))
  const batches = await Promise.all(
    angles.map((a, i) => huntBatch(brief, a, `b${i}`, perBatch, settings, apiKey)),
  )

  const merged = batches.flatMap((b) => b.items)
  const allFailed = batches.every((b) => b.failed)
  const anyFailed = batches.some((b) => b.failed)

  const seenKey = new Set<string>()
  const seenUrl = new Set<string>()
  const unique: HuntCandidate[] = []

  for (const r of merged) {
    const key = (r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40)
    const urlKey = normUrlLocal(r.sourceUrl || '')
    if (!key || seenKey.has(key) || seenUrl.has(urlKey)) continue
    seenKey.add(key)
    seenUrl.add(urlKey)
    unique.push(r)
  }

  return { items: unique.slice(0, target), allFailed, anyFailed, batchCount: angles.length }
}

function normUrlLocal(u: string) {
  try {
    const url = new URL(u)
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return u
  }
}
