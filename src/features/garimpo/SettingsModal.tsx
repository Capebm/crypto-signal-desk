import { X } from 'lucide-react'
import type { HuntSettings } from '../../../server/types'

interface SettingsModalProps {
  settings: HuntSettings
  setS: <K extends keyof HuntSettings>(key: K, value: HuntSettings[K]) => void
  onClose: () => void
  onReset: () => void
}

function NumRow({
  label,
  val,
  onChange,
  step,
}: {
  label: string
  val: number
  onChange: (v: string) => void
  step?: string
}) {
  return (
    <label className="numrow">
      <span>{label}</span>
      <input className="in mono sm" type="number" step={step || '1'} value={val} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export default function SettingsModal({ settings, setS, onClose, onReset }: SettingsModalProps) {
  const setFx = (k: string, v: string) => setS('fx', { ...settings.fx, [k]: Number(v) || 0 })

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Definições</span>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="mgroup">
            <h4>Importação (fora da UE)</h4>
            <NumRow label="IVA Portugal %" val={settings.vatPct} onChange={(v) => setS('vatPct', Number(v))} />
            <label className="tog">
              <input type="checkbox" checked={settings.applyDuty} onChange={(e) => setS('applyDuty', e.target.checked)} />{' '}
              Direitos aduaneiros acima de €{settings.dutyThreshold}
            </label>
            <NumRow label="Direitos %" val={settings.dutyPct} onChange={(v) => setS('dutyPct', Number(v))} />
          </div>
          <div className="mgroup">
            <h4>Vinted PT</h4>
            <NumRow label="Portes domésticos €" val={settings.vintedShip} onChange={(v) => setS('vintedShip', Number(v))} />
            <NumRow label="Sell-through do lote %" val={settings.sellThrough} onChange={(v) => setS('sellThrough', Number(v))} />
          </div>
          <div className="mgroup">
            <h4>Câmbio (€ por unidade)</h4>
            {Object.keys(settings.fx)
              .filter((k) => k !== 'EUR')
              .map((k) => (
                <NumRow key={k} label={`1 ${k} =`} val={settings.fx[k]} step="0.01" onChange={(v) => setFx(k, v)} />
              ))}
          </div>
          <div className="mgroup">
            <h4>Score & caça</h4>
            <NumRow label="Score mín. BOM FLIP" val={settings.scoreFlip} onChange={(v) => setS('scoreFlip', Number(v))} />
            <NumRow label="Score mín. MARGEM CURTA" val={settings.scoreThin} onChange={(v) => setS('scoreThin', Number(v))} />
            <NumRow label="Resultados por caça" val={settings.huntTarget} onChange={(v) => setS('huntTarget', Math.max(4, Math.min(30, Number(v))))} />
          </div>
          <button type="button" className="reset" onClick={onReset}>
            Repor predefinições
          </button>
        </div>
      </div>
    </div>
  )
}
