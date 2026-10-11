/**
 * Engine AnimNode_FPPCamera::OnSample — gameplay/scene camera bone writes + float tracks.
 */

import type { FppCameraDyn } from './fppCameraDyn'
import { FPP_BONE } from './fppCameraDyn'
import type { Pose } from './pose'
import { writeExtraTrack } from './pose'
import {
  IDENTITY_QS,
  eulerDegToQuat,
  getTransformMs,
  parentUnifiedOf,
  readBoneLs,
  resolveUnifiedName,
  setBoneTransformMs,
  slerpQs,
  writeBoneLs,
  type Qs,
} from './poseFk'
import type { RigEntry } from './rigResource'

type BoneIds = {
  camera: number
  chest: number
  cog: number
  aim: number
  target: number
  upOffset: number
  up: number
  trajectory: number
  spine3: number
  chestParent: number
}

function resolveBones(pose: Pose, rig: RigEntry): BoneIds | null {
  const camera = resolveUnifiedName(pose, rig, FPP_BONE.camera)
  const chest = resolveUnifiedName(pose, rig, FPP_BONE.chest)
  const cog = resolveUnifiedName(pose, rig, FPP_BONE.cog)
  const aim = resolveUnifiedName(pose, rig, FPP_BONE.aim)
  const target = resolveUnifiedName(pose, rig, FPP_BONE.target)
  const upOffset = resolveUnifiedName(pose, rig, FPP_BONE.upOffset)
  const up = resolveUnifiedName(pose, rig, FPP_BONE.up)
  const trajectory = resolveUnifiedName(pose, rig, FPP_BONE.trajectory)
  const spine3 = resolveUnifiedName(pose, rig, FPP_BONE.spine3)
  if (
    camera < 0 ||
    chest < 0 ||
    cog < 0 ||
    aim < 0 ||
    target < 0 ||
    upOffset < 0 ||
    up < 0 ||
    trajectory < 0 ||
    spine3 < 0
  ) {
    return null
  }
  return {
    camera,
    chest,
    cog,
    aim,
    target,
    upOffset,
    up,
    trajectory,
    spine3,
    chestParent: parentUnifiedOf(pose, rig, chest),
  }
}

function copyQs(src: Qs): Qs {
  return { ...src }
}

function mulQsLocal(parent: Qs, local: Qs, out: Qs): void {
  // translation
  const px = parent.qx
  const py = parent.qy
  const pz = parent.qz
  const pw = parent.qw
  const lx = local.tx * parent.sx
  const ly = local.ty * parent.sy
  const lz = local.tz * parent.sz
  const ix = pw * lx + py * lz - pz * ly
  const iy = pw * ly + pz * lx - px * lz
  const iz = pw * lz + px * ly - py * lx
  const iw = -px * lx - py * ly - pz * lz
  out.tx = parent.tx + ix * pw + iw * -px + iy * -pz - iz * -py
  out.ty = parent.ty + iy * pw + iw * -py + iz * -px - ix * -pz
  out.tz = parent.tz + iz * pw + iw * -pz + ix * -py - iy * -px
  // rotation
  const ax = parent.qx
  const ay = parent.qy
  const az = parent.qz
  const aw = parent.qw
  const bx = local.qx
  const by = local.qy
  const bz = local.qz
  const bw = local.qw
  out.qx = aw * bx + ax * bw + ay * bz - az * by
  out.qy = aw * by - ax * bz + ay * bw + az * bx
  out.qz = aw * bz + ax * by - ay * bx + az * bw
  out.qw = aw * bw - ax * bx - ay * by - az * bz
  out.sx = parent.sx * local.sx
  out.sy = parent.sy * local.sy
  out.sz = parent.sz * local.sz
}

function invertQsLocal(q: Qs, out: Qs): void {
  const n = q.qx * q.qx + q.qy * q.qy + q.qz * q.qz + q.qw * q.qw || 1
  out.qx = -q.qx / n
  out.qy = -q.qy / n
  out.qz = -q.qz / n
  out.qw = q.qw / n
  out.sx = Math.abs(q.sx) > 1e-8 ? 1 / q.sx : 1
  out.sy = Math.abs(q.sy) > 1e-8 ? 1 / q.sy : 1
  out.sz = Math.abs(q.sz) > 1e-8 ? 1 / q.sz : 1
  const tx = q.tx
  const ty = q.ty
  const tz = q.tz
  const ix = out.qx
  const iy = out.qy
  const iz = out.qz
  const iw = out.qw
  const rx = iw * -tx + iy * -tz - iz * -ty
  const ry = iw * -ty + iz * -tx - ix * -tz
  const rz = iw * -tz + ix * -ty - iy * -tx
  const rw = -ix * -tx - iy * -ty - iz * -tz
  out.tx = rx * iw + rw * -ix + ry * -iz - rz * -iy
  out.ty = ry * iw + rw * -iy + rz * -ix - rx * -iz
  out.tz = rz * iw + rw * -iz + rx * -iy - ry * -ix
}

function mulInverseMulLocal(parentMs: Qs, childMs: Qs, out: Qs): void {
  const inv = { ...IDENTITY_QS }
  invertQsLocal(parentMs, inv)
  mulQsLocal(inv, childMs, out)
}

function eulerToQs(roll: number, pitch: number, yaw: number): Qs {
  const q = eulerDegToQuat(pitch, roll, yaw)
  return { ...IDENTITY_QS, qx: q.qx, qy: q.qy, qz: q.qz, qw: q.qw }
}

/** Engine SetAdditionalFloatTrack — MarkExtraFloatTrack slots only. */
function writeTrack(pose: Pose, _rig: RigEntry, name: string, value: number): void {
  writeExtraTrack(pose, name, value)
}

function cachePose(data: FppCameraDyn, pose: Pose, bones: BoneIds): void {
  readBoneLs(pose, bones.camera, data.cameraControlLS)
  readBoneLs(pose, bones.chest, data.cameraChestLS)
  readBoneLs(pose, bones.aim, data.cameraAimLS)
  readBoneLs(pose, bones.target, data.cameraTargetLS)
  readBoneLs(pose, bones.upOffset, data.cameraUpOffsetLS)
  readBoneLs(pose, bones.up, data.cameraUpLS)
  readBoneLs(pose, bones.cog, data.cameraTorsoCogLS)
}

function interpolateToCache(
  pose: Pose,
  data: FppCameraDyn,
  bones: BoneIds,
  t: number,
  includeCog: boolean
): void {
  const blend = (idx: number, cached: Qs) => {
    const cur = { ...IDENTITY_QS }
    if (!readBoneLs(pose, idx, cur)) return
    writeBoneLs(pose, idx, slerpQs(cur, cached, t))
  }
  if (includeCog) blend(bones.cog, data.cameraTorsoCogLS)
  blend(bones.camera, data.cameraControlLS)
  blend(bones.chest, data.cameraChestLS)
  blend(bones.aim, data.cameraAimLS)
  blend(bones.target, data.cameraTargetLS)
  blend(bones.upOffset, data.cameraUpOffsetLS)
  blend(bones.up, data.cameraUpLS)
}

function applyGameplayYaw(
  result: { camera: Qs; chest: Qs },
  data: FppCameraDyn
): void {
  const cameraMS = copyQs(result.camera)
  const stacks0 = { ...IDENTITY_QS }
  const stacks1 = { ...IDENTITY_QS }
  mulInverseMulLocal(cameraMS, result.chest, stacks1)

  const half = ((data.yawFinal * 0.5) * Math.PI) / 180
  const rot: Qs = {
    ...IDENTITY_QS,
    qy: Math.sin(half),
    qw: Math.cos(half),
  }
  mulQsLocal(stacks0, rot, stacks0)
  mulQsLocal(cameraMS, stacks0, result.camera)
  const chestBlended = { ...IDENTITY_QS }
  mulQsLocal(result.camera, stacks1, chestBlended)
  result.chest = slerpQs(result.chest, chestBlended, data.upperBodyYaw)
}

function applyGameplayPitch(
  stacks: [Qs, Qs, Qs],
  data: FppCameraDyn
): void {
  const half = ((-data.pitchFinal * 0.5) * Math.PI) / 180
  const rot: Qs = {
    ...IDENTITY_QS,
    qx: Math.sin(half),
    qw: Math.cos(half),
  }
  const out = { ...IDENTITY_QS }
  mulQsLocal(stacks[0], rot, out)
  stacks[0].qx = out.qx
  stacks[0].qy = out.qy
  stacks[0].qz = out.qz
  stacks[0].qw = out.qw
}

function applySwanNeck(stacks: [Qs, Qs, Qs], data: FppCameraDyn): void {
  let forwardShift = 0
  let verticalShift = 0
  const maxAngle = 90
  const forwardOffset = -data.lookAtPitchForwardOffset * (data.offset20cm ? 1 : 0)
  const weapon20cm = data.forwardOffsetValue * (data.offset20cm ? 1 : 0)
  if (data.pitchFinal <= 0) {
    const p = data.pitchFinal
    const p3 = p * p * p
    const max3 = maxAngle * maxAngle * maxAngle
    verticalShift = (p3 * (forwardOffset * data.lookAtPitchForwardDownRatio)) / max3
    forwardShift = (p3 * forwardOffset) / max3 + weapon20cm
  } else {
    const heightMult = -4
    const smoothMult = 6
    verticalShift =
      ((heightMult * forwardOffset) / maxAngle) *
      ((Math.atan((smoothMult * data.pitchFinal) / maxAngle) * 180) / Math.PI)
    forwardShift = data.pitchFinal * (forwardOffset / maxAngle) * 8 + weapon20cm
  }
  stacks[0].ty += verticalShift
  stacks[0].tz += forwardShift
  const upperBodyOffset = -(weapon20cm - weapon20cm * data.upperBodyPitch)
  stacks[2].tz += upperBodyOffset
}

function applyGameplayVehicle(
  result: { camera: Qs; chest: Qs },
  data: FppCameraDyn,
  pose: Pose,
  bones: BoneIds,
  rig: RigEntry
): void {
  const stacks0 = { ...IDENTITY_QS }
  getTransformMs(pose, rig, bones.aim, stacks0)
  const stacks1 = { ...IDENTITY_QS }
  mulInverseMulLocal(stacks0, result.chest, stacks1)
  stacks0.tx += data.vehicleCameraOffset.tx
  stacks0.ty += data.vehicleCameraOffset.ty
  stacks0.tz += data.vehicleCameraOffset.tz
  const r = { ...IDENTITY_QS }
  mulQsLocal(stacks0, data.vehicleCameraOffset, r)
  stacks0.qx = r.qx
  stacks0.qy = r.qy
  stacks0.qz = r.qz
  stacks0.qw = r.qw

  const temp = { ...IDENTITY_QS }
  mulInverseMulLocal(result.chest, result.camera, temp)
  mulQsLocal(stacks0, stacks1, result.chest)
  mulQsLocal(result.chest, temp, result.camera)
}

function applyGameplayCamera(
  data: FppCameraDyn,
  pose: Pose,
  bones: BoneIds,
  rig: RigEntry
): void {
  const result = {
    camera: { ...IDENTITY_QS },
    chest: { ...IDENTITY_QS },
  }
  getTransformMs(pose, rig, bones.camera, result.camera)
  getTransformMs(pose, rig, bones.chest, result.chest)

  applyGameplayVehicle(result, data, pose, bones, rig)

  if (data.yawOff < 1) applyGameplayYaw(result, data)

  if (data.pitchOff < 1) {
    const parentMS = { ...IDENTITY_QS }
    getTransformMs(pose, rig, bones.cog, parentMS)
    const stacks: [Qs, Qs, Qs] = [
      { ...IDENTITY_QS },
      { ...IDENTITY_QS },
      { ...IDENTITY_QS },
    ]
    mulInverseMulLocal(parentMS, result.camera, stacks[0])
    mulInverseMulLocal(result.camera, result.chest, stacks[1])
    applySwanNeck(stacks, data)
    applyGameplayPitch(stacks, data)
    const s0ms = { ...IDENTITY_QS }
    mulQsLocal(parentMS, stacks[0], s0ms)
    const proceduralChest = { ...IDENTITY_QS }
    mulQsLocal(s0ms, stacks[1], proceduralChest)
    result.chest = slerpQs(result.chest, proceduralChest, data.upperBodyPitch)
    mulQsLocal(s0ms, stacks[2], result.camera)
  }

  setBoneTransformMs(pose, rig, bones.chest, result.chest)
  setBoneTransformMs(pose, rig, bones.camera, result.camera)
}

function applySceneCamera(
  data: FppCameraDyn,
  pose: Pose,
  bones: BoneIds,
  rig: RigEntry
): void {
  const controlMS = { ...IDENTITY_QS }
  getTransformMs(pose, rig, bones.camera, controlMS)
  const aimLS = { ...IDENTITY_QS }
  const targetLS = { ...IDENTITY_QS }
  const upOffsetLs = { ...IDENTITY_QS }
  const upLs = { ...IDENTITY_QS }
  readBoneLs(pose, bones.aim, aimLS)
  readBoneLs(pose, bones.target, targetLS)
  readBoneLs(pose, bones.upOffset, upOffsetLs)
  readBoneLs(pose, bones.up, upLs)

  const camRot = eulerToQs(data.rollFinal, data.pitchFinal, data.yawFinal)

  if (data.sceneUseTrajectorySpace) {
    const aimMS = { ...IDENTITY_QS }
    mulQsLocal(controlMS, aimLS, aimMS)
    aimMS.qx = camRot.qx
    aimMS.qy = camRot.qy
    aimMS.qz = camRot.qz
    aimMS.qw = camRot.qw
    const targetDelta = { ...IDENTITY_QS }
    mulInverseMulLocal(aimLS, targetLS, targetDelta)
    mulInverseMulLocal(controlMS, aimMS, aimLS)
    mulQsLocal(aimLS, targetDelta, targetLS)
  } else if (data.t4UseCameraIdleOrientation) {
    const cameraBoneMs = { ...IDENTITY_QS }
    getTransformMs(pose, rig, bones.camera, cameraBoneMs)
    const targetDelta = { ...IDENTITY_QS }
    mulInverseMulLocal(aimLS, targetLS, targetDelta)
    const inv = { ...IDENTITY_QS }
    invertQsLocal(
      {
        ...IDENTITY_QS,
        qx: cameraBoneMs.qx,
        qy: cameraBoneMs.qy,
        qz: cameraBoneMs.qz,
        qw: cameraBoneMs.qw,
      },
      inv
    )
    const aimR = { ...IDENTITY_QS }
    mulQsLocal(inv, camRot, aimR)
    aimLS.qx = aimR.qx
    aimLS.qy = aimR.qy
    aimLS.qz = aimR.qz
    aimLS.qw = aimR.qw
    mulQsLocal(aimLS, targetDelta, targetLS)
  } else {
    const targetDelta = { ...IDENTITY_QS }
    mulInverseMulLocal(aimLS, targetLS, targetDelta)
    const aimR = { ...IDENTITY_QS }
    mulQsLocal(aimLS, camRot, aimR)
    aimLS.qx = aimR.qx
    aimLS.qy = aimR.qy
    aimLS.qz = aimR.qz
    aimLS.qw = aimR.qw
    mulQsLocal(aimLS, targetDelta, targetLS)
  }

  // scene vehicle procedural
  {
    const aimMS = { ...IDENTITY_QS }
    mulQsLocal(controlMS, aimLS, aimMS)
    mulQsLocal(aimMS, data.vehicleCameraOffset, aimMS)
    const targetDelta = { ...IDENTITY_QS }
    mulInverseMulLocal(aimLS, targetLS, targetDelta)
    mulInverseMulLocal(controlMS, aimMS, aimLS)
    mulQsLocal(aimLS, targetDelta, targetLS)
  }

  writeBoneLs(pose, bones.aim, aimLS)
  writeBoneLs(pose, bones.target, targetLS)
  writeBoneLs(pose, bones.up, upLs)
}

function applyParallax(
  data: FppCameraDyn,
  pose: Pose,
  bones: BoneIds,
  rig: RigEntry
): void {
  const o = data.cameraParallaxOffset
  if (data.cameraParallaxSpace === 0) {
    const ls = { ...IDENTITY_QS }
    if (!readBoneLs(pose, bones.camera, ls)) return
    ls.tx += o.x
    ls.ty += o.y
    ls.tz += o.z
    writeBoneLs(pose, bones.camera, ls)
  } else if (data.cameraParallaxSpace === 1) {
    const traj = { ...IDENTITY_QS }
    readBoneLs(pose, bones.trajectory, traj)
    const camMS = { ...IDENTITY_QS }
    getTransformMs(pose, rig, bones.camera, camMS)
    // rotate offset by trajectory rotation (approx: add offset in traj axes)
    camMS.tx += o.x
    camMS.ty += o.y
    camMS.tz += o.z
    setBoneTransformMs(pose, rig, bones.camera, camMS)
  } else {
    const camMS = { ...IDENTITY_QS }
    getTransformMs(pose, rig, bones.camera, camMS)
    camMS.tx += o.x
    camMS.ty += o.y
    camMS.tz += o.z
    setBoneTransformMs(pose, rig, bones.camera, camMS)
  }
}

function applyVehicleYawOffset(
  data: FppCameraDyn,
  pose: Pose,
  bones: BoneIds
): void {
  const o = data.vehicleYawOffset
  if (data.isInVehicleCombat) {
    const ls = { ...IDENTITY_QS }
    if (!readBoneLs(pose, bones.chest, ls)) return
    ls.tx += o.x
    ls.ty += o.y
    ls.tz += o.z
    writeBoneLs(pose, bones.chest, ls)
  } else {
    const ls = { ...IDENTITY_QS }
    if (!readBoneLs(pose, bones.camera, ls)) return
    ls.tx += o.x
    ls.ty += o.y
    ls.tz += o.z
    writeBoneLs(pose, bones.camera, ls)
  }
}

/** Apply FPPCamera Sample onto child pose. */
export function sampleFppCamera(data: FppCameraDyn, pose: Pose, rig: RigEntry): boolean {
  const bones = resolveBones(pose, rig)
  if (!bones) {
    data.properlyInitialised = false
    return false
  }
  data.properlyInitialised = true

  if (data.cameraSceneWeight >= 1) {
    applySceneCamera(data, pose, bones, rig)
    cachePose(data, pose, bones)
  } else if (Math.abs(data.cameraSceneWeight) < 1e-6) {
    if (data.gameplayCameraWeight >= 1) {
      applyGameplayCamera(data, pose, bones, rig)
      cachePose(data, pose, bones)
    } else {
      interpolateToCache(pose, data, bones, data.gameplayCameraWeight, true)
    }
  } else {
    const toScene = data.sceneMode || data.sceneTransitioningToGameplay
    if (toScene) {
      applySceneCamera(data, pose, bones, rig)
      interpolateToCache(pose, data, bones, 1 - data.cameraSceneWeight, false)
    } else {
      applyGameplayCamera(data, pose, bones, rig)
      interpolateToCache(pose, data, bones, data.cameraSceneWeight, false)
    }
  }

  applyParallax(data, pose, bones, rig)
  applyVehicleYawOffset(data, pose, bones)

  writeTrack(pose, rig, 'YawInput', data.yawFinal)
  writeTrack(pose, rig, 'YawRef', data.yawExternal)
  writeTrack(pose, rig, 'PitchInput', data.pitchFinal)
  writeTrack(pose, rig, 'PitchRef', data.pitchExternal)
  return true
}
