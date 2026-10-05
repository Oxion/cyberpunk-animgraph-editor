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
