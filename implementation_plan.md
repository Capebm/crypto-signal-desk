# TJR 6h40 fidelity — BOS / iFVG / continuation

**Goal:** Align the Disciplina path with the updated 2026 tutorial without tightening Prático unnecessarily.
**Status:** Phases 1–2 shipped in `dc4af16`; Phase 3 + Crypto sweep lifecycle approved.

## Scope

### [MODIFY] `src/lib/tjr-structure.ts`

1. Represent consecutive same-direction FVGs as a stack when no meaningful retrace separates them.
2. Select the controlling outer boundary for inversion:
   - bullish FVG stack → bearish iFVG only after a close below the lowest controlling boundary;
   - bearish FVG stack → bullish iFVG only after a close above the highest controlling boundary.
3. Remove the “any disrespected FVG” fallback from strict confirmation; preserve it only behind an explicit practical option.
4. Extend `ltfEntryConfirmation` with an optional continuation zone and record whether the opposite 1m retrace occurred inside that zone.
5. Keep BOS as candle close beyond the latest TJR swing; do not invent an unsupported displacement threshold.

### [MODIFY] `src/lib/tjr-engine.ts`

1. Disciplina / US-index paths use strict iFVG confirmation.
2. Pass the chosen 5m FVG/EQ continuation zone into the 1m sequence.
3. Require `opposite 1m signal inside continuation zone → aligned 1m BOS/iFVG`.
4. Prático may retain the permissive fallback and 5m shortcut, clearly labelled.
5. Update checklist notes to distinguish strict stack iFVG and zone-bound retrace.

### [MODIFY] `src/lib/tjr-ltf-ifvg.test.ts`

Add deterministic coverage for:

- wick-only gap violation rejected;
- close beyond one non-controlling stacked FVG rejected;
- close beyond the controlling stack boundary accepted;
- strict mode rejects the legacy permissive fallback;
- retrace outside continuation zone does not arm entry;
- retrace inside zone followed by aligned BOS/iFVG confirms entry.

### [NEW] `src/lib/tjr-ifvg-stack.test.ts`

Focused unit tests for bullish and bearish FVG stacks and controlling boundaries.

### [MODIFY] `system_architecture.md`

Document strict updated sequence and the deliberate difference between Disciplina and Prático.

## Phase 2 — continuation blocks + true ES↔NQ SMT

### [MODIFY] `src/lib/tjr-structure.ts`

1. Add confirmed order-block lifecycle:
   - bullish OB = last bearish candle before a bullish 5m BOS/iFVG;
   - bearish OB = last bullish candle before a bearish 5m BOS/iFVG;
   - keep creation/invalidation candle indexes;
   - a close beyond the invalidation edge retires the OB.
2. Add breaker lifecycle:
   - bearish OB closed through above → bullish breaker;
   - bullish OB closed through below → bearish breaker.
3. Extend `structureSnapshot()` with active aligned OB/BB zones.
4. Do not accept a random opposite candle without a preceding BOS/iFVG confirmation.

### [MODIFY] `src/lib/tjr-engine.ts`

1. Expand continuation zones to FVG / EQ / confirmed OB / confirmed BB.
2. Preserve deterministic priority: active FVG → EQ → aligned OB → aligned breaker.
3. Pass the selected 5m OB/BB to the strict 1m in-zone retrace introduced in Phase 1.
4. Include active OB/BB in chart zones and checklist notes.
5. Replace the old ES↔NQ trend-alignment hard gate with:
   - data validity gate;
   - fresh true SMT opposite to the trade blocks Disciplina;
   - true SMT aligned supports Disciplina;
   - absent SMT is neutral;
   - Prático keeps SMT/trend as informational.

### [MODIFY] `src/features/chart/PriceChart.tsx`

Render active order-block and breaker-block zones with distinct labels/styles.

### [NEW] `src/lib/t212-es-nq-smt.ts`

1. Pair ES/NQ 5m candles by `openTime`.
2. Reject insufficient or materially skewed feeds.
3. Pair same-type TJR swings within one 5m candle.
4. Detect fresh liquidity divergence:
   - one market makes/sweeps a higher high while the other fails → bearish SMT;
   - one market makes/sweeps a lower low while the other fails → bullish SMT.
5. Return direction, pool type, freshness, feed validity and a Portuguese diagnostic note.

### [MODIFY] `src/lib/t212-es-nq.ts`

Keep trend alignment as informational metadata and export a combined ES/NQ context containing trend + true liquidity SMT.

### [MODIFY] `src/features/t212/T212Dashboard.tsx`

Compute the combined ES/NQ context once per scan/refine and pass it to all US-index evaluations.

### [MODIFY] `src/features/positions/PositionsDashboard.tsx`

Compute/pass the same context for open-position analysis.

### [MODIFY] `src/lib/position-advisor.ts`

Forward `tjrVideoStrict` and ES/NQ SMT context into `evaluateTjrFull`.

### [MODIFY] `src/lib/no-agora-explain.ts`

Explain strict ES/NQ SMT or invalid-feed blocks separately from ordinary trend disagreement.

### [NEW] `src/lib/tjr-continuation-zone.test.ts`

Test confirmed OB creation, invalidation, breaker polarity and continuation-zone priority.

### [NEW] `src/lib/t212-es-nq-smt.test.ts`

Test bearish HH/failure, bullish LL/failure, no-divergence, timestamp skew, stale/insufficient data and symmetry ES↔NQ.

### [MODIFY] `src/lib/t212-es-nq.test.ts`

Update old trend-alignment expectations to the new informational role and combined context.

### [MODIFY] `system_architecture.md`

Document OB/BB lifecycle, continuation priority and ES/NQ trend-vs-SMT policy.

## Phase 3 — anti-chase entry + structural CFD levels

### Crypto sweep lifecycle correction

1. Store the sweep candle index/time in each draw hit.
2. Compare aligned and opposing sweeps chronologically; only the latest relevant sweep controls direction.
3. A stale HIGH sweep must not block a fresher LOW sweep for Spot long.
4. Require confirmation to occur after the controlling sweep, preserving the TJR order `liquidity → confirmation → retrace`.
5. Rename partial progress shown with `ESPERAR`; reserve `A_AGUARDAR` for executable retrace setups.
6. Add regression tests for stale HIGH → fresh LOW, fresh HIGH → stale LOW, and confirmation-before-sweep rejection.

### [MODIFY] `src/lib/tjr-engine.ts`

1. Separate bullish/bearish bias from executable timing.
2. Require a real continuation-zone interaction before any `AGORA`:
   - current price touches the selected zone; or
   - LTF opposite signal occurred inside that zone (`retraceInZone`).
3. Pass the selected continuation zone to Prático 1m/5m confirmation too; the shortcut remains, but cannot trigger outside the zone.
4. `softOpposed` / “só malha” may keep the directional setup but always downgrades `AGORA → RETRACE`.
5. Add TJR headroom gate from real opposing liquidity:
   - long uses nearest valid HTF/session high above entry;
   - short uses nearest valid HTF/session low below entry;
   - reward to that draw must satisfy the selected profile’s minimum R:R;
   - fixed `1R/1.5R` targets may not cross a nearer liquidity draw.
6. If the setup is already at/through the opposing draw, never emit `JÁ`; keep `AGUARDAR` when structurally valid.
7. Checklist separates “zona encontrada”, “retrace na zona” and “espaço até liquidez”.
8. Expose the selected continuation zone only, while retaining session/HTF liquidity lines.

### [MODIFY] `src/lib/trade-levels.ts`

1. Add ATR calculation for the execution candles.
2. Replace universal crypto clamps (3.5–8%) with structural stop construction:
   - second relevant execution swing;
   - small ATR buffer beyond the swing;
   - one ATR fallback only when no valid swing exists.
3. Keep the legacy percentage clamp only as a crypto fallback when ATR is unavailable.
4. Never move a stop inside the structural invalidation point merely to satisfy a maximum distance.

### [MODIFY] `src/lib/tjr-engine.ts` level construction

1. Pass execution candles and `instrumentKind` into `buildLevels`.
2. Calculate R modes from the actual structural/ATR risk.
3. Cap fixed-R targets at the nearest opposing liquidity draw.
4. Reject levels when capping makes R:R insufficient instead of inventing a distant target.

### [MODIFY] `src/features/t212/T212Dashboard.tsx`

Pass `instrument.kind` to all T212 evaluations.

### [MODIFY] `src/features/positions/PositionsDashboard.tsx`

Pass `instrument.kind` to open-position evaluation.

### [MODIFY] `src/lib/position-advisor.ts`

Forward `instrumentKind` into `evaluateTjrFull`.

### [MODIFY] `src/features/agent/AgentDashboard.tsx`

Explicitly mark Binance Spot evaluations as `crypto`.

### [MODIFY] `src/features/chart/PriceChart.tsx`

Render only the selected entry FVG/EQ/OB/BB instead of every active zone from 4h/1h/exec. Keep liquidity/session levels.

### [MODIFY] `src/lib/t212-presets.ts`

Clarify that Prático allows more directional setups but `JÁ` still requires zone interaction and liquidity headroom.

### [MODIFY] `src/lib/trade-levels.test.ts`

Replace universal-percentage expectations with structural/ATR cases for crypto fallback and normal ATR operation.

### [NEW] `src/lib/tjr-chase-gate.test.ts`

Deterministic cases:

- long at/near London High cannot be `JÁ`;
- fixed 1.5R target cannot cross a nearer draw;
- valid retrace in zone with sufficient headroom remains `JÁ`;
- `softOpposed` is at most `RETRACE`;
- short symmetry at session low.

### [MODIFY] `src/lib/tjr-ltf-ifvg.test.ts`

Verify Prático confirmation also requires the opposite LTF signal inside the selected continuation zone.

### [NEW] `src/lib/tjr-instrument-levels.test.ts`

Fixtures for EURCHF, GBPUSD, GER40 and crypto:

- Forex stop remains near structural swing/ATR, not 3.5%;
- fixed-R TP uses structural risk and respects nearest liquidity;
- fallback remains valid when swings/ATR are unavailable.

### [MODIFY] `system_architecture.md`

Document anti-chase timing, headroom and ATR-buffered structural stops.

## Still deferred

- Protected/weak swing classification.
- Quantitative displacement thresholds not explicitly defined by TJR.
- Multi-pair SMT outside ES/NQ.

These remain discretionary or unsupported by an objective video rule.

## Verification

1. `npm test`
2. `npm run build`
3. `git diff --check`
