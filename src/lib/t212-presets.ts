import type { TpMode } from './tp-mode'
import { tpModes } from './tp-mode'

export type T212PresetId = 'estrito' | 'video' | 'pratico' | 'malha' | 'custom'

export type T212PresetConfig = {
  riskIndex: number
  tpMode: TpMode
  wideNet: boolean
  cfdPractical: boolean
  scanAllSetups: boolean
  tjrVideoStrict: boolean
}

export type T212PresetMeta = {
  label: string
  /** Uma frase na UI — o que este playbook faz. */
  blurb: string
  title: string
  config: T212PresetConfig
}

export const T212_PRESET_KEY = 't212-active-preset'

/** Chips principais (ordem na barra). Estrito fica em Ajustes. */
export const T212_PRIMARY_PRESETS: Exclude<T212PresetId, 'custom'>[] = ['pratico', 'video', 'malha']

export const T212_PRESETS: Record<Exclude<T212PresetId, 'custom'>, T212PresetMeta> = {
  pratico: {
    label: 'Prático',
    blurb: 'Dia a dia · mais AGORA · Yahoo flexível · 9 setups',
    title: 'Prático · CFD flexível · todos setups · mais oportunidades',
    config: {
      riskIndex: 1,
      tpMode: '1_5r',
      wideNet: false,
      cfdPractical: true,
      scanAllSetups: true,
      tjrVideoStrict: false,
    },
  },
  video: {
    label: 'Disciplina',
    blurb: 'Filtro apertado · menos trades · melhor qualidade',
    title: 'Disciplina · 5m+1m BOS/iFVG · sem malha/CFD',
    config: {
      riskIndex: 1,
      tpMode: '1_5r',
      wideNet: false,
      cfdPractical: false,
      scanAllSetups: false,
      tjrVideoStrict: true,
    },
  },
  malha: {
    label: 'Malha',
    blurb: 'Rede larga · máximo de sinais · qualidade menor',
    title: 'Malha · agressivo · malha + CFD · todos setups',
    config: {
      riskIndex: 2,
      tpMode: '1_5r',
      wideNet: true,
      cfdPractical: true,
      scanAllSetups: true,
      tjrVideoStrict: false,
    },
  },
  estrito: {
    label: 'Estrito',
    blurb: 'Risco baixo · CFD rígido · sem malha',
    title: 'Estrito · conservador · CFD prático off · sem malha',
    config: {
      riskIndex: 0,
      tpMode: '1r',
      wideNet: false,
      cfdPractical: false,
      scanAllSetups: false,
      tjrVideoStrict: false,
    },
  },
}

export function readT212PresetId(): T212PresetId {
  try {
    const raw = localStorage.getItem(T212_PRESET_KEY)
    if (raw === 'estrito' || raw === 'video' || raw === 'pratico' || raw === 'malha' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'pratico'
}

export function writeT212PresetId(id: T212PresetId) {
  try {
    localStorage.setItem(T212_PRESET_KEY, id)
  } catch {
    /* ignore */
  }
}

export function matchT212Preset(state: T212PresetConfig): T212PresetId {
  for (const [id, preset] of Object.entries(T212_PRESETS) as [Exclude<T212PresetId, 'custom'>, T212PresetMeta][]) {
    const c = preset.config
    if (
      c.riskIndex === state.riskIndex
      && c.tpMode === state.tpMode
      && c.wideNet === state.wideNet
      && c.cfdPractical === state.cfdPractical
      && c.scanAllSetups === state.scanAllSetups
      && c.tjrVideoStrict === state.tjrVideoStrict
    ) {
      return id
    }
  }
  return 'custom'
}

export function tpIndexForT212(mode: TpMode): number {
  return Math.max(0, tpModes.indexOf(mode))
}
