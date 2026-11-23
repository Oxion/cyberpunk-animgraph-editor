/**
 * Diagram → animgraph mutation bridge.
 * Lives outside animgraphMutation (that package stays RenderData-free).
 */

import type { AnimgraphMutationCtx } from './animgraphMutation'
import { resolveContainOwnerForMember } from './animgraphContainOwner'
import type { RenderData } from './diagramTypes'

export function mutationCtxFromRenderData(
  renderData: RenderData
): AnimgraphMutationCtx {
  return {
    handlesRegistry: renderData.handlesRegistry,
    animgraph: renderData.originalAnimgraph,
    resolveContainOwner: (memberId) => {
      const o = resolveContainOwnerForMember(renderData, memberId)
      return o ? { ownerId: o.ownerHandleId, slot: o.slotName } : null
    },
  }
}
