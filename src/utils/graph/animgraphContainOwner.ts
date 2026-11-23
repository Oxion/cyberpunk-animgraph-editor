/**
 * Diagram reverse-index for contain membership: PropertyGroup ancestry → owner/slot.
 * Animgraph writes: promote/demoteContainMembership via ctx.resolveContainOwner.
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import {
  countInboundHandleRefs,
  demoteContainMembership,
  hasMembershipSlot,
} from './animgraphMutation'
import { mutationCtxFromRenderData } from './diagramMutationCtx'
import {
  getPropertyGroupSlotName,
  isPropertyGroupNode,
} from './diagramAddPolicy'
import { ensureFloatingHandleIds } from './floatingHandles'

export { hasMembershipSlot }

export type DiagramContainOwnerRef = {
  ownerHandle: AnimgraphNode
  ownerHandleId: string
  /** Diagram box for the owner (State / Root / …) — for overview refresh. */
  ownerDiagramId: string
  slotName: string
  parentType: string
}

/** @deprecated Prefer DiagramContainOwnerRef */
export type ContainOwnerRef = DiagramContainOwnerRef

export function findDiagramBoxForHandle(
  renderData: RenderData,
  handleId: string
): RenderNode | null {
  const direct = renderData.allNodes.get(handleId)
  if (direct && !isPropertyGroupNode(direct)) return direct
  for (const node of renderData.allNodes.values()) {
    if (isPropertyGroupNode(node)) continue
    if (String(node.data?.originalNodeId ?? '') === handleId) return node
  }
  return null
}

/**
 * Walk from member diagram box up to a PropertyGroup whose (ownerType, slot)
 * is a membership slot (e.g. State.nodes).
 */
export function resolveContainOwnerForMember(
  renderData: RenderData,
  memberHandleId: string
): DiagramContainOwnerRef | null {
  const box = findDiagramBoxForHandle(renderData, memberHandleId)
  if (!box) return null

  let current: RenderNode | null = box.parent ?? null
  while (current) {
    if (isPropertyGroupNode(current)) {
      const slotName = getPropertyGroupSlotName(current)
      const ownerBox = current.parent
      if (slotName && ownerBox) {
        const ownerHandleId = String(ownerBox.data?.originalNodeId ?? ownerBox.id)
        const ownerHandle = renderData.handlesRegistry.get(ownerHandleId)
        const parentType = String(ownerHandle?.Data?.$type ?? ownerBox.type ?? '')
        if (
          ownerHandle &&
          parentType &&
          hasMembershipSlot(parentType, slotName)
        ) {
          return {
            ownerHandle,
            ownerHandleId,
            ownerDiagramId: ownerBox.id,
            slotName,
            parentType,
          }
        }
      }
    }
    current = current.parent ?? null
  }
  return null
}

/**
 * Diagram bridge → demoteContainMembership; mark orphaned as floating.
 * Prefer clearHandleRef path (owns demote); this remains for explicit callers.
 */
export function runContainMemberDemote(
  renderData: RenderData,
  memberHandleId: string
): { ownerDiagramId: string | null; removed: string[]; orphaned: string[] } {
  const before = resolveContainOwnerForMember(renderData, memberHandleId)
  const ctx = mutationCtxFromRenderData(renderData)
  const ownerHandleId = demoteContainMembership(ctx, memberHandleId)
  if (!ownerHandleId || !before) {
    return { ownerDiagramId: null, removed: [], orphaned: [] }
  }
  const orphaned: string[] = []
  if (
    renderData.handlesRegistry.has(memberHandleId) &&
    countInboundHandleRefs(ctx, memberHandleId) === 0
  ) {
    ensureFloatingHandleIds(renderData).add(memberHandleId)
    orphaned.push(memberHandleId)
  }
  return {
    ownerDiagramId: before.ownerDiagramId,
    removed: [memberHandleId],
    orphaned,
  }
}
