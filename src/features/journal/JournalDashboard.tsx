import { useMemo, useRef, useState } from 'react'
import { formatTradingPair } from '../../lib/binance'
import { parseBinanceCsv } from '../../lib/journal/binance-csv'
import { computeJournalStats, dayId, formatDayLabel, formatDuration } from '../../lib/journal/journal-stats'
import {
  clearJournal,
  getClosedTrades,
  importFills,
  loadJournalStore,
  setDayNote,
} from '../../lib/journal/trade-store'
import type { ClosedTrade } from '../../lib/journal/types'

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

  const trades = useMemo(() => getClosedTrades(), [store])
  const stats = useMemo(() => computeJournalStats(trades), [trades])

  const onImport = async (file: File) => {
    const text = await file.text()
    const fills = parseBinanceCsv(text)
    if (fills.length === 0) {
      setImportMsg('Nenhum trade reconhecido. Exporta Spot Order History ou Trade History da Binance (CSV).')
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
        <strong>Como exportar:</strong> Binance Web → <em>Orders</em> → <em>Spot Order</em> → <em>Export</em>.
        Ou histórico de trades Spot. Dados ficam só neste browser.
        {store.lastImportAt && (
          <span> · Último import: {new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(store.lastImportAt))}</span>
        )}
      </section>
      {importMsg && <p className="journal-status">{importMsg}</p>}

      {trades.length === 0 ? (
        <section className="journal-empty">
          <p>Ainda sem trades. Importa o CSV da Binance para ver calendário, estatísticas e diário.</p>
        </section>
      ) : (
        <>
          <section className="journal-kpis">
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
