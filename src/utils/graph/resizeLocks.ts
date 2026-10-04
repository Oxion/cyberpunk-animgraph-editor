/**
 * Declarative resize constraints for diagram nodes.
 * Used by the resize tool (S) and available for tool UI (side locks, cursor, badges).
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import {
  isDiagramOverviewLeaf,
} from './DiagramConversion'
import { isDiagramFrameNode } from './diagramFrameNodes'
import { layoutNodeBody, nodeUsesRowComposition } from './NodeRowModel'
import { getChildSlot } from './nodeChildSlots'

export type ResizeAxis = 'width' | 'height'

/** Per-node resize policy resolved from node kind / structure. */
export type NodeResizeLocks = {
  /** Width may change freely (subject to minWidth). */
  lockWidth: boolean
  /** Height stays at content / start footprint. */
  lockHeight: boolean
  /** Soft minimums for the resize tool (content-aware when row-composed). */
  minWidth?: number
  minHeight?: number
  /** Stable id for UI / debugging. */
  reason:
    | 'overview'
    | 'end-leaf'
    | 'container'
    | 'default'
}

export type ResizeLocksQuery = {
  handlesRegistry?: Map<string, AnimgraphNode>
  allNodes?: Map<string, RenderNode>
}

function hasVisibleChildren(node: RenderNode): boolean {
  return getChildSlot(node).some((c) => c.visible !== false)
}

function isEndLeafNode(node: RenderNode): boolean {
  if (isDiagramFrameNode(node) || node.isGroup || node.type === 'PropertyGroup') return false
  return !hasVisibleChildren(node)
}

/**
 * Resolve resize locks for one node.
 * Overview cards (SM / State / CE·transition) and true end leaves → height locked.
 */
export function getNodeResizeLocks(
  node: RenderNode,
  diagramData: RenderData,
): NodeResizeLocks {
  if (isDiagramOverviewLeaf(node)) {
    return withContentMins(
      node,
      {
        lockWidth: false,
        lockHeight: true,
        reason: 'overview',
      },
      diagramData
    )
  }

  if (isEndLeafNode(node)) {
    return withContentMins(
      node,
      {
        lockWidth: false,
        lockHeight: true,
        reason: 'end-leaf',
      },
      diagramData
    )
  }

  if (isDiagramFrameNode(node) || node.isGroup || node.type === 'PropertyGroup' || hasVisibleChildren(node)) {
    return withContentMins(
      node,
      {
        lockWidth: false,
        lockHeight: false,
        reason: 'container',
      },
      diagramData
    )
  }

  return withContentMins(
    node,
    {
      lockWidth: false,
      lockHeight: false,
      reason: 'default',
    },
    diagramData
  )
}

function withContentMins(
  node: RenderNode,
  base: NodeResizeLocks,
  diagramData: RenderData,
): NodeResizeLocks {
  if (!nodeUsesRowComposition(node)) return base
  const layout = layoutNodeBody(node, diagramData)
  return {
    ...base,
    minWidth: layout.minWidth,
    minHeight: layout.height,
  }
}

/**
 * Aggregate locks for a multi-selection (UI: disable height handle if any selection locks height).
 */
export function getSelectionResizeLocks(
  diagramData: RenderData,
  nodes: readonly RenderNode[],
): {
  lockWidth: boolean
  lockHeight: boolean
  /** True when every selected node locks height. */
  allLockHeight: boolean
  perNode: NodeResizeLocks[]
} {
  const perNode = nodes.map((n) => getNodeResizeLocks(n, diagramData))
  const lockHeight = perNode.some((l) => l.lockHeight)
  const lockWidth = perNode.some((l) => l.lockWidth)
  const allLockHeight = perNode.length > 0 && perNode.every((l) => l.lockHeight)
  return { lockWidth, lockHeight, allLockHeight, perNode }
}

/** Apply axis locks to a proposed layout relative to the gesture start. */
export function applyResizeLocksToLayout(
  locks: NodeResizeLocks,
  start: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number },
  floor: { minWidth: number; minHeight: number }
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = next
  const minW = Math.max(floor.minWidth, locks.minWidth ?? 0)
  const minH = Math.max(floor.minHeight, locks.minHeight ?? 0)

  if (locks.lockWidth) {
    width = start.width
    x = start.x
  } else {
    width = Math.max(width, minW)
  }

  if (locks.lockHeight) {
    height =
      locks.minHeight != null ? Math.max(floor.minHeight, locks.minHeight) : start.height
    y = start.y
  } else {
    height = Math.max(height, minH)
  }

  return { x, y, width, height }
}
