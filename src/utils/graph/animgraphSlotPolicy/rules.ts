/**
 * Named policies for animgraph contain slots.
 */

import type { AnimgraphSlotRules } from './types'

export const rulesSmStates: AnimgraphSlotRules = {
  id: 'sm.states',
  strict: true,
}

export const rulesSmTransitions: AnimgraphSlotRules = {
  id: 'sm.transitions',
  strict: true,
}

export const rulesSmGlobalTransitions: AnimgraphSlotRules = {
  id: 'sm.globalTransitions',
  strict: true,
}

export const rulesSmConditionalEntries: AnimgraphSlotRules = {
  id: 'sm.conditionalEntries',
  strict: true,
}

export const rulesSmFrozenState: AnimgraphSlotRules = {
  id: 'sm.frozenState',
  strict: true,
}

export const rulesContainerNodes: AnimgraphSlotRules = {
  id: 'container.nodes',
  strict: false,
}

export const rulesDefault: AnimgraphSlotRules = {
  id: 'default',
  strict: true,
}
