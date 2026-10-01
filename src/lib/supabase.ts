import { createClient, type Session } from '@supabase/supabase-js'

/**
 * Supabase do Desk. URL e chave publishable são públicas por desenho: o acesso é
 * decidido pelas políticas RLS (só a sessão de capebm@gmail.com lê/escreve as suas linhas).
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://ixidmdvaqgfwkcohclnn.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_X6A3D4MuV9GphEM_cp235A_L_I1WGl8'

export const DESK_OWNER_EMAIL = 'capebm@gmail.com'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

let cachedSession: Session | null = null
void supabase.auth.getSession().then(({ data }) => {
  cachedSession = data.session
})
supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session
})

/** Síncrono: há sessão guardada? (para decidir se sincroniza sem esperar pela rede). */
export function hasDeskSession(): boolean {
  if (cachedSession) return true
  try {
    return Object.keys(localStorage).some((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
  } catch {
    return false
  }
}

export async function currentDeskUser() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

/** Link mágico: volta para esta mesma página (local ou Netlify). */
export async function sendDeskMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  })
  if (error) throw error
}

/**
 * Código do email (6–8 dígitos). Necessário na web app do iPhone: o link abre no Safari,
 * que tem armazenamento separado da app do ecrã principal — o código entra na própria app.
 */
export async function verifyDeskCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.replace(/\D/g, ''),
    type: 'email',
  })
  if (error) throw error
}

/** Mensagens do Supabase Auth em português. */
export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/rate limit/i.test(message)) return 'Limite de emails atingido (2 por hora no plano grátis). Usa o código do último email ou tenta daqui a 1 hora.'
  if (/expired|invalid/i.test(message)) return 'Código inválido ou expirado. Usa o código do email mais recente.'
  if (/signups not allowed/i.test(message)) return 'Este email não tem conta no Desk.'
  return message || 'Falha no login.'
}

const PENDING_LOGIN_KEY = 'desk-pending-login-v1'

/** Lembra o email/hora do último envio: a web app do iPhone pode recarregar ao trocar de app. */
export function readPendingLogin(): { email: string; sentAt: number } | undefined {
  try {
    const raw = localStorage.getItem(PENDING_LOGIN_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { email: string; sentAt: number }
    return Date.now() - parsed.sentAt < 60 * 60_000 ? parsed : undefined
  } catch {
    return undefined
  }
}

export function writePendingLogin(value?: { email: string; sentAt: number }) {
  try {
    if (value) localStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(value))
    else localStorage.removeItem(PENDING_LOGIN_KEY)
  } catch {
    /* ignore */
  }
}

export async function signOutDesk() {
  await supabase.auth.signOut()
}
