import { useEffect, useState } from 'react'

const KEY = 'tjr-onboarding-v1'

const slides = [
  {
    title: '1 · Killzone NY open',
    body: 'COMPRAR JÁ (conservador/equilibrado) só na NY open — cerca de 14:30–16:00 em Lisboa. Fora disso, zero candidatos é normal.',
  },
  {
    title: '2 · Analisar → expandir',
    body: 'Analisa o mercado, filtra Comprar já, expande o cartão. O painel Binance dá valores para copiar (MTF ✓).',
  },
  {
    title: '3 · Compra + OCO + Diário',
    body: 'Compra → coloca OCO (stop + TP) → regista no Diário (CSV ou manual). O algoritmo TJR não muda: só te guia a executar.',
  },
]

type Props = { forceOpen?: boolean; onClose?: () => void }

export default function OnboardingModal({ forceOpen = false, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (forceOpen) {
      setOpen(true)
      setStep(0)
      return
    }
    try {
      if (!localStorage.getItem(KEY)) setOpen(true)
    } catch {
      /* ignore */
    }
  }, [forceOpen])

  const close = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
    onClose?.()
  }

  if (!open) return null
  const slide = slides[step]

  return (
    <div className="agent-modal-bg" role="presentation">
      <div className="agent-modal onboard-modal" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
        <div className="agent-modal-head">
          <h2 id="onboard-title">{slide.title}</h2>
          <button type="button" onClick={close} aria-label="Fechar">×</button>
        </div>
        <div className="agent-modal-body">
          <p className="eyebrow">PRIMEIRA VEZ</p>
          <p>{slide.body}</p>
          <div className="onboard-dots" aria-hidden>
            {slides.map((_, index) => (
              <span key={slides[index].title} className={index === step ? 'active' : ''} />
            ))}
          </div>
          <div className="onboard-actions">
            {step < slides.length - 1 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)}>Seguinte</button>
            ) : (
              <button type="button" onClick={close}>Começar a operar</button>
            )}
            <button type="button" className="ghost" onClick={close}>Saltar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
