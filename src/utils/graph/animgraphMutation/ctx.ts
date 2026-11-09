import type { AnimgraphData, AnimgraphNode } from '../animgraphTypes'

/** Animgraph-only mutation context — no diagram / RenderData. */
export type AnimgraphMutationCtx = {
  handlesRegistry: Map<string, AnimgraphNode>
  animgraph: AnimgraphData
}
