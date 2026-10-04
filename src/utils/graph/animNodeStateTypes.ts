/**
 * Which animgraph types count as a State on the diagram (State / StateFrozen).
 */

import { ANIM_NODE_TYPE_STATE, ANIM_NODE_TYPE_STATE_FROZEN } from './animNodeTypes'

export const ANIM_NODE_STATE_TYPES = [
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
] as const

export const ANIM_NODE_STATE_TYPE_SET: ReadonlySet<string> = new Set(ANIM_NODE_STATE_TYPES)
