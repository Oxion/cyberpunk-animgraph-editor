/**
 * Policy for one animgraph contain slot (how the diagram treats that field).
 *
 * `strict`: only types accepted by `slot.ref`.
 * Not strict: also pin / pin-override types that would parent into this PG.
 */

export type AnimgraphSlotRules = {
  id: string
  strict: boolean
}

export type AnimgraphSlotRulesRegistration = {
  slot: string
  parentType?: string
  parentTypes?: readonly string[]
  rules: AnimgraphSlotRules
}
