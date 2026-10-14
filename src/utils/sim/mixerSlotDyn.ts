/**
 * Per-node MixerSlot instance state (engine AnimNode_MixerSlot buffers).
 */

import { InstanceStateDef } from '../InstanceStore'
import type { SimMixerSlotAnimParams } from './simServiceEvents'

export type MixerSlotAnimEntry = {
  animationName: string
  previousTime: number
  currentTime: number
  loops: number
  weight: number
  bodyPartMask: string
  convertToAdditive: boolean
  extractTrajectoryForBlend: boolean
  useDynamicAnimSets: boolean
  cachedDuration: number
  /** Engine MuteAnimEvents — ALL skips CollectEvents. */
  muteAnimEvents: 'NONE' | 'STANDARD' | 'FACE_ANIMS' | 'ALL'
}

export type MixerSlotTrajectoryBlend = {
  enabled: boolean
  blendIn: number
  inTransform: {
    tx: number
    ty: number
    tz: number
    qx: number
    qy: number
    qz: number
    qw: number
    sx: number
    sy: number
    sz: number
  }
}

export type MixerSlotDyn = {
  maxNormal: number
  maxAdditive: number
  maxOverride: number

  idleBlendWeight: number
  addIdleWeight: number
  firstIdle: MixerSlotAnimEntry
  secondIdle: MixerSlotAnimEntry
  firstAddIdle: MixerSlotAnimEntry
  secondAddIdle: MixerSlotAnimEntry

  normal: MixerSlotAnimEntry[]
  additive: MixerSlotAnimEntry[]
  override: MixerSlotAnimEntry[]

  idleDirty: boolean
  arrayDirty: boolean
  enableInertiaBlend: boolean

  trajectory: MixerSlotTrajectoryBlend
}

const IDENTITY_XF = {
  tx: 0,
  ty: 0,
  tz: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
  sx: 1,
  sy: 1,
  sz: 1,
}

export function emptyMixerSlotEntry(
  patch?: Partial<MixerSlotAnimEntry>
): MixerSlotAnimEntry {
  return {
    animationName: '',
    previousTime: 0,
    currentTime: 0,
    loops: 0,
    weight: 0,
    bodyPartMask: '',
    convertToAdditive: false,
    extractTrajectoryForBlend: false,
    useDynamicAnimSets: false,
    cachedDuration: 0,
    muteAnimEvents: 'NONE',
    ...patch,
  }
}

export function entryFromParams(
  p: SimMixerSlotAnimParams,
  weightOverride?: number
): MixerSlotAnimEntry {
  return emptyMixerSlotEntry({
    animationName: p.animationName || '',
    previousTime: p.previousTime ?? 0,
    currentTime: p.currentTime ?? 0,
    loops: p.loops ?? 0,
    weight: weightOverride ?? p.weight ?? 0,
    bodyPartMask: p.bodyPartMask || '',
    convertToAdditive: !!p.convertToAdditive,
    extractTrajectoryForBlend: !!p.extractTrajectoryForBlend,
    useDynamicAnimSets: !!p.useDynamicAnimSets,
    muteAnimEvents: p.muteAnimEvents ?? 'NONE',
  })
}

export function copyTimeRelated(
  dest: MixerSlotAnimEntry,
  src: MixerSlotAnimEntry
): void {
  dest.previousTime = src.previousTime
  dest.currentTime = src.currentTime
  dest.loops = src.loops
}

export function createMixerSlotDyn(
  caps?: { maxNormal?: number; maxAdditive?: number; maxOverride?: number }
): MixerSlotDyn {
  return {
    maxNormal: Math.max(0, caps?.maxNormal ?? 2),
    maxAdditive: Math.max(0, caps?.maxAdditive ?? 2),
    maxOverride: Math.max(0, caps?.maxOverride ?? 2),
    idleBlendWeight: 0,
    addIdleWeight: 0,
    firstIdle: emptyMixerSlotEntry(),
    secondIdle: emptyMixerSlotEntry(),
    firstAddIdle: emptyMixerSlotEntry(),
    secondAddIdle: emptyMixerSlotEntry(),
    normal: [],
    additive: [],
    override: [],
    idleDirty: true,
    arrayDirty: true,
    enableInertiaBlend: false,
    trajectory: {
      enabled: false,
      blendIn: 1,
      inTransform: { ...IDENTITY_XF },
    },
  }
}

export const MixerSlotDynDef = new InstanceStateDef(
  'mixerSlot',
  createMixerSlotDyn
)

export function hasMixerSlotWork(dyn: MixerSlotDyn): boolean {
  return (
    !!dyn.firstIdle.animationName ||
    !!dyn.secondIdle.animationName ||
    dyn.normal.length > 0 ||
    dyn.additive.length > 0 ||
    dyn.override.length > 0
  )
}
