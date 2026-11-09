/**
 * Compile delete-node actions from a seed diagram node.
 */

import type { AnimgraphNode } from '../animgraphTypes'
import type { DiagramConnection, RenderData, RenderNode } from '../diagramTypes'
import {
  isDiagramPortalNode,
} from '../DiagramConversion'
import { isPortalHopConnection } from '../portalTopology'
import {
  captureAddedNodePlacement,
} from '../GraphHistory'
import { getPropertyGroupSlotName, isPropertyGroupNode } from '../diagramAddPolicy'
import { DEFAULT_CHILD_SLOT, getChildSlot, walkSubtree } from '../nodeChildSlots'
import { isRootNodeType } from '../animNodeTypeUtils'
import { ANIM_NODE_STATE_TYPE_SET } from '../animNodeStateTypes'
import { resolveDeleteSideEffects } from './sideEffects'
import { expandTransitionCascadeForStateDelete } from './stateDeleteTransitions'
import type {
  CanDeleteNodeResult,
  DeleteNodeAction,
  DeleteNodeDenialReason,
  DeleteNodePlan,
} from './types'

function connectionKey(c: DiagramConnection): string {
  return `${c.from}|${c.to}|${c.pinName ?? ''}|${c.type}`
}

/** Resolve animgraph handle id for a diagram box, if any. */
export function resolveBoxHandleId(
  node: RenderNode,
  handlesRegistry: Map<string, AnimgraphNode>
): string | null {
  const fromData = node.data?.originalNodeId
  if (typeof fromData === 'string' && handlesRegistry.has(fromData)) return fromData
  if (handlesRegistry.has(node.id)) return node.id
  return null
}

export function collectAffectedSubtree(seed: RenderNode): RenderNode[] {
  const nodes: RenderNode[] = []
  walkSubtree(seed, (n) => {
    nodes.push(n)
  })
  return nodes
}

function connectionTouchesAffected(
  c: DiagramConnection,
  affected: Set<string>
): boolean {
  if (affected.has(c.from) || affected.has(c.to)) return true
  const meta = c.metadata
  if (!meta) return false
  if (typeof meta.originalTo === 'string' && affected.has(meta.originalTo)) return true
  if (typeof meta.originalFrom === 'string' && affected.has(meta.originalFrom)) {
    return true
  }
  return false
}

/**
 * Logical input wires to disconnect via applyDisconnectPlan.
 * Skip portal hop edges (GC'd by disconnect / stripped later).
 * Higher array indices first so reindex after disconnect does not invalidate pending names.
 */
export function collectDisconnectWires(
  renderData: RenderData,
  affectedIds: Set<string>
): DiagramConnection[] {
  const out: DiagramConnection[] = []
  const seen = new Set<string>()
  for (const c of renderData.connections) {
    if (isPortalHopConnection(c)) continue
    if (!c.pinName) continue
    if (!connectionTouchesAffected(c, affectedIds)) continue
    const key = connectionKey(c)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...c, metadata: c.metadata ? { ...c.metadata } : undefined })
  }

  out.sort((a, b) => {
    const aPin = a.pinName ?? ''
    const bPin = b.pinName ?? ''
    const aBase = aPin.split('[')[0] ?? ''
    const bBase = bPin.split('[')[0] ?? ''
    const aTo = a.metadata?.originalTo ?? a.to
    const bTo = b.metadata?.originalTo ?? b.to
    if (aTo !== bTo) return String(aTo).localeCompare(String(bTo))
    if (aBase !== bBase) return aBase.localeCompare(bBase)
    const aIdx = parseInt(aPin.split('[')[1]?.split(']')[0] ?? '0', 10)
    const bIdx = parseInt(bPin.split('[')[1]?.split(']')[0] ?? '0', 10)
    return bIdx - aIdx
  })
  return out
}

export function canDeleteNode(
  node: RenderNode | null | undefined,
  _ctx?: { handlesRegistry?: Map<string, AnimgraphNode> }
): CanDeleteNodeResult {
  if (!node) {
    return { ok: false, reasons: ['not-found'] }
  }
  const reasons: DeleteNodeDenialReason[] = []
  if (isRootNodeType(node.type)) {
    reasons.push('root-forbidden')
  }
  if (isDiagramPortalNode(node)) {
    reasons.push('portal-forbidden')
  }
  // Hidden post-promote SM wrapper (legacy / defensive).
  if (
    node.id.endsWith('__smShell') ||
    node.metadata?.smDiagramRole === 'shell'
  ) {
    reasons.push('sm-shell-forbidden')
  }
  if (reasons.length > 0) return { ok: false, reasons }
  return { ok: true }
}

export type CompileDeleteNodeResult =
  | { ok: true; plan: DeleteNodePlan }
  | { ok: false; reasons: DeleteNodeDenialReason[] }

export function compileDeleteNodeActions(
  renderData: RenderData,
  seedId: string
): CompileDeleteNodeResult {
  const seed = renderData.allNodes.get(seedId)
  if (!seed) {
    return { ok: false, reasons: ['not-found'] }
  }
  const gate = canDeleteNode(seed, { handlesRegistry: renderData.handlesRegistry })
  if (!gate.ok) return { ok: false, reasons: gate.reasons }

  const subtree = collectAffectedSubtree(seed)
  const affectedSet = new Set(subtree.map((n) => n.id))

  const handleIds: string[] = []
  const handleIdSet = new Set<string>()

  if (ANIM_NODE_STATE_TYPE_SET.has(seed.type)) {
    expandTransitionCascadeForStateDelete(
      renderData,
      seed,
      subtree,
      affectedSet,
      handleIdSet,
      handleIds
    )
  } else if (
    isPropertyGroupNode(seed) &&
    getPropertyGroupSlotName(seed) === 'states'
  ) {
    for (const stateNode of getChildSlot(seed, DEFAULT_CHILD_SLOT)) {
      if (!ANIM_NODE_STATE_TYPE_SET.has(stateNode.type)) continue
      expandTransitionCascadeForStateDelete(
        renderData,
        stateNode,
        subtree,
        affectedSet,
        handleIdSet,
        handleIds
      )
    }
  }

  const affectedIds = subtree.map((n) => n.id)

  for (const node of subtree) {
    const hid = resolveBoxHandleId(node, renderData.handlesRegistry)
    if (!hid || handleIdSet.has(hid)) continue
    handleIdSet.add(hid)
    handleIds.push(hid)
  }

  const actions: DeleteNodeAction[] = []

  for (const conn of collectDisconnectWires(renderData, affectedSet)) {
    actions.push({ kind: 'disconnect-wire', connection: conn })
  }

  if (handleIds.length > 0) {
    actions.push({ kind: 'delete-animgraph-handles', handleIds: [...handleIds] })
  }

  // Leaf-first: reverse depth-first walk order.
  for (let i = subtree.length - 1; i >= 0; i--) {
    const node = subtree[i]!
    const placement = captureAddedNodePlacement(
      renderData,
      node,
      node.parent ?? null
    )
    actions.push({ kind: 'remove-diagram-node', placement })
  }

  const parentRefreshIds: string[] = []
  const parent = seed.parent
  if (parent && !affectedSet.has(parent.id)) {
    parentRefreshIds.push(parent.id)
    if (isPropertyGroupNode(parent)) {
      actions.push({ kind: 'fit-parent-group', parentId: parent.id })
    }
  }

  const sideEffects = resolveDeleteSideEffects({
    renderData,
    seed,
    affectedIds: affectedSet,
    handleIds: handleIdSet,
  })
  actions.push(...sideEffects.actions)
  for (const id of sideEffects.refreshIds) {
    if (!parentRefreshIds.includes(id) && !affectedSet.has(id)) {
      parentRefreshIds.push(id)
    }
  }

  return {
    ok: true,
    plan: {
      seedId,
      affectedIds,
      handleIds,
      actions,
      parentRefreshIds,
    },
  }
}
