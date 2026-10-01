import type { RiskWarning } from '../lib/risk-rules'

/** Avisos de risco (não bloqueiam): ficam também gravados no sinal para validação. */
export default function RiskWarningChips({ warnings }: { warnings: RiskWarning[] }) {
  if (!warnings.length) return null
  return (
    <div className="risk-chip-row" role="list" aria-label="Avisos de risco">
      {warnings.map((warning) => (
        <span key={warning.code} role="listitem" className={`risk-chip risk-chip-${warning.code}`} title={warning.detail}>
          ⚠ {warning.label}
        </span>
      ))}
    </div>
  )
}
