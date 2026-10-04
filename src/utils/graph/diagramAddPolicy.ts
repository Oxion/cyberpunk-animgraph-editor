/**
 * Diagram add place — diagramTarget + parentSlot from selection and active view.
 *
 * Pipeline:
 *   1. resolveDiagramAddPlace(selection, activeView, allNodes)
 *   2. resolveAddProfile(ctx, place) — deny | AddProfile
 *   3. profile.listUiTypes ∪ ambient → occupancy inside profile.canAdd
 */

import type { RenderNode } from './diagramTypes'
import { isDiagramOverviewLeaf } from './DiagramConversion'
import {
  DEFAULT_CHILD_SLOT,
  OVERVIEW_CHILD_SLOT,
} from './nodeChildSlots'

export type DiagramAddDenialReason = 'portal'

/** Place for parenting a new diagram node (from view + selection). */
export type DiagramAddPlaceContext = {
  /** Where the new RenderNode is parented. */
  diagramTarget: RenderNode | null
  /** childSlots key on diagramTarget. */
  parentSlot: string
}

/**
 * Minimal view shape for place resolution.
 * Own graph-scope lens of the target → children; overview leaf on a parent view → overview.
 */
export type DiagramAddActiveView = {
  kind?: string
  scopeRootId?: string
  payload?: { scopeRootId?: string; [key: string]: unknown }
} | null

function activeViewScopeRootId(activeView?: DiagramAddActiveView): string | undefined {
  if (!activeView) return undefined
  if (typeof activeView.scopeRootId === 'string') return activeView.scopeRootId
  return activeView.payload?.scopeRootId
}

export function isPropertyGroupNode(node: RenderNode): boolean {
  return node.type === 'PropertyGroup'
}

/**
 * Slot / children-field name for a PropertyGroup.
 * Canonical source: `metadata.propertyName` (parser); legacy fallbacks kept.
 */
export function getPropertyGroupSlotName(pg: RenderNode): string | undefined {
  const fromMeta = pg.metadata?.propertyName
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta

  const fromGroupName = (pg as { groupName?: unknown }).groupName
  if (typeof fromGroupName === 'string' && fromGroupName) return fromGroupName

  const fromData = pg.data?.childrenPropertyName
  if (typeof fromData === 'string' && fromData) return fromData

  return undefined
}

/**
 * Resolve diagram parentSlot from the active view + target node.
 *
 * - graph-scope whose scopeRoot is the target → body (`children`)
 * - overview-leaf type on any other view → in-card (`overview`)
 * - otherwise → `children`
 */
export function resolveDiagramAddParentSlot(
  target: RenderNode | null | undefined,
  activeView?: DiagramAddActiveView
): string {
  if (!target) return DEFAULT_CHILD_SLOT

  if (activeView?.kind === 'graph-scope' && activeViewScopeRootId(activeView) === target.id) {
    return DEFAULT_CHILD_SLOT
  }

  if (isDiagramOverviewLeaf(target)) {
    return OVERVIEW_CHILD_SLOT
  }

  return DEFAULT_CHILD_SLOT
}

/**
 * Resolve add place: explicit selection, else active view scope root.
 */
export function resolveDiagramAddPlace(
  selection: RenderNode | null | undefined,
  activeView: DiagramAddActiveView,
  allNodes?: Map<string, RenderNode>
): DiagramAddPlaceContext {
  let diagramTarget: RenderNode | null = selection ?? null

  const scopeRootId = activeViewScopeRootId(activeView)
  if (!diagramTarget && activeView?.kind === 'graph-scope' && scopeRootId) {
    diagramTarget = allNodes?.get(scopeRootId) ?? null
  }

  return {
    diagramTarget,
    parentSlot: resolveDiagramAddParentSlot(diagramTarget, activeView),
  }
}
