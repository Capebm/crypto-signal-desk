import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_RISK_SETTINGS,
  entryWindowLocalLabel,
  readRiskSettings,
  RISK_WARNING_TEXT,
  writeRiskSettings,
  type RiskSettings,
  type RiskWarningCode,
} from '../../lib/risk-rules'
import {
  computeSignalStats,
  DeskDbError,
  flushSignalQueue,
  pendingSignalCount,
  readSignalCache,
  refreshSignals,
  type DbState,
  type SignalBucket,
  type StoredSignal,
} from '../../lib/signal-log'
import { DESK_OWNER_EMAIL, hasDeskSession, sendDeskMagicLink, signOutDesk, supabase } from '../../lib/supabase'

/** Abaixo disto a expectancy ainda é ruído — não mudes regras com base nela. */
const MIN_SAMPLE = 30

const DB_STATE_TEXT: Record<DbState, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ok: { label: 'BD ligada', tone: 'ok' },
  'signed-out': { label: 'Sem sessão', tone: 'warn' },
  forbidden: { label: 'Sem acesso', tone: 'bad' },
  offline: { label: 'Offline', tone: 'warn' },
}

const STATUS_LABEL: Record<StoredSignal['status'], string> = {
  open: 'Aberto',
  tp: 'TP',
  sl: 'SL',
  expired: 'Expirou',
  ambiguous: 'SL/TP mesma vela',
}

const KIND_LABEL: Record<string, string> = {
  crypto: 'Crypto',
  stock: 'Ações',
  index: 'Índices',
  future: 'Futuros',
  forex: 'Forex',
  metal: 'Metais',
  energy: 'Energia',
}

const r = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2).replace('.', ',')}R`

const when = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export default function SignalsDashboard() {
  const [signals, setSignals] = useState<StoredSignal[]>(() => readSignalCache().signals)
  const [cacheAt, setCacheAt] = useState(() => readSignalCache().at)
  const [dbState, setDbState] = useState<DbState>(() => (hasDeskSession() ? 'ok' : 'signed-out'))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState(DESK_OWNER_EMAIL)
  const [userEmail, setUserEmail] = useState<string>()
  const [linkSent, setLinkSent] = useState(false)
  const [settings, setSettings] = useState<RiskSettings>(readRiskSettings)
  const [pending, setPending] = useState(pendingSignalCount)

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setUserEmail(data.session?.user.email)
    if (!data.session) {
      setDbState('signed-out')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const result = await refreshSignals()
      setSignals(result.signals)
      setCacheAt(new Date().toISOString())
      setDbState('ok')
      setMessage(result.resolved > 0 ? `${result.resolved} sinais resolvidos agora.` : '')
    } catch (error) {
      setDbState(error instanceof DeskDbError ? error.state : 'offline')
      setMessage(error instanceof Error ? error.message : 'Falha ao ler a BD.')
    } finally {
      setPending(pendingSignalCount())
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Volta do link mágico (ou sessão renovada) → actualiza sem recarregar.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void refresh()
    })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  const stats = useMemo(() => computeSignalStats(signals), [signals])
  const needsSetup = dbState !== 'ok'
  const stateText = DB_STATE_TEXT[dbState]

  const sendLink = async () => {
    setMessage('')
    try {
      await sendDeskMagicLink(email)
      setLinkSent(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o link.')
    }
  }

  const signOut = async () => {
    await signOutDesk()
    setLinkSent(false)
    await refresh()
  }

  useEffect(() => {
    if (dbState !== 'ok') return
    void flushSignalQueue().then((result) => setPending(result.queued))
  }, [dbState])

  const updateSetting = (key: keyof RiskSettings, raw: string) => {
    const value = Number(raw.replace(',', '.'))
    if (!Number.isFinite(value)) return
    setSettings(writeRiskSettings({ ...settings, [key]: value }))
  }

  return (
    <main className="journal-shell signals-shell">
      <header className="journal-header">
        <div>
          <p className="eyebrow">SINAIS MEDIDOS</p>
          <h1>O motor funciona?</h1>
          <p>
            Cada <strong>JÁ</strong> do Agente e do T212 é gravado e depois resolvido com velas 5m (TP, SL ou 48h).
            Não depende de entrares no trade.
          </p>
        </div>
        <div className="signals-head-actions">
          <span className={`db-pill ${stateText.tone}`}>{stateText.label}</span>
          {dbState !== 'signed-out' && (
            <button type="button" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'A atualizar…' : 'Atualizar'}
            </button>
          )}
        </div>
      </header>

      {message && <p className="journal-status">{message}</p>}
      {pending > 0 && (
        <p className="journal-status">{pending} sinais à espera de envio — vão sozinhos quando a BD responder.</p>
      )}

      <details className="journal-panel signals-settings" open={needsSetup}>
        <summary>Definições · conta e regras de risco</summary>
        <div className="signals-settings-grid">
          <section>
            <h2>Conta</h2>
            {userEmail ? (
              <div className="signals-account">
                <p className="journal-muted">Ligado como <strong>{userEmail}</strong>. A sessão fica guardada neste dispositivo.</p>
                <button type="button" className="ghost" onClick={() => void signOut()}>Sair</button>
              </div>
            ) : linkSent ? (
              <p className="journal-muted">
                Link enviado para <strong>{email}</strong>. Abre-o <strong>neste dispositivo</strong> — voltas aqui já com sessão.
              </p>
            ) : (
              <>
                <p className="journal-muted">Entra com o teu email (link mágico, sem password). Só esta conta tem acesso aos dados.</p>
                <form
                  className="signals-token-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void sendLink()
                  }}
                >
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-label="Email"
                  />
                  <button type="submit">Enviar link</button>
                </form>
              </>
            )}
          </section>
          <section>
            <h2>Regras de risco</h2>
            <div className="signals-risk-grid">
              <label>
                Capital
                <input inputMode="decimal" defaultValue={settings.capital} onBlur={(e) => updateSetting('capital', e.target.value)} />
              </label>
              <label>
                Risco por trade %
                <input inputMode="decimal" defaultValue={settings.riskPct} onBlur={(e) => updateSetting('riskPct', e.target.value)} />
              </label>
              <label>
                Máx. posições
                <input inputMode="numeric" defaultValue={settings.maxOpenPositions} onBlur={(e) => updateSetting('maxOpenPositions', e.target.value)} />
              </label>
              <label>
                Perda diária máx. %
                <input inputMode="decimal" defaultValue={settings.dailyLossPct} onBlur={(e) => updateSetting('dailyLossPct', e.target.value)} />
              </label>
            </div>
            <p className="journal-muted">
              Arriscas <strong>{(settings.capital * settings.riskPct / 100).toFixed(2).replace('.', ',')}</strong> por trade
              {' '}· paras o dia a −{(settings.capital * settings.dailyLossPct / 100).toFixed(2).replace('.', ',')}
              {' '}· janela {entryWindowLocalLabel()} (hora local). R:R mínimo 1,5 bloqueia o JÁ; o resto só avisa.
              {settings.riskPct !== DEFAULT_RISK_SETTINGS.riskPct && ' Recomendado: 0,5%.'}
            </p>
          </section>
        </div>
      </details>

      {stats.total === 0 ? (
        <section className="journal-empty journal-empty-onboarding">
          <p className="eyebrow">AINDA SEM SINAIS</p>
          <h2>Faz um scan no Agente ou T212</h2>
          <p>Os cartões JÁ ficam gravados aqui. Precisas de ~{MIN_SAMPLE} resolvidos antes de tirar conclusões.</p>
        </section>
      ) : (
        <>
          <section className="journal-kpis signals-kpis">
            <article>
              <span>Resolvidos</span>
              <strong>{stats.resolved}</strong>
              <small>{stats.open} abertos</small>
            </article>
            <article>
              <span>R médio</span>
              <strong className={stats.avgR >= 0 ? 'positive' : 'negative'}>{r(stats.avgR)}</strong>
              <small>por sinal</small>
            </article>
            <article>
              <span>Acerto</span>
              <strong>{stats.winRate.toFixed(0)}%</strong>
              <small>break-even a 1,5R ≈ 40%</small>
            </article>
            <article>
              <span>R total</span>
              <strong className={stats.totalR >= 0 ? 'positive' : 'negative'}>{r(stats.totalR)}</strong>
              <small>{cacheAt ? `lido ${when(cacheAt)}` : ''}</small>
            </article>
          </section>
          <p className={`signals-verdict ${stats.resolved < MIN_SAMPLE ? 'warn' : stats.avgR > 0 ? 'ok' : 'bad'}`}>
            {stats.resolved < MIN_SAMPLE
              ? `Amostra pequena (${stats.resolved}/${MIN_SAMPLE}). Não mudes regras do motor ainda.`
              : stats.avgR > 0
                ? `Edge positivo em ${stats.resolved} sinais. Compara "sem aviso" com os avisos antes de tornar algum em bloqueio.`
                : `Sem edge em ${stats.resolved} sinais. Não arrisques dinheiro real nesta versão.`}
          </p>

          <section className="journal-grid journal-grid-3">
            <SignalBucketPanel
              title="Por aviso"
              rows={stats.byWarning}
              label={(key) => (key === 'sem_aviso' ? 'Sem aviso' : RISK_WARNING_TEXT[key as RiskWarningCode]?.label ?? key)}
            />
            <SignalBucketPanel title="Por versão" rows={stats.byVersion} label={(key) => `V${key}`} />
            <SignalBucketPanel title="Por venue" rows={stats.byVenue} />
            <SignalBucketPanel title="Por classe" rows={stats.byKind} label={(key) => KIND_LABEL[key] ?? key} />
            <SignalBucketPanel title="Por hora (UTC)" rows={stats.byHourUtc} sortKeys />
          </section>

          <section className="journal-panel">
            <h2>Últimos sinais</h2>
            <div className="journal-trade-table-wrap">
              <table className="journal-trade-table signals-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Ativo</th>
                    <th>Lado</th>
                    <th>R:R</th>
                    <th>Estado</th>
                    <th>R</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.slice(0, 40).map((signal) => (
                    <tr key={signal.id} title={signal.warnings.map((code) => RISK_WARNING_TEXT[code]?.label ?? code).join(' · ')}>
                      <td>{when(signal.signal_at)}</td>
                      <td>
                        {signal.base}
                        <small className="desk-sub">{signal.venue === 't212' ? 'T212' : 'Spot'}{signal.warnings.length ? ` · ⚠ ${signal.warnings.length}` : ''}</small>
                      </td>
                      <td>{signal.side === 'long' ? 'Long' : 'Short'}</td>
                      <td>{signal.rr.toFixed(1).replace('.', ',')}</td>
                      <td><span className={`signal-status ${signal.status}`}>{STATUS_LABEL[signal.status]}</span></td>
                      <td className={(signal.r_multiple ?? 0) >= 0 ? 'positive' : 'negative'}>
                        {signal.r_multiple === null || signal.r_multiple === undefined ? '—' : r(signal.r_multiple)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function SignalBucketPanel({
  title,
  rows,
  label = (key) => key,
  sortKeys,
}: {
  title: string
  rows: Record<string, SignalBucket>
  label?: (key: string) => string
  sortKeys?: boolean
}) {
  const entries = Object.entries(rows).sort(([a, x], [b, y]) => (sortKeys ? a.localeCompare(b) : y.n - x.n))
  if (!entries.length) return null
  return (
    <article className="journal-panel">
      <h2>{title}</h2>
      <ul className="journal-breakdown">
        <li className="journal-breakdown-head"><span>Grupo</span><span>n</span><span>R médio</span><span>Acerto</span></li>
        {entries.map(([key, row]) => (
          <li key={key}>
            <span>{label(key)}</span>
            <span>{row.n}</span>
            <span className={row.sumR >= 0 ? 'positive' : 'negative'}>{r(row.sumR / row.n)}</span>
            <span>{Math.round((row.wins / row.n) * 100)}%</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
