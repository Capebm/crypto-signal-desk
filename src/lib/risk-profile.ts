export type RiskProfile = 'conservador' | 'equilibrado' | 'agressivo'

export type TjrGates = {
  requireSweep: boolean
  requireContinuationTouch: boolean
  requireSmtAlign: boolean
}

/** R:R mínimo absoluto para qualquer JÁ. Com ~47% de acerto, 1R perde após custos; 1.5R fica positivo a partir de ~42%. */
export const MIN_RR_FLOOR = 1.5

export const riskProfiles = {
  conservador: { label: 'Conservador', minimumScore: 5, minimumRiskReward: 1.5, maximumRsi: 65, description: 'Modelo TJR 4 passos (sweep→5m BOS→FVG→1m entrada) + SMT + discount · R:R ≥ 1.5× na liquidez · COMPRAR JÁ só com step 4 + janela NY.' },
  equilibrado: { label: 'Equilibrado', minimumScore: 4, minimumRiskReward: 1.5, maximumRsi: 70, description: 'Mesmos 4 passos TJR; R:R ≥ 1.5×. COMPRAR JÁ só após BOS 1m.' },
  agressivo: { label: 'Agressivo', minimumScore: 3, minimumRiskReward: 1.5, maximumRsi: 75, description: 'Sweep HTF obrigatório; R:R ≥ 1.5×; FVG/SMT mais flexíveis. COMPRAR JÁ só após confirmação e step 4.' },
} as const

export const tjrGates: Record<RiskProfile, TjrGates> = {
  conservador: { requireSweep: true, requireContinuationTouch: true, requireSmtAlign: true },
  equilibrado: { requireSweep: true, requireContinuationTouch: true, requireSmtAlign: false },
  agressivo: { requireSweep: true, requireContinuationTouch: false, requireSmtAlign: false },
}
