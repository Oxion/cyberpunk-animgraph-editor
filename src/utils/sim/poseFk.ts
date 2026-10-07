/**
 * Local→model-space FK for offline Sample (stack snap/offset).
 * Unified index: [0..boneCount) rig, [boneCount..boneCount+stackCount) stack.
 */

import type { RigEntry } from './rigResource'
import { mulQuat, type Pose } from './pose'

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

const IDENTITY_QS: Qs = {
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
