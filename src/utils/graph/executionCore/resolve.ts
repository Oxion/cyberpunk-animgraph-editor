import { ANIM_NODE_TYPE_OUTPUT } from '../animNodeTypes'
import { EXECUTION_ROLE_DEFINITIONS } from './registrations'
import type { ExecutionRoleDef } from './types'

export function getExecutionRole(typeName: string): ExecutionRoleDef | undefined {
  return EXECUTION_ROLE_DEFINITIONS[typeName]
}

export function isExecutionSink(typeName: string): boolean {
  return getExecutionRole(typeName)?.sink === true
}

export function isExecutionEntry(typeName: string): boolean {
  return getExecutionRole(typeName)?.entry === true
}

export function getExecutionSinkHostFields(typeName: string): readonly string[] {
  return getExecutionRole(typeName)?.sinkHostFields ?? []
}

export function getExecutionEntryPoseFields(typeName: string): readonly string[] {
  return getExecutionRole(typeName)?.entryPoseFields ?? []
}

export function getExecutionPreferredSinkType(typeName: string): string {
  return getExecutionRole(typeName)?.preferredSinkType ?? ANIM_NODE_TYPE_OUTPUT
}

export function isExecutionInitAnchor(typeName: string): boolean {
  return getExecutionRole(typeName)?.initAnchor === true
}
