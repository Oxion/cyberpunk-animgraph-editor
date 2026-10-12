/**
 * animAnimNode_LookAtApplyVehicleRestrictions — clamp board (group,name) target.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { InstanceStore } from '../InstanceStore'
import type { Pose } from './pose'
import type { RigEntry } from './rigResource'
import { getTransformMs, resolveUnifiedName, type Qs } from './poseFk'
import type { SimInputBoard } from './SimInputBoard'
import type { SimVec4 } from './evalAnimMathExpressionVector'
import {
  LookAtVehicleRestrictionsDynDef,
  createLookAtVehicleRestrictionsDyn,
  setRestrictionDataFromDegrees,
  type LookAtVehicleRestrictionsDyn,
} from './lookAtVehicleRestrictionsDyn'
import type { SimCompileCtx } from './simCompile'
import type { SimServiceEvent } from './simServiceEvents'
import { readCName } from './simDataUtils'

const PLAYER_FORWARD: SimVec4 = { x: 0, y: 1, z: 0, w: 0 }
const STRAIGHT_UPDOWN_BLEND_OFF_BUFFER = 0.2
const ANGLE_DIFF_FOR_MAX = Math.PI / 2

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(t: number, a: SimVec4, b: SimVec4): SimVec4 {
  const u = clamp(t, 0, 1)
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    w: 0,
  }
}

function normalize3(v: SimVec4): { dir: SimVec4; len: number } {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-8) return { dir: { ...PLAYER_FORWARD }, len: 0 }
  return { dir: { x: v.x / len, y: v.y / len, z: v.z / len, w: 0 }, len }
}

/** Rotate vector around +Z by radians (engine Quaternion(EZ, angle)). */
function rotateAroundZ(v: SimVec4, radians: number): SimVec4 {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
    z: v.z,
    w: 0,
  }
}

function readReferenceBoneName(node: AnimgraphNode): string {
  const raw = node.Data?.referenceBone
  if (!raw || typeof raw !== 'object') return ''
  const o = raw as { name?: unknown }
  return readCName(o.name)
}

export function ensureLookAtVehicleRestrictionsDyn(
  store: InstanceStore,
  handleId: string
): LookAtVehicleRestrictionsDyn {
  let s = store.get(LookAtVehicleRestrictionsDynDef, handleId)
  if (!s) {
    s = store.set(
      LookAtVehicleRestrictionsDynDef,
      handleId,
      createLookAtVehicleRestrictionsDyn()
    )
  }
  return s
}

export function applyVehicleRestrictionEvents(
  dyn: LookAtVehicleRestrictionsDyn,
  events: readonly SimServiceEvent[]
): void {
  for (const e of events) {
    if (e.kind !== 'LookAtVehicleRestrictionParams') continue
    dyn.data = setRestrictionDataFromDegrees(
      e.maxYawDegrees,
      e.centerYawThresholdDegrees,
      e.maxUpDegrees,
      e.maxDownDegrees,
      e.maxRotationSpeed
    )
  }
}

/** Bind compile: create dyn + register LookAtVehicleRestrictionParams listener. */
export function compileLookAtVehicleRestrictionsNode(
  node: AnimgraphNode,
  ctx: SimCompileCtx
): void {
  ensureLookAtVehicleRestrictionsDyn(ctx.instanceStore, node.HandleId)
  ctx.addEventListener('LookAtVehicleRestrictionParams', (n, events, rt) => {
    const dyn = ensureLookAtVehicleRestrictionsDyn(rt.instanceStore, n.HandleId)
    applyVehicleRestrictionEvents(dyn, events)
  })
}

/** Update path — restriction params already applied by DispatchEvent. */
export function updateLookAtVehicleRestrictions(
  node: AnimgraphNode,
  store: InstanceStore,
  dt: number
): void {
  const dyn = ensureLookAtVehicleRestrictionsDyn(store, node.HandleId)
  dyn.timeDelta = dt
}

/**
 * Engine OnSample: read AnimInstanceInput (group,name), clamp vs reference bone, write back.
 */
export function sampleLookAtVehicleRestrictions(
  node: AnimgraphNode,
  store: InstanceStore,
  board: SimInputBoard,
  pose: Pose,
  rig: RigEntry
): void {
  const dyn = ensureLookAtVehicleRestrictionsDyn(store, node.HandleId)
  if (dyn.data.maxYawRadians < 0) return

  const group = readCName(node.Data?.group)
  const name = readCName(node.Data?.name)
  if (!group || group === 'None' || !name || name === 'None') return

  const boneName = readReferenceBoneName(node)
  const boneIdx = resolveUnifiedName(pose, rig, boneName)
  if (boneIdx < 0) return
  const refMs: Qs = {
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
  if (!getTransformMs(pose, rig, boneIdx, refMs)) return
  const refPosition: SimVec4 = { x: refMs.tx, y: refMs.ty, z: refMs.tz, w: 0 }

  const targetPos = board.getVectorFeature(group, name)
  if (!targetPos) return

  let { dir: refForward, len: targetPosOffset } = normalize3({
    x: targetPos.x - refPosition.x,
    y: targetPos.y - refPosition.y,
    z: targetPos.z - refPosition.z,
    w: 0,
  })
  if (targetPosOffset < 1e-8) return

  let lookAtDir: SimVec4 = { ...dyn.currentLookAtDir }

  const zBuff = 1 - Math.abs(refForward.z)
  if (zBuff < STRAIGHT_UPDOWN_BLEND_OFF_BUFFER) {
    refForward = lerp(zBuff / STRAIGHT_UPDOWN_BLEND_OFF_BUFFER, PLAYER_FORWARD, refForward)
    refForward = normalize3(refForward).dir
  }

  refForward = {
    ...refForward,
    z: clamp(refForward.z, dyn.data.maxDownZValue, dyn.data.maxUpZValue),
  }
  lookAtDir = { ...lookAtDir, z: refForward.z }

  let refForwardXY = normalize3({
    x: refForward.x,
    y: refForward.y,
    z: 0,
    w: 0,
  }).dir

  const xyDot = PLAYER_FORWARD.x * refForwardXY.x + PLAYER_FORWARD.y * refForwardXY.y
  if (xyDot < dyn.data.maxYawCos) {
    if (xyDot < dyn.data.centerYawThresholdCos) {
      refForwardXY = { ...PLAYER_FORWARD }
    } else {
      const maxRotation =
        refForwardXY.x > 0 ? -dyn.data.maxYawRadians : dyn.data.maxYawRadians
      const maxDir = rotateAroundZ(PLAYER_FORWARD, maxRotation)
      refForwardXY = { x: maxDir.x, y: maxDir.y, z: 0, w: 0 }
    }
  }

  const lookAtDirXY = normalize3({
    x: lookAtDir.x,
    y: lookAtDir.y,
    z: 0,
    w: 0,
  }).dir

  const angleDiff = Math.acos(
    clamp(
      lookAtDirXY.x * refForwardXY.x + lookAtDirXY.y * refForwardXY.y,
      -1,
      1
    )
  )

  const blendSpeed =
    lerpScalar(angleDiff / ANGLE_DIFF_FOR_MAX, 0, dyn.data.maxRotateSpeed)
  let maxRotation = Math.PI * dyn.timeDelta * blendSpeed

  if (angleDiff < maxRotation) {
    lookAtDir = { x: refForwardXY.x, y: refForwardXY.y, z: lookAtDir.z, w: 0 }
  } else {
    const signLook = Math.sign(lookAtDirXY.x)
    const signRef = Math.sign(refForwardXY.x)
    if (signLook !== signRef) {
      if (lookAtDirXY.x < 0) maxRotation *= -1
    } else {
      const crossZ =
        lookAtDirXY.x * refForwardXY.y - lookAtDirXY.y * refForwardXY.x
      if (crossZ < 0) maxRotation *= -1
    }
    lookAtDir = rotateAroundZ(lookAtDir, maxRotation)
  }

  lookAtDir = normalize3(lookAtDir).dir
  dyn.currentLookAtDir = lookAtDir

  board.setVectorFeature(group, name, {
    x: refPosition.x + lookAtDir.x * targetPosOffset,
    y: refPosition.y + lookAtDir.y * targetPosOffset,
    z: refPosition.z + lookAtDir.z * targetPosOffset,
    w: 0,
  })
}

function lerpScalar(t: number, a: number, b: number): number {
  const u = clamp(t, 0, 1)
  return a + (b - a) * u
}

/** Reset look dir on activation (engine OnActivated). */
export function activateLookAtVehicleRestrictions(
  store: InstanceStore,
  handleId: string
): void {
  const dyn = ensureLookAtVehicleRestrictionsDyn(store, handleId)
  dyn.currentLookAtDir = { ...PLAYER_FORWARD }
}
