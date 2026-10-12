/**
 * Switch / BaseSwitch instance buffer for inertialization activation detect
 * (engine prevSelectedIndex / prevIdx).
 */

import { InstanceStateDef } from '../InstanceStore'

export type SwitchInertializationDyn = {
  /** Last selected input; -1 = never set (skip first-frame request). */
  selected: number
}

export function createSwitchInertializationDyn(
  _props?: void
): SwitchInertializationDyn {
  return { selected: -1 }
}

export const SwitchInertializationDynDef = new InstanceStateDef(
  'switchInertialization',
  createSwitchInertializationDyn
)
