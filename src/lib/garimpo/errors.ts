/** Turn gateway HTML / raw API text into a short Portuguese message for the UI. */
export function humanizeErrorText(text: string, status?: number): string | null {
  const raw = (text || '').trim()
  if (!raw) return null

  const lower = raw.toLowerCase()

  if (
    lower.includes('inactivity timeout') ||
    lower.includes('gateway timeout') ||
    lower.includes('timed out') ||
    status === 504 ||
    status === 502
  ) {
    return 'Pedido demorou demasiado (timeout). A pesquisa com IA é lenta — tenta outra vez ou usa Scrapers UE.'
  }

  if (lower.includes('<html') || lower.includes('<!doctype')) {
    const title = raw.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    const heading = raw.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim()
    const label = (title || heading || '').toLowerCase()
    if (label.includes('timeout') || label.includes('inactivity')) {
      return 'Pedido demorou demasiado (timeout). Tenta outra vez ou usa Scrapers UE.'
    }
    if (title || heading) return title || heading || null
    return 'Erro temporário no servidor — tenta outra vez.'
  }

  if (lower.includes('credit balance is too low')) {
    return 'Créditos Anthropic esgotados. Vai a console.anthropic.com → Plans & Billing e adiciona créditos.'
  }

  if (raw.length > 200) return `${raw.slice(0, 180)}…`
  return raw
}

export function humanizeErrorMessage(message: string): string {
  return humanizeErrorText(message) ?? message
}
