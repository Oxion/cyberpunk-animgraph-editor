/**
 * Engine AnimNode_FPPCamera::OnUpdate / UpdateInputs (+ Calculate*).
 */

import type { TypedStore } from '../TypedStore'
import type { ExtraFloatTrackCollector } from './extraTrackCollector'
import type { FppCameraDyn } from './fppCameraDyn'
import { createFppCameraDyn } from './fppCameraDyn'
import { FPP_CAMERA_EXTRA_TRACKS, FPP_CAMERA_PITCH } from './fppCameraKeys'
import type { SimInputBoard } from './SimInputBoard'
import { IDENTITY_QS, type Qs } from './poseFk'

/** Structural subset of WalkCtx — pass the walk context directly. */
export type FppCameraUpdateCtx = {
  board: SimInputBoard
  dt: number
  sharedVars: TypedStore
  fppCameraDyn: Map<string, FppCameraDyn>
  extraTracks: ExtraFloatTrackCollector
}

type CameraInput = {
  deltaYaw: number
  deltaPitch: number
  deltaRawYaw: number
  yawMin: number
  yawMax: number
  pitchMin: number
  pitchMax: number
  resetYawSpeed: number
  resetPitchSpeed: number
  t4Yaw: number
  t4Pitch: number
  t4Roll: number
  resetExternalsSpeed: number
  overrideYaw: number
  overridePitch: number
  deltaYawExternal: number
  deltaPitchExternal: number
  gameplayUpperBodyYawWeight: number
  gameplayUpperBodyPitchWeight: number
  isForwardOffset: number
  parallaxForward: number
  parallaxSide: number
  parallaxSpace: number
  aerialTakedownState: number
  rightHandItemHandlingItemState: number
  leftHandItemHandlingItemState: number
  quickMelee: number
  swimmingDataState: number
  mountingState: number
  sceneTier: number
  override: boolean
  normalizeYaw: boolean
  t4CopyPitchAndYaw: boolean
  headingLocked: boolean
  isTppRepresentationActive: boolean
  isInVehicle: boolean
  isYawOff: boolean
  isPitchOff: boolean
  useConsumableFromAnimFeature: boolean
  useConsumableFromAnimVariable: boolean
  isSceneCarrying: boolean
  isSceneMode: boolean
  lookAtOffsetVertical: number
  lookAtYawLeftOffset: number
  lookAtYawLeftUpOffset: number
  lookAtYawRightOffset: number
  lookAtYawRightUpOffset: number
  lookAtYawROffsetActiveAngle: number
  vehicleOffsetWeight: number
  vehicleProceduralCameraWeight: number
  parallaxForwardOffset: number
}

function feat(board: SimInputBoard, group: string, name: string, fb = 0): number {
  const v = board.getFeature(group, name)
  return v !== undefined ? v : fb
}

function featB(board: SimInputBoard, group: string, name: string, fb = false): boolean {
  const v = board.getBoolFeature(group, name)
  return v !== undefined ? v : fb
}

function featQ(board: SimInputBoard, group: string, name: string): Qs {
  const q = board.getQuatFeature(group, name)
  if (!q) return { ...IDENTITY_QS }
  return { ...IDENTITY_QS, qx: q.x, qy: q.y, qz: q.z, qw: q.w }
}

function featV(board: SimInputBoard, group: string, name: string): { x: number; y: number; z: number } {
  const v = board.getVectorFeature(group, name)
  if (!v) return { x: 0, y: 0, z: 0 }
  return { x: v.x, y: v.y, z: v.z }
}

function clampDegrees(a: number): number {
  let x = a
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

function dampFloat(
  current: number,
  target: number,
  dt: number,
  increaseSpeed = 1,
  decreaseSpeed = 1
): number {
  const diff = target - current
  if (diff === 0) return current
  const signed = diff >= 0 ? increaseSpeed : -decreaseSpeed
  const delta = signed * dt
  if (signed === 0 || Math.abs(diff) <= Math.abs(delta)) return target
  return current + delta
}

function resetValue(value: number, resetSpeed: number, dt: number): { value: number; reset: boolean } {
  if (Math.abs(resetSpeed) < 1e-8 || Math.abs(value) < 1e-8) return { value, reset: false }
  const delta = Math.abs(value * resetSpeed * dt)
  if (delta >= Math.abs(value) || Math.abs(value) < 0.1) return { value: 0, reset: true }
  return { value: value - Math.sign(value) * delta, reset: true }
}

function vehicleYawOffsetSigmoid(inputAngle: number, angleThreshold: number, offset: number): number {
  const thresholdAngle = 6.394 - 0.0015 * angleThreshold * angleThreshold + 0.606 * angleThreshold
  const e = 2.71828
  const falloffFactor = 0.5
  return (1 / (1 + Math.pow(e, -(inputAngle * falloffFactor - thresholdAngle)))) * offset
}

function vehicleCombatOffset(angle: number, offset: number): number {
  return (angle / 180) * offset
}

function lerpQs(a: Qs, b: Qs, t: number): Qs {
  const u = 1 - t
  return {
    tx: a.tx * u + b.tx * t,
    ty: a.ty * u + b.ty * t,
    tz: a.tz * u + b.tz * t,
    qx: a.qx * u + b.qx * t,
    qy: a.qy * u + b.qy * t,
    qz: a.qz * u + b.qz * t,
    qw: a.qw * u + b.qw * t,
    sx: a.sx * u + b.sx * t,
    sy: a.sy * u + b.sy * t,
    sz: a.sz * u + b.sz * t,
  }
}

function readInput(board: SimInputBoard): CameraInput {
  const resetSpeed = board.floatVars.get('input_reset_speed') ?? 0
  const headingLocked = (board.floatVars.get('heading_locked') ?? 0) > 0.001
  const quickMelee = board.intVars.get('quickmelee') ?? 0
  const useConsumable = board.boolVars.get('use_consumable') ?? false

  return {
    deltaYaw: feat(board, 'camera', 'deltaYaw') * feat(board, 'camera', 'yawMultiplier', 1),
    deltaPitch: feat(board, 'camera', 'deltaPitch') * feat(board, 'camera', 'pitchMultiplier', 1),
    deltaRawYaw: feat(board, 'camera', 'deltaYawInput'),
    yawMin: feat(board, 'camera', 'yawMaxRight'),
    yawMax: feat(board, 'camera', 'yawMaxLeft'),
    pitchMin: feat(board, 'camera', 'pitchMin'),
    pitchMax: feat(board, 'camera', 'pitchMax'),
    resetYawSpeed: Math.max(feat(board, 'camera', 'resetYawSpeed'), resetSpeed),
    resetPitchSpeed: Math.max(feat(board, 'camera', 'resetPitchSpeed'), resetSpeed),
    t4Yaw: feat(board, 'camera', 't4Yaw'),
    t4Pitch: feat(board, 'camera', 't4Pitch'),
    t4Roll: feat(board, 'camera', 't4Roll'),
    resetExternalsSpeed: feat(board, 'camera', 'resetExternalsSpeed'),
    overrideYaw: feat(board, 'camera', 'overrideYawInput') + feat(board, 'camera', 'overrideYawRef'),
    overridePitch:
      feat(board, 'camera', 'overridePitchInput') + feat(board, 'camera', 'overridePitchRef'),
    deltaYawExternal: feat(board, 'camera', 'deltaYawExternal'),
    deltaPitchExternal: feat(board, 'camera', 'deltaPitchExternal'),
    gameplayUpperBodyYawWeight: feat(board, 'CameraGameplay', 'upperbody_yaw_weight'),
    gameplayUpperBodyPitchWeight: feat(board, 'CameraGameplay', 'upperbody_pitch_weight'),
    isForwardOffset: feat(board, 'CameraGameplay', 'is_forward_offset'),
    parallaxForward: feat(board, 'camera', 'parallaxForward'),
    parallaxSide: feat(board, 'camera', 'parallaxSide'),
    parallaxSpace: feat(board, 'camera', 'parallaxSpace'),
    aerialTakedownState: feat(board, 'AerialTakedown', 'state'),
    rightHandItemHandlingItemState: feat(board, 'rightHandItemHandling', 'itemState'),
    leftHandItemHandlingItemState: feat(board, 'leftHandItemHandling', 'itemState'),
    quickMelee,
    swimmingDataState: feat(board, 'SwimmingData', 'state'),
    mountingState: feat(board, 'Mounting', 'mountingState'),
    sceneTier: feat(board, 'Scene', 'tier'),
    override: feat(board, 'camera', 'override') > 0.001,
    normalizeYaw: featB(board, 'camera', 'normalizeYaw'),
    t4CopyPitchAndYaw: featB(board, 'camera', 't4CopyPitchAndYaw'),
    headingLocked,
    isTppRepresentationActive: featB(board, 'TPPRepresentation', 'IsActive'),
    isInVehicle: featB(board, 'VehicleData', 'isInVehicle'),
    isYawOff: feat(board, 'CameraGameplay', 'is_yaw_off') > 0.001,
    isPitchOff: feat(board, 'CameraGameplay', 'is_pitch_off') > 0.001,
    useConsumableFromAnimFeature: featB(board, 'ConsumableFeature', 'useConsumable'),
    useConsumableFromAnimVariable: useConsumable,
    isSceneCarrying: featB(board, 'SceneCarrying', 'carrying'),
    isSceneMode: featB(board, 'camera', 'isSceneMode'),
    lookAtOffsetVertical: feat(board, 'CameraBodyOffset', 'lookat_offset_vertical'),
    lookAtYawLeftOffset: feat(board, 'CameraBodyOffset', 'lookat_yaw_left_offset'),
    lookAtYawLeftUpOffset: feat(board, 'CameraBodyOffset', 'lookat_yaw_left_up_offset'),
    lookAtYawRightOffset: feat(board, 'CameraBodyOffset', 'lookat_yaw_right_offset'),
    lookAtYawRightUpOffset: feat(board, 'CameraBodyOffset', 'lookat_yaw_right_up_offset'),
    lookAtYawROffsetActiveAngle: feat(board, 'CameraBodyOffset', 'lookat_yaw_offset_active_angle'),
    vehicleOffsetWeight: feat(board, 'camera', 'vehicleOffsetWeight'),
    vehicleProceduralCameraWeight: feat(board, 'camera', 'vehicleProceduralCameraWeight'),
    parallaxForwardOffset: feat(board, 'CameraBodyOffset', 'paralax_forward_offset'),
  }
}

function calcPitch(input: CameraInput, data: FppCameraDyn, ctx: FppCameraUpdateCtx): void {
  if (input.t4CopyPitchAndYaw) {
    data.pitchBase = input.t4Pitch
  } else {
    if (ctx.board.externalEvents.has('input_reset_pitch')) data.pitchBase = 0
    else {
      const r = resetValue(data.pitchBase, input.resetPitchSpeed, ctx.dt)
      if (!r.reset) {
        data.pitchBase = clampDegrees(data.pitchBase + input.deltaPitch)
        data.pitchBase = Math.min(input.pitchMax, Math.max(input.pitchMin, data.pitchBase))
      } else data.pitchBase = r.value
    }
  }
  {
    const r = resetValue(data.pitchExternal, input.resetExternalsSpeed, ctx.dt)
    if (!r.reset) data.pitchExternal = clampDegrees(data.pitchExternal + input.deltaPitchExternal)
    else data.pitchExternal = r.value
  }
  data.pitchFinal = input.override ? input.overridePitch : data.pitchBase + data.pitchExternal
}

function calcYaw(input: CameraInput, data: FppCameraDyn, ctx: FppCameraUpdateCtx): void {
  if (input.t4CopyPitchAndYaw) {
    data.yawBase = input.t4Yaw
  } else {
    if (ctx.board.externalEvents.has('input_reset_yaw')) data.yawBase = 0
    else {
      const r = resetValue(data.yawBase, input.resetYawSpeed, ctx.dt)
      if (!r.reset) {
        data.yawBase = data.yawBase + input.deltaYaw
        if (input.normalizeYaw) data.yawBase = clampDegrees(data.yawBase)
        data.yawBase = Math.min(input.yawMax, Math.max(input.yawMin, data.yawBase))
      } else data.yawBase = r.value
    }
  }
  {
    const r = resetValue(data.yawExternal, input.resetExternalsSpeed, ctx.dt)
    if (!r.reset) data.yawExternal = clampDegrees(data.yawExternal + input.deltaYawExternal)
    else data.yawExternal = r.value
  }
  data.yawFinal = input.override ? input.overrideYaw : data.yawBase + data.yawExternal
}

function calcOther(input: CameraInput, data: FppCameraDyn, ctx: FppCameraUpdateCtx): void {
  data.yawOff =
    1 -
    (input.headingLocked || input.isTppRepresentationActive || input.isInVehicle || input.isYawOff
      ? 1
      : 0)
  data.pitchOff =
    1 -
    (input.aerialTakedownState !== 1 ||
    input.isTppRepresentationActive ||
    input.isInVehicle ||
    input.isPitchOff
      ? 1
      : 0)
  data.sceneMode = input.isSceneMode || input.sceneTier > 2
  data.offset20cm = input.isForwardOffset > 0
  if (data.sceneMode || data.sceneTransitioningToGameplay) {
    data.cameraSceneWeight = Math.min(data.cameraSceneWeight + ctx.dt * 3, 1)
  } else {
    data.cameraSceneWeight = Math.max(data.cameraSceneWeight - ctx.dt, 0)
  }
  const order = ctx.board.lastFrameAnimEventValues.get('pitch_yaw_order_event')
  if (order !== undefined) data.pitchYawOrderFlip = order > 0.001
}

function calcUpperBodyPitch(input: CameraInput, data: FppCameraDyn, dt: number): void {
  if (input.gameplayUpperBodyPitchWeight > 0) {
    data.upperBodyPitch = input.gameplayUpperBodyPitchWeight
    return
  }
  const fullOverride =
    input.leftHandItemHandlingItemState > 0 ||
    input.rightHandItemHandlingItemState > 0 ||
    input.quickMelee !== 0 ||
    input.useConsumableFromAnimFeature ||
    input.useConsumableFromAnimVariable ||
    input.swimmingDataState === 3
  const partOverride = input.mountingState === 2 || input.isSceneCarrying ? 1 : 0
  data.upperBodypartOverride = dampFloat(data.upperBodypartOverride, partOverride, dt)
  data.upperBodyPitch = (fullOverride ? 1 : 0) + data.upperBodypartOverride * 0.5
}

function calcUpperBodyYaw(input: CameraInput, data: FppCameraDyn, dt: number): void {
  let target = input.gameplayUpperBodyYawWeight
  if (input.gameplayUpperBodyYawWeight <= 0) {
    target = Math.min(
      (input.rightHandItemHandlingItemState > 0 ? 1 : 0) +
        (input.leftHandItemHandlingItemState > 0 ? 1 : 0) +
        (input.quickMelee ? 1 : 0),
      1
    )
  }
  data.upperBodyYaw = dampFloat(data.upperBodyYaw, target, dt)
}

function calcVehicleYaw(input: CameraInput, data: FppCameraDyn): void {
  if (Math.abs(input.vehicleOffsetWeight) < 1e-8) {
    data.vehicleYawOffset = { x: 0, y: 0, z: 0 }
    return
  }
  const useInput2 = data.yawFinal < 0
  let side = 0
  let up = 0
  let forward = 0
  if (data.isInVehicleCombat) {
    if (useInput2) {
      side = -vehicleCombatOffset(Math.abs(data.yawFinal), input.lookAtYawRightOffset)
      up = vehicleCombatOffset(Math.abs(data.yawFinal), input.lookAtYawRightUpOffset)
      forward = -vehicleCombatOffset(Math.abs(data.yawFinal), input.parallaxForwardOffset)
    } else {
      side = vehicleCombatOffset(data.yawFinal, input.lookAtYawLeftOffset)
      up = vehicleCombatOffset(data.yawFinal, input.lookAtYawLeftUpOffset)
      forward = vehicleCombatOffset(Math.abs(data.yawFinal), input.parallaxForwardOffset)
    }
  } else if (useInput2) {
    side = -vehicleYawOffsetSigmoid(
      Math.abs(data.yawFinal),
      input.lookAtYawROffsetActiveAngle,
      input.lookAtYawRightOffset
    )
    up = vehicleYawOffsetSigmoid(
      Math.abs(data.yawFinal),
      input.lookAtYawROffsetActiveAngle,
      input.lookAtYawRightUpOffset
    )
  } else {
    side = vehicleYawOffsetSigmoid(
      data.yawFinal,
      input.lookAtYawROffsetActiveAngle,
      input.lookAtYawLeftOffset
    )
    up = vehicleYawOffsetSigmoid(
      data.yawFinal,
      input.lookAtYawROffsetActiveAngle,
      input.lookAtYawLeftUpOffset
    )
  }
  const w = input.vehicleOffsetWeight
  data.vehicleYawOffset = {
    x: side * w,
    y: (up + input.lookAtOffsetVertical) * w,
    z: forward * w,
  }
}

function calcParallax(input: CameraInput, data: FppCameraDyn, dt: number): void {
  const useScene = data.sceneMode || data.sceneTransitioningToGameplay
  let maxDistance = 0
  let globalWeight = 0
  let side = 0
  if (useScene) {
    data.sceneParallaxWeight = dampFloat(
      data.sceneParallaxWeight,
      data.sceneMode ? 1 : 0,
      dt,
      1,
      2
    )
    globalWeight = data.sceneParallaxWeight
    side = input.parallaxSide
    maxDistance = 0.08
  } else {
    const deltaYaw = Math.min(2, Math.max(-2, input.deltaRawYaw * 0.666))
    data.rawYawDelayed = dampFloat(data.rawYawDelayed, deltaYaw, dt, 0.1, 0.1)
    const direction = data.rawYawDelayed - deltaYaw
    const directionAbs = Math.abs(direction)
    let directionAfterCurve = directionAbs < 2 ? directionAbs : (directionAbs - 2) / 3
    if (directionAfterCurve < 0) directionAfterCurve = 0
    if (direction < 0) directionAfterCurve = -directionAfterCurve
    const sign = directionAfterCurve * direction
    const someValue = sign > 0 ? directionAbs : -directionAbs
    const someValue2 = someValue * (input.rightHandItemHandlingItemState === 1 ? 1 : 0)
    const pitchAbs = Math.abs(data.pitchFinal)
    let pitchCurve = pitchAbs < 30 ? 1 : (pitchAbs - 30) / 60
    if (data.pitchFinal < 0) pitchCurve = -pitchCurve
    globalWeight = 0.55
    maxDistance = 0.5
    side = (someValue2 / 20) * pitchCurve
  }
  const parallaxSide = side * maxDistance * globalWeight
  const parallaxForward = input.parallaxForward * maxDistance * globalWeight
  data.cameraParallaxSpace = input.parallaxSpace | 0
  if (data.cameraParallaxSpace === 0) {
    data.cameraParallaxOffset = { x: parallaxSide, y: 0, z: -parallaxForward }
  } else if (data.cameraParallaxSpace === 1) {
    data.cameraParallaxOffset = { x: -parallaxSide, y: -parallaxForward, z: 0 }
  } else {
    data.cameraParallaxOffset = { x: 0, y: parallaxForward, z: -parallaxSide }
  }
}

/** Run FPPCamera Update for one node; publishes shared pitch. */
export function updateFppCamera(handleId: string, ctx: FppCameraUpdateCtx): FppCameraDyn {
  let data = ctx.fppCameraDyn.get(handleId)
  if (!data) {
    data = createFppCameraDyn()
    ctx.fppCameraDyn.set(handleId, data)
  }

  for (const n of FPP_CAMERA_EXTRA_TRACKS) ctx.extraTracks.mark(n)

  const board = ctx.board
  const input = readInput(board)

  data.fov = feat(board, 'camera', 'fov', 51)
  data.forwardOffsetValue = feat(board, 'CameraGameplay', 'forward_offset_value')
  data.lookAtPitchForwardOffset = feat(board, 'CameraBodyOffset', 'lookat_pitch_forward_offset')
  data.sceneUseTrajectorySpace = featB(board, 'camera', 'sceneCameraUseTrajectorySpace')
  data.lookAtPitchForwardDownRatio = feat(
    board,
    'CameraBodyOffset',
    'lookat_pitch_forward_down_ratio'
  )
  data.sceneTransitioningToGameplay = featB(board, 'camera', 'sceneTransitioningToGameplay')
  data.isInVehicleCombat =
    featB(board, 'VehicleData', 'isInDriverCombat') ||
    featB(board, 'VehicleData', 'isInWindowCombat')
  data.t4UseCameraIdleOrientationPrev = data.t4UseCameraIdleOrientation
  data.t4UseCameraIdleOrientation = featB(board, 'camera', 't4UseCameraIdleOrientation')
  data.t4CameraIdleOrientation = featQ(board, 'camera', 't4CameraIdleOrientation')
  data.gameplayCameraWeight = feat(board, 'camera', 'gameplayCameraPoseWeight', 1)
  data.t4CameraControlIdleOrientation = featQ(board, 'camera', 't4CameraControlIdleOrientation')

  {
    const pos = featV(board, 'vehicleProceduralCamera', 'cameraTranslationVS')
    const ori = featQ(board, 'vehicleProceduralCamera', 'cameraOrientationVS')
    const w = input.vehicleOffsetWeight * input.vehicleProceduralCameraWeight
    const vehicle: Qs = {
      ...IDENTITY_QS,
      tx: pos.x,
      ty: pos.y,
      tz: pos.z,
      qx: ori.qx,
      qy: ori.qy,
      qz: ori.qz,
      qw: ori.qw,
    }
    data.vehicleCameraOffset = lerpQs(IDENTITY_QS, vehicle, w)
  }

  calcPitch(input, data, ctx)
  calcYaw(input, data, ctx)
  data.rollFinal = input.t4Roll * (input.t4CopyPitchAndYaw ? 1 : 0)
  calcUpperBodyYaw(input, data, ctx.dt)
  calcUpperBodyPitch(input, data, ctx.dt)
  calcVehicleYaw(input, data)
  calcOther(input, data, ctx)
  calcParallax(input, data, ctx.dt)

  ctx.sharedVars.set(FPP_CAMERA_PITCH, data.pitchFinal)
  return data
}

/** OnActivated — reset bases (engine). */
export function activateFppCamera(data: FppCameraDyn): void {
  data.yawBase = 0
  data.pitchBase = 0
  data.yawExternal = 0
  data.pitchExternal = 0
}
