/**
 * Offline subset of animAnimNode_AddSnapToTerrainIkRequest.
 * Flat ground (z=0), identity entity L2W — not full engine parity
 * (no PhysicsTracer, foot lock, damping, orientation, or HumanIk bus).
 */

import { applyIk2 } from './ik2Solver'
import {
  readTrackValue,
  resolveTrackUnified,
  type Pose,
} from './pose'
import {
  getTransformMs,
  IDENTITY_QS,
  parentUnifiedOf,
  readBoneLs,
  resolveUnifiedName,
  writeBoneLs,
  type Qs,
} from './poseFk'
import type { RigEntry } from './rigResource'
import { readCName } from './simDataUtils'

/** Matches sampleWalk IkTargetSnap — kept local to avoid import cycle. */
type IkTargetSnap = {
  chain: string
  id?: number
  posMs: { x: number; y: number; z: number }
  rotMs: { x: number; y: number; z: number; w: number }
  weightPosition: number
  weightRotation: number
  priority: number
}

const ALLOW_IK_THRESHOLD = 0.95
const FOOT_PHASE_PLANTED = 0
const GROUND_Z = 0
const MAX_HIP_SHIFT = 0.5
const MIN_CORRECTION = 0.005
const FOOT_FORWARD_SHIFT = 0.09

const TRACK_ALLOW = 'footSnapIkEnabled'
const TRACK_LEFT_PHASE = 'leftFootPhase'
const TRACK_RIGHT_PHASE = 'rightFootPhase'
const TRACK_OFFSET_FOOT = 'footPlantOffsetFoot'
const TRACK_OFFSET_X = 'footPlantOffsetX'
const TRACK_OFFSET_Y = 'footPlantOffsetY'
const TRACK_OFFSET_Z = 'footPlantOffsetZ'

export const SNAP_TO_TERRAIN_PARTIAL_MSG =
  'AddSnapToTerrainIkRequest: flat-ground subset only (no raycast/foot-lock/HumanIk)'

function unwrap(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.Data && typeof o.Data === 'object') return o.Data as Record<string, unknown>
  return o
}

function readTransformName(raw: unknown): string {
  const ti = unwrap(raw)
  if (!ti) return readCName(raw)
  return readCName(ti.name) || readCName(ti.bone) || ''
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function boneNameOf(rig: RigEntry, idx: number): string {
  return rig.boneNames[idx] ?? ''
}

/** Engine CalculateFootToBottomTransform — A-pose MS heel→sole at ground + Y shift. */
function footBottomMs(rig: RigEntry, footIdx: number, footMs: Qs): { x: number; y: number; z: number } {
  const rt = rig.refTranslation
  // Approximate A-pose foot MS as LS (humanoid feet near root); sole at z=0 + Y fwd.
  const ftx = rt[footIdx * 3]!
  const fty = rt[footIdx * 3 + 1]!
  const ftz = rt[footIdx * 3 + 2]!
  const ox = 0
  const oy = FOOT_FORWARD_SHIFT
  const oz = GROUND_Z - ftz
  const qx = footMs.qx
  const qy = footMs.qy
  const qz = footMs.qz
  const qw = footMs.qw
  const ix = qw * ox + qy * oz - qz * oy
  const iy = qw * oy + qz * ox - qx * oz
  const iz = qw * oz + qx * oy - qy * ox
  const iw = -qx * ox - qy * oy - qz * oz
  const rx = ix * qw + iw * -qx + iy * -qz - iz * -qy
  const ry = iy * qw + iw * -qy + iz * -qx - ix * -qz
  const rz = iz * qw + iw * -qz + ix * -qy - iy * -qx
  return { x: footMs.tx + rx, y: footMs.ty + ry, z: footMs.tz + rz }
}

function resolveLegChain(
  pose: Pose,
  rig: RigEntry,
  footIdx: number
): { first: string; second: string; end: string } | null {
  const secondIdx = parentUnifiedOf(pose, rig, footIdx)
  if (secondIdx < 0) return null
  const firstIdx = parentUnifiedOf(pose, rig, secondIdx)
  if (firstIdx < 0) return null
  const end = boneNameOf(rig, footIdx)
  const second = boneNameOf(rig, secondIdx)
  const first = boneNameOf(rig, firstIdx)
  if (!end || !second || !first) return null
  return { first, second, end }
}

function writeIkTarget(
  map: Map<string, IkTargetSnap> | undefined,
  chain: string,
  pos: { x: number; y: number; z: number },
  rot: { x: number; y: number; z: number; w: number }
): void {
  if (!map || !chain || chain === 'None') return
  const prev = map.get(chain)
  const priority = 0
  if (prev && prev.priority > priority) return
  map.set(chain, {
    chain,
    id: -1,
    posMs: { ...pos },
    rotMs: { ...rot },
    weightPosition: 1,
    weightRotation: 1,
    priority,
  })
}

type FootReq = {
  chain: string
  footName: string
  poleName: string
  desiredOffsetFoot: number
}

function readFootReq(raw: unknown, desiredOffsetFoot: number): FootReq | null {
  const d = unwrap(raw)
  if (!d) return null
  return {
    chain: readCName(d.ikChain),
    footName: readTransformName(d.footTransformIndex),
    poleName: readTransformName(d.poleVectorRefTransformIndex),
    desiredOffsetFoot,
  }
}

/**
 * Flat-ground plant + hip Z + ikTargets + Ik2 stand-in for HumanIk.
 * Caller already sampled OnePoseInput child into `pose`.
 */
export function applySnapToTerrainIkFlat(
  pose: Pose,
  rig: RigEntry,
  nodeData: Record<string, unknown>,
  ikTargets: Map<string, IkTargetSnap> | undefined
): { applied: boolean; reason?: string } {
  const allowIdx = resolveTrackUnified(pose, rig, TRACK_ALLOW)
  const leftPhaseIdx = resolveTrackUnified(pose, rig, TRACK_LEFT_PHASE)
  const rightPhaseIdx = resolveTrackUnified(pose, rig, TRACK_RIGHT_PHASE)
  if (allowIdx < 0 || leftPhaseIdx < 0 || rightPhaseIdx < 0) {
    return { applied: false, reason: 'missing phase/allow tracks' }
  }

  const allow = readTrackValue(pose, allowIdx)
  if (!(allow >= ALLOW_IK_THRESHOLD)) {
    return { applied: false, reason: 'footSnapIkEnabled below threshold' }
  }

  const leftPhase = clamp(readTrackValue(pose, leftPhaseIdx), -2, 2)
  const rightPhase = clamp(readTrackValue(pose, rightPhaseIdx), -2, 2)
  const leftPlanted = leftPhase >= FOOT_PHASE_PLANTED
  const rightPlanted = rightPhase >= FOOT_PHASE_PLANTED

  const offsetFootIdx = resolveTrackUnified(pose, rig, TRACK_OFFSET_FOOT)
  const offsetXIdx = resolveTrackUnified(pose, rig, TRACK_OFFSET_X)
  const offsetYIdx = resolveTrackUnified(pose, rig, TRACK_OFFSET_Y)
  const offsetZIdx = resolveTrackUnified(pose, rig, TRACK_OFFSET_Z)
  const hasOffsets =
    offsetFootIdx >= 0 && offsetXIdx >= 0 && offsetYIdx >= 0 && offsetZIdx >= 0
  const offsetFoot = hasOffsets ? readTrackValue(pose, offsetFootIdx) : 0
  const offsetX = hasOffsets ? readTrackValue(pose, offsetXIdx) : 0
  const offsetY = hasOffsets ? readTrackValue(pose, offsetYIdx) : 0
  const offsetZ = hasOffsets ? readTrackValue(pose, offsetZIdx) : 0

  const leftReq = readFootReq(nodeData.leftFootRequest, 1)
  const rightReq = readFootReq(nodeData.rightFootRequest, -1)
  const hips = unwrap(nodeData.hipsRequest)

  const footMsScratch = { ...IDENTITY_QS }
  let hipZ = 0
  let plantedCount = 0

  const processFoot = (
    req: FootReq | null,
    planted: boolean,
    phase: number
  ): void => {
    if (!req) return
    const footIdx = resolveUnifiedName(pose, rig, req.footName)
    if (footIdx < 0) return
    if (!getTransformMs(pose, rig, footIdx, footMsScratch)) return

    const bottom = footBottomMs(rig, footIdx, footMsScratch)
    let targetX = footMsScratch.tx
    let targetY = footMsScratch.ty
    let targetZ = footMsScratch.tz

    if (planted) {
      const deltaZ = GROUND_Z - bottom.z
      targetZ = footMsScratch.tz + deltaZ
      hipZ = plantedCount === 0 ? deltaZ : Math.min(hipZ, deltaZ)
      plantedCount++
    } else if (
      hasOffsets &&
      Math.abs(offsetFoot - req.desiredOffsetFoot) < 0.05
    ) {
      // Airborne: blend toward expected plant MS as phase approaches land (0).
      // phase -2..0 → t 0..1
      const t = clamp((phase + 2) / 2, 0, 1) * 0.5
      targetX = footMsScratch.tx * (1 - t) + offsetX * t
      targetY = footMsScratch.ty * (1 - t) + offsetY * t
      // Plant Z on flat ground is 0 contact; keep sole correction mix.
      const plantFootZ = footMsScratch.tz + (GROUND_Z - bottom.z)
      const expectZ = offsetZ
      targetZ = footMsScratch.tz * (1 - t) + (expectZ !== 0 ? expectZ : plantFootZ) * t
    }

    const dx = targetX - footMsScratch.tx
    const dy = targetY - footMsScratch.ty
    const dz = targetZ - footMsScratch.tz
    const need =
      Math.hypot(dx, dy, dz) >= MIN_CORRECTION

    writeIkTarget(
      ikTargets,
      req.chain,
      { x: targetX, y: targetY, z: targetZ },
      {
        x: footMsScratch.qx,
        y: footMsScratch.qy,
        z: footMsScratch.qz,
        w: footMsScratch.qw,
      }
    )

    if (!need) return

    const chain = resolveLegChain(pose, rig, footIdx)
    if (!chain) return

    let pole = { x: 0, y: 0, z: 0 }
    let usePole = false
    if (req.poleName && req.poleName !== 'None') {
      const poleIdx = resolveUnifiedName(pose, rig, req.poleName)
      const poleMs = { ...IDENTITY_QS }
      if (poleIdx >= 0 && getTransformMs(pose, rig, poleIdx, poleMs)) {
        // Default pole: pole bone + Y axis * ±0.5 (engine); approximate along +Y.
        const sign = req.desiredOffsetFoot >= 0 ? 1 : -1
        pole = { x: poleMs.tx, y: poleMs.ty + 0.5 * sign, z: poleMs.tz }
        pole.x += dx
        pole.y += dy
        pole.z += dz
        usePole = true
      }
    }

    applyIk2(pose, rig, {
      firstBoneName: chain.first,
      secondBoneName: chain.second,
      endBoneName: chain.end,
      hingeAxis: 'AxisX',
      minHingeAngleDegrees: 0,
      maxHingeAngleDegrees: 180,
      firstBoneIkGain: 1,
      secondBoneIkGain: 1,
      endBoneIkGain: 1,
      enforceEndPosition: true,
      enforceEndOrientation: false,
      endBoneOffsetPositionLS: { x: 0, y: 0, z: 0 },
      weight: 1,
      twistDeg: 0,
      usePoleVector: usePole,
      poleVectorMS: pole,
      endTargetPositionMS: { x: targetX, y: targetY, z: targetZ },
      endTargetRotationMS: {
        x: footMsScratch.qx,
        y: footMsScratch.qy,
        z: footMsScratch.qz,
        w: footMsScratch.qw,
      },
    })
  }

  processFoot(leftReq, leftPlanted, leftPhase)
  processFoot(rightReq, rightPlanted, rightPhase)

  // Hip Z (LS) — engine ShiftHips subset: clamp planted delta.
  hipZ = clamp(hipZ, -MAX_HIP_SHIFT, MAX_HIP_SHIFT)
  const hipsName = hips ? readTransformName(hips.hipsTransformIndex) : ''
  const hipsIdx = resolveUnifiedName(pose, rig, hipsName)
  if (hipsIdx >= 0 && Math.abs(hipZ) >= MIN_CORRECTION) {
    const ls = { ...IDENTITY_QS }
    if (readBoneLs(pose, hipsIdx, ls)) {
      ls.tz += hipZ
      writeBoneLs(pose, hipsIdx, ls)
    }
  }

  return { applied: true }
}
