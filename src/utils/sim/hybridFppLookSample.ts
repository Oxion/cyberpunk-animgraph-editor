/**
 * Editor/mod node nrAnimNode_HybridFPPLook — Sample.
 * Same feature dyn as FPPCamera (Update), different gameplay pitch: root-space
 * chest share + skinned spine/neck + snappy Control residual. Does not modify
 * animAnimNode_FPPCamera.
 */

import type { FppCameraDyn } from './fppCameraDyn'
import { FPP_BONE } from './fppCameraDyn'
import type { Pose } from './pose'
import { writeExtraTrack } from './pose'
import {
  IDENTITY_QS,
  getTransformMs,
  readBoneLs,
  resolveUnifiedName,
  rotateBoneByAngle,
  setBoneTransformMs,
  slerpQs,
  writeBoneLs,
  type Qs,
} from './poseFk'
import type { RigEntry } from './rigResource'
import { sampleFppCamera } from './fppCameraSample'

/**
 * Soft chest + neck/spine follow look. Arms tip at LeftArm/RightArm to track aim.
 */
export const HYBRID_FPP_PITCH = {
  /** TEMP: chest/spine off — arms only. */
  chestWeightMax: 0,
  chestEngageDeg: 70,
  spine2Weight: 0,
  spine3Weight: 0,
  neckWeight: 0.45,
  neck1Weight: 0.12,
  armMatch: 1,
  lookDownForward: 0.1,
  lookDownDown: 0.05,
} as const

/** 0 at neutral → 1 at chestEngageDeg (smoothstep). */
function chestEngage01(pitchDeg: number): number {
  const t = Math.min(1, Math.abs(pitchDeg) / HYBRID_FPP_PITCH.chestEngageDeg)
  return t * t * (3 - 2 * t)
}

/** Neck stays strong through mid look; only mild fade when chest finally comes in. */
function neckEngage01(pitchDeg: number): number {
  const a = Math.min(1, Math.abs(pitchDeg) / 35)
  const rise = a * a * (3 - 2 * a)
  const chest = chestEngage01(pitchDeg)
  return rise * (1 - 0.2 * chest)
}

type BoneIds = {
  camera: number
  chest: number
  cog: number
  aim: number
  target: number
  upOffset: number
  up: number
  trajectory: number
  spine2: number
  spine3: number
  neck: number
  neck1: number
  leftArm: number
  rightArm: number
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
  const spine2 = resolveUnifiedName(pose, rig, 'Spine2')
  const spine3 = resolveUnifiedName(pose, rig, FPP_BONE.spine3)
  const neck = resolveUnifiedName(pose, rig, 'Neck')
  const neck1 = resolveUnifiedName(pose, rig, 'Neck1')
  const leftArm = resolveUnifiedName(pose, rig, 'LeftArm')
  const rightArm = resolveUnifiedName(pose, rig, 'RightArm')
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
    spine2,
    spine3,
    neck,
    neck1,
    leftArm,
    rightArm,
  }
}

function quatRotateVec(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  vx: number,
  vy: number,
  vz: number
): [number, number, number] {
  const ix = qw * vx + qy * vz - qz * vy
  const iy = qw * vy + qz * vx - qx * vz
  const iz = qw * vz + qx * vy - qy * vx
  const iw = -qx * vx - qy * vy - qz * vz
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

/** Same as CombatRebornFpp PitchArmAroundAxis — MS axis angle, then setBoneTransformMs. */
function pitchBoneMsAroundAxis(
  pose: Pose,
  rig: RigEntry,
  bone: number,
  ax: number,
  ay: number,
  az: number,
  pitchDeg: number
): void {
  if (bone < 0 || Math.abs(pitchDeg) < 1e-4) return
  const ms = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, bone, ms)) return
  const alen = Math.hypot(ax, ay, az)
  if (alen < 1e-8) return
  const nx = ax / alen
  const ny = ay / alen
  const nz = az / alen
  const half = (pitchDeg * Math.PI) / 180 / 2
  const s = Math.sin(half)
  const c = Math.cos(half)
  const rqx = nx * s
  const rqy = ny * s
  const rqz = nz * s
  const rqw = c
  const oqx = rqw * ms.qx + rqx * ms.qw + rqy * ms.qz - rqz * ms.qy
  const oqy = rqw * ms.qy - rqx * ms.qz + rqy * ms.qw + rqz * ms.qx
  const oqz = rqw * ms.qz + rqx * ms.qy - rqy * ms.qx + rqz * ms.qw
  const oqw = rqw * ms.qw - rqx * ms.qx - rqy * ms.qy - rqz * ms.qz
  ms.qx = oqx
  ms.qy = oqy
  ms.qz = oqz
  ms.qw = oqw
  setBoneTransformMs(pose, rig, bone, ms)
}

/**
 * Mirror of red4ext ApplyArmTipFollow: pitch LeftArm/RightArm around L→R shoulder line.
 * Passes −pitch into axis rot to match QsPitchRot / PitchArmAroundAxis.
 */
function applyArmShoulderLinePitch(
  pose: Pose,
  bones: BoneIds,
  rig: RigEntry,
  pitchDeg: number
): void {
  const armPitch = pitchDeg * HYBRID_FPP_PITCH.armMatch
  if (Math.abs(armPitch) < 1e-3) return
  if (bones.leftArm < 0 && bones.rightArm < 0) return

  const lMs = { ...IDENTITY_QS }
  const rMs = { ...IDENTITY_QS }
  getTransformMs(pose, rig, bones.leftArm, lMs)
  getTransformMs(pose, rig, bones.rightArm, rMs)
  let ax = rMs.tx - lMs.tx
  let ay = rMs.ty - lMs.ty
  let az = rMs.tz - lMs.tz
  const alen = Math.hypot(ax, ay, az)
  if (alen > 1e-4) {
    ax /= alen
    ay /= alen
    az /= alen
  } else {
    ax = 1
    ay = 0
    az = 0
  }
  // C++: QsRotateMsAroundAxis(..., -pitchDeg)
  pitchBoneMsAroundAxis(pose, rig, bones.leftArm, ax, ay, az, -armPitch)
  pitchBoneMsAroundAxis(pose, rig, bones.rightArm, ax, ay, az, -armPitch)
}

function copyQs(src: Qs): Qs {
  return { ...src }
}

function mulQsLocal(parent: Qs, local: Qs, out: Qs): void {
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

function pitchRotQs(pitchDeg: number): Qs {
  const half = ((-pitchDeg * 0.5) * Math.PI) / 180
  return { ...IDENTITY_QS, qx: Math.sin(half), qw: Math.cos(half) }
}

function mulRotOntoQs(base: Qs, rot: Qs, out: Qs): void {
  const tmp = { ...IDENTITY_QS }
  mulQsLocal(base, rot, tmp)
  out.qx = tmp.qx
  out.qy = tmp.qy
  out.qz = tmp.qz
  out.qw = tmp.qw
  out.tx = base.tx
  out.ty = base.ty
  out.tz = base.tz
  out.sx = base.sx
  out.sy = base.sy
  out.sz = base.sz
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
  const rot: Qs = { ...IDENTITY_QS, qy: Math.sin(half), qw: Math.cos(half) }
  mulQsLocal(stacks0, rot, stacks0)
  mulQsLocal(cameraMS, stacks0, result.camera)
  const chestBlended = { ...IDENTITY_QS }
  mulQsLocal(result.camera, stacks1, chestBlended)
  result.chest = slerpQs(result.chest, chestBlended, data.upperBodyYaw)
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

function applyGameplayPitch(stacks: [Qs, Qs, Qs], data: FppCameraDyn): void {
  const rot = pitchRotQs(data.pitchFinal)
  const out = { ...IDENTITY_QS }
  mulQsLocal(stacks[0], rot, out)
  stacks[0].qx = out.qx
  stacks[0].qy = out.qy
  stacks[0].qz = out.qz
  stacks[0].qw = out.qw
}

/** Look-down translation on Control LS (cubic falloff like swan-neck). */
function applyHybridLookDownShift(controlLs: Qs, pitchDeg: number): void {
  if (pitchDeg >= 0) return
  const t = Math.min(1, (-pitchDeg) / 90)
  const w = t * t * t
  controlLs.tz += HYBRID_FPP_PITCH.lookDownForward * w
  controlLs.ty -= HYBRID_FPP_PITCH.lookDownDown * w
}

/**
 * Armed cascade: Control residual (eyes) dominates at small pitch; neck/spine next;
 * Chest around COG ramps with |pitch|. Holstered: Control-only from COG.
 */
function applyHybridGameplayCamera(
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

  if (data.yawOff < 1) applyGameplayYaw(result, data)

  if (data.pitchOff < 1) {
    const cogMS = { ...IDENTITY_QS }
    getTransformMs(pose, rig, bones.cog, cogMS)

    const chestRel = { ...IDENTITY_QS }
    mulInverseMulLocal(cogMS, result.chest, chestRel)
    const camRelChest = { ...IDENTITY_QS }
    mulInverseMulLocal(result.chest, result.camera, camRelChest)
    const camRelCog = { ...IDENTITY_QS }
    mulInverseMulLocal(cogMS, result.camera, camRelCog)

    const ub = data.upperBodyPitch
    const pitch = data.pitchFinal

    if (ub < 1e-6) {
      const stacks: [Qs, Qs, Qs] = [
        copyQs(camRelCog),
        { ...IDENTITY_QS },
        { ...IDENTITY_QS },
      ]
      applySwanNeck(stacks, data)
      applyGameplayPitch(stacks, data)
      const s0ms = { ...IDENTITY_QS }
      mulQsLocal(cogMS, stacks[0], s0ms)
      mulQsLocal(s0ms, stacks[2], result.camera)
    } else {
      const engage = chestEngage01(pitch)
      const chestPitch = pitch * ub * HYBRID_FPP_PITCH.chestWeightMax * engage
      const residualPitch = pitch - chestPitch

      mulRotOntoQs(chestRel, pitchRotQs(chestPitch), chestRel)
      mulQsLocal(cogMS, chestRel, result.chest)

      const controlLs = copyQs(camRelChest)
      applyHybridLookDownShift(controlLs, pitch)
      {
        const stacks: [Qs, Qs, Qs] = [
          { ...IDENTITY_QS },
          { ...IDENTITY_QS },
          { ...IDENTITY_QS },
        ]
        applySwanNeck(stacks, data)
        controlLs.ty += stacks[0].ty
        controlLs.tz += stacks[0].tz
        controlLs.tz += stacks[2].tz
      }
      mulRotOntoQs(controlLs, pitchRotQs(residualPitch), controlLs)
      mulQsLocal(result.chest, controlLs, result.camera)

      const desiredRel = copyQs(camRelCog)
      mulRotOntoQs(desiredRel, pitchRotQs(pitch), desiredRel)
      const desiredMS = { ...IDENTITY_QS }
      mulQsLocal(cogMS, desiredRel, desiredMS)
      result.camera.qx = desiredMS.qx
      result.camera.qy = desiredMS.qy
      result.camera.qz = desiredMS.qz
      result.camera.qw = desiredMS.qw

      const neckScale = ub * neckEngage01(pitch)
      const spineScale = ub * (0.85 + 0.15 * engage)
      const meshPitch = pitch
      if (bones.neck >= 0) {
        rotateBoneByAngle(
          pose,
          rig,
          bones.neck,
          'X_Axis',
          meshPitch * HYBRID_FPP_PITCH.neckWeight * neckScale,
          true
        )
      }
      if (bones.neck1 >= 0) {
        rotateBoneByAngle(
          pose,
          rig,
          bones.neck1,
          'X_Axis',
          meshPitch * HYBRID_FPP_PITCH.neck1Weight * neckScale,
          true
        )
      }
      rotateBoneByAngle(
        pose,
        rig,
        bones.spine3,
        'X_Axis',
        meshPitch * HYBRID_FPP_PITCH.spine3Weight * spineScale,
        true
      )
      if (bones.spine2 >= 0) {
        rotateBoneByAngle(
          pose,
          rig,
          bones.spine2,
          'X_Axis',
          meshPitch * HYBRID_FPP_PITCH.spine2Weight * spineScale,
          true
        )
      }

      setBoneTransformMs(pose, rig, bones.chest, result.chest)
      setBoneTransformMs(pose, rig, bones.camera, result.camera)
      // Same as red4ext ApplyArmTipFollow (after chest/cam write).
      applyArmShoulderLinePitch(pose, bones, rig, pitch)
      return
    }
  }

  setBoneTransformMs(pose, rig, bones.chest, result.chest)
  setBoneTransformMs(pose, rig, bones.camera, result.camera)
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
  } else {
    const camMS = { ...IDENTITY_QS }
    getTransformMs(pose, rig, bones.camera, camMS)
    camMS.tx += o.x
    camMS.ty += o.y
    camMS.tz += o.z
    setBoneTransformMs(pose, rig, bones.camera, camMS)
  }
}

function writeTrack(pose: Pose, name: string, value: number): void {
  writeExtraTrack(pose, name, value)
}

/**
 * Sample hybrid FPP look. Scene-weighted paths delegate to vanilla FPPCamera sample.
 */
export function sampleHybridFppLook(
  data: FppCameraDyn,
  pose: Pose,
  rig: RigEntry
): boolean {
  if (data.cameraSceneWeight >= 1e-6) {
    return sampleFppCamera(data, pose, rig)
  }

  const bones = resolveBones(pose, rig)
  if (!bones) {
    data.properlyInitialised = false
    return false
  }
  data.properlyInitialised = true

  if (data.gameplayCameraWeight >= 1) {
    applyHybridGameplayCamera(data, pose, bones, rig)
  } else {
    return sampleFppCamera(data, pose, rig)
  }

  applyParallax(data, pose, bones, rig)
  writeTrack(pose, 'YawInput', data.yawFinal)
  writeTrack(pose, 'YawRef', data.yawExternal)
  writeTrack(pose, 'PitchInput', data.pitchFinal)
  writeTrack(pose, 'PitchRef', data.pitchExternal)
  return true
}

/** Node type id for editor / graph JSON (not a REDengine class). */
export const HYBRID_FPP_LOOK_NODE_TYPE = 'nrAnimNode_HybridFPPLook' as const
