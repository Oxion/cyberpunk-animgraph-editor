/**
 * animAnimNode_LookAt — single-bone aim toward target MS (engine OnSample).
 */

import { animAxisToVector, type Vec3 } from './ik2Solver'
import type { Pose } from './pose'
import {
  getTransformMs,
  IDENTITY_QS,
  parentUnifiedOf,
  resolveUnifiedName,
  setBoneRotationMs,
  type Qs,
} from './poseFk'
import type { RigEntry } from './rigResource'
import { readBool, readNumber } from './simDataUtils'

export type LookAtBoneAimParams = {
  transformName: string
  forwardAxis: unknown
  useLimits: boolean
  limitAxis: unknown
  limitAngleDegrees: number
  weight: number
  targetMs: { x: number; y: number; z: number }
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-8) return { x: 0, y: 1, z: 0 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function quatRotate(q: Qs, v: Vec3): Vec3 {
  const { qx, qy, qz, qw } = q
  const ix = qw * v.x + qy * v.z - qz * v.y
  const iy = qw * v.y + qz * v.x - qx * v.z
  const iz = qw * v.z + qx * v.y - qy * v.x
  const iw = -qx * v.x - qy * v.y - qz * v.z
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  }
}

function quatFromAxisAngle(axis: Vec3, angleRad: number): Qs {
  const n = normalize3(axis)
  const half = angleRad * 0.5
  const s = Math.sin(half)
  return { ...IDENTITY_QS, qx: n.x * s, qy: n.y * s, qz: n.z * s, qw: Math.cos(half) }
}

function quatMul(a: Qs, b: Qs): Qs {
  return {
    ...IDENTITY_QS,
    qx: a.qw * b.qx + a.qx * b.qw + a.qy * b.qz - a.qz * b.qy,
    qy: a.qw * b.qy - a.qx * b.qz + a.qy * b.qw + a.qz * b.qx,
    qz: a.qw * b.qz + a.qx * b.qy - a.qy * b.qx + a.qz * b.qw,
    qw: a.qw * b.qw - a.qx * b.qx - a.qy * b.qy - a.qz * b.qz,
  }
}

function acosSafe(x: number): number {
  return Math.acos(Math.min(1, Math.max(-1, x)))
}

/**
 * Engine AnimNode_LookAt::OnSample — rotate bone so forwardAxis aims at targetMs.
 */
export function applyLookAtBoneAim(
  pose: Pose,
  rig: RigEntry,
  params: LookAtBoneAimParams
): boolean {
  const weight = params.weight
  if (!(weight > 0)) return false

  const idx = resolveUnifiedName(pose, rig, params.transformName)
  if (idx < 0) return false
  const parentIdx = parentUnifiedOf(pose, rig, idx)
  if (parentIdx < 0) return false

  const parentMS = { ...IDENTITY_QS }
  const boneMS = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, parentIdx, parentMS)) return false
  if (!getTransformMs(pose, rig, idx, boneMS)) return false

  let aim = normalize3({
    x: params.targetMs.x - boneMS.tx,
    y: params.targetMs.y - boneMS.ty,
    z: params.targetMs.z - boneMS.tz,
  })

  if (params.useLimits) {
    const limitLS = animAxisToVector(params.limitAxis)
    const limitMS = normalize3(quatRotate(parentMS, limitLS))
    const limitRad = (params.limitAngleDegrees * Math.PI) / 180
    const cosLimit = Math.cos(limitRad)
    const cosTarget = dot3(aim, limitMS)
    if (cosTarget < cosLimit) {
      const axis = normalize3(cross3(limitMS, aim))
      const q = quatFromAxisAngle(axis, limitRad)
      aim = normalize3(quatRotate(q, limitMS))
    }
  }

  const fwdLS = animAxisToVector(params.forwardAxis)
  const dirMS = normalize3(quatRotate(boneMS, fwdLS))
  const axis = cross3(dirMS, aim)
  const axisLen = Math.hypot(axis.x, axis.y, axis.z)
  if (axisLen < 1e-8) {
    // Parallel — nothing to do (or 180° flip; engine still builds q from unnormalized cross)
    return true
  }
  const cosAngle = dot3(aim, dirMS)
  const angle = acosSafe(cosAngle) * weight
  const q = quatFromAxisAngle(normalize3(axis), angle)
  const newRot = quatMul(q, boneMS)
  setBoneRotationMs(
    pose,
    rig,
    idx,
    newRot.qx,
    newRot.qy,
    newRot.qz,
    newRot.qw
  )
  return true
}

export function readLookAtBoneAimStatic(
  nodeData: Record<string, unknown>
): Pick<
  LookAtBoneAimParams,
  'forwardAxis' | 'useLimits' | 'limitAxis' | 'limitAngleDegrees'
> {
  return {
    forwardAxis: nodeData.forwardAxis ?? 'X',
    useLimits: readBool(nodeData.useLimits),
    limitAxis: nodeData.limitAxis ?? 'X',
    limitAngleDegrees: readNumber(nodeData.limitAngle, 90),
  }
}
