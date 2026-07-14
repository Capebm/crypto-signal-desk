export type RiskProfile = 'conservador' | 'equilibrado' | 'agressivo'

export type TjrGates = {
  requireSweep: boolean
  requireContinuationTouch: boolean
  requireSmtAlign: boolean
}

export const riskProfiles = {
  conservador: { label: 'Conservador', minimumScore: 5, minimumRiskReward: 2, maximumRsi: 65, description: 'Checklist TJR completo (sweep + confirmação + continuação + SMT) e R:R ≥ 2×.' },
  equilibrado: { label: 'Equilibrado', minimumScore: 4, minimumRiskReward: 1.5, maximumRsi: 70, description: 'Liquidez + confirmação + retrace a FVG/equilibrium. SMT opcional.' },
  agressivo: { label: 'Agressivo', minimumScore: 3, minimumRiskReward: 1.2, maximumRsi: 75, description: 'Bias + confirmação (BOS/inverse FVG) bastam; continuação e SMT não bloqueiam.' },
} as const

export const tjrGates: Record<RiskProfile, TjrGates> = {
  conservador: { requireSweep: true, requireContinuationTouch: true, requireSmtAlign: true },
  equilibrado: { requireSweep: false, requireContinuationTouch: true, requireSmtAlign: false },
  agressivo: { requireSweep: false, requireContinuationTouch: false, requireSmtAlign: false },
}
