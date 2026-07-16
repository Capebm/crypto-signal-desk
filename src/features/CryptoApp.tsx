import { useEffect, useState } from 'react'
import { CRYPTO_TAB_EVENT, type CryptoTab } from '../lib/crypto-tabs'
import AgentDashboard from './agent/AgentDashboard'
import JournalDashboard from './journal/JournalDashboard'

const TAB_KEY = 'crypto-desk-tab'

export default function CryptoApp() {
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
