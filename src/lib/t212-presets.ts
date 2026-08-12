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

export const T212_PRESET_KEY = 't212-active-preset'

export const T212_PRESETS: Record<Exclude<T212PresetId, 'custom'>, { label: string; title: string; config: T212PresetConfig }> = {
  estrito: {
    label: 'Estrito',
    title: 'Conservador · CFD prático off · sem malha',
    config: {
      riskIndex: 0,
      tpMode: '1r',
      wideNet: false,
      cfdPractical: false,
      scanAllSetups: false,
      tjrVideoStrict: false,
    },
  },
  video: {
    label: 'Disciplina',
    title: 'Filtro apertado · 5m BOS/iFVG + 1m BOS/iFVG · sem malha/CFD',
    config: {
      riskIndex: 1,
      tpMode: '1_5r',
      wideNet: false,
      cfdPractical: false,
      scanAllSetups: false,
      tjrVideoStrict: true,
    },
  },
  pratico: {
    label: 'Prático',
    title: 'Equilibrado · CFD prático on (default · mais AGORA)',
    config: {
      riskIndex: 1,
      tpMode: '1_5r',
      wideNet: false,
      cfdPractical: true,
      scanAllSetups: false,
      tjrVideoStrict: false,
    },
  },
  malha: {
    label: 'Malha',
    title: 'Agressivo · malha + CFD prático · todos setups',
    config: {
      riskIndex: 2,
      tpMode: '1_5r',
      wideNet: true,
      cfdPractical: true,
      scanAllSetups: true,
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
  return 'custom'
}

export function writeT212PresetId(id: T212PresetId) {
  try {
    localStorage.setItem(T212_PRESET_KEY, id)
  } catch {
    /* ignore */
  }
}

export function matchT212Preset(state: T212PresetConfig): T212PresetId {
  for (const [id, preset] of Object.entries(T212_PRESETS) as [Exclude<T212PresetId, 'custom'>, typeof T212_PRESETS.estrito][]) {
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
