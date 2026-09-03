import type { Candle, Interval } from './types'
import { getT212BinancePlaybook } from './t212-binance-feed'
import { t212IsCfdListed } from './t212-crypto-cfd'

/** Instrumentos CFD Trading 212 → símbolo Yahoo (OHLC). */
export type T212Instrument = {
  id: string
  /** Nome na T212 / pesquisa. */
  t212Label: string
  /** Pesquisa T212. */
  t212Search: string
  yahooSymbol: string
  kind: 'index' | 'future' | 'forex' | 'metal' | 'energy' | 'crypto' | 'stock'
  short: string
}

/**
 * Símbolos Twelve Data verificados no catálogo oficial.
 * Ausência deliberada = símbolo ambíguo/inexistente; usa Yahoo e nunca resolve
 * por engano para uma acção/ETF com o mesmo ticker (ex.: NG, ES).
 */
export const T212_TWELVE_SYMBOL: Record<string, string> = {
  us500: 'SPX',
  ger40: 'GDAXI',
  uk100: 'FTSE',
  eurusd: 'EUR/USD',
  gbpusd: 'GBP/USD',
  usdjpy: 'USD/JPY',
  xauusd: 'XAU/USD',
  xagusd: 'XAG/USD',
  oil: 'WTI/USD',
  fra40: 'FCHI',
  eu50: 'STOXX50E',
  audusd: 'AUD/USD',
  usdchf: 'USD/CHF',
  eurjpy: 'EUR/JPY',
  copper: 'HG1',
  btc: 'BTC/USD',
  eth: 'ETH/USD',
  sol: 'SOL/USD',
  xrp: 'XRP/USD',
  doge: 'DOGE/USD',
  /** Acções US + macro (Yahoo; Twelve se Grow). */
  nvda: 'NVDA',
  meta: 'META',
  aapl: 'AAPL',
  tsla: 'TSLA',
  amzn: 'AMZN',
  msft: 'MSFT',
  amd: 'AMD',
  googl: 'GOOGL',
  eurgbp: 'EUR/GBP',
  nzdusd: 'NZD/USD',
  spa35: 'IBEX',
  ita40: 'FTSEMIB',
  hk50: 'HSI',
  usdcad: 'USD/CAD',
  euraud: 'EUR/AUD',
  gbpjpy: 'GBP/JPY',
  eurcad: 'EUR/CAD',
  audjpy: 'AUD/JPY',
  eurchf: 'EUR/CHF',
  gbpchf: 'GBP/CHF',
  usdmxn: 'USD/MXN',
  brent: 'XBR/USD',
  platinum: 'XPT/USD',
  ada: 'ADA/USD',
  link: 'LINK/USD',
  avax: 'AVAX/USD',
  ltc: 'LTC/USD',
  bnb: 'BNB/USD',
  dot: 'PDOTN/USD',
  near: 'NEAR/USD',
  nflx: 'NFLX',
  coin: 'COIN',
  pltr: 'PLTR',
  arm: 'ARM',
  intc: 'INTC',
  baba: 'BABA',
  jpm: 'JPM',
  dis: 'DIS',
  uber: 'UBER',
  crm: 'CRM',
  shib: 'SHIB/USD',
  trx: 'TRX/USD',
  ton: 'TON/USD',
  uni: 'UNI/USD',
  atom: 'ATOM/USD',
  apt: 'APT/USD',
  sui: 'SUI/USD',
  inj: 'INJ/USD',
  pepe: 'PEPE/USD',
  hbar: 'HBAR/USD',
  aave: 'AAVE/USD',
  arb: 'ARB/USD',
  op: 'OP/USD',
  tao: 'TAO/USD',
  ondo: 'ONDO/USD',
  wif: 'WIF/USD',
  pyth: 'PYTH/USD',
  bch: 'BCH/USD',
  xlm: 'XLM/USD',
  etc: 'ETC/USD',
  fil: 'FIL/USD',
  algo: 'ALGO/USD',
  vet: 'VET/USD',
  pol: 'POL/USD',
  sand: 'SAND/USD',
  mana: 'MANA/USD',
  ape: 'APE/USD',
  ldo: 'LDO/USD',
  mkr: 'MKR/USD',
  crv: 'CRV/USD',
  grt: 'GRT/USD',
  ftm: 'FTM/USD',
  egld: 'EGLD/USD',
  axs: 'AXS/USD',
  enj: 'ENJ/USD',
  chz: 'CHZ/USD',
  rune: 'RUNE/USD',
  fet: 'FET/USD',
  rndr: 'RENDER/USD',
  imx: 'IMX/USD',
  sei: 'SEI/USD',
  jup: 'JUP/USD',
  bonk: 'BONK/USD',
  floki: 'FLOKI/USD',
  wld: 'WLD/USD',
  tia: 'TIA/USD',
  ena: 'ENA/USD',
  stx: 'STX/USD',
  jasmy: 'JASMY/USD',
  avgo: 'AVGO',
  tsm: 'TSM',
  asml: 'ASML',
  lly: 'LLY',
  visa: 'V',
  ma: 'MA',
  hood: 'HOOD',
  mstr: 'MSTR',
  smci: 'SMCI',
  orcl: 'ORCL',
  crwd: 'CRWD',
  nzdjpy: 'NZD/JPY',
  cadjpy: 'CAD/JPY',
}

export function twelveSymbolFor(instrument: T212Instrument): string | undefined {
  return T212_TWELVE_SYMBOL[instrument.id]
}

export type T212FeedSource = 'twelve' | 'yahoo' | 'binance'
/** Preferência do utilizador: Yahoo (defeito) ou Twelve (fallback Yahoo se falhar). Crypto T212 usa Binance quando o par existe. */
export type T212FeedPreference = 'yahoo' | 'twelve'

let feedStats = { twelve: 0, yahoo: 0, binance: 0, twelveExhausted: false }
let twelveCooldownUntil = 0
let twelveQueue: Promise<unknown> = Promise.resolve()

export function resetT212FeedStats() {
  feedStats = { twelve: 0, yahoo: 0, binance: 0, twelveExhausted: twelveCooldownUntil > Date.now() }
}

export function getT212FeedStats() {
  return { ...feedStats, twelveCooldownUntil }
}

export const T212_INSTRUMENTS: T212Instrument[] = [
  {
    id: 'tech100',
    t212Label: 'USA Tech 100',
    t212Search: 'TECH100',
    yahooSymbol: 'NQ=F',
    kind: 'index',
    short: 'TECH100',
  },
  {
    id: 'us500',
    t212Label: 'USA 500',
    t212Search: 'US500',
    yahooSymbol: 'ES=F',
    kind: 'index',
    short: 'US500',
  },
  {
    id: 'us30',
    t212Label: 'USA 30',
    t212Search: 'US30',
    yahooSymbol: 'YM=F',
    kind: 'index',
    short: 'US30',
  },
  {
    id: 'ger40',
    t212Label: 'Germany 40',
    t212Search: 'GER40',
    yahooSymbol: '^GDAXI',
    kind: 'index',
    short: 'GER40',
  },
  {
    id: 'uk100',
    t212Label: 'UK 100',
    t212Search: 'UK100',
    yahooSymbol: '^FTSE',
    kind: 'index',
    short: 'UK100',
  },
  {
    id: 'eurusd',
    t212Label: 'EUR/USD',
    t212Search: 'EURUSD',
    yahooSymbol: 'EURUSD=X',
    kind: 'forex',
    short: 'EURUSD',
  },
  {
    id: 'gbpusd',
    t212Label: 'GBP/USD',
    t212Search: 'GBPUSD',
    yahooSymbol: 'GBPUSD=X',
    kind: 'forex',
    short: 'GBPUSD',
  },
  {
    id: 'usdjpy',
    t212Label: 'USD/JPY',
    t212Search: 'USDJPY',
    yahooSymbol: 'USDJPY=X',
    kind: 'forex',
    short: 'USDJPY',
  },
  {
    id: 'xauusd',
    t212Label: 'Gold',
    t212Search: 'XAUUSD',
    yahooSymbol: 'GC=F',
    kind: 'metal',
    short: 'XAUUSD',
  },
  {
    id: 'xagusd',
    t212Label: 'Silver',
    t212Search: 'XAGUSD',
    yahooSymbol: 'SI=F',
    kind: 'metal',
    short: 'XAGUSD',
  },
  {
    id: 'oil',
    t212Label: 'US Crude',
    t212Search: 'CRUDE',
    yahooSymbol: 'CL=F',
    kind: 'energy',
    short: 'OIL',
  },
]

/** Extras opcionais (utilizador liga na watchlist). */
export const T212_EXTRA_INSTRUMENTS: T212Instrument[] = [
  {
    id: 'fra40',
    t212Label: 'France 40',
    t212Search: 'FR40',
    yahooSymbol: '^FCHI',
    kind: 'index',
    short: 'FRA40',
  },
  {
    id: 'eu50',
    t212Label: 'EU 50',
    t212Search: 'EU50',
    yahooSymbol: '^STOXX50E',
    kind: 'index',
    short: 'EU50',
  },
  {
    id: 'jp225',
    t212Label: 'Japan 225',
    t212Search: 'JPN225',
    yahooSymbol: '^N225',
    kind: 'index',
    short: 'JP225',
  },
  {
    id: 'audusd',
    t212Label: 'AUD/USD',
    t212Search: 'AUDUSD',
    yahooSymbol: 'AUDUSD=X',
    kind: 'forex',
    short: 'AUDUSD',
  },
  {
    id: 'usdchf',
    t212Label: 'USD/CHF',
    t212Search: 'USDCHF',
    yahooSymbol: 'USDCHF=X',
    kind: 'forex',
    short: 'USDCHF',
  },
  {
    id: 'eurjpy',
    t212Label: 'EUR/JPY',
    t212Search: 'EURJPY',
    yahooSymbol: 'EURJPY=X',
    kind: 'forex',
    short: 'EURJPY',
  },
  {
    id: 'copper',
    t212Label: 'Copper',
    t212Search: 'COPPER',
    yahooSymbol: 'HG=F',
    kind: 'metal',
    short: 'COPPER',
  },
  {
    id: 'ngas',
    t212Label: 'Natural Gas',
    t212Search: 'NATGAS',
    yahooSymbol: 'NG=F',
    kind: 'energy',
    short: 'NGAS',
  },
  {
    id: 'btc',
    t212Label: 'Bitcoin',
    t212Search: 'BTC',
    yahooSymbol: 'BTC-USD',
    kind: 'crypto',
    short: 'BTC',
  },
  {
    id: 'eth',
    t212Label: 'Ethereum',
    t212Search: 'ETH',
    yahooSymbol: 'ETH-USD',
    kind: 'crypto',
    short: 'ETH',
  },
  {
    id: 'sol',
    t212Label: 'Solana',
    t212Search: 'SOL',
    yahooSymbol: 'SOL-USD',
    kind: 'crypto',
    short: 'SOL',
  },
  {
    id: 'xrp',
    t212Label: 'XRP',
    t212Search: 'XRP',
    yahooSymbol: 'XRP-USD',
    kind: 'crypto',
    short: 'XRP',
  },
  {
    id: 'doge',
    t212Label: 'Dogecoin',
    t212Search: 'DOGE',
    yahooSymbol: 'DOGE-USD',
    kind: 'crypto',
    short: 'DOGE',
  },
  {
    id: 'es',
    t212Label: 'E-mini S&P 500 (ES)',
    t212Search: 'US500',
    yahooSymbol: 'ES=F',
    kind: 'future',
    short: 'ES',
  },
  {
    id: 'nq',
    t212Label: 'E-mini Nasdaq (NQ)',
    t212Search: 'TECH100',
    yahooSymbol: 'NQ=F',
    kind: 'future',
    short: 'NQ',
  },
  {
    id: 'ym',
    t212Label: 'E-mini Dow (YM)',
    t212Search: 'US30',
    yahooSymbol: 'YM=F',
    kind: 'future',
    short: 'YM',
  },
  {
    id: 'nvda',
    t212Label: 'NVIDIA',
    t212Search: 'NVDA',
    yahooSymbol: 'NVDA',
    kind: 'stock',
    short: 'NVDA',
  },
  {
    id: 'meta',
    t212Label: 'Meta',
    t212Search: 'META',
    yahooSymbol: 'META',
    kind: 'stock',
    short: 'META',
  },
  {
    id: 'aapl',
    t212Label: 'Apple',
    t212Search: 'AAPL',
    yahooSymbol: 'AAPL',
    kind: 'stock',
    short: 'AAPL',
  },
  {
    id: 'tsla',
    t212Label: 'Tesla',
    t212Search: 'TSLA',
    yahooSymbol: 'TSLA',
    kind: 'stock',
    short: 'TSLA',
  },
  {
    id: 'amzn',
    t212Label: 'Amazon',
    t212Search: 'AMZN',
    yahooSymbol: 'AMZN',
    kind: 'stock',
    short: 'AMZN',
  },
  {
    id: 'msft',
    t212Label: 'Microsoft',
    t212Search: 'MSFT',
    yahooSymbol: 'MSFT',
    kind: 'stock',
    short: 'MSFT',
  },
  {
    id: 'amd',
    t212Label: 'AMD',
    t212Search: 'AMD',
    yahooSymbol: 'AMD',
    kind: 'stock',
    short: 'AMD',
  },
  {
    id: 'googl',
    t212Label: 'Alphabet',
    t212Search: 'GOOGL',
    yahooSymbol: 'GOOGL',
    kind: 'stock',
    short: 'GOOGL',
  },
  {
    id: 'eurgbp',
    t212Label: 'EUR/GBP',
    t212Search: 'EURGBP',
    yahooSymbol: 'EURGBP=X',
    kind: 'forex',
    short: 'EURGBP',
  },
  {
    id: 'nzdusd',
    t212Label: 'NZD/USD',
    t212Search: 'NZDUSD',
    yahooSymbol: 'NZDUSD=X',
    kind: 'forex',
    short: 'NZDUSD',
  },
  {
    id: 'spa35',
    t212Label: 'Spain 35',
    t212Search: 'SPAIN35',
    yahooSymbol: '^IBEX',
    kind: 'index',
    short: 'SPA35',
  },
  {
    id: 'ita40',
    t212Label: 'Italy 40',
    t212Search: 'ITA40',
    yahooSymbol: 'FTSEMIB.MI',
    kind: 'index',
    short: 'ITA40',
  },
  {
    id: 'hk50',
    t212Label: 'Hong Kong 50',
    t212Search: 'HK50',
    yahooSymbol: '^HSI',
    kind: 'index',
    short: 'HK50',
  },
  {
    id: 'swiss20',
    t212Label: 'Switzerland 20',
    t212Search: 'SWISS20',
    yahooSymbol: '^SSMI',
    kind: 'index',
    short: 'SWISS20',
  },
  {
    id: 'usdcad',
    t212Label: 'USD/CAD',
    t212Search: 'USDCAD',
    yahooSymbol: 'USDCAD=X',
    kind: 'forex',
    short: 'USDCAD',
  },
  {
    id: 'euraud',
    t212Label: 'EUR/AUD',
    t212Search: 'EURAUD',
    yahooSymbol: 'EURAUD=X',
    kind: 'forex',
    short: 'EURAUD',
  },
  {
    id: 'gbpjpy',
    t212Label: 'GBP/JPY',
    t212Search: 'GBPJPY',
    yahooSymbol: 'GBPJPY=X',
    kind: 'forex',
    short: 'GBPJPY',
  },
  {
    id: 'eurcad',
    t212Label: 'EUR/CAD',
    t212Search: 'EURCAD',
    yahooSymbol: 'EURCAD=X',
    kind: 'forex',
    short: 'EURCAD',
  },
  {
    id: 'audjpy',
    t212Label: 'AUD/JPY',
    t212Search: 'AUDJPY',
    yahooSymbol: 'AUDJPY=X',
    kind: 'forex',
    short: 'AUDJPY',
  },
  {
    id: 'eurchf',
    t212Label: 'EUR/CHF',
    t212Search: 'EURCHF',
    yahooSymbol: 'EURCHF=X',
    kind: 'forex',
    short: 'EURCHF',
  },
  {
    id: 'gbpchf',
    t212Label: 'GBP/CHF',
    t212Search: 'GBPCHF',
    yahooSymbol: 'GBPCHF=X',
    kind: 'forex',
    short: 'GBPCHF',
  },
  {
    id: 'usdmxn',
    t212Label: 'USD/MXN',
    t212Search: 'USDMXN',
    yahooSymbol: 'USDMXN=X',
    kind: 'forex',
    short: 'USDMXN',
  },
  {
    id: 'brent',
    t212Label: 'Brent Crude',
    t212Search: 'BRENT',
    yahooSymbol: 'BZ=F',
    kind: 'energy',
    short: 'BRENT',
  },
  {
    id: 'platinum',
    t212Label: 'Platinum',
    t212Search: 'XPTUSD',
    yahooSymbol: 'PL=F',
    kind: 'metal',
    short: 'XPTUSD',
  },
  {
    id: 'ada',
    t212Label: 'Cardano',
    t212Search: 'ADA',
    yahooSymbol: 'ADA-USD',
    kind: 'crypto',
    short: 'ADA',
  },
  {
    id: 'link',
    t212Label: 'Chainlink',
    t212Search: 'LINK',
    yahooSymbol: 'LINK-USD',
    kind: 'crypto',
    short: 'LINK',
  },
  {
    id: 'avax',
    t212Label: 'Avalanche',
    t212Search: 'AVAX',
    yahooSymbol: 'AVAX-USD',
    kind: 'crypto',
    short: 'AVAX',
  },
  {
    id: 'ltc',
    t212Label: 'Litecoin',
    t212Search: 'LTC',
    yahooSymbol: 'LTC-USD',
    kind: 'crypto',
    short: 'LTC',
  },
  {
    id: 'bnb',
    t212Label: 'BNB',
    t212Search: 'BNB',
    yahooSymbol: 'BNB-USD',
    kind: 'crypto',
    short: 'BNB',
  },
  {
    id: 'dot',
    t212Label: 'Polkadot',
    t212Search: 'DOT',
    yahooSymbol: 'DOT-USD',
    kind: 'crypto',
    short: 'DOT',
  },
  {
    id: 'near',
    t212Label: 'NEAR',
    t212Search: 'NEAR',
    yahooSymbol: 'NEAR-USD',
    kind: 'crypto',
    short: 'NEAR',
  },
  {
    id: 'nflx',
    t212Label: 'Netflix',
    t212Search: 'NFLX',
    yahooSymbol: 'NFLX',
    kind: 'stock',
    short: 'NFLX',
  },
  {
    id: 'coin',
    t212Label: 'Coinbase',
    t212Search: 'COIN',
    yahooSymbol: 'COIN',
    kind: 'stock',
    short: 'COIN',
  },
  {
    id: 'pltr',
    t212Label: 'Palantir',
    t212Search: 'PLTR',
    yahooSymbol: 'PLTR',
    kind: 'stock',
    short: 'PLTR',
  },
  {
    id: 'arm',
    t212Label: 'Arm Holdings',
    t212Search: 'ARM',
    yahooSymbol: 'ARM',
    kind: 'stock',
    short: 'ARM',
  },
  {
    id: 'intc',
    t212Label: 'Intel',
    t212Search: 'INTC',
    yahooSymbol: 'INTC',
    kind: 'stock',
    short: 'INTC',
  },
  {
    id: 'baba',
    t212Label: 'Alibaba',
    t212Search: 'BABA',
    yahooSymbol: 'BABA',
    kind: 'stock',
    short: 'BABA',
  },
  {
    id: 'jpm',
    t212Label: 'JPMorgan',
    t212Search: 'JPM',
    yahooSymbol: 'JPM',
    kind: 'stock',
    short: 'JPM',
  },
  {
    id: 'dis',
    t212Label: 'Disney',
    t212Search: 'DIS',
    yahooSymbol: 'DIS',
    kind: 'stock',
    short: 'DIS',
  },
  {
    id: 'uber',
    t212Label: 'Uber',
    t212Search: 'UBER',
    yahooSymbol: 'UBER',
    kind: 'stock',
    short: 'UBER',
  },
  {
    id: 'crm',
    t212Label: 'Salesforce',
    t212Search: 'CRM',
    yahooSymbol: 'CRM',
    kind: 'stock',
    short: 'CRM',
  },
  { id: 'shib', t212Label: 'Shiba Inu', t212Search: 'SHIB', yahooSymbol: 'SHIB-USD', kind: 'crypto', short: 'SHIB' },
  { id: 'trx', t212Label: 'TRON', t212Search: 'TRX', yahooSymbol: 'TRX-USD', kind: 'crypto', short: 'TRX' },
  { id: 'ton', t212Label: 'Toncoin', t212Search: 'TON', yahooSymbol: 'TON-USD', kind: 'crypto', short: 'TON' },
  { id: 'uni', t212Label: 'Uniswap', t212Search: 'UNI', yahooSymbol: 'UNI-USD', kind: 'crypto', short: 'UNI' },
  { id: 'atom', t212Label: 'Cosmos', t212Search: 'Cosmos', yahooSymbol: 'ATOM-USD', kind: 'crypto', short: 'ATOM' },
  { id: 'apt', t212Label: 'Aptos', t212Search: 'APT', yahooSymbol: 'APT-USD', kind: 'crypto', short: 'APT' },
  { id: 'sui', t212Label: 'Sui', t212Search: 'SUI', yahooSymbol: 'SUI-USD', kind: 'crypto', short: 'SUI' },
  { id: 'inj', t212Label: 'Injective', t212Search: 'INJ', yahooSymbol: 'INJ-USD', kind: 'crypto', short: 'INJ' },
  { id: 'pepe', t212Label: 'PEPE', t212Search: 'PEPE', yahooSymbol: 'PEPE-USD', kind: 'crypto', short: 'PEPE' },
  { id: 'hbar', t212Label: 'Hedera', t212Search: 'HBAR', yahooSymbol: 'HBAR-USD', kind: 'crypto', short: 'HBAR' },
  { id: 'aave', t212Label: 'Aave', t212Search: 'AAVE', yahooSymbol: 'AAVE-USD', kind: 'crypto', short: 'AAVE' },
  { id: 'arb', t212Label: 'Arbitrum', t212Search: 'ARB', yahooSymbol: 'ARB-USD', kind: 'crypto', short: 'ARB' },
  { id: 'op', t212Label: 'Optimism', t212Search: 'OP', yahooSymbol: 'OP-USD', kind: 'crypto', short: 'OP' },
  { id: 'tao', t212Label: 'Bittensor', t212Search: 'TAO', yahooSymbol: 'TAO-USD', kind: 'crypto', short: 'TAO' },
  { id: 'ondo', t212Label: 'Ondo', t212Search: 'ONDO', yahooSymbol: 'ONDO-USD', kind: 'crypto', short: 'ONDO' },
  { id: 'wif', t212Label: 'dogwifhat', t212Search: 'WIF', yahooSymbol: 'WIF-USD', kind: 'crypto', short: 'WIF' },
  { id: 'pyth', t212Label: 'Pyth', t212Search: 'PYTH', yahooSymbol: 'PYTH-USD', kind: 'crypto', short: 'PYTH' },
  { id: 'bch', t212Label: 'Bitcoin Cash', t212Search: 'BCH', yahooSymbol: 'BCH-USD', kind: 'crypto', short: 'BCH' },
  { id: 'xlm', t212Label: 'Stellar', t212Search: 'XLM', yahooSymbol: 'XLM-USD', kind: 'crypto', short: 'XLM' },
  { id: 'etc', t212Label: 'Ethereum Classic', t212Search: 'ETC', yahooSymbol: 'ETC-USD', kind: 'crypto', short: 'ETC' },
  { id: 'fil', t212Label: 'Filecoin', t212Search: 'FIL', yahooSymbol: 'FIL-USD', kind: 'crypto', short: 'FIL' },
  { id: 'algo', t212Label: 'Algorand', t212Search: 'ALGO', yahooSymbol: 'ALGO-USD', kind: 'crypto', short: 'ALGO' },
  { id: 'vet', t212Label: 'VeChain', t212Search: 'VET', yahooSymbol: 'VET-USD', kind: 'crypto', short: 'VET' },
  { id: 'pol', t212Label: 'Polygon', t212Search: 'MATIC', yahooSymbol: 'POL-USD', kind: 'crypto', short: 'POL' },
  { id: 'sand', t212Label: 'The Sandbox', t212Search: 'SAND', yahooSymbol: 'SAND-USD', kind: 'crypto', short: 'SAND' },
  { id: 'mana', t212Label: 'Decentraland', t212Search: 'MANA', yahooSymbol: 'MANA-USD', kind: 'crypto', short: 'MANA' },
  { id: 'ape', t212Label: 'ApeCoin', t212Search: 'APE', yahooSymbol: 'APE-USD', kind: 'crypto', short: 'APE' },
  { id: 'ldo', t212Label: 'Lido', t212Search: 'LDO', yahooSymbol: 'LDO-USD', kind: 'crypto', short: 'LDO' },
  { id: 'mkr', t212Label: 'Maker', t212Search: 'MKR', yahooSymbol: 'MKR-USD', kind: 'crypto', short: 'MKR' },
  { id: 'crv', t212Label: 'Curve', t212Search: 'CRV', yahooSymbol: 'CRV-USD', kind: 'crypto', short: 'CRV' },
  { id: 'grt', t212Label: 'The Graph', t212Search: 'GRT', yahooSymbol: 'GRT-USD', kind: 'crypto', short: 'GRT' },
  { id: 'ftm', t212Label: 'Fantom', t212Search: 'FTM', yahooSymbol: 'FTM-USD', kind: 'crypto', short: 'FTM' },
  { id: 'egld', t212Label: 'MultiversX', t212Search: 'EGLD', yahooSymbol: 'EGLD-USD', kind: 'crypto', short: 'EGLD' },
  { id: 'axs', t212Label: 'Axie Infinity', t212Search: 'AXS', yahooSymbol: 'AXS-USD', kind: 'crypto', short: 'AXS' },
  { id: 'enj', t212Label: 'Enjin', t212Search: 'ENJ', yahooSymbol: 'ENJ-USD', kind: 'crypto', short: 'ENJ' },
  { id: 'chz', t212Label: 'Chiliz', t212Search: 'CHZ', yahooSymbol: 'CHZ-USD', kind: 'crypto', short: 'CHZ' },
  { id: 'rune', t212Label: 'THORChain', t212Search: 'RUNE', yahooSymbol: 'RUNE-USD', kind: 'crypto', short: 'RUNE' },
  { id: 'fet', t212Label: 'Fetch.ai', t212Search: 'FET', yahooSymbol: 'FET-USD', kind: 'crypto', short: 'FET' },
  { id: 'rndr', t212Label: 'Render', t212Search: 'RENDER', yahooSymbol: 'RENDER-USD', kind: 'crypto', short: 'RENDER' },
  { id: 'imx', t212Label: 'Immutable', t212Search: 'IMX', yahooSymbol: 'IMX-USD', kind: 'crypto', short: 'IMX' },
  { id: 'sei', t212Label: 'Sei', t212Search: 'SEI', yahooSymbol: 'SEI-USD', kind: 'crypto', short: 'SEI' },
  { id: 'jup', t212Label: 'Jupiter', t212Search: 'Jupiter', yahooSymbol: 'JUP-USD', kind: 'crypto', short: 'JUP' },
  { id: 'bonk', t212Label: 'Bonk', t212Search: 'BONK', yahooSymbol: 'BONK-USD', kind: 'crypto', short: 'BONK' },
  { id: 'floki', t212Label: 'FLOKI', t212Search: 'FLOKI', yahooSymbol: 'FLOKI-USD', kind: 'crypto', short: 'FLOKI' },
  { id: 'wld', t212Label: 'Worldcoin', t212Search: 'WLD', yahooSymbol: 'WLD-USD', kind: 'crypto', short: 'WLD' },
  { id: 'tia', t212Label: 'Celestia', t212Search: 'TIA', yahooSymbol: 'TIA-USD', kind: 'crypto', short: 'TIA' },
  { id: 'ena', t212Label: 'Ethena', t212Search: 'ENA', yahooSymbol: 'ENA-USD', kind: 'crypto', short: 'ENA' },
  { id: 'stx', t212Label: 'Stacks', t212Search: 'STX', yahooSymbol: 'STX-USD', kind: 'crypto', short: 'STX' },
  { id: 'jasmy', t212Label: 'Jasmy', t212Search: 'JASMY', yahooSymbol: 'JASMY-USD', kind: 'crypto', short: 'JASMY' },
  { id: 'avgo', t212Label: 'Broadcom', t212Search: 'AVGO', yahooSymbol: 'AVGO', kind: 'stock', short: 'AVGO' },
  { id: 'tsm', t212Label: 'TSMC', t212Search: 'TSM', yahooSymbol: 'TSM', kind: 'stock', short: 'TSM' },
  { id: 'asml', t212Label: 'ASML', t212Search: 'ASML', yahooSymbol: 'ASML', kind: 'stock', short: 'ASML' },
  { id: 'lly', t212Label: 'Eli Lilly', t212Search: 'LLY', yahooSymbol: 'LLY', kind: 'stock', short: 'LLY' },
  { id: 'visa', t212Label: 'Visa', t212Search: 'V', yahooSymbol: 'V', kind: 'stock', short: 'V' },
  { id: 'ma', t212Label: 'Mastercard', t212Search: 'MA', yahooSymbol: 'MA', kind: 'stock', short: 'MA' },
  { id: 'hood', t212Label: 'Robinhood', t212Search: 'HOOD', yahooSymbol: 'HOOD', kind: 'stock', short: 'HOOD' },
  { id: 'mstr', t212Label: 'Strategy', t212Search: 'MSTR', yahooSymbol: 'MSTR', kind: 'stock', short: 'MSTR' },
  { id: 'smci', t212Label: 'Super Micro', t212Search: 'SMCI', yahooSymbol: 'SMCI', kind: 'stock', short: 'SMCI' },
  { id: 'orcl', t212Label: 'Oracle', t212Search: 'ORCL', yahooSymbol: 'ORCL', kind: 'stock', short: 'ORCL' },
  { id: 'crwd', t212Label: 'CrowdStrike', t212Search: 'CRWD', yahooSymbol: 'CRWD', kind: 'stock', short: 'CRWD' },
  { id: 'nzdjpy', t212Label: 'NZD/JPY', t212Search: 'NZDJPY', yahooSymbol: 'NZDJPY=X', kind: 'forex', short: 'NZDJPY' },
  { id: 'cadjpy', t212Label: 'CAD/JPY', t212Search: 'CADJPY', yahooSymbol: 'CADJPY=X', kind: 'forex', short: 'CADJPY' },
  { id: 'gbpaud', t212Label: 'GBP/AUD', t212Search: 'GBPAUD', yahooSymbol: 'GBPAUD=X', kind: 'forex', short: 'GBPAUD' },
  { id: 'gbpcad', t212Label: 'GBP/CAD', t212Search: 'GBPCAD', yahooSymbol: 'GBPCAD=X', kind: 'forex', short: 'GBPCAD' },
  { id: 'gbpnzd', t212Label: 'GBP/NZD', t212Search: 'GBPNZD', yahooSymbol: 'GBPNZD=X', kind: 'forex', short: 'GBPNZD' },
  { id: 'audnzd', t212Label: 'AUD/NZD', t212Search: 'AUDNZD', yahooSymbol: 'AUDNZD=X', kind: 'forex', short: 'AUDNZD' },
  { id: 'audcad', t212Label: 'AUD/CAD', t212Search: 'AUDCAD', yahooSymbol: 'AUDCAD=X', kind: 'forex', short: 'AUDCAD' },
  { id: 'audchf', t212Label: 'AUD/CHF', t212Search: 'AUDCHF', yahooSymbol: 'AUDCHF=X', kind: 'forex', short: 'AUDCHF' },
  { id: 'nzdcad', t212Label: 'NZD/CAD', t212Search: 'NZDCAD', yahooSymbol: 'NZDCAD=X', kind: 'forex', short: 'NZDCAD' },
  { id: 'nzdchf', t212Label: 'NZD/CHF', t212Search: 'NZDCHF', yahooSymbol: 'NZDCHF=X', kind: 'forex', short: 'NZDCHF' },
  { id: 'cadchf', t212Label: 'CAD/CHF', t212Search: 'CADCHF', yahooSymbol: 'CADCHF=X', kind: 'forex', short: 'CADCHF' },
  { id: 'chfjpy', t212Label: 'CHF/JPY', t212Search: 'CHFJPY', yahooSymbol: 'CHFJPY=X', kind: 'forex', short: 'CHFJPY' },
  { id: 'eurnzd', t212Label: 'EUR/NZD', t212Search: 'EURNZD', yahooSymbol: 'EURNZD=X', kind: 'forex', short: 'EURNZD' },
  { id: 'usdnok', t212Label: 'USD/NOK', t212Search: 'USDNOK', yahooSymbol: 'USDNOK=X', kind: 'forex', short: 'USDNOK' },
  { id: 'usdsek', t212Label: 'USD/SEK', t212Search: 'USDSEK', yahooSymbol: 'USDSEK=X', kind: 'forex', short: 'USDSEK' },
  { id: 'usdzar', t212Label: 'USD/ZAR', t212Search: 'USDZAR', yahooSymbol: 'USDZAR=X', kind: 'forex', short: 'USDZAR' },
  { id: 'usdtry', t212Label: 'USD/TRY', t212Search: 'USDTRY', yahooSymbol: 'USDTRY=X', kind: 'forex', short: 'USDTRY' },
  { id: 'usdcnh', t212Label: 'USD/CNH', t212Search: 'USDCNH', yahooSymbol: 'CNH=X', kind: 'forex', short: 'USDCNH' },
  { id: 'neth25', t212Label: 'Netherlands 25', t212Search: 'NL25', yahooSymbol: '^AEX', kind: 'index', short: 'NETH25' },
  { id: 'volx', t212Label: 'Volatility', t212Search: 'VOLX', yahooSymbol: '^VIX', kind: 'index', short: 'VOLX' },
  { id: 'palladium', t212Label: 'Palladium', t212Search: 'PALLADIUM', yahooSymbol: 'PA=F', kind: 'metal', short: 'XPDUSD' },
  { id: 'brkb', t212Label: 'Berkshire B', t212Search: 'BRK.B', yahooSymbol: 'BRK-B', kind: 'stock', short: 'BRK.B' },
  { id: 'jnj', t212Label: 'Johnson & Johnson', t212Search: 'JNJ', yahooSymbol: 'JNJ', kind: 'stock', short: 'JNJ' },
  { id: 'unh', t212Label: 'UnitedHealth', t212Search: 'UNH', yahooSymbol: 'UNH', kind: 'stock', short: 'UNH' },
  { id: 'xom', t212Label: 'Exxon Mobil', t212Search: 'XOM', yahooSymbol: 'XOM', kind: 'stock', short: 'XOM' },
  { id: 'cvx', t212Label: 'Chevron', t212Search: 'CVX', yahooSymbol: 'CVX', kind: 'stock', short: 'CVX' },
  { id: 'wmt', t212Label: 'Walmart', t212Search: 'WMT', yahooSymbol: 'WMT', kind: 'stock', short: 'WMT' },
  { id: 'pg', t212Label: 'Procter & Gamble', t212Search: 'PG', yahooSymbol: 'PG', kind: 'stock', short: 'PG' },
  { id: 'ko', t212Label: 'Coca-Cola', t212Search: 'KO', yahooSymbol: 'KO', kind: 'stock', short: 'KO' },
  { id: 'pep', t212Label: 'PepsiCo', t212Search: 'PEP', yahooSymbol: 'PEP', kind: 'stock', short: 'PEP' },
  { id: 'cost', t212Label: 'Costco', t212Search: 'COST', yahooSymbol: 'COST', kind: 'stock', short: 'COST' },
  { id: 'hd', t212Label: 'Home Depot', t212Search: 'HD', yahooSymbol: 'HD', kind: 'stock', short: 'HD' },
  { id: 'bac', t212Label: 'Bank of America', t212Search: 'BAC', yahooSymbol: 'BAC', kind: 'stock', short: 'BAC' },
  { id: 'gs', t212Label: 'Goldman Sachs', t212Search: 'GS', yahooSymbol: 'GS', kind: 'stock', short: 'GS' },
  { id: 'qcom', t212Label: 'Qualcomm', t212Search: 'QCOM', yahooSymbol: 'QCOM', kind: 'stock', short: 'QCOM' },
  { id: 'adbe', t212Label: 'Adobe', t212Search: 'ADBE', yahooSymbol: 'ADBE', kind: 'stock', short: 'ADBE' },
  { id: 'now', t212Label: 'ServiceNow', t212Search: 'NOW', yahooSymbol: 'NOW', kind: 'stock', short: 'NOW' },
  { id: 'panw', t212Label: 'Palo Alto', t212Search: 'PANW', yahooSymbol: 'PANW', kind: 'stock', short: 'PANW' },
  { id: 'shop', t212Label: 'Shopify', t212Search: 'SHOP', yahooSymbol: 'SHOP', kind: 'stock', short: 'SHOP' },
  { id: 'nvo', t212Label: 'Novo Nordisk', t212Search: 'NVO', yahooSymbol: 'NVO', kind: 'stock', short: 'NVO' },
  { id: 'ba', t212Label: 'Boeing', t212Search: 'BA', yahooSymbol: 'BA', kind: 'stock', short: 'BA' },
  { id: 'cat', t212Label: 'Caterpillar', t212Search: 'CAT', yahooSymbol: 'CAT', kind: 'stock', short: 'CAT' },
  { id: 'ge', t212Label: 'GE Aerospace', t212Search: 'GE', yahooSymbol: 'GE', kind: 'stock', short: 'GE' },
  { id: 'sap', t212Label: 'SAP', t212Search: 'SAP', yahooSymbol: 'SAP', kind: 'stock', short: 'SAP' },
  { id: 'air', t212Label: 'Airbus', t212Search: 'AIR', yahooSymbol: 'AIR.PA', kind: 'stock', short: 'AIR' },
  { id: 'mc', t212Label: 'LVMH', t212Search: 'MC', yahooSymbol: 'MC.PA', kind: 'stock', short: 'MC' },
  { id: 'azn', t212Label: 'AstraZeneca', t212Search: 'AZN', yahooSymbol: 'AZN', kind: 'stock', short: 'AZN' },
  { id: 'shel', t212Label: 'Shell', t212Search: 'SHEL', yahooSymbol: 'SHEL', kind: 'stock', short: 'SHEL' },
]

/** Crypto CFD extras ligados por defeito na 1.ª visita / migração. */
export const T212_DEFAULT_CRYPTO_IDS = ['btc', 'eth', 'sol'] as const

/** Futuros CME úteis (TJR) — análise; execução no CFD T212. */
export const T212_DEFAULT_FUTURE_IDS = ['es', 'nq'] as const

/** Acções US líquidas — seed opcional na watchlist. */
export const T212_DEFAULT_STOCK_IDS = ['nvda', 'meta', 'aapl', 'tsla'] as const

export const T212_BTC_INSTRUMENT = T212_EXTRA_INSTRUMENTS.find((item) => item.id === 'btc')!

/** Catálogo completo (core + extras). */
export const T212_CATALOG: T212Instrument[] = [...T212_INSTRUMENTS, ...T212_EXTRA_INSTRUMENTS]

/** Pares Spot do Agente que coincidem com crypto CFD executável na T212 (ex. XRPUSDC). */
export function t212CryptoAgentSymbols(quote = 'USDC'): string[] {
  return T212_CATALOG.filter((item) => item.kind === 'crypto' && t212IsCfdListed(item)).map((item) => `${item.short}${quote}`)
}

/** Extras que dá para executar na T212 (crypto sem CFD fica de fora). */
export const T212_WATCH_EXTRAS = T212_EXTRA_INSTRUMENTS.filter((item) => t212IsCfdListed(item))

export const T212_EXECUTABLE_CATALOG = T212_CATALOG.filter((item) => t212IsCfdListed(item))

const listedExtraIds = () => T212_WATCH_EXTRAS.map((item) => item.id)

export const T212_CORE_IDS = T212_INSTRUMENTS.map((item) => item.id)

export const DEFAULT_T212_INSTRUMENT = T212_INSTRUMENTS[0]

const WATCHLIST_KEY = 't212-watchlist-ids'

export function instrumentById(id: string): T212Instrument | undefined {
  return T212_CATALOG.find((item) => item.id === id)
}

const CRYPTO_SEED_KEY = 't212-crypto-seeded-v1'
const FUTURE_SEED_KEY = 't212-future-seeded-v1'
const STOCK_SEED_KEY = 't212-stock-seeded-v1'
const ALL_EXTRAS_SEED_KEY = 't212-all-extras-v7'

const markSeed = (key: string) => {
  try {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1')
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** Core sempre activo; extras = ids guardados que existem no catálogo. */
export function readT212WatchlistIds(): string[] {
  const core = [...T212_CORE_IDS]
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    const seedCrypto = () => markSeed(CRYPTO_SEED_KEY)
    const seedFutures = () => markSeed(FUTURE_SEED_KEY)
    const seedStocks = () => markSeed(STOCK_SEED_KEY)
    const seedAllExtras = () => markSeed(ALL_EXTRAS_SEED_KEY)

    if (!raw) {
      seedCrypto()
      seedFutures()
      seedStocks()
      seedAllExtras()
      return [...core, ...listedExtraIds()]
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      seedCrypto()
      seedFutures()
      seedStocks()
      seedAllExtras()
      return [...core, ...listedExtraIds()]
    }
    let extras = parsed
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => T212_WATCH_EXTRAS.some((item) => item.id === id))
    if (seedCrypto()) extras = [...extras, ...T212_DEFAULT_CRYPTO_IDS]
    if (seedFutures()) extras = [...extras, ...T212_DEFAULT_FUTURE_IDS]
    if (seedStocks()) extras = [...extras, ...T212_DEFAULT_STOCK_IDS]
    if (seedAllExtras()) extras = [...extras, ...listedExtraIds()]
    return [...core, ...extras.filter((id, index, all) => all.indexOf(id) === index)]
  } catch {
    return [...core, ...listedExtraIds()]
  }
}

export function writeT212WatchlistIds(ids: string[]) {
  const extras = ids.filter((id) => T212_WATCH_EXTRAS.some((item) => item.id === id))
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(extras))
  } catch {
    /* ignore */
  }
}

export function resolveT212Watchlist(ids: string[]): T212Instrument[] {
  const unique = [...new Set([...T212_CORE_IDS, ...ids])]
  return unique
    .map((id) => instrumentById(id))
    .filter((item): item is T212Instrument => Boolean(item && t212IsCfdListed(item)))
}

/** SMT obrigatório em índices/futuros (Conservador/Equilibrado); resto informativo. */
export function t212RequireSmtAlign(instrument: T212Instrument, profileRequires: boolean): boolean {
  if (!profileRequires) return false
  return instrument.kind === 'index' || instrument.kind === 'future'
}

export function t212KindLabel(kind: T212Instrument['kind']): string {
  if (kind === 'index') return 'Índice'
  if (kind === 'future') return 'Futuro'
  if (kind === 'forex') return 'Forex'
  if (kind === 'metal') return 'Metal'
  if (kind === 'energy') return 'Energia'
  if (kind === 'stock') return 'Acção'
  return 'Crypto'
}

const yahooInterval: Record<Interval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '60m',
  '4h': '60m',
  '1d': '1d',
}

const yahooRange: Record<Interval, string> = {
  '1m': '7d',
  '5m': '60d',
  '15m': '60d',
  '1h': '60d',
  '4h': '60d',
  '1d': '2y',
}

type YahooChartResponse = {
  chart?: {
    result?: {
      timestamp?: number[]
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] }
    }[]
    error?: { description?: string }
  }
}

export function parseYahooChart(payload: YahooChartResponse): Candle[] {
  const result = payload.chart?.result?.[0]
  if (!result?.timestamp?.length) {
    const err = payload.chart?.error?.description
    throw new Error(err || 'Yahoo sem candles para este símbolo.')
  }
  const quote = result.indicators?.quote?.[0]
  if (!quote) throw new Error('Yahoo sem OHLC.')
  const candles: Candle[] = []
  for (let i = 0; i < result.timestamp.length; i += 1) {
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    if (open == null || high == null || low == null || close == null) continue
    candles.push({
      openTime: result.timestamp[i] * 1000,
      open,
      high,
      low,
      close,
      volume: quote.volume?.[i] ?? 0,
    })
  }
  return candles
}

/** Agrega 1h → 4h (sessão alinhada ao openTime). */
export function aggregateTo4h(hourly: Candle[]): Candle[] {
  if (hourly.length === 0) return []
  const buckets = new Map<number, Candle[]>()
  for (const row of hourly) {
    const d = new Date(row.openTime)
    const bucket = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(d.getUTCHours() / 4) * 4)
    const list = buckets.get(bucket) ?? []
    list.push(row)
    buckets.set(bucket, list)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([openTime, rows]) => ({
      openTime,
      open: rows[0].open,
      high: Math.max(...rows.map((r) => r.high)),
      low: Math.min(...rows.map((r) => r.low)),
      close: rows[rows.length - 1].close,
      volume: rows.reduce((sum, r) => sum + r.volume, 0),
    }))
}

export async function fetchYahooCandlesRaw(yahooSymbol: string, interval: Interval): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol: yahooSymbol,
    interval: yahooInterval[interval],
    range: yahooRange[interval],
  })
  const response = await fetch(`/api/yahoo-candles?${params}`, {
    signal: AbortSignal.timeout(18_000),
  })
  const payload = (await response.json().catch(() => ({}))) as YahooChartResponse & { error?: string; detail?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Yahoo ${response.status} (${yahooSymbol})`)
  }
  try {
    const candles = parseYahooChart(payload)
    if (interval === '4h') return aggregateTo4h(candles)
    return candles
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : `Yahoo sem dados (${yahooSymbol})`)
  }
}

type PlaybookPack = Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>

const playbookCache = new Map<string, { at: number; data: PlaybookPack }>()
const playbookInflight = new Map<string, Promise<PlaybookPack>>()
const PLAYBOOK_TTL_MS = 90_000

type YahooPackResponse = {
  symbol?: string
  charts?: Partial<Record<'1h' | '15m' | '5m' | '1m', YahooChartResponse>>
  error?: string
}

async function fetchPlaybookViaPack(yahooSymbol: string): Promise<PlaybookPack> {
  const response = await fetch(`/api/yahoo-pack?symbol=${encodeURIComponent(yahooSymbol)}`, {
    signal: AbortSignal.timeout(22_000),
  })
  const payload = (await response.json().catch(() => ({}))) as YahooPackResponse
  if (!response.ok) throw new Error(payload.error || `Yahoo pack ${response.status}`)
  const charts = payload.charts
  if (!charts?.['1h'] || !charts['15m'] || !charts['5m']) {
    throw new Error(payload.error || `Yahoo pack incompleto (${yahooSymbol})`)
  }
  const oneHour = parseYahooChart(charts['1h'])
  const fifteenMinute = parseYahooChart(charts['15m'])
  const fiveMinute = parseYahooChart(charts['5m'])
  let oneMinute: Candle[]
  try {
    oneMinute = charts['1m'] ? parseYahooChart(charts['1m']) : fiveMinute
  } catch {
    oneMinute = fiveMinute
  }
  return {
    '4h': aggregateTo4h(oneHour),
    '1h': oneHour,
    '15m': fifteenMinute,
    '5m': fiveMinute,
    '1m': oneMinute,
  }
}

async function fetchPlaybookLegacy(yahooSymbol: string): Promise<PlaybookPack> {
  const [oneHour, fifteenMinute, fiveMinute, oneMinuteOrNull] = await Promise.all([
    fetchYahooCandlesRaw(yahooSymbol, '1h'),
    fetchYahooCandlesRaw(yahooSymbol, '15m'),
    fetchYahooCandlesRaw(yahooSymbol, '5m'),
    fetchYahooCandlesRaw(yahooSymbol, '1m').catch(() => null),
  ])
  return {
    '4h': aggregateTo4h(oneHour),
    '1h': oneHour,
    '15m': fifteenMinute,
    '5m': fiveMinute,
    '1m': oneMinuteOrNull ?? fiveMinute,
  }
}

type TwelvePackResponse = {
  source?: string
  symbol?: string
  candles?: Partial<Record<'1h' | '15m' | '5m' | '1m', Candle[]>>
  error?: string
  quota?: boolean
  skip?: boolean
}

async function fetchPlaybookViaTwelve(twelveSymbol: string, kind: T212Instrument['kind']): Promise<PlaybookPack> {
  const params = new URLSearchParams({ symbol: twelveSymbol, kind })
  const response = await fetch(`/api/twelve-pack?${params}`, {
    signal: AbortSignal.timeout(45_000),
  })
  const payload = (await response.json().catch(() => ({}))) as TwelvePackResponse
  if (response.status === 503 && payload.skip) {
    throw Object.assign(new Error('twelve-skip'), { twelveSkip: true })
  }
  if (response.status === 429 || payload.quota) {
    throw Object.assign(new Error(payload.error || 'Twelve quota'), { twelveQuota: true })
  }
  if (!response.ok) throw new Error(payload.error || `Twelve pack ${response.status}`)
  const c = payload.candles
  if (!c?.['1h']?.length || !c['15m']?.length || !c['5m']?.length) {
    throw new Error(payload.error || `Twelve pack incompleto (${twelveSymbol})`)
  }
  return {
    '4h': aggregateTo4h(c['1h']),
    '1h': c['1h'],
    '15m': c['15m'],
    '5m': c['5m'],
    '1m': c['1m']?.length ? c['1m'] : c['5m'],
  }
}

function enqueueTwelve<T>(fn: () => Promise<T>): Promise<T> {
  const run = twelveQueue.then(fn, fn)
  twelveQueue = run.then(() => undefined, () => undefined)
  return run
}

async function fetchYahooPlaybook(yahooSymbol: string): Promise<PlaybookPack> {
  try {
    return await fetchPlaybookViaPack(yahooSymbol)
  } catch {
    return fetchPlaybookLegacy(yahooSymbol)
  }
}

/** Candles MTF. `feed: yahoo` (defeito) ou `twelve` (fallback Yahoo se créditos/erro). Cache 90s. */
export async function getT212PlaybookCandles(
  instrument: T212Instrument = DEFAULT_T212_INSTRUMENT,
  options: { feed?: T212FeedPreference; bypassCache?: boolean } = {},
): Promise<PlaybookPack> {
  const feed: T212FeedPreference = options.feed === 'twelve' ? 'twelve' : 'yahoo'
  const cacheKey = `${instrument.id}:${instrument.kind === 'crypto' ? 'binance' : feed}`
  if (!options.bypassCache) {
    const cached = playbookCache.get(cacheKey)
    if (cached && Date.now() - cached.at < PLAYBOOK_TTL_MS) return cached.data
    const pending = playbookInflight.get(cacheKey)
    if (pending) return pending
  } else {
    playbookCache.delete(cacheKey)
  }

  const load = (async (): Promise<PlaybookPack> => {
    let data: PlaybookPack | undefined
    let source: T212FeedSource = 'yahoo'

    if (instrument.kind === 'crypto') {
      try {
        const binance = await getT212BinancePlaybook(instrument.short, { bypassCache: options.bypassCache })
        if (binance) {
          data = binance
          source = 'binance'
        }
      } catch {
        /* Yahoo abaixo */
      }
    }

    if (!data && feed === 'twelve') {
      const twelveSymbol = twelveSymbolFor(instrument)
      if (twelveSymbol && Date.now() >= twelveCooldownUntil) {
        try {
          data = await enqueueTwelve(() => fetchPlaybookViaTwelve(twelveSymbol, instrument.kind))
          source = 'twelve'
        } catch (error) {
          const err = error as { twelveQuota?: boolean; twelveSkip?: boolean }
          if (err.twelveQuota) {
            twelveCooldownUntil = Date.now() + 60 * 60_000
            feedStats.twelveExhausted = true
          }
        }
      }
    }

    if (!data) {
      data = await fetchYahooPlaybook(instrument.yahooSymbol)
      source = 'yahoo'
    }

    if (source === 'twelve') feedStats.twelve += 1
    else if (source === 'binance') feedStats.binance += 1
    else feedStats.yahoo += 1

    playbookCache.set(cacheKey, { at: Date.now(), data })
    return data
  })()

  if (!options.bypassCache) {
    playbookInflight.set(cacheKey, load)
    try {
      return await load
    } finally {
      playbookInflight.delete(cacheKey)
    }
  }
  return load
}
