/**
 * Contain membership slot policy — State.nodes / Root / Frozen.
 * Promote side-effect lives in setHandleRef (crud); discovery via ctx.resolveContainOwner.
 */

import {
  ANIM_NODE_TYPE_ROOT,
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
} from '../animNodeTypes'

/** Membership slots that sync via add/removeHandleRefs (not projection roles). */
const MEMBERSHIP_SLOT_REGS: readonly {
  slot: string
  parentTypes: readonly string[]
}[] = [
  {
    slot: 'nodes',
    parentTypes: [
      ANIM_NODE_TYPE_STATE,
      ANIM_NODE_TYPE_STATE_FROZEN,
      ANIM_NODE_TYPE_ROOT,
    ],
  },
]

export function hasMembershipSlot(parentType: string, slotName: string): boolean {
  return MEMBERSHIP_SLOT_REGS.some(
    (r) => r.slot === slotName && r.parentTypes.includes(parentType)
  )
}
