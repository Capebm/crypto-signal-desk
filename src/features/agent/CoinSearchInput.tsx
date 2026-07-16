import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENT_QUOTE_ASSET, formatTradingPair, getActiveQuoteSymbols } from '../../lib/binance'

type Props = {
  value: string
  onChange: (base: string) => void
  placeholder?: string
}

const normalize = (query: string) => query.toUpperCase().replace(/[^A-Z0-9]/g, '')

const toBase = (raw: string, quote: string) => {
  const cleaned = normalize(raw)
  if (!cleaned) return ''
  if (cleaned.endsWith(quote)) return cleaned.slice(0, -quote.length)
  return cleaned
}

export default function CoinSearchInput({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState(value)
  const [symbols, setSymbols] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const quote = AGENT_QUOTE_ASSET

  useEffect(() => {
    void getActiveQuoteSymbols().then(setSymbols).catch(() => {})
  }, [])

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const normalized = normalize(query)
  const matches = useMemo(() => {
    if (!normalized) return symbols.slice(0, 14)
    return symbols
      .filter((symbol) => {
        const base = symbol.replace(new RegExp(`${quote}$`), '')
        return symbol.includes(normalized) || base.includes(normalized) || base.startsWith(normalized)
      })
      .slice(0, 14)
  }, [symbols, normalized, quote])

  const pick = (symbol: string) => {
    const base = symbol.replace(new RegExp(`${quote}$`), '')
    onChange(base)
    setQuery(base)
    setOpen(false)
  }

  return (
    <div className="coin-search" ref={wrapRef}>
      <input
        value={query}
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          onChange(toBase(next, quote))
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? `Ex.: BTC/${quote}`}
        autoCapitalize="characters"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
      />
      {open && matches.length > 0 && (
        <ul className="coin-search-menu" role="listbox">
          {matches.map((symbol) => {
            const base = symbol.replace(new RegExp(`${quote}$`), '')
            return (
              <li key={symbol}>
                <button
                  type="button"
                  className={base === value ? 'active' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(symbol)}
                >
                  {formatTradingPair(symbol)}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
