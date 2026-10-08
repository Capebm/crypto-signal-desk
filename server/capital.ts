/**
 * Capital.com (conta demo): preços CFD em tempo real para os índices fora dos EUA,
 * que no Yahoo chegam com 15 min de atraso. Só lê preços; credenciais só no servidor.
 */

type CandleDto = { openTime: number; open: number; high: number; low: number; close: number; volume: number }
type Side = { bid?: number; ask?: number }
type CapitalPrice = {
  snapshotTimeUTC?: string
  openPrice?: Side
  closePrice?: Side
  highPrice?: Side
  lowPrice?: Side
  lastTradedVolume?: number
}

export type CapitalEnv = { apiKey: string; identifier: string; password: string; demo: boolean }

export function capitalEnv(env: Record<string, string | undefined> = process.env): CapitalEnv | undefined {
  const apiKey = env.CAPITAL_API_KEY?.trim()
  const identifier = env.CAPITAL_IDENTIFIER?.trim()
  const password = env.CAPITAL_API_PASSWORD?.trim()
  if (!apiKey || !identifier || !password) return undefined
  return { apiKey, identifier, password, demo: env.CAPITAL_DEMO?.trim() !== 'false' }
}

const baseUrl = (env: CapitalEnv) =>
  env.demo ? 'https://demo-api-capital.backend-capital.com/api/v1' : 'https://api-capital.backend-capital.com/api/v1'

/** A sessão dura 10 min desde o último uso; renova-se aos 8 para não falhar a meio de um scan. */
const SESSION_TTL_MS = 8 * 60_000
let session: { cst: string; token: string; at: number; key: string } | undefined
let opening: Promise<{ cst: string; token: string }> | undefined

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function openSession(env: CapitalEnv): Promise<{ cst: string; token: string }> {
  // POST /session: 1 pedido/s por chave → uma só abertura em curso, com uma nova tentativa após 429.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl(env)}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CAP-API-KEY': env.apiKey },
      body: JSON.stringify({ identifier: env.identifier, password: env.password, encryptedPassword: false }),
      signal: AbortSignal.timeout(8_000),
    })
    if (response.status === 429) {
      await wait(1_100)
      continue
    }
    const cst = response.headers.get('CST')
    const token = response.headers.get('X-SECURITY-TOKEN')
    if (!response.ok || !cst || !token) {
      const body = (await response.json().catch(() => ({}))) as { errorCode?: string }
      throw new Error(`Capital.com: sessão recusada (${body.errorCode ?? response.status})`)
    }
    return { cst, token }
  }
  throw new Error('Capital.com: limite de sessões (tenta daqui a segundos)')
}

async function sessionHeaders(env: CapitalEnv, fresh = false) {
  const key = `${env.demo}:${env.apiKey}`
  if (fresh || !session || session.key !== key || Date.now() - session.at > SESSION_TTL_MS) {
    opening ??= openSession(env).finally(() => {
      opening = undefined
    })
    const opened = await opening
    session = { ...opened, at: Date.now(), key }
  }
  session.at = Date.now()
  return { CST: session.cst, 'X-SECURITY-TOKEN': session.token }
}

/** GET autenticado; sessão expirada (401) → abre outra e repete uma vez. */
async function capitalGet<T>(env: CapitalEnv, path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${baseUrl(env)}${path}`, {
      headers: { ...(await sessionHeaders(env, attempt > 0)), 'X-CAP-API-KEY': env.apiKey },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 401 && attempt === 0) continue
    const body = (await response.json().catch(() => ({}))) as T & { errorCode?: string }
    if (!response.ok) throw new Error(`Capital.com ${response.status}${body.errorCode ? ` — ${body.errorCode}` : ''}`)
    return body
  }
  throw new Error('Capital.com: sessão inválida')
}

const mid = (side?: Side) => (side?.bid !== undefined && side?.ask !== undefined ? (side.bid + side.ask) / 2 : side?.bid ?? side?.ask)

export function parseCapitalPrices(prices: CapitalPrice[]): CandleDto[] {
  const candles: CandleDto[] = []
  for (const row of prices) {
    const openTime = Date.parse(`${row.snapshotTimeUTC ?? ''}Z`)
    const open = mid(row.openPrice)
    const high = mid(row.highPrice)
    const low = mid(row.lowPrice)
    const close = mid(row.closePrice)
    if (!Number.isFinite(openTime) || ![open, high, low, close].every((v) => typeof v === 'number' && Number.isFinite(v))) continue
    candles.push({ openTime, open: open!, high: high!, low: low!, close: close!, volume: row.lastTradedVolume ?? 0 })
  }
  return candles.sort((a, b) => a.openTime - b.openTime)
}

const SPECS = [
  { key: '1h' as const, resolution: 'HOUR', max: 300 },
  { key: '15m' as const, resolution: 'MINUTE_15', max: 300 },
  { key: '5m' as const, resolution: 'MINUTE_5', max: 300 },
  { key: '1m' as const, resolution: 'MINUTE', max: 300 },
]

export async function fetchCapitalPack(env: CapitalEnv, epic: string) {
  const candles: Partial<Record<'1h' | '15m' | '5m' | '1m', CandleDto[]>> = {}
  // 4 pedidos por índice; o limite é 10/s por utilizador.
  for (const spec of SPECS) {
    const body = await capitalGet<{ prices?: CapitalPrice[] }>(env, `/prices/${encodeURIComponent(epic)}?resolution=${spec.resolution}&max=${spec.max}`)
    candles[spec.key] = parseCapitalPrices(body.prices ?? [])
  }
  return candles
}

const resolvedEpics = new Map<string, string>()

/**
 * Velas por «epic»; se a Capital.com não o conhecer (404), procura pelo nome do instrumento
 * (ex. «Switzerland 20») e usa o primeiro índice encontrado. Devolve o epic usado.
 */
export async function fetchCapitalPackResolving(env: CapitalEnv, epic: string, name?: string) {
  const known = resolvedEpics.get(epic) ?? epic
  try {
    return { epic: known, candles: await fetchCapitalPack(env, known) }
  } catch (error) {
    const notFound = error instanceof Error && /not-found\.epic|404/.test(error.message)
    if (!notFound || !name) throw error
    const match = (await searchCapitalMarkets(env, name)).find((market) => market.instrumentType === 'INDICES')
    if (!match) throw new Error(`Capital.com: sem índice para «${name}»`)
    resolvedEpics.set(epic, match.epic)
    return { epic: match.epic, candles: await fetchCapitalPack(env, match.epic) }
  }
}

/** Meses dos contratos (Z2026 = dezembro 2026). */
const MONTH_CODES = 'FGHJKMNQUVXZ'

function contractOrder(epic: string): number {
  const match = /([FGHJKMNQUVXZ])(\d{4})$/.exec(epic)
  return match ? Number(match[2]) * 12 + MONTH_CODES.indexOf(match[1]) : Number.MAX_SAFE_INTEGER
}

const FUTURES_TTL_MS = 6 * 3_600_000
const futuresByName = new Map<string, { epic?: string; at: number }>()

/** O futuro mais próximo («Germany 40 Future») — a mesma referência que a T212 usa nos índices. */
async function findCapitalFuture(env: CapitalEnv, name: string): Promise<string | undefined> {
  const cached = futuresByName.get(name)
  if (cached && Date.now() - cached.at < FUTURES_TTL_MS) return cached.epic
  const markets = await searchCapitalMarkets(env, name)
  const futures = markets
    .filter((market) => market.instrumentType === 'INDICES' && /future/i.test(market.instrumentName))
    .filter((market) => !market.marketStatus || market.marketStatus === 'TRADEABLE' || market.marketStatus === 'CLOSED')
    .sort((a, b) => contractOrder(a.epic) - contractOrder(b.epic))
  const epic = futures[0]?.epic
  futuresByName.set(name, { epic, at: Date.now() })
  return epic
}

export type CapitalScale = 'futures' | 'cash'

/**
 * A T212 cota os índices pelos futuros. Usa o futuro da Capital.com quando existe (escala = T212);
 * senão o índice à vista, marcado 'cash' para o Desk não dar JÁ com níveis desfasados.
 */
export async function fetchCapitalIndexPack(env: CapitalEnv, cashEpic: string, name?: string) {
  if (name) {
    const future = await findCapitalFuture(env, name).catch(() => undefined)
    if (future) return { epic: future, scale: 'futures' as CapitalScale, candles: await fetchCapitalPack(env, future) }
  }
  const cash = await fetchCapitalPackResolving(env, cashEpic, name)
  return { ...cash, scale: 'cash' as CapitalScale }
}

/** Para encontrar o «epic» de um mercado (ex. «Germany 40» → DE40). */
export async function searchCapitalMarkets(env: CapitalEnv, term: string) {
  const body = await capitalGet<{ markets?: { epic: string; instrumentName: string; instrumentType: string; marketStatus?: string }[] }>(
    env,
    `/markets?searchTerm=${encodeURIComponent(term)}`,
  )
  return (body.markets ?? []).slice(0, 15).map(({ epic, instrumentName, instrumentType, marketStatus }) => ({ epic, instrumentName, instrumentType, marketStatus }))
}
