import { tpModeMeta, tpModes, type TpMode } from '../../lib/tp-mode'

type Props = {
  open: boolean
  onClose: () => void
  active: TpMode
}

export default function TpModeModal({ open, onClose, active }: Props) {
  if (!open) return null
  return (
    <div className="agent-modal-bg" onClick={onClose} role="presentation">
      <div className="agent-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="tp-mode-title">
        <div className="agent-modal-head">
          <h2 id="tp-mode-title">Modo de take-profit</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="agent-modal-body">
          <p>
            O stop fica igual (estrutura / 2º swing). O que muda é <strong>onde colocas o Limit Maker de venda</strong>.
            Se tinhas quase só stops a bater, usa alvos mais perto (1R ou 1.5R).
          </p>
          <ul className="tp-mode-explain-list">
            {tpModes.map((mode) => (
              <li key={mode} className={mode === active ? 'active' : ''}>
                <strong>{tpModeMeta[mode].label}</strong>
                <span>{tpModeMeta[mode].description}</span>
              </li>
            ))}
          </ul>
          <p className="tp-mode-tip">
            Dica: com conta pequena e alts, <strong>1R</strong> ou <strong>1.5R</strong> costuma fechar mais trades a verde.
            «Liquidez» é o estilo TJR clássico (PDH/PDL / sessão) — melhor R:R, menos hits de TP.
          </p>
          <button type="button" className="agent-modal-ok" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  )
}
