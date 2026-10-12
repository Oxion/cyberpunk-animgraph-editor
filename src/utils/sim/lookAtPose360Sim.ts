/**
 * animAnimNode_LookAtPose360 / LookAtPose360Direction.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { InstanceStore } from '../InstanceStore'
import type { ClipLibrary } from './clipLibrary'
import type { ClipPoseLibrary } from './clipPoseLibrary'
import type { Pose } from './pose'
import type { RigEntry } from './rigResource'
import {
  eulerDegToQuat,
  readBoneLs,
  resolveUnifiedName,
  writeBoneLs,
  type Qs,
} from './poseFk'
import {
  LookAtPose360DynDef,
  createLookAtPose360Dyn,
  type LookAtPose360Dyn,
} from './lookAtPose360Dyn'
import { normalizeAngle180, normalizeAngle360 } from './lookAtMath'
import { readCName, readNumber, resolveHandle } from './simDataUtils'
import type { SimInputBoard } from './SimInputBoard'

export type EyesLookAtCtx = {
  eyesLookAtDirection: number
  eyesLookAtDirectionEnabled: boolean
}

export type FloatLinkReader = (
  ref: unknown,
  fallback: number
) => number

export function ensureLookAtPose360Dyn(
  store: InstanceStore,
  handleId: string
): LookAtPose360Dyn {
  let s = store.get(LookAtPose360DynDef, handleId)
  if (!s) s = store.set(LookAtPose360DynDef, handleId, createLookAtPose360Dyn())
  return s
}

/** Engine LookAtPose360Direction::OnUpdate / OnGetValue. */
export function evalLookAtPose360Direction(
  node: AnimgraphNode,
  eyes: EyesLookAtCtx
): number {
  const d = node.Data ?? {}
  const defaultValue = readNumber(d.defaultValue, 0)
  if (!eyes.eyesLookAtDirectionEnabled) return defaultValue
  const offset = readNumber(d.angleOffset, 0)
  const negate = !!d.negateOutput
  const deg =
    (negate ? -1 : 1) *
    normalizeAngle180(
      (eyes.eyesLookAtDirection * 180) / Math.PI + offset
    )
  return deg
}

/**
 * Engine LookAtPose360::OnUpdate — damp angle toward eyesLookAtDirectionTemp.
 */
export function updateLookAtPose360(
  node: AnimgraphNode,
  store: InstanceStore,
  eyes: EyesLookAtCtx,
  dt: number,
  clipLibrary: ClipLibrary | null,
  board: SimInputBoard,
  readFloat: FloatLinkReader
): number {
  const dyn = ensureLookAtPose360Dyn(store, node.HandleId)
  const d = node.Data ?? {}
  const animName = readCName(d.animation)
  if (!animName || animName === 'None') {
    dyn.animTime = 0
    return dyn.angle
  }

  const isWrap = (n: string) => board.isWrapperActive(n)
  const clip = clipLibrary?.resolveClip(animName, isWrap)
  if (!clip) {
    dyn.animTime = 0
    return dyn.angle
  }

  const offsetTarget = readFloat(d.targetAngleOffsetNode, 0)
  const speed = readNumber(d.speedInDegreesPerSecond, 90)
  const durationCut = readNumber(d.durationCut, 0)

  let currentAngle = dyn.angle
  let angleDiff = 0
  if (eyes.eyesLookAtDirectionEnabled) {
    const targetAngle = normalizeAngle360(
      (eyes.eyesLookAtDirection * 180) / Math.PI + offsetTarget
    )
    dyn.targetAngle = targetAngle
    angleDiff = targetAngle - currentAngle
  } else {
    dyn.targetAngle = offsetTarget
    angleDiff = -currentAngle
  }

  while (angleDiff > 180) angleDiff -= 360
  while (angleDiff < -180) angleDiff += 360

  const absDiff = Math.abs(angleDiff)
  const sign = angleDiff >= 0 ? 1 : -1
  const valueToAdd = Math.max(
    -absDiff,
    Math.min(absDiff, sign * speed * dt)
  )
  currentAngle = normalizeAngle360(currentAngle + valueToAdd)
  dyn.angle = currentAngle

  const duration = durationCut > 0 ? durationCut : clip.duration
  const progress = Math.max(0, Math.min(1, currentAngle / 360))
  dyn.animTime = duration * progress
  return dyn.angle
}

/** Engine LookAtPose360::OnSample — sample clip at animTime + Trajectory Z rot. */
export function sampleLookAtPose360(
  node: AnimgraphNode,
  store: InstanceStore,
  pose: Pose,
  rig: RigEntry,
  clipLibrary: ClipLibrary | null,
  clipPoseLibrary: ClipPoseLibrary,
  board: SimInputBoard,
  readFloat: FloatLinkReader
): boolean {
  const dyn = ensureLookAtPose360Dyn(store, node.HandleId)
  const d = node.Data ?? {}
  const animName = readCName(d.animation)
  if (!animName || animName === 'None') return false

  const isWrap = (n: string) => board.isWrapperActive(n)
  const winner = clipLibrary?.resolveClipEntry(animName, isWrap)
  if (!winner) return false

  const ok = clipPoseLibrary.sample(
    animName,
    dyn.animTime,
    rig,
    pose,
    winner.entryId
  )
  if (!ok) return false

  const angleOffset = readFloat(d.angleOffsetNode, 0)
  const trajIdx = resolveUnifiedName(pose, rig, 'Trajectory')
  if (trajIdx >= 0) {
    const ls: Qs = {
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
    if (readBoneLs(pose, trajIdx, ls)) {
      const zRot = eulerDegToQuat(0, 0, dyn.angle + angleOffset)
      // trajectoryRotation = trajectoryRotation * rotation
      const ax = ls.qx
      const ay = ls.qy
      const az = ls.qz
      const aw = ls.qw
      const bx = zRot.qx
      const by = zRot.qy
      const bz = zRot.qz
      const bw = zRot.qw
      ls.qx = aw * bx + ax * bw + ay * bz - az * by
      ls.qy = aw * by - ax * bz + ay * bw + az * bx
      ls.qz = aw * bz + ax * by - ay * bx + az * bw
      ls.qw = aw * bw - ax * bx - ay * by - az * bz
      writeBoneLs(pose, trajIdx, ls)
    }
  }
  return true
}

export function resolveFloatLinkNode(
  handles: Map<string, AnimgraphNode>,
  ref: unknown
): AnimgraphNode | null {
  return resolveHandle(handles, ref)
}
