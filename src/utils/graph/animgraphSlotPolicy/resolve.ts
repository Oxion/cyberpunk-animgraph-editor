/**
 * Look up animgraph contain-slot policy for a concrete (parentType, slot).
 */

import { ANIMGRAPH_SLOT_RULES_REGISTRATIONS } from './registrations'
import { rulesDefault } from './rules'
import type { AnimgraphSlotRules, AnimgraphSlotRulesRegistration } from './types'

function registrationMatches(
  reg: AnimgraphSlotRulesRegistration,
  parentType: string,
  slotName: string
): boolean {
  if (reg.slot !== slotName) return false
  if (reg.parentType != null) return reg.parentType === parentType
  if (reg.parentTypes != null) return reg.parentTypes.includes(parentType)
  return true
}

export function resolveAnimgraphSlotRules(
  parentType: string,
  slotName: string
): AnimgraphSlotRules {
  for (const reg of ANIMGRAPH_SLOT_RULES_REGISTRATIONS) {
    if (registrationMatches(reg, parentType, slotName)) return reg.rules
  }
  return rulesDefault
}
