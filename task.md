# TJR 6h40 phase 2

- [x] Add confirmed order-block and breaker lifecycle
- [x] Integrate OB/BB continuation zones and chart rendering
- [x] Implement timestamp-aligned ES/NQ liquidity SMT
- [x] Wire combined ES/NQ context through T212 and positions
- [x] Add focused OB/BB and SMT tests
- [x] Update architecture notes
- [x] Run tests, build, and diff checks

# TJR phase 3 — approved

- [x] Make draw sweeps chronological and fix partial status semantics
- [x] Add structural ATR stops and liquidity-capped targets per instrument
- [x] Require continuation-zone interaction and liquidity headroom
- [x] Propagate instrument kind and selected entry zone through dashboards/charts
- [x] Add Crypto, Forex, index and anti-chase regressions
- [x] Update architecture notes and run full verification

# TJR video strict — execution checklist

- [x] Extend `ltfEntryConfirmation` for BOS **or** iFVG (retrace + directional)
- [x] Add `tjrVideoStrict` to `EvaluateOptions` + engine gates
- [x] Prefer 5m confirm; no 5m LTF shortcut; video checklist labels
- [x] T212: default CFD prático OFF; add «Vídeo TJR» preset / toggle
- [x] Agent: «Vídeo TJR» preset + toggle
- [x] Tests + bump to 2.0.38 + update implementation_plan.md

# TJR 2026 fidelity follow-up

- [x] Session/PDH draws as-of the raid candle (wick does not become the level)
- [x] Require HTF sweep outside Malha; drop micro-sweep for Prático/Agressivo
- [x] Cap confirmation recency (12×5m / 6×1h)
- [x] Run tests and build

# Agent ↔ T212 crypto + OCO + chart flicker

- [x] Agent Prático/Malha: same practical confirm as T212 crypto
- [x] Always MTF-refine T212 overlap cryptos (XRP, BTC, …)
- [x] Show OCO on Aguardar and COMPRAR/LONG JÁ (Agent + T212)
- [x] Stop chart remount flicker (create once, overlay updates, resize width-only)

