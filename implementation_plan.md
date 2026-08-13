# TJR 6h40 fidelity — BOS / iFVG / continuation

**Goal:** Align the Disciplina path with the updated 2026 tutorial without tightening Prático unnecessarily.
**Status:** approved direction; implementation pending.

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

## Still deferred

- Protected/weak swing classification.
- Quantitative displacement thresholds not explicitly defined by TJR.
- Multi-pair SMT outside ES/NQ.

These remain discretionary or unsupported by an objective video rule.

## Verification

1. `npm test`
2. `npm run build`
3. `git diff --check`
