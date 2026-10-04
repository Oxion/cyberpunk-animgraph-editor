/**
 * User-facing copy for Add Node (domain returns reason codes + structured context).
 */

import {
  getPropertyGroupSlotName,
  isPropertyGroupNode,
  type DiagramAddPlaceContext,
} from '../../utils/graph/diagramAddPolicy'
import { isDiagramOverviewLeaf, isDiagramPortalNode } from '../../utils/graph/DiagramConversion'
import { OVERVIEW_CHILD_SLOT } from '../../utils/graph/nodeChildSlots'
import type {
  AddNodeDenialReason,
  CanAddNodeResult,
} from '../../utils/graph/nodeAddRules'

export type AddNodeCopyDetail = {
  diagramNodeType?: string
  animgraphNodeType?: string
  parentType?: string
  slotName?: string
}

function formatOneReason(reason: AddNodeDenialReason, d: AddNodeCopyDetail): string {
  const slot =
    d.parentType && d.slotName ? `${d.parentType}.${d.slotName}` : d.slotName ?? d.parentType

  switch (reason) {
    case 'portal':
      return 'Cannot add into a diagram portal (use connections).'
    case 'root-forbidden':
      return 'animAnimNode_Root cannot be added — the graph already has a single root'
    case 'type-not-allowed':
      return d.diagramNodeType && slot
        ? `${d.diagramNodeType} is not allowed in ${slot}`
        : 'Type is not allowed in this slot'
    case 'unknown-animgraph-node-type':
      return d.animgraphNodeType
        ? `Unknown node type: ${d.animgraphNodeType}`
        : 'Unknown node type'
    case 'scalar-occupied':
      return slot
        ? `${slot} already has a child (scalar slot)`
        : 'Scalar slot already has a child'
    case 'unique-conflict':
      return d.animgraphNodeType && slot
        ? `${d.animgraphNodeType} already exists in ${slot} (unique)`
        : 'Unique type already exists in this slot'
    case 'no-parent-slot':
      return 'No parent child slot for this selection'
    case 'slot-not-found':
      return d.slotName ? `Slot «${d.slotName}» not found on parent` : 'Slot not found on parent'
    case 'parent-has-no-slots':
      return 'Parent has no child slots'
    default:
      return reason
  }
}

export function formatAddNodeDenial(
  reasons: readonly AddNodeDenialReason[],
  detail: AddNodeCopyDetail = {}
): string {
  if (reasons.length === 0) return 'Cannot add node'
  return reasons.map((r) => formatOneReason(r, detail)).join('\n')
}

export function formatAddNodeDenialFromGate(gate: CanAddNodeResult): string {
  if (gate.ok) return 'Cannot add node'
  return formatAddNodeDenial(gate.reasons, {
    diagramNodeType: gate.diagramNodeType,
  })
}

/** Short label for current add place (tools panel target line). */
export function formatDiagramAddPlace(place: DiagramAddPlaceContext): string {
  const sel = place.diagramTarget
  if (!sel) return 'No add target'

  if (place.parentSlot === OVERVIEW_CHILD_SLOT || isDiagramOverviewLeaf(sel)) {
    return `Overview «${sel.id}» (${sel.type ?? ''}) · ${place.parentSlot}`
  }
  if (isDiagramPortalNode(sel)) {
    return `Portal «${sel.id}»`
  }
  if (isPropertyGroupNode(sel)) {
    return `PropertyGroup «${getPropertyGroupSlotName(sel) ?? '?'}» (${sel.id})`
  }
  const parent = sel.parent
  if (parent && isPropertyGroupNode(parent)) {
    return `Child of PropertyGroup «${getPropertyGroupSlotName(parent) ?? '?'}» → «${sel.id}»`
  }
  return `Node «${sel.id}» (${sel.type ?? ''}) · ${place.parentSlot}`
}