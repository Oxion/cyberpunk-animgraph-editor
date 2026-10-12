/**
 * animAnimNode_LookAtApplyVehicleRestrictions per-node dyn.
 */

import { InstanceStateDef } from '../InstanceStore'
import type { SimVec4 } from './evalAnimMathExpressionVector'

/** Processed restriction (engine LookAtVehicleRestrictionData). */
export type LookAtVehicleRestrictionData = {
  /** < 0 → inactive (engine default). */
  maxYawRadians: number
  maxYawCos: number
  centerYawThresholdCos: number
  maxUpZValue: number
  maxDownZValue: number
  maxRotateSpeed: number
}

export type LookAtVehicleRestrictionsDyn = {
  data: LookAtVehicleRestrictionData
  currentLookAtDir: SimVec4
  timeDelta: number
}

const EY: SimVec4 = { x: 0, y: 1, z: 0, w: 0 }

export function inactiveRestrictionData(): LookAtVehicleRestrictionData {
  return {
    maxYawRadians: -1,
    maxYawCos: 0,
    centerYawThresholdCos: 0,
    maxUpZValue: 0,
    maxDownZValue: 0,
    maxRotateSpeed: 0,
  }
}

/** Engine LookAtVehicleRestrictionData::SetData. */
export function setRestrictionDataFromDegrees(
  maxYawDegrees: number,
  centerYawThresholdDegrees: number,
  maxUpDegrees: number,
  maxDownDegrees: number,
  maxRotationSpeed: number
): LookAtVehicleRestrictionData {
  const deg2rad = Math.PI / 180
  const maxYawRadians = maxYawDegrees * deg2rad
  const maxYawCos = Math.cos(maxYawRadians)
  const centerYawThresholdCos = Math.cos(centerYawThresholdDegrees * deg2rad)
  const maxUpCos = Math.cos(maxUpDegrees * deg2rad)
  const maxDownCos = Math.cos(maxDownDegrees * deg2rad)
  return {
    maxYawRadians,
    maxYawCos,
    centerYawThresholdCos,
    maxUpZValue: Math.sqrt(Math.max(0, 1 - maxUpCos)),
    maxDownZValue: -Math.sqrt(Math.max(0, 1 - maxDownCos)),
    maxRotateSpeed: maxRotationSpeed,
  }
}

export function createLookAtVehicleRestrictionsDyn(
  _props?: void
): LookAtVehicleRestrictionsDyn {
  return {
    data: inactiveRestrictionData(),
    currentLookAtDir: { ...EY },
    timeDelta: 0,
  }
}

export const LookAtVehicleRestrictionsDynDef = new InstanceStateDef(
  'lookAtVehicleRestrictions',
  createLookAtVehicleRestrictionsDyn
)
