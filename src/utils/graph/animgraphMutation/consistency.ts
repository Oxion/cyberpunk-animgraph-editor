import { NodeDefinitionRegistry } from '../../NodeDefinition'
import type { AnimgraphMutationCtx } from './ctx'
import { countInboundHandleRefs } from './refWalk'

/**
 * After refs to `handleId` were removed.
 * @returns true when unattached: zero outbound pin uses, not contained, not root
 *   (countInboundHandleRefs covers pin + contain + rootNode).
 * Floating mark is a diagram concern — callers set it from this result.
 */
export function afterHandleRefRemoved(
  ctx: AnimgraphMutationCtx,
  handleId: string | null | undefined
): boolean {
  if (!handleId) return false
  return countInboundHandleRefs(ctx, handleId) === 0
}

export function isInitableHandle(
  ctx: AnimgraphMutationCtx,
  handleId: string
): boolean {
  const handle = ctx.handlesRegistry.get(handleId)
  const nodeType = String(handle?.Data?.$type ?? '')
  return Boolean(nodeType && NodeDefinitionRegistry.isNodesToInitType(nodeType))
}
