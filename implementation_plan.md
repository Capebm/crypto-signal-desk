# TJR video fidelity — stage for later (success rate)

**Goal:** Tighten engine to TJR updated strategy video → fewer trades, higher win rate.  
**Status:** staged · **not implemented**  
**Do not ship until explicitly approved.**

## Video sequence (source of truth)

1. Liquidity sweep (session / 1h / 4h highs & lows)
2. 5m BOS **or** inverse FVG (reversal)
3. Continuation: 5m EQ/FVG fill **or** 1m BOS/iFVG opposite (retrace)
4. Entry: 1m BOS **or** iFVG **in trade direction**
5. Extras: ES↔NQ 5m aligned · prefer RTH · US indices often done by ~10:30 ET · targets = other draws

## Current gaps vs video

| Gap | File | Change |
|-----|------|--------|
| LTF entry is BOS-only (no 1m iFVG) | `src/lib/tjr-structure.ts` | Extend `ltfEntryConfirmation` to accept BOS **or** iFVG for retrace + directional entry |
| CFD can enter via 5m BOS if 1m fails | `src/lib/tjr-engine.ts` | Drop / gate `ltfVia5m` shortcut when success-rate mode is on |
| Classic confirm also wants 1h + displacement | `src/lib/tjr-engine.ts` | Prefer **5m-first** confirm (BOS/iFVG) like video; keep 1h as soft/optional |
| Exec TF can be 15m | `src/lib/tjr-engine.ts` | Prefer fixed **5m** exec for confirm when video mode on |
| Checklist labels ≠ video 4-liner | `src/lib/tjr-engine.ts` | Relabel checklist to match video wording |
| Soft paths (Malha / softOpposed / near-EQ CFD) | engine + dashboards | Keep as opt-in; **default off** for success-rate preset |

## Proposed implementation (when unstaged)

1. Add option e.g. `tjrVideoStrict?: boolean` (or preset «Vídeo TJR / taxa») — default **off** so current behaviour stays until user opts in.
2. When on:
   - require 1m retrace→directional (BOS **or** iFVG); no 5m LTF shortcut
   - confirm on 5m BOS/iFVG; do not require 1h for `confirmOk`
   - keep continuation FVG/EQ
   - keep ES↔NQ + US morning window as today
3. Update checklist notes to the 4-line video language.
4. Tests: structure LTF with iFVG path; engine strict vs practical.
5. Version bump + Netlify only after explicit deploy ask.

## Files to touch later

- `[MODIFY]` `src/lib/tjr-structure.ts`
- `[MODIFY]` `src/lib/tjr-engine.ts`
- `[MODIFY]` `src/features/t212/T212Dashboard.tsx` (toggle / default)
- `[MODIFY]` `src/features/agent/AgentDashboard.tsx` (optional same toggle)
- `[MODIFY]` `src/lib/agent-presets.ts` (strict preset)
- `[NEW]` `src/lib/tjr-ltf-ifvg.test.ts` (or extend existing)
- `[MODIFY]` package / `APP_VERSION` when shipping

## Out of scope

- Do not remove Malha / CFD prático entirely — demote to opt-in.
- Do not change journal / CSV / Posições tabs in this pass.
