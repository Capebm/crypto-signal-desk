import { useState } from 'react'
import {
  Sparkles,
  Trash2,
  Globe,
  RefreshCw,
  Search,
  TrendingUp,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ExternalLink,
  Save,
} from 'lucide-react'
import { buildSourceSearch, sourceLinks, validUrl } from '../../lib/garimpo/helpers'
import { computeEconomics, DEMAND, SCORE_LABELS, VERDICT } from '../../lib/garimpo/economics'
import type { HuntCandidate, HuntSettings } from '../../../server/types'
import { CONDITIONS, money, pct } from '../../lib/garimpo/constants'

interface FlipCardProps {
  c: HuntCandidate & { _loading?: boolean; _err?: boolean }
  settings: HuntSettings
  onRemove: () => void
  onReeval: () => void
  onPatch: (key: keyof HuntCandidate, value: string) => void
  onSave?: () => void
  isResult?: boolean
}

function primaryListing(c: HuntCandidate) {
  if (validUrl(c.sourceUrl)) return { url: c.sourceUrl.trim(), exact: c._exactLink !== false }
  const query = `${c.name} ${c.size || ''}`.trim()
  return { url: buildSourceSearch(c.sourceName, query), exact: false }
}

function Row({
  k,
  val,
  bold,
  sub,
  good,
  bad,
  warn,
}: {
  k: string
  val: string
  bold?: boolean
  sub?: boolean
  good?: boolean
  bad?: boolean
  warn?: boolean
}) {
  return (
    <div className={`lrow${bold ? ' lrow-b' : ''}${sub ? ' lrow-sub' : ''}`}>
      <span>{k}</span>
      <span
        className="mono"
        style={{
          color: good ? 'var(--gold)' : bad ? 'var(--coral)' : warn ? 'var(--amber)' : 'inherit',
        }}
      >
        {val}
      </span>
    </div>
  )
}

export default function FlipCard({ c, settings, onRemove, onReeval, onPatch, onSave, isResult }: FlipCardProps) {
  const [open, setOpen] = useState(false)
  const e = computeEconomics(c, settings)
  const v = VERDICT[e.verdict]
  const links = sourceLinks(`${c.name} ${c.size || ''}`.trim())
  const isLot = e.qty > 1
  const listing = primaryListing(c)
  const scoreColor =
    e.score >= settings.scoreFlip
      ? 'var(--gold)'
      : e.score >= settings.scoreThin
        ? 'var(--amber)'
        : 'var(--coral)'

  return (
    <div className="card" style={{ borderColor: v.color === 'var(--muted)' ? 'var(--line)' : `${v.color}55` }}>
      <div className="card-top">
        <div className="card-id">
          <div className="card-name">{c.name || '(sem nome)'}</div>
          <div className="card-meta">
            {c.category} · {CONDITIONS.find((x) => x.id === c.condition)?.label || c.condition}
            {c.size ? ` · ${c.size}` : ''}
            {isLot ? ` · lote ×${e.qty}` : ''} · {c.region === 'EU' ? 'UE' : 'fora UE'}
            {c.sourceName ? ` · ${c.sourceName}` : ''}
          </div>
        </div>
        <div className="card-actions">
          {isResult && onSave ? (
            <button type="button" className="mini save" title="Guardar na fila" onClick={onSave}>
              <Save size={14} />
            </button>
          ) : null}
          <button type="button" className="mini" title="Reavaliar" onClick={onReeval}>
            <RefreshCw size={14} />
          </button>
          <button type="button" className="mini" title={isResult ? 'Descartar' : 'Remover'} onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {c._loading ? (
        <div className="card-loading">
          <Loader2 size={15} className="spin" /> a estimar preço PT…
        </div>
      ) : (
        <>
          <div className="verdict-row">
            {e.hasResale ? (
              <div
                className="score-ring"
                style={{
                  background: `conic-gradient(${scoreColor} ${e.score * 3.6}deg, var(--surface2) 0)`,
                }}
                title="Score de Oportunidade (0–100)"
              >
                <span className="score-n">{e.score}</span>
              </div>
            ) : null}
            <span className="verdict" style={{ color: v.color, background: v.bg, borderColor: `${v.color}44` }}>
              {e.verdict === 'flip' && <TrendingUp size={13} />}
              {e.verdict === 'skip' && <AlertTriangle size={13} />}
              {v.label}
            </span>
            {e.hasResale ? (
              <div className="headline">
                <div className="hl-block">
                  <span className="hl-n" style={{ color: e.profitPerUnit! > 0 ? 'var(--gold)' : 'var(--coral)' }}>
                    {money(e.profitPerUnit!)}
                  </span>
                  <span className="hl-l">lucro/un</span>
                </div>
                <div className="hl-block">
                  <span className="hl-n">{e.roi != null ? pct(e.roi * 100) : '—'}</span>
                  <span className="hl-l">ROI</span>
                </div>
                {isLot ? (
                  <div className="hl-block">
                    <span className="hl-n" style={{ color: 'var(--gold)' }}>
                      {money(e.totalProfit!)}
                    </span>
                    <span className="hl-l">lucro lote</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="need-price">Sem estimativa — mete o preço de venda →</div>
            )}
          </div>

          {c.ai ? (
            <div className="ai-line">
              <Sparkles size={12} />
              <span>
                revenda PT: {money(c.ai.low)}–{money(c.ai.high)} ·{' '}
              </span>
              <span className={`demand d-${c.ai.demand}`}>{DEMAND[c.ai.demand] || c.ai.demand}</span>
              {c.ai.note ? <span className="ai-note"> · {c.ai.note}</span> : null}
            </div>
          ) : null}
          {c._err ? <div className="ai-err">IA indisponível — usa o preço manual abaixo.</div> : null}

          <div className="buy-line">
            <span className="bl-k">compra</span>
            <span className="bl-v mono">
              {money((Number(c.buyPrice) || 0) * (settings.fx[c.currency] ?? 1))}
              {isLot ? ' total' : ''}
            </span>
            {c._verified ? (
              <span className="verified-tag" title="Confirmado nos resultados da pesquisa">
                ✓ verificado
              </span>
            ) : null}
            <a className="src-open" href={listing.url} target="_blank" rel="noreferrer">
              {listing.exact ? 'abrir anúncio' : 'ver anúncios'} <ExternalLink size={11} />
            </a>
          </div>

          <div className="override">
            <label>
              Preço de venda usado
              <input
                className="in mono sm"
                inputMode="decimal"
                placeholder={c.ai ? String(c.ai.mid) : '€'}
                value={c.resaleOverride ?? ''}
                onChange={(ev) => onPatch('resaleOverride', ev.target.value)}
              />
            </label>
            {c.resaleOverride ? (
              <span className="ov-tag">manual</span>
            ) : c.ai ? (
              <span className="ov-tag ai">média IA</span>
            ) : null}
          </div>

          <button type="button" className="expand" onClick={() => setOpen((o) => !o)}>
            {open ? 'esconder' : 'ver'} conta detalhada{' '}
            <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
          </button>

          {open ? (
            <div className="ledger">
              <Row k="Compra (total)" val={money(e.buyEUR)} />
              <Row k="Portes até PT" val={money(e.shipEUR)} />
              {c.region === 'nonEU' ? <Row k="IVA + direitos" val={money(e.importCost)} warn /> : null}
              <Row k="Custo total (landed)" val={money(e.landedTotal)} bold />
              {isLot ? <Row k={`Custo por unidade (÷${e.qty})`} val={money(e.landedPerUnit)} /> : null}
              <div className="ledger-div" />
              <Row k="Preço de venda" val={e.hasResale ? money(e.resale!) : '—'} />
              <Row k="Comissão Vinted (vendedor)" val="€0 · fica 100%" good />
              {e.buyerAllIn != null ? <Row k="Comprador paga (com taxas)" val={money(e.buyerAllIn)} sub /> : null}
              <div className="ledger-div" />
              <Row
                k="Lucro / unidade"
                val={e.hasResale ? money(e.profitPerUnit!) : '—'}
                bold
                good={!!e.profitPerUnit && e.profitPerUnit > 0}
                bad={!!e.profitPerUnit && e.profitPerUnit <= 0}
              />
              {isLot ? (
                <Row k={`Lucro lote (${settings.sellThrough}% vendido)`} val={money(e.totalProfit!)} bold good />
              ) : null}
              {e.hasResale ? (
                <>
                  <div className="ledger-div" />
                  <div className="score-head">
                    <span>Score de Oportunidade</span>
                    <span className="mono" style={{ color: scoreColor, fontWeight: 700 }}>
                      {e.score}/100
                    </span>
                  </div>
                  <div className="score-bars">
                    {Object.keys(SCORE_LABELS).map((k) => (
                      <div className="sb-row" key={k}>
                        <span className="sb-l">{SCORE_LABELS[k]}</span>
                        <div className="sb-track">
                          <div
                            className="sb-fill"
                            style={{ width: `${Math.round((e.parts[k] || 0) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="sources">
            <span className="src-lbl">
              <Globe size={12} /> confirmar:
            </span>
            {links.map((l) => (
              <a
                key={l.label}
                className={`src-b${l.comp ? ' src-comp' : ''}`}
                href={l.url}
                target="_blank"
                rel="noreferrer"
              >
                {l.comp ? <Search size={11} /> : null}
                {l.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
