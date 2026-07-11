# System architecture

## Data flow

`src/lib/binance.ts` reads only public Binance Spot endpoints. `src/lib/indicators.ts` turns candles into deterministic technical analyses. `src/App.tsx` renders a selected-pair detail view and an on-demand scanner.

## Scanner

The scanner starts from the 50 largest eligible USDT pairs by 24-hour quote volume. It excludes stablecoin bases and leveraged-token suffixes, retrieves candles in batches of five, and converts successful analyses into ranked `ScannerRow` items. Individual failures are ignored so one unavailable pair does not abort a scan.

## Signal presentation

`Analysis.states` maps RSI, MACD, trend, volume, and risk/reward to `positive`, `negative`, or `neutral`. CSS applies the corresponding green, red, or amber presentation. `COMPRAR`, `AGUARDAR`, and `EVITAR` remain deterministic technical labels rather than personalised investment advice.

## Transcript-driven playbook

`getPlaybookCandles` loads the 4h, 1h, 15m, and 5m series concurrently. `structureFor` derives local swing pivots, directional structure, break of structure, liquidity sweeps, fair-value gaps, and equilibrium from each series.

`createPlaybookSetup` is a deterministic state machine: 4h selects bias; 1h alignment selects the execution interval; then the app requires a high-timeframe confluence, lower-timeframe break of structure, zone reaction, and risk/reward of at least 1.5. The UI exposes every condition rather than hiding it behind a buy/sell instruction. The journal is intentionally session-only and records confirmed configurations for practice.

## Market universe and confluence zones

`getActiveUsdtSymbols` loads the active, eligible Binance Spot USDT symbols for the searchable pair input. The scan remains volume-bounded at 50, 100, or 200 pairs and retains five-request concurrency.

The structure layer now exposes heuristic order blocks, invalidated breaker blocks, overlapping fair-value-gap balanced ranges, and same-UTC-day session ranges. The replay outcome is deliberately narrow: it tests a fixed 25-candle historical window at 1.5R and does not validate the live setup or claim strategy performance.

## Beginner-first presentation

The main screen uses progressive disclosure. The opportunity cards translate technical labels into “Vale a pena analisar” or “Não entrar agora” and include short explanations of movement, RSI, and risk/reward. Selecting a card opens the advanced view; detailed technical panels and playbook evaluation remain hidden until the user explicitly requests them.

## Portugal availability filter

Public Binance data confirms global listings but cannot confirm an individual Portugal account's permission to trade a pair. The eligibility predicate therefore applies a conservative local exclusion list to both the selector and scanner. `STORJUSDT` is excluded because it was unavailable in the user's Binance app; the UI and README state that all remaining pairs still require confirmation in the user's account.

## Coin-first watchlist

`src/lib/coins.ts` provides a curated 30-coin catalogue with recognisable names and categories. Each coin resolves to `TICKERUSDT` only when that symbol is active in the filtered Binance metadata. A user confirmation is stored in browser local storage under `confirmed-binance-coins`; the scanner intersects liquid markets with this local list, so it cannot surface HOT, STORJ, or an unconfirmed coin.

## Decision-agent interface

The active product is `AgentDashboard`. It scans the 50 most liquid globally active Binance Spot USDT markets in five-request batches. `decision-engine.ts` maps the deterministic analysis output to `COMPRAR`, `VENDER` or `ESPERAR`: buy requires positive trend/MACD, non-overbought RSI and risk/reward of at least 1.5; sell requires negative trend/MACD; otherwise wait. The dashboard is intentionally not connected to account availability, orders, Futures or leverage.

## Full-universe scan

The agent now requests all eligible global Binance Spot USDT tickers, sorts them by quote volume, and evaluates every returned market in five-request batches. The dashboard preserves all analysed rows and lets the user filter by action or search symbol. In addition to moving averages, RSI, MACD and relative volume, `robustMetrics` provides ATR, Bollinger position, stochastic RSI, VWAP and a volatility-normalised trend-strength check. The decision engine requires agreement between these independent groups before it emits `COMPRAR` or `VENDER`.

## Terminal workspace and risk profiles

`PriceChart` uses Lightweight Charts with Binance 1h candles, volume, EMA 20/50 and entry/stop/target overlays. `risk-profile.ts` defines conservative, balanced and aggressive thresholds; the slider passes one profile into the decision engine before each scan. Tooltips and the evidence panel explain metric meanings and decision evidence without modifying the underlying market data.
