# Implementation plan: Crypto Signal Desk

## Goal

Build a local React and TypeScript web dashboard for Binance Spot market data. It will calculate transparent technical signals and use AI only to explain the data and signals. It will not place orders or present output as guaranteed financial advice.

## Scope for version 1

- Track a small watchlist of USDT spot pairs, starting with BTCUSDT and ETHUSDT.
- Fetch public Binance candles and ticker data.
- Calculate trend, RSI, MACD, moving averages, volume conditions, support/resistance, and a risk-aware trade setup.
- Assign a transparent **Buy**, **Wait**, or **Sell/Avoid** signal with the contributing conditions visible.
- Let the user choose symbol and timeframe.
- Provide a local-only AI explanation endpoint/configuration, only when the user supplies an API key; the deterministic signal remains the source of truth.
- Include a visible risk disclosure and prohibit automatic trade execution.

## Files

- `[NEW] package.json` — scripts and dependencies for the Vite React app.
- `[NEW] vite.config.ts`, `tsconfig*.json`, `index.html` — TypeScript/Vite configuration.
- `[NEW] src/main.tsx`, `src/App.tsx` — application bootstrap and dashboard UI.
- `[NEW] src/lib/binance.ts` — public Binance market-data client.
- `[NEW] src/lib/indicators.ts` — technical indicators and rule-based signal logic.
- `[NEW] src/lib/types.ts` — market-data and signal types.
- `[NEW] src/styles.css` — responsive dashboard styling.
- `[NEW] .env.example` — optional AI-explanation configuration placeholder.
- `[NEW] README.md` — setup, data limitations, signal methodology, and risk disclosure.
- `[NEW] task.md` — execution checklist, updated while implementing.

## Validation

Run the production build and confirm TypeScript compilation succeeds. Test the dashboard against public Binance endpoints with a browser if the local environment permits it.

---

## Expansion: market scanner and indicator states

### Definition of relevant markets

Scan the top 50 active Binance Spot pairs quoted in USDT, ranked by 24-hour quote volume. Exclude stablecoin-to-stablecoin pairs and leveraged-token symbols. This is a practical, rate-limit-aware definition of “relevant”; Binance lists hundreds of pairs and fetching candle history for all of them in the browser is neither reliable nor useful.

### Changes

- `[MODIFY] src/lib/types.ts` — add market-ticker, scanner-row, and per-indicator-state types.
- `[MODIFY] src/lib/binance.ts` — retrieve and filter Binance 24-hour tickers, then retrieve candle data for a bounded scanner universe.
- `[MODIFY] src/lib/indicators.ts` — expose bullish, bearish, and neutral states for each displayed indicator and produce ranked scanner results.
- `[MODIFY] src/App.tsx` — add a scanner control, progress/error state, indicator colour states, and ranked buy/avoid opportunity tables.
- `[MODIFY] src/styles.css` — add semantic green, red, and neutral styles for indicator cards and scanner tables.
- `[MODIFY] README.md` — document scanner coverage, rate-limit behaviour, and that rankings are technical screens rather than trade recommendations.
- `[MODIFY] task.md` — replace the completed checklist with the expansion checklist.

### Safety and performance constraints

- The scanner will label technical conditions, not make personalised recommendations.
- Requests will be concurrency-limited and a user must explicitly start a scan.
- The scanner will analyse the top 50 liquid eligible pairs but display the top-ranked opportunities, avoiding a misleading claim to cover all Binance markets.

---

## Transcript-driven expansion: structured trading playbook

### Source interpretation

I retrieved the transcript for the linked nine-hour TJR beginner course. Its implementable core is a multi-timeframe, rules-based playbook: establish 4-hour bias, use the 1-hour trend to choose a 5-minute or 15-minute execution timeframe, wait for a high-timeframe liquidity sweep or confluence zone, require a lower-timeframe break of structure, then require a confirmed reaction from a confluence zone before defining entry, invalidation, and target.

The app will implement this as an educational technical screen. It will not assert that the creator's methodology is profitable, replicate claims of guaranteed results, or place trades.

### Files

- `[MODIFY] src/lib/types.ts` — add market-structure pivots, directional bias, liquidity sweep, fair-value-gap, confluence zone, and playbook-setup types.
- `[MODIFY] src/lib/binance.ts` — fetch the coordinated 4-hour, 1-hour, 15-minute, and 5-minute candle sets required by the playbook.
- `[MODIFY] src/lib/indicators.ts` — derive swing highs/lows, break of structure, bias, liquidity sweeps, fair-value gaps, equilibrium, reaction confirmation, and a transparent setup checklist.
- `[MODIFY] src/App.tsx` — replace the one-timeframe recommendation emphasis with a multi-timeframe playbook panel, rule checklist, setup status, entry/invalidation/target levels, risk calculator, and trade journal.
- `[MODIFY] src/styles.css` — add visual states for bullish, bearish, waiting, blocked, and confirmed conditions.
- `[MODIFY] README.md` — document the exact rule translation, assumptions, limitations, and how to validate it through paper trading/backtesting.
- `[MODIFY] task.md` — replace the previous checklist with the implementation checklist.
- `[MODIFY] system_architecture.md` — record the multi-timeframe data flow and deterministic setup state machine.

### Rule translation

1. Determine 4-hour directional bias from confirmed swing structure.
2. Read 1-hour structure: use 5-minute execution only when aligned with the 4-hour bias; otherwise use 15-minute execution.
3. In the bias direction, identify a high-timeframe sweep or a fair-value-gap/equilibrium zone; without one, report `AGUARDAR`.
4. Require lower-timeframe break of structure in the bias direction.
5. Require price to retest a generated confluence zone and close with directional pressure before showing `CONFIGURAÇÃO CONFIRMADA`.
6. Set invalidation beyond the sweep/confluence zone and target the nearest opposing liquidity level; compute risk/reward from these, without suggesting position size or automatically placing orders.

---

## Expansion: full eligible market universe and remaining course concepts

### Market coverage

The current app starts with four pairs and expands to 50 only after running the scanner. It should instead load the complete active Binance Spot USDT universe into a searchable selector, while keeping scanning bounded to the top liquid pairs to avoid browser rate limits. Users will be able to choose a larger scanner universe (50, 100, or 200 liquid pairs), with progress and explicit partial-result handling.

### Remaining course concepts to implement

The prior implementation covered structure, liquidity sweeps, fair value gaps, equilibrium, multi-timeframe bias, confirmation, risk/reward, and journaling. It does **not** yet cover all of the video's technical content. The next version will add:

- Order blocks derived from the impulse leg that precedes a validated sweep and break of structure.
- Breaker blocks derived when a previously valid order block is invalidated.
- Balanced price ranges from overlapping opposing fair value gaps.
- Session highs/lows and New York-session time filters adapted for 24/7 crypto markets, with UTC as the explicit timezone.
- A setup replay/backtest workspace that records whether a completed setup would have reached its invalidation or target first.

### Files

- `[MODIFY] src/lib/types.ts` — add order block, breaker block, balanced price range, session range, backtest outcome, and scan-universe types.
- `[MODIFY] src/lib/binance.ts` — retrieve active USDT spot symbols from exchange metadata and provide bounded scanner selection.
- `[MODIFY] src/lib/indicators.ts` — identify the new confluence zones, crypto session ranges, and evaluate historical setup outcomes without look-ahead bias.
- `[MODIFY] src/App.tsx` — add searchable full-market selection, scanner-universe control, confluence-zone display, session filter, and replay/backtest panel.
- `[MODIFY] src/styles.css` — add controls and visual representations for zones and backtest outcomes.
- `[MODIFY] README.md` — document universe inclusion rules, API/rate-limit behaviour, UTC session assumptions, and backtest limitations.
- `[MODIFY] task.md` — replace the checklist for this expansion.
- `[MODIFY] system_architecture.md` — record market-universe loading and historical evaluation boundaries.

---

## Beginner-first experience

### Goal

Replace the dense, expert-oriented screen with a progressive workflow that answers one question at a time: “Is there anything worth watching?”, “What does it mean?”, and “What should I check before doing anything?” Technical terms remain available in a glossary but are not required to understand the first screen.

### Changes

- `[MODIFY] src/App.tsx` — introduce a beginner dashboard as the default: a plain-language market status, only three key facts per opportunity, a “why?” explanation, a three-step safety checklist, and an expandable advanced analysis area. Rename technical labels in the primary UI and keep the original terms as secondary detail.
- `[MODIFY] src/styles.css` — simplify visual hierarchy, increase spacing, use sentence-style labels, and make advanced content visually secondary.
- `[MODIFY] README.md` — add a glossary for RSI, score, risk/reward, stop/invalidation, and the app’s traffic-light states.
- `[MODIFY] task.md` — replace the task list with the beginner experience work.
- `[MODIFY] system_architecture.md` — document the progressive-disclosure UI pattern.

### First-screen language

- `COMPRA` becomes `Vale a pena analisar`, not an instruction to buy.
- `EVITAR` becomes `Não há condições para entrar`, not an instruction to sell.
- Score, RSI and R/R receive Portuguese explanations next to the values.
- The app explicitly says to start with paper trading and to only proceed when the safety checklist is complete.

---

## Portugal availability and safer market universe

### Constraint

Public Binance market endpoints can show that a pair exists globally, but cannot prove that a specific authenticated account in Portugal can trade it. Account-level availability can depend on local restrictions, verification status, product acknowledgements (such as Monitoring Tag quizzes), and the exchange's current eligibility rules.

### Changes

- `[MODIFY] src/lib/binance.ts` — load Binance exchange metadata and exclude pairs that are not actively Spot-tradable; preserve a conservative “unknown account availability” state rather than claiming account eligibility.
- `[MODIFY] src/lib/types.ts` — add market-availability and risk-flag types.
- `[MODIFY] src/App.tsx` — default the scanner to a conservative “Portugal-friendly watchlist”: liquid, active USDT Spot pairs, excluding stablecoins, leveraged tokens, low-liquidity pairs, and flagged assets such as STORJ. Show a clear “available globally / confirm in your Binance account” label and a filter to reveal excluded assets only on request.
- `[MODIFY] src/styles.css` — add availability badges and explanatory warning styling.
- `[MODIFY] README.md` — distinguish global listing from account-level tradability and document the conservative filter.
- `[MODIFY] task.md` — replace the checklist with the availability work.
- `[MODIFY] system_architecture.md` — document the two-tier global versus account eligibility model.

---

## Coin-first Portugal watchlist

### Goal

Stop presenting opaque exchange symbols such as `HOTUSDT`. Present recognisable coins — name, ticker, category, market size, liquidity and plain-language risk — and only analyse coins the user has personally confirmed are available in their Binance Spot account.

### Account-availability model

The app cannot securely or accurately infer account availability from public data. Instead, the user will confirm a coin from the Binance Spot search once; the app saves the confirmation locally and limits the scanner to that personal watchlist. No API keys or Binance credentials are collected.

### Changes

- `[NEW] src/lib/coins.ts` — curated, beginner-oriented metadata for a broader 30-coin catalogue: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, DOT, LTC, BCH, ATOM, NEAR, APT, SUI, ARB, OP, INJ, SEI, FIL, ICP, AAVE, UNI, ENA, RENDER, TON, XLM, HBAR and ALGO.
- `[MODIFY] src/lib/types.ts` — add coin metadata and locally-confirmed-availability types.
- `[MODIFY] src/App.tsx` — replace raw pair-first selection with a searchable coin catalogue, show each valid Binance Spot pair (`COIN/USDT`) as a secondary suggestion, add a “confirmed in my Binance Spot” control and local personal watchlist, and restrict scanning to confirmed coins.
- `[MODIFY] src/lib/binance.ts` — resolve confirmed coin tickers to their `USDT` Spot market only after checking active exchange metadata; remove HOT and STORJ from suggested markets.
- `[MODIFY] src/styles.css` — add beginner coin cards and availability states.
- `[MODIFY] README.md` — document the confirmation flow and why the app cannot verify the account automatically.
- `[MODIFY] task.md` — replace the checklist for coin-first availability.
- `[MODIFY] system_architecture.md` — document local confirmation and confirmed-watchlist scanning.

---

## Product and architecture refactor

### Diagnosis

The current app accumulated features without a stable product boundary: one `App.tsx` owns market loading, local storage, scanning, technical analysis, risk calculation, journaling and the entire UI. It also mixes three different concepts — a globally listed Binance pair, a coin the user sees in their account, and a Futures/Wallet token — which led to misleading suggestions such as HOT and STORJ.

### Product reset

The app will have three explicit areas:

1. **Minha lista** — only coins the user has verified in Binance **Spot**; this is the sole source for scanning.
2. **Explorar moedas** — a searchable educational catalogue. A global Spot listing is shown as “exists globally”, never as “available to you”.
3. **Análise** — an optional detailed view for one coin from the confirmed list, with plain-language summary first and technical detail behind an advanced toggle.

No Futures or Wallet search result is treated as a confirmation. The arbitrary Portugal exclusion list is removed; the source of truth is the user's local confirmation, which can be added or removed at any time.

### Architecture changes

- `[NEW] src/features/coins/CoinCatalog.tsx` — searchable catalogue and global-Spot status.
- `[NEW] src/features/watchlist/ConfirmedWatchlist.tsx` — locally verified Spot coins and remove action.
- `[NEW] src/features/scanner/ScannerResults.tsx` — scans only confirmed coins and renders beginner-friendly results.
- `[NEW] src/features/analysis/AnalysisPanel.tsx` — summary, optional technical indicators, and playbook details for the selected confirmed coin.
- `[NEW] src/hooks/useConfirmedCoins.ts` — typed local-storage persistence with invalid-data recovery.
- `[NEW] src/hooks/useBinanceMarkets.ts` — encapsulated market metadata, ticker and candle loading states.
- `[NEW] src/lib/format.ts` — formatting helpers.
- `[MODIFY] src/App.tsx` — compose features, manage only navigation and selected confirmed coin.
- `[MODIFY] src/lib/binance.ts` — remove Portugal-specific hard-coded exclusions and expose neutral global-Spot data only.
- `[MODIFY] src/lib/coins.ts` — keep metadata only; do not assert a pair is tradable for the user.
- `[MODIFY] src/lib/types.ts` — distinguish `globalSpotListed` from `confirmedByUser`.
- `[MODIFY] src/lib/indicators.ts` — separate basic scan analysis from optional advanced playbook analysis.
- `[MODIFY] src/styles.css` — replace monolithic styles with a simple layout for the three product areas.
- `[MODIFY] README.md`, `task.md`, `system_architecture.md` — document the new model and migration.

### Validation

- Add unit tests for availability classification, local confirmation persistence, and scanner input filtering.
- Run the production build.
- Manually verify that a Futures-only or Wallet-only result cannot be confirmed as Spot without the user explicitly marking it.

---

## Revised product: day-trading decision agent

### Product intent

The app's primary output becomes a direct, deterministic action for every confirmed Spot coin: **COMPRAR**, **VENDER** or **ESPERAR**. It is a rules-based signal engine, not an automated trading bot; it will not submit orders or claim that an outcome is certain.

For Spot, `VENDER` means “reduce/exit an existing holding” — never “open a short”. If the user does not mark a coin as held, the same negative condition is shown as `ESPERAR / NÃO ENTRAR`.

### Decision engine

- `COMPRAR` only when all hard gates pass: confirmed Spot availability, aligned 4h/1h trend, valid lower-timeframe confirmation, non-overbought momentum, sufficient volume, and risk/reward at or above the configured minimum.
- `VENDER` only for a user-marked holding when the trend and momentum invalidate the long thesis or the stop level is breached.
- `ESPERAR` for all incomplete, conflicting or low-quality conditions.
- Every decision includes the exact reasons, confidence, entry reference, stop/invalidation, target, and a fixed risk budget. A missing stop or insufficient data is always `ESPERAR`.

### Files

- `[NEW] src/lib/decision-engine.ts` — pure buy/sell/wait rules, hard gates, reasons and tests.
- `[NEW] src/features/agent/DecisionCard.tsx` — prominent decision, confidence, reasons, levels and next action.
- `[NEW] src/features/agent/AgentDashboard.tsx` — evaluates globally active, liquid Binance Spot markets and ranks actionable decisions.
- `[NEW] src/hooks/usePortfolio.ts` — local held/not-held state used to distinguish sell from wait.
- `[NEW] src/lib/decision-engine.test.ts` — unit coverage for all three actions and safety gates.
- `[MODIFY] src/lib/types.ts` — decision, confidence, holding and risk-profile contracts.
- `[MODIFY] src/lib/indicators.ts` — expose structured inputs to the decision engine rather than presentation labels.
- `[MODIFY] src/App.tsx` — make the decision-agent dashboard the default and move the coin catalogue/advanced details behind secondary navigation. Suggestions are shown without availability notices or manual confirmation.
- `[MODIFY] src/styles.css` — add clear buy, sell and wait state cards without presenting the result as guaranteed.
- `[MODIFY] README.md`, `task.md`, `system_architecture.md` — document the action semantics, rules and safety limits.

### Defaults

- Spot only; no Futures, leverage or automated orders.
- User-configurable maximum risk defaults to 1% of an entered practice balance.
- The agent scans the top globally active and liquid Binance Spot USDT markets, without any manual confirmation step.
- It makes no account-availability claim and simply ranks the global market universe.

---

## Full Binance Spot universe with robust signal research

### Scope and constraint

“Todas as moedas” will mean every currently active **Binance Spot market quoted in USDT**, excluding stablecoin/stablecoin and leveraged tokens. This is the useful universe for the existing agent. Futures, Wallet tokens and other quote currencies are intentionally out of scope.

Scanning hundreds of markets and multiple timeframes directly from the browser will hit Binance rate limits and produce partial, unreliable results. The refactor therefore adds a local analysis service with caching, request concurrency limits and progress reporting.

### Analysis approach

Adding every known indicator does not make a signal more robust; correlated indicators can create false confidence. The engine will instead combine distinct evidence groups and require agreement:

- Trend: EMA/SMA alignment, ADX and multi-timeframe market structure.
- Momentum: RSI, MACD histogram and stochastic RSI.
- Volatility: ATR, Bollinger Bands and volatility regime.
- Volume/liquidity: relative volume, VWAP and quote-volume threshold.
- Price action: support/resistance, swing structure, break of structure, fair value gap and order block.
- Risk: ATR-aware stop, target to opposing liquidity, minimum risk/reward, maximum spread/liquidity filter.

Every action will list which groups agree and which disagree. A missing/weak group yields `ESPERAR`, not artificial certainty.

### Files

- `[NEW] server/analysis-service.ts` — local cached Binance scanner with bounded concurrency and progress events.
- `[NEW] server/analysis-cache.ts` — TTL cache for tickers and candles.
- `[NEW] src/lib/robust-indicators.ts` — ATR, ADX, Bollinger Bands, stochastic RSI, VWAP and support/resistance calculations.
- `[NEW] src/lib/robust-decision-engine.ts` — weighted evidence groups, safety gates and buy/sell/wait rationale.
- `[NEW] src/features/agent/SignalEvidence.tsx` — explain agreeing and conflicting evidence groups per decision.
- `[MODIFY] package.json`, `vite.config.ts` — add the local service development/build integration.
- `[MODIFY] src/lib/binance.ts` — consume the local scanner results instead of browser-wide candle fetching.
- `[MODIFY] src/features/agent/AgentDashboard.tsx` — add full-universe scan controls, progress, filters and evidence display.
- `[MODIFY] src/lib/types.ts`, `src/styles.css`, `README.md`, `task.md`, `system_architecture.md` — model evidence, document methodology and update UI.

### Validation

- Unit tests for all indicator calculations and decision safety gates.
- Integration test against a bounded fixture universe.
- Production build plus a local scan smoke test.

---

## Terminal workspace, charting and risk profile

### Current signal result

Zero `COMPRAR` signals is a valid output of the current hard gates, not a failure to scan. The proposed risk control must not fabricate a buy signal; it will tune the minimum risk/reward and evidence threshold, while always retaining stop, liquidity and conflicting-signal safety gates.

### Changes

- `[NEW] src/features/chart/PriceChart.tsx` — interactive candlestick chart with volume, EMA 20/50, VWAP, Bollinger Bands and entry/stop/target overlays for a selected decision.
- `[NEW] src/hooks/useRiskProfile.ts` — local `Conservador`, `Equilibrado` and `Agressivo` risk profiles; maps the slider to explicit decision-engine thresholds.
- `[NEW] src/lib/risk-profile.ts` — profile thresholds and labels, independently testable.
- `[MODIFY] src/lib/decision-engine.ts` — accept a risk profile; reduce minimum risk/reward and evidence threshold for higher-risk modes without bypassing data-quality checks.
- `[MODIFY] src/features/agent/AgentDashboard.tsx` — add risk slider, action counts, selected-market state, chart workspace and click-through rows.
- `[MODIFY] src/lib/binance.ts` — add cached candles for the selected chart timeframe.
- `[MODIFY] src/App.tsx`, `src/styles.css` — transform the visual language into a dense dark terminal: top market status bar, left decision list, central chart workspace, right evidence/levels panel, responsive mobile fallback.
- `[MODIFY] package.json` — add a maintained charting dependency.
- `[MODIFY] README.md`, `task.md`, `system_architecture.md` — document profile semantics, charts and data sources.

### API decision

No new API is required for the first version: Binance public candles and tickers provide real-time price, volume and chart data. To make the agent materially more robust later, add:

- a news/sentiment source (for example, CryptoPanic or a paid provider);
- derivatives/open-interest and funding data (Binance Futures public endpoints, clearly separated from Spot trading);
- on-chain/market-cap data (CoinGecko or CoinMarketCap);
- a paid institutional feed only if latency/coverage requirements justify it.

External data will be shown as supplemental evidence, never silently blended into a trade decision.

### Explainability standard

Every actionable value will have a plain-language explanation:

- Hover/focus tooltips for indicators, chart overlays, confidence, risk/reward, stop and target.
- An “O que mudou esta decisão?” section for each coin, separating positive evidence, negative evidence and missing data.
- Inline descriptions for the risk slider that show exactly which thresholds change in each profile.
- Keyboard-accessible tooltips and a persistent “glossário” panel for mobile, where hover is unavailable.
