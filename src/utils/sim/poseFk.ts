/**
 * Local→model-space FK for offline Sample (stack snap/offset).
 * Unified index: [0..boneCount) rig, [boneCount..boneCount+stackCount) stack.
 */

import type { RigEntry } from './rigResource'
import { mulQuat, readTrackValue, writeTrackValue, type Pose } from './pose'

export type Qs = {
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

export const IDENTITY_QS: Qs = {
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

export function readBoneLs(pose: Pose, unified: number, out: Qs = { ...IDENTITY_QS }): boolean {
  return readLs(pose, unified, out)
}

export function writeBoneLs(pose: Pose, unified: number, qs: Qs): void {
  writeLs(pose, unified, qs)
}

/** Resolve bone or stack slot by name (case-insensitive). -1 if missing. */
export function resolveUnifiedName(pose: Pose, rig: RigEntry, name: string): number {
  if (!name || name === 'None') return -1
  const key = name.toLowerCase()
  const bi = rig.boneIndexByName.get(key)
  if (bi !== undefined) return bi
  for (let i = 0; i < pose.stackCount; i++) {
    if ((pose.stackNames[i] ?? '').toLowerCase() === key) return pose.boneCount + i
  }
  return -1
}

export function parentUnifiedOf(pose: Pose, rig: RigEntry, unified: number): number {
  return parentOf(pose, rig, unified)
}

function readLs(pose: Pose, unified: number, out: Qs): boolean {
  if (unified < 0) return false
  if (unified < pose.boneCount) {
    const ti = unified * 3
    const ri = unified * 4
    out.tx = pose.translation[ti]!
    out.ty = pose.translation[ti + 1]!
    out.tz = pose.translation[ti + 2]!
    out.qx = pose.rotation[ri]!
    out.qy = pose.rotation[ri + 1]!
    out.qz = pose.rotation[ri + 2]!
    out.qw = pose.rotation[ri + 3]!
    out.sx = pose.scale[ti]!
    out.sy = pose.scale[ti + 1]!
    out.sz = pose.scale[ti + 2]!
    return true
  }
  const si = unified - pose.boneCount
  if (si < 0 || si >= pose.stackCount) return false
  const ti = si * 3
  const ri = si * 4
  out.tx = pose.stackTranslation[ti]!
  out.ty = pose.stackTranslation[ti + 1]!
  out.tz = pose.stackTranslation[ti + 2]!
  out.qx = pose.stackRotation[ri]!
  out.qy = pose.stackRotation[ri + 1]!
  out.qz = pose.stackRotation[ri + 2]!
  out.qw = pose.stackRotation[ri + 3]!
  out.sx = pose.stackScale[ti]!
  out.sy = pose.stackScale[ti + 1]!
  out.sz = pose.stackScale[ti + 2]!
  return true
}

function writeLs(pose: Pose, unified: number, qs: Qs): void {
  if (unified < 0) return
  if (unified < pose.boneCount) {
    const ti = unified * 3
    const ri = unified * 4
    pose.translation[ti] = qs.tx
    pose.translation[ti + 1] = qs.ty
    pose.translation[ti + 2] = qs.tz
    pose.rotation[ri] = qs.qx
    pose.rotation[ri + 1] = qs.qy
    pose.rotation[ri + 2] = qs.qz
    pose.rotation[ri + 3] = qs.qw
    pose.scale[ti] = qs.sx
    pose.scale[ti + 1] = qs.sy
    pose.scale[ti + 2] = qs.sz
    return
  }
  const si = unified - pose.boneCount
  if (si < 0 || si >= pose.stackCount) return
  const ti = si * 3
  const ri = si * 4
  pose.stackTranslation[ti] = qs.tx
  pose.stackTranslation[ti + 1] = qs.ty
  pose.stackTranslation[ti + 2] = qs.tz
  pose.stackRotation[ri] = qs.qx
  pose.stackRotation[ri + 1] = qs.qy
  pose.stackRotation[ri + 2] = qs.qz
  pose.stackRotation[ri + 3] = qs.qw
  pose.stackScale[ti] = qs.sx
  pose.stackScale[ti + 1] = qs.sy
  pose.stackScale[ti + 2] = qs.sz
}

function parentOf(pose: Pose, rig: RigEntry, unified: number): number {
  if (unified < 0) return -1
  if (unified < pose.boneCount) {
    const p = rig.boneParents[unified]
    return typeof p === 'number' && p >= 0 ? p : -1
  }
  const si = unified - pose.boneCount
  if (si < 0 || si >= pose.stackCount) return -1
  return pose.stackParents[si] ?? -1
}

const scratchQa = new Float32Array(4)
const scratchQb = new Float32Array(4)
const scratchQ = new Float32Array(4)
const scratchParent = { ...IDENTITY_QS }
const scratchLocal = { ...IDENTITY_QS }
const scratchMs = { ...IDENTITY_QS }
const scratchInv = { ...IDENTITY_QS }
const scratchSnap = { ...IDENTITY_QS }

/** parentMs * local → childMs (translation + rotation; scale approx mul). */
function mulQs(parent: Qs, local: Qs, out: Qs): void {
  const qx = parent.qx,
    qy = parent.qy,
    qz = parent.qz,
    qw = parent.qw
  const lx = local.tx * parent.sx
  const ly = local.ty * parent.sy
  const lz = local.tz * parent.sz
  const ix = qw * lx + qy * lz - qz * ly
  const iy = qw * ly + qz * lx - qx * lz
  const iz = qw * lz + qx * ly - qy * lx
  const iw = -qx * lx - qy * ly - qz * lz
  out.tx = parent.tx + (ix * qw + iw * -qx + iy * -qz - iz * -qy)
  out.ty = parent.ty + (iy * qw + iw * -qy + iz * -qx - ix * -qz)
  out.tz = parent.tz + (iz * qw + iw * -qz + ix * -qy - iy * -qx)
  scratchQa[0] = qx
  scratchQa[1] = qy
  scratchQa[2] = qz
  scratchQa[3] = qw
  scratchQb[0] = local.qx
  scratchQb[1] = local.qy
  scratchQb[2] = local.qz
  scratchQb[3] = local.qw
  mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
  out.qx = scratchQ[0]!
  out.qy = scratchQ[1]!
  out.qz = scratchQ[2]!
  out.qw = scratchQ[3]!
  out.sx = parent.sx * local.sx
  out.sy = parent.sy * local.sy
  out.sz = parent.sz * local.sz
}

/** Inverse of MS (rotation conjugate, translation -R^T t). Scale 1/s approx. */
function invertQs(m: Qs, out: Qs): void {
  const qx = -m.qx,
    qy = -m.qy,
    qz = -m.qz,
    qw = m.qw
  const sx = m.sx !== 0 ? 1 / m.sx : 1
  const sy = m.sy !== 0 ? 1 / m.sy : 1
  const sz = m.sz !== 0 ? 1 / m.sz : 1
  // -R^T * t
  const lx = -m.tx
  const ly = -m.ty
  const lz = -m.tz
  const ix = qw * lx + qy * lz - qz * ly
  const iy = qw * ly + qz * lx - qx * lz
  const iz = qw * lz + qx * ly - qy * lx
  const iw = -qx * lx - qy * ly - qz * lz
  out.tx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * sx
  out.ty = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * sy
  out.tz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * sz
  out.qx = qx
  out.qy = qy
  out.qz = qz
  out.qw = qw
  out.sx = sx
  out.sy = sy
  out.sz = sz
}

/** inv(parentMs) * childMs → local */
function mulInverseMul(parentMs: Qs, childMs: Qs, out: Qs): void {
  invertQs(parentMs, scratchInv)
  mulQs(scratchInv, childMs, out)
}

/**
 * Model-space transform for unified bone index.
 * Walks parent chain (depth-limited).
 */
export function getTransformMs(
  pose: Pose,
  rig: RigEntry,
  unified: number,
  out: Qs = { ...IDENTITY_QS }
): boolean {
  if (unified < 0) {
    Object.assign(out, IDENTITY_QS)
    return false
  }
  const chain: number[] = []
  let cur = unified
  let guard = 0
  while (cur >= 0 && guard++ < 256) {
    chain.push(cur)
    cur = parentOf(pose, rig, cur)
  }
  Object.assign(out, IDENTITY_QS)
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!readLs(pose, chain[i]!, scratchLocal)) return false
    mulQs(out, scratchLocal, scratchMs)
    Object.assign(out, scratchMs)
  }
  return true
}

export type SnapMethod = 'NoSnapping' | 'WholeTransform' | 'TranslationOnly' | 'RotationOnly'

/**
 * Snap stack bone (unified index) toward snapTarget unified index.
 * Engine SnapBone — MS of target → local via parent MS.
 */
export function snapBoneToTarget(
  pose: Pose,
  rig: RigEntry,
  stackUnified: number,
  snapTargetUnified: number,
  method: SnapMethod,
  snapToReference: boolean
): void {
  if (method === 'NoSnapping' || snapTargetUnified < 0) return
  let targetMs: Qs
  if (snapToReference && snapTargetUnified < pose.boneCount) {
    // Reference MS from A-pose LS chain
    targetMs = { ...IDENTITY_QS }
    // Build temp: use ref LS on base bones only for this bone's chain
    const chain: number[] = []
    let cur = snapTargetUnified
    let g = 0
    while (cur >= 0 && cur < pose.boneCount && g++ < 256) {
      chain.push(cur)
      cur = rig.boneParents[cur] ?? -1
    }
    Object.assign(targetMs, IDENTITY_QS)
    for (let i = chain.length - 1; i >= 0; i--) {
      const bi = chain[i]!
      const ti = bi * 3
      const ri = bi * 4
      scratchLocal.tx = rig.refTranslation[ti]!
      scratchLocal.ty = rig.refTranslation[ti + 1]!
      scratchLocal.tz = rig.refTranslation[ti + 2]!
      scratchLocal.qx = rig.refRotation[ri]!
      scratchLocal.qy = rig.refRotation[ri + 1]!
      scratchLocal.qz = rig.refRotation[ri + 2]!
      scratchLocal.qw = rig.refRotation[ri + 3]!
      scratchLocal.sx = rig.refScale[ti]!
      scratchLocal.sy = rig.refScale[ti + 1]!
      scratchLocal.sz = rig.refScale[ti + 2]!
      mulQs(targetMs, scratchLocal, scratchMs)
      Object.assign(targetMs, scratchMs)
    }
  } else {
    if (!getTransformMs(pose, rig, snapTargetUnified, scratchSnap)) return
    targetMs = { ...scratchSnap }
  }

  const parentIdx = parentOf(pose, rig, stackUnified)
  let snapLocal: Qs
  if (parentIdx >= 0) {
    if (!getTransformMs(pose, rig, parentIdx, scratchParent)) return
    snapLocal = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, targetMs, snapLocal)
  } else {
    snapLocal = { ...targetMs }
  }

  if (!readLs(pose, stackUnified, scratchLocal)) return
  if (method === 'WholeTransform') {
    writeLs(pose, stackUnified, snapLocal)
  } else if (method === 'TranslationOnly') {
    scratchLocal.tx = snapLocal.tx
    scratchLocal.ty = snapLocal.ty
    scratchLocal.tz = snapLocal.tz
    writeLs(pose, stackUnified, scratchLocal)
  } else if (method === 'RotationOnly') {
    scratchLocal.qx = snapLocal.qx
    scratchLocal.qy = snapLocal.qy
    scratchLocal.qz = snapLocal.qz
    scratchLocal.qw = snapLocal.qw
    writeLs(pose, stackUnified, scratchLocal)
  }
}

/**
 * Apply QsTransform offset in offset-space bone MS, write LS back (engine OffsetBone subset).
 */
export function offsetBoneInSpace(
  pose: Pose,
  rig: RigEntry,
  stackUnified: number,
  offsetSpaceUnified: number,
  offset: Qs,
  offsetToReference: boolean
): void {
  if (offsetSpaceUnified < 0) return
  let offsetSpaceMs: Qs
  if (offsetToReference && offsetSpaceUnified < pose.boneCount) {
    // Reuse snap reference path for a single bone MS from ref
    const tmpPose = pose // getTransformMs uses pose LS; for reference rebuild via rig refs:
    offsetSpaceMs = { ...IDENTITY_QS }
    const chain: number[] = []
    let cur = offsetSpaceUnified
    let g = 0
    while (cur >= 0 && cur < pose.boneCount && g++ < 256) {
      chain.push(cur)
      cur = rig.boneParents[cur] ?? -1
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const bi = chain[i]!
      const ti = bi * 3
      const ri = bi * 4
      scratchLocal.tx = rig.refTranslation[ti]!
      scratchLocal.ty = rig.refTranslation[ti + 1]!
      scratchLocal.tz = rig.refTranslation[ti + 2]!
      scratchLocal.qx = rig.refRotation[ri]!
      scratchLocal.qy = rig.refRotation[ri + 1]!
      scratchLocal.qz = rig.refRotation[ri + 2]!
      scratchLocal.qw = rig.refRotation[ri + 3]!
      scratchLocal.sx = rig.refScale[ti]!
      scratchLocal.sy = rig.refScale[ti + 1]!
      scratchLocal.sz = rig.refScale[ti + 2]!
      mulQs(offsetSpaceMs, scratchLocal, scratchMs)
      Object.assign(offsetSpaceMs, scratchMs)
    }
    void tmpPose
  } else {
    if (!getTransformMs(pose, rig, offsetSpaceUnified, scratchSnap)) return
    offsetSpaceMs = { ...scratchSnap }
  }

  if (!getTransformMs(pose, rig, stackUnified, scratchMs)) return
  const currentMs = { ...scratchMs }
  // current in offset space
  const currentOffsetSpace = { ...IDENTITY_QS }
  mulInverseMul(offsetSpaceMs, currentMs, currentOffsetSpace)

  // Apply offset translation in offset space
  const withT = { ...IDENTITY_QS }
  mulQs(
    { ...IDENTITY_QS, tx: offset.tx, ty: offset.ty, tz: offset.tz },
    currentOffsetSpace,
    withT
  )
  // Apply offset rot/scale without translation
  const rotScaleOffset: Qs = {
    tx: 0,
    ty: 0,
    tz: 0,
    qx: offset.qx,
    qy: offset.qy,
    qz: offset.qz,
    qw: offset.qw,
    sx: offset.sx,
    sy: offset.sy,
    sz: offset.sz,
  }
  const currentNoT = { ...currentOffsetSpace, tx: 0, ty: 0, tz: 0 }
  const withRs = { ...IDENTITY_QS }
  mulQs(rotScaleOffset, currentNoT, withRs)

  const combined: Qs = {
    tx: withT.tx,
    ty: withT.ty,
    tz: withT.tz,
    qx: withRs.qx,
    qy: withRs.qy,
    qz: withRs.qz,
    qw: withRs.qw,
    sx: withRs.sx,
    sy: withRs.sy,
    sz: withRs.sz,
  }

  const appliedMs = { ...IDENTITY_QS }
  mulQs(offsetSpaceMs, combined, appliedMs)

  const parentIdx = parentOf(pose, rig, stackUnified)
  if (parentIdx >= 0) {
    if (!getTransformMs(pose, rig, parentIdx, scratchParent)) return
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, appliedMs, local)
    writeLs(pose, stackUnified, local)
  } else {
    writeLs(pose, stackUnified, appliedMs)
  }
}

export function parseSnapMethod(raw: unknown): SnapMethod {
  const s = typeof raw === 'string' ? raw : String((raw as { $value?: unknown })?.$value ?? '')
  if (s === 'WholeTransform' || s === 'TranslationOnly' || s === 'RotationOnly') return s
  return 'NoSnapping'
}

/** Set bone translation in model space; keep LS rotation/scale. */
export function setBoneTranslationMs(
  pose: Pose,
  rig: RigEntry,
  unified: number,
  tx: number,
  ty: number,
  tz: number
): void {
  if (unified < 0) return
  if (!getTransformMs(pose, rig, unified, scratchMs)) return
  scratchMs.tx = tx
  scratchMs.ty = ty
  scratchMs.tz = tz
  const parentIdx = parentOf(pose, rig, unified)
  if (parentIdx >= 0) {
    if (!getTransformMs(pose, rig, parentIdx, scratchParent)) return
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, scratchMs, local)
    if (!readLs(pose, unified, scratchLocal)) return
    scratchLocal.tx = local.tx
    scratchLocal.ty = local.ty
    scratchLocal.tz = local.tz
    writeLs(pose, unified, scratchLocal)
  } else {
    if (!readLs(pose, unified, scratchLocal)) return
    scratchLocal.tx = tx
    scratchLocal.ty = ty
    scratchLocal.tz = tz
    writeLs(pose, unified, scratchLocal)
  }
}

/** Set bone rotation in model space; keep LS translation/scale. */
export function setBoneRotationMs(
  pose: Pose,
  rig: RigEntry,
  unified: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number
): void {
  if (unified < 0) return
  if (!getTransformMs(pose, rig, unified, scratchMs)) return
  scratchMs.qx = qx
  scratchMs.qy = qy
  scratchMs.qz = qz
  scratchMs.qw = qw
  const parentIdx = parentOf(pose, rig, unified)
  if (parentIdx >= 0) {
    if (!getTransformMs(pose, rig, parentIdx, scratchParent)) return
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, scratchMs, local)
    if (!readLs(pose, unified, scratchLocal)) return
    scratchLocal.qx = local.qx
    scratchLocal.qy = local.qy
    scratchLocal.qz = local.qz
    scratchLocal.qw = local.qw
    writeLs(pose, unified, scratchLocal)
  } else {
    if (!readLs(pose, unified, scratchLocal)) return
    scratchLocal.qx = qx
    scratchLocal.qy = qy
    scratchLocal.qz = qz
    scratchLocal.qw = qw
    writeLs(pose, unified, scratchLocal)
  }
}

export type TransformAxis = 'X_Axis' | 'Y_Axis' | 'Z_Axis'

export function parseTransformAxis(raw: unknown): TransformAxis {
  const s = String(raw ?? 'X_Axis')
  if (s.includes('Y')) return 'Y_Axis'
  if (s.includes('Z')) return 'Z_Axis'
  return 'X_Axis'
}

/** AnimNode_RotateBone OnSample — angleDeg around axis, LS or MS. */
export function rotateBoneByAngle(
  pose: Pose,
  rig: RigEntry,
  unified: number,
  axis: TransformAxis,
  angleDeg: number,
  inModelSpace: boolean
): void {
  if (unified < 0 || !Number.isFinite(angleDeg) || Math.abs(angleDeg) < 1e-8) return
  const half = (angleDeg * Math.PI) / 180 / 2
  const imag = Math.sin(half)
  const real = Math.cos(half)
  const dx = axis === 'X_Axis' ? imag : 0
  const dy = axis === 'Y_Axis' ? imag : 0
  const dz = axis === 'Z_Axis' ? imag : 0
  if (!readLs(pose, unified, scratchLocal)) return
  if (!inModelSpace) {
    scratchQa[0] = scratchLocal.qx
    scratchQa[1] = scratchLocal.qy
    scratchQa[2] = scratchLocal.qz
    scratchQa[3] = scratchLocal.qw
    scratchQb[0] = dx
    scratchQb[1] = dy
    scratchQb[2] = dz
    scratchQb[3] = real
    mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
    scratchLocal.qx = scratchQ[0]!
    scratchLocal.qy = scratchQ[1]!
    scratchLocal.qz = scratchQ[2]!
    scratchLocal.qw = scratchQ[3]!
    writeLs(pose, unified, scratchLocal)
    return
  }
  // MS: rot = inv(parentR) * delta * boneMsR
  if (!getTransformMs(pose, rig, unified, scratchMs)) return
  const parentIdx = parentOf(pose, rig, unified)
  let pqx = 0
  let pqy = 0
  let pqz = 0
  let pqw = 1
  if (parentIdx >= 0) {
    if (!getTransformMs(pose, rig, parentIdx, scratchParent)) return
    pqx = scratchParent.qx
    pqy = scratchParent.qy
    pqz = scratchParent.qz
    pqw = scratchParent.qw
  }
  // delta * boneMsR
  scratchQa[0] = dx
  scratchQa[1] = dy
  scratchQa[2] = dz
  scratchQa[3] = real
  scratchQb[0] = scratchMs.qx
  scratchQb[1] = scratchMs.qy
  scratchQb[2] = scratchMs.qz
  scratchQb[3] = scratchMs.qw
  mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
  // conj(parentR) * that
  scratchQa[0] = -pqx
  scratchQa[1] = -pqy
  scratchQa[2] = -pqz
  scratchQa[3] = pqw
  scratchQb[0] = scratchQ[0]!
  scratchQb[1] = scratchQ[1]!
  scratchQb[2] = scratchQ[2]!
  scratchQb[3] = scratchQ[3]!
  mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
  scratchLocal.qx = scratchQ[0]!
  scratchLocal.qy = scratchQ[1]!
  scratchLocal.qz = scratchQ[2]!
  scratchLocal.qw = scratchQ[3]!
  writeLs(pose, unified, scratchLocal)
}

/** RotateBoneByQuaternion: LS R *= q */
export function rotateBoneByQuaternion(
  pose: Pose,
  unified: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number
): void {
  if (unified < 0) return
  if (!readLs(pose, unified, scratchLocal)) return
  scratchQa[0] = scratchLocal.qx
  scratchQa[1] = scratchLocal.qy
  scratchQa[2] = scratchLocal.qz
  scratchQa[3] = scratchLocal.qw
  scratchQb[0] = qx
  scratchQb[1] = qy
  scratchQb[2] = qz
  scratchQb[3] = qw
  mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
  scratchLocal.qx = scratchQ[0]!
  scratchLocal.qy = scratchQ[1]!
  scratchLocal.qz = scratchQ[2]!
  scratchLocal.qw = scratchQ[3]!
  writeLs(pose, unified, scratchLocal)
}

/** TranslateBone: LS T += delta */
export function translateBoneLocal(
  pose: Pose,
  unified: number,
  dx: number,
  dy: number,
  dz: number
): void {
  if (unified < 0) return
  if (!readLs(pose, unified, scratchLocal)) return
  scratchLocal.tx += dx
  scratchLocal.ty += dy
  scratchLocal.tz += dz
  writeLs(pose, unified, scratchLocal)
}

/**
 * Quat → euler degrees. Engine RotationLimit: X=Pitch, Y=Roll, Z=Yaw (ZYX extract).
 */
export function quatToEulerDeg(qx: number, qy: number, qz: number, qw: number): {
  pitch: number
  roll: number
  yaw: number
} {
  const sinr = 2 * (qw * qy - qz * qx)
  const roll = (Math.asin(Math.min(1, Math.max(-1, sinr))) * 180) / Math.PI
  const sinp = 2 * (qw * qx + qy * qz)
  const cosp = 1 - 2 * (qx * qx + qy * qy)
  const pitch = (Math.atan2(sinp, cosp) * 180) / Math.PI
  const siny = 2 * (qw * qz + qx * qy)
  const cosy = 1 - 2 * (qy * qy + qz * qz)
  const yaw = (Math.atan2(siny, cosy) * 180) / Math.PI
  return { pitch, roll, yaw }
}

/** Euler deg (pitch=X, roll=Y, yaw=Z) → quat. */
export function eulerDegToQuat(
  pitch: number,
  roll: number,
  yaw: number
): { qx: number; qy: number; qz: number; qw: number } {
  const hx = ((pitch * Math.PI) / 180) * 0.5
  const hy = ((roll * Math.PI) / 180) * 0.5
  const hz = ((yaw * Math.PI) / 180) * 0.5
  const cx = Math.cos(hx)
  const sx = Math.sin(hx)
  const cy = Math.cos(hy)
  const sy = Math.sin(hy)
  const cz = Math.cos(hz)
  const sz = Math.sin(hz)
  return {
    qx: sx * cy * cz - cx * sy * sz,
    qy: cx * sy * cz + sx * cy * sz,
    qz: cx * cy * sz - sx * sy * cz,
    qw: cx * cy * cz + sx * sy * sz,
  }
}

export function clampFloat(
  v: number,
  useMin: boolean,
  min: number,
  useMax: boolean,
  max: number
): number {
  let out = v
  if (useMin && out < min) out = min
  if (useMax && out > max) out = max
  return out
}

/** Soft clamp: hard bounds + optional ease (simplified: hard clamp if no curve). */
export function smoothClampFloat(
  v: number,
  min: number,
  max: number,
  _marginEaseOutCurve: unknown
): number {
  void _marginEaseOutCurve
  if (v < min) return min
  if (v > max) return max
  return v
}

export function applyRotationLimitLs(
  pose: Pose,
  unified: number,
  limitX: { min: number; max: number; curve?: unknown },
  limitY: { min: number; max: number; curve?: unknown },
  limitZ: { min: number; max: number; curve?: unknown },
  weight: number
): void {
  if (unified < 0 || !(weight > 0)) return
  if (!readLs(pose, unified, scratchLocal)) return
  const e = quatToEulerDeg(scratchLocal.qx, scratchLocal.qy, scratchLocal.qz, scratchLocal.qw)
  const pitch = smoothClampFloat(e.pitch, limitX.min, limitX.max, limitX.curve)
  const roll = smoothClampFloat(e.roll, limitY.min, limitY.max, limitY.curve)
  const yaw = smoothClampFloat(e.yaw, limitZ.min, limitZ.max, limitZ.curve)
  const q = eulerDegToQuat(pitch, roll, yaw)
  if (weight >= 1 - 1e-4) {
    scratchLocal.qx = q.qx
    scratchLocal.qy = q.qy
    scratchLocal.qz = q.qz
    scratchLocal.qw = q.qw
  } else {
    scratchQa[0] = scratchLocal.qx
    scratchQa[1] = scratchLocal.qy
    scratchQa[2] = scratchLocal.qz
    scratchQa[3] = scratchLocal.qw
    scratchQb[0] = q.qx
    scratchQb[1] = q.qy
    scratchQb[2] = q.qz
    scratchQb[3] = q.qw
    // nlerp toward limited
    let bx = scratchQb[0]!
    let by = scratchQb[1]!
    let bz = scratchQb[2]!
    let bw = scratchQb[3]!
    if (
      scratchQa[0]! * bx + scratchQa[1]! * by + scratchQa[2]! * bz + scratchQa[3]! * bw <
      0
    ) {
      bx = -bx
      by = -by
      bz = -bz
      bw = -bw
    }
    const x = scratchQa[0]! + (bx - scratchQa[0]!) * weight
    const y = scratchQa[1]! + (by - scratchQa[1]!) * weight
    const z = scratchQa[2]! + (bz - scratchQa[2]!) * weight
    const w = scratchQa[3]! + (bw - scratchQa[3]!) * weight
    const len = Math.hypot(x, y, z, w) || 1
    scratchLocal.qx = x / len
    scratchLocal.qy = y / len
    scratchLocal.qz = z / len
    scratchLocal.qw = w / len
  }
  writeLs(pose, unified, scratchLocal)
}

/** Clamp LS translation in parent space (or current LS if parent empty). */
export function applyTranslationLimit(
  pose: Pose,
  rig: RigEntry,
  constrainedUnified: number,
  parentUnified: number,
  limitX: { useMin: boolean; min: number; useMax: boolean; max: number },
  limitY: { useMin: boolean; min: number; useMax: boolean; max: number },
  limitZ: { useMin: boolean; min: number; useMax: boolean; max: number }
): void {
  if (constrainedUnified < 0) return
  if (parentUnified < 0) {
    if (!readLs(pose, constrainedUnified, scratchLocal)) return
    scratchLocal.tx = clampFloat(
      scratchLocal.tx,
      limitX.useMin,
      limitX.min,
      limitX.useMax,
      limitX.max
    )
    scratchLocal.ty = clampFloat(
      scratchLocal.ty,
      limitY.useMin,
      limitY.min,
      limitY.useMax,
      limitY.max
    )
    scratchLocal.tz = clampFloat(
      scratchLocal.tz,
      limitZ.useMin,
      limitZ.min,
      limitZ.useMax,
      limitZ.max
    )
    writeLs(pose, constrainedUnified, scratchLocal)
    return
  }
  if (!getTransformMs(pose, rig, constrainedUnified, scratchMs)) return
  if (!getTransformMs(pose, rig, parentUnified, scratchParent)) return
  const localInParent = { ...IDENTITY_QS }
  mulInverseMul(scratchParent, scratchMs, localInParent)
  localInParent.tx = clampFloat(
    localInParent.tx,
    limitX.useMin,
    limitX.min,
    limitX.useMax,
    limitX.max
  )
  localInParent.ty = clampFloat(
    localInParent.ty,
    limitY.useMin,
    limitY.min,
    limitY.useMax,
    limitY.max
  )
  localInParent.tz = clampFloat(
    localInParent.tz,
    limitZ.useMin,
    limitZ.min,
    limitZ.useMax,
    limitZ.max
  )
  const appliedMs = { ...IDENTITY_QS }
  mulQs(scratchParent, localInParent, appliedMs)
  const rigParent = parentOf(pose, rig, constrainedUnified)
  if (rigParent >= 0) {
    if (!getTransformMs(pose, rig, rigParent, scratchSnap)) return
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchSnap, appliedMs, local)
    writeLs(pose, constrainedUnified, local)
  } else {
    writeLs(pose, constrainedUnified, appliedMs)
  }
}

export type TransformChannel =
  | 'PosX'
  | 'PosY'
  | 'PosZ'
  | 'RotX'
  | 'RotY'
  | 'RotZ'
  | 'ScaleX'
  | 'ScaleY'
  | 'ScaleZ'

export function parseTransformChannel(raw: unknown): TransformChannel {
  const s = String(raw ?? 'PosX')
  const known: TransformChannel[] = [
    'PosX',
    'PosY',
    'PosZ',
    'RotX',
    'RotY',
    'RotZ',
    'ScaleX',
    'ScaleY',
    'ScaleZ',
  ]
  for (const k of known) {
    if (s === k || s.endsWith(k) || s.includes(k)) return k
  }
  return 'PosX'
}

/** Read one LS channel (RotX/Y/Z → Pitch/Roll/Yaw deg). */
export function extractTransformChannel(
  pose: Pose,
  unified: number,
  channel: TransformChannel
): number | null {
  if (unified < 0) return null
  if (!readLs(pose, unified, scratchLocal)) return null
  if (channel === 'PosX') return scratchLocal.tx
  if (channel === 'PosY') return scratchLocal.ty
  if (channel === 'PosZ') return scratchLocal.tz
  if (channel === 'ScaleX') return scratchLocal.sx
  if (channel === 'ScaleY') return scratchLocal.sy
  if (channel === 'ScaleZ') return scratchLocal.sz
  const e = quatToEulerDeg(scratchLocal.qx, scratchLocal.qy, scratchLocal.qz, scratchLocal.qw)
  if (channel === 'RotX') return e.pitch
  if (channel === 'RotY') return e.roll
  return e.yaw
}

/**
 * Engine AnimNode_TransformToTrack::OnSample —
 * LS channel × mul → track; Lerp(weight, currentTrack, value).
 */
export function applyTransformToTrack(
  pose: Pose,
  transformUnified: number,
  trackUnified: number,
  channel: TransformChannel,
  mulFactor: number,
  weight: number
): void {
  if (transformUnified < 0 || trackUnified < 0 || !(weight > 0)) return
  const extracted = extractTransformChannel(pose, transformUnified, channel)
  if (extracted == null) return
  const target = extracted * mulFactor
  const cur = readTrackValue(pose, trackUnified)
  writeTrackValue(pose, trackUnified, weight >= 1 - 1e-6 ? target : cur + (target - cur) * weight)
}

/**
 * Engine AnimNode_FloatTrackDirectConnConstraint::OnSample —
 * write track×mul into LS channel; Slerp toward result by weight.
 * RotX/Y/Z → Pitch/Roll/Yaw (engine Quaternion::ToEulerAngles mapping).
 */
export function applyFloatTrackDirectConn(
  pose: Pose,
  unified: number,
  channel: TransformChannel,
  floatTrack: number,
  weight: number
): void {
  if (unified < 0 || !(weight > 0)) return
  if (!readLs(pose, unified, scratchLocal)) return
  const target: Qs = { ...scratchLocal }
  const v = floatTrack

  if (channel === 'PosX') target.tx = v
  else if (channel === 'PosY') target.ty = v
  else if (channel === 'PosZ') target.tz = v
  else if (channel === 'ScaleX') target.sx = v
  else if (channel === 'ScaleY') target.sy = v
  else if (channel === 'ScaleZ') target.sz = v
  else if (channel === 'RotX' || channel === 'RotY' || channel === 'RotZ') {
    const e = quatToEulerDeg(target.qx, target.qy, target.qz, target.qw)
    if (channel === 'RotX') e.pitch = v
    else if (channel === 'RotY') e.roll = v
    else e.yaw = v
    const q = eulerDegToQuat(e.pitch, e.roll, e.yaw)
    target.qx = q.qx
    target.qy = q.qy
    target.qz = q.qz
    target.qw = q.qw
  }

  if (weight >= 1 - 1e-6) {
    writeLs(pose, unified, target)
    return
  }

  // QsTransform::Slerp(current, target, weight)
  const t = weight
  scratchLocal.tx = scratchLocal.tx + (target.tx - scratchLocal.tx) * t
  scratchLocal.ty = scratchLocal.ty + (target.ty - scratchLocal.ty) * t
  scratchLocal.tz = scratchLocal.tz + (target.tz - scratchLocal.tz) * t
  scratchLocal.sx = scratchLocal.sx + (target.sx - scratchLocal.sx) * t
  scratchLocal.sy = scratchLocal.sy + (target.sy - scratchLocal.sy) * t
  scratchLocal.sz = scratchLocal.sz + (target.sz - scratchLocal.sz) * t
  scratchQa[0] = scratchLocal.qx
  scratchQa[1] = scratchLocal.qy
  scratchQa[2] = scratchLocal.qz
  scratchQa[3] = scratchLocal.qw
  scratchQb[0] = target.qx
  scratchQb[1] = target.qy
  scratchQb[2] = target.qz
  scratchQb[3] = target.qw
  let bx = scratchQb[0]!
  let by = scratchQb[1]!
  let bz = scratchQb[2]!
  let bw = scratchQb[3]!
  if (
    scratchQa[0]! * bx + scratchQa[1]! * by + scratchQa[2]! * bz + scratchQa[3]! * bw <
    0
  ) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  const u = 1 - t
  let qx = scratchQa[0]! * u + bx * t
  let qy = scratchQa[1]! * u + by * t
  let qz = scratchQa[2]! * u + bz * t
  let qw = scratchQa[3]! * u + bw * t
  const len = Math.hypot(qx, qy, qz, qw) || 1
  scratchLocal.qx = qx / len
  scratchLocal.qy = qy / len
  scratchLocal.qz = qz / len
  scratchLocal.qw = qw / len
  writeLs(pose, unified, scratchLocal)
}

/**
 * Reference pose MS for a rig bone (bind LS chain).
 * Matches engine GetReferencePoseMS for ParentConstraint offset.
 */
function getReferencePoseMs(rig: RigEntry, boneIndex: number, out: Qs): boolean {
  if (boneIndex < 0 || boneIndex >= rig.boneParents.length) {
    Object.assign(out, IDENTITY_QS)
    return false
  }
  const chain: number[] = []
  let cur = boneIndex
  let g = 0
  while (cur >= 0 && cur < rig.boneParents.length && g++ < 256) {
    chain.push(cur)
    cur = rig.boneParents[cur] ?? -1
  }
  Object.assign(out, IDENTITY_QS)
  for (let i = chain.length - 1; i >= 0; i--) {
    const bi = chain[i]!
    const ti = bi * 3
    const ri = bi * 4
    scratchLocal.tx = rig.refTranslation[ti]!
    scratchLocal.ty = rig.refTranslation[ti + 1]!
    scratchLocal.tz = rig.refTranslation[ti + 2]!
    scratchLocal.qx = rig.refRotation[ri]!
    scratchLocal.qy = rig.refRotation[ri + 1]!
    scratchLocal.qz = rig.refRotation[ri + 2]!
    scratchLocal.qw = rig.refRotation[ri + 3]!
    scratchLocal.sx = rig.refScale[ti]!
    scratchLocal.sy = rig.refScale[ti + 1]!
    scratchLocal.sz = rig.refScale[ti + 2]!
    mulQs(out, scratchLocal, scratchMs)
    Object.assign(out, scratchMs)
  }
  return true
}

/** Engine EulerAngles::ToQuat (degrees; Roll=Y, Pitch=X, Yaw=Z). */
function engineEulerToQuat(
  rollDeg: number,
  pitchDeg: number,
  yawDeg: number
): { qx: number; qy: number; qz: number; qw: number } {
  const deg2rad = Math.PI / 180
  const c1 = Math.cos(0.5 * yawDeg * deg2rad)
  const c2 = Math.cos(0.5 * pitchDeg * deg2rad)
  const c3 = Math.cos(0.5 * rollDeg * deg2rad)
  const s1 = Math.sin(0.5 * yawDeg * deg2rad)
  const s2 = Math.sin(0.5 * pitchDeg * deg2rad)
  const s3 = Math.sin(0.5 * rollDeg * deg2rad)
  const qw = c1 * c2 * c3 - s1 * s2 * s3
  const qx = c1 * s2 * c3 - s1 * c2 * s3
  const qy = s1 * s2 * c3 + c1 * c2 * s3
  const qz = s1 * c2 * c3 + c1 * s2 * s3
  const len = Math.hypot(qx, qy, qz, qw) || 1
  return { qx: qx / len, qy: qy / len, qz: qz / len, qw: qw / len }
}

/** Rotate vector by quaternion (engine TransformUnsafe). */
function quatTransformVec(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  vx: number,
  vy: number,
  vz: number
): { x: number; y: number; z: number } {
  const ix = qw * vx + qy * vz - qz * vy
  const iy = qw * vy + qz * vx - qx * vz
  const iz = qw * vz + qx * vy - qy * vx
  const iw = -qx * vx - qy * vy - qz * vz
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  }
}

function slerpQuatComponents(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number,
  t: number
): { qx: number; qy: number; qz: number; qw: number } {
  let x = bx
  let y = by
  let z = bz
  let w = bw
  let dot = ax * x + ay * y + az * z + aw * w
  if (dot < 0) {
    x = -x
    y = -y
    z = -z
    w = -w
    dot = -dot
  }
  if (dot > 0.9995) {
    const u = 1 - t
    let ox = ax * u + x * t
    let oy = ay * u + y * t
    let oz = az * u + z * t
    let ow = aw * u + w * t
    const len = Math.hypot(ox, oy, oz, ow) || 1
    return { qx: ox / len, qy: oy / len, qz: oz / len, qw: ow / len }
  }
  const theta0 = Math.acos(Math.min(1, Math.max(-1, dot)))
  const theta = theta0 * t
  const s0 = Math.sin(theta0)
  const s1 = Math.sin(theta)
  const s2 = Math.sin(theta0 - theta)
  const inv = s0 > 1e-12 ? 1 / s0 : 0
  return {
    qx: (ax * s2 + x * s1) * inv,
    qy: (ay * s2 + y * s1) * inv,
    qz: (az * s2 + z * s1) * inv,
    qw: (aw * s2 + w * s1) * inv,
  }
}

export type MultipleParentInfo = {
  parentUnified: number
  weight: number
  useOffset: boolean
  offset: Qs
}

/**
 * Engine AnimNode_MultipleParentConstraint::OnSample —
 * blend 1/2/N parent MS transforms (optional per-parent offset), then blend onto
 * constrained bone by constraint weight; write LS.
 */
export function applyMultipleParentConstraint(
  pose: Pose,
  rig: RigEntry,
  transformUnified: number,
  parents: MultipleParentInfo[],
  constraintWeight: number,
  interpolation: 'Slerp' | 'Lerp'
): void {
  if (!(constraintWeight > 0) || transformUnified < 0 || !parents.length) return

  const blend = (a: Qs, b: Qs, t: number): Qs =>
    interpolation === 'Lerp' ? lerpQs(a, b, t) : slerpQs(a, b, t)

  let parentMS = { ...IDENTITY_QS }
  const num = parents.length

  if (num === 1) {
    const p = parents[0]!
    if (p.parentUnified < 0) return
    const a = { ...IDENTITY_QS }
    if (!getTransformMs(pose, rig, p.parentUnified, a)) return
    if (p.useOffset) {
      const tmp = { ...IDENTITY_QS }
      mulQs(a, p.offset, tmp)
      Object.assign(a, tmp)
    }
    const tw = Math.min(1, Math.max(0, p.weight))
    if (tw < 1) parentMS = blend(IDENTITY_QS, a, tw)
    else parentMS = a
  } else if (num === 2) {
    const p0 = parents[0]!
    const p1 = parents[1]!
    if (p0.parentUnified < 0 || p1.parentUnified < 0) return
    const a = { ...IDENTITY_QS }
    const b = { ...IDENTITY_QS }
    if (!getTransformMs(pose, rig, p0.parentUnified, a)) return
    if (!getTransformMs(pose, rig, p1.parentUnified, b)) return
    if (p0.useOffset) {
      const tmp = { ...IDENTITY_QS }
      mulQs(a, p0.offset, tmp)
      Object.assign(a, tmp)
    }
    if (p1.useOffset) {
      const tmp = { ...IDENTITY_QS }
      mulQs(b, p1.offset, tmp)
      Object.assign(b, tmp)
    }
    const wa = Math.min(1, Math.max(0, p0.weight))
    const wb = Math.min(1, Math.max(0, p1.weight))
    const acc = wa + wb
    const t = acc > 0 ? wb / acc : 0
    if (t < 1) parentMS = blend(a, b, t)
    else parentMS = b
  } else {
    // N>2: BlendAddMul + FastRenormalize approx (weighted nlerp / linear TRS)
    let weightAcc = 0
    let tx = 0
    let ty = 0
    let tz = 0
    let qx = 0
    let qy = 0
    let qz = 0
    let qw = 0
    let sx = 0
    let sy = 0
    let sz = 0
    let qRefSet = false
    let rqx = 0
    let rqy = 0
    let rqz = 0
    let rqw = 1
    for (const p of parents) {
      if (p.parentUnified < 0) return
      const it = { ...IDENTITY_QS }
      if (!getTransformMs(pose, rig, p.parentUnified, it)) return
      if (p.useOffset) {
        const tmp = { ...IDENTITY_QS }
        mulQs(it, p.offset, tmp)
        Object.assign(it, tmp)
      }
      const w = p.weight
      weightAcc += w
      tx += it.tx * w
      ty += it.ty * w
      tz += it.tz * w
      sx += it.sx * w
      sy += it.sy * w
      sz += it.sz * w
      let bx = it.qx
      let by = it.qy
      let bz = it.qz
      let bw = it.qw
      if (qRefSet && rqx * bx + rqy * by + rqz * bz + rqw * bw < 0) {
        bx = -bx
        by = -by
        bz = -bz
        bw = -bw
      } else if (!qRefSet) {
        rqx = bx
        rqy = by
        rqz = bz
        rqw = bw
        qRefSet = true
      }
      qx += bx * w
      qy += by * w
      qz += bz * w
      qw += bw * w
    }
    if (!(weightAcc > 0)) return
    const inv = 1 / weightAcc
    const qlen = Math.hypot(qx, qy, qz, qw) || 1
    parentMS = {
      tx: tx * inv,
      ty: ty * inv,
      tz: tz * inv,
      qx: qx / qlen,
      qy: qy / qlen,
      qz: qz / qlen,
      qw: qw / qlen,
      sx: sx * inv,
      sy: sy * inv,
      sz: sz * inv,
    }
  }

  let outputMS: Qs
  if (constraintWeight < 1) {
    const cur = { ...IDENTITY_QS }
    if (!getTransformMs(pose, rig, transformUnified, cur)) return
    outputMS = blend(cur, parentMS, constraintWeight)
  } else {
    outputMS = parentMS
  }

  const outputParentIdx = parentOf(pose, rig, transformUnified)
  if (outputParentIdx >= 0) {
    if (!getTransformMs(pose, rig, outputParentIdx, scratchParent)) return
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, outputMS, local)
    writeLs(pose, transformUnified, local)
  } else {
    writeLs(pose, transformUnified, outputMS)
  }
}

/**
 * Engine AnimNode_ParentConstraint::OnSample —
 * blend constrained bone MS toward parent MS, optional bind offset + LS offsets, write LS.
 */
export function applyParentConstraint(
  pose: Pose,
  rig: RigEntry,
  transformUnified: number,
  parentUnified: number,
  weight: number,
  interpolation: 'Slerp' | 'Lerp',
  useBoneReferencePoseAsDefaultOffset: boolean,
  offsetEuler: { x: number; y: number; z: number } | null,
  offsetTranslation: { x: number; y: number; z: number } | null
): void {
  if (!(weight > 0) || transformUnified < 0 || parentUnified < 0) return

  const parentMS = { ...IDENTITY_QS }
  const outputMS = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, parentUnified, parentMS)) return
  if (!getTransformMs(pose, rig, transformUnified, outputMS)) return

  if (useBoneReferencePoseAsDefaultOffset && transformUnified < pose.boneCount) {
    const boneRef = { ...IDENTITY_QS }
    const parentRef = { ...IDENTITY_QS }
    if (getReferencePoseMs(rig, transformUnified, boneRef)) {
      const rigParent = rig.boneParents[transformUnified] ?? -1
      if (rigParent >= 0 && getReferencePoseMs(rig, rigParent, parentRef)) {
        const offset = { ...IDENTITY_QS }
        mulInverseMul(parentRef, boneRef, offset)
        const tmp = { ...IDENTITY_QS }
        mulQs(parentMS, offset, tmp)
        Object.assign(parentMS, tmp)
      }
    }
  }

  if (weight < 1) {
    const t = weight
    const tx = outputMS.tx + (parentMS.tx - outputMS.tx) * t
    const ty = outputMS.ty + (parentMS.ty - outputMS.ty) * t
    const tz = outputMS.tz + (parentMS.tz - outputMS.tz) * t
    const sx = outputMS.sx + (parentMS.sx - outputMS.sx) * t
    const sy = outputMS.sy + (parentMS.sy - outputMS.sy) * t
    const sz = outputMS.sz + (parentMS.sz - outputMS.sz) * t
    let rot: { qx: number; qy: number; qz: number; qw: number }
    if (interpolation === 'Lerp') {
      let bx = parentMS.qx
      let by = parentMS.qy
      let bz = parentMS.qz
      let bw = parentMS.qw
      if (
        outputMS.qx * bx + outputMS.qy * by + outputMS.qz * bz + outputMS.qw * bw <
        0
      ) {
        bx = -bx
        by = -by
        bz = -bz
        bw = -bw
      }
      const u = 1 - t
      let qx = outputMS.qx * u + bx * t
      let qy = outputMS.qy * u + by * t
      let qz = outputMS.qz * u + bz * t
      let qw = outputMS.qw * u + bw * t
      const len = Math.hypot(qx, qy, qz, qw) || 1
      rot = { qx: qx / len, qy: qy / len, qz: qz / len, qw: qw / len }
    } else {
      rot = slerpQuatComponents(
        outputMS.qx,
        outputMS.qy,
        outputMS.qz,
        outputMS.qw,
        parentMS.qx,
        parentMS.qy,
        parentMS.qz,
        parentMS.qw,
        t
      )
    }
    outputMS.tx = tx
    outputMS.ty = ty
    outputMS.tz = tz
    outputMS.sx = sx
    outputMS.sy = sy
    outputMS.sz = sz
    outputMS.qx = rot.qx
    outputMS.qy = rot.qy
    outputMS.qz = rot.qz
    outputMS.qw = rot.qw
  } else {
    Object.assign(outputMS, parentMS)
  }

  // Offset in Maya/3DS local (= engine parent space): post-multiply rotation, rotate translation.
  if (offsetEuler) {
    // EulerAngles(input.Y, input.X, input.Z) = (roll, pitch, yaw)
    const qOff = engineEulerToQuat(offsetEuler.y, offsetEuler.x, offsetEuler.z)
    scratchQa[0] = outputMS.qx
    scratchQa[1] = outputMS.qy
    scratchQa[2] = outputMS.qz
    scratchQa[3] = outputMS.qw
    scratchQb[0] = qOff.qx
    scratchQb[1] = qOff.qy
    scratchQb[2] = qOff.qz
    scratchQb[3] = qOff.qw
    mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
    outputMS.qx = scratchQ[0]!
    outputMS.qy = scratchQ[1]!
    outputMS.qz = scratchQ[2]!
    outputMS.qw = scratchQ[3]!
  }

  if (offsetTranslation) {
    const r = quatTransformVec(
      outputMS.qx,
      outputMS.qy,
      outputMS.qz,
      outputMS.qw,
      offsetTranslation.x,
      offsetTranslation.y,
      offsetTranslation.z
    )
    outputMS.tx += r.x
    outputMS.ty += r.y
    outputMS.tz += r.z
  }

  const outputParentIdx = parentOf(pose, rig, transformUnified)
  if (outputParentIdx >= 0) {
    if (!getTransformMs(pose, rig, outputParentIdx, scratchParent)) return
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, outputMS, local)
    writeLs(pose, transformUnified, local)
  } else {
    writeLs(pose, transformUnified, outputMS)
  }
}

/** Cumulative slerp blend weights for OrientConstraint (engine PreprocessWeights). */
export function preprocessOrientWeights(weights: number[]): number[] {
  if (weights.length <= 1) return []
  const out = new Array<number>(weights.length - 1)
  let acc = 0
  for (const w of weights) acc += w
  if (!(acc > 0)) {
    for (let i = 0; i < out.length; i++) out[i] = 0
    return out
  }
  const inv = 1 / acc
  let denominator = 1
  for (let i = weights.length - 2; i >= 0; i--) {
    const w = (weights[i + 1]! * inv)
    out[i] = denominator !== 0 ? w / denominator : 0
    denominator *= 1 - out[i]!
  }
  return out
}

/** Engine BlendMultipleQuaternions — sequential Slerp with preprocessed weights. */
export function blendMultipleQuaternions(
  quats: Array<{ qx: number; qy: number; qz: number; qw: number }>,
  preprocessed: number[]
): { qx: number; qy: number; qz: number; qw: number } {
  if (!quats.length) return { qx: 0, qy: 0, qz: 0, qw: 1 }
  let r = { ...quats[0]! }
  for (let i = 1; i < quats.length; i++) {
    const w = preprocessed[i - 1] ?? 0
    const q = quats[i]!
    r = slerpQuatComponents(r.qx, r.qy, r.qz, r.qw, q.qx, q.qy, q.qz, q.qw, w)
  }
  const len = Math.hypot(r.qx, r.qy, r.qz, r.qw) || 1
  return { qx: r.qx / len, qy: r.qy / len, qz: r.qz / len, qw: r.qw / len }
}

function writeMsRotationToPose(
  pose: Pose,
  rig: RigEntry,
  transformUnified: number,
  targetRot: { qx: number; qy: number; qz: number; qw: number },
  weight: number,
  slerpRootFromIdentity: boolean
): void {
  const outputMS = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, transformUnified, outputMS)) return
  const parentIdx = parentOf(pose, rig, transformUnified)
  if (parentIdx >= 0) {
    if (!getTransformMs(pose, rig, parentIdx, scratchParent)) return
    if (weight < 1) {
      const r = slerpQuatComponents(
        outputMS.qx,
        outputMS.qy,
        outputMS.qz,
        outputMS.qw,
        targetRot.qx,
        targetRot.qy,
        targetRot.qz,
        targetRot.qw,
        weight
      )
      outputMS.qx = r.qx
      outputMS.qy = r.qy
      outputMS.qz = r.qz
      outputMS.qw = r.qw
    } else {
      outputMS.qx = targetRot.qx
      outputMS.qy = targetRot.qy
      outputMS.qz = targetRot.qz
      outputMS.qw = targetRot.qw
    }
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, outputMS, local)
    writeLs(pose, transformUnified, local)
    return
  }
  // Root / model-space: engine Slerps from identity when weight < 1
  if (weight < 1 && slerpRootFromIdentity) {
    const r = slerpQuatComponents(0, 0, 0, 1, targetRot.qx, targetRot.qy, targetRot.qz, targetRot.qw, weight)
    if (!readLs(pose, transformUnified, scratchLocal)) return
    scratchLocal.qx = r.qx
    scratchLocal.qy = r.qy
    scratchLocal.qz = r.qz
    scratchLocal.qw = r.qw
    writeLs(pose, transformUnified, scratchLocal)
  } else if (weight < 1) {
    if (!readLs(pose, transformUnified, scratchLocal)) return
    const r = slerpQuatComponents(
      scratchLocal.qx,
      scratchLocal.qy,
      scratchLocal.qz,
      scratchLocal.qw,
      targetRot.qx,
      targetRot.qy,
      targetRot.qz,
      targetRot.qw,
      weight
    )
    scratchLocal.qx = r.qx
    scratchLocal.qy = r.qy
    scratchLocal.qz = r.qz
    scratchLocal.qw = r.qw
    writeLs(pose, transformUnified, scratchLocal)
  } else {
    if (!readLs(pose, transformUnified, scratchLocal)) return
    scratchLocal.qx = targetRot.qx
    scratchLocal.qy = targetRot.qy
    scratchLocal.qz = targetRot.qz
    scratchLocal.qw = targetRot.qw
    writeLs(pose, transformUnified, scratchLocal)
  }
}

/**
 * Engine AnimNode_OrientConstraint::Execute —
 * blend input bone MS rotations → constrained bone MS rotation → LS.
 */
export function applyOrientConstraint(
  pose: Pose,
  rig: RigEntry,
  transformUnified: number,
  inputUnified: number[],
  inputWeights: number[],
  weight: number
): void {
  if (!(weight > 0) || transformUnified < 0 || !inputUnified.length) return
  const quats: Array<{ qx: number; qy: number; qz: number; qw: number }> = []
  for (const idx of inputUnified) {
    if (idx < 0) return
    if (!getTransformMs(pose, rig, idx, scratchMs)) return
    quats.push({ qx: scratchMs.qx, qy: scratchMs.qy, qz: scratchMs.qz, qw: scratchMs.qw })
  }
  const pre = preprocessOrientWeights(inputWeights)
  const target = blendMultipleQuaternions(quats, pre)
  writeMsRotationToPose(pose, rig, transformUnified, target, weight, true)
}

/** Engine AnimNode_PointConstraint::PreprocessWeights — normalize to sum 1. */
export function preprocessPointWeights(weights: number[]): number[] {
  let acc = 0
  for (const w of weights) acc += w
  if (!(acc > 0)) return weights.map(() => 0)
  const inv = 1 / acc
  return weights.map((w) => w * inv)
}

/**
 * Engine AnimNode_PointConstraint::Execute —
 * weighted sum of input MS translations → constrained bone MS translation → LS.
 * `preprocessedWeights` must already be normalized (or pass raw + let this normalize).
 */
export function applyPointConstraint(
  pose: Pose,
  rig: RigEntry,
  transformUnified: number,
  inputUnified: number[],
  inputWeights: number[],
  weight: number,
  preprocessedWeights?: number[]
): void {
  if (!(weight > 0) || transformUnified < 0 || !inputUnified.length) return
  if (inputUnified.length !== inputWeights.length) return

  const pre =
    preprocessedWeights &&
    preprocessedWeights.length === inputWeights.length
      ? preprocessedWeights
      : preprocessPointWeights(inputWeights)

  let tx = 0
  let ty = 0
  let tz = 0
  for (let i = 0; i < inputUnified.length; i++) {
    const idx = inputUnified[i]!
    if (idx < 0) return
    if (!getTransformMs(pose, rig, idx, scratchMs)) return
    const w = pre[i] ?? 0
    tx += scratchMs.tx * w
    ty += scratchMs.ty * w
    tz += scratchMs.tz * w
  }

  const outputMS = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, transformUnified, outputMS)) return
  const parentIdx = parentOf(pose, rig, transformUnified)
  if (parentIdx >= 0) {
    if (!getTransformMs(pose, rig, parentIdx, scratchParent)) return
    if (weight < 1) {
      outputMS.tx += (tx - outputMS.tx) * weight
      outputMS.ty += (ty - outputMS.ty) * weight
      outputMS.tz += (tz - outputMS.tz) * weight
    } else {
      outputMS.tx = tx
      outputMS.ty = ty
      outputMS.tz = tz
    }
    const local = { ...IDENTITY_QS }
    mulInverseMul(scratchParent, outputMS, local)
    writeLs(pose, transformUnified, local)
    return
  }

  // Root / model-space: engine Mul(targetMS, weight) when weight < 1 (not lerp from current)
  if (weight < 1) {
    if (!readLs(pose, transformUnified, scratchLocal)) return
    scratchLocal.tx = tx * weight
    scratchLocal.ty = ty * weight
    scratchLocal.tz = tz * weight
    writeLs(pose, transformUnified, scratchLocal)
  } else {
    if (!readLs(pose, transformUnified, scratchLocal)) return
    scratchLocal.tx = tx
    scratchLocal.ty = ty
    scratchLocal.tz = tz
    writeLs(pose, transformUnified, scratchLocal)
  }
}

function normalize3(
  x: number,
  y: number,
  z: number
): { x: number; y: number; z: number; len: number } {
  const len = Math.hypot(x, y, z)
  if (!(len > 1e-8)) return { x: 0, y: 0, z: 0, len: 0 }
  return { x: x / len, y: y / len, z: z / len, len }
}

/** Engine CalculateShortestRotation(from, to, singularityPerp). */
function shortestRotation(
  fx: number,
  fy: number,
  fz: number,
  tx: number,
  ty: number,
  tz: number,
  px: number,
  py: number,
  pz: number
): { qx: number; qy: number; qz: number; qw: number } {
  const dot = fx * tx + fy * ty + fz * tz
  if (dot < -0.999999) {
    const len = Math.hypot(px, py, pz) || 1
    return { qx: px / len, qy: py / len, qz: pz / len, qw: 0 }
  }
  const cx = fy * tz - fz * ty
  const cy = fz * tx - fx * tz
  const cz = fx * ty - fy * tx
  let qx = cx
  let qy = cy
  let qz = cz
  let qw = 1 + dot
  const len = Math.hypot(qx, qy, qz, qw) || 1
  return { qx: qx / len, qy: qy / len, qz: qz / len, qw: qw / len }
}

/**
 * Engine AnimNode_AimConstraint::Execute —
 * look-at MS rotation from target/up points; Slerp onto constrained bone.
 */
export function applyAimConstraint(
  pose: Pose,
  rig: RigEntry,
  transformUnified: number,
  targetPos: { x: number; y: number; z: number },
  upPos: { x: number; y: number; z: number },
  forwardAxisLS: { x: number; y: number; z: number },
  upAxisLS: { x: number; y: number; z: number },
  weight: number
): void {
  if (!(weight > 0) || transformUnified < 0) return
  const boneMS = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, transformUnified, boneMS)) return

  let f = normalize3(forwardAxisLS.x, forwardAxisLS.y, forwardAxisLS.z)
  if (!(f.len > 0)) f = { x: 1, y: 0, z: 0, len: 1 }
  let u = normalize3(upAxisLS.x, upAxisLS.y, upAxisLS.z)
  if (!(u.len > 0)) u = { x: 0, y: 1, z: 0, len: 1 }
  // Ortho: R = F×U, U = R×F
  let rx = f.y * u.z - f.z * u.y
  let ry = f.z * u.x - f.x * u.z
  let rz = f.x * u.y - f.y * u.x
  const rN = normalize3(rx, ry, rz)
  if (!(rN.len > 0)) return
  rx = rN.x
  ry = rN.y
  rz = rN.z
  const u2 = normalize3(
    ry * f.z - rz * f.y,
    rz * f.x - rx * f.z,
    rx * f.y - ry * f.x
  )
  if (!(u2.len > 0)) return
  const globalU = f
  const globalV = u2

  const aim = normalize3(
    targetPos.x - boneMS.tx,
    targetPos.y - boneMS.ty,
    targetPos.z - boneMS.tz
  )
  const toUp = normalize3(upPos.x - boneMS.tx, upPos.y - boneMS.ty, upPos.z - boneMS.tz)
  if (!(aim.len > 0) || !(toUp.len > 0)) return

  const vecU = aim
  const dotUU = vecU.x * toUp.x + vecU.y * toUp.y + vecU.z * toUp.z
  const vecV = normalize3(
    toUp.x - vecU.x * dotUU,
    toUp.y - vecU.y * dotUU,
    toUp.z - vecU.z * dotUU
  )
  if (!(vecV.len > 0)) return
  const vecW = {
    x: vecU.y * vecV.z - vecU.z * vecV.y,
    y: vecU.z * vecV.x - vecU.x * vecV.z,
    z: vecU.x * vecV.y - vecU.y * vecV.x,
  }

  const quatU = shortestRotation(
    globalU.x,
    globalU.y,
    globalU.z,
    vecU.x,
    vecU.y,
    vecU.z,
    -vecW.x,
    -vecW.y,
    -vecW.z
  )
  const rotatedV = quatTransformVec(
    quatU.qx,
    quatU.qy,
    quatU.qz,
    quatU.qw,
    globalV.x,
    globalV.y,
    globalV.z
  )
  const quatV = shortestRotation(
    rotatedV.x,
    rotatedV.y,
    rotatedV.z,
    vecV.x,
    vecV.y,
    vecV.z,
    vecU.x,
    vecU.y,
    vecU.z
  )
  // out = quatV * quatU
  scratchQa[0] = quatV.qx
  scratchQa[1] = quatV.qy
  scratchQa[2] = quatV.qz
  scratchQa[3] = quatV.qw
  scratchQb[0] = quatU.qx
  scratchQb[1] = quatU.qy
  scratchQb[2] = quatU.qz
  scratchQb[3] = quatU.qw
  mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
  const targetRot = {
    qx: scratchQ[0]!,
    qy: scratchQ[1]!,
    qz: scratchQ[2]!,
    qw: scratchQ[3]!,
  }
  writeMsRotationToPose(pose, rig, transformUnified, targetRot, weight, true)
}

export function readQsTransform(raw: unknown): Qs {
  const o =
    raw && typeof raw === 'object'
      ? ((raw as { Data?: unknown }).Data as Record<string, unknown> | undefined) ??
        (raw as Record<string, unknown>)
      : null
  const t = (o?.Translation ?? o?.translation) as Record<string, unknown> | undefined
  const r = (o?.Rotation ?? o?.rotation) as Record<string, unknown> | undefined
  const s = (o?.Scale ?? o?.scale) as Record<string, unknown> | undefined
  const num = (v: unknown, d: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }
  return {
    tx: num(t?.X ?? t?.x, 0),
    ty: num(t?.Y ?? t?.y, 0),
    tz: num(t?.Z ?? t?.z, 0),
    qx: num(r?.i ?? r?.X ?? r?.x, 0),
    qy: num(r?.j ?? r?.Y ?? r?.y, 0),
    qz: num(r?.k ?? r?.Z ?? r?.z, 0),
    qw: num(r?.r ?? r?.W ?? r?.w, 1),
    sx: num(s?.X ?? s?.x, 1),
    sy: num(s?.Y ?? s?.y, 1),
    sz: num(s?.Z ?? s?.z, 1),
  }
}

/** AnimNode_TransformConstant — separate pos / rotation / scale fields. */
export function qsFromPosRotScale(
  pos: unknown,
  rotation: unknown,
  scale: unknown
): Qs {
  const p = pos && typeof pos === 'object' ? (pos as Record<string, unknown>) : null
  const r = rotation && typeof rotation === 'object' ? (rotation as Record<string, unknown>) : null
  const s = scale && typeof scale === 'object' ? (scale as Record<string, unknown>) : null
  const num = (v: unknown, d: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }
  return {
    tx: num(p?.X ?? p?.x, 0),
    ty: num(p?.Y ?? p?.y, 0),
    tz: num(p?.Z ?? p?.z, 0),
    qx: num(r?.i ?? r?.X ?? r?.x, 0),
    qy: num(r?.j ?? r?.Y ?? r?.y, 0),
    qz: num(r?.k ?? r?.Z ?? r?.z, 0),
    qw: num(r?.r ?? r?.W ?? r?.w, 1),
    sx: num(s?.X ?? s?.x, 1),
    sy: num(s?.Y ?? s?.y, 1),
    sz: num(s?.Z ?? s?.z, 1),
  }
}

/** QsTransform Lerp (translation/scale linear, rotation nlerp). */
export function lerpQs(a: Qs, b: Qs, t: number): Qs {
  const u = 1 - t
  let bx = b.qx
  let by = b.qy
  let bz = b.qz
  let bw = b.qw
  if (a.qx * bx + a.qy * by + a.qz * bz + a.qw * bw < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  let qx = a.qx * u + bx * t
  let qy = a.qy * u + by * t
  let qz = a.qz * u + bz * t
  let qw = a.qw * u + bw * t
  const len = Math.hypot(qx, qy, qz, qw) || 1
  return {
    tx: a.tx * u + b.tx * t,
    ty: a.ty * u + b.ty * t,
    tz: a.tz * u + b.tz * t,
    qx: qx / len,
    qy: qy / len,
    qz: qz / len,
    qw: qw / len,
    sx: a.sx * u + b.sx * t,
    sy: a.sy * u + b.sy * t,
    sz: a.sz * u + b.sz * t,
  }
}

/** QsTransform Slerp (translation/scale linear, rotation spherical). */
export function slerpQs(a: Qs, b: Qs, t: number): Qs {
  const u = 1 - t
  const r = slerpQuatComponents(a.qx, a.qy, a.qz, a.qw, b.qx, b.qy, b.qz, b.qw, t)
  return {
    tx: a.tx * u + b.tx * t,
    ty: a.ty * u + b.ty * t,
    tz: a.tz * u + b.tz * t,
    qx: r.qx,
    qy: r.qy,
    qz: r.qz,
    qw: r.qw,
    sx: a.sx * u + b.sx * t,
    sy: a.sy * u + b.sy * t,
    sz: a.sz * u + b.sz * t,
  }
}

/**
 * AnimNode_TransformRotator::OnSample — LS post-multiply by axis-angle quat.
 * Engine: transform.SetMulUnsafe(transform, transformToAdd).
 */
export function rotateBoneByAxisVector(
  pose: Pose,
  unified: number,
  axisX: number,
  axisY: number,
  axisZ: number,
  angleDeg: number
): void {
  if (unified < 0 || !Number.isFinite(angleDeg) || Math.abs(angleDeg) < 1e-8) return
  const alen = Math.hypot(axisX, axisY, axisZ)
  if (alen < 1e-8) return
  const nx = axisX / alen
  const ny = axisY / alen
  const nz = axisZ / alen
  const half = (angleDeg * Math.PI) / 180 / 2
  const s = Math.sin(half)
  const c = Math.cos(half)
  if (!readLs(pose, unified, scratchLocal)) return
  scratchQa[0] = scratchLocal.qx
  scratchQa[1] = scratchLocal.qy
  scratchQa[2] = scratchLocal.qz
  scratchQa[3] = scratchLocal.qw
  scratchQb[0] = nx * s
  scratchQb[1] = ny * s
  scratchQb[2] = nz * s
  scratchQb[3] = c
  mulQuat(scratchQ, 0, scratchQa, 0, scratchQb, 0)
  scratchLocal.qx = scratchQ[0]!
  scratchLocal.qy = scratchQ[1]!
  scratchLocal.qz = scratchQ[2]!
  scratchLocal.qw = scratchQ[3]!
  writeLs(pose, unified, scratchLocal)
}
