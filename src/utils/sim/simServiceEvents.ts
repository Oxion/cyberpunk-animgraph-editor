/**
 * Sim stand-in for anim graph custom-param / ServiceEvent bus
 * (AnimationControlParams.PushCustomDataEvent → AnimGraph::ServiceEvent).
 *
 * Root-graph scope only — engine does not forward these into GraphSlot wrappers.
 */

import type { SimVec4 } from './evalAnimMathExpressionVector'

export type SimLookAtRef = {
  id: number
  part: string
}

/** anim::LookAtLimits — degrees / distance; None degrees = 360, None distance = 1e6. */
export type SimLookAtLimits = {
  softLimitDegrees: number
  hardLimitDegrees: number
  hardLimitDistance: number
  backLimitDegrees: number
}

export function defaultLookAtLimits(
  patch?: Partial<SimLookAtLimits>
): SimLookAtLimits {
  return {
    softLimitDegrees: 360,
    hardLimitDegrees: 360,
    hardLimitDistance: 1_000_000,
    backLimitDegrees: 180,
    ...patch,
  }
}

/** anim::LookAtPartRequest — follower square size / suppress / mode from master SM. */
export type SimLookAtPartRequest = {
  partName: string
  /** 0 = zero square; 2 = unlimited (engine c_unlimitedWeightForAdditionalPart). */
  weight: number
  suppress: number
  mode: number
}

/** Engine StaticArray cap (LookAtAdditionalPartsArray). */
export const LOOKAT_MAX_ADDITIONAL_PARTS = 2
/** Default / missing-part weight on Add (engine consts::c_unlimitedWeightForAdditionalPart). */
export const LOOKAT_UNLIMITED_ADDITIONAL_WEIGHT = 2

/** Subset of anim::LookAtRequest used by the plumbing slice. */
export type SimLookAtRequest = {
  transitionSpeed: number
  hasOutTransition: boolean
  outTransitionSpeed: number
  /** < 0 → use stateMachinesSettings.followingSpeedFactor. */
  followingSpeedFactorOverride: number
  limits: SimLookAtLimits
  suppress: number
  mode: number
  priority: number
  /** Track target in parent space (identity parent/L2W in offline sim). */
  calculatePositionInParentSpace: boolean
  /** Per recursive-dependent follower overrides (aligned to SM additionalPartsNames). */
  additionalParts: SimLookAtPartRequest[]
}

export function defaultLookAtPartRequest(
  partName: string,
  patch?: Partial<SimLookAtPartRequest>
): SimLookAtPartRequest {
  return {
    partName,
    weight: LOOKAT_UNLIMITED_ADDITIONAL_WEIGHT,
    suppress: 0,
    mode: 0,
    ...patch,
  }
}

export function defaultLookAtRequest(
  patch?: Partial<SimLookAtRequest>
): SimLookAtRequest {
  const { limits, additionalParts, ...rest } = patch ?? {}
  return {
    // GetLookAtTransitionSpeed(Normal)
    transitionSpeed: 60,
    hasOutTransition: false,
    outTransitionSpeed: 60,
    followingSpeedFactorOverride: -1,
    limits: defaultLookAtLimits(limits),
    suppress: 0,
    mode: 0,
    priority: 0,
    calculatePositionInParentSpace: false,
    additionalParts: additionalParts ? additionalParts.map((p) => ({ ...p })) : [],
    ...rest,
  }
}

export type LookAtParams_Add = {
  kind: 'LookAtParams_Add'
  ref: SimLookAtRef
  request: SimLookAtRequest
}

export type LookAtParams_Remove = {
  kind: 'LookAtParams_Remove'
  ref: SimLookAtRef
  hasOutTransition: boolean
  outTransitionSpeed: number
}

export type LookAtParams_UpdatePositions = {
  kind: 'LookAtParams_UpdatePositions'
  infos: Array<{ ref: SimLookAtRef; targetWs: SimVec4 }>
}

/** Degrees in → LookAtVehicleRestrictionData (engine SetData). */
export type LookAtVehicleRestrictionParams = {
  kind: 'LookAtVehicleRestrictionParams'
  maxYawDegrees: number
  centerYawThresholdDegrees: number
  maxUpDegrees: number
  maxDownDegrees: number
  maxRotationSpeed: number
}

export type SimServiceEvent =
  | LookAtParams_Add
  | LookAtParams_Remove
  | LookAtParams_UpdatePositions
  | LookAtVehicleRestrictionParams

export function isLookAtServiceEvent(e: SimServiceEvent): boolean {
  return (
    e.kind === 'LookAtParams_Add' ||
    e.kind === 'LookAtParams_Remove' ||
    e.kind === 'LookAtParams_UpdatePositions'
  )
}

export type SimPreSampleHookCtx = {
  dt: number
  time: number
  push: (event: SimServiceEvent) => void
}

export type SimPreSampleHook = (ctx: SimPreSampleHookCtx) => void
