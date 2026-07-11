import type { Analysis } from './types'
import { riskProfiles, type RiskProfile } from './risk-profile'

export type Action = 'COMPRAR' | 'VENDER' | 'ESPERAR'

export type Decision = {
  action: Action
  confidence: 'Alta' | 'Média' | 'Baixa'
  reasons: string[]
  entry?: number
  stop?: number
  target?: number
  riskReward?: number
}

export function decide(analysis: Analysis, profile: RiskProfile = 'equilibrado'): Decision {
  const { signal, states } = analysis
  const reasons = [...signal.reasons]
  const riskReward = signal.riskReward ?? 0
  const thresholds = riskProfiles[profile]

  if (
    signal.score >= thresholds.minimumScore
    && riskReward >= thresholds.minimumRiskReward
    && states.trend === 'positive'
    && states.macd === 'positive'
    && states.riskReward === 'positive'
    && analysis.rsi < thresholds.maximumRsi
    && analysis.robust.stochasticRsi < 90
    && analysis.price >= analysis.robust.vwap
    && analysis.robust.trendStrength >= 0.5
  ) {
    return {
      action: 'COMPRAR',
      confidence: signal.score >= 5 && analysis.volumeRatio >= 1.2 ? 'Alta' : 'Média',
      reasons: [...reasons, 'Preço acima do VWAP e volatilidade/tendência passam os filtros adicionais.'],
      entry: signal.entry,
      stop: signal.stop,
      target: signal.target,
      riskReward,
    }
  }

  if (signal.score <= -2 && states.trend === 'negative' && states.macd === 'negative' && analysis.price <= analysis.robust.vwap) {
    return {
      action: 'VENDER',
      confidence: signal.score <= -3 ? 'Alta' : 'Média',
      reasons: [...reasons, 'Preço abaixo do VWAP confirma fraqueza adicional.'],
      entry: signal.entry,
      stop: signal.stop,
      target: signal.target,
      riskReward,
    }
  }

  return {
    action: 'ESPERAR',
    confidence: 'Baixa',
    reasons: reasons.length ? reasons : ['Não há informação suficiente para uma decisão.'],
    entry: signal.entry,
    stop: signal.stop,
    target: signal.target,
    riskReward,
  }
}
