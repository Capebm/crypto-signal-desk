function scanBalanced(t: string, start: number) {
  let depth = 0
  let inStr = false
  let esc = false
  const openCh = t[start]
  const closeCh = openCh === '[' ? ']' : '}'
  for (let i = start; i < t.length; i++) {
    const ch = t[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === openCh) depth++
    else if (ch === closeCh) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function repairTruncatedArray(slice: string) {
  let cut = slice.lastIndexOf('},')
  if (cut === -1) cut = slice.lastIndexOf('}')
  if (cut === -1) return '[]'
  return `${slice.slice(0, cut + 1)}]`
}

export function extractJSON(text: string): unknown {
  const t = (text || '').replace(/```json|```/g, '')
  let start = -1
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '[') continue
    let j = i + 1
    while (j < t.length && /\s/.test(t[j])) j++
    if (t[j] === '{' || t[j] === ']') {
      start = i
      break
    }
  }
  if (start !== -1) {
    const end = scanBalanced(t, start)
    if (end !== -1) return JSON.parse(t.slice(start, end + 1))
    return JSON.parse(repairTruncatedArray(t.slice(start)))
  }
  const objStart = t.indexOf('{')
  if (objStart === -1) throw new Error('sem JSON na resposta')
  const objEnd = scanBalanced(t, objStart)
  if (objEnd !== -1) return JSON.parse(t.slice(objStart, objEnd + 1))
  throw new Error('objeto JSON truncado')
}

export function textFromAnthropic(data: { content?: Array<{ type: string; text?: string }> }) {
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

const GOOD_HOSTS = [
  'ebay.',
  'vinted.',
  'aliexpress.',
  'vestiairecollective.',
  'depop.',
  'grailed.',
  'etsy.',
  'amazon.',
  'wallapop.',
  'catawiki.',
  'vinokilo.',
  'olx.',
]

export function validUrl(u: string) {
  if (!u || typeof u !== 'string') return false
  try {
    const url = new URL(u.trim())
    if (!/^https?:$/.test(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    if (host.length < 4 || host === 'example.com') return false
    return GOOD_HOSTS.some((h) => host.includes(h)) || url.pathname.length > 1
  } catch {
    return false
  }
}

const SEARCH_PATH_HINTS = [
  '/sch/',
  '/catalog?',
  '/catalog/',
  'wholesale?searchtext',
  '/search?',
  '/search/',
  '/shop?',
  '/results',
  '/category/',
  '/categories/',
]

export function looksLikeSearchPage(u: string) {
  let p: string
  try {
    const url = new URL(u)
    p = `${url.pathname}?${url.search}`.toLowerCase()
  } catch {
    return true
  }
  return SEARCH_PATH_HINTS.some((h) => p.includes(h))
}

export function normUrl(u: string) {
  try {
    const url = new URL(u)
    return `${url.origin.toLowerCase().replace(/^http:/, 'https:')}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return u
  }
}

export function collectSearchUrls(data: {
  content?: Array<{
    type: string
    content?: Array<{ url?: string; title?: string }>
    citations?: Array<{ url?: string; title?: string }>
  }>
}) {
  const out: Array<{ url: string; title: string }> = []
  for (const b of data.content || []) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const it of b.content) if (it?.url) out.push({ url: it.url, title: it.title || '' })
    }
    if (b.type === 'text' && Array.isArray(b.citations)) {
      for (const cit of b.citations) if (cit?.url) out.push({ url: cit.url, title: cit.title || '' })
    }
  }
  const seen = new Set<string>()
  return out.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)))
}

export function resolveListing(
  sourceUrl: string,
  pool: Array<{ url: string }>,
): { url: string; verified: boolean } | null {
  const raw = sourceUrl.trim()
  if (!raw || !validUrl(raw) || looksLikeSearchPage(raw)) return null
  const verified = pool.some((p) => normUrl(p.url) === normUrl(raw))
  return { url: raw, verified }
}
