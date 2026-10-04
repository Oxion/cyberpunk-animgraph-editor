import type { RenderNode } from '../diagramTypes'
import { isFloatingHandle } from '../floatingHandles'
import type { RenderData } from '../diagramTypes'

function isUnder(node: RenderNode, ancestor: RenderNode): boolean {
  let current: RenderNode | undefined = node.parent
  while (current) {
    if (current.id === ancestor.id) return true
    current = current.parent
  }
  return false
}

/**
 * Same local diagram branch (not LCA raise).
 * Floating source always allowed. Cross-overview portal path is decided separately.
 */
export function areSameDiagramBranch(
  from: RenderNode,
  to: RenderNode,
  renderData?: RenderData
): boolean {
  if (renderData) {
    const fromHandleId = String(from.data?.originalNodeId ?? from.id)
    if (isFloatingHandle(renderData, fromHandleId) || !from.parent) return true
  } else if (!from.parent) {
    return true
  }

  if (!from.parent || !to.parent) return true
  if (from.parent.id === to.parent.id) return true
  if (isUnder(to, from.parent)) return true
  if (isUnder(from, to.parent)) return true
  return false
}
