/**
 * animAnimNode_LookAtPose360 per-node dyn.
 */

import { InstanceStateDef } from '../InstanceStore'

export type LookAtPose360Dyn = {
  angle: number
  targetAngle: number
  animTime: number
}

export function createLookAtPose360Dyn(_props?: void): LookAtPose360Dyn {
  return { angle: 0, targetAngle: 0, animTime: 0 }
}

export const LookAtPose360DynDef = new InstanceStateDef(
  'lookAtPose360',
  createLookAtPose360Dyn
)
