import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { DESK_OWNER_EMAIL, DESK_SUPABASE_PUBLISHABLE_KEY, DESK_SUPABASE_URL } from '../src/lib/desk-config'

/**
 * Todas as /api/* só respondem à sessão Supabase do dono do Desk.
 * Sem Access-Control-Allow-Origin: o browser só chama a partir do próprio site (mesma origem).
 */
export const API_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export type AuthResult = { ok: true } | { ok: false; status: 401 | 403 | 503; error: string }

const CACHE_TTL_MS = 60_000
const CACHE_MAX = 20
const verified = new Map<string, number>()

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? '')
  return match?.[1]
}

/** Valida o access token no Supabase Auth (apanha logout/expiração) e confirma o email do dono. */
export async function verifyDeskOwner(authorization: string | undefined): Promise<AuthResult> {
  const token = bearerToken(authorization)
  if (!token || token.length > 4096) return { ok: false, status: 401, error: 'Sessão em falta — entra na tua conta.' }

  const now = Date.now()
  const until = verified.get(token)
  if (until && until > now) return { ok: true }

  let response: Response
  try {
    response = await fetch(`${process.env.SUPABASE_URL || DESK_SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: DESK_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    return { ok: false, status: 503, error: 'Não foi possível validar a sessão. Tenta outra vez.' }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, error: 'Sessão expirada — entra outra vez.' }
  }
  if (!response.ok) return { ok: false, status: 503, error: 'Não foi possível validar a sessão. Tenta outra vez.' }

  const user = (await response.json().catch(() => ({}))) as { email?: string }
  if (user.email?.toLowerCase() !== DESK_OWNER_EMAIL) {
    return { ok: false, status: 403, error: 'Esta conta não tem acesso ao Desk.' }
  }

  for (const [key, expiry] of verified) if (expiry <= now) verified.delete(key)
  if (verified.size >= CACHE_MAX) verified.clear()
  verified.set(token, now + CACHE_TTL_MS)
  return { ok: true }
}

const headerValue = (headers: HandlerEvent['headers'], name: string) =>
  headers[name] ?? headers[name.toLowerCase()] ?? undefined

/** Envolve um handler Netlify: OPTIONS → 204, sessão inválida → 401/403, resto → handler. */
export function withDeskAuth(handler: Handler): Handler {
  return async (event, context) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: API_HEADERS, body: '' }
    const auth = await verifyDeskOwner(headerValue(event.headers, 'authorization'))
    if (!auth.ok) {
      return { statusCode: auth.status, headers: API_HEADERS, body: JSON.stringify({ error: auth.error, auth: true }) }
    }
    return (await handler(event, context)) as HandlerResponse
  }
}
