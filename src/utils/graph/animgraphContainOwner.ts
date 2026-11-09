/**
 * Diagram bridge: find contain owner for a member via PropertyGroup ancestry,
 * then call animgraph add/removeHandleRefs for membership fields (e.g. State.nodes).
 */

import {
  ANIM_NODE_TYPE_ROOT,
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
} from './animNodeTypes'
import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { addHandleRefs, removeHandleRefs } from './animgraphMutation'
import { mutationCtxFromRenderData } from './diagramMutationCtx'
import {
  getPropertyGroupSlotName,
  isPropertyGroupNode,
} from './diagramAddPolicy'
import { ensureFloatingHandleIds, promoteFloatingHandle } from './floatingHandles'

/** Diagram membership slots that sync via add/removeHandleRefs (not projection roles). */
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

/** @deprecated Use hasMembershipSlot */
export function hasContainMemberLifecycle(
  parentType: string,
  slotName: string
): boolean {
  return hasMembershipSlot(parentType, slotName)
}

export type ContainOwnerRef = {
  ownerHandle: AnimgraphNode
  ownerHandleId: string
  /** Diagram box for the owner (State / Root / …) — for overview refresh. */
  ownerDiagramId: string
  slotName: string
  parentType: string
}

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
): ContainOwnerRef | null {
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
 * Diagram → resolve owner → addHandleRefs.
 * @returns owner diagram id for overview refresh.
 */
export function runContainMemberPromote(
  renderData: RenderData,
  memberHandleId: string
): string | null {
  const owner = resolveContainOwnerForMember(renderData, memberHandleId)
  if (!owner) return null
  addHandleRefs(
    mutationCtxFromRenderData(renderData),
    owner.ownerHandleId,
    owner.slotName,
    [memberHandleId]
  )
  promoteFloatingHandle(renderData, memberHandleId)
  return owner.ownerDiagramId
}

/**
 * Diagram → resolve owner → removeHandleRefs.
 * @returns owner diagram id + orphaned handle ids (unattached after remove).
 */
export function runContainMemberDemote(
  renderData: RenderData,
  memberHandleId: string
): { ownerDiagramId: string | null; removed: string[]; orphaned: string[] } {
  const owner = resolveContainOwnerForMember(renderData, memberHandleId)
  if (!owner) return { ownerDiagramId: null, removed: [], orphaned: [] }
  const { removed, orphaned } = removeHandleRefs(
    mutationCtxFromRenderData(renderData),
    owner.ownerHandleId,
    owner.slotName,
    [memberHandleId]
  )
  for (const id of orphaned) {
    ensureFloatingHandleIds(renderData).add(id)
  }
  return { ownerDiagramId: owner.ownerDiagramId, removed, orphaned }
}
