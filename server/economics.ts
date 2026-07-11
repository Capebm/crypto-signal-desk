import type { HuntCandidate, HuntSettings } from './types'

const DEMAND_W = { hot: 1, steady: 0.6, slow: 0.28 }
const CONF_W = { high: 1, medium: 0.72, low: 0.48 }

const SCORE_WEIGHTS = {
  roi: 0.24,
  profit: 0.22,
  volume: 0.13,
  demand: 0.17,
  confidence: 0.09,
  ticket: 0.09,
  region: 0.06,
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function ticketLiquidity(buyerAllIn: number | null) {
  if (buyerAllIn == null) return 0.5
  if (buyerAllIn < 8) return 0.35
  if (buyerAllIn <= 70) return 1
  if (buyerAllIn <= 120) return 0.75
  if (buyerAllIn <= 200) return 0.5
  return 0.3
}

export function scoreOpportunity(e: EconomicsResult, c: HuntCandidate) {
  if (!e.hasResale || (e.profitPerUnit ?? 0) <= 0) {
    return { score: 0, parts: { roi: 0, profit: 0, volume: 0, demand: 0, confidence: 0, ticket: 0, region: 0 } }
  }
  const parts = {
    roi: clamp01((e.roi ?? 0) / 2),
    profit: clamp01((e.profitPerUnit ?? 0) / 40),
    volume: clamp01((e.totalProfit ?? 0) / 200),
    demand: DEMAND_W[c.ai?.demand ?? 'steady'] ?? 0.55,
    confidence: CONF_W[c.ai?.confidence ?? 'medium'] ?? 0.7,
    ticket: ticketLiquidity(e.buyerAllIn),
    region: c.region === 'EU' ? 1 : 0.8,
  }
  let s = 0
  for (const k of Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>) {
    s += SCORE_WEIGHTS[k] * parts[k]
  }
  return { score: Math.round(s * 100), parts }
}

export interface EconomicsResult {
  qty: number
  buyEUR: number
  shipEUR: number
  importCost: number
  landedTotal: number
  landedPerUnit: number
  resale: number | null
  hasResale: boolean
  profitPerUnit: number | null
  roi: number | null
  soldUnits: number
  totalProfit: number | null
  buyerAllIn: number | null
  capitalNeeded: number
  score: number
  parts: Record<string, number>
  verdict: 'flip' | 'thin' | 'skip' | 'wait'
}

export function computeEconomics(c: HuntCandidate, s: HuntSettings): EconomicsResult {
  const rate = s.fx[c.currency] ?? 1
  const qty = Math.max(1, Number(c.qty) || 1)
  const buyEUR = (Number(c.buyPrice) || 0) * rate
  const shipEUR = (Number(c.sourceShip) || 0) * rate
  const base = buyEUR + shipEUR
  let importCost = 0
  if (c.region === 'nonEU') {
    importCost += base * (s.vatPct / 100)
    if (s.applyDuty && base > s.dutyThreshold) importCost += base * (s.dutyPct / 100)
  }
  const landedTotal = base + importCost
  const landedPerUnit = landedTotal / qty
  const aiMid = c.ai ? Number(c.ai.mid) : null
  const resale =
    c.resaleOverride != null && c.resaleOverride !== '' ? Number(c.resaleOverride) : aiMid
  const hasResale = resale != null && !Number.isNaN(resale)
  const profitPerUnit = hasResale ? resale - landedPerUnit : null
  const roi = hasResale && landedPerUnit > 0 ? (profitPerUnit ?? 0) / landedPerUnit : null
  const soldUnits = qty * (s.sellThrough / 100)
  const totalProfit = hasResale ? (profitPerUnit ?? 0) * soldUnits : null
  const buyerAllIn = hasResale ? resale + resale * 0.05 + 0.7 + s.vintedShip : null

  const e0 = {
    qty,
    buyEUR,
    shipEUR,
    importCost,
    landedTotal,
    landedPerUnit,
    resale,
    hasResale,
    profitPerUnit,
    roi,
    soldUnits,
    totalProfit,
    buyerAllIn,
    capitalNeeded: landedTotal,
    score: 0,
    parts: {},
    verdict: 'wait' as const,
  }
  const { score, parts } = scoreOpportunity(e0, c)

  let verdict: EconomicsResult['verdict'] = 'wait'
  if (hasResale) {
    if ((profitPerUnit ?? 0) <= 0) verdict = 'skip'
    else if (score >= s.scoreFlip) verdict = 'flip'
    else if (score >= s.scoreThin) verdict = 'thin'
    else verdict = 'skip'
  }

  return { ...e0, score, parts, verdict }
}

export const SCORE_LABELS: Record<string, string> = {
  roi: 'ROI',
  profit: 'lucro/un',
  volume: 'volume lote',
  demand: 'procura',
  confidence: 'confiança',
  ticket: 'liquidez',
  region: 'origem',
}

export const VERDICT = {
  flip: { label: 'BOM FLIP', color: 'var(--gold)', bg: 'rgba(184,230,45,.12)' },
  thin: { label: 'MARGEM CURTA', color: 'var(--amber)', bg: 'rgba(245,166,35,.12)' },
  skip: { label: 'PASSA', color: 'var(--coral)', bg: 'rgba(232,103,79,.12)' },
  wait: { label: 'POR AVALIAR', color: 'var(--muted)', bg: 'rgba(138,148,160,.10)' },
}

export const DEMAND = { hot: 'procura alta', steady: 'procura estável', slow: 'procura lenta' }
