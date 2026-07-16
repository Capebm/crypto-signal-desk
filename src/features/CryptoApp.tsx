import { useEffect, useState } from 'react'
import AgentDashboard from './agent/AgentDashboard'
import JournalDashboard from './journal/JournalDashboard'

type CryptoTab = 'agent' | 'journal'

const TAB_KEY = 'crypto-desk-tab'

export default function CryptoApp() {
  const [tab, setTab] = useState<CryptoTab>(() => {
    const saved = localStorage.getItem(TAB_KEY)
    return saved === 'journal' ? 'journal' : 'agent'
  })

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  return (
    <>
      <nav className="crypto-tabs" aria-label="Secções Crypto Desk">
        <button type="button" className={tab === 'agent' ? 'active' : ''} onClick={() => setTab('agent')}>
          Agente TJR
        </button>
        <button type="button" className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}>
          Diário
        </button>
      </nav>
      {tab === 'agent' ? <AgentDashboard /> : <JournalDashboard />}
    </>
  )
}
