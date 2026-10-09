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

/** ParentConstraint Update snapshot (weight + optional offset links). */
export type ParentConstraintSnap = {
  weight: number
  hasOffsetT: boolean
  offsetT: BoneOpTranslateState
  hasOffsetE: boolean
  /** Raw vector link XYZ → engine EulerAngles(Y,X,Z)=(roll,pitch,yaw) */
  offsetE: BoneOpTranslateState
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
  /** ParentConstraint */
  parentConstraint: Map<string, ParentConstraintSnap>
  /** FloatTrackDirectConnConstraint / TransformToTrack weight+mul */
  floatTrackConn: Map<string, { weight: number; mulFactor: number }>
}

export function createBoneOpFrameCache(): BoneOpFrameCache {
  return {
    rotateAngleDeg: new Map(),
    rotateQuat: new Map(),
    translate: new Map(),
    positionMs: new Map(),
    orientationMs: new Map(),
    limitWeight: new Map(),
    parentConstraint: new Map(),
    floatTrackConn: new Map(),
  }
}

export function clearBoneOpFrameCache(cache: BoneOpFrameCache): void {
  cache.rotateAngleDeg.clear()
  cache.rotateQuat.clear()
  cache.translate.clear()
  cache.positionMs.clear()
  cache.orientationMs.clear()
  cache.limitWeight.clear()
  cache.parentConstraint.clear()
  cache.floatTrackConn.clear()
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

/** Float socket snapshot for MathExpressionPose (Update link values → Sample). */
export type MathExprPoseFloatSocketSnap = {
  varId: number
  variableName: string
  /** NamedTrackIndex.name for inputFloatTrack (empty = link only) */
  inputTrackName: string
  linkValue: number
}

/** Vector socket snapshot (e.g. `$position` from VectorInput). */
export type MathExprPoseVectorSocketSnap = {
  varId: number
  variableName: string
  linkValue: { x: number; y: number; z: number; w: number }
}

/** Quaternion socket snapshot (e.g. `#quaternion` from QuaternionInput). */
export type MathExprPoseQuatSocketSnap = {
  varId: number
  variableName: string
  linkValue: { x: number; y: number; z: number; w: number }
}

/** Per-frame MathExpressionPose link cache (handleId → sockets). */
export type MathExprPoseFrameCache = {
  floatSockets: Map<string, MathExprPoseFloatSocketSnap[]>
  vectorSockets: Map<string, MathExprPoseVectorSocketSnap[]>
  quatSockets: Map<string, MathExprPoseQuatSocketSnap[]>
}

export function createMathExprPoseFrameCache(): MathExprPoseFrameCache {
  return {
    floatSockets: new Map(),
    vectorSockets: new Map(),
    quatSockets: new Map(),
  }
}

export function clearMathExprPoseFrameCache(cache: MathExprPoseFrameCache): void {
  cache.floatSockets.clear()
  cache.vectorSockets.clear()
  cache.quatSockets.clear()
}
