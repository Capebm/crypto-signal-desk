import { useEffect, useState } from 'react'
import { CRYPTO_TAB_EVENT, type CryptoTab } from '../lib/crypto-tabs'
import AgentDashboard from './agent/AgentDashboard'
import JournalDashboard from './journal/JournalDashboard'

const TAB_KEY = 'crypto-desk-tab'

type Props = { onSwitchApp?: (app: 'garimpo' | 'crypto') => void }

export default function CryptoApp({ onSwitchApp }: Props) {
  const [tab, setTab] = useState<CryptoTab>(() => {
    const saved = localStorage.getItem(TAB_KEY)
    return saved === 'journal' ? 'journal' : 'agent'
  })

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  useEffect(() => {
    const onTab = (event: Event) => {
      const detail = (event as CustomEvent<CryptoTab>).detail
      if (detail === 'agent' || detail === 'journal') setTab(detail)
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
            title="Agente TJR"
          >
            <span className="desk-rail-icon" aria-hidden>◈</span>
            <span>Agente</span>
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
        {tab === 'agent' ? <AgentDashboard /> : <JournalDashboard />}
      </div>
    </div>
  )
}
