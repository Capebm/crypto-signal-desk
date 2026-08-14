export type RiskProfile = 'conservador' | 'equilibrado' | 'agressivo'

export type TjrGates = {
  requireSweep: boolean
  requireContinuationTouch: boolean
  requireSmtAlign: boolean
}

export const riskProfiles = {
  conservador: { label: 'Conservador', minimumScore: 5, minimumRiskReward: 1.2, maximumRsi: 65, description: 'Modelo TJR 4 passos (sweep→5m BOS→FVG→1m entrada) + SMT + discount · R:R ≥ 1.2× na liquidez · COMPRAR JÁ só com step 4 + janela NY.' },
  equilibrado: { label: 'Equilibrado', minimumScore: 4, minimumRiskReward: 1.2, maximumRsi: 70, description: 'Mesmos 4 passos TJR; R:R ≥ 1.2× (vídeo 2026 ~1–1.3×). COMPRAR JÁ só após BOS 1m.' },
  agressivo: { label: 'Agressivo', minimumScore: 3, minimumRiskReward: 1.0, maximumRsi: 75, description: 'Sweep HTF obrigatório; FVG/SMT mais flexíveis. COMPRAR JÁ só após confirmação e step 4.' },
} as const

export const tjrGates: Record<RiskProfile, TjrGates> = {
  conservador: { requireSweep: true, requireContinuationTouch: true, requireSmtAlign: true },
  equilibrado: { requireSweep: true, requireContinuationTouch: true, requireSmtAlign: false },
  agressivo: { requireSweep: true, requireContinuationTouch: false, requireSmtAlign: false },
}
