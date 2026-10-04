import {
  ANIM_NODE_TYPE_OUTPUT,
  ANIM_NODE_TYPE_ROOT,
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
  ANIM_NODE_TYPE_STATE_MACHINE,
} from '../animNodeTypes'
import type { ExecutionRoleDef } from './types'

/** Per-$type execution roles. Extend here as new sink/host patterns appear. */
export const EXECUTION_ROLE_DEFINITIONS: Readonly<Record<string, ExecutionRoleDef>> = {
  [ANIM_NODE_TYPE_OUTPUT]: {
    sink: true,
  },
  [ANIM_NODE_TYPE_ROOT]: {
    entry: true,
    initAnchor: true,
    entryPoseFields: ['outputNode'],
    sinkHostFields: ['nodes'],
    preferredSinkType: ANIM_NODE_TYPE_OUTPUT,
  },
  [ANIM_NODE_TYPE_STATE]: {
    sinkHostFields: ['nodes'],
    preferredSinkType: ANIM_NODE_TYPE_OUTPUT,
  },
  [ANIM_NODE_TYPE_STATE_FROZEN]: {
    sinkHostFields: ['nodes'],
    preferredSinkType: ANIM_NODE_TYPE_OUTPUT,
  },
  [ANIM_NODE_TYPE_STATE_MACHINE]: {
    initAnchor: true,
    sinkHostFields: ['states'],
  },
}
