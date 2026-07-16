import { useEffect, useState } from 'react'
import CryptoApp from './features/CryptoApp'
import Garimpo from './features/garimpo/Garimpo'
import AppFooter from './components/AppFooter'

type ActiveApp = 'garimpo' | 'crypto'

export default function App() {
  const [app, setApp] = useState<ActiveApp>(() => {
    const saved = localStorage.getItem('active-app')
    return saved === 'crypto' ? 'crypto' : 'garimpo'
  })

  useEffect(() => {
    localStorage.setItem('active-app', app)
    document.title = app === 'crypto' ? 'Crypto Signal Desk' : 'GARIMPO — compra no mundo, vende em PT'
  }, [app])

  return (
    <>
      <nav className="app-switcher" aria-label="Escolher aplicação">
        <button
          type="button"
          className={app === 'garimpo' ? 'active' : ''}
          onClick={() => setApp('garimpo')}
        >
          GARIMPO
        </button>
        <button
          type="button"
          className={app === 'crypto' ? 'active' : ''}
          onClick={() => setApp('crypto')}
        >
          Crypto Desk
        </button>
      </nav>
      {app === 'garimpo' ? <Garimpo /> : <CryptoApp />}
      <AppFooter />
    </>
  )
}
