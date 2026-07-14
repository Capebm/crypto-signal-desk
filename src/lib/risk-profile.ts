export type RiskProfile = 'conservador' | 'equilibrado' | 'agressivo'

export const riskProfiles = {
  conservador: { label: 'Conservador', minimumScore: 5, minimumRiskReward: 2, maximumRsi: 65, description: 'Checklist TJR completo + R:R mínimo 2× até liquidez oposta.' },
  equilibrado: { label: 'Equilibrado', minimumScore: 4, minimumRiskReward: 1.5, maximumRsi: 70, description: 'Checklist TJR completo + R:R mínimo 1,5×.' },
  agressivo: { label: 'Agressivo', minimumScore: 3, minimumRiskReward: 1.2, maximumRsi: 75, description: 'Checklist TJR completo + R:R mínimo 1,2×.' },
} as const
