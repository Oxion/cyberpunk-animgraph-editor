import type { RenderNode } from '../graph/diagramTypes'
import { isDiagramOverviewLeaf } from '../graph/DiagramConversion'

/** Collapsed overview containers that must be opened as body stack layers to reach a node. */
export function isCollapsedScopeRoot(node: RenderNode): boolean {
  return isDiagramOverviewLeaf(node)
}

/**
 * Scope roots from diagram root → inward that hide `node` on parent views.
 * Does not include `node` itself (navigate pans to it on the deepest parent view).
 */
export function collectCollapsedScopePath(node: RenderNode): RenderNode[] {
  const scopes: RenderNode[] = []
  let current: RenderNode | null = node.parent ?? null
  while (current) {
    if (isCollapsedScopeRoot(current)) {
      scopes.push(current)
    }
    current = current.parent ?? null
  }
  scopes.reverse()
  return scopes
}
