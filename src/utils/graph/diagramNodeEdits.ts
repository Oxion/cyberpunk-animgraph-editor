/**
 * Diagram-model size/content writers (business layer).
 * Mutate RenderNode data here; callers notify the active renderer afterward.
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { applyNodeFootprint } from './nodeFootprint'

export type DiagramNodeSize = { width: number; height: number }

/** Write explicit size into node.size / bounds (position unchanged). */
export function applyDiagramNodeSize(node: RenderNode, size: DiagramNodeSize): void {
  node.size = { width: size.width, height: size.height }
  if (node.position) {
    node.bounds = {
      x: node.position.x,
      y: node.position.y,
      width: size.width,
      height: size.height,
    }
  } else if (node.bounds) {
    node.bounds.width = size.width
    node.bounds.height = size.height
  }
}

/**
 * Re-apply content footprints for the given ids (strategy decides auto-write).
 * Returns unique ids for notify.
 */
export function applyFootprintsForIds(
  diagramData: RenderData,
  nodeIds: readonly string[]
): string[] {
  const unique = [...new Set(nodeIds)]
  const { allNodes } = diagramData
  for (const id of unique) {
    const node = allNodes.get(id)
    if (node) {
      applyNodeFootprint(node, diagramData)
    }
  }
  return unique
}

/** Collect diagram nodes bound to a handle and refresh their footprints. */
export function applyFootprintsForHandleBoundNodes(
  renderData: RenderData,
  handleId: string,
  resolveLinkedHandleId: (
    node: RenderNode,
    handlesRegistry: Map<string, AnimgraphNode>
  ) => string | null
): string[] {
  const { allNodes, handlesRegistry } = renderData
  const ids: string[] = []
  for (const [id, node] of allNodes) {
    const hid = resolveLinkedHandleId(node, handlesRegistry)
    if (hid === handleId || id === handleId) {
      ids.push(id)
    }
  }
  return applyFootprintsForIds(renderData, ids)
}

/**
 * Set description on any diagram node, then refresh footprint via node-kind strategy.
 * Description may affect height for row-composed kinds (and future strategies).
 */
export function applyDiagramNodeDescription(
  node: RenderNode,
  description: string,
  diagramData: RenderData
): void {
  node.description = description
  applyNodeFootprint(
    node,
    diagramData,
  )
}

/** Set note metadata.text and refresh note footprint (height for footer). */
export function applyDiagramNoteText(diagramData: RenderData, node: RenderNode, text: string): void {
  node.metadata = { ...node.metadata, text }
  applyNodeFootprint(node, diagramData)
}
