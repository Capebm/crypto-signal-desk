# TJR video fidelity — success rate

**Goal:** Tighten engine to TJR updated strategy video → fewer trades, higher win rate.  
**Status:** **shipped in 2.0.38**

## What shipped

1. `tjrVideoStrict` option — confirm 5m BOS/iFVG (no 1h required); LTF 1m only; no 5m shortcut; no softOpposed/near-EQ
2. `ltfEntryConfirmation` accepts BOS **or** iFVG for retrace + directional entry
3. Checklist labels match video 4-liner when strict
4. Preset **Vídeo TJR** on Agent + T212; CFD prático default **ON** (2.0.39) — Vídeo TJR continua opt-in para filtrar taxa
5. Malha / CFD prático remain opt-in; Vídeo TJR opt-in for success rate

## Files

- `src/lib/tjr-structure.ts`
- `src/lib/tjr-engine.ts`
- `src/lib/t212-presets.ts` / `src/lib/agent-presets.ts`
- `src/features/t212/T212Dashboard.tsx` / `AgentDashboard.tsx` / `PositionsDashboard.tsx`
- `src/lib/tjr-ltf-ifvg.test.ts` / `src/lib/tjr-video-strict.test.ts`
