import type { RiskProfile } from './risk-profile'
import { tpModes, type TpMode } from './tp-mode'

export type AgentPresetId = 'disciplina' | 'video' | 'equilibrio' | 'malha' | 'custom'

export type AgentPresetConfig = {
  riskIndex: number
  tpMode: TpMode
  avoidNyMid: boolean
  wideNet: boolean
  allowHighSweepLong: boolean
  scanAllSetups: boolean
  tjrVideoStrict: boolean
}

export type AgentPresetMeta = {
  label: string
  /** Uma frase na UI — o que este playbook faz. */
  blurb: string
  title: string
  config: AgentPresetConfig
}

export const AGENT_PRESET_KEY = 'tjr-active-preset'

/** Chips principais (ordem na barra). Conservador fica em Ajustes. */
export const AGENT_PRIMARY_PRESETS: Exclude<AgentPresetId, 'custom'>[] = ['equilibrio', 'video', 'malha']

const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']

export const AGENT_PRESETS: Record<Exclude<AgentPresetId, 'custom'>, AgentPresetMeta> = {
  equilibrio: {
    label: 'Prático',
    blurb: 'Dia a dia · mais oportunidades · testa 9 setups',
    title: 'Prático · equilibrado · todos setups · evitar NY mid',
    config: {
      riskIndex: 1,
      tpMode: '1_5r',
      avoidNyMid: true,
      wideNet: false,
      allowHighSweepLong: false,
      scanAllSetups: true,
      tjrVideoStrict: false,
    },
  },
  video: {
    label: 'Disciplina',
    blurb: 'Filtro apertado · menos trades · melhor qualidade',
    title: 'Disciplina · 5m+1m BOS/iFVG · sem malha · evitar NY mid',
    config: {
      riskIndex: 1,
      tpMode: '1_5r',
      avoidNyMid: true,
      wideNet: false,
      allowHighSweepLong: false,
      scanAllSetups: false,
      tjrVideoStrict: true,
    },
  },
  malha: {
    label: 'Malha',
    blurb: 'Rede larga · máximo de sinais · qualidade menor',
    title: 'Malha · agressivo · malha larga · todos setups',
    config: {
      riskIndex: 2,
      tpMode: '1_5r',
      avoidNyMid: false,
      wideNet: true,
      allowHighSweepLong: false,
      scanAllSetups: true,
      tjrVideoStrict: false,
    },
  },
  disciplina: {
    label: 'Conservador',
    blurb: 'Risco baixo · 1R · sem malha',
    title: 'Conservador · Evitar NY mid · sem malha · sem Long após H',
    config: {
      riskIndex: 0,
      tpMode: '1r',
      avoidNyMid: true,
      wideNet: false,
      allowHighSweepLong: false,
      scanAllSetups: false,
      tjrVideoStrict: false,
    },
  },
}

export function readActivePresetId(): AgentPresetId {
  try {
    const raw = localStorage.getItem(AGENT_PRESET_KEY)
    if (raw === 'disciplina' || raw === 'video' || raw === 'equilibrio' || raw === 'malha' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'equilibrio'
}

export function writeActivePresetId(id: AgentPresetId) {
  try {
    localStorage.setItem(AGENT_PRESET_KEY, id)
  } catch {
    /* ignore */
  }
}

export function matchAgentPreset(state: AgentPresetConfig): AgentPresetId {
  for (const [id, preset] of Object.entries(AGENT_PRESETS) as [Exclude<AgentPresetId, 'custom'>, AgentPresetMeta][]) {
    const c = preset.config
    if (
      c.riskIndex === state.riskIndex
      && c.tpMode === state.tpMode
      && c.avoidNyMid === state.avoidNyMid
      && c.wideNet === state.wideNet
      && c.allowHighSweepLong === state.allowHighSweepLong
      && c.scanAllSetups === state.scanAllSetups
      && c.tjrVideoStrict === state.tjrVideoStrict
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
