/**
 * Type-specific delete side effects (State / Transition / ConditionalEntry),
 * compiled after the core cascade plan — applied after boxes are removed.
 */

import type { AnimgraphNode } from '../../animgraphTypes'
import type { RenderData, RenderNode } from '../../diagramTypes'
import { isDiagramPortalNode } from '../../DiagramConversion'
import { getPropertyGroupSlotName, isPropertyGroupNode } from '../../diagramAddPolicy'
import {
  ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
  ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
} from '../../animNodeTypes'
import { ANIM_NODE_STATE_TYPE_SET } from '../../animNodeStateTypes'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from '../../diagramNodeTypes'
import { getChildSlot, DEFAULT_CHILD_SLOT } from '../../nodeChildSlots'
import { getSmPropertyGroup } from '../../StateMachineDetailLayout'
import type { DeleteNodeAction } from '../types'
import {
  collectStateDeleteSmSlotRemovals,
  resolveDeletedStateIndex,
  resolveOwnerSm,
  type SmSlotName,
  type StateDeleteSmSlotRemoval,
} from '../stateDeleteTransitions'

export type DeleteSideEffectInput = {
  renderData: RenderData
  seed: RenderNode
  affectedIds: ReadonlySet<string>
  handleIds: ReadonlySet<string>
}

function resolveBoxHandleId(
  node: RenderNode,
  handlesRegistry: Map<string, AnimgraphNode>
): string | null {
  const fromData = node.data?.originalNodeId
  if (typeof fromData === 'string' && handlesRegistry.has(fromData)) return fromData
  if (handlesRegistry.has(node.id)) return node.id
  return null
}

function resolveOwnerSmFromSeed(
  seed: RenderNode,
  renderData: RenderData
): RenderNode | null {
  return resolveOwnerSm(seed, renderData)
}

function resolveSeedAnimHandleId(
  seed: RenderNode,
  renderData: RenderData,
  handleIds: ReadonlySet<string>
): string | null {
  const direct = resolveBoxHandleId(seed, renderData.handlesRegistry)
  if (direct && handleIds.has(direct)) return direct
  if (direct) return direct
  for (const hid of handleIds) return hid
  return null
}

function isStateSeed(seed: RenderNode): boolean {
  return ANIM_NODE_STATE_TYPE_SET.has(seed.type)
}

function isTransitionSeed(seed: RenderNode): boolean {
  return (
    seed.type === DIAGRAM_TRANSITION_WRAPPER_TYPE ||
    seed.type === ANIM_NODE_TYPE_TRANSITION_DESCRIPTION
  )
}

function isConditionalEntrySeed(seed: RenderNode): boolean {
  return (
    seed.type === DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE ||
    seed.type === ANIM_NODE_TYPE_CONDITIONAL_ENTRY
  )
}

function parentPgSlot(seed: RenderNode): string | null {
  const parent = seed.parent
  if (!parent || !isPropertyGroupNode(parent)) return null
  return getPropertyGroupSlotName(parent) ?? null
}

const SM_SLOT_SIDE_EFFECTS: SmSlotName[] = [
  'transitions',
  'globalTransitions',
  'conditionalEntries',
]

type SideEffectPlan = {
  actions: DeleteNodeAction[]
  refreshIds: string[]
}

function isSideEffectSeed(node: RenderNode): boolean {
  return (
    isStateSeed(node) ||
    isTransitionSeed(node) ||
    isConditionalEntrySeed(node)
  )
}

/** Topmost typed seeds in affected subtree (wrapper, not nested description). */
function collectTopmostSideEffectSeeds(input: DeleteSideEffectInput): RenderNode[] {
  const { renderData, affectedIds } = input
  const seeds: RenderNode[] = []
  for (const id of affectedIds) {
    const node = renderData.allNodes.get(id)
    if (!node || !isSideEffectSeed(node)) continue
    let parent = node.parent
    let dominated = false
    while (parent) {
      if (!affectedIds.has(parent.id)) break
      if (isSideEffectSeed(parent)) {
        dominated = true
        break
      }
      parent = parent.parent
    }
    if (!dominated) seeds.push(node)
  }
  return seeds
}

function sideEffectActionKey(action: DeleteNodeAction): string {
  switch (action.kind) {
    case 'reindex-sm-states':
      return `reindex-sm-states|${action.smId}|${action.statesGroupId}`
    case 'restack-property-group':
      return `restack-property-group|${action.groupId}|${action.sortBy}`
    case 'sync-sm-section-metadata':
      return `sync-sm-section-metadata|${action.smId}|${action.slotName}`
    case 'fit-parent-group':
      return `fit-parent-group|${action.parentId}`
    default:
      return action.kind
  }
}

function sortSideEffectActions(actions: DeleteNodeAction[]): DeleteNodeAction[] {
  return actions
}

function mergeSideEffectPlans(...plans: SideEffectPlan[]): SideEffectPlan {
  const seen = new Set<string>()
  const actions: DeleteNodeAction[] = []
  const refreshSet = new Set<string>()
  const refreshIds: string[] = []

  for (const plan of plans) {
    for (const action of plan.actions) {
      const key = sideEffectActionKey(action)
      if (seen.has(key)) continue
      seen.add(key)
      actions.push(action)
    }
    for (const id of plan.refreshIds) {
      if (refreshSet.has(id)) continue
      refreshSet.add(id)
      refreshIds.push(id)
    }
  }

  return {
    actions: sortSideEffectActions(actions),
    refreshIds,
  }
}

function compileSideEffectsForSeed(input: DeleteSideEffectInput): SideEffectPlan {
  if (isStateSeed(input.seed)) {
    return compileStateSideEffects(input)
  }
  if (isTransitionSeed(input.seed)) {
    const slot =
      parentPgSlot(input.seed) === 'globalTransitions'
        ? 'globalTransitions'
        : 'transitions'
    return compileTransitionLikeSideEffects(input, slot)
  }
  if (isConditionalEntrySeed(input.seed)) {
    return compileTransitionLikeSideEffects(input, 'conditionalEntries')
  }
  return { actions: [], refreshIds: [] }
}

/** Delete entire transitions / globalTransitions / conditionalEntries PG. */
function compileSmSlotPropertyGroupDeleteSideEffects(
  input: DeleteSideEffectInput,
  pgSlot: SmSlotName
): SideEffectPlan {
  const childSeeds = collectTopmostSideEffectSeeds(input)
  const childPlans = childSeeds.map((seed) =>
    compileSideEffectsForSeed({ ...input, seed })
  )

  let merged = mergeSideEffectPlans(...childPlans)
  const deletedPgId = input.seed.id

  merged.actions = merged.actions.filter(
    (action) =>
      action.kind !== 'restack-property-group' || action.groupId !== deletedPgId
  )

  const sm = resolveOwnerSmFromSeed(input.seed, input.renderData)
  if (sm && !merged.actions.some(
    (a) => a.kind === 'sync-sm-section-metadata' && a.smId === sm.id && a.slotName === pgSlot
  )) {
    merged = mergeSideEffectPlans(merged, {
      actions: [
        {
          kind: 'sync-sm-section-metadata',
          smId: sm.id,
          slotName: pgSlot,
        },
      ],
      refreshIds: [sm.id],
    })
  }

  if (pgSlot === 'transitions' || pgSlot === 'globalTransitions') {
    const statesGroup = sm
      ? getSmPropertyGroup(sm, 'states', input.renderData.allNodes)
      : null
    if (statesGroup) {
      for (const child of getChildSlot(statesGroup, DEFAULT_CHILD_SLOT)) {
        if (
          ANIM_NODE_STATE_TYPE_SET.has(child.type) &&
          !input.affectedIds.has(child.id) &&
          !merged.refreshIds.includes(child.id)
        ) {
          merged.refreshIds.push(child.id)
        }
      }
    }
  }

  return merged
}

function pushSlotRestackAfterRemovals(
  actions: DeleteNodeAction[],
  refreshIds: string[],
  renderData: RenderData,
  sm: RenderNode,
  removals: StateDeleteSmSlotRemoval[]
): void {
  for (const slotName of SM_SLOT_SIDE_EFFECTS) {
    if (!removals.some((r) => r.slotName === slotName)) continue
    const group = getSmPropertyGroup(sm, slotName, renderData.allNodes)
    if (!group) continue
    actions.push({
      kind: 'restack-property-group',
      groupId: group.id,
      sortBy: slotName === 'conditionalEntries' ? 'none' : 'priority',
    })
    actions.push({
      kind: 'sync-sm-section-metadata',
      smId: sm.id,
      slotName,
    })
    refreshIds.push(group.id)
  }
}

function compileStateSideEffects(input: DeleteSideEffectInput): {
  actions: DeleteNodeAction[]
  refreshIds: string[]
} {
  const { renderData, seed, handleIds } = input
  const actions: DeleteNodeAction[] = []
  const refreshIds: string[] = []

  const sm = resolveOwnerSmFromSeed(seed, renderData)
  if (!sm) return { actions, refreshIds }

  const statesGroup =
    getSmPropertyGroup(sm, 'states', renderData.allNodes) ??
    (seed.parent && isPropertyGroupNode(seed.parent) ? seed.parent : null)
  if (!statesGroup) return { actions, refreshIds }

  const smHandleId = String(sm.data?.originalNodeId ?? sm.id)
  const smHandle = renderData.handlesRegistry.get(smHandleId)
  const seedHandleId = resolveSeedAnimHandleId(seed, renderData, handleIds)
  const seedStateHandle = seedHandleId
    ? renderData.handlesRegistry.get(seedHandleId)
    : undefined

  const deletedStateIndex = resolveDeletedStateIndex(smHandle, seedHandleId, seed)

  actions.push({
    kind: 'reindex-sm-states',
    smId: sm.id,
    statesGroupId: statesGroup.id,
  })
  // targetStateIndex / outTransitionIndices remaps: animgraphMutation field effects
  // (deleteHandles strip → OwnerFieldChange on SM.states / transitions).

  if (smHandle && seedStateHandle && deletedStateIndex >= 0) {
    const removals = collectStateDeleteSmSlotRemovals(
      renderData,
      smHandle,
      deletedStateIndex,
      seedStateHandle
    )
    pushSlotRestackAfterRemovals(actions, refreshIds, renderData, sm, removals)
  }

  actions.push({
    kind: 'restack-property-group',
    groupId: statesGroup.id,
    sortBy: 'stateIndex',
  })
  actions.push({
    kind: 'sync-sm-section-metadata',
    smId: sm.id,
    slotName: 'states',
  })

  refreshIds.push(sm.id, statesGroup.id)
  for (const child of getChildSlot(statesGroup, DEFAULT_CHILD_SLOT)) {
    if (input.affectedIds.has(child.id)) continue
    if (ANIM_NODE_STATE_TYPE_SET.has(child.type)) refreshIds.push(child.id)
  }
  for (const slot of SM_SLOT_SIDE_EFFECTS) {
    const group = getSmPropertyGroup(sm, slot, renderData.allNodes)
    if (!group) continue
    refreshIds.push(group.id)
    for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
      if (!input.affectedIds.has(child.id)) refreshIds.push(child.id)
    }
  }

  return { actions, refreshIds }
}

function compileTransitionLikeSideEffects(
  input: DeleteSideEffectInput,
  slotName: 'transitions' | 'globalTransitions' | 'conditionalEntries'
): {
  actions: DeleteNodeAction[]
  refreshIds: string[]
} {
  const { renderData, seed, handleIds } = input
  const actions: DeleteNodeAction[] = []
  const refreshIds: string[] = []

  const sm = resolveOwnerSmFromSeed(seed, renderData)
  const pg =
    (seed.parent && isPropertyGroupNode(seed.parent) ? seed.parent : null) ??
    (sm ? getSmPropertyGroup(sm, slotName, renderData.allNodes) : null)
  if (!pg) return { actions, refreshIds }

  if (sm && slotName === 'transitions') {
    // outTransitionIndices remap runs in animgraphMutation on SM.transitions strip.
    const statesGroup = getSmPropertyGroup(sm, 'states', renderData.allNodes)
    if (statesGroup) {
      for (const child of getChildSlot(statesGroup, DEFAULT_CHILD_SLOT)) {
        if (
          ANIM_NODE_STATE_TYPE_SET.has(child.type) &&
          !input.affectedIds.has(child.id)
        ) {
          refreshIds.push(child.id)
        }
      }
    }
  }

  actions.push({
    kind: 'restack-property-group',
    groupId: pg.id,
    sortBy: slotName === 'conditionalEntries' ? 'none' : 'priority',
  })
  if (sm) {
    actions.push({
      kind: 'sync-sm-section-metadata',
      smId: sm.id,
      slotName,
    })
    refreshIds.push(sm.id)
  }
  refreshIds.push(pg.id)
  for (const child of getChildSlot(pg, DEFAULT_CHILD_SLOT)) {
    if (!input.affectedIds.has(child.id) && !isDiagramPortalNode(child)) {
      refreshIds.push(child.id)
    }
  }

  return { actions, refreshIds }
}

function compileStatesPropertyGroupDeleteSideEffects(
  input: DeleteSideEffectInput
): {
  actions: DeleteNodeAction[]
  refreshIds: string[]
} {
  const { renderData, seed } = input
  const actions: DeleteNodeAction[] = []
  const refreshIds: string[] = []

  const sm = resolveOwnerSmFromSeed(seed, renderData)
  if (!sm) return { actions, refreshIds }

  const smHandleId = String(sm.data?.originalNodeId ?? sm.id)
  const smHandle = renderData.handlesRegistry.get(smHandleId)

  // State index remaps: animgraphMutation on SM.states strip (deleteHandles).

  if (smHandle) {
    for (const child of getChildSlot(seed, DEFAULT_CHILD_SLOT)) {
      if (!ANIM_NODE_STATE_TYPE_SET.has(child.type)) continue
      const seedHandleId = resolveBoxHandleId(child, renderData.handlesRegistry)
      const seedStateHandle = seedHandleId
        ? renderData.handlesRegistry.get(seedHandleId)
        : undefined
      if (!seedStateHandle) continue
      const deletedStateIndex = resolveDeletedStateIndex(
        smHandle,
        seedHandleId,
        child
      )
      if (deletedStateIndex < 0) continue

      const removals = collectStateDeleteSmSlotRemovals(
        renderData,
        smHandle,
        deletedStateIndex,
        seedStateHandle
      )
      pushSlotRestackAfterRemovals(actions, refreshIds, renderData, sm, removals)
    }
  }

  actions.push({
    kind: 'sync-sm-section-metadata',
    smId: sm.id,
    slotName: 'states',
  })
  for (const slot of SM_SLOT_SIDE_EFFECTS) {
    const group = getSmPropertyGroup(sm, slot, renderData.allNodes)
    if (!group) continue
    actions.push({
      kind: 'restack-property-group',
      groupId: group.id,
      sortBy: slot === 'conditionalEntries' ? 'none' : 'priority',
    })
    actions.push({
      kind: 'sync-sm-section-metadata',
      smId: sm.id,
      slotName: slot,
    })
    refreshIds.push(group.id)
  }

  refreshIds.push(sm.id)
  for (const slot of SM_SLOT_SIDE_EFFECTS) {
    const group = getSmPropertyGroup(sm, slot, renderData.allNodes)
    if (!group) continue
    for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
      if (!input.affectedIds.has(child.id)) refreshIds.push(child.id)
    }
  }

  return { actions, refreshIds }
}

/**
 * Compile type-specific side effects for the delete seed.
 * Indices are captured from the live graph (before apply mutates).
 */
export function resolveDeleteSideEffects(input: DeleteSideEffectInput): {
  actions: DeleteNodeAction[]
  refreshIds: string[]
} {
  if (isPropertyGroupNode(input.seed)) {
    const pgSlot = getPropertyGroupSlotName(input.seed)
    if (pgSlot === 'states') {
      return compileStatesPropertyGroupDeleteSideEffects(input)
    }
    if (
      pgSlot === 'transitions' ||
      pgSlot === 'globalTransitions' ||
      pgSlot === 'conditionalEntries'
    ) {
      return compileSmSlotPropertyGroupDeleteSideEffects(input, pgSlot)
    }
  }

  return compileSideEffectsForSeed(input)
}
