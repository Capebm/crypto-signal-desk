import type { RiskProfile } from './risk-profile'
import { tpModes, type TpMode } from './tp-mode'

export type AgentPresetId = 'disciplina' | 'equilibrio' | 'malha' | 'custom'

export type AgentPresetConfig = {
  riskIndex: number
  tpMode: TpMode
  avoidNyMid: boolean
  wideNet: boolean
  allowHighSweepLong: boolean
  scanAllSetups: boolean
}

export const AGENT_PRESET_KEY = 'tjr-active-preset'

const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']

export const AGENT_PRESETS: Record<Exclude<AgentPresetId, 'custom'>, { label: string; title: string; config: AgentPresetConfig }> = {
  disciplina: {
    label: 'Disciplina',
    title: 'Conservador · Evitar NY mid · sem malha · sem Long após H',
    config: {
      riskIndex: 0,
      tpMode: '1r',
      avoidNyMid: true,
      wideNet: false,
      allowHighSweepLong: false,
      scanAllSetups: false,
    },
  },
  equilibrio: {
    label: 'Equilíbrio',
    title: 'Equilibrado · Evitar NY mid · sem malha',
    config: {
      riskIndex: 1,
      tpMode: '1_5r',
      avoidNyMid: true,
      wideNet: false,
      allowHighSweepLong: false,
      scanAllSetups: false,
    },
  },
  malha: {
    label: 'Malha',
    title: 'Agressivo · malha larga · todos setups (mais sinais, score capped)',
    config: {
      riskIndex: 2,
      tpMode: '1_5r',
      avoidNyMid: false,
      wideNet: true,
      allowHighSweepLong: false,
      scanAllSetups: true,
    },
  },
}

export function readActivePresetId(): AgentPresetId {
  try {
    const raw = localStorage.getItem(AGENT_PRESET_KEY)
    if (raw === 'disciplina' || raw === 'equilibrio' || raw === 'malha' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'custom'
}

export function writeActivePresetId(id: AgentPresetId) {
  try {
    localStorage.setItem(AGENT_PRESET_KEY, id)
  } catch {
    /* ignore */
  }
}

export function matchAgentPreset(state: AgentPresetConfig): AgentPresetId {
  for (const [id, preset] of Object.entries(AGENT_PRESETS) as [Exclude<AgentPresetId, 'custom'>, typeof AGENT_PRESETS.disciplina][]) {
    const c = preset.config
    if (
      c.riskIndex === state.riskIndex
      && c.tpMode === state.tpMode
      && c.avoidNyMid === state.avoidNyMid
      && c.wideNet === state.wideNet
      && c.allowHighSweepLong === state.allowHighSweepLong
      && c.scanAllSetups === state.scanAllSetups
    ) {
      return id
    }
  }
  return 'custom'
}

export function riskIndexFor(profile: RiskProfile): number {
  return Math.max(0, profiles.indexOf(profile))
}

export function tpIndexFor(mode: TpMode): number {
  return Math.max(0, tpModes.indexOf(mode))
}
