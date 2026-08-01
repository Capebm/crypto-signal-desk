import { useMemo, useRef, useState } from 'react'
import { AGENT_QUOTE_ASSET, formatTradingPair } from '../../lib/binance'
import { parseBinanceCsv } from '../../lib/journal/binance-csv'
import { computeJournalStats, dayId, formatDayLabel, formatDuration, pnlForDay } from '../../lib/journal/journal-stats'
import {
  addManualClosedTrade,
  clearJournal,
  getClosedTrades,
  importFills,
  loadJournalStore,
  setDayNote,
} from '../../lib/journal/trade-store'
import { resolvePositionSymbol } from '../../lib/position-advisor'
import type { ClosedTrade } from '../../lib/journal/types'
import { signalMetaLabel } from '../../lib/trade-signal-meta'

const money = (value: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

const price = (value: number) =>
  new Intl.NumberFormat('pt-PT', { maximumFractionDigits: value < 1 ? 5 : 2 }).format(value)

const sessionLabels: Record<string, string> = {
  ny_open: 'NY open',
  ny: 'NY mid',
  ny_close: 'NY fecho',
  london: 'Londres',
  quiet: 'Ásia',
  off: 'Fora killzone',
}

export default function JournalDashboard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [store, setStore] = useState(loadJournalStore)
  const [selectedDay, setSelectedDay] = useState<string>()
  const [importMsg, setImportMsg] = useState('')
  const [monthOffset, setMonthOffset] = useState(0)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualBase, setManualBase] = useState('RE')
  const [manualEntry, setManualEntry] = useState('')
  const [manualExit, setManualExit] = useState('')
  const [manualQty, setManualQty] = useState('')
  const [manualFees, setManualFees] = useState('')

  const trades = useMemo(() => getClosedTrades(), [store])
  const stats = useMemo(() => computeJournalStats(trades), [trades])
  const today = useMemo(() => pnlForDay(trades, dayId(Date.now())), [trades])

  const onImport = async (file: File) => {
    const text = await file.text()
    const fills = parseBinanceCsv(text)
    if (fills.length === 0) {
      setImportMsg('Nenhum trade reconhecido. Descompacta o ZIP da Binance, abre o CSV dentro, e importa esse ficheiro (.csv).')
      return
    }
    const result = importFills(fills)
    setStore(result.store)
    setImportMsg(`${result.added} fills novos · ${result.trades.length} round-trips fechados no total.`)
  }

  const calendar = useMemo(() => buildCalendar(monthOffset, stats.byDay), [monthOffset, stats.byDay])

  const dayTrades = selectedDay ? trades.filter((trade) => dayId(trade.exitTime) === selectedDay) : []
  const dayNote = selectedDay ? store.dayNotes[selectedDay] ?? '' : ''

  return (
    <main className="journal-shell">
      <header className="journal-header">
        <div>
          <p className="eyebrow">DIÁRIO TJR · BINANCE SPOT</p>
          <h1>O teu histórico de trades</h1>
          <p>Importa CSV da Binance. Calcula PnL, win rate e performance por killzone — tudo local no browser.</p>
        </div>
        <div className="journal-header-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onImport(file)
              event.target.value = ''
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()}>Importar CSV</button>
          <button type="button" className="ghost" onClick={() => setManualOpen((v) => !v)}>
            {manualOpen ? 'Fechar manual' : 'Trade manual'}
          </button>
          {store.fills.length > 0 && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (!window.confirm('Apagar todo o diário local?')) return
                clearJournal()
                setStore(loadJournalStore())
                setSelectedDay(undefined)
                setImportMsg('Diário limpo.')
              }}
            >
              Limpar
            </button>
          )}
        </div>
      </header>

      <section className="journal-import-help">
        <strong>Como exportar:</strong> Binance → <em>Orders</em> → <em>Data Download Center</em> → Spot Order History → Download → <strong>descompacta o ZIP</strong> → importa o <strong>.csv</strong> aqui.
        {store.lastImportAt && (
          <span> · Último import: {new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(store.lastImportAt))}</span>
        )}
      </section>
      {importMsg && <p className="journal-status">{importMsg}</p>}

      {manualOpen && (
        <form
          className="journal-manual-form"
          onSubmit={(event) => {
            event.preventDefault()
            const entry = Number(manualEntry.replace(',', '.'))
            const exit = Number(manualExit.replace(',', '.'))
            const qty = Number(manualQty.replace(',', '.'))
            const fees = manualFees ? Number(manualFees.replace(',', '.')) : undefined
            if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(qty) || qty <= 0) {
              setImportMsg('Preenche entrada, saída e quantidade válidas.')
              return
            }
            const symbol = resolvePositionSymbol(manualBase, AGENT_QUOTE_ASSET)
            const now = Date.now()
            const result = addManualClosedTrade({
              symbol,
              entryPrice: entry,
              exitPrice: exit,
              quantity: qty,
              entryTime: now - 60_000,
              exitTime: now,
              feesUsdc: Number.isFinite(fees) ? fees : undefined,
            })
            setStore(result.store)
            const pnl = result.trade?.pnlUsdc
            setImportMsg(
              result.trade
                ? `Trade manual ${formatTradingPair(symbol)} registado · PnL ${pnl !== undefined && pnl >= 0 ? '+' : ''}${pnl?.toFixed(2) ?? '—'} USDC.`
                : 'Trade manual adicionado.',
            )
            setManualOpen(false)
            setManualEntry('')
            setManualExit('')
            setManualQty('')
            setManualFees('')
          }}
        >
          <h3>Registar trade Spot (sem CSV)</h3>
          <p>Ideal para o RE de hoje: entrada + saída + qty. O motor TJR não é alterado — só o diário.</p>
          <div className="journal-manual-grid">
            <label>Moeda<input value={manualBase} onChange={(e) => setManualBase(e.target.value)} placeholder="RE" /></label>
            <label>Entrada<input value={manualEntry} onChange={(e) => setManualEntry(e.target.value)} placeholder="0.5145" inputMode="decimal" /></label>
            <label>Saída<input value={manualExit} onChange={(e) => setManualExit(e.target.value)} placeholder="0.5320" inputMode="decimal" /></label>
            <label>Quantidade<input value={manualQty} onChange={(e) => setManualQty(e.target.value)} placeholder="38.8" inputMode="decimal" /></label>
            <label>Fees USDC <span className="optional">(opc.)</span><input value={manualFees} onChange={(e) => setManualFees(e.target.value)} placeholder="0.02" inputMode="decimal" /></label>
            <button type="submit">Guardar no diário</button>
          </div>
        </form>
      )}

      {trades.length === 0 ? (
        <section className="journal-empty">
          <p>Ainda sem trades. Importa o CSV da Binance ou usa <strong>Trade manual</strong> (ex. RE +0,68 USDC).</p>
        </section>
      ) : (
        <>
          <section className="journal-kpis">
            <article><span>PnL hoje</span><strong className={today.pnl >= 0 ? 'positive' : 'negative'}>{money(today.pnl)}</strong><small>{today.trades} trades</small></article>
            <article><span>PnL total</span><strong className={stats.totalPnlUsdc >= 0 ? 'positive' : 'negative'}>{money(stats.totalPnlUsdc)}</strong></article>
            <article><span>Win rate</span><strong>{stats.winRate.toFixed(0)}%</strong><small>{stats.wins}W / {stats.losses}L</small></article>
            <article><span>Trades fechados</span><strong>{stats.totalTrades}</strong></article>
            <article><span>Profit factor</span><strong>{Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}</strong></article>
            <article><span>Avg win</span><strong className="positive">{money(stats.avgWin)}</strong></article>
            <article><span>Avg loss</span><strong className="negative">{money(-stats.avgLoss)}</strong></article>
          </section>

          <section className="journal-grid">
            <article className="journal-panel">
              <header className="journal-panel-head">
                <h2>Calendário PnL</h2>
                <div className="journal-month-nav">
                  <button type="button" onClick={() => setMonthOffset((value) => value - 1)} aria-label="Mês anterior">‹</button>
                  <span>{calendar.label}</span>
                  <button type="button" onClick={() => setMonthOffset((value) => value + 1)} aria-label="Mês seguinte">›</button>
                </div>
              </header>
              <div className="journal-calendar">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
                  <span key={label} className="journal-cal-head">{label}</span>
                ))}
                {calendar.cells.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    className={`journal-cal-day ${cell.inMonth ? '' : 'muted'} ${cell.dayKey === selectedDay ? 'selected' : ''} ${cell.pnl !== undefined ? (cell.pnl >= 0 ? 'up' : 'down') : ''}`}
                    disabled={!cell.inMonth || !cell.dayKey}
                    onClick={() => cell.dayKey && setSelectedDay(cell.dayKey)}
                  >
                    <span>{cell.day}</span>
                    {cell.pnl !== undefined && <small>{cell.pnl >= 0 ? '+' : ''}{cell.pnl.toFixed(2)}</small>}
                  </button>
                ))}
              </div>
            </article>

            <article className="journal-panel">
              <h2>{selectedDay ? formatDayLabel(selectedDay) : 'Selecciona um dia'}</h2>
              {selectedDay ? (
                <>
                  <label className="journal-note">
                    Nota do dia
                    <textarea
                      value={dayNote}
                      onChange={(event) => {
                        const next = setDayNote(selectedDay, event.target.value)
                        setStore(next)
                      }}
                      placeholder="O que correu bem/mal hoje? Respeitaste a killzone?"
                      rows={3}
                    />
                  </label>
                  {dayTrades.length === 0 ? (
                    <p className="journal-muted">Sem trades fechados neste dia.</p>
                  ) : (
                    <ul className="journal-day-trades">
                      {dayTrades.map((trade) => (
                        <li key={trade.id}>
                          <strong>{trade.base}</strong>
                          <span className={trade.pnlUsdc >= 0 ? 'positive' : 'negative'}>{money(trade.pnlUsdc)}</span>
                          <small>{sessionLabels[trade.entrySession] ?? trade.entrySession}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="journal-muted">Clica num dia no calendário para ver trades e escrever notas.</p>
              )}
            </article>
          </section>

          <section className="journal-grid">
            <article className="journal-panel">
              <h2>Por killzone (entrada)</h2>
              <ul className="journal-breakdown">
                {Object.entries(stats.bySession).map(([session, row]) => (
                  <li key={session}>
                    <span>{sessionLabels[session] ?? session}</span>
                    <span>{row.trades} trades</span>
                    <span className={row.pnl >= 0 ? 'positive' : 'negative'}>{money(row.pnl)}</span>
                    <span>{row.trades > 0 ? `${Math.round((row.wins / row.trades) * 100)}% WR` : '—'}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="journal-panel">
              <h2>Por moeda</h2>
              <ul className="journal-breakdown">
                {Object.entries(stats.bySymbol)
                  .sort(([, a], [, b]) => b.pnl - a.pnl)
                  .slice(0, 12)
                  .map(([base, row]) => (
                    <li key={base}>
                      <span>{base}</span>
                      <span>{row.trades} trades</span>
                      <span className={row.pnl >= 0 ? 'positive' : 'negative'}>{money(row.pnl)}</span>
                      <span>{row.trades > 0 ? `${Math.round((row.wins / row.trades) * 100)}% WR` : '—'}</span>
                    </li>
                  ))}
              </ul>
            </article>
          </section>

          <section className="journal-panel">
            <h2>O que funciona (meta do sinal)</h2>
            <p className="journal-muted">
              Só trades fechados via pin <strong>Fechou</strong> no Agente (com snapshot). CSV import sem meta.
              {stats.signalTrades > 0 ? ` · ${stats.signalTrades} com meta.` : ' · Ainda nenhum — fecha uma posição pelo pin.'}
            </p>
            {stats.signalTrades > 0 && (
              <div className="journal-grid signal-edge">
                <ul className="journal-breakdown">
                  <li className="journal-breakdown-head"><span>Perfil</span><span>n</span><span>PnL</span><span>WR</span></li>
                  {Object.entries(stats.byProfile).map(([key, row]) => (
                    <li key={key}>
                      <span>{key}</span>
                      <span>{row.trades}</span>
                      <span className={row.pnl >= 0 ? 'positive' : 'negative'}>{money(row.pnl)}</span>
                      <span>{row.trades > 0 ? `${Math.round((row.wins / row.trades) * 100)}%` : '—'}</span>
                    </li>
                  ))}
                </ul>
                <ul className="journal-breakdown">
                  <li className="journal-breakdown-head"><span>Tipo setup</span><span>n</span><span>PnL</span><span>WR</span></li>
                  {Object.entries(stats.byMesh).map(([key, row]) => (
                    <li key={key}>
                      <span>{key}</span>
                      <span>{row.trades}</span>
                      <span className={row.pnl >= 0 ? 'positive' : 'negative'}>{money(row.pnl)}</span>
                      <span>{row.trades > 0 ? `${Math.round((row.wins / row.trades) * 100)}%` : '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="journal-panel">
            <h2>Trades fechados</h2>
            <div className="journal-trade-table-wrap">
              <table className="journal-trade-table">
                <thead>
                  <tr>
                    <th>Saída</th>
                    <th>Par</th>
                    <th>Entrada</th>
                    <th>Saída $</th>
                    <th>Qty</th>
                    <th>PnL</th>
                    <th>%</th>
                    <th>Duração</th>
                    <th>Sessão ↓</th>
                    <th>Sinal</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <TradeRow key={trade.id} trade={trade} />
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

function TradeRow({ trade }: { trade: ClosedTrade }) {
  return (
    <tr>
      <td>{new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(trade.exitTime)}</td>
      <td>{formatTradingPair(trade.symbol)}</td>
      <td>{price(trade.entryPrice)}</td>
      <td>{price(trade.exitPrice)}</td>
      <td>{trade.quantity.toFixed(trade.quantity < 1 ? 4 : 2)}</td>
      <td className={trade.pnlUsdc >= 0 ? 'positive' : 'negative'}>{money(trade.pnlUsdc)}</td>
      <td className={trade.pnlPct >= 0 ? 'positive' : 'negative'}>{trade.pnlPct.toFixed(2)}%</td>
      <td>{formatDuration(trade.durationMs)}</td>
      <td title={trade.entrySessionBadge}>{sessionLabels[trade.entrySession] ?? trade.entrySession}</td>
      <td className="journal-signal-cell" title={trade.signal ? signalMetaLabel(trade.signal) : 'Sem meta (CSV / manual sem pin)'}>
        {trade.signal ? `${trade.signal.score}` : '—'}
      </td>
    </tr>
  )
}

function buildCalendar(monthOffset: number, byDay: Record<string, { pnl: number }>) {
  const now = new Date()
  const anchor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const label = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(anchor)

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: { key: string; day?: number; dayKey?: string; inMonth: boolean; pnl?: number }[] = []

  for (let i = 0; i < firstDow; i += 1) {
    cells.push({ key: `pad-${i}`, inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key: dayKey, day, dayKey, inMonth: true, pnl: byDay[dayKey]?.pnl })
  }
  return { label, cells }
}
