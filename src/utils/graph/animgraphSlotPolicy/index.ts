/**
 * Animgraph contain-slot policy: strict vs pin-DAG host.
 * Used by add listing and anything else that asks how a field is hosted on the diagram.
 *
 * Membership writes: setPinSlot → promoteContainMembership → addContainRefs.
 * Pins / extraPins / field roles: projection. Diagram PG ancestry: animgraphContainOwner.
 * NodeInputHandler: projection adapters over animgraphMutation.
 */

export type { AnimgraphSlotRules, AnimgraphSlotRulesRegistration } from './types'
export { resolveAnimgraphSlotRules } from './resolve'
