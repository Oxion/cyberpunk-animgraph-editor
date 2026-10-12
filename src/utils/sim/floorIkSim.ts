/**
 * PARTIAL offline port of animAnimNode_FloorIk.
 *
 * Flat ground (z=0), identity entity L2W — NOT full engine parity:
 * no PhysicsTracer / raycasts, foot-lock, slope damp, sliding, or dual-leg
 * STwoBonesIKSolver state machine. Plants feet + shifts pelvis + Ik2 stand-in.
 */

import { applyIk2 } from './ik2Solver'
import type { Pose } from './pose'
import {
  getTransformMs,
  IDENTITY_QS,
  readBoneLs,
  resolveUnifiedName,
  writeBoneLs,
  type Qs,
} from './poseFk'
import type { RigEntry } from './rigResource'
import { readCName, readNumber } from './simDataUtils'

export const FLOOR_IK_PARTIAL_MSG =
  'FloorIk: PARTIAL flat-ground subset only (no PhysicsTracer/foot-lock/slope)'

const GROUND_Z = 0
const MAX_PELVIS_SHIFT = 0.5
const MIN_CORRECTION = 0.005
const FOOT_FORWARD_SHIFT = 0.09

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

/** Approximate sole contact MS (same heuristic as SnapToTerrain flat). */
function footBottomMs(rig: RigEntry, footIdx: number, footMs: Qs): {
  x: number
  y: number
  z: number
} {
  const rt = rig.refTranslation
  const ftz = rt[footIdx * 3 + 2]!
  const ox = 0
  const oy = FOOT_FORWARD_SHIFT
  const oz = GROUND_Z - ftz
  const { qx, qy, qz, qw } = footMs
  const ix = qw * ox + qy * oz - qz * oy
  const iy = qw * oy + qz * ox - qx * oz
  const iz = qw * oz + qx * oy - qy * ox
  const iw = -qx * ox - qy * oy - qz * oz
  const rx = ix * qw + iw * -qx + iy * -qz - iz * -qy
  const ry = iy * qw + iw * -qy + iz * -qx - ix * -qz
  const rz = iz * qw + iw * -qz + ix * -qy - iy * -qx
  return { x: footMs.tx + rx, y: footMs.ty + ry, z: footMs.tz + rz }
}

type LegBones = {
  upper: string
  joint: string
  lower: string
  /** End effector (foot / ik bone). */
  ik: string
}

function readLegBones(raw: unknown): LegBones | null {
  const d = unwrap(raw)
  if (!d) return null
  const upper = readTransformName(d.upperBone)
  const joint = readTransformName(d.jointBone)
  const lower = readTransformName(d.lowerBone) || readTransformName(d.subLowerBone)
  const ik = readTransformName(d.ikBone) || lower
  if (!upper || !joint || !ik) return null
  return { upper, joint, lower: lower || ik, ik }
}

function plantLeg(
  pose: Pose,
  rig: RigEntry,
  leg: LegBones,
  weight: number
): number {
  const footIdx = resolveUnifiedName(pose, rig, leg.ik)
  if (footIdx < 0 || !(weight > 0)) return 0
  const footMs = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, footIdx, footMs)) return 0

  const bottom = footBottomMs(rig, footIdx, footMs)
  const deltaZ = GROUND_Z - bottom.z
  if (Math.abs(deltaZ) < MIN_CORRECTION) return deltaZ

  const targetZ = footMs.tz + deltaZ
  applyIk2(pose, rig, {
    firstBoneName: leg.upper,
    secondBoneName: leg.joint,
    endBoneName: leg.ik,
    hingeAxis: 'AxisX',
    minHingeAngleDegrees: 0,
    maxHingeAngleDegrees: 180,
    firstBoneIkGain: 1,
    secondBoneIkGain: 1,
    endBoneIkGain: 1,
    enforceEndPosition: true,
    enforceEndOrientation: false,
    endBoneOffsetPositionLS: { x: 0, y: 0, z: 0 },
    weight,
    twistDeg: 0,
    usePoleVector: false,
    poleVectorMS: { x: 0, y: 0, z: 0 },
    endTargetPositionMS: { x: footMs.tx, y: footMs.ty, z: targetZ },
    endTargetRotationMS: {
      x: footMs.qx,
      y: footMs.qy,
      z: footMs.qz,
      w: footMs.qw,
    },
  })
  return deltaZ
}

/**
 * PARTIAL FloorIk Sample: plant both legs to flat ground + pelvis Z.
 * Always incomplete vs engine — caller should emit FLOOR_IK_PARTIAL_MSG warning.
 */
export function applyFloorIkPartial(
  pose: Pose,
  rig: RigEntry,
  nodeData: Record<string, unknown>,
  weight = 1
): { applied: boolean; reason?: string } {
  if (!(weight > 0.001)) {
    return { applied: false, reason: 'weight ~ 0' }
  }

  const left = readLegBones(nodeData.leftLegIK)
  const right = readLegBones(nodeData.rightLegIK)
  if (!left && !right) {
    return { applied: false, reason: 'missing leftLegIK/rightLegIK bones' }
  }

  const leftDz = left ? plantLeg(pose, rig, left, weight) : 0
  const rightDz = right ? plantLeg(pose, rig, right, weight) : 0

  // Pelvis: take the more negative foot correction (both planted on flat).
  let pelvisDz = 0
  if (left && right) pelvisDz = Math.min(leftDz, rightDz)
  else if (left) pelvisDz = leftDz
  else pelvisDz = rightDz
  pelvisDz = clamp(pelvisDz, -MAX_PELVIS_SHIFT, MAX_PELVIS_SHIFT)

  const pelvisData = unwrap(nodeData.pelvis)
  const pelvisName = pelvisData
    ? readTransformName(pelvisData.bone)
    : readTransformName(
        unwrap(nodeData.common)?.gravityCentreBone
      )
  const pelvisIdx = resolveUnifiedName(pose, rig, pelvisName)
  if (pelvisIdx >= 0 && Math.abs(pelvisDz) >= MIN_CORRECTION) {
    const ls = { ...IDENTITY_QS }
    if (readBoneLs(pose, pelvisIdx, ls)) {
      ls.tz += pelvisDz * weight
      writeBoneLs(pose, pelvisIdx, ls)
    }
  }

  return { applied: true }
}

/** Optional static weight from node (no anim-event weight handler offline). */
export function readFloorIkStaticWeight(nodeData: Record<string, unknown>): number {
  return clamp(readNumber(nodeData.weight, 1), 0, 1)
}
