/**
 * Bind (parentType, slot) → named slot policy.
 */

import {
  ANIM_NODE_TYPE_ROOT,
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
  ANIM_NODE_TYPE_STATE_MACHINE,
} from '../animNodeTypes'
import {
  rulesContainerNodes,
  rulesSmConditionalEntries,
  rulesSmFrozenState,
  rulesSmGlobalTransitions,
  rulesSmStates,
  rulesSmTransitions,
} from './rules'
import type { AnimgraphSlotRulesRegistration } from './types'

export const ANIMGRAPH_SLOT_RULES_REGISTRATIONS: readonly AnimgraphSlotRulesRegistration[] = [
  { parentType: ANIM_NODE_TYPE_STATE_MACHINE, slot: 'states', rules: rulesSmStates },
  { parentType: ANIM_NODE_TYPE_STATE_MACHINE, slot: 'transitions', rules: rulesSmTransitions },
  { parentType: ANIM_NODE_TYPE_STATE_MACHINE, slot: 'globalTransitions', rules: rulesSmGlobalTransitions },
  { parentType: ANIM_NODE_TYPE_STATE_MACHINE, slot: 'conditionalEntries', rules: rulesSmConditionalEntries },
  { parentType: ANIM_NODE_TYPE_STATE_MACHINE, slot: 'frozenState', rules: rulesSmFrozenState },
  {
    parentTypes: [ANIM_NODE_TYPE_STATE, ANIM_NODE_TYPE_STATE_FROZEN, ANIM_NODE_TYPE_ROOT],
    slot: 'nodes',
    rules: rulesContainerNodes,
  },
]
