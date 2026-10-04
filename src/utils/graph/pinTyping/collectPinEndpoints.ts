/**
 * Collect unique pin endpoint types (expectedType of every projection pin + extraPins).
 * Used by codegen; safe to call at runtime but prefer the generated list.
 */

import { AnimTypes } from '../../animTypes'
import {
  expectedTypeFromExtraPin,
  listExtraPins,
  listPinFields,
  pinSlotExpectedType,
  type AnimgraphPinWalkMode,
} from './pinFields'

export type CollectPinEndpointOptions = {
  /** Default `'pin'` — includes pin-override. */
  pinMode?: AnimgraphPinWalkMode
}

/**
 * Scan all registry types for pin expected endpoints (links + pin-overrides + extraPins).
 */
export function collectPinEndpointTypes(
  options?: CollectPinEndpointOptions
): string[] {
  const pinMode = options?.pinMode ?? 'pin'
  const out = new Set<string>()

  for (const typeName of Object.keys(AnimTypes)) {
    for (const field of listPinFields(typeName, pinMode)) {
      const expected = pinSlotExpectedType(field.type)
      if (expected) out.add(expected)
    }
    // extraPins are always value-link sockets (not gated by pin-override mode).
    if (pinMode === 'pin') {
      for (const extra of listExtraPins(typeName)) {
        const expected = expectedTypeFromExtraPin(extra)
        if (expected) out.add(expected)
      }
    }
  }

  return [...out].sort((a, b) => a.localeCompare(b))
}
