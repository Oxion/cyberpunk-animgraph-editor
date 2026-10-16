/**
 * driverDefId → SimDriverHandleDef registry.
 * HandleDef modules self-register; this file must not import them.
 */

import type { SimDriver } from './simDriver'
import type { SimDriverHandleDef } from './simDriverHandleDef'

const registry = new Map<string, SimDriverHandleDef<SimDriver>>()

/** Register a constant handleDef (InstanceStore key); driverDef lives on handleDef. */
export function registerSimDriverHandleDef<TDriver extends SimDriver, TProps>(
  handleDef: SimDriverHandleDef<TDriver, TProps>
): void {
  registry.set(handleDef.driverDef.id, handleDef as never)
}

export function listSimDriverHandleDefs(): SimDriverHandleDef<SimDriver>[] {
  return [...registry.values()]
}

export function getSimDriverHandleDef(
  simDriverHandleDefId: string
): SimDriverHandleDef<SimDriver> | undefined {
  return registry.get(simDriverHandleDefId)
}
