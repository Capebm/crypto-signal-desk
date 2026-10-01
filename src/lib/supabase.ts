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

export async function signOutDesk() {
  await supabase.auth.signOut()
}
