/**
 * Per-node LookAtController dyn — requests + sphere cache + follower state.
 */

import { InstanceStateDef } from '../InstanceStore'
import type { SimVec4 } from './evalAnimMathExpressionVector'
import type { LookAtSphereXf } from './lookAtMath'
import { IDENTITY_SPHERE_XF } from './lookAtMath'
import {
  defaultLookAtLimits,
  defaultLookAtRequest,
  type SimLookAtPartRequest,
  type SimLookAtRef,
  type SimLookAtRequest,
} from './simServiceEvents'

export type LookAtActiveRequest = {
  ref: SimLookAtRef
  request: SimLookAtRequest
  targetWs: SimVec4
}

export type LookAtPartOutput = {
  isEnabled: boolean
  target: SimVec4
  rawTarget: SimVec4
  distance: number
  suppress: number
  mode: number
  blendWeight: number
}

export type LookAtPartSphere = {
  xf: LookAtSphereXf
  radius: number
  bone: string
}

/** Master SM sphere-space snapshot for follower Set(). */
export type LookAtMasterSphereOut = {
  spherePt: SimVec4
  distance: number
  xf: LookAtSphereXf
  radius: number
  suppress: number
  mode: number
  isEnabled: boolean
}

/** One LookAtStateData (id 0 = default). */
export type LookAtSmStateDyn = {
  id: number
  request: SimLookAtRequest
  targetWs: SimVec4
  lastTargetSphere: SimVec4
  lastLimitedSphere: SimVec4
  /** Parent-space cache (engine lastTargetPositionParentSpace); WS≡MS when L2W identity. */
  lastTargetParentSpace: SimVec4
  distance: number
  firstUpdateDone: boolean
  softLimitReached: boolean
  hardLimitReached: boolean
  isTargetMovingBehindBack: boolean
  moveBehindBackTimer: number
}

/** i_preTransitionStatus blend accumulator. */
export type LookAtSmPreOut = {
  empty: boolean
  spherePt: SimVec4
  distance: number
  isDefaultState: number
  suppress: number
  mode: number
  additionalParts: SimLookAtPartRequest[]
}

/** Per-master LookAtStateMachine instance. */
export type LookAtMasterSmDyn = {
  states: Map<number, LookAtSmStateDyn>
  transition: {
    newId: number
    weight: number
    time: number
    duration: number
  }
  pre: LookAtSmPreOut
  /** Blended publish cache (GetRawOutput / GetOutput). */
  publishedSphere: SimVec4
  publishedDistance: number
  publishedSuppress: number
  publishedMode: number
  publishedIsDefault: number
  /** Blended additionalParts (suppress already × enableFloatTrack). */
  publishedAdditionalParts: SimLookAtPartRequest[]
  blendWeight: number
  /** enableFloatTrack (and Eyes override) → GetOutput parametersBlendWeight. */
  enableFloatTrackValue: number
  softLimitReached: boolean
  hardLimitReached: boolean
  isEnabled: boolean
}

/** Per-slave LookAtFollower instance state. */
export type LookAtFollowerDyn = {
  centerSphere: SimVec4
  followTargetSphere: SimVec4
  offsetMs: SimVec4
  /** Slave defaultPositionBone MS (engine i_defaultTargetPositionMs). */
  defaultTargetMs: SimVec4
  distance: number
  /** From additionalParts Set (outer square = angle × weight). */
  weight: number
  suppress: number
  mode: number
  isEnabled: boolean
  isParentEnabled: boolean
  firstUpdateDone: boolean
  sphereXf: LookAtSphereXf
  sphereRadius: number
}

export type LookAtControllerDyn = {
  /** Active requests keyed by `${part}:${id}`. */
  requests: Map<string, LookAtActiveRequest>
  timeRemainder: number
  /** Last Update scaled dt. */
  lastDt: number
  /**
   * Engine i_timeDilatationFactor = timeDelta/rawTimeDelta.
   * Offline: 1 until runner exposes raw vs scaled dt.
   */
  timeDilatationFactor: number
  /** Engine i_wasEnabledPreviousFrame — Sample forces Update(0) on rising edge. */
  wasEnabledPreviousFrame: boolean
  /** Last published outputs by part name. */
  outputs: Map<string, LookAtPartOutput>
  /** Parts published last frame — cleared on disable. */
  publishedParts: Set<string>
  /** Per-part sphere from last Sample (or identity). */
  spheres: Map<string, LookAtPartSphere>
  /** Master sphere outs (Eyes, …) for follower Set. */
  masterSphere: Map<string, LookAtMasterSphereOut>
  /** Per-master LookAtStateMachine dyn. */
  masterSm: Map<string, LookAtMasterSmDyn>
  /** Slave follower dyn by part name. */
  followers: Map<string, LookAtFollowerDyn>
  /** Engine context.m_eyesLookAtDirectionTemp */
  eyesLookAtDirection: number
  eyesLookAtDirectionEnabled: boolean
}

const ZERO: SimVec4 = { x: 0, y: 0, z: 0, w: 0 }
const EY: SimVec4 = { x: 0, y: 1, z: 0, w: 0 }

/** Default state priority = max−1 (hard-limit uses max). */
export const LOOKAT_DEFAULT_STATE_PRIORITY = Number.MAX_SAFE_INTEGER - 1

export function createLookAtFollowerDyn(): LookAtFollowerDyn {
  return {
    centerSphere: { ...EY },
    followTargetSphere: { ...EY },
    offsetMs: { ...ZERO },
    defaultTargetMs: { ...ZERO },
    distance: 0,
    weight: 1,
    suppress: 0,
    mode: 0,
    isEnabled: false,
    isParentEnabled: false,
    firstUpdateDone: false,
    sphereXf: { ...IDENTITY_SPHERE_XF },
    sphereRadius: 1,
  }
}

export function createLookAtSmStateDyn(
  id: number,
  request?: SimLookAtRequest
): LookAtSmStateDyn {
  const req = request
    ? {
        ...request,
        limits: defaultLookAtLimits(request.limits),
        additionalParts: (request.additionalParts ?? []).map((p) => ({ ...p })),
      }
    : defaultLookAtRequest({ priority: LOOKAT_DEFAULT_STATE_PRIORITY })
  if (id === 0) {
    req.priority = LOOKAT_DEFAULT_STATE_PRIORITY
    req.limits = defaultLookAtLimits()
  }
  return {
    id,
    request: req,
    targetWs: { ...ZERO },
    lastTargetSphere: { ...EY },
    lastLimitedSphere: { ...EY },
    lastTargetParentSpace: { ...ZERO },
    distance: 0,
    firstUpdateDone: false,
    softLimitReached: false,
    hardLimitReached: false,
    isTargetMovingBehindBack: false,
    moveBehindBackTimer: 0,
  }
}

export function createLookAtMasterSmDyn(): LookAtMasterSmDyn {
  const states = new Map<number, LookAtSmStateDyn>()
  states.set(0, createLookAtSmStateDyn(0))
  return {
    states,
    transition: { newId: 0, weight: 1, time: 1, duration: 1 },
    pre: {
      empty: true,
      spherePt: { ...EY },
      distance: 0,
      isDefaultState: 1,
      suppress: 0,
      mode: 0,
      additionalParts: [],
    },
    publishedSphere: { ...EY },
    publishedDistance: 0,
    publishedSuppress: 0,
    publishedMode: 0,
    publishedIsDefault: 1,
    publishedAdditionalParts: [],
    blendWeight: 0,
    enableFloatTrackValue: 1,
    softLimitReached: false,
    hardLimitReached: false,
    isEnabled: false,
  }
}

export function createLookAtControllerDyn(_props?: void): LookAtControllerDyn {
  return {
    requests: new Map(),
    timeRemainder: 0,
    lastDt: 0,
    timeDilatationFactor: 1,
    wasEnabledPreviousFrame: false,
    outputs: new Map(),
    publishedParts: new Set(),
    spheres: new Map(),
    masterSphere: new Map(),
    masterSm: new Map(),
    followers: new Map(),
    eyesLookAtDirection: 0,
    eyesLookAtDirectionEnabled: false,
  }
}

export const LookAtControllerDynDef = new InstanceStateDef(
  'lookAtController',
  createLookAtControllerDyn
)

export function lookAtRequestKey(ref: SimLookAtRef): string {
  return `${ref.part}:${ref.id}`
}

export function emptyLookAtPartOutput(): LookAtPartOutput {
  return {
    isEnabled: false,
    target: { ...ZERO },
    rawTarget: { ...ZERO },
    distance: 0,
    suppress: 0,
    mode: 0,
    blendWeight: 0,
  }
}

export function defaultPartSphere(radius = 1): LookAtPartSphere {
  return {
    xf: { ...IDENTITY_SPHERE_XF },
    radius: radius > 1e-8 ? radius : 1,
    bone: '',
  }
}
