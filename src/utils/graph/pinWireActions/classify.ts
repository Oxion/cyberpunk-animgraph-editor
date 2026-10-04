import { getAnimTypeFields } from '../../animTypes'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import {
  getFieldRole,
  getProjectionDef,
  inferFieldRole,
} from '../../projection'
import type { ConnectWireKind } from './types'

function isPinOverrideField(ownerType: string, fieldName: string): boolean {
  const field = getAnimTypeFields(ownerType).find((f) => f.key === fieldName)
  if (!field) return false
  const inferred = inferFieldRole(field.type)
  const role = getFieldRole(field, getProjectionDef(ownerType))
  return role === 'pin' && inferred === 'contain'
}

/**
 * 1 pin-override → exclusiveRef
 * 2 !nodesToInit → exclusive inline
 * 3 else → sharedRef
 */
export function classifyConnectWire(
  fromType: string,
  ownerType: string,
  pinField: string
): ConnectWireKind {
  if (isPinOverrideField(ownerType, pinField)) return 'exclusiveRef'
  if (!NodeDefinitionRegistry.isNodesToInitType(fromType)) return 'inline'
  return 'sharedRef'
}
