import type { Qs } from './poseFk'
import { IDENTITY_QS } from './poseFk'

/** Engine FPPCameraInstanceData — per-node dyn (Map handleId → this). */
export type FppCameraDyn = {
  yawBase: number
  pitchBase: number
  yawExternal: number
  pitchExternal: number
  yawFinal: number
  pitchFinal: number
  rollFinal: number
  rawYawDelayed: number
  upperBodyYaw: number
  upperBodyPitch: number
  upperBodypartOverride: number
  yawOff: number
  pitchOff: number
  fov: number
  forwardOffsetValue: number
  lookAtPitchForwardOffset: number
  lookAtPitchForwardDownRatio: number
  sceneParallaxWeight: number
  cameraSceneWeight: number
  gameplayCameraWeight: number
  sceneMode: boolean
  sceneUseTrajectorySpace: boolean
  sceneTransitioningToGameplay: boolean
  isInVehicleCombat: boolean
  pitchYawOrderFlip: boolean
  offset20cm: boolean
  t4UseCameraIdleOrientation: boolean
  t4UseCameraIdleOrientationPrev: boolean
  properlyInitialised: boolean
  vehicleYawOffset: { x: number; y: number; z: number }
  cameraParallaxOffset: { x: number; y: number; z: number }
  cameraParallaxSpace: number
  vehicleCameraOffset: Qs
  t4CameraIdleOrientation: Qs
  t4CameraControlIdleOrientation: Qs
  /** Cached LS poses for scene↔gameplay interpolate */
  cameraControlLS: Qs
  cameraChestLS: Qs
  cameraAimLS: Qs
  cameraTargetLS: Qs
  cameraUpOffsetLS: Qs
  cameraUpLS: Qs
  cameraTorsoCogLS: Qs
}

export function createFppCameraDyn(): FppCameraDyn {
  return {
    yawBase: 0,
    pitchBase: 0,
    yawExternal: 0,
    pitchExternal: 0,
    yawFinal: 0,
    pitchFinal: 0,
    rollFinal: 0,
    rawYawDelayed: 0,
    upperBodyYaw: 0,
    upperBodyPitch: 0,
    upperBodypartOverride: 0,
    yawOff: 0,
    pitchOff: 0,
    fov: 51,
    forwardOffsetValue: 0,
    lookAtPitchForwardOffset: 0,
    lookAtPitchForwardDownRatio: 0,
    sceneParallaxWeight: 0,
    cameraSceneWeight: 0,
    gameplayCameraWeight: 1,
    sceneMode: false,
    sceneUseTrajectorySpace: false,
    sceneTransitioningToGameplay: false,
    isInVehicleCombat: false,
    pitchYawOrderFlip: false,
    offset20cm: false,
    t4UseCameraIdleOrientation: false,
    t4UseCameraIdleOrientationPrev: true,
    properlyInitialised: true,
    vehicleYawOffset: { x: 0, y: 0, z: 0 },
    cameraParallaxOffset: { x: 0, y: 0, z: 0 },
    cameraParallaxSpace: 0,
    vehicleCameraOffset: { ...IDENTITY_QS },
    t4CameraIdleOrientation: { ...IDENTITY_QS },
    t4CameraControlIdleOrientation: { ...IDENTITY_QS },
    cameraControlLS: { ...IDENTITY_QS },
    cameraChestLS: { ...IDENTITY_QS },
    cameraAimLS: { ...IDENTITY_QS },
    cameraTargetLS: { ...IDENTITY_QS },
    cameraUpOffsetLS: { ...IDENTITY_QS },
    cameraUpLS: { ...IDENTITY_QS },
    cameraTorsoCogLS: { ...IDENTITY_QS },
  }
}

export const FPP_BONE = {
  camera: 'Torso_fppCamera_Control_GRP',
  chest: 'Torso_Chest_Control_GRP',
  cog: 'Torso_COG_Control_JNT',
  aim: 'Torso_fppCamera_Aim_JNT',
  target: 'Torso_fppCamera_Target_JNT',
  upOffset: 'Torso_fppCamera_UpOffset_GRP',
  up: 'Torso_fppCamera_Up_GRP',
  trajectory: 'Trajectory',
  spine3: 'Spine3',
} as const
