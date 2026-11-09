/**
 * Diagram → animgraph mutation bridge.
 * Lives outside animgraphMutation (that package stays RenderData-free).
 */

import type { AnimgraphMutationCtx } from './animgraphMutation'
import type { RenderData } from './diagramTypes'

export function mutationCtxFromRenderData(
  renderData: RenderData
): AnimgraphMutationCtx {
  return {
    handlesRegistry: renderData.handlesRegistry,
    animgraph: renderData.originalAnimgraph,
  }
}
