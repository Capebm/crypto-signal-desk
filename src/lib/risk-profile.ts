export type RiskProfile = 'conservador' | 'equilibrado' | 'agressivo'

export const riskProfiles = {
  conservador: { label: 'Conservador', minimumScore: 5, minimumRiskReward: 2, maximumRsi: 65, description: 'Exige sinal mais forte e alvo pelo menos duas vezes maior que o risco.' },
  equilibrado: { label: 'Equilibrado', minimumScore: 4, minimumRiskReward: 1.5, maximumRsi: 70, description: 'Equilibra frequência de sinais e margem de segurança.' },
  agressivo: { label: 'Agressivo', minimumScore: 3, minimumRiskReward: 1.2, maximumRsi: 75, description: 'Aceita mais sinais e menor margem; não elimina risco.' },
} as const
