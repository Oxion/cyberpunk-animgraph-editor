/**
 * poseUtil::ExtractTrajectory / ApplyTrajectory (local-space).
 * Bones with parentIndex == 0 are left-multiplied by inv(traj) / traj;
 * Trajectory bone set to identity on extract (engine leaves it identity after apply).
 */

import type { Pose } from './pose'
import type { RigEntry } from './rigResource'
import { IDENTITY_QS, type Qs } from './poseFk'

const scratchA = { ...IDENTITY_QS }
const scratchB = { ...IDENTITY_QS }
const scratchOut = { ...IDENTITY_QS }

function readBone(pose: Pose, i: number, out: Qs): void {
  const ti = i * 3
  const ri = i * 4
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
}

function writeBone(pose: Pose, i: number, qs: Qs): void {
  const ti = i * 3
  const ri = i * 4
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
}

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
  out.qx = qw * local.qx + qx * local.qw + qy * local.qz - qz * local.qy
  out.qy = qw * local.qy - qx * local.qz + qy * local.qw + qz * local.qx
  out.qz = qw * local.qz + qx * local.qy - qy * local.qx + qz * local.qw
  out.qw = qw * local.qw - qx * local.qx - qy * local.qy - qz * local.qz
  out.sx = parent.sx * local.sx
  out.sy = parent.sy * local.sy
  out.sz = parent.sz * local.sz
}

function invertQs(m: Qs, out: Qs): void {
  const qx = -m.qx,
    qy = -m.qy,
    qz = -m.qz,
    qw = m.qw
  const sx = m.sx !== 0 ? 1 / m.sx : 1
  const sy = m.sy !== 0 ? 1 / m.sy : 1
  const sz = m.sz !== 0 ? 1 / m.sz : 1
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

function isAlmostIdentity(q: Qs): boolean {
  return (
    Math.abs(q.tx) < 1e-8 &&
    Math.abs(q.ty) < 1e-8 &&
    Math.abs(q.tz) < 1e-8 &&
    Math.abs(q.qx) < 1e-8 &&
    Math.abs(q.qy) < 1e-8 &&
    Math.abs(q.qz) < 1e-8 &&
    Math.abs(q.qw - 1) < 1e-5 &&
    Math.abs(q.sx - 1) < 1e-8 &&
    Math.abs(q.sy - 1) < 1e-8 &&
    Math.abs(q.sz - 1) < 1e-8
  )
}

function mulChildrenOfRoot(pose: Pose, rig: RigEntry, left: Qs): void {
  const n = Math.min(pose.boneCount, rig.boneParents.length)
  for (let i = 0; i < n; i++) {
    if (rig.boneParents[i] !== 0) continue
    readBone(pose, i, scratchB)
    mulQs(left, scratchB, scratchOut)
    writeBone(pose, i, scratchOut)
  }
}

/** Extract Trajectory LS; strip from children of bone 0; zero Trajectory bone. */
export function extractTrajectory(
  pose: Pose,
  rig: RigEntry,
  trajectoryBone: number,
  outTraj: Qs = { ...IDENTITY_QS }
): Qs {
  if (trajectoryBone < 0 || trajectoryBone >= pose.boneCount) {
    Object.assign(outTraj, IDENTITY_QS)
    return outTraj
  }
  readBone(pose, trajectoryBone, outTraj)
  if (isAlmostIdentity(outTraj)) return outTraj

  invertQs(outTraj, scratchA)
  mulChildrenOfRoot(pose, rig, scratchA)
  writeBone(pose, trajectoryBone, IDENTITY_QS)
  return outTraj
}

/** Re-apply extracted Trajectory onto children of bone 0. */
export function applyTrajectory(
  pose: Pose,
  rig: RigEntry,
  traj: Qs
): void {
  if (isAlmostIdentity(traj)) return
  mulChildrenOfRoot(pose, rig, traj)
}
