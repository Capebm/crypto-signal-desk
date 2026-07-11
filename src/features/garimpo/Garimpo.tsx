import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  Settings,
  Package,
  RefreshCw,
  Loader2,
  Radar,
  Hand,
  Globe,
} from 'lucide-react'
import './garimpo.css'
import FlipCard from './FlipCard'
import SettingsModal from './SettingsModal'
import { fetchEstimate, fetchHunt, fetchScrape } from '../../lib/garimpo/api'
import {
  CATEGORIES,
  CONDITIONS,
  DEFAULT_SETTINGS,
  HUNT_CATEGORIES,
  money,
  SOURCES,
} from '../../lib/garimpo/constants'
import { computeEconomics } from '../../lib/garimpo/economics'
import { opportunityToCandidate } from '../../lib/garimpo/helpers'
import type { HuntBrief, HuntCandidate, HuntSettings } from '../../../server/types'

const SCRAPER_SOURCES = [
  { id: 'olx-pt', label: 'OLX PT' },
  { id: 'olx-pl', label: 'OLX PL' },
  { id: 'vinted-es', label: 'Vinted ES' },
  { id: 'vinted-fr', label: 'Vinted FR' },
  { id: 'vinted-de', label: 'Vinted DE' },
  { id: 'vinted-uk', label: 'Vinted UK' },
  { id: 'vinted-it', label: 'Vinted IT' },
  { id: 'vinted-pl', label: 'Vinted PL' },
]

type Mode = 'hunt' | 'scrape' | 'manual'

export default function Garimpo() {
  const [settings, setSettings] = useState<HuntSettings>(DEFAULT_SETTINGS)
  const [candidates, setCandidates] = useState<HuntCandidate[]>([])
  const [huntResults, setHuntResults] = useState<HuntCandidate[]>([])
  const [scrapeResults, setScrapeResults] = useState<HuntCandidate[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sortBy, setSortBy] = useState<'score' | 'roi' | 'profit'>('score')
  const [mode, setMode] = useState<Mode>('hunt')

  const [brief, setBrief] = useState<HuntBrief>({
    what: '',
    category: 'Tudo',
    sources: ['Vinted ES', 'eBay UK'],
    region: 'any',
    maxBuy: '40',
    lotsOnly: false,
  })
  const [hunting, setHunting] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [huntErr, setHuntErr] = useState('')
  const [huntErrKind, setHuntErrKind] = useState<'error' | 'info'>('error')

  const [scrapeQuery, setScrapeQuery] = useState('lote roupa')
  const [scrapeSources, setScrapeSources] = useState(SCRAPER_SOURCES.map((s) => s.id))
  const [scrapeMaxBuy, setScrapeMaxBuy] = useState(50)

  const [form, setForm] = useState({
    name: '',
    category: 'Sapatilhas',
    size: '',
    condition: 'vgood',
    region: 'EU' as 'EU' | 'nonEU',
    currency: 'EUR',
    buyPrice: '',
    sourceShip: '',
    qty: 1,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const s = localStorage.getItem('garimpo:settings')
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) })
      const c = localStorage.getItem('garimpo:candidates')
      if (c) setCandidates(JSON.parse(c))
    } catch {
      /* ignore */
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem('garimpo:settings', JSON.stringify(settings))
  }, [settings, loaded])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem('garimpo:candidates', JSON.stringify(candidates))
  }, [candidates, loaded])

  async function runHunt() {
    setHuntErr('')
    setHuntErrKind('error')
    setHunting(true)
    setHuntResults([])
    try {
      const result = await fetchHunt(brief, settings)
      if (!result.items.length) {
        setHuntErr(
          result.allFailed
            ? 'Problema técnico na pesquisa web. Verifica ANTHROPIC_API_KEY no .env e tenta outra vez.'
            : 'Nada de jeito com link real desta vez. Refina o alvo ou sobe o preço máximo.',
        )
      } else if (result.anyFailed) {
        setHuntErrKind('info')
        setHuntErr(`${result.items.length} encontrada(s) — uma das pesquisas paralelas falhou.`)
      }
      setHuntResults(result.items)
    } catch {
      setHuntErr('A caça falhou. Define ANTHROPIC_API_KEY no .env para pesquisa mundial com IA.')
    } finally {
      setHunting(false)
    }
  }

  async function runScrape() {
    setHuntErr('')
    setScraping(true)
    setScrapeResults([])
    try {
      const result = await fetchScrape({
        query: scrapeQuery,
        sourceIds: scrapeSources,
        bundlesOnly: brief.lotsOnly,
        minProfitPct: 15,
        maxBuyPrice: scrapeMaxBuy,
        packagingCost: 2,
        limit: 24,
      })
      const items = result.opportunities.map(opportunityToCandidate)
      setScrapeResults(items)
      if (!items.length) {
        setHuntErr(`0 oportunidades de ${result.scannedBuyListings} anúncios em ${result.sourcesSearched.length} fontes UE.`)
      }
    } catch (e) {
      setHuntErr(e instanceof Error ? e.message : 'Scrapers falharam')
    } finally {
      setScraping(false)
    }
  }

  async function addAndEvaluate() {
    setError('')
    if (!form.name.trim()) {
      setError('Dá um nome à peça primeiro.')
      return
    }
    if (!form.buyPrice) {
      setError('Falta o preço de compra.')
      return
    }
    const id = `c-${Date.now()}`
    const draft: HuntCandidate = { id, ...form, resaleOverride: '', ai: null, sourceUrl: '', sourceName: 'manual' }
    setCandidates((p) => [{ ...draft, _loading: true } as HuntCandidate & { _loading: boolean }, ...p])
    setBusy(true)
    try {
      const ai = await fetchEstimate(draft)
      setCandidates((p) => p.map((c) => (c.id === id ? { ...c, ai, _loading: false } : c)))
    } catch {
      setCandidates((p) => p.map((c) => (c.id === id ? { ...c, _loading: false, _err: true } : c)))
      setError('A IA não conseguiu estimar. Mete o preço de venda à mão no cartão.')
    } finally {
      setBusy(false)
      setForm((f) => ({ ...f, name: '', buyPrice: '', sourceShip: '', size: '' }))
    }
  }

  async function reEvaluate(id: string, list: HuntCandidate[], setList: typeof setCandidates) {
    const c = list.find((x) => x.id === id)
    if (!c) return
    setList((p) => p.map((x) => (x.id === id ? { ...x, _loading: true, _err: false } : x)))
    try {
      const ai = await fetchEstimate(c)
      setList((p) => p.map((x) => (x.id === id ? { ...x, ai, _loading: false } : x)))
    } catch {
      setList((p) => p.map((x) => (x.id === id ? { ...x, _loading: false, _err: true } : x)))
    }
  }

  const activeResults = mode === 'hunt' ? huntResults : scrapeResults
  const activeLoading = mode === 'hunt' ? hunting : scraping

  const enriched = useMemo(
    () => candidates.map((c) => ({ ...c, econ: computeEconomics(c, settings) })),
    [candidates, settings],
  )
  const enrichedActive = useMemo(
    () =>
      activeResults
        .map((c) => ({ ...c, econ: computeEconomics(c, settings) }))
        .sort((a, b) => b.econ.score - a.econ.score),
    [activeResults, settings],
  )
  const sorted = useMemo(() => {
    const arr = [...enriched]
    if (sortBy === 'score') arr.sort((a, b) => b.econ.score - a.econ.score)
    if (sortBy === 'roi') arr.sort((a, b) => (b.econ.roi ?? -9) - (a.econ.roi ?? -9))
    if (sortBy === 'profit') arr.sort((a, b) => (b.econ.totalProfit ?? -9e9) - (a.econ.totalProfit ?? -9e9))
    return arr
  }, [enriched, sortBy])

  const totals = useMemo(() => {
    const flips = enriched.filter((c) => c.econ.verdict === 'flip')
    return {
      count: flips.length,
      capital: flips.reduce((s, c) => s + c.econ.capitalNeeded, 0),
      profit: flips.reduce((s, c) => s + (c.econ.totalProfit ?? 0), 0),
    }
  }, [enriched])

  const setS = <K extends keyof HuntSettings>(key: K, value: HuntSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))

  const saveResult = (id: string) => {
    const r = activeResults.find((x) => x.id === id)
    if (!r) return
    setCandidates((p) => [{ ...r, id: `c-${Date.now()}` }, ...p])
    if (mode === 'hunt') setHuntResults((p) => p.filter((x) => x.id !== id))
    else setScrapeResults((p) => p.filter((x) => x.id !== id))
  }

  const patch = (id: string, key: keyof HuntCandidate, value: string, list: HuntCandidate[], setList: typeof setHuntResults) =>
    setList((p) => p.map((c) => (c.id === id ? { ...c, [key]: value } : c)))

  return (
    <div className="garimpo">
      <header className="hd">
        <div className="hd-l">
          <div className="wordmark">
            GARIMPO<span className="wm-dot">.</span>
          </div>
          <div className="tagline">compra no mundo · vende em portugal</div>
        </div>
        <div className="hd-r">
          <div className="kpi">
            <span className="kpi-n">{totals.count}</span>
            <span className="kpi-l">flips</span>
          </div>
          <div className="kpi">
            <span className="kpi-n" style={{ color: 'var(--gold)' }}>
              {money(totals.profit)}
            </span>
            <span className="kpi-l">lucro potencial</span>
          </div>
          <button type="button" className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Definições">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="grid">
        <section className="panel form-panel">
          <div className="mode-tabs">
            <button type="button" className={`mt${mode === 'hunt' ? ' mt-on' : ''}`} onClick={() => setMode('hunt')}>
              <Radar size={14} /> Caçar na web
            </button>
            <button type="button" className={`mt${mode === 'scrape' ? ' mt-on' : ''}`} onClick={() => setMode('scrape')}>
              <Globe size={14} /> Scrapers UE
            </button>
            <button type="button" className={`mt${mode === 'manual' ? ' mt-on' : ''}`} onClick={() => setMode('manual')}>
              <Hand size={14} /> Manual
            </button>
          </div>

          {mode === 'hunt' ? (
            <>
              <div className="panel-eyebrow">definir o alvo · mundial</div>
              <label className="fl">
                O que caçar
                <input
                  className="in"
                  value={brief.what}
                  placeholder="ex. Nike/Adidas, denim vintage, Stone Island…"
                  onChange={(e) => setBrief((b) => ({ ...b, what: e.target.value }))}
                />
              </label>
              <label className="fl">
                Tipo
                <select className="in" value={brief.category} onChange={(e) => setBrief((b) => ({ ...b, category: e.target.value }))}>
                  {HUNT_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="fl">
                Formato
                <div className="chips">
                  <button
                    type="button"
                    className={`chip${!brief.lotsOnly ? ' chip-on' : ''}`}
                    onClick={() => setBrief((b) => ({ ...b, lotsOnly: false }))}
                  >
                    Peças + lotes
                  </button>
                  <button
                    type="button"
                    className={`chip${brief.lotsOnly ? ' chip-on' : ''}`}
                    onClick={() => setBrief((b) => ({ ...b, lotsOnly: true }))}
                  >
                    <Package size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                    Só lotes/packs/bundles
                  </button>
                </div>
                {brief.lotsOnly ? (
                  <span className="hint" style={{ display: 'block', marginTop: 6 }}>
                    só sai lote com ≥2 peças na mesma listagem — nunca peças avulso
                  </span>
                ) : null}
              </label>
              <label className="fl">
                Onde procurar
                <div className="chips">
                  {SOURCES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`chip${brief.sources.includes(s) ? ' chip-on' : ''}`}
                      onClick={() =>
                        setBrief((b) => ({
                          ...b,
                          sources: b.sources.includes(s) ? b.sources.filter((x) => x !== s) : [...b.sources, s],
                        }))
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </label>
              <div className="row2">
                <label className="fl">
                  Origem
                  <select className="in" value={brief.region} onChange={(e) => setBrief((b) => ({ ...b, region: e.target.value as HuntBrief['region'] }))}>
                    <option value="EU">UE</option>
                    <option value="nonEU">Fora UE</option>
                    <option value="any">Qualquer</option>
                  </select>
                </label>
                <label className="fl">
                  {brief.lotsOnly ? 'Máx total lote €' : 'Máx/un €'}
                  <input className="in mono" value={brief.maxBuy} onChange={(e) => setBrief((b) => ({ ...b, maxBuy: e.target.value }))} />
                </label>
              </div>
              {brief.lotsOnly ? (
                <span className="hint" style={{ display: 'block', marginBottom: 14 }}>
                  aplica-se ao preço TOTAL do lote, não à peça
                </span>
              ) : null}
              {huntErr ? <div className={`err${huntErrKind === 'info' ? ' info' : ''}`}>{huntErr}</div> : null}
              <button type="button" className="cta" onClick={runHunt} disabled={hunting}>
                {hunting ? <Loader2 size={16} className="spin" /> : <Radar size={16} />}
                {hunting ? 'A vasculhar a web…' : 'Caçar oportunidades'}
              </button>
              <div className="form-note">
                Pesquisa mundial com IA + web search: eBay UK/DE, Vinted ES/FR/DE/UK, Wallapop, lotes atacado, AliExpress, etc.
                Requer <code>ANTHROPIC_API_KEY</code> no .env.
              </div>
            </>
          ) : mode === 'scrape' ? (
            <>
              <div className="panel-eyebrow">scrapers diretos · UE</div>
              <label className="fl">
                Pesquisa
                <input className="in" value={scrapeQuery} onChange={(e) => setScrapeQuery(e.target.value)} placeholder="lote roupa, pack sneakers…" />
              </label>
              <label className="fl">
                Formato
                <div className="chips">
                  <button
                    type="button"
                    className={`chip${!brief.lotsOnly ? ' chip-on' : ''}`}
                    onClick={() => setBrief((b) => ({ ...b, lotsOnly: false }))}
                  >
                    Peças + lotes
                  </button>
                  <button
                    type="button"
                    className={`chip${brief.lotsOnly ? ' chip-on' : ''}`}
                    onClick={() => setBrief((b) => ({ ...b, lotsOnly: true }))}
                  >
                    <Package size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                    Só lotes/packs/bundles
                  </button>
                </div>
                {brief.lotsOnly ? (
                  <span className="hint" style={{ display: 'block', marginTop: 6 }}>
                    filtra anúncios com palavras-chave de lote/pack (lote, pack, bundle, kg…)
                  </span>
                ) : null}
              </label>
              <label className="fl">
                Fontes (APIs públicas)
                <div className="chips">
                  {SCRAPER_SOURCES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`chip${scrapeSources.includes(s.id) ? ' chip-on' : ''}`}
                      onClick={() =>
                        setScrapeSources((ids) =>
                          ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id],
                        )
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="fl">
                {brief.lotsOnly ? 'Máx total lote €' : 'Máx compra €'}
                <input className="in mono" type="number" value={scrapeMaxBuy} onChange={(e) => setScrapeMaxBuy(Number(e.target.value))} />
              </label>
              {huntErr ? <div className="err">{huntErr}</div> : null}
              <button type="button" className="cta" onClick={runScrape} disabled={scraping || !scrapeSources.length}>
                {scraping ? <Loader2 size={16} className="spin" /> : <Globe size={16} />}
                {scraping ? 'A pesquisar UE…' : 'Pesquisar OLX + Vinted UE'}
              </button>
              <div className="form-note">
                Sem IA — pesquisa direta em OLX PT/PL e Vinted ES/FR/DE/UK/IT/PL. Compara automaticamente com preços no Vinted.pt.
              </div>
            </>
          ) : (
            <>
              <div className="panel-eyebrow">nova peça</div>
              <label className="fl">
                Marca / modelo
                <input className="in" value={form.name} placeholder="ex. Nike Air Max 90" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="fl">
                Categoria
                <select className="in" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div className="row3">
                <label className="fl">
                  Moeda
                  <select className="in" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                    {Object.keys(settings.fx).map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label className="fl">
                  Compra
                  <input className="in mono" value={form.buyPrice} onChange={(e) => setForm((f) => ({ ...f, buyPrice: e.target.value }))} />
                </label>
                <label className="fl">
                  Portes
                  <input className="in mono" value={form.sourceShip} onChange={(e) => setForm((f) => ({ ...f, sourceShip: e.target.value }))} />
                </label>
              </div>
              <label className="fl">
                Quantidade <span className="hint">(lote = &gt;1)</span>
                <input
                  className="in mono"
                  type="number"
                  min={1}
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) || 1 }))}
                />
              </label>
              {error ? <div className="err">{error}</div> : null}
              <button type="button" className="cta" onClick={addAndEvaluate} disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                {busy ? 'A avaliar…' : 'Avaliar peça'}
              </button>
            </>
          )}
        </section>

        <section className="queue-col">
          {(activeLoading || enrichedActive.length > 0) && mode !== 'manual' ? (
            <div className="hunt-block">
              <div className="hunt-head">
                <span className="hb-title">
                  <Radar size={14} /> {mode === 'hunt' ? 'Encontrado na web' : 'Scrapers UE'}
                  {enrichedActive.length > 0 ? ` · ${enrichedActive.length}` : ''}
                </span>
              </div>
              {activeLoading ? (
                <div className="scanning">
                  <Loader2 size={16} className="spin" />
                  <div>
                    <strong>A pesquisar…</strong>
                    <span>várias fontes · a calcular margem para Vinted PT</span>
                  </div>
                </div>
              ) : null}
              <div className="cards">
                {enrichedActive.map((c) => (
                  <FlipCard
                    key={c.id}
                    c={c}
                    settings={settings}
                    onReeval={() => reEvaluate(c.id, activeResults, mode === 'hunt' ? setHuntResults : setScrapeResults)}
                    onPatch={(k, v) => patch(c.id, k, v, activeResults, mode === 'hunt' ? setHuntResults : setScrapeResults)}
                    onSave={() => saveResult(c.id)}
                    onRemove={() =>
                      mode === 'hunt'
                        ? setHuntResults((p) => p.filter((x) => x.id !== c.id))
                        : setScrapeResults((p) => p.filter((x) => x.id !== c.id))
                    }
                    isResult
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="queue-head">
            <span className="q-title">Fila · {sorted.length} peça{sorted.length === 1 ? '' : 's'}</span>
            <div className="sort">
              {([
                ['score', 'melhor'],
                ['roi', 'ROI'],
                ['profit', 'lucro'],
              ] as const).map(([k, l]) => (
                <button key={k} type="button" className={`sort-b${sortBy === k ? ' sort-on' : ''}`} onClick={() => setSortBy(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 && !activeLoading && enrichedActive.length === 0 ? (
            <div className="empty">
              <Package size={30} strokeWidth={1.4} />
              <p>Fila vazia.</p>
              <span>
                Usa <b>Caçar na web</b> para oportunidades mundiais (eBay, Vinted ES, Wallapop, lotes…) ou <b>Scrapers UE</b> para
                APIs diretas.
              </span>
            </div>
          ) : null}

          <div className="cards">
            {sorted.map((c) => (
              <FlipCard
                key={c.id}
                c={c}
                settings={settings}
                onRemove={() => setCandidates((p) => p.filter((x) => x.id !== c.id))}
                onReeval={() => reEvaluate(c.id, candidates, setCandidates)}
                onPatch={(k, v) => patch(c.id, k, v, candidates, setCandidates)}
              />
            ))}
          </div>
        </section>
      </div>

      {showSettings ? (
        <SettingsModal settings={settings} setS={setS} onClose={() => setShowSettings(false)} onReset={() => setSettings(DEFAULT_SETTINGS)} />
      ) : null}
    </div>
  )
}
