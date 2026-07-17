import { useEffect, useState } from 'react'
import { CRYPTO_TAB_EVENT, type CryptoTab } from '../lib/crypto-tabs'
import AgentDashboard from './agent/AgentDashboard'
import JournalDashboard from './journal/JournalDashboard'
import T212Dashboard from './t212/T212Dashboard'

const TAB_KEY = 'crypto-desk-tab'

type Props = { onSwitchApp?: (app: 'garimpo' | 'crypto') => void }

const readTab = (): CryptoTab => {
  const saved = localStorage.getItem(TAB_KEY)
  if (saved === 'journal' || saved === 't212' || saved === 'agent') return saved
  return 'agent'
}

export default function CryptoApp({ onSwitchApp }: Props) {
  const [tab, setTab] = useState<CryptoTab>(readTab)

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  useEffect(() => {
    const onTab = (event: Event) => {
      const detail = (event as CustomEvent<CryptoTab>).detail
      if (detail === 'agent' || detail === 'journal' || detail === 't212') setTab(detail)
    }
    window.addEventListener(CRYPTO_TAB_EVENT, onTab)
    return () => window.removeEventListener(CRYPTO_TAB_EVENT, onTab)
  }, [])

  return (
    <div className="desk-shell">
      <aside className="desk-rail" aria-label="Navegação do desk">
        <div className="desk-brand" title="Crypto Signal Desk">
          <strong>CSD</strong>
          <span>Desk</span>
        </div>
        <nav className="desk-rail-nav">
          <button
            type="button"
            className={tab === 'agent' ? 'active' : ''}
            onClick={() => setTab('agent')}
            title="Agente TJR Spot"
          >
            <span className="desk-rail-icon" aria-hidden>◈</span>
            <span>Agente</span>
          </button>
          <button
            type="button"
            className={tab === 't212' ? 'active' : ''}
            onClick={() => setTab('t212')}
            title="Trading 212 CFD"
          >
            <span className="desk-rail-icon" aria-hidden>◇</span>
            <span>T212</span>
          </button>
          <button
            type="button"
            className={tab === 'journal' ? 'active' : ''}
            onClick={() => setTab('journal')}
            title="Diário"
          >
            <span className="desk-rail-icon" aria-hidden>☰</span>
            <span>Diário</span>
          </button>
        </nav>
        {onSwitchApp && (
          <div className="desk-rail-foot">
            <button type="button" className="desk-rail-ghost" onClick={() => onSwitchApp('garimpo')} title="Abrir Garimpo">
              Garimpo
            </button>
          </div>
        )}
      </aside>
      <div className="desk-main">
        {tab === 'agent' ? <AgentDashboard /> : tab === 't212' ? <T212Dashboard /> : <JournalDashboard />}
      </div>
    </div>
  )
}
