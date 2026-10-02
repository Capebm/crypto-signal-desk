import { useState } from 'react'
import { authErrorMessage, DESK_OWNER_EMAIL, signInDeskPassword } from '../../lib/supabase'

/** As pesquisas e estimativas passam pelas /api/*, que só respondem à conta do Desk. */
export default function DeskLoginPanel() {
  const [email, setEmail] = useState(DESK_OWNER_EMAIL)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      await signInDeskPassword(email, password)
      setPassword('')
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" style={{ maxWidth: 420, marginBottom: 20 }}>
      <div className="panel-eyebrow">Entrar</div>
      <p className="hint" style={{ fontSize: 12, marginBottom: 12 }}>
        Pesquisas e estimativas só funcionam com a tua conta. Sem password? Define-a no Crypto Desk → tab Sinais.
      </p>
      {error && <div className="err">{error}</div>}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="fl">
          Email
          <input className="in" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="fl">
          Password
          <input className="in" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="cta" type="submit" disabled={busy || !password}>{busy ? 'A entrar…' : 'Entrar'}</button>
      </form>
    </section>
  )
}
