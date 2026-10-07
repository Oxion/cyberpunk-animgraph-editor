/**
 * Incremental state for RotateBone / RotateBoneByQuaternion / TranslateBone.
 * Cleared on bind/reset; dropped when node not updated (like floatDyn).
 */

export type BoneOpRotateState = {
  angleDeg: number
}

export type BoneOpQuatState = {
  x: number
  y: number
  z: number
  w: number
}

export type BoneOpTranslateState = {
  x: number
  y: number
  z: number
}

/** Per-frame values computed in Update, consumed in Sample. */
export type BoneOpFrameCache = {
  /** RotateBone: angle degrees after scale/bias/clamp */
  rotateAngleDeg: Map<string, number>
  /** RotateBoneByQuaternion */
  rotateQuat: Map<string, BoneOpQuatState>
  /** TranslateBone: translation to add in LS */
  translate: Map<string, BoneOpTranslateState>
  /** SetBonePosition: absolute MS translation */
  positionMs: Map<string, BoneOpTranslateState>
  /** SetBoneOrientation: absolute MS rotation */
  orientationMs: Map<string, BoneOpQuatState>
  /** RotationLimit weight (0..1) */
  limitWeight: Map<string, number>
}

export function createBoneOpFrameCache(): BoneOpFrameCache {
  return {
    rotateAngleDeg: new Map(),
    rotateQuat: new Map(),
    translate: new Map(),
    positionMs: new Map(),
    orientationMs: new Map(),
    limitWeight: new Map(),
  }
}

export function clearBoneOpFrameCache(cache: BoneOpFrameCache): void {
  cache.rotateAngleDeg.clear()
  cache.rotateQuat.clear()
  cache.translate.clear()
  cache.positionMs.clear()
  cache.orientationMs.clear()
  cache.limitWeight.clear()
}

export const IDENTITY_QUAT_STATE: BoneOpQuatState = { x: 0, y: 0, z: 0, w: 1 }

export function nlerpQuatState(
  a: BoneOpQuatState,
  b: BoneOpQuatState,
  t: number
): BoneOpQuatState {
  let bx = b.x
  let by = b.y
  let bz = b.z
  let bw = b.w
  if (a.x * bx + a.y * by + a.z * bz + a.w * bw < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  const x = a.x + (bx - a.x) * t
  const y = a.y + (by - a.y) * t
  const z = a.z + (bz - a.z) * t
  const w = a.w + (bw - a.w) * t
  const len = Math.hypot(x, y, z, w) || 1
  return { x: x / len, y: y / len, z: z / len, w: w / len }
}

export function mulQuatState(a: BoneOpQuatState, b: BoneOpQuatState): BoneOpQuatState {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}
