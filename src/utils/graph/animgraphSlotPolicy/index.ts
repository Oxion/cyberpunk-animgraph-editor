/**
 * Animgraph contain-slot policy: strict vs pin-DAG host.
 * Used by add listing and anything else that asks how a field is hosted on the diagram.
 *
 * Membership writes (add/removeHandleRefs) live in animgraphMutation; diagram
 * PG ancestry for those slots is in animgraphContainOwner — not here.
 */

export type { AnimgraphSlotRules, AnimgraphSlotRulesRegistration } from './types'
export { resolveAnimgraphSlotRules } from './resolve'
