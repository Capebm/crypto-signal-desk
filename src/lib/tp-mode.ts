export type TpMode = '1r' | '1_5r' | 'liquidez'

export const tpModes: TpMode[] = ['1r', '1_5r', 'liquidez']

export const tpModeMeta: Record<TpMode, { label: string; short: string; multiple?: number; description: string }> = {
  '1r': {
    label: 'TP 1R (rápido)',
    short: '1R',
    multiple: 1,
    description: 'Take-profit a 1× o risco (distância entry→stop). Alvos mais perto — mais hits de TP, menos “só stop”. Ideal se tinhas muitos limit loss.',
  },
  '1_5r': {
    label: 'TP 1.5R (equilibrado)',
    short: '1.5R',
    multiple: 1.5,
    description: 'Take-profit a 1.5× o risco — próximo do que o TJR reporta como média (~1.2–1.3R). Bom compromisso entre frequência de TP e tamanho do ganho.',
  },
  liquidez: {
    label: 'TP liquidez (TJR)',
    short: 'Liquidez',
    description: 'Alvo no próximo draw HTF (PDH/PDL, sessão NY/Londres) com R:R entre o mínimo do perfil e 3×. Pode ficar mais longe — melhor R:R, mas mais stops em alts ruidosas.',
  },
}
