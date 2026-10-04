/**
 * Predicates on animgraph `$type` strings.
 */

import { ANIM_NODE_TYPE_ROOT, ANIM_NODE_TYPE_STATE_MACHINE } from './animNodeTypes'

export function isRootNodeType(nodeType: string): boolean {
  return nodeType === ANIM_NODE_TYPE_ROOT
}

export function isStateMachineNodeType(nodeType: string): boolean {
  return nodeType === ANIM_NODE_TYPE_STATE_MACHINE
}
